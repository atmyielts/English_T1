-- Schood AI on account closure (the owner's decision of 2026-10-30), run by the
-- account closure transaction through account_erasure_service_hooks()
-- (20261030140000), after the user_id tables in account_personal_erasure_tables()
-- are already erased (20261030130000).
--
-- ai_erase_account(p_user):
--   - deletes the person's personal workspace, and with it its library pages and
--     their versions, conversations, generation jobs, actions, assistants,
--     invites and credit balance;
--   - deletes their memberships in centre workspaces and the invite codes they
--     issued; centre pages they wrote stay in the centre's library;
--   - refuses (account_ownership_transfer_required, the code the account guard
--     already uses) while they own a centre that still has other active members;
--     a centre they own alone is suspended;
--   - keeps every credit ledger row and unlinks it: user_id and, for the deleted
--     personal workspace, workspace_id become null, so amounts, kinds, credit keys,
--     references and times remain as an anonymous financial record;
--   - unlinks their reports (reporter and their note) and deletes their per-person
--     daily call counters.
-- To allow this, the ledger's workspace reference becomes ON DELETE SET NULL (it
-- was CASCADE), and the ledger guard accepts exactly that unlinking and nothing
-- else: no ledger row can be deleted any more.
begin;

alter table public.ai_credit_ledger alter column workspace_id drop not null;
do $$
declare constraint_name text;
begin
  select c.conname into constraint_name from pg_constraint c
    where c.conrelid = 'public.ai_credit_ledger'::regclass and c.contype = 'f' and c.confrelid = 'public.ai_workspaces'::regclass
      and c.confdeltype = 'c';
  if constraint_name is not null then
    execute format('alter table public.ai_credit_ledger drop constraint %I', constraint_name);
    alter table public.ai_credit_ledger add constraint ai_credit_ledger_workspace_id_fkey
      foreign key (workspace_id) references public.ai_workspaces(id) on delete set null;
  end if;
end
$$;

create or replace function public.ai_credit_ledger_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    -- The only change: unlinking a person or a deleted workspace.
    if (new.user_id is null or new.user_id is not distinct from old.user_id)
      and (new.workspace_id is null or new.workspace_id is not distinct from old.workspace_id)
      and (to_jsonb(new) - 'user_id' - 'workspace_id') = (to_jsonb(old) - 'user_id' - 'workspace_id') then
      return new;
    end if;
  end if;
  raise exception 'ai_credit_ledger is append-only' using errcode = '42501';
end $$;

create or replace function public.ai_erase_account(p_user uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  personal uuid[];
  shared uuid;
  v_ledger integer;
  v_reports integer;
  v_memberships integer;
  v_invites integer;
  v_personal integer;
  v_suspended integer;
  v_usage integer;
begin
  if p_user is null then raise exception 'p_user is required' using errcode = '22023'; end if;
  -- Centres they own: lock them, refuse while other people still use one.
  perform 1 from public.ai_workspaces where owner_id = p_user order by id for update;
  select w.id into shared from public.ai_workspaces w
    where w.owner_id = p_user and w.kind = 'centre' and w.status = 'active'
      and exists (select 1 from public.ai_workspace_members m join public.users u on u.id = m.user_id
        where m.workspace_id = w.id and m.user_id <> p_user and m.status = 'active' and coalesce(u.is_active, true))
    limit 1;
  if shared is not null then
    raise exception using errcode = 'P0001', message = 'account_ownership_transfer_required', detail = 'schood_ai_centre';
  end if;

  select coalesce(array_agg(id), '{}') into personal from public.ai_workspaces where owner_id = p_user and kind = 'personal';
  update public.ai_credit_ledger set user_id = null where user_id = p_user;
  get diagnostics v_ledger = row_count;
  update public.ai_reports set reporter_id = null, note = null where reporter_id = p_user;
  get diagnostics v_reports = row_count;
  update public.ai_workspaces set status = 'suspended' where owner_id = p_user and kind = 'centre' and status = 'active';
  get diagnostics v_suspended = row_count;
  delete from public.ai_workspace_invites where created_by = p_user;
  get diagnostics v_invites = row_count;
  delete from public.ai_workspace_members where user_id = p_user and not (workspace_id = any(personal));
  get diagnostics v_memberships = row_count;
  delete from public.ai_usage_daily where scope = 'user' and scope_id = p_user;
  get diagnostics v_usage = row_count;
  delete from public.ai_workspaces where id = any(personal);
  get diagnostics v_personal = row_count;
  return jsonb_build_object('personal_workspaces', v_personal, 'centre_memberships', v_memberships, 'invites', v_invites,
    'ledger_rows_unlinked', v_ledger, 'reports_unlinked', v_reports, 'centres_suspended', v_suspended, 'usage_counters', v_usage);
end;
$$;
revoke all on function public.ai_erase_account(uuid) from public, anon, authenticated, service_role;

do $$
declare hooks text[];
begin
  if to_regprocedure('public.account_erasure_service_hooks()') is null then
    raise notice 'account_erasure_service_hooks() is not installed; Schood AI erasure hook not registered';
    return;
  end if;
  hooks := public.account_erasure_service_hooks();
  if not ('ai_erase_account' = any(hooks)) then
    hooks := hooks || 'ai_erase_account'::text;
    execute format(
      'create or replace function public.account_erasure_service_hooks() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
      format('select %L::text[];', hooks::text)
    );
  end if;
end
$$;

commit;
