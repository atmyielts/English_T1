-- ============================================================================
-- IELTS PLAYBOOK SKILLS PROBES: store AI-graded 4-task diagnostic probes
-- ============================================================================
-- The deep diagnostic wizard offers an optional 4-task probe (one prompt per
-- IELTS section) that AI grades to produce an empirical per-skill band
-- estimate. Today the result lives in user_profiles.metadata, which is fine
-- for the current snapshot but loses history; this table lets us keep every
-- probe so the dashboard can show progression and the AI can compare against
-- prior estimates.
--
-- The probe payload + responses + AI estimates are all jsonb so we can evolve
-- the prompt shape without migrations. The only structured fields are user_id,
-- generated_at, completed_at, and overall_band_estimate (for indexing/sort).

create table if not exists public.ielts_playbook_skills_probes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  prompts jsonb not null default '[]'::jsonb,
  responses jsonb not null default '{}'::jsonb,
  ai_estimates jsonb not null default '{}'::jsonb,
  ai_status text,
  overall_band_estimate numeric(3,1),
  generated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ielts_playbook_skills_probes_user_idx
  on public.ielts_playbook_skills_probes(user_id, generated_at desc);

alter table public.ielts_playbook_skills_probes enable row level security;

drop policy if exists "Playbook skills probes select own" on public.ielts_playbook_skills_probes;
create policy "Playbook skills probes select own"
on public.ielts_playbook_skills_probes
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Playbook skills probes write own" on public.ielts_playbook_skills_probes;
create policy "Playbook skills probes write own"
on public.ielts_playbook_skills_probes
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());
