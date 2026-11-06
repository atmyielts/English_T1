-- Marketing engine for company.schood.online: where a demo request came from, when the
-- person prefers to talk, and the free public level check. Additive and idempotent.

alter table public.company_leads add column if not exists utm_source text;
alter table public.company_leads add column if not exists utm_medium text;
alter table public.company_leads add column if not exists utm_campaign text;
alter table public.company_leads add column if not exists utm_term text;
alter table public.company_leads add column if not exists utm_content text;
-- First page of the visit and the referring site's host name, never a full referring URL.
alter table public.company_leads add column if not exists landing_path text;
alter table public.company_leads add column if not exists referrer_host text;
-- A preferred time to talk, in Tashkent time. A wish, not a booked appointment.
alter table public.company_leads add column if not exists preferred_day date;
alter table public.company_leads add column if not exists preferred_slot text;
alter table public.company_leads add column if not exists preferred_channel text;
-- The estimate from /check, scored again on the server from the submitted answers.
alter table public.company_leads add column if not exists check_result jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_leads_utm_length_check') then
    alter table public.company_leads add constraint company_leads_utm_length_check check (
      coalesce(char_length(utm_source), 0) <= 120 and coalesce(char_length(utm_medium), 0) <= 120 and coalesce(char_length(utm_campaign), 0) <= 120
      and coalesce(char_length(utm_term), 0) <= 120 and coalesce(char_length(utm_content), 0) <= 120
      and coalesce(char_length(landing_path), 0) <= 200 and coalesce(char_length(referrer_host), 0) <= 200
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'company_leads_preferred_slot_check') then
    alter table public.company_leads add constraint company_leads_preferred_slot_check
      check (preferred_slot is null or preferred_slot in ('morning','midday','afternoon','evening'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'company_leads_preferred_channel_check') then
    alter table public.company_leads add constraint company_leads_preferred_channel_check
      check (preferred_channel is null or preferred_channel in ('phone','telegram','email','video'));
  end if;
end
$$;

create index if not exists company_leads_source_idx on public.company_leads (source, created_at desc);

-- One row per opening or scoring of the free check. It holds no name, contact or answers,
-- only the day-salted address hash the rate limit counts and the estimate's level.
-- The function deletes rows older than 30 days as new ones arrive.
create table if not exists public.company_check_runs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('open','score')),
  ip_hash text not null check (char_length(ip_hash) <= 64),
  level text check (level is null or level in ('pre_a1','a1','a2','b1','b2','c1','c2')),
  created_at timestamptz not null default now()
);
create index if not exists company_check_runs_ip_idx on public.company_check_runs (ip_hash, kind);
create index if not exists company_check_runs_created_idx on public.company_check_runs (created_at);

alter table public.company_check_runs enable row level security;
revoke all on table public.company_check_runs from anon, authenticated;
grant all on table public.company_check_runs to service_role;
