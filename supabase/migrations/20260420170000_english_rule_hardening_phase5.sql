-- ============================================================================
-- Non-exam English Phase 5: rule hardening + analytics
-- ----------------------------------------------------------------------------
-- Adds:
-- - admin-tunable rule config rows for English recommendation thresholds
-- - analytics event history for mastery reopenings and rule changes
-- - indexes to support English ops dashboards
-- ============================================================================

create table if not exists public.english_learning_rule_configs (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete cascade,
  rule_key text not null,
  service_key text not null default '*'
    check (service_key in ('*', 'reading', 'listening', 'writing', 'speaking', 'grammar', 'vocabulary', 'immersion')),
  enabled boolean not null default true,
  thresholds jsonb not null default '{}'::jsonb,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint english_learning_rule_configs_unique unique (language_id, rule_key, service_key)
);

create index if not exists english_learning_rule_configs_lookup_idx
  on public.english_learning_rule_configs(language_id, service_key, rule_key, enabled);

drop trigger if exists english_learning_rule_configs_updated_at on public.english_learning_rule_configs;
create trigger english_learning_rule_configs_updated_at
before update on public.english_learning_rule_configs
for each row execute function public.set_updated_at();

alter table public.english_learning_rule_configs enable row level security;

drop policy if exists "English learning rule configs select admin" on public.english_learning_rule_configs;
create policy "English learning rule configs select admin"
on public.english_learning_rule_configs
for select
to authenticated
using (public.is_admin());

drop policy if exists "English learning rule configs mutate admin" on public.english_learning_rule_configs;
create policy "English learning rule configs mutate admin"
on public.english_learning_rule_configs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.english_learning_analytics_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  learner_user_id uuid references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  event_type text not null
    check (event_type in ('mastery_reopened', 'rule_updated')),
  source_service_key text
    check (source_service_key is null or source_service_key in ('reading', 'listening', 'writing', 'speaking', 'grammar', 'vocabulary', 'immersion')),
  target_service_key text
    check (target_service_key is null or target_service_key in ('reading', 'listening', 'writing', 'speaking', 'grammar', 'vocabulary', 'immersion')),
  related_attempt_id uuid references public.learning_attempts(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists english_learning_analytics_events_type_idx
  on public.english_learning_analytics_events(language_id, event_type, created_at desc);

create index if not exists english_learning_analytics_events_service_idx
  on public.english_learning_analytics_events(language_id, source_service_key, target_service_key, created_at desc);

alter table public.english_learning_analytics_events enable row level security;

drop policy if exists "English learning analytics events select admin" on public.english_learning_analytics_events;
create policy "English learning analytics events select admin"
on public.english_learning_analytics_events
for select
to authenticated
using (public.is_admin());

create index if not exists learner_language_recommendations_ops_idx
  on public.learner_language_recommendations(language_id, recommendation_type, recommended_service_key, created_at desc);

create index if not exists learning_attempts_ops_idx
  on public.learning_attempts(language_id, service_key, created_at desc, overall_score desc);

create index if not exists user_vocabulary_notebook_entries_ops_idx
  on public.user_vocabulary_notebook_entries(language_id, is_archived, created_at desc, correct_count, next_review_at);

do $$
declare
  v_en_id uuid;
begin
  insert into public.languages (code, name, status, metadata)
  values (
    'en',
    'English',
    'active',
    jsonb_build_object('seeded_by', '20260420170000_english_rule_hardening_phase5')
  )
  on conflict (code) do update
  set
    name = excluded.name,
    status = excluded.status,
    metadata = coalesce(public.languages.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  select id into v_en_id
  from public.languages
  where code = 'en'
  limit 1;

  insert into public.english_learning_rule_configs (
    language_id,
    rule_key,
    service_key,
    enabled,
    thresholds,
    notes,
    metadata
  )
  values
    (
      v_en_id,
      'grammar_remediation',
      'grammar',
      true,
      jsonb_build_object(
        'error_frequency', 3,
        'lookback_days', 7,
        'priority', 90,
        'estimated_minutes', 12
      ),
      'Assign grammar remediation after repeated grammar errors within the active lookback window.',
      jsonb_build_object('seeded_by', '20260420170000_english_rule_hardening_phase5')
    ),
    (
      v_en_id,
      'vocabulary_activation',
      'vocabulary',
      true,
      jsonb_build_object(
        'idle_days', 5,
        'min_correct_count', 0,
        'priority', 88,
        'estimated_minutes', 10
      ),
      'Push saved vocabulary into activation tasks when items stay unused for too long.',
      jsonb_build_object('seeded_by', '20260420170000_english_rule_hardening_phase5')
    ),
    (
      v_en_id,
      'listening_recovery',
      'listening',
      true,
      jsonb_build_object(
        'accuracy_below', 0.70,
        'repeat_count', 2,
        'lookback_days', 30,
        'priority', 86,
        'estimated_minutes', 12
      ),
      'Trigger controlled listening recovery when the same weak pattern repeats.',
      jsonb_build_object('seeded_by', '20260420170000_english_rule_hardening_phase5')
    ),
    (
      v_en_id,
      'writing_recovery',
      'writing',
      true,
      jsonb_build_object(
        'quality_below', 0.60,
        'low_attempts', 3,
        'lookback_days', 30,
        'priority', 84,
        'estimated_minutes', 12
      ),
      'Fallback to simpler guided writing when revision quality stays low.',
      jsonb_build_object('seeded_by', '20260420170000_english_rule_hardening_phase5')
    ),
    (
      v_en_id,
      'speaking_transfer',
      'speaking',
      true,
      jsonb_build_object(
        'min_issue_count', 1,
        'require_stable_grammar', true,
        'priority', 83,
        'estimated_minutes', 10
      ),
      'Use speaking transfer tasks when grammar looks stable in drills but not in speech.',
      jsonb_build_object('seeded_by', '20260420170000_english_rule_hardening_phase5')
    ),
    (
      v_en_id,
      'immersion_application',
      'immersion',
      true,
      jsonb_build_object(
        'min_stable_units', 1,
        'priority', 82,
        'estimated_minutes', 15
      ),
      'Validate real transfer in immersion once stable units exist in other services.',
      jsonb_build_object('seeded_by', '20260420170000_english_rule_hardening_phase5')
    ),
    (
      v_en_id,
      'handoff_effectiveness',
      '*',
      true,
      jsonb_build_object(
        'success_window_days', 7,
        'success_score', 0.65
      ),
      'Shared evaluation window and success threshold for recommendation handoff analytics.',
      jsonb_build_object('seeded_by', '20260420170000_english_rule_hardening_phase5')
    )
  on conflict (language_id, rule_key, service_key) do update
  set
    enabled = excluded.enabled,
    thresholds = excluded.thresholds,
    notes = excluded.notes,
    metadata = coalesce(public.english_learning_rule_configs.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();
end
$$;
