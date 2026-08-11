-- Academy curriculum, native assessments, gradebook categories, and enrollment lifecycle.
-- This migration is additive and keeps the existing classroom/assignment APIs compatible.

create unique index if not exists academy_classrooms_id_academy_unique
  on public.academy_classrooms(id, academy_id);
create unique index if not exists academy_contacts_id_academy_unique
  on public.academy_contacts(id, academy_id);

create table if not exists public.academy_courses (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  code text,
  title text not null,
  description text,
  level text,
  estimated_minutes integer not null default 0 check (estimated_minutes >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, academy_id)
);

create unique index if not exists academy_courses_code_unique
  on public.academy_courses(academy_id, lower(code)) where code is not null;
create index if not exists academy_courses_academy_status_idx
  on public.academy_courses(academy_id, status, created_at);

create table if not exists public.academy_course_modules (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  course_id uuid not null,
  title text not null,
  description text,
  position integer not null default 0 check (position >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  unlock_rule jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, academy_id),
  constraint academy_course_modules_course_fk
    foreign key (course_id, academy_id) references public.academy_courses(id, academy_id) on delete cascade
);

create index if not exists academy_course_modules_course_position_idx
  on public.academy_course_modules(course_id, position);

create table if not exists public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  course_id uuid not null,
  module_id uuid not null,
  prerequisite_lesson_id uuid,
  title text not null,
  summary text,
  content jsonb not null default '[]'::jsonb,
  position integer not null default 0 check (position >= 0),
  estimated_minutes integer not null default 0 check (estimated_minutes >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  available_from timestamptz,
  completion_rule jsonb not null default '{"type":"manual"}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, academy_id),
  constraint academy_lessons_course_fk
    foreign key (course_id, academy_id) references public.academy_courses(id, academy_id) on delete cascade,
  constraint academy_lessons_module_fk
    foreign key (module_id, academy_id) references public.academy_course_modules(id, academy_id) on delete cascade,
  constraint academy_lessons_prerequisite_fk
    foreign key (prerequisite_lesson_id, academy_id) references public.academy_lessons(id, academy_id)
      on delete set null (prerequisite_lesson_id)
);

create index if not exists academy_lessons_module_position_idx
  on public.academy_lessons(module_id, position);
create index if not exists academy_lessons_course_status_idx
  on public.academy_lessons(course_id, status);

create table if not exists public.academy_classroom_courses (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  classroom_id uuid not null,
  course_id uuid not null,
  status text not null default 'active' check (status in ('scheduled', 'active', 'completed', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (classroom_id, course_id),
  constraint academy_classroom_courses_classroom_fk
    foreign key (classroom_id, academy_id) references public.academy_classrooms(id, academy_id) on delete cascade,
  constraint academy_classroom_courses_course_fk
    foreign key (course_id, academy_id) references public.academy_courses(id, academy_id) on delete cascade
);

create index if not exists academy_classroom_courses_academy_idx
  on public.academy_classroom_courses(academy_id, classroom_id, status);

create table if not exists public.academy_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  classroom_id uuid not null,
  course_id uuid not null,
  lesson_id uuid not null,
  contact_id uuid not null,
  user_id uuid references public.users(id) on delete set null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  time_spent_seconds integer not null default 0 check (time_spent_seconds >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, lesson_id, contact_id),
  constraint academy_lesson_progress_classroom_fk
    foreign key (classroom_id, academy_id) references public.academy_classrooms(id, academy_id) on delete cascade,
  constraint academy_lesson_progress_course_fk
    foreign key (course_id, academy_id) references public.academy_courses(id, academy_id) on delete cascade,
  constraint academy_lesson_progress_lesson_fk
    foreign key (lesson_id, academy_id) references public.academy_lessons(id, academy_id) on delete cascade,
  constraint academy_lesson_progress_contact_fk
    foreign key (contact_id, academy_id) references public.academy_contacts(id, academy_id) on delete cascade
);

create index if not exists academy_lesson_progress_contact_idx
  on public.academy_lesson_progress(academy_id, contact_id, course_id);

create table if not exists public.academy_quizzes (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  course_id uuid not null,
  lesson_id uuid,
  title text not null,
  instructions text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  passing_score numeric not null default 60 check (passing_score between 0 and 100),
  attempts_allowed integer not null default 1 check (attempts_allowed between 1 and 100),
  time_limit_seconds integer check (time_limit_seconds is null or time_limit_seconds between 30 and 86400),
  shuffle_questions boolean not null default false,
  show_answers_after boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, academy_id),
  constraint academy_quizzes_course_fk
    foreign key (course_id, academy_id) references public.academy_courses(id, academy_id) on delete cascade,
  constraint academy_quizzes_lesson_fk
    foreign key (lesson_id, academy_id) references public.academy_lessons(id, academy_id)
      on delete set null (lesson_id)
);

