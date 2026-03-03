-- Fix consume_usage_counter() ambiguity on return-column names.
-- The function returns table columns named `remaining` and `total`, which are
-- PL/pgSQL output variables and can conflict with table column references.

create or replace function public.consume_usage_counter(
  p_tenant_id uuid,
  p_product_id uuid,
  p_capability_key text,
  p_period_start date,
  p_period_end date,
  p_amount integer,
  p_total integer
)
returns table (allowed boolean, remaining integer, total integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id uuid;
  row_remaining integer;
  row_total integer;
begin
  if p_amount is null or p_amount <= 0 then
    return query select false, 0, 0;
    return;
  end if;

  select uc.id, uc.remaining, uc.total
    into row_id, row_remaining, row_total
  from public.usage_counters as uc
  where uc.tenant_id = p_tenant_id
    and uc.product_id = p_product_id
    and uc.capability_key = p_capability_key
    and uc.period_start = p_period_start
  for update;

  if not found then
    insert into public.usage_counters (
      tenant_id, product_id, capability_key, period_start, period_end, total, remaining
    ) values (
      p_tenant_id, p_product_id, p_capability_key, p_period_start, p_period_end, p_total, p_total
    )
    returning id, remaining, total into row_id, row_remaining, row_total;
  end if;

  if row_remaining < p_amount then
    return query select false, row_remaining, row_total;
    return;
  end if;

  update public.usage_counters as uc
    set remaining = row_remaining - p_amount,
        updated_at = now()
  where uc.id = row_id
  returning uc.remaining, uc.total into row_remaining, row_total;

  return query select true, row_remaining, row_total;
end;
$$;
