\set ON_ERROR_STOP on
begin;

do $$
declare
  v_payment_id uuid := '77777777-7777-4777-8777-777777777777';
  v_failed boolean;
begin
  insert into public.payments (
    id, provider, provider_transaction_id, amount, currency, status,
    checkout_idempotency_key, fiscalization_status, metadata, provider_payload
  ) values (
    v_payment_id, 'click', v_payment_id::text, 150000, 'UZS', 'pending',
    'db-guardrail:77777777', 'not_configured', '{}'::jsonb, '{}'::jsonb
  );

  -- The one allowed transaction-ID mutation represents successful Prepare.
  update public.payments
  set provider_transaction_id = '778899'
  where id = v_payment_id;

  v_failed := false;
  begin
    update public.payments set amount = 1 where id = v_payment_id;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then raise exception 'CLICK amount mutation was not rejected'; end if;

  update public.payments set status = 'paid' where id = v_payment_id;
  update public.payments
  set granted_at = now(), grant_completed_at = now()
  where id = v_payment_id;

  if not exists (
    select 1 from public.payments
    where id = v_payment_id
      and granted_at is not null
      and grant_completed_at is not null
  ) then
    raise exception 'grant completion evidence was not persisted';
  end if;

  v_failed := false;
  begin
    update public.payments set status = 'canceled' where id = v_payment_id;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then raise exception 'paid CLICK payment became canceled'; end if;

  v_failed := false;
  begin
    update public.payments set provider_transaction_id = '778900' where id = v_payment_id;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then raise exception 'prepared CLICK transaction ID changed'; end if;

  v_failed := false;
  begin
    insert into public.payments (provider, provider_transaction_id, amount, currency, status)
    values ('click', gen_random_uuid()::text, 0, 'UZS', 'pending');
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'zero-value CLICK payment was accepted'; end if;

  if has_function_privilege('authenticated', 'public.apply_academy_payment(uuid,uuid)', 'EXECUTE') then
    raise exception 'authenticated role can execute apply_academy_payment';
  end if;
  if has_function_privilege('anon', 'public.apply_academy_payment(uuid,uuid)', 'EXECUTE') then
    raise exception 'anon role can execute apply_academy_payment';
  end if;
  if not has_function_privilege('service_role', 'public.apply_academy_payment(uuid,uuid)', 'EXECUTE') then
    raise exception 'service_role cannot execute apply_academy_payment';
  end if;
  if has_table_privilege('authenticated', 'public.click_callback_events', 'SELECT') then
    raise exception 'authenticated role can read callback audit events';
  end if;
end;
$$;

rollback;
select 'CLICK database guardrails passed' as result;
