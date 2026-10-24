-- Course version pinning (docs/product/42 §12).
--
-- Publishing a course stores an immutable snapshot of what learners see:
-- published modules (with unlock rules), lessons, quizzes and their questions.
-- A classroom run (academy_classroom_courses) records the version it runs, so
-- later edits to the live course never change a group that is already running
-- it. Staff move a group to the newest version explicitly.
--
-- Backward compatible: runs that exist before this migration keep
-- version_mode 'live' and read the live rows exactly as before. Runs created
-- afterwards default to 'pinned' and are given the latest version on insert
-- (or the first version, once a draft course is published).

create table if not exists public.academy_course_versions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  course_id uuid not null,
  version integer not null check (version >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  checksum text not null,
  module_count integer not null default 0 check (module_count >= 0),
  lesson_count integer not null default 0 check (lesson_count >= 0),
  quiz_count integer not null default 0 check (quiz_count >= 0),
  published_by uuid references public.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (course_id, version),
  unique (id, academy_id),
  unique (id, course_id, academy_id),
  constraint academy_course_versions_course_fk
    foreign key (course_id, academy_id) references public.academy_courses(id, academy_id) on delete cascade
);
create index if not exists academy_course_versions_latest_idx
  on public.academy_course_versions(academy_id, course_id, version desc);
-- Snapshots hold correct answers, so only the service role reads them.
alter table public.academy_course_versions enable row level security;
revoke all on public.academy_course_versions from anon, authenticated;

-- Existing runs are filled with 'live'; the default then switches so every
-- run created from now on is pinned.
alter table public.academy_classroom_courses
  add column if not exists version_mode text not null default 'live',
  add column if not exists course_version_id uuid,
  add column if not exists version_pinned_at timestamptz,
  add column if not exists version_pinned_by uuid references public.users(id) on delete set null;
alter table public.academy_classroom_courses alter column version_mode set default 'pinned';
alter table public.academy_classroom_courses
  drop constraint if exists academy_classroom_courses_version_mode_check,
  add constraint academy_classroom_courses_version_mode_check check (version_mode in ('live', 'pinned')),
  drop constraint if exists academy_classroom_courses_version_fk,
  add constraint academy_classroom_courses_version_fk
    foreign key (course_version_id, course_id, academy_id)
    references public.academy_course_versions(id, course_id, academy_id) on delete set null (course_version_id);
create index if not exists academy_classroom_courses_version_idx
  on public.academy_classroom_courses(course_version_id) where course_version_id is not null;

-- ---------------------------------------------------------------------------
-- Snapshot: the same rows the learner curriculum shows for a live course.
-- ---------------------------------------------------------------------------
create or replace function public.academy_course_snapshot(p_academy uuid, p_course uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with quizzes as (
    select q.* from public.academy_quizzes q
    where q.academy_id = p_academy and q.course_id = p_course and q.status = 'published'
  )
  select jsonb_build_object(
    'course', (select jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'description', c.description,
                 'level', c.level, 'estimated_minutes', c.estimated_minutes, 'metadata', c.metadata)
               from public.academy_courses c where c.academy_id = p_academy and c.id = p_course),
    'modules', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'description', m.description,
                 'position', m.position, 'unlock_rule', m.unlock_rule, 'metadata', m.metadata) order by m.position, m.created_at, m.id)
               from public.academy_course_modules m
               where m.academy_id = p_academy and m.course_id = p_course and m.status = 'published'), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'module_id', l.module_id,
                 'prerequisite_lesson_id', l.prerequisite_lesson_id, 'title', l.title, 'summary', l.summary, 'content', l.content,
                 'position', l.position, 'estimated_minutes', l.estimated_minutes, 'available_from', l.available_from,
                 'completion_rule', l.completion_rule, 'metadata', l.metadata) order by l.position, l.created_at, l.id)
               from public.academy_lessons l
               where l.academy_id = p_academy and l.course_id = p_course and l.status = 'published'), '[]'::jsonb),
    'quizzes', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'lesson_id', q.lesson_id, 'title', q.title,
                 'instructions', q.instructions, 'passing_score', q.passing_score, 'attempts_allowed', q.attempts_allowed,
                 'time_limit_seconds', q.time_limit_seconds, 'shuffle_questions', q.shuffle_questions,
                 'show_answers_after', q.show_answers_after, 'metadata', q.metadata) order by q.created_at, q.id)
               from quizzes q), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'quiz_id', x.quiz_id, 'question_type', x.question_type,
                 'prompt', x.prompt, 'options', x.options, 'correct_answer', x.correct_answer, 'points', x.points,
                 'position', x.position, 'explanation', x.explanation, 'metadata', x.metadata) order by x.quiz_id, x.position, x.id)
               from public.academy_quiz_questions x join quizzes q on q.id = x.quiz_id
               where x.academy_id = p_academy), '[]'::jsonb)
  );
