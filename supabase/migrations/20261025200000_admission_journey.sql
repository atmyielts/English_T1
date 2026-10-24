-- Schood Admission: the learner's exam path, weekly mocks and prediction history.
-- ============================================================================
-- Additive. Milestones are the exams a learner aims for (certificate sittings,
-- the admission test) with targets and real results; results also calibrate
-- predictions later. Weekly mocks keep answers server-side until submitted.
-- Every table is read and written only by the admission function.
-- ============================================================================
begin;

create table if not exists public.learner_subject_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null check (subject ~ '^[a-z][a-z0-9_]{1,30}$'),
  exam_code text not null check (exam_code in ('uz-admission', 'uz-certificate-math')),
  sitting_date date not null,
  target_points numeric(6, 1) check (target_points is null or target_points between 0 and 1000),
  target_grade text check (target_grade is null or target_grade in ('A+', 'A', 'B+', 'B', 'C+', 'C')),
  status text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  result_points numeric(6, 1) check (result_points is null or result_points between 0 and 1000),
  result_grade text check (result_grade is null or result_grade in ('A+', 'A', 'B+', 'B', 'C+', 'C', 'none')),
  -- The prediction shown when the result was reported, for calibrating later predictions.
  predicted jsonb check (predicted is null or jsonb_typeof(predicted) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_subject_milestones_unique unique (user_id, subject, exam_code, sitting_date)
);
create index if not exists learner_subject_milestones_user_idx on public.learner_subject_milestones (user_id, subject, sitting_date);

create table if not exists public.learner_subject_mocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null check (subject ~ '^[a-z][a-z0-9_]{1,30}$'),
  week date not null,
  section_id text not null check (section_id ~ '^[a-z0-9_]{2,40}$'),
  question_locale text not null check (question_locale in ('uz', 'ru')),
  -- [{item_version_id, topic_code}] in the order shown; no keys.
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 200000),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  correct integer check (correct is null or correct >= 0),
  points numeric(6, 1),
  max_points numeric(6, 1),
  -- Per-question outcome after submission: [{item_version_id, topic_code, correct}].
  results jsonb check (results is null or jsonb_typeof(results) = 'array'),
  constraint learner_subject_mocks_weekly unique (user_id, subject, week),
  check ((submitted_at is null) = (points is null))
);
create index if not exists learner_subject_mocks_week_idx on public.learner_subject_mocks (subject, week, section_id) where submitted_at is not null;

create table if not exists public.learner_subject_prediction_snapshots (
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null check (subject ~ '^[a-z][a-z0-9_]{1,30}$'),
  day date not null,
  section_id text not null,
  expected numeric(6, 1) not null,
  low numeric(6, 1) not null,
  high numeric(6, 1) not null,
  primary key (user_id, subject, day)
);

-- Mock answers update mastery like practice does.
alter table public.learner_subject_answers drop constraint if exists learner_subject_answers_mode_check;
alter table public.learner_subject_answers add constraint learner_subject_answers_mode_check
  check (mode in ('diagnostic', 'practice', 'review', 'mock'));

alter table public.learner_subject_milestones enable row level security;
alter table public.learner_subject_mocks enable row level security;
alter table public.learner_subject_prediction_snapshots enable row level security;
revoke all on public.learner_subject_milestones from anon, authenticated;
revoke all on public.learner_subject_mocks from anon, authenticated;
revoke all on public.learner_subject_prediction_snapshots from anon, authenticated;

drop trigger if exists learner_subject_milestones_updated_at on public.learner_subject_milestones;
create trigger learner_subject_milestones_updated_at
  before update on public.learner_subject_milestones
  for each row execute function public.set_updated_at();

commit;
