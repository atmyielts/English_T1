-- Teacher Studio payment engine + idempotent grant application

alter table public.academy_entitlements
  add column if not exists payment_grant_key text;

alter table public.academy_entitlements
  add constraint academy_entitlements_payment_grant_unique unique (payment_id, payment_grant_key);

create index if not exists academy_entitlements_payment_idx on public.academy_entitlements(payment_id);

create or replace function public.apply_academy_payment(p_payment_id uuid, p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.academy_payments%rowtype;
  v_offer public.academy_offers%rowtype;
  v_contact public.academy_contacts%rowtype;
  v_grant record;
  v_now timestamptz := now();
  v_expires timestamptz;
  v_duration integer;
  v_count integer := 0;
  v_key text;
begin
  select * into v_payment
  from public.academy_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.status = 'paid' then
    return jsonb_build_object('ok', true, 'already_paid', true, 'payment_id', v_payment.id, 'created_entitlements', 0);
  end if;

  select * into v_offer
  from public.academy_offers
  where id = v_payment.offer_id
    and academy_id = v_payment.academy_id;

  if not found then
    raise exception 'Offer not found for payment';
  end if;

  select * into v_contact
  from public.academy_contacts
  where id = v_payment.contact_id
    and academy_id = v_payment.academy_id;

  if not found then
    raise exception 'Contact not found for payment';
  end if;

  for v_grant in
    select g.*
    from public.academy_offer_grants g
    where g.academy_id = v_payment.academy_id
      and g.offer_id = v_payment.offer_id
    order by g.created_at asc
  loop
    v_duration := coalesce(v_grant.duration_days, v_offer.duration_days);
    if v_duration is not null and v_duration > 0 then
      v_expires := v_now + make_interval(days => v_duration);
    else
      v_expires := null;
    end if;

    v_key := v_grant.id::text;

    insert into public.academy_entitlements (
      academy_id,
      contact_id,
      user_id,
      offer_id,
      payment_id,
      payment_grant_key,
      grant_type,
      resource_type,
      resource_id,
      capability_key,
      quantity,
      remaining,
      starts_at,
      expires_at,
      status,
      source,
      metadata,
      created_at,
      updated_at
    )
    values (
      v_payment.academy_id,
      v_payment.contact_id,
      v_contact.user_id,
      v_payment.offer_id,
      v_payment.id,
      v_key,
      v_grant.grant_type,
      nullif(v_grant.resource_type, ''),
      v_grant.resource_id,
      nullif(v_grant.capability_key, ''),
      v_grant.quantity,
      v_grant.quantity,
      v_now,
      v_expires,
      'active',
      'payment',
      coalesce(v_grant.metadata, '{}'::jsonb) || jsonb_build_object('offer_grant_id', v_grant.id, 'payment_id', v_payment.id),
      v_now,
      v_now
    )
    on conflict (payment_id, payment_grant_key) do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  update public.academy_payments
  set
    status = 'paid',
    updated_at = v_now,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('processed_at', v_now, 'processed_by', p_actor_id)
  where id = v_payment.id;

  return jsonb_build_object(
    'ok', true,
    'already_paid', false,
    'payment_id', v_payment.id,
    'created_entitlements', v_count
  );
end;
$$;

