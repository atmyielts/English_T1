-- ============================================================================
-- Guardrails: payment term snapshots + catalog soft-delete enforcement
-- ============================================================================

-- 1) Persist plan snapshots on payments so grants stay deterministic even if plans change later.
alter table public.payments
  add column if not exists plan_snapshot jsonb default '{}'::jsonb,
  add column if not exists entitlement_terms jsonb default '{}'::jsonb;

update public.payments
set
  plan_snapshot = coalesce(plan_snapshot, '{}'::jsonb),
  entitlement_terms = coalesce(entitlement_terms, '{}'::jsonb)
where plan_snapshot is null
   or entitlement_terms is null;

alter table public.payments
  alter column plan_snapshot set default '{}'::jsonb,
  alter column entitlement_terms set default '{}'::jsonb,
  alter column plan_snapshot set not null,
  alter column entitlement_terms set not null;

alter table public.payments
  drop constraint if exists payments_plan_snapshot_is_object;
alter table public.payments
  add constraint payments_plan_snapshot_is_object
  check (jsonb_typeof(plan_snapshot) = 'object');

alter table public.payments
  drop constraint if exists payments_entitlement_terms_is_object;
alter table public.payments
  add constraint payments_entitlement_terms_is_object
  check (jsonb_typeof(entitlement_terms) = 'object');

create or replace function public.capture_payment_plan_terms()
returns trigger
language plpgsql
as $$
declare
  v_plan record;
begin
  if new.plan_id is null then
    return new;
  end if;

  if coalesce(new.plan_snapshot, '{}'::jsonb) <> '{}'::jsonb
     and coalesce(new.entitlement_terms, '{}'::jsonb) <> '{}'::jsonb then
    return new;
  end if;

  select
    p.id,
    p.product_id,
    p.name,
    p.amount,
    p.currency,
    p.duration_days,
    coalesce(p.metadata, '{}'::jsonb) as metadata
  into v_plan
  from public.plans p
  where p.id = new.plan_id;

  if not found then
    return new;
  end if;

  if coalesce(new.plan_snapshot, '{}'::jsonb) = '{}'::jsonb then
    new.plan_snapshot := jsonb_build_object(
      'id', v_plan.id,
      'product_id', v_plan.product_id,
      'name', v_plan.name,
      'amount', v_plan.amount,
      'currency', v_plan.currency,
      'duration_days', case when v_plan.duration_days is null or v_plan.duration_days <= 0 then null else v_plan.duration_days end,
      'metadata', coalesce(v_plan.metadata, '{}'::jsonb),
      'captured_at', now()
    );
  end if;

  if coalesce(new.entitlement_terms, '{}'::jsonb) = '{}'::jsonb then
    new.entitlement_terms := jsonb_build_object(
      'source_plan_id', v_plan.id,
      'duration_days', case when v_plan.duration_days is null or v_plan.duration_days <= 0 then null else v_plan.duration_days end,
      'included_product_ids',
        (
          select coalesce(jsonb_agg(items.pid), '[]'::jsonb)
          from (
            select distinct entry.value as pid
            from jsonb_array_elements_text(coalesce(v_plan.metadata -> 'included_product_ids', '[]'::jsonb)) as entry(value)
            where entry.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          ) as items
        ),
      'limits',
        (
          select coalesce(jsonb_object_agg(items.key, to_jsonb(items.val)), '{}'::jsonb)
          from (
            select
              entry.key,
              floor((trim(both '"' from entry.value::text))::numeric)::int as val
            from jsonb_each(coalesce(v_plan.metadata -> 'limits', '{}'::jsonb)) as entry(key, value)
            where trim(both '"' from entry.value::text) ~ '^[0-9]+([.][0-9]+)?$'
              and floor((trim(both '"' from entry.value::text))::numeric)::int > 0
          ) as items
        ),
      'captured_at', now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists payments_capture_plan_terms on public.payments;
create trigger payments_capture_plan_terms
before insert or update of plan_id, plan_snapshot, entitlement_terms
on public.payments
for each row
execute procedure public.capture_payment_plan_terms();

-- Backfill existing rows with empty/missing snapshots; trigger hydrates from plans.
update public.payments p
set
  plan_snapshot = coalesce(p.plan_snapshot, '{}'::jsonb),
  entitlement_terms = coalesce(p.entitlement_terms, '{}'::jsonb)
where p.plan_id is not null
  and (
    coalesce(p.plan_snapshot, '{}'::jsonb) = '{}'::jsonb
    or coalesce(p.entitlement_terms, '{}'::jsonb) = '{}'::jsonb
  );

create index if not exists payments_paid_ungranted_created_idx
on public.payments (created_at)
where granted_at is null
  and lower(status) in ('paid', 'success', 'completed');

-- 2) Force archive workflow: hard delete of products/plans is blocked by default.
create or replace function public.prevent_catalog_hard_delete()
returns trigger
language plpgsql
as $$
declare
  v_allow_delete text;
begin
  v_allow_delete := current_setting('app.allow_hard_delete', true);
  if coalesce(v_allow_delete, '') = 'on' then
    return old;
  end if;

  raise exception using
    errcode = 'P0001',
    message = format('Hard delete blocked for %s (%s)', tg_table_name, coalesce(old.id::text, 'unknown')),
    hint = case
      when tg_table_name = 'products' then 'Use status=''archived'' instead of DELETE.'
      when tg_table_name = 'plans' then 'Use is_active=false instead of DELETE.'
      else 'Use archive/deactivate workflow.'
    end;
end;
$$;

drop trigger if exists products_prevent_hard_delete on public.products;
create trigger products_prevent_hard_delete
before delete on public.products
for each row
execute procedure public.prevent_catalog_hard_delete();

drop trigger if exists plans_prevent_hard_delete on public.plans;
create trigger plans_prevent_hard_delete
before delete on public.plans
for each row
execute procedure public.prevent_catalog_hard_delete();

-- 3) Keep plan activation coherent with product status.
create or replace function public.enforce_plan_active_product()
returns trigger
language plpgsql
as $$
declare
  v_product_status text;
begin
  if coalesce(new.is_active, false) = false then
    return new;
  end if;

  select p.status into v_product_status
  from public.products p
  where p.id = new.product_id;

  if coalesce(v_product_status, '') <> 'active' then
    raise exception using
      errcode = 'P0001',
      message = format('Plan %s cannot be active while product %s has status %s', coalesce(new.id::text, 'new'), new.product_id, coalesce(v_product_status, 'unknown')),
      hint = 'Activate the product first, then activate the plan.';
  end if;

  return new;
end;
$$;

drop trigger if exists plans_enforce_active_product on public.plans;
create trigger plans_enforce_active_product
before insert or update of product_id, is_active
on public.plans
for each row
execute procedure public.enforce_plan_active_product();

create or replace function public.sync_product_status_to_plans()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status <> 'active' then
    update public.plans
    set
      is_active = false,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_deactivated_reason', format('product_status_%s', new.status),
        'auto_deactivated_at', now()
      )
    where product_id = new.id
      and is_active = true;
  end if;

  return new;
end;
$$;

drop trigger if exists products_sync_plan_activity on public.products;
create trigger products_sync_plan_activity
after update of status on public.products
for each row
execute procedure public.sync_product_status_to_plans();
