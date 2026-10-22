-- Homework OS and paid teaching plans (docs/product/40, 41, 42).
--
-- Adds, without changing any existing Academy table:
--   * the homework funnel (first-occurrence events per assignment and learner),
--   * AI pre-mark drafts that never write a released score,
--   * a mistake bank and student corrections,
--   * trusted-homework signals,
--   * Telegram hand-in drafts and a per-learner "current centre" preference,
--   * the Schood Teaching product for independent teachers, and one capability
--     check that reads either the parent centre's tier or the teacher plan.
--
-- Billing enforcement, AI pre-marking and the parent digest all start OFF in
-- academy_learning_config, so applying this migration changes no behaviour.
-- Tracking triggers swallow their own errors: homework analytics must never
-- block a submission or a grade.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

-- ---------------------------------------------------------------------------
-- Global switches (service role only).
-- ---------------------------------------------------------------------------
create table if not exists public.academy_learning_config (
  key text primary key check (key ~ '^[a-z_.]{3,80}$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.academy_learning_config enable row level security;
revoke all on public.academy_learning_config from anon, authenticated;

insert into public.academy_learning_config(key, value) values
  ('billing.enforced', 'false'::jsonb),
  ('premark.enabled', 'false'::jsonb),
  ('digest.enabled', 'false'::jsonb),
  ('telegram_handin.enabled', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function public.academy_learning_flag(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case when jsonb_typeof(value) = 'boolean' then value::text::boolean else false end
                   from public.academy_learning_config where key = p_key), false);
$$;
revoke all on function public.academy_learning_flag(text) from public, anon, authenticated;
grant execute on function public.academy_learning_flag(text) to service_role;

-- Per-academy choices, editable by the academy owner through the edge function.
create table if not exists public.academy_homework_settings (
  academy_id uuid primary key references public.tenants(id) on delete cascade,
  premark_enabled boolean not null default true,
  digest_enabled boolean not null default true,
  telegram_handin_enabled boolean not null default true,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.academy_homework_settings enable row level security;
revoke all on public.academy_homework_settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schood Teaching: the paid plan for independent teachers.
-- Centre-owned academies are covered by their centre's tier instead (D6).
-- Prices are placeholders and the plans stay inactive until the owner sets them.
-- ---------------------------------------------------------------------------
insert into public.products (id, name, type, status, description, metadata)
values (
  '00000000-0000-4000-8000-000000000801',
  'Schood Teaching',
  'tool',
  'draft',
  'Homework OS and Courses for independent teachers.',
  jsonb_build_object('slug', 'schood-teaching', 'catalog', 'teaching_plan', 'service_family', 'academy',
                     'seeded_by', '20261024100000_academy_homework_os')
)
on conflict (id) do nothing;

insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata) values
  ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000801', 'Teacher', 0, 'UZS', 30, false,
   jsonb_build_object('slug', 'teaching-teacher-monthly', 'teaching_tier', 'teacher', 'placeholder_price', true,
     'features', jsonb_build_array('Telegram homework hand-in', 'Review queue', 'Homework funnel', 'Weekly parent summary', 'Publish courses'),
     'seeded_by', '20261024100000_academy_homework_os')),
  ('00000000-0000-4000-8000-000000000812', '00000000-0000-4000-8000-000000000801', 'Teacher Pro', 0, 'UZS', 30, false,
   jsonb_build_object('slug', 'teaching-teacher-pro-monthly', 'teaching_tier', 'teacher_pro', 'placeholder_price', true,
     'features', jsonb_build_array('Everything in Teacher', 'AI pre-marking', 'Mistake bank', 'Trusted-homework signals'),
     'seeded_by', '20261024100000_academy_homework_os'))
on conflict (id) do nothing;

-- One answer to "what may this academy use": centre tier for centre-owned
-- academies, the Schood Teaching entitlement for everyone else, the better of
-- the two when both exist. While billing is not enforced everything is allowed.
create or replace function public.academy_learning_plan(p_academy uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t public.tenants;
  center_text text;
  center_tier text;
  teacher_tier text;
  enforced boolean := public.academy_learning_flag('billing.enforced');
  paid_homework boolean;
  paid_ai boolean;
  teacher_ends timestamptz;
begin
  select * into t from public.tenants where id = p_academy;
  if not found then return null; end if;

  center_text := t.metadata->>'parent_center_id';
  if center_text ~* '^[0-9a-f-]{36}$' then
    select cp.package_tier into center_tier
    from public.partner_center_profiles cp
    where cp.tenant_id = center_text::uuid and cp.status = 'active';
  end if;

  select coalesce(pl.metadata->>'teaching_tier', e.value->'limits'->>'teaching_tier', 'teacher'), e.ends_at
    into teacher_tier, teacher_ends
  from public.entitlements e
  left join public.plans pl on pl.id::text = e.value->>'plan_id'
  where e.tenant_id = p_academy
    and e.resource_type = 'product'
    and e.resource_id = '00000000-0000-4000-8000-000000000801'
    and e.is_active
    and (e.starts_at is null or e.starts_at <= now())
    and (e.ends_at is null or e.ends_at > now())
  order by (coalesce(pl.metadata->>'teaching_tier', e.value->'limits'->>'teaching_tier') = 'teacher_pro') desc nulls last,
           e.ends_at desc nulls first
  limit 1;

  paid_homework := coalesce(center_tier in ('growth', 'premium', 'exclusive'), false)
                   or coalesce(teacher_tier in ('teacher', 'teacher_pro'), false);
  paid_ai := coalesce(center_tier in ('premium', 'exclusive'), false)
             or coalesce(teacher_tier = 'teacher_pro', false);

  return jsonb_build_object(
    'academy_id', p_academy,
    'billing_enforced', enforced,
    'audience', case when center_text is not null then 'center' else 'independent' end,
    'center_tier', center_tier,
    'teacher_tier', teacher_tier,
    'teacher_plan_ends_at', teacher_ends,
    'paid', jsonb_build_object('homework', paid_homework, 'courses', paid_homework, 'homework_ai', paid_ai),
    'allowed', jsonb_build_object(
      'homework', (not enforced) or paid_homework,
      'courses', (not enforced) or paid_homework,
      'homework_ai', (not enforced) or paid_ai)
  );
end;
$$;
revoke all on function public.academy_learning_plan(uuid) from public, anon, authenticated;
grant execute on function public.academy_learning_plan(uuid) to service_role;

create or replace function public.academy_learning_allows(p_academy uuid, p_capability text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((public.academy_learning_plan(p_academy)->'allowed'->>p_capability)::boolean, false);
$$;
revoke all on function public.academy_learning_allows(uuid, text) from public, anon, authenticated;
grant execute on function public.academy_learning_allows(uuid, text) to service_role;

-- Publishing a course is a paid capability once billing is enforced. Drafts
-- stay free so a teacher can build before paying.
create or replace function public.academy_courses_publish_gate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and not public.academy_learning_allows(new.academy_id, 'courses') then
    raise exception using errcode = '42501',
      message = 'Publishing courses needs an active Schood Teaching plan or centre tier';
  end if;
  return new;
end;
$$;
revoke all on function public.academy_courses_publish_gate() from public, anon, authenticated;
drop trigger if exists academy_courses_publish_gate on public.academy_courses;
create trigger academy_courses_publish_gate before insert or update of status on public.academy_courses
  for each row execute function public.academy_courses_publish_gate();

-- ---------------------------------------------------------------------------
-- Funnel: one row per (assignment, learner, step), first occurrence wins.
-- ---------------------------------------------------------------------------
create table if not exists public.academy_homework_events (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid not null references public.academy_assignments(id) on delete cascade,
  classroom_id uuid not null references public.academy_classrooms(id) on delete cascade,
  contact_id uuid not null references public.academy_contacts(id) on delete cascade,
  event text not null check (event in ('opened', 'submitted', 'premarked', 'reviewed', 'returned', 'corrected', 'mastered')),
  source text not null default 'web' check (length(source) between 1 and 40),
  actor_user_id uuid references public.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (assignment_id, contact_id, event)
);
create index if not exists academy_homework_events_academy_idx on public.academy_homework_events(academy_id, event, occurred_at desc);
create index if not exists academy_homework_events_classroom_idx on public.academy_homework_events(classroom_id, occurred_at desc);
alter table public.academy_homework_events enable row level security;
revoke all on public.academy_homework_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- AI pre-mark drafts. A draft is advice for the teacher; the released score
-- is only ever written by the existing academy_grading_command.
-- ---------------------------------------------------------------------------
create table if not exists public.academy_homework_ai_marks (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  submission_id uuid not null references public.academy_submissions(id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1),
  assignment_id uuid not null references public.academy_assignments(id) on delete cascade,
  classroom_id uuid not null references public.academy_classrooms(id) on delete cascade,
  contact_id uuid not null references public.academy_contacts(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'ready', 'failed', 'skipped', 'superseded')),
  response_kind text check (response_kind in ('text', 'image', 'audio', 'file', 'mixed')),
  suggested_score numeric check (suggested_score is null or suggested_score >= 0),
  max_score numeric check (max_score is null or max_score > 0),
  rubric_scores jsonb not null default '{}'::jsonb check (jsonb_typeof(rubric_scores) = 'object'),
  summary text check (summary is null or length(summary) <= 4000),
  strengths jsonb not null default '[]'::jsonb check (jsonb_typeof(strengths) = 'array'),
  improvements jsonb not null default '[]'::jsonb check (jsonb_typeof(improvements) = 'array'),
  mistakes jsonb not null default '[]'::jsonb check (jsonb_typeof(mistakes) = 'array'),
  confidence numeric check (confidence is null or confidence between 0 and 1),
  model text,
  prompt_version text,
  skip_reason text,
  error text,
  tries integer not null default 0 check (tries >= 0),
  locked_at timestamptz,
  teacher_score numeric,
  teacher_decision text check (teacher_decision in ('approved', 'edited', 'returned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (submission_id, attempt_number)
);
create index if not exists academy_homework_ai_marks_queue_idx
  on public.academy_homework_ai_marks(status, created_at) where status in ('queued', 'running');
alter table public.academy_homework_ai_marks enable row level security;
revoke all on public.academy_homework_ai_marks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Mistake bank and corrections.
-- ---------------------------------------------------------------------------
create table if not exists public.academy_homework_mistakes (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.academy_contacts(id) on delete cascade,
  classroom_id uuid not null references public.academy_classrooms(id) on delete cascade,
  assignment_id uuid not null references public.academy_assignments(id) on delete cascade,
  submission_id uuid not null references public.academy_submissions(id) on delete cascade,
  tag text not null check (tag ~ '^[a-z0-9_.:-]{2,80}$'),
  excerpt text check (excerpt is null or length(excerpt) <= 600),
  correction text check (correction is null or length(correction) <= 600),
  explanation text check (explanation is null or length(explanation) <= 1200),
  status text not null default 'open' check (status in ('open', 'corrected', 'mastered', 'dismissed')),
  source text not null default 'teacher' check (source in ('ai', 'teacher')),
  created_by uuid references public.users(id) on delete set null,
  resolved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists academy_homework_mistakes_contact_idx on public.academy_homework_mistakes(academy_id, contact_id, status);
create index if not exists academy_homework_mistakes_submission_idx on public.academy_homework_mistakes(submission_id);
alter table public.academy_homework_mistakes enable row level security;
revoke all on public.academy_homework_mistakes from anon, authenticated;

create table if not exists public.academy_homework_corrections (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  submission_id uuid not null references public.academy_submissions(id) on delete cascade,
  assignment_id uuid not null references public.academy_assignments(id) on delete cascade,
  classroom_id uuid not null references public.academy_classrooms(id) on delete cascade,
  contact_id uuid not null references public.academy_contacts(id) on delete cascade,
  content text check (content is null or length(content) <= 10000),
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array'),
  source text not null default 'telegram_bot' check (length(source) between 1 and 40),
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'needs_work')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (content is not null or jsonb_array_length(media) > 0)
);
create index if not exists academy_homework_corrections_open_idx
  on public.academy_homework_corrections(academy_id, status, created_at) where status = 'submitted';
alter table public.academy_homework_corrections enable row level security;
revoke all on public.academy_homework_corrections from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trusted homework: signals for the teacher, never automatic penalties.
-- ---------------------------------------------------------------------------
create table if not exists public.academy_homework_integrity_signals (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  submission_id uuid not null references public.academy_submissions(id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1),
  signal text not null check (signal in ('duplicate_media', 'similar_text', 'untimed_source', 'large_paste', 'fast_typing')),
  severity text not null default 'info' check (severity in ('info', 'review')),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now(),
  unique (submission_id, attempt_number, signal)
);
alter table public.academy_homework_integrity_signals enable row level security;
revoke all on public.academy_homework_integrity_signals from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Telegram: which centre a learner is talking to, and hand-ins awaiting a tap.
-- ---------------------------------------------------------------------------
create table if not exists public.telegram_student_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  active_academy_id uuid references public.tenants(id) on delete set null,
  focus_assignment_id uuid references public.academy_assignments(id) on delete set null,
  focus_set_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.telegram_student_preferences enable row level security;
revoke all on public.telegram_student_preferences from anon, authenticated;

create table if not exists public.academy_telegram_handin_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  chat_id text not null check (chat_id ~ '^-?[0-9]{1,20}$'),
  media_group_id text check (media_group_id is null or length(media_group_id) <= 64),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  text_content text check (text_content is null or length(text_content) <= 10000),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  prompt_sent boolean not null default false,
  status text not null default 'open' check (status in ('open', 'filed', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  consumed_at timestamptz
);
create unique index if not exists academy_telegram_handin_drafts_group_uidx
  on public.academy_telegram_handin_drafts(user_id, media_group_id) where media_group_id is not null;
create index if not exists academy_telegram_handin_drafts_open_idx
  on public.academy_telegram_handin_drafts(user_id, status, created_at desc);
alter table public.academy_telegram_handin_drafts enable row level security;
revoke all on public.academy_telegram_handin_drafts from anon, authenticated;

-- Append one album item atomically (Telegram delivers album photos as separate,
-- possibly concurrent updates).
create or replace function public.academy_telegram_draft_append(
  p_user uuid, p_chat text, p_media_group text, p_item jsonb, p_text text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.academy_telegram_handin_drafts; created boolean := false;
begin
  if p_media_group is null then
    insert into public.academy_telegram_handin_drafts(user_id, chat_id, items, text_content)
    values (p_user, p_chat, case when p_item is null then '[]'::jsonb else jsonb_build_array(p_item) end, nullif(p_text, ''))
    returning * into d;
    return jsonb_build_object('draft', to_jsonb(d), 'created', true);
  end if;
  insert into public.academy_telegram_handin_drafts(user_id, chat_id, media_group_id, items, text_content)
  values (p_user, p_chat, p_media_group, '[]'::jsonb, null)
  on conflict (user_id, media_group_id) where media_group_id is not null do nothing
  returning true into created;
  update public.academy_telegram_handin_drafts
     set items = case when p_item is null or jsonb_array_length(items) >= 10 then items else items || jsonb_build_array(p_item) end,
         text_content = coalesce(text_content, nullif(p_text, ''))
   where user_id = p_user and media_group_id = p_media_group
  returning * into d;
  return jsonb_build_object('draft', to_jsonb(d), 'created', coalesce(created, false));
end;
$$;
revoke all on function public.academy_telegram_draft_append(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.academy_telegram_draft_append(uuid, text, text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- Tracking triggers on existing tables. Errors are reported as warnings only.
-- ---------------------------------------------------------------------------
create or replace function public.academy_homework_track_submission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  attempt integer := greatest(coalesce(new.attempt_number, 1), 1);
  source_value text := left(coalesce(nullif(new.metadata->>'source', ''), 'web'), 40);
begin
  begin
    if new.submitted_at is not null and new.status in ('submitted', 'late', 'resubmitted')
       and (tg_op = 'INSERT' or old.submitted_at is distinct from new.submitted_at
            or old.attempt_number is distinct from new.attempt_number) then
      insert into public.academy_homework_events(academy_id, assignment_id, classroom_id, contact_id, event, source, occurred_at, metadata)
      values (new.academy_id, new.assignment_id, new.classroom_id, new.contact_id, 'submitted', source_value, new.submitted_at,
              jsonb_build_object('attempt_number', attempt, 'status', new.status))
      on conflict (assignment_id, contact_id, event) do nothing;

      update public.academy_homework_ai_marks
         set status = 'superseded', updated_at = now()
       where submission_id = new.id and attempt_number <> attempt and status in ('queued', 'running', 'ready', 'failed');

      if public.academy_learning_flag('premark.enabled')
         and coalesce((select s.premark_enabled from public.academy_homework_settings s where s.academy_id = new.academy_id), true)
         and public.academy_learning_allows(new.academy_id, 'homework_ai') then
        insert into public.academy_homework_ai_marks(academy_id, submission_id, attempt_number, assignment_id, classroom_id, contact_id, max_score)
        values (new.academy_id, new.id, attempt, new.assignment_id, new.classroom_id, new.contact_id, new.max_score)
        on conflict (submission_id, attempt_number) do nothing;
      end if;
    end if;

    if new.graded_at is not null and new.score is not null
       and (tg_op = 'INSERT' or old.graded_at is distinct from new.graded_at) then
      insert into public.academy_homework_events(academy_id, assignment_id, classroom_id, contact_id, event, source, actor_user_id, occurred_at, metadata)
      values (new.academy_id, new.assignment_id, new.classroom_id, new.contact_id, 'reviewed', 'staff', new.graded_by, new.graded_at,
              jsonb_build_object('score', new.score, 'max_score', new.max_score, 'attempt_number', attempt))
      on conflict (assignment_id, contact_id, event) do nothing;
    end if;
  exception when others then
    raise warning 'academy homework tracking skipped for submission %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.academy_homework_track_submission() from public, anon, authenticated;
drop trigger if exists academy_homework_track_submission on public.academy_submissions;
create trigger academy_homework_track_submission
  after insert or update of submitted_at, attempt_number, graded_at, status on public.academy_submissions
  for each row execute function public.academy_homework_track_submission();

-- ---------------------------------------------------------------------------
-- Module unlock-by-check (V-CRS-F5). academy_course_modules.unlock_rule:
--   {}                                         open
--   {"type":"quiz_pass","quiz_id":"…","min_percent":70}   a passed attempt
--   {"type":"previous_module"}                 every published lesson of the
--                                              previous module completed
-- ---------------------------------------------------------------------------
create or replace function public.academy_module_unlocked(
  p_academy uuid, p_classroom uuid, p_contact uuid, p_module uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare m public.academy_course_modules; prev public.academy_course_modules; rule_type text; quiz uuid; min_percent numeric;
begin
  select * into m from public.academy_course_modules where academy_id = p_academy and id = p_module;
  if not found then return true; end if;
  rule_type := coalesce(m.unlock_rule->>'type', 'none');
  if rule_type = 'quiz_pass' then
    if coalesce(m.unlock_rule->>'quiz_id', '') !~* '^[0-9a-f-]{36}$' then return true; end if;
    quiz := (m.unlock_rule->>'quiz_id')::uuid;
    min_percent := nullif(m.unlock_rule->>'min_percent', '')::numeric;
    return exists (
      select 1 from public.academy_quiz_attempts a
      where a.academy_id = p_academy and a.classroom_id = p_classroom and a.contact_id = p_contact and a.quiz_id = quiz
        and a.status in ('submitted', 'graded')
        and (case when min_percent is null then coalesce(a.passed, false) else coalesce(a.percentage, 0) >= min_percent end));
  elsif rule_type = 'previous_module' then
    select * into prev from public.academy_course_modules
    where academy_id = p_academy and course_id = m.course_id and status = 'published' and position < m.position
    order by position desc limit 1;
    if not found then return true; end if;
    return not exists (
      select 1 from public.academy_lessons l
      where l.academy_id = p_academy and l.module_id = prev.id and l.status = 'published'
        and not exists (
          select 1 from public.academy_lesson_progress p
          where p.academy_id = p_academy and p.classroom_id = p_classroom and p.contact_id = p_contact
            and p.lesson_id = l.id and p.status = 'completed'));
  end if;
  return true;
end;
$$;
revoke all on function public.academy_module_unlocked(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.academy_module_unlocked(uuid, uuid, uuid, uuid) to service_role;

-- Server-side enforcement for lesson progress. Modules without an
-- unlock_rule (the default '{}') are always open, so existing courses are
-- unaffected until a teacher sets a rule.
create or replace function public.academy_lesson_progress_unlock_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare module_value uuid;
begin
  select l.module_id into module_value from public.academy_lessons l where l.academy_id = new.academy_id and l.id = new.lesson_id;
  if module_value is not null and not public.academy_module_unlocked(new.academy_id, new.classroom_id, new.contact_id, module_value) then
    raise exception using errcode = 'P0001', message = 'Pass the module check before starting this module';
  end if;
  return new;
end;
$$;
revoke all on function public.academy_lesson_progress_unlock_gate() from public, anon, authenticated;
drop trigger if exists academy_lesson_progress_unlock_gate on public.academy_lesson_progress;
create trigger academy_lesson_progress_unlock_gate before insert or update of status on public.academy_lesson_progress
  for each row when (new.status in ('in_progress', 'completed'))
  execute function public.academy_lesson_progress_unlock_gate();

create or replace function public.academy_quiz_attempt_unlock_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare module_value uuid;
begin
  select l.module_id into module_value
  from public.academy_quizzes q join public.academy_lessons l on l.academy_id = q.academy_id and l.id = q.lesson_id
  where q.academy_id = new.academy_id and q.id = new.quiz_id;
  if module_value is not null and not public.academy_module_unlocked(new.academy_id, new.classroom_id, new.contact_id, module_value) then
    raise exception using errcode = 'P0001', message = 'Pass the module check before starting this quiz';
  end if;
  return new;
end;
$$;
revoke all on function public.academy_quiz_attempt_unlock_gate() from public, anon, authenticated;
drop trigger if exists academy_quiz_attempt_unlock_gate on public.academy_quiz_attempts;
create trigger academy_quiz_attempt_unlock_gate before insert on public.academy_quiz_attempts
  for each row execute function public.academy_quiz_attempt_unlock_gate();

-- ---------------------------------------------------------------------------
-- Staff scope for Homework OS reads, derived from the same current-authority
-- rows that academy_grading_command checks. Returns which classrooms and
-- learners the actor may see for one capability.
-- ---------------------------------------------------------------------------
create or replace function public.academy_homework_staff_scope(p_academy uuid, p_actor uuid, p_capability text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  auths jsonb := public.academy_current_authorities(p_academy, p_actor);
  a jsonb;
  academy_wide boolean := false;
  classes uuid[] := '{}';
  branches uuid[] := '{}';
  contacts uuid[] := '{}';
  roles text[] := '{}';
begin
  for a in select value from jsonb_array_elements(coalesce(auths, '[]'::jsonb)) loop
    roles := roles || (a->>'role');
    if not public.academy_command_role_has(a->>'role', p_capability) then continue; end if;
    if a->>'expires_at' is not null and (a->>'expires_at')::timestamptz <= clock_timestamp() then continue; end if;
    if a->>'scope_type' = 'academy' then
      academy_wide := true;
    elsif a->>'scope_type' = 'branches' then
      branches := branches || array(select v::uuid from jsonb_array_elements_text(coalesce(a->'scope_ids', '[]')) v);
    elsif a->>'scope_type' = 'classrooms' then
      classes := classes || array(select v::uuid from jsonb_array_elements_text(coalesce(a->'scope_ids', '[]')) v);
    elsif a->>'scope_type' = 'students' then
      contacts := contacts || array(select v::uuid from jsonb_array_elements_text(coalesce(a->'scope_ids', '[]')) v);
    end if;
  end loop;
  if not academy_wide and cardinality(branches) > 0 then
    classes := classes || array(select c.id from public.academy_classrooms c where c.academy_id = p_academy and c.branch_id = any(branches));
  end if;
  return jsonb_build_object(
    'academy_wide', academy_wide,
    'classroom_ids', to_jsonb(array(select distinct x from unnest(classes) x)),
    'contact_ids', to_jsonb(array(select distinct x from unnest(contacts) x)),
    'roles', to_jsonb(array(select distinct x from unnest(roles) x)),
    'allowed', academy_wide or cardinality(classes) > 0 or cardinality(contacts) > 0);
end;
$$;
revoke all on function public.academy_homework_staff_scope(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.academy_homework_staff_scope(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Funnel read model for the owner dashboard (called after the edge function
-- has checked the caller's classroom scope).
-- ---------------------------------------------------------------------------
create or replace function public.academy_homework_funnel(
  p_academy uuid, p_from timestamptz, p_to timestamptz, p_classrooms uuid[] default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with scoped_assignments as (
    select a.id, a.classroom_id, a.due_at
    from public.academy_assignments a
    where a.academy_id = p_academy and a.status in ('active', 'archived')
      and coalesce(a.due_at, a.released_at, a.created_at) >= p_from
      and coalesce(a.due_at, a.released_at, a.created_at) < p_to
      and (p_classrooms is null or a.classroom_id = any(p_classrooms))
  ),
  assigned as (
    select sa.classroom_id, sa.id as assignment_id, m.contact_id, sa.due_at
    from scoped_assignments sa
    join public.academy_classroom_memberships m
      on m.academy_id = p_academy and m.classroom_id = sa.classroom_id and m.role = 'student'
     and m.status in ('active', 'paused', 'completed')
  ),
  steps as (
    select x.classroom_id,
      count(*) as assigned,
      count(*) filter (where e_open.id is not null) as opened,
      count(*) filter (where e_sub.id is not null) as submitted,
      count(*) filter (where e_sub.id is not null and (x.due_at is null or e_sub.occurred_at <= x.due_at)) as on_time,
      count(*) filter (where e_rev.id is not null) as reviewed,
      count(*) filter (where e_ret.id is not null) as returned,
      count(*) filter (where e_cor.id is not null) as corrected,
      count(*) filter (where e_mas.id is not null) as mastered,
      percentile_cont(0.5) within group (order by extract(epoch from (e_rev.occurred_at - e_sub.occurred_at)) / 3600.0)
        filter (where e_rev.id is not null and e_sub.id is not null and e_rev.occurred_at >= e_sub.occurred_at) as median_review_hours
    from assigned x
    left join public.academy_homework_events e_open on e_open.assignment_id = x.assignment_id and e_open.contact_id = x.contact_id and e_open.event = 'opened'
    left join public.academy_homework_events e_sub on e_sub.assignment_id = x.assignment_id and e_sub.contact_id = x.contact_id and e_sub.event = 'submitted'
    left join public.academy_homework_events e_rev on e_rev.assignment_id = x.assignment_id and e_rev.contact_id = x.contact_id and e_rev.event = 'reviewed'
    left join public.academy_homework_events e_ret on e_ret.assignment_id = x.assignment_id and e_ret.contact_id = x.contact_id and e_ret.event = 'returned'
    left join public.academy_homework_events e_cor on e_cor.assignment_id = x.assignment_id and e_cor.contact_id = x.contact_id and e_cor.event = 'corrected'
    left join public.academy_homework_events e_mas on e_mas.assignment_id = x.assignment_id and e_mas.contact_id = x.contact_id and e_mas.event = 'mastered'
    group by x.classroom_id
  ),
  reviewers as (
    select e.actor_user_id, count(*) as reviewed,
      percentile_cont(0.5) within group (order by extract(epoch from (e.occurred_at - s.occurred_at)) / 3600.0)
        filter (where e.occurred_at >= s.occurred_at) as median_review_hours
    from public.academy_homework_events e
    join scoped_assignments sa on sa.id = e.assignment_id
    left join public.academy_homework_events s on s.assignment_id = e.assignment_id and s.contact_id = e.contact_id and s.event = 'submitted'
    where e.academy_id = p_academy and e.event = 'reviewed' and e.actor_user_id is not null
    group by e.actor_user_id
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'assignments', (select count(*) from scoped_assignments),
    'classrooms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'classroom_id', s.classroom_id, 'classroom_name', c.name, 'branch_id', c.branch_id,
        'assigned', s.assigned, 'opened', s.opened, 'submitted', s.submitted, 'on_time', s.on_time,
        'reviewed', s.reviewed, 'returned', s.returned, 'corrected', s.corrected, 'mastered', s.mastered,
        'median_review_hours', round(s.median_review_hours::numeric, 1)) order by c.name)
      from steps s join public.academy_classrooms c on c.id = s.classroom_id), '[]'::jsonb),
    'reviewers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', r.actor_user_id, 'name', coalesce(u.full_name, u.email, 'Staff'),
        'reviewed', r.reviewed, 'median_review_hours', round(r.median_review_hours::numeric, 1)) order by r.reviewed desc)
      from reviewers r left join public.users u on u.id = r.actor_user_id), '[]'::jsonb)
  );
$$;
revoke all on function public.academy_homework_funnel(uuid, timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.academy_homework_funnel(uuid, timestamptz, timestamptz, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- Weekly parent summary. Rows go into the existing academy_notifications
-- outbox as guardian notifications; the existing dispatcher re-checks consent,
-- visibility, verified Telegram and quiet hours before anything is sent.
-- ---------------------------------------------------------------------------
create or replace function public.academy_homework_queue_guardian_digest(p_week_start date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  week_start date := coalesce(p_week_start, (date_trunc('week', now() at time zone 'Asia/Tashkent'))::date);
  window_from timestamptz := (week_start::timestamp at time zone 'Asia/Tashkent');
  window_to timestamptz := ((week_start + 7)::timestamp at time zone 'Asia/Tashkent');
  queued integer := 0;
  r record;
  body_text text;
begin
  if not public.academy_learning_flag('digest.enabled') then return 0; end if;
  for r in
    select rel.id as relationship_id, rel.academy_id, rel.contact_id, rel.guardian_id,
           trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as student_name,
           coalesce(t.name, 'Academy') as academy_name, coalesce(g.locale, 'uz') as locale
    from public.academy_student_guardian_relationships rel
    join public.academy_guardians g on g.academy_id = rel.academy_id and g.id = rel.guardian_id and g.status = 'verified'
    join public.academy_contacts c on c.academy_id = rel.academy_id and c.id = rel.contact_id and c.status in ('active', 'trial', 'paused')
    join public.tenants t on t.id = rel.academy_id
    left join public.academy_homework_settings hs on hs.academy_id = rel.academy_id
    where rel.status = 'active' and rel.consent_status = 'granted'
      and (rel.consent_expires_at is null or rel.consent_expires_at > now())
      and rel.can_view_homework and rel.can_view_progress_reports
      and coalesce(hs.digest_enabled, true)
      and public.academy_learning_allows(rel.academy_id, 'homework')
  loop
    with due as (
      select a.id, a.due_at, s.status, s.score, s.max_score, s.submitted_at
      from public.academy_assignments a
      join public.academy_classroom_memberships m on m.academy_id = a.academy_id and m.classroom_id = a.classroom_id
        and m.contact_id = r.contact_id and m.role = 'student' and m.status in ('active', 'paused', 'completed')
      left join public.academy_submissions s on s.assignment_id = a.id and s.contact_id = r.contact_id
      where a.academy_id = r.academy_id and a.status = 'active' and a.due_at >= window_from and a.due_at < window_to
    ), stats as (
      select count(*) as total,
        count(*) filter (where submitted_at is not null) as done,
        count(*) filter (where submitted_at is null and due_at < now()) as missed,
        round(avg(case when score is not null and max_score > 0 then score * 100.0 / max_score end)) as avg_percent
      from due
    ), mistakes as (
      select count(*) filter (where status = 'open') as open_count,
             count(*) filter (where status in ('corrected', 'mastered') and resolved_at >= window_from) as fixed_count
      from public.academy_homework_mistakes where academy_id = r.academy_id and contact_id = r.contact_id
    )
    select case r.locale
      when 'ru' then format(E'%s: домашние задания за неделю\nСдано: %s из %s\nПропущено: %s%s\nОшибок исправлено: %s, осталось: %s',
        nullif(r.student_name, ''), s.done, s.total, s.missed,
        case when s.avg_percent is null then '' else format(E'\nСредний балл: %s%%', s.avg_percent) end, mi.fixed_count, mi.open_count)
      when 'en' then format(E'%s: homework this week\nHanded in: %s of %s\nMissed: %s%s\nMistakes fixed: %s, still open: %s',
        nullif(r.student_name, ''), s.done, s.total, s.missed,
        case when s.avg_percent is null then '' else format(E'\nAverage score: %s%%', s.avg_percent) end, mi.fixed_count, mi.open_count)
      else format(E'%s: haftalik uy vazifalari\nTopshirildi: %s / %s\nO''tkazib yuborildi: %s%s\nTuzatilgan xatolar: %s, qolgan: %s',
        nullif(r.student_name, ''), s.done, s.total, s.missed,
        case when s.avg_percent is null then '' else format(E'\nO''rtacha ball: %s%%', s.avg_percent) end, mi.fixed_count, mi.open_count)
      end
      into body_text
    from stats s, mistakes mi
    where s.total > 0;

    if body_text is null then continue; end if;
    insert into public.academy_notifications(academy_id, contact_id, guardian_id, relationship_id, event_key, dedupe_key,
      channel, type, title, body, status, scheduled_at, category, audience_kind, bot_kind, metadata)
    values (r.academy_id, r.contact_id, r.guardian_id, r.relationship_id, 'progress_report_ready',
      'homework_weekly:' || r.relationship_id || ':' || week_start, 'telegram', 'homework_weekly', r.academy_name, body_text,
      'queued', now(), 'academic_required', 'guardian_private', 'academy_staff',
      jsonb_build_object('week_start', week_start, 'source', 'homework_os'))
    on conflict (academy_id, dedupe_key) where dedupe_key is not null do nothing;
    if found then queued := queued + 1; end if;
    body_text := null;
  end loop;
  return queued;
end;
$$;
revoke all on function public.academy_homework_queue_guardian_digest(date) from public, anon, authenticated;
grant execute on function public.academy_homework_queue_guardian_digest(date) to service_role;

-- ---------------------------------------------------------------------------
-- Scheduling: the AI pre-mark sweep calls the edge function; the weekly
-- digest is queued in SQL and delivered by the existing academy dispatcher.
-- ---------------------------------------------------------------------------
insert into public.internal_runtime_secrets (key, secret)
values ('academy_learning_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create or replace function public.invoke_academy_learning(p_cycle text)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_secret text; v_request_id bigint;
begin
  if p_cycle = 'premark' and not public.academy_learning_flag('premark.enabled') then return null; end if;
  if p_cycle = 'premark' and not exists (select 1 from public.academy_homework_ai_marks where status = 'queued') then return null; end if;
  select s.secret into v_secret from public.internal_runtime_secrets s where s.key = 'academy_learning_secret' limit 1;
  if v_secret is null or length(trim(v_secret)) < 32 then
    raise warning 'academy learning % skipped: worker secret is missing', p_cycle;
    return null;
  end if;
  select net.http_post(
    url := 'https://bbjawctnqrufvnesdsel.supabase.co/functions/v1/academy-learning',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret),
    body := jsonb_build_object('action', 'worker', 'cycle', p_cycle)
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.invoke_academy_learning(text) from public, anon, authenticated;

do $$
declare v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname in ('academy-learning-premark-v1', 'academy-homework-digest-v1') loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule('academy-learning-premark-v1', '*/2 * * * *',
    $cron$select public.invoke_academy_learning('premark');$cron$);
  -- Sunday 14:00 UTC is 19:00 in Tashkent.
  perform cron.schedule('academy-homework-digest-v1', '0 14 * * 0',
    $cron$select public.academy_homework_queue_guardian_digest();$cron$);
exception
  when undefined_table then
    raise notice 'pg_cron is unavailable in this environment; homework jobs not scheduled';
end
$$;
