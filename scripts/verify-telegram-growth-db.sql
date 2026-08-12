\set ON_ERROR_STOP on

do $$
declare
  v_preferences public.telegram_user_preferences%rowtype;
begin
  select * into v_preferences from public.telegram_user_preferences
  where user_id = '11111111-1111-4111-8111-111111111111';
  if v_preferences.telegram_enabled is distinct from false then
    raise exception 'legacy global Telegram opt-out was not preserved';
  end if;
  if v_preferences.study_habit_enabled is distinct from false then
    raise exception 'legacy digest opt-out was not preserved';
  end if;
end
$$;

update public.users set telegram_chat_id = null
where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);
update public.academy_contacts set telegram_id = null
where user_id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);
delete from public.sales_leads where idempotency_key = 'telegram-db-test:lead';
delete from public.telegram_acquisition_sessions where bot_name = 'schoodonlinebot' and telegram_user_id = '93001';
delete from public.support_messages where metadata ->> 'request_fingerprint' = 'telegram-db-test-support';

delete from public.telegram_update_receipts
where bot_name = 'schoodonlinebot' and telegram_update_id between 990001 and 990099;

do $$
declare
  v_token uuid;
  v_outcome text;
  v_attempts integer;
begin
  select claim_token into v_token
  from public.claim_telegram_update('schoodonlinebot', 990001, '90001', 'message', 120);
  if public.complete_telegram_update('schoodonlinebot', 990001, gen_random_uuid(), false, null) then
    raise exception 'wrong update claim token was accepted';
  end if;
  if not public.complete_telegram_update('schoodonlinebot', 990001, v_token, false, null) then
    raise exception 'valid update claim token was rejected';
  end if;
  select outcome, attempts into v_outcome, v_attempts
  from public.claim_telegram_update('schoodonlinebot', 990001, '90001', 'message', 120);
  if v_outcome <> 'completed' or v_attempts <> 1 then
    raise exception 'completed update replay was not suppressed';
  end if;

  select outcome, claim_token into v_outcome, v_token
  from public.claim_telegram_update('schoodonlinebot', 990002, '90002', 'message', 120);
  perform public.complete_telegram_update('schoodonlinebot', 990002, v_token, true, 'simulated crash');
  select outcome, attempts into v_outcome, v_attempts
  from public.claim_telegram_update('schoodonlinebot', 990002, '90002', 'message', 120);
  if v_outcome <> 'claimed' or v_attempts <> 2 then
    raise exception 'failed update was not reclaimable';
  end if;

  select outcome, claim_token into v_outcome, v_token
  from public.claim_telegram_update('schoodonlinebot', 990003, '90003', 'message', 120);
  update public.telegram_update_receipts set claimed_at = now() - interval '10 minutes'
  where bot_name = 'schoodonlinebot' and telegram_update_id = 990003;
  select outcome, attempts into v_outcome, v_attempts
  from public.claim_telegram_update('schoodonlinebot', 990003, '90003', 'message', 120);
  if v_outcome <> 'claimed' or v_attempts <> 2 then
    raise exception 'stale update claim was not recovered';
  end if;
end
$$;

delete from public.platform_notifications where dedupe_key like 'telegram-db-test:%';
insert into public.platform_notifications(user_id, chat_id, channel, type, body, status, scheduled_at, dedupe_key)
values ('11111111-1111-4111-8111-111111111111', '91001', 'telegram', 'test', 'one', 'queued', now(), 'telegram-db-test:1');

do $$
declare v_id uuid; v_reclaimed uuid;
begin
  select id into v_id from public.claim_telegram_notification_batch(1);
  update public.platform_notifications set claimed_at = now() - interval '10 minutes' where id = v_id;
  select id into v_reclaimed from public.claim_telegram_notification_batch(1);
  if v_id is null or v_reclaimed <> v_id then
    raise exception 'stale notification claim was not recovered';
  end if;
end
$$;

do $$
declare
  v_token text;
  v_confirmation boolean;
