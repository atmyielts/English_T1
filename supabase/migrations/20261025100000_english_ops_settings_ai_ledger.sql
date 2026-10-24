-- English operations: one settings table the owner edits from the admin
-- "English control center", and a ledger of every English AI call.
-- ============================================================================
-- english_service_settings: small key -> jsonb rows read by edge functions
-- (supabase/functions/_shared/english-settings.ts, cached ~60s). The seeded
-- defaults match behaviour before this table existed, so applying the
-- migration changes nothing for learners. A missing or unreadable table also
-- falls back to the same defaults in code.
--
-- english_ai_calls: one row per English AI call (or refused call), written by
-- _shared/english-ai.ts. No prompts or answers are stored, only sizes,
-- timing, provider/model, token counts and a short error. Rows older than
-- 120 days are removed daily.
--
-- Both tables are service-role only.
-- ============================================================================

create table if not exists public.english_service_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

alter table public.english_service_settings enable row level security;
revoke all on public.english_service_settings from public, anon, authenticated;
grant select, insert, update, delete on public.english_service_settings to service_role;

insert into public.english_service_settings (key, value) values
  ('services', jsonb_build_object(
    'reading', true, 'writing', true, 'listening', true, 'speaking', true,
    'grammar', true, 'vocabulary', true, 'immersion', true, 'tutor', true)),
  ('free_activities_per_day', to_jsonb(1)),
  ('ai', jsonb_build_object(
    'enabled', true,
    'daily_limit', 30,
    'word_lookup_daily_limit', 60,
    -- A feature missing from this map counts as enabled.
    'features', '{}'::jsonb))
on conflict (key) do nothing;

comment on table public.english_service_settings is
  'Operator switches for Schood English (services on/off, free tier, AI). Edited via admin-english-ops /control.';

