-- Exactly-once submits for answers the English app queued offline.
-- ============================================================================
-- The learner app (offline session) gives each queued activity submit a client
-- attempt id and may send it again after a dropped connection. The skill
-- functions (reading-articles, listening-content, grammar-remediation,
-- vocabulary-notebook) claim the id here before recording the attempt and keep
-- the response, so a repeat gets the same answer and records nothing new.
-- See supabase/functions/_shared/english-client-attempt.ts.
-- Written and read only by edge functions (service role). Rows are kept 30 days.
-- Safe to apply before or after the function deploy: without this table the
-- functions submit without dedupe, exactly as before.
-- ============================================================================

create table if not exists public.english_client_attempts (
  user_id uuid not null references public.users(id) on delete cascade,
  client_attempt_id text not null check (client_attempt_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  service_key text not null,
  route text not null default '',
  status text not null default 'pending' check (status in ('pending', 'done')),
  -- The submit response returned to repeats (small: scores and per-question results).
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, client_attempt_id)
);

create index if not exists english_client_attempts_created_idx
  on public.english_client_attempts (created_at);

alter table public.english_client_attempts enable row level security;
revoke all on public.english_client_attempts from anon, authenticated;

create or replace function public.prune_english_client_attempts(p_keep_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.english_client_attempts
   where created_at < now() - make_interval(days => greatest(coalesce(p_keep_days, 30), 7));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_english_client_attempts(integer) from public, anon, authenticated;
grant execute on function public.prune_english_client_attempts(integer) to service_role;

create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'english-client-attempts-prune-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  -- 03:41 UTC, away from the AI ledger prune (03:23) and the hourly reminder job (minute 7).
  perform cron.schedule(
    'english-client-attempts-prune-v1',
    '41 3 * * *',
    $cron$select public.prune_english_client_attempts(30);$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron is unavailable in this environment; english_client_attempts pruning not scheduled';
end
$$;
