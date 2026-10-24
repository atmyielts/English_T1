-- In-app inbox for Schood English (hub /inbox, the bell in the top bar).
-- ============================================================================
-- One row per notice. Most notices are derived by the hub from data that
-- already exists (level history, badges, streak, due reviews, the monthly
-- check, paused services, last week's activity) and stored here the first
-- time they are shown, so "read" survives across devices. Other features can
-- add notices with pushInbox() in supabase/functions/_shared/english-inbox.ts.
--
--   dedupe_key  one notice per learner per key (e.g. "badge:streak_7"); a
--               second push with the same key is ignored.
--   kind        what the app shows (title, icon, link): see INBOX_KINDS.
--   params      values for the app's translated text (counts, levels, keys).
--   title/body  optional fixed text for operator notices (kind "system").
--   expires_at  hidden after this time (e.g. "12 reviews due" ends with the day).
--
-- Written and read only by edge functions (service role).
-- ============================================================================

create table if not exists public.english_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,40}$'),
  dedupe_key text not null check (char_length(dedupe_key) between 3 and 160),
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  title text check (title is null or char_length(title) <= 160),
  body text check (body is null or char_length(body) <= 600),
  link text check (link is null or (char_length(link) <= 300 and link ~ '^/')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  expires_at timestamptz,
  constraint english_inbox_dedupe_unique unique (user_id, dedupe_key)
);

create index if not exists english_inbox_user_idx
  on public.english_inbox (user_id, created_at desc);

alter table public.english_inbox enable row level security;
revoke all on public.english_inbox from anon, authenticated;

-- Old notices are pruned daily: read ones after 90 days, everything after 180.
create or replace function public.prune_english_inbox()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer;
begin
  delete from public.english_inbox
  where created_at < now() - interval '180 days'
     or (read_at is not null and created_at < now() - interval '90 days')
     or (expires_at is not null and expires_at < now() - interval '30 days');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_english_inbox() from public, anon, authenticated;
grant execute on function public.prune_english_inbox() to service_role;

create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'english-inbox-prune-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  -- 03:41 UTC, away from the AI ledger prune (03:23) and the hourly reminder job (minute 7).
  perform cron.schedule(
    'english-inbox-prune-v1',
    '41 3 * * *',
    $cron$select public.prune_english_inbox();$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron is unavailable in this environment; english_inbox pruning not scheduled';
end
$$;