create table if not exists public.english_ai_calls (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- No foreign key: the ledger is best-effort and must never reject a write.
  user_id uuid,
  feature text not null default 'unknown',
  provider text,
  model text,
  status text not null check (status in ('ok', 'failed', 'unconfigured', 'disabled', 'over_limit')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_chars integer check (input_chars is null or input_chars >= 0),
  output_chars integer check (output_chars is null or output_chars >= 0),
  prompt_tokens integer check (prompt_tokens is null or prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens is null or completion_tokens >= 0),
  error text check (error is null or length(error) <= 300)
);

create index if not exists english_ai_calls_created_idx
  on public.english_ai_calls (created_at desc);
create index if not exists english_ai_calls_feature_idx
  on public.english_ai_calls (feature, created_at desc);
create index if not exists english_ai_calls_user_idx
  on public.english_ai_calls (user_id, created_at desc)
  where user_id is not null;

alter table public.english_ai_calls enable row level security;
revoke all on public.english_ai_calls from public, anon, authenticated;
grant select, insert, delete on public.english_ai_calls to service_role;

comment on table public.english_ai_calls is
  'Server-only ledger of English AI calls (no prompt or answer text). Kept 120 days.';

-- Give back one daily AI credit when the call it paid for did not produce an
-- answer (provider error, AI switched off). Never goes below zero.
create or replace function public.refund_english_ai_daily_quota(
  p_user_id uuid,
  p_amount integer default 1
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    return;
  end if;
  update public.english_ai_usage_daily
     set request_count = greatest(request_count - greatest(1, least(coalesce(p_amount, 1), 500)), 0),
         updated_at = now()
   where user_id = p_user_id
     and usage_date = current_date;
end;
$$;

revoke all on function public.refund_english_ai_daily_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.refund_english_ai_daily_quota(uuid, integer) to service_role;

create or replace function public.prune_english_ai_calls(p_keep_days integer default 120)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.english_ai_calls
   where created_at < now() - make_interval(days => greatest(coalesce(p_keep_days, 120), 7));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_english_ai_calls(integer) from public, anon, authenticated;
grant execute on function public.prune_english_ai_calls(integer) to service_role;

create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'english-ai-calls-prune-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  -- 03:23 UTC, away from the hourly reminder job (minute 7) and academy jobs.
  perform cron.schedule(
    'english-ai-calls-prune-v1',
    '23 3 * * *',
    $cron$select public.prune_english_ai_calls(120);$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron is unavailable in this environment; english_ai_calls pruning not scheduled';
end
$$;

-- Usage summary for the admin control center (admin-english-ops /ai-usage).
-- Days are UTC, like english_ai_usage_daily. Learners are returned by id only.
create or replace function public.english_ai_usage_summary(p_days integer default 7)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select *
      from public.english_ai_calls
     where created_at >= date_trunc('day', now()) - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)) - 1)
  )
  select jsonb_build_object(
    'since', date_trunc('day', now()) - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)) - 1),
    'totals', (
      select jsonb_build_object(
        'calls', count(*),
        'ok', count(*) filter (where status = 'ok'),
        'failed', count(*) filter (where status = 'failed'),
        'disabled', count(*) filter (where status = 'disabled'),
        'unconfigured', count(*) filter (where status = 'unconfigured'),
        'over_limit', count(*) filter (where status = 'over_limit'),
        'learners', count(distinct user_id),
        'avg_latency_ms', round(avg(latency_ms) filter (where status = 'ok')),
        'prompt_tokens', coalesce(sum(prompt_tokens), 0),
        'completion_tokens', coalesce(sum(completion_tokens), 0)
      ) from base
    ),
    'by_day', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.day)
        from (
          select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
                 count(*) as calls,
                 count(*) filter (where status = 'ok') as ok,
                 count(*) filter (where status = 'failed') as failed,
                 count(*) filter (where status in ('disabled', 'unconfigured', 'over_limit')) as refused,
                 coalesce(sum(prompt_tokens), 0) + coalesce(sum(completion_tokens), 0) as tokens
            from base group by 1
        ) d
    ), '[]'::jsonb),
    'by_feature', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.calls desc)
        from (
          select feature,
                 count(*) as calls,
                 count(*) filter (where status = 'ok') as ok,
                 count(*) filter (where status = 'failed') as failed,
                 count(*) filter (where status in ('disabled', 'unconfigured', 'over_limit')) as refused,
                 round(avg(latency_ms) filter (where status = 'ok')) as avg_latency_ms,
                 coalesce(sum(prompt_tokens), 0) as prompt_tokens,
                 coalesce(sum(completion_tokens), 0) as completion_tokens
            from base group by feature
        ) f
    ), '[]'::jsonb),
    'by_status', coalesce((
      select jsonb_object_agg(status, calls) from (select status, count(*) as calls from base group by status) s
    ), '{}'::jsonb),
    'by_model', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.calls desc)
        from (
          select coalesce(provider, '-') as provider,
                 coalesce(model, '-') as model,
                 count(*) as calls,
                 round(avg(latency_ms)) as avg_latency_ms,
                 coalesce(sum(prompt_tokens), 0) as prompt_tokens,
                 coalesce(sum(completion_tokens), 0) as completion_tokens
            from base where status in ('ok', 'failed') group by 1, 2
        ) m
    ), '[]'::jsonb),
    'top_learners', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.calls desc)
        from (
          select user_id,
                 count(*) as calls,
                 count(*) filter (where status = 'ok') as ok,
                 count(*) filter (where status = 'over_limit') as over_limit
            from base where user_id is not null
           group by user_id order by count(*) desc limit 10
        ) l
    ), '[]'::jsonb),
    'recent_errors', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
        from (
          select created_at, feature, provider, model, error
            from base where status = 'failed'
           order by created_at desc limit 10
        ) e
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.english_ai_usage_summary(integer) from public, anon, authenticated;
grant execute on function public.english_ai_usage_summary(integer) to service_role;
