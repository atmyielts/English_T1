-- Schood Company English: people, invitations and the sales pipeline (gtm workstream).
-- The core migration created company_members, company_invites and company_leads;
-- this one adds:
--   * a guard so an update never leaves a workspace without an active owner
--     (the people routes check it too; this closes the race between two tabs);
--   * the fields the landing demo form and the staff leads pipeline use;
--   * indexes for the per-address daily limit on demo requests, lead timelines
--     (kept in company_audit) and personal invitations.
-- Seat limits are enforced by the people routes (count, write, re-count and roll
-- back), not by a trigger, so other areas' fixtures can seat members freely.
-- Idempotent: every statement can run twice.

alter table public.company_leads add column if not exists job_title text;
alter table public.company_leads add column if not exists interests text[] not null default '{}'::text[];
alter table public.company_leads add column if not exists follow_up_at date;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_leads_job_title_check') then
    alter table public.company_leads add constraint company_leads_job_title_check check (job_title is null or char_length(job_title) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'company_leads_interests_check') then
    alter table public.company_leads add constraint company_leads_interests_check
      check (interests <@ array['hiring','placement','training','reports']::text[]);
  end if;
end
$$;
create index if not exists company_leads_ip_idx on public.company_leads (ip_hash, created_at desc) where ip_hash is not null;
create index if not exists company_leads_status_idx on public.company_leads (status, created_at desc);
create index if not exists company_invites_member_idx on public.company_invites (member_id) where member_id is not null;
create index if not exists company_audit_target_idx on public.company_audit (target, created_at desc) where target is not null;

-- Owners: an update may not leave a workspace without an active owner.
-- Deleting rows (account erasure) is not affected.
create or replace function public.company_members_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner' and old.status = 'active'
     and (new.role <> 'owner' or new.status <> 'active' or new.org_id <> old.org_id) then
    -- Lock the workspace so two demotions are checked one after the other.
    perform 1 from public.company_orgs where id = old.org_id for update;
    if not exists (
      select 1 from public.company_members
      where org_id = old.org_id and role = 'owner' and status = 'active' and id <> old.id
    ) then
      raise exception 'company_last_owner: a workspace needs an active owner' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists company_members_owner_guard on public.company_members;
create trigger company_members_owner_guard before update of role, status, org_id on public.company_members
  for each row execute function public.company_members_owner_guard();

revoke all on function public.company_members_owner_guard() from public, anon, authenticated;