create index if not exists academy_quizzes_course_idx
  on public.academy_quizzes(course_id, status);

create table if not exists public.academy_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  quiz_id uuid not null,
  question_type text not null check (question_type in ('single_choice', 'multiple_choice', 'true_false', 'short_text', 'essay')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb,
  points numeric not null default 1 check (points > 0),
  position integer not null default 0 check (position >= 0),
  explanation text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, academy_id),
  constraint academy_quiz_questions_quiz_fk
    foreign key (quiz_id, academy_id) references public.academy_quizzes(id, academy_id) on delete cascade
);

create index if not exists academy_quiz_questions_quiz_position_idx
  on public.academy_quiz_questions(quiz_id, position);

create table if not exists public.academy_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  classroom_id uuid not null,
  course_id uuid not null,
  quiz_id uuid not null,
  contact_id uuid not null,
  user_id uuid references public.users(id) on delete set null,
  attempt_number integer not null check (attempt_number > 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'graded', 'expired')),
  answers jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  score numeric,
  max_score numeric,
  percentage numeric check (percentage is null or percentage between 0 and 100),
  passed boolean,
  feedback text,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  graded_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_id, contact_id, attempt_number),
  constraint academy_quiz_attempts_classroom_fk
    foreign key (classroom_id, academy_id) references public.academy_classrooms(id, academy_id) on delete cascade,
  constraint academy_quiz_attempts_course_fk
    foreign key (course_id, academy_id) references public.academy_courses(id, academy_id) on delete cascade,
  constraint academy_quiz_attempts_quiz_fk
    foreign key (quiz_id, academy_id) references public.academy_quizzes(id, academy_id) on delete cascade,
  constraint academy_quiz_attempts_contact_fk
    foreign key (contact_id, academy_id) references public.academy_contacts(id, academy_id) on delete cascade
);

create index if not exists academy_quiz_attempts_student_idx
  on public.academy_quiz_attempts(academy_id, contact_id, quiz_id, attempt_number desc);

create table if not exists public.academy_grade_categories (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  classroom_id uuid not null,
  name text not null,
  weight numeric not null default 1 check (weight > 0),
  position integer not null default 0,
  drop_lowest integer not null default 0 check (drop_lowest >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, academy_id),
  unique (classroom_id, name),
  constraint academy_grade_categories_classroom_fk
    foreign key (classroom_id, academy_id) references public.academy_classrooms(id, academy_id) on delete cascade
);

create table if not exists public.academy_rubrics (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  criteria jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, academy_id)
);

alter table public.academy_assignments
  add column if not exists course_id uuid,
  add column if not exists module_id uuid,
  add column if not exists lesson_id uuid,
  add column if not exists grade_category_id uuid,
  add column if not exists rubric_id uuid,
  add column if not exists attempts_allowed integer not null default 1,
  add column if not exists allow_late_submission boolean not null default true;

alter table public.academy_assignments
  drop constraint if exists academy_assignments_course_fk,
  add constraint academy_assignments_course_fk
    foreign key (course_id, academy_id) references public.academy_courses(id, academy_id)
      on delete set null (course_id),
  drop constraint if exists academy_assignments_module_fk,
  add constraint academy_assignments_module_fk
    foreign key (module_id, academy_id) references public.academy_course_modules(id, academy_id)
      on delete set null (module_id),
  drop constraint if exists academy_assignments_lesson_fk,
  add constraint academy_assignments_lesson_fk
    foreign key (lesson_id, academy_id) references public.academy_lessons(id, academy_id)
      on delete set null (lesson_id),
  drop constraint if exists academy_assignments_grade_category_fk,
  add constraint academy_assignments_grade_category_fk
    foreign key (grade_category_id, academy_id) references public.academy_grade_categories(id, academy_id)
      on delete set null (grade_category_id),
  drop constraint if exists academy_assignments_rubric_fk,
  add constraint academy_assignments_rubric_fk
    foreign key (rubric_id, academy_id) references public.academy_rubrics(id, academy_id)
      on delete set null (rubric_id),
  drop constraint if exists academy_assignments_attempts_allowed_check,
  add constraint academy_assignments_attempts_allowed_check check (attempts_allowed between 1 and 100);

alter table public.academy_submissions
  add column if not exists attempt_number integer not null default 1,
  add column if not exists feedback jsonb not null default '{}'::jsonb;

