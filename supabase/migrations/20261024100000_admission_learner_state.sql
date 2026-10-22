-- Schood Admission: learner state for subject practice (Maths first).
-- ============================================================================
-- Additive and separate from the English learner_language_* tables. Questions
-- come from approved Assessment Cloud item versions; these tables only hold
-- the learner's goal, per-topic mastery, answers and daily plans.
-- Every table is read and written by the admission edge function with the
-- service role. Browsers get nothing directly.
-- ============================================================================
begin;

create table if not exists public.learner_subject_goals (
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null check (subject ~ '^[a-z][a-z0-9_]{1,30}$'),
  exam_code text not null check (exam_code ~ '^[a-z0-9-]{2,40}$'),
  format_version text not null check (length(format_version) between 1 and 20),
  -- The exam section the learner sits Maths in: compulsory block or a specialised subject.
  section_id text not null check (section_id ~ '^[a-z0-9_]{2,40}$'),
  question_locale text not null check (question_locale in ('uz', 'ru')),
  daily_minutes smallint not null default 30 check (daily_minutes between 10 and 120),
  exam_date date,
  target_points numeric(6, 1) check (target_points is null or target_points between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, subject)
);

create table if not exists public.learner_subject_mastery (
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null check (subject ~ '^[a-z][a-z0-9_]{1,30}$'),
  topic_code text not null check (topic_code ~ '^[a-z][a-z0-9_.]{2,60}$'),
  theta double precision not null default 0 check (theta between -4 and 4),
  precision double precision not null default 1 check (precision >= 1),
  attempts integer not null default 0 check (attempts >= 0),
  correct integer not null default 0 check (correct between 0 and attempts),
  box smallint not null default 0 check (box between 0 and 5),
  last_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, subject, topic_code)
);

create table if not exists public.learner_subject_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null check (subject ~ '^[a-z][a-z0-9_]{1,30}$'),
  topic_code text not null check (topic_code ~ '^[a-z][a-z0-9_.]{2,60}$'),
  client_answer_id uuid not null,
  item_version_id uuid not null references public.assessment_item_versions(id),
  mode text not null check (mode in ('diagnostic', 'practice', 'review')),
  difficulty double precision not null check (difficulty between -6 and 6),
  correct boolean not null,
  error_kind text check (error_kind is null or error_kind in ('slip', 'concept')),
  response jsonb not null,
  seconds integer check (seconds is null or seconds between 0 and 7200),
  hints_used smallint not null default 0 check (hints_used between 0 and 10),
  created_at timestamptz not null default now(),
  constraint learner_subject_answers_client_unique unique (user_id, client_answer_id),
  check (correct or error_kind is not null),
  check (pg_column_size(response) <= 20000)
);

create index if not exists learner_subject_answers_recent_idx
  on public.learner_subject_answers (user_id, subject, created_at desc);
create index if not exists learner_subject_answers_item_idx
  on public.learner_subject_answers (item_version_id);

create table if not exists public.learner_subject_daily_plans (
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null check (subject ~ '^[a-z][a-z0-9_]{1,30}$'),
  plan_date date not null,
  tasks jsonb not null check (jsonb_typeof(tasks) = 'array' and jsonb_array_length(tasks) <= 10),
  created_at timestamptz not null default now(),
  primary key (user_id, subject, plan_date)
);

alter table public.learner_subject_goals enable row level security;
alter table public.learner_subject_mastery enable row level security;
alter table public.learner_subject_answers enable row level security;
alter table public.learner_subject_daily_plans enable row level security;

-- No policies: the admission function is the only reader and writer.
revoke all on public.learner_subject_goals from anon, authenticated;
revoke all on public.learner_subject_mastery from anon, authenticated;
revoke all on public.learner_subject_answers from anon, authenticated;
revoke all on public.learner_subject_daily_plans from anon, authenticated;

drop trigger if exists learner_subject_goals_updated_at on public.learner_subject_goals;
create trigger learner_subject_goals_updated_at
  before update on public.learner_subject_goals
  for each row execute function public.set_updated_at();

-- Records one answer and the new mastery for its topic in one transaction.
-- Replaying the same client_answer_id returns the stored answer without changing
-- anything. Mastery moves only from the state the caller computed from
-- (p_expected_attempts), so two tabs answering at once cannot lose an update:
-- the second gets mastery_conflict and recomputes from the fresh row.
create or replace function public.learner_subject_record_answer(
  p_user uuid,
  p_subject text,
  p_topic text,
  p_answer jsonb,
  p_expected_attempts integer,
  p_state jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.learner_subject_answers;
  current_attempts integer;
  stored public.learner_subject_answers;
begin
  select * into existing from public.learner_subject_answers
    where user_id = p_user and client_answer_id = (p_answer->>'client_answer_id')::uuid;
  if found then
    return jsonb_build_object('replayed', true, 'answer', to_jsonb(existing));
  end if;

  insert into public.learner_subject_mastery (user_id, subject, topic_code)
    values (p_user, p_subject, p_topic)
    on conflict do nothing;
  select attempts into current_attempts from public.learner_subject_mastery
    where user_id = p_user and subject = p_subject and topic_code = p_topic
    for update;
  if current_attempts <> p_expected_attempts then
    raise exception 'mastery_conflict' using errcode = '40001';
  end if;

  insert into public.learner_subject_answers (
    user_id, subject, topic_code, client_answer_id, item_version_id, mode,
    difficulty, correct, error_kind, response, seconds, hints_used
  ) values (
    p_user, p_subject, p_topic, (p_answer->>'client_answer_id')::uuid,
    (p_answer->>'item_version_id')::uuid, p_answer->>'mode',
    (p_answer->>'difficulty')::double precision, (p_answer->>'correct')::boolean,
    p_answer->>'error_kind', coalesce(p_answer->'response', 'null'::jsonb),
    (p_answer->>'seconds')::integer, coalesce((p_answer->>'hints_used')::smallint, 0)
  ) returning * into stored;

  update public.learner_subject_mastery set
    theta = (p_state->>'theta')::double precision,
    precision = (p_state->>'precision')::double precision,
    attempts = (p_state->>'attempts')::integer,
    correct = (p_state->>'correct')::integer,
    box = (p_state->>'box')::smallint,
    last_at = (p_state->>'last_at')::timestamptz,
    next_review_at = (p_state->>'next_review_at')::timestamptz,
    updated_at = now()
  where user_id = p_user and subject = p_subject and topic_code = p_topic;

  return jsonb_build_object('replayed', false, 'answer', to_jsonb(stored));
end;
$$;

revoke all on function public.learner_subject_record_answer(uuid, text, text, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.learner_subject_record_answer(uuid, text, text, jsonb, integer, jsonb) to service_role;

commit;
