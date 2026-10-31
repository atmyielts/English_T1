-- Schood Coaches, phase 7 (B3 Admission Maths, B4 Sales, B5 Career and Interview,
-- B6 Public Speaking): two engine additions on top of 20261030600000.
--   1. coach_scripts: the B4 script builder's saved scripts (the learner's own product,
--      offer and buyers, and the structured call script and objection map built from
--      them). Personal: in the erasure registry.
--   2. coach_cohort_histogram(): the anonymous percentile's only input. Each person's
--      latest result on a keyed rubric in a window, counted per whole score. Counts
--      only; no user id, name or session leaves it. The function shows a percentile
--      only for windows of at least 30 people, and only to the learner it is about.
-- Reached only by the schood-ai function (service role): RLS on with no policies.
begin;

create table if not exists public.coach_scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  -- the learner's answers to the builder's questions, by question id.
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object' and pg_column_size(input) < 16384),
  -- opening, discovery questions, value pitch, objection map, closes, next steps, DM version, follow-up.
  script jsonb not null default '{}'::jsonb check (jsonb_typeof(script) = 'object' and pg_column_size(script) < 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coach_scripts_user_idx on public.coach_scripts (user_id, pack, updated_at desc);

drop trigger if exists coach_scripts_updated_at on public.coach_scripts;
create trigger coach_scripts_updated_at before update on public.coach_scripts for each row execute function public.set_updated_at();

alter table public.coach_scripts enable row level security;
revoke all on public.coach_scripts from anon, authenticated;
grant select, insert, update, delete on public.coach_scripts to service_role;

-- The anonymous percentile (B3 mini-mocks): counts per score of each person's latest
-- finished result on a rubric since p_since. Reads coach_sessions_results_idx.
create or replace function public.coach_cohort_histogram(p_pack text, p_rubric text, p_since timestamptz)
returns table (score integer, people bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with latest as (
    select distinct on (s.user_id) s.user_id, s.overall
    from public.coach_sessions s
    where s.pack = p_pack and s.rubric = p_rubric and s.status = 'finished' and s.overall is not null and s.finished_at >= p_since
    order by s.user_id, s.finished_at desc
  )
  select round(latest.overall)::integer as score, count(*)::bigint as people
  from latest
  group by round(latest.overall)::integer
  order by 1;
$$;
revoke all on function public.coach_cohort_histogram(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.coach_cohort_histogram(text, text, timestamptz) to service_role;

-- --- Account erasure: the registry pattern of 20261030130000 ------------------------------------------------
do $$
declare
  relations text[];
  guard_installed boolean := to_regprocedure('public.guard_closed_personal_record()') is not null;
begin
  if to_regprocedure('public.account_personal_erasure_tables()') is null then
    raise notice 'account_personal_erasure_tables() is not installed; erasure registry not extended';
    return;
  end if;
  relations := public.account_personal_erasure_tables();
  if not ('coach_scripts' = any(relations)) then
    relations := relations || 'coach_scripts'::text;
    if guard_installed then
      execute 'drop trigger if exists account_closed_personal_guard on public.coach_scripts';
      execute format('create trigger account_closed_personal_guard before insert or update on public.coach_scripts for each row execute function public.guard_closed_personal_record(%L)', 'user_id');
    end if;
    execute format(
      'create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
      format('select %L::text[];', relations::text)
    );
  end if;
end
$$;

commit;
