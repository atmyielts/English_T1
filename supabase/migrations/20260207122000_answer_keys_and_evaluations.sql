-- ============================================================================
-- ANSWER KEYS + EVALUATIONS (SCORING)
-- ============================================================================
-- - answer_keys are protected (no user access by default)
-- - evaluations are readable by the session owner

create table if not exists public.answer_keys (
  content_unit_id uuid primary key references public.content_units(id) on delete cascade,
  correct jsonb not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.answer_keys is
  'Scoring keys for objective questions. Kept private (no default user access).';

alter table public.answer_keys enable row level security;

drop policy if exists "Answer keys select (admin)" on public.answer_keys;
create policy "Answer keys select (admin)"
on public.answer_keys
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

-- No other policies: only service role can read/write.


create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  method text not null default 'auto' check (method in ('auto', 'manual', 'ai')),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  result jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, method)
);

create index if not exists evaluations_session_id_idx on public.evaluations(session_id);

alter table public.evaluations enable row level security;

drop policy if exists "Evaluations select own" on public.evaluations;
create policy "Evaluations select own"
on public.evaluations
for select
using (
  exists (
    select 1
    from public.sessions s
    where s.id = evaluations.session_id
      and s.user_id = auth.uid()
  )
);

-- No insert/update policies: evaluations are written by service role (Edge Function).

