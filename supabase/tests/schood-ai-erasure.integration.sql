-- Account closure and Schood AI (20261030140000 + 20261030150000), through the
-- closure transaction's trigger on auth.users (a stand-in for the real one, see
-- the fixture): the personal workspace and its content go, centre memberships
-- and issued invites go, centre pages stay, the credit ledger stays unlinked,
-- a centre still used by others blocks the closure, and nothing can be bypassed.
insert into public.users (id) values
  ('00000000-0000-4000-8000-0000000000b1'), ('00000000-0000-4000-8000-0000000000b2'), ('00000000-0000-4000-8000-0000000000b3'), ('00000000-0000-4000-8000-0000000000b4');
insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000000b1'), ('00000000-0000-4000-8000-0000000000b2'), ('00000000-0000-4000-8000-0000000000b3'), ('00000000-0000-4000-8000-0000000000b4');

do $$
declare
  leaver constant uuid := '00000000-0000-4000-8000-0000000000b1';
  boss constant uuid := '00000000-0000-4000-8000-0000000000b2';
  colleague constant uuid := '00000000-0000-4000-8000-0000000000b3';
  solo constant uuid := '00000000-0000-4000-8000-0000000000b4';
  personal uuid := (public.ai_ensure_personal_workspace(leaver, 'Leaver')).id;
  centre uuid;
  solo_centre uuid;
  page uuid;
  centre_page uuid;
  thread uuid;
  personal_ledger integer;
  raised boolean;