begin
  select token into v_token from public.issue_telegram_link_token('11111111-1111-4111-8111-111111111111', null, null);
  select confirmation_required into v_confirmation from public.consume_telegram_link_token(v_token, '92001');
  if v_confirmation is distinct from true then raise exception 'unbound token linked without confirmation'; end if;
  begin
    perform public.consume_telegram_link_token(v_token, '92002');
    raise exception 'unbound token was rebound to a second Telegram account';
  exception when others then
    if sqlerrm not like '%link_token_already_presented%' then raise; end if;
  end;
  perform public.confirm_telegram_link_token(v_token, '11111111-1111-4111-8111-111111111111');
  begin
    perform public.confirm_telegram_link_token(v_token, '11111111-1111-4111-8111-111111111111');
    raise exception 'used link token replay succeeded';
  exception when others then
    if sqlerrm not like '%link_token_used%' then raise; end if;
  end;
  select token into v_token from public.issue_telegram_link_token('11111111-1111-4111-8111-111111111111', null, null);
  begin
    perform public.consume_telegram_link_token(v_token, '92003');
    raise exception 'linked Schood user was silently rebound';
  exception when others then
    if sqlerrm not like '%schood_user_already_linked%' then raise; end if;
  end;
end
$$;

do $$
declare
  v_session uuid;
  v_lead uuid;
begin
  insert into public.telegram_acquisition_sessions(bot_name, telegram_user_id, funnel)
  values ('schoodonlinebot', '93001', 'academy') returning id into v_session;
  insert into public.sales_leads(acquisition_session_id, idempotency_key, telegram_user_id, contact_name)
  values (v_session, 'telegram-db-test:lead', '93001', 'Test Academy') returning id into v_lead;
  if (select count(*) from public.sales_lead_activities where lead_id = v_lead and activity_type = 'created') <> 1 then
    raise exception 'lead creation activity was not atomic';
  end if;
  begin
    insert into public.sales_leads(acquisition_session_id, idempotency_key, telegram_user_id, contact_name)
    values (v_session, 'telegram-db-test:lead', '93001', 'Duplicate Academy');
    raise exception 'duplicate lead was accepted';
  exception when unique_violation then null;
  end;
end
$$;

insert into public.support_messages(name, email, message, source, service_slug, metadata)
values ('Test', 'test@example.invalid', 'Help', 'telegram_public_bot', 'telegram-public', jsonb_build_object(
  'request_fingerprint', 'telegram-db-test-support',
  'request_window_bucket', '2026-08-12T10:00:00Z'
));
do $$
begin
  begin
    insert into public.support_messages(name, email, message, source, service_slug, metadata)
    values ('Test', 'test@example.invalid', 'Help again', 'telegram_public_bot', 'telegram-public', jsonb_build_object(
      'request_fingerprint', 'telegram-db-test-support',
      'request_window_bucket', '2026-08-12T10:00:00Z'
    ));
    raise exception 'duplicate public support request was accepted';
  exception when unique_violation then null;
  end;
end
$$;

do $$
begin
  if has_function_privilege('anon', 'public.claim_telegram_update(text,bigint,text,text,integer)', 'execute') then
    raise exception 'anon can execute claim_telegram_update';
  end if;
  if has_function_privilege('authenticated', 'public.confirm_telegram_link_token(text,uuid)', 'execute') then
    raise exception 'authenticated can execute confirm_telegram_link_token directly';
  end if;
  if not has_function_privilege('service_role', 'public.claim_telegram_update(text,bigint,text,text,integer)', 'execute') then
    raise exception 'service_role cannot execute claim_telegram_update';
  end if;
end
$$;

begin;
set local role anon;
select 1 / nullif((count(*) = 0)::integer, 0) from public.telegram_acquisition_sessions;
select 1 / nullif((count(*) = 0)::integer, 0) from public.telegram_update_receipts;
select 1 / nullif((count(*) = 0)::integer, 0) from public.sales_leads;
select 1 / nullif((count(*) = 0)::integer, 0) from public.sales_lead_activities;
rollback;

select 'telegram growth DB verification passed' as result;