$$;
revoke all on function public.academy_course_snapshot(uuid, uuid) from public, anon, authenticated;

-- Stores a new version when the published content changed since the last one,
-- otherwise returns the latest. Runs that were waiting for a first version
-- (pinned runs of a course that was still a draft) start on it.
create or replace function public.academy_course_publish_version(p_academy uuid, p_course uuid, p_actor uuid default null)
returns public.academy_course_versions language plpgsql security definer set search_path = public as $$
declare
  snap jsonb;
  digest text;
  latest public.academy_course_versions;
  result public.academy_course_versions;
begin
  perform 1 from public.academy_courses where academy_id = p_academy and id = p_course for update;
  if not found then raise exception using errcode = 'P0002', message = 'Course not found'; end if;
  snap := public.academy_course_snapshot(p_academy, p_course);
  digest := md5(snap::text);
  select * into latest from public.academy_course_versions
  where academy_id = p_academy and course_id = p_course order by version desc limit 1;
  if latest.id is not null and latest.checksum = digest then
    update public.academy_course_versions set published_by = coalesce(published_by, p_actor)
    where id = latest.id returning * into result;
  else
    insert into public.academy_course_versions(academy_id, course_id, version, snapshot, checksum,
      module_count, lesson_count, quiz_count, published_by)
    values (p_academy, p_course, coalesce(latest.version, 0) + 1, snap, digest,
      jsonb_array_length(snap->'modules'), jsonb_array_length(snap->'lessons'), jsonb_array_length(snap->'quizzes'), p_actor)
    returning * into result;
  end if;
  update public.academy_classroom_courses
     set course_version_id = result.id, version_pinned_at = now(), version_pinned_by = coalesce(version_pinned_by, p_actor)
   where academy_id = p_academy and course_id = p_course and version_mode = 'pinned' and course_version_id is null;
  return result;