begin
  assert (select public.account_erasure_service_hooks()) = array['ai_erase_account'], 'Schood AI registered its hook once';
  assert exists (select 1 from pg_trigger where tgname = 'account_erasure_transaction_services' and tgrelid = 'auth.users'::regclass), 'hook trigger attached';

  -- The leaver's own workspace: a page with versions, a conversation, a job, credits.
  insert into public.ai_pages (workspace_id, owner_id, kind, title, body, updated_by) values (personal, leaver, 'note', 'My notes', 'v1', leaver) returning id into page;
  perform public.ai_page_save(page, 1, '{"body": "v2"}', leaver, true);
  insert into public.ai_threads (workspace_id, user_id, specialist_key) values (personal, leaver, 'assistant') returning id into thread;
  insert into public.ai_messages (thread_id, role, content) values (thread, 'user', 'private question');
  insert into public.ai_generations (workspace_id, user_id, feature) values (personal, leaver, 'teacher.worksheet');
  perform public.ai_credit_grant(personal, 50, 'pack', 'order-leaver');
  perform public.ai_credit_charge(personal, leaver, 3, 'tutor.reply', 'req-leaver', 0, null);
  personal_ledger := (select count(*) from public.ai_credit_ledger where workspace_id = personal);
  assert personal_ledger = 2, 'pack grant and charge recorded';
  insert into public.ai_learning_events (user_id, area, kind, verified, feature, source) values (leaver, 'core', 'goal_set', false, 'CORE', 'web');

  -- A centre owned by the boss, where the leaver teaches: a page, an invite, a charge, a report.
  insert into public.ai_workspaces (kind, name, owner_id) values ('centre', 'Registan', boss) returning id into centre;
  insert into public.ai_workspace_members (workspace_id, user_id, role) values (centre, boss, 'owner'), (centre, leaver, 'teacher');
  insert into public.ai_pages (workspace_id, owner_id, kind, title, body, visibility, updated_by) values (centre, leaver, 'note', 'Unit 1 worksheet', 'Centre material', 'workspace', leaver) returning id into centre_page;
  insert into public.ai_workspace_invites (workspace_id, role, code_hash, expires_at, created_by) values (centre, 'student', repeat('a', 64), now() + interval '7 days', leaver);
  perform public.ai_credit_grant(centre, 100, 'pack', 'order-centre');
  perform public.ai_credit_charge(centre, leaver, 2, 'tutor.reply', 'req-centre', 0, null);
  insert into public.ai_reports (workspace_id, reporter_id, reason, note, excerpt) values (centre, leaver, 'other', 'my own words', 'the answer');
  insert into public.ai_usage_daily (day, scope, scope_id, calls) values (current_date, 'user', leaver, 3);

  -- Unrelated Auth updates run nothing.
  update auth.users set email = 'changed@example.invalid' where id = leaver;
  assert exists (select 1 from public.ai_workspaces where id = personal), 'no erasure without closure';

  -- Close the account.
  update auth.users set deleted_at = now() where id = leaver;
  assert exists (select 1 from public.account_closure_receipts where user_id = leaver), 'closed';
  assert not exists (select 1 from public.ai_workspaces where id = personal), 'personal workspace deleted';
  assert not exists (select 1 from public.ai_pages where id = page) and not exists (select 1 from public.ai_page_revisions where page_id = page), 'its pages and versions too';
  assert not exists (select 1 from public.ai_threads where user_id = leaver) and not exists (select 1 from public.ai_messages where thread_id = thread), 'conversations deleted';
  assert not exists (select 1 from public.ai_generations where user_id = leaver), 'generation jobs deleted';
  assert not exists (select 1 from public.ai_learning_events where user_id = leaver), 'learning events deleted';
  assert not exists (select 1 from public.ai_credit_accounts where workspace_id = personal), 'balance deleted';
  assert (select count(*) from public.ai_credit_ledger where reference in ('order-leaver', 'req-leaver') and workspace_id is null and user_id is null) = personal_ledger, 'personal ledger rows kept, unlinked';
  assert not exists (select 1 from public.ai_credit_ledger where user_id = leaver), 'no ledger row names the person';
  assert exists (select 1 from public.ai_credit_ledger where workspace_id = centre and reference = 'req-centre' and user_id is null), 'centre charge kept with the centre';
  assert not exists (select 1 from public.ai_workspace_members where user_id = leaver), 'centre membership deleted';
  assert exists (select 1 from public.ai_workspace_members where workspace_id = centre and user_id = boss), 'others stay';
  assert not exists (select 1 from public.ai_workspace_invites where created_by = leaver), 'issued invites deleted';
  assert (select title from public.ai_pages where id = centre_page) = 'Unit 1 worksheet', 'centre pages stay in the centre';
  assert (select reporter_id is null and note is null and excerpt = 'the answer' from public.ai_reports where workspace_id = centre), 'report unlinked, the answer kept for review';
  assert not exists (select 1 from public.ai_usage_daily where scope = 'user' and scope_id = leaver), 'per-person counters deleted';
  assert public.ai_erase_account(leaver) = '{"invites": 0, "usage_counters": 0, "reports_unlinked": 0, "centre_memberships": 0, "centres_suspended": 0, "personal_workspaces": 0, "ledger_rows_unlinked": 0}'::jsonb, 'running again changes nothing';

  -- The boss owns a centre a colleague still uses: closure is refused and nothing changes.
  insert into public.ai_workspace_members (workspace_id, user_id, role) values (centre, colleague, 'teacher');
  raised := false;
  begin
    update auth.users set deleted_at = now() where id = boss;
  exception when raise_exception then raised := sqlerrm = 'account_ownership_transfer_required';
  end;
  assert raised, 'a centre in use must be handed over first';
  assert (select deleted_at is null from auth.users where id = boss) and not exists (select 1 from public.account_closure_receipts where user_id = boss), 'the closure rolled back';
  assert exists (select 1 from public.ai_workspace_members where workspace_id = centre and user_id = boss), 'membership untouched';

  -- A centre someone owns alone is suspended, with its pages kept.
  insert into public.ai_workspaces (kind, name, owner_id) values ('centre', 'Solo tutor', solo) returning id into solo_centre;
  insert into public.ai_workspace_members (workspace_id, user_id, role) values (solo_centre, solo, 'owner');
  insert into public.ai_pages (workspace_id, owner_id, kind, title, updated_by) values (solo_centre, solo, 'note', 'Solo page', solo);
  update auth.users set deleted_at = now() where id = solo;
  assert (select status from public.ai_workspaces where id = solo_centre) = 'suspended', 'solo centre suspended';
  assert exists (select 1 from public.ai_pages where workspace_id = solo_centre) and not exists (select 1 from public.ai_workspace_members where user_id = solo), 'pages kept, membership gone';

  -- Ledger rows can be unlinked but never rewritten or deleted.
  raised := false;
  begin update public.ai_credit_ledger set delta = 1 where reference = 'order-leaver'; exception when insufficient_privilege then raised := true; end;
  assert raised, 'amounts cannot change';
  raised := false;
  begin delete from public.ai_credit_ledger where reference = 'order-leaver'; exception when insufficient_privilege then raised := true; end;
  assert raised, 'unlinked rows cannot be deleted';
end $$;

set role service_role;
do $$
begin
  begin perform public.ai_erase_account('00000000-0000-4000-8000-0000000000b2'); raise exception 'service role erased an account'; exception when insufficient_privilege then null; end;
  begin perform public.run_account_erasure_service_hooks(); raise exception 'service role ran the hooks'; exception when insufficient_privilege then null; end;
  begin update public.ai_credit_ledger set user_id = null; raise exception 'service role unlinked the ledger'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
do $$
begin
  begin perform public.account_erasure_service_hooks(); raise exception 'authenticated read the hooks'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'schood ai erasure: ok';