alter table public.academy_submissions
  drop constraint if exists academy_submissions_status_check,
  add constraint academy_submissions_status_check
    check (status in ('missing', 'submitted', 'graded', 'late', 'returned', 'resubmitted'));

alter table public.academy_classroom_memberships
  add column if not exists status text not null default 'active',
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists transferred_from_membership_id uuid references public.academy_classroom_memberships(id) on delete set null;

alter table public.academy_classroom_memberships
  drop constraint if exists academy_classroom_memberships_status_check,
  add constraint academy_classroom_memberships_status_check
    check (status in ('invited', 'active', 'paused', 'completed', 'withdrawn', 'expired', 'transferred'));

update public.academy_classroom_memberships
set started_at = coalesce(started_at, joined_at)
where status = 'active' and started_at is null;

create index if not exists academy_classroom_memberships_status_idx
  on public.academy_classroom_memberships(academy_id, classroom_id, status);

alter table public.academy_courses enable row level security;
alter table public.academy_course_modules enable row level security;
alter table public.academy_lessons enable row level security;
alter table public.academy_classroom_courses enable row level security;
alter table public.academy_lesson_progress enable row level security;
alter table public.academy_quizzes enable row level security;
alter table public.academy_quiz_questions enable row level security;
alter table public.academy_quiz_attempts enable row level security;
alter table public.academy_grade_categories enable row level security;
alter table public.academy_rubrics enable row level security;

create policy "Academy courses read by members" on public.academy_courses
  for select using (public.is_academy_member(academy_id) and status = 'published');
create policy "Academy courses manage by admins" on public.academy_courses
  for all using (public.is_academy_admin(academy_id)) with check (public.is_academy_admin(academy_id));

create policy "Academy modules read by members" on public.academy_course_modules
  for select using (public.is_academy_member(academy_id) and status = 'published');
create policy "Academy modules manage by admins" on public.academy_course_modules
  for all using (public.is_academy_admin(academy_id)) with check (public.is_academy_admin(academy_id));

create policy "Academy lessons read by members" on public.academy_lessons
  for select using (public.is_academy_member(academy_id) and status = 'published');
create policy "Academy lessons manage by admins" on public.academy_lessons
  for all using (public.is_academy_admin(academy_id)) with check (public.is_academy_admin(academy_id));

create policy "Academy classroom courses read by members" on public.academy_classroom_courses
  for select using (public.is_academy_member(academy_id));
create policy "Academy classroom courses manage by admins" on public.academy_classroom_courses
  for all using (public.is_academy_admin(academy_id)) with check (public.is_academy_admin(academy_id));

create policy "Academy lesson progress own read" on public.academy_lesson_progress
  for select using (user_id = auth.uid() or public.is_academy_admin(academy_id));
create policy "Academy lesson progress own write" on public.academy_lesson_progress
  for all using (user_id = auth.uid() or public.is_academy_admin(academy_id))
  with check (user_id = auth.uid() or public.is_academy_admin(academy_id));

create policy "Academy quizzes read by members" on public.academy_quizzes
  for select using (public.is_academy_member(academy_id) and status = 'published');
create policy "Academy quizzes manage by admins" on public.academy_quizzes
  for all using (public.is_academy_admin(academy_id)) with check (public.is_academy_admin(academy_id));

-- Correct answers are intentionally not directly readable by ordinary members.
create policy "Academy quiz questions manage by admins" on public.academy_quiz_questions
  for all using (public.is_academy_admin(academy_id)) with check (public.is_academy_admin(academy_id));

create policy "Academy quiz attempts own read" on public.academy_quiz_attempts
  for select using (user_id = auth.uid() or public.is_academy_admin(academy_id));
create policy "Academy quiz attempts own write" on public.academy_quiz_attempts
  for all using (user_id = auth.uid() or public.is_academy_admin(academy_id))
  with check (user_id = auth.uid() or public.is_academy_admin(academy_id));

create policy "Academy grade categories manage by admins" on public.academy_grade_categories
  for all using (public.is_academy_admin(academy_id)) with check (public.is_academy_admin(academy_id));
create policy "Academy rubrics manage by admins" on public.academy_rubrics
  for all using (public.is_academy_admin(academy_id)) with check (public.is_academy_admin(academy_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'academy_courses',
    'academy_course_modules',
    'academy_lessons',
    'academy_lesson_progress',
    'academy_quizzes',
    'academy_quiz_questions',
    'academy_quiz_attempts',
    'academy_grade_categories',
    'academy_rubrics'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute procedure public.handle_teacher_studio_updated_at()',
      table_name || '_updated_at',
      table_name
    );
  end loop;
end $$;