end;
$$;
revoke all on function public.academy_course_publish_version(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.academy_course_publish_version(uuid, uuid, uuid) to service_role;

-- Every publish (first publish or re-publish, which refreshes published_at)
-- takes a snapshot, whichever path published the course. A course inserted
-- as already published has no modules yet; it gets its first version when it
-- is first assigned to a classroom (academy_classroom_courses_pin_version).
create or replace function public.academy_courses_version_on_publish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published'
     and (old.status is distinct from 'published' or old.published_at is distinct from new.published_at) then
    perform public.academy_course_publish_version(new.academy_id, new.id, null);
  end if;
  return null;
end;
$$;
revoke all on function public.academy_courses_version_on_publish() from public, anon, authenticated;
drop trigger if exists academy_courses_version_on_publish on public.academy_courses;
create trigger academy_courses_version_on_publish after update of status, published_at on public.academy_courses
  for each row execute function public.academy_courses_version_on_publish();

-- A new run starts on the latest version. Upserts that hit an existing run do
-- not name these columns, so they never move a running group.
create or replace function public.academy_classroom_courses_pin_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if new.version_mode = 'pinned' and new.course_version_id is null then
    select id into v from public.academy_course_versions
    where academy_id = new.academy_id and course_id = new.course_id order by version desc limit 1;
    if v is null and exists (select 1 from public.academy_courses
                             where academy_id = new.academy_id and id = new.course_id and status = 'published') then
      v := (public.academy_course_publish_version(new.academy_id, new.course_id, new.assigned_by)).id;
    end if;
    if v is not null then
      new.course_version_id := v;
      new.version_pinned_at := now();
      new.version_pinned_by := new.assigned_by;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.academy_classroom_courses_pin_version() from public, anon, authenticated;
drop trigger if exists academy_classroom_courses_pin_version on public.academy_classroom_courses;
create trigger academy_classroom_courses_pin_version before insert on public.academy_classroom_courses
  for each row execute function public.academy_classroom_courses_pin_version();

-- The snapshot a run reads, or null when the run reads the live course.
create or replace function public.academy_run_snapshot(p_academy uuid, p_classroom uuid, p_course uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select v.snapshot
  from public.academy_classroom_courses r
  join public.academy_course_versions v on v.id = r.course_version_id
  where r.academy_id = p_academy and r.classroom_id = p_classroom and r.course_id = p_course and r.version_mode = 'pinned';
$$;
revoke all on function public.academy_run_snapshot(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.academy_run_snapshot(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Staff: move one group to the newest version. p_expected_version guards
-- against moving to a version the teacher has not seen yet.
-- ---------------------------------------------------------------------------
create or replace function public.academy_classroom_course_move_version(
  p_academy uuid, p_run uuid, p_actor uuid, p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.academy_classroom_courses;
  scope jsonb;
  previous public.academy_course_versions;
  latest public.academy_course_versions;
begin
  select * into r from public.academy_classroom_courses where academy_id = p_academy and id = p_run for update;
  if not found then raise exception using errcode = 'P0002', message = 'Classroom course not found'; end if;
  select jsonb_build_object('kind', 'classroom', 'classroom_id', c.id, 'branch_id', c.branch_id) into scope
  from public.academy_classrooms c where c.academy_id = p_academy and c.id = r.classroom_id;
  if p_actor is null or scope is null
     or not public.academy_command_covers(public.academy_current_authorities(p_academy, p_actor), 'manageAssignments', scope) then
    raise exception using errcode = '42501', message = 'Current access does not cover this classroom';
  end if;
  select * into latest from public.academy_course_versions
  where academy_id = p_academy and course_id = r.course_id order by version desc limit 1;
  if latest.id is null then
    raise exception using errcode = '55000', message = 'Publish the course before moving a group to it';
  end if;
  if p_expected_version is not null and latest.version <> p_expected_version then
    raise exception using errcode = '55000', message = 'A newer course version was published. Refresh and review it first';
  end if;
  select * into previous from public.academy_course_versions where id = r.course_version_id;
  update public.academy_classroom_courses
     set version_mode = 'pinned', course_version_id = latest.id, version_pinned_at = now(), version_pinned_by = p_actor
   where id = r.id;
  return jsonb_build_object(
    'classroom_course_id', r.id, 'classroom_id', r.classroom_id, 'course_id', r.course_id,
    'from_mode', r.version_mode, 'from_version', previous.version,
    'to_version', latest.version, 'course_version_id', latest.id,
    'changed', r.version_mode <> 'pinned' or r.course_version_id is distinct from latest.id);
end;
$$;
revoke all on function public.academy_classroom_course_move_version(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.academy_classroom_course_move_version(uuid, uuid, uuid, integer) to service_role;

-- Version labels for the staff curriculum screen (no snapshot content).
create or replace function public.academy_course_version_summaries(p_academy uuid, p_course_ids uuid[], p_run_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'latest', coalesce((
      select jsonb_agg(jsonb_build_object('course_id', v.course_id, 'course_version_id', v.id, 'version', v.version,
        'published_at', v.published_at, 'module_count', v.module_count, 'lesson_count', v.lesson_count, 'quiz_count', v.quiz_count))
      from (select distinct on (course_id) * from public.academy_course_versions
            where academy_id = p_academy and course_id = any(coalesce(p_course_ids, '{}'))
            order by course_id, version desc) v), '[]'::jsonb),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'version_mode', r.version_mode, 'course_version_id', r.course_version_id,
        'version', v.version, 'version_pinned_at', r.version_pinned_at))
      from public.academy_classroom_courses r
      left join public.academy_course_versions v on v.id = r.course_version_id
      where r.academy_id = p_academy and r.id = any(coalesce(p_run_ids, '{}'))), '[]'::jsonb));
$$;
revoke all on function public.academy_course_version_summaries(uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.academy_course_version_summaries(uuid, uuid[], uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- Unlock checks read the run's version, so a rule changed on the live course
-- does not lock or unlock modules for a group on an older version.
-- ---------------------------------------------------------------------------
create or replace function public.academy_module_unlocked(
  p_academy uuid, p_classroom uuid, p_contact uuid, p_module uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  m public.academy_course_modules;
  snap jsonb;
  rule jsonb;
  module_position integer;
  previous_module uuid;
  rule_type text;
  quiz uuid;
  min_percent numeric;
begin
  select * into m from public.academy_course_modules where academy_id = p_academy and id = p_module;
  if not found then return true; end if;
  snap := public.academy_run_snapshot(p_academy, p_classroom, m.course_id);
  if snap is null then
    rule := m.unlock_rule;
    module_position := m.position;
  else
    select x->'unlock_rule', (x->>'position')::integer into rule, module_position
    from jsonb_array_elements(snap->'modules') x where x->>'id' = p_module::text;
    if module_position is null then return true; end if;
  end if;
  rule_type := coalesce(rule->>'type', 'none');
  if rule_type = 'quiz_pass' then
    if coalesce(rule->>'quiz_id', '') !~* '^[0-9a-f-]{36}$' then return true; end if;
    quiz := (rule->>'quiz_id')::uuid;
    min_percent := nullif(rule->>'min_percent', '')::numeric;
    return exists (
      select 1 from public.academy_quiz_attempts a
      where a.academy_id = p_academy and a.classroom_id = p_classroom and a.contact_id = p_contact and a.quiz_id = quiz
        and a.status in ('submitted', 'graded')
        and (case when min_percent is null then coalesce(a.passed, false) else coalesce(a.percentage, 0) >= min_percent end));
  elsif rule_type = 'previous_module' then
    if snap is null then
      select id into previous_module from public.academy_course_modules
      where academy_id = p_academy and course_id = m.course_id and status = 'published' and position < module_position
      order by position desc limit 1;
      if previous_module is null then return true; end if;
      return not exists (
        select 1 from public.academy_lessons l
        where l.academy_id = p_academy and l.module_id = previous_module and l.status = 'published'
          and not exists (
            select 1 from public.academy_lesson_progress p
            where p.academy_id = p_academy and p.classroom_id = p_classroom and p.contact_id = p_contact
              and p.lesson_id = l.id and p.status = 'completed'));
    end if;
    select (x->>'id')::uuid into previous_module
    from jsonb_array_elements(snap->'modules') with ordinality as s(x, ord)
    where (x->>'position')::integer < module_position
    order by (x->>'position')::integer desc, ord desc limit 1;
    if previous_module is null then return true; end if;
    return not exists (
      select 1 from jsonb_array_elements(snap->'lessons') l
      where l->>'module_id' = previous_module::text
        and not exists (
          select 1 from public.academy_lesson_progress p
          where p.academy_id = p_academy and p.classroom_id = p_classroom and p.contact_id = p_contact
            and p.lesson_id = (l->>'id')::uuid and p.status = 'completed'));
  end if;
  return true;
end;
$$;
revoke all on function public.academy_module_unlocked(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.academy_module_unlocked(uuid, uuid, uuid, uuid) to service_role;

create or replace function public.academy_lesson_progress_unlock_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare module_value uuid; snap jsonb;
begin
  snap := public.academy_run_snapshot(new.academy_id, new.classroom_id, new.course_id);
  if snap is null then
    select l.module_id into module_value from public.academy_lessons l where l.academy_id = new.academy_id and l.id = new.lesson_id;
  else
    select (x->>'module_id')::uuid into module_value from jsonb_array_elements(snap->'lessons') x where x->>'id' = new.lesson_id::text;
  end if;
  if module_value is not null and not public.academy_module_unlocked(new.academy_id, new.classroom_id, new.contact_id, module_value) then
    raise exception using errcode = 'P0001', message = 'Pass the module check before starting this module';
  end if;
  return new;
end;
$$;
revoke all on function public.academy_lesson_progress_unlock_gate() from public, anon, authenticated;

create or replace function public.academy_quiz_attempt_unlock_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare module_value uuid; snap jsonb;
begin
  snap := public.academy_run_snapshot(new.academy_id, new.classroom_id, new.course_id);
  if snap is null then
    select l.module_id into module_value
    from public.academy_quizzes q join public.academy_lessons l on l.academy_id = q.academy_id and l.id = q.lesson_id
    where q.academy_id = new.academy_id and q.id = new.quiz_id;
  else
    select (l->>'module_id')::uuid into module_value
    from jsonb_array_elements(snap->'quizzes') q join jsonb_array_elements(snap->'lessons') l on l->>'id' = q->>'lesson_id'
    where q->>'id' = new.quiz_id::text;
  end if;
  if module_value is not null and not public.academy_module_unlocked(new.academy_id, new.classroom_id, new.contact_id, module_value) then
    raise exception using errcode = 'P0001', message = 'Pass the module check before starting this quiz';
  end if;
  return new;
end;
$$;
revoke all on function public.academy_quiz_attempt_unlock_gate() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Catalogue: a listing shows the latest published version (what a new group
-- gets), and completion counts each group against the lessons of its version.
-- ---------------------------------------------------------------------------
create or replace function public.academy_course_completion(p_academy uuid, p_course uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with runs as (
    select cc.classroom_id, case when cc.version_mode = 'pinned' then v.snapshot end as snapshot
    from public.academy_classroom_courses cc
    left join public.academy_course_versions v on v.id = cc.course_version_id
    where cc.academy_id = p_academy and cc.course_id = p_course and cc.status in ('active', 'completed')
  ), run_lessons as (
    select r.classroom_id, l.id as lesson_id
    from runs r join public.academy_lessons l on l.academy_id = p_academy and l.course_id = p_course and l.status = 'published'
    where r.snapshot is null
    union
    select r.classroom_id, (x->>'id')::uuid
    from runs r cross join lateral jsonb_array_elements(r.snapshot->'lessons') x
    where r.snapshot is not null
  ), learners as (
    select distinct m.classroom_id, m.contact_id
    from runs r
    join public.academy_classroom_memberships m on m.academy_id = p_academy and m.classroom_id = r.classroom_id and m.role = 'student'
  ), done as (
    select l.contact_id,
      (select count(*) from run_lessons rl where rl.classroom_id = l.classroom_id) as total,
      (select count(*) from public.academy_lesson_progress p
        join run_lessons rl on rl.classroom_id = p.classroom_id and rl.lesson_id = p.lesson_id
        where p.academy_id = p_academy and p.classroom_id = l.classroom_id and p.contact_id = l.contact_id
          and p.status = 'completed') as completed
    from learners l
  )
  select jsonb_build_object(
    'learners', (select count(*) from done),
    'completion_percent', case when (select count(*) from done) >= 15 and exists (select 1 from done where total > 0)
      then round(100.0 * (select count(*) from done where total > 0 and completed >= total) / (select count(*) from done))
      else null end);
$$;
revoke all on function public.academy_course_completion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.academy_course_completion(uuid, uuid) to service_role;

create or replace function public.academy_public_course_catalog(
  p_slug text default null, p_query text default null, p_language text default null, p_format text default null, p_limit integer default 60)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(item order by sort_key desc), '[]'::jsonb) from (
    select l.listed_at as sort_key, jsonb_build_object(
      'slug', l.slug, 'headline', l.headline, 'summary', l.summary, 'format', l.format, 'city', l.city, 'language', l.language,
      'level', coalesce(l.level, v.snapshot->'course'->>'level', c.level), 'price_text', l.price_text, 'schedule_text', l.schedule_text,
      'starts_on', l.starts_on, 'seats', l.seats, 'teacher_name', l.teacher_name, 'listed_at', l.listed_at,
      'course', case when v.id is null then
          jsonb_build_object('title', c.title, 'description', c.description, 'estimated_minutes', c.estimated_minutes, 'version', null,
            'modules', (select coalesce(jsonb_agg(jsonb_build_object('title', m.title,
                'lessons', (select count(*) from public.academy_lessons x where x.module_id = m.id and x.status = 'published')) order by m.position), '[]'::jsonb)
              from public.academy_course_modules m where m.course_id = c.id and m.status = 'published'))
        else
          jsonb_build_object('title', coalesce(v.snapshot->'course'->>'title', c.title),
            'description', coalesce(v.snapshot->'course'->>'description', c.description),
            'estimated_minutes', coalesce((v.snapshot->'course'->>'estimated_minutes')::integer, c.estimated_minutes),
            'version', v.version,
            'modules', (select coalesce(jsonb_agg(jsonb_build_object('title', m->>'title',
                'lessons', (select count(*) from jsonb_array_elements(v.snapshot->'lessons') x where x->>'module_id' = m->>'id'))
                order by (m->>'position')::integer, ord), '[]'::jsonb)
              from jsonb_array_elements(v.snapshot->'modules') with ordinality as s(m, ord)))
        end,
      'provider', jsonb_build_object('name', t.name,
        'kind', case when t.metadata->>'parent_center_id' is not null then 'centre' else 'teacher' end),
      'results', public.academy_course_completion(l.academy_id, l.course_id)
    ) as item
    from public.academy_course_listings l
    join public.academy_courses c on c.id = l.course_id and c.academy_id = l.academy_id and c.status = 'published'
    join public.tenants t on t.id = l.academy_id
    left join lateral (
      select cv.id, cv.version, cv.snapshot from public.academy_course_versions cv
      where cv.academy_id = l.academy_id and cv.course_id = l.course_id order by cv.version desc limit 1
    ) v on true
    where l.status = 'listed'
      and (p_slug is null or l.slug = p_slug)
      and (p_language is null or l.language = p_language)
      and (p_format is null or l.format = p_format)
      and (p_query is null or l.headline ilike '%' || p_query || '%' or c.title ilike '%' || p_query || '%' or coalesce(l.city, '') ilike '%' || p_query || '%')
      and public.academy_learning_allows(l.academy_id, 'courses')
    order by l.listed_at desc nulls last
    limit least(greatest(coalesce(p_limit, 60), 1), 100)
  ) listed;
$$;
revoke all on function public.academy_public_course_catalog(text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.academy_public_course_catalog(text, text, text, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Staff action through the legacy office boundary (same capability as
-- assign_course), and version 1 for every course that is already published.
-- Existing runs stay 'live'; nothing a learner sees changes.
-- ---------------------------------------------------------------------------
insert into public.academy_legacy_boundary_actions(action, mode, capabilities)
values ('move_course_version', 'write', array['manageAssignments'])
on conflict (action, mode) do nothing;

do $backfill$
declare course record;
begin
  for course in select academy_id, id from public.academy_courses where status = 'published' loop
    perform public.academy_course_publish_version(course.academy_id, course.id, null);
  end loop;
end
$backfill$;

notify pgrst, 'reload schema';
