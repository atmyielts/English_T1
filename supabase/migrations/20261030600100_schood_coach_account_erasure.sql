-- Schood Coaches and account closure. The personal coach tables (enrolments,
-- sessions, turns, scores, mastery, cards, polls, schedules, deliveries, update
-- ids, sign-ins, certificates, team memberships) are in
-- account_personal_erasure_tables() since 20261030600000, so the closure
-- transaction deletes them. This hook does the rest (pattern 3 of the function
-- CONTRACT.md): a Coach Team the leaver managed stays for its members with no
-- manager until support names a new one, and invite codes the leaver issued stop
-- working. Idempotent; runs after core's ai_erase_account.
begin;

create or replace function public.coach_erase_account(p_user uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_managed integer;
  v_created integer;
  v_invites integer;
begin
  update public.coach_teams set manager_id = null where manager_id = p_user;
  get diagnostics v_managed = row_count;
  update public.coach_teams set created_by = null where created_by = p_user;
  get diagnostics v_created = row_count;
  delete from public.coach_team_invites where created_by = p_user;
  get diagnostics v_invites = row_count;
  return jsonb_build_object('teams_unmanaged', v_managed, 'teams_unlinked', v_created, 'invites_removed', v_invites);
end $$;
revoke all on function public.coach_erase_account(uuid) from public, anon, authenticated, service_role;

do $$
declare hooks text[];
begin
  if to_regprocedure('public.account_erasure_service_hooks()') is null then
    raise notice 'account_erasure_service_hooks() is not installed; coach erasure hook not registered';
    return;
  end if;
  hooks := public.account_erasure_service_hooks();
  if not ('coach_erase_account' = any(hooks)) then
    hooks := hooks || 'coach_erase_account'::text;
    execute format(
      'create or replace function public.account_erasure_service_hooks() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
      format('select %L::text[];', hooks::text)
    );
  end if;
end
$$;

commit;
