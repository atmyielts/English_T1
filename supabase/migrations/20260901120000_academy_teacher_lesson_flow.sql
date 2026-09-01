-- Teacher lesson flow: one durable run joins the timetable, curriculum,
-- attendance, homework, audit, and Telegram delivery loops.

create table if not exists public.academy_teacher_lesson_runs (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null,
  classroom_id uuid not null,
  staff_id uuid not null,
  course_id uuid,
  module_id uuid,
  lesson_id uuid,
  status text not null default 'prepared'
    check (status in ('prepared','in_progress','finished')),
  plan_snapshot jsonb not null default '{}'::jsonb,
  coverage jsonb not null default '[]'::jsonb
    check (jsonb_typeof(coverage) = 'array'),
  homework_draft jsonb not null default '{}'::jsonb
    check (jsonb_typeof(homework_draft) = 'object'),
  homework_assignment_id uuid,
  teacher_notes text,
  started_at timestamptz,
  finished_at timestamptz,
  start_idempotency_key text,
  finish_idempotency_key text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, session_id),
  foreign key (academy_id, session_id)
    references public.academy_lesson_sessions(academy_id, id) on delete restrict,
  foreign key (academy_id, classroom_id)
    references public.academy_classrooms(academy_id, id) on delete restrict,
  foreign key (academy_id, staff_id)
    references public.academy_staff(academy_id, id) on delete restrict,
  foreign key (academy_id, course_id)
    references public.academy_courses(academy_id, id) on delete set null (course_id),
  foreign key (academy_id, module_id)
    references public.academy_course_modules(academy_id, id) on delete set null (module_id),
  foreign key (academy_id, lesson_id)
    references public.academy_lessons(academy_id, id) on delete set null (lesson_id),
  foreign key (academy_id, homework_assignment_id)
    references public.academy_assignments(academy_id, id) on delete set null (homework_assignment_id)
);

create index if not exists academy_teacher_lesson_runs_day_idx
  on public.academy_teacher_lesson_runs(academy_id, staff_id, started_at desc);
create index if not exists academy_teacher_lesson_runs_classroom_idx
  on public.academy_teacher_lesson_runs(academy_id, classroom_id, status, created_at desc);
create unique index if not exists academy_teacher_lesson_runs_start_key_uidx
  on public.academy_teacher_lesson_runs(academy_id, start_idempotency_key)
  where start_idempotency_key is not null;
create unique index if not exists academy_teacher_lesson_runs_finish_key_uidx
  on public.academy_teacher_lesson_runs(academy_id, finish_idempotency_key)
  where finish_idempotency_key is not null;
create unique index if not exists academy_assignments_teacher_lesson_run_uidx
  on public.academy_assignments(academy_id, (metadata->>'teacher_lesson_run_id'))
  where metadata->>'source' = 'teacher_lesson_flow'
    and nullif(metadata->>'teacher_lesson_run_id', '') is not null;

alter table public.academy_teacher_lesson_runs enable row level security;

drop policy if exists "Academy teacher lesson runs read by staff" on public.academy_teacher_lesson_runs;
create policy "Academy teacher lesson runs read by staff"
  on public.academy_teacher_lesson_runs for select
  using (
    public.academy_org_can_manage(academy_id)
    or exists (
      select 1 from public.academy_staff staff
      where staff.academy_id = academy_teacher_lesson_runs.academy_id
        and staff.id = academy_teacher_lesson_runs.staff_id
        and staff.user_id = auth.uid()
        and staff.is_active
    )
  );

revoke all on public.academy_teacher_lesson_runs from anon, authenticated;
grant select on public.academy_teacher_lesson_runs to authenticated;

create or replace function public.academy_start_teacher_lesson(
  p_academy_id uuid,
  p_session_id uuid,
  p_actor_id uuid,
  p_staff_id uuid,
  p_course_id uuid,
  p_module_id uuid,
  p_lesson_id uuid,
  p_plan_snapshot jsonb,
  p_homework_draft jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_session public.academy_lesson_sessions%rowtype;
  v_run public.academy_teacher_lesson_runs%rowtype;
  v_key text := nullif(trim(p_idempotency_key), '');
begin
  if v_key is null then raise exception 'idempotency_key is required'; end if;
  if jsonb_typeof(coalesce(p_plan_snapshot, '{}'::jsonb)) <> 'object' then
    raise exception 'plan_snapshot must be an object';
  end if;

  select * into v_session from public.academy_lesson_sessions
  where academy_id = p_academy_id and id = p_session_id for update;
  if not found then raise exception 'Lesson session not found'; end if;
  if v_session.status in ('completed','cancelled','rescheduled','missed') then
    raise exception 'This lesson session can no longer be started';
  end if;
  if p_staff_id is null or not (
    v_session.primary_staff_id = p_staff_id or exists (
      select 1 from public.academy_session_staff_assignments a
      where a.academy_id = p_academy_id and a.session_id = p_session_id
        and a.staff_id = p_staff_id and a.ended_at is null
    )
  ) then raise exception 'Teacher is not assigned to this lesson session'; end if;

  insert into public.academy_teacher_lesson_runs(
    academy_id, session_id, classroom_id, staff_id, course_id, module_id, lesson_id,
    status, plan_snapshot, homework_draft, started_at, start_idempotency_key,
    created_by, updated_by
  ) values (
    p_academy_id, p_session_id, v_session.classroom_id, p_staff_id,
    p_course_id, p_module_id, p_lesson_id, 'in_progress',
    coalesce(p_plan_snapshot, '{}'::jsonb), coalesce(p_homework_draft, '{}'::jsonb),
    now(), v_key, p_actor_id, p_actor_id
  )
  on conflict (academy_id, session_id) do update set
    status = case when academy_teacher_lesson_runs.status = 'finished' then 'finished' else 'in_progress' end,
    plan_snapshot = case when academy_teacher_lesson_runs.status = 'finished' then academy_teacher_lesson_runs.plan_snapshot else excluded.plan_snapshot end,
    homework_draft = case when academy_teacher_lesson_runs.status = 'finished' then academy_teacher_lesson_runs.homework_draft else excluded.homework_draft end,
    started_at = coalesce(academy_teacher_lesson_runs.started_at, excluded.started_at),
    start_idempotency_key = coalesce(academy_teacher_lesson_runs.start_idempotency_key, excluded.start_idempotency_key),
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_run;

  if v_run.status <> 'finished' and v_session.status in ('scheduled','confirmed') then
    update public.academy_lesson_sessions set
      status = 'in_progress', updated_by = p_actor_id, updated_at = now()
    where academy_id = p_academy_id and id = p_session_id;
  end if;

  insert into public.academy_audit_events(
    academy_id, actor_user_id, action, target_type, target_id,
    classroom_id, idempotency_key, metadata
  ) values (
    p_academy_id, p_actor_id, 'teacher_lesson.started', 'academy_teacher_lesson_run',
    v_run.id::text, v_run.classroom_id, 'teacher.lesson.start:' || v_key,
    jsonb_build_object('session_id', p_session_id, 'lesson_id', p_lesson_id, 'staff_id', p_staff_id)
  ) on conflict (academy_id, idempotency_key) where idempotency_key is not null do nothing;

  return to_jsonb(v_run);
end;
$$;

create or replace function public.academy_record_teacher_attendance_batch(
  p_academy_id uuid,
  p_session_id uuid,
  p_actor_id uuid,
  p_staff_id uuid,
  p_records jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_session public.academy_lesson_sessions%rowtype;
  v_record jsonb;
  v_saved integer := 0;
  v_key text := nullif(trim(p_idempotency_key), '');
begin
  if v_key is null then raise exception 'idempotency_key is required'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 500 then
    raise exception 'Attendance records must be an array of up to 500 rows';
  end if;
  select * into v_session from public.academy_lesson_sessions
  where academy_id = p_academy_id and id = p_session_id;
  if not found then raise exception 'Lesson session not found'; end if;
  if p_staff_id is null or not (
    v_session.primary_staff_id = p_staff_id or exists (
      select 1 from public.academy_session_staff_assignments a
      where a.academy_id = p_academy_id and a.session_id = p_session_id
        and a.staff_id = p_staff_id and a.ended_at is null
    )
  ) then raise exception 'Teacher is not assigned to this lesson session'; end if;
  if exists (
    select 1 from public.academy_audit_events
    where academy_id = p_academy_id and idempotency_key = 'teacher.attendance:' || v_key
  ) then return jsonb_build_object('saved', jsonb_array_length(p_records), 'duplicate', true); end if;

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    perform public.academy_record_session_attendance(
      p_academy_id, p_session_id, (v_record->>'contact_id')::uuid,
      p_actor_id, lower(trim(v_record->>'status')), nullif(trim(v_record->>'notes'), '')
    );
    v_saved := v_saved + 1;
  end loop;
  insert into public.academy_audit_events(
    academy_id, actor_user_id, action, target_type, target_id,
    classroom_id, idempotency_key, metadata
  ) values (
    p_academy_id, p_actor_id, 'teacher_lesson.attendance_saved', 'academy_lesson_session',
    p_session_id::text, v_session.classroom_id, 'teacher.attendance:' || v_key,
    jsonb_build_object('records', v_saved, 'staff_id', p_staff_id)
  );
  return jsonb_build_object('saved', v_saved, 'duplicate', false);
end;
$$;

create or replace function public.academy_finish_teacher_lesson(
  p_academy_id uuid,
  p_session_id uuid,
  p_actor_id uuid,
  p_staff_id uuid,
  p_coverage jsonb,
  p_teacher_notes text,
  p_homework jsonb,
  p_assign_homework boolean,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_session public.academy_lesson_sessions%rowtype;
  v_run public.academy_teacher_lesson_runs%rowtype;
  v_assignment public.academy_assignments%rowtype;
  v_key text := nullif(trim(p_idempotency_key), '');
  v_title text;
  v_description text;
  v_due_at timestamptz;
begin
  if v_key is null then raise exception 'idempotency_key is required'; end if;
  if jsonb_typeof(coalesce(p_coverage, '[]'::jsonb)) <> 'array' then
    raise exception 'coverage must be an array';
  end if;
  if jsonb_typeof(coalesce(p_homework, '{}'::jsonb)) <> 'object' then
    raise exception 'homework must be an object';
  end if;

  select * into v_session from public.academy_lesson_sessions
  where academy_id = p_academy_id and id = p_session_id for update;
  if not found then raise exception 'Lesson session not found'; end if;
  select * into v_run from public.academy_teacher_lesson_runs
  where academy_id = p_academy_id and session_id = p_session_id for update;
  if not found then raise exception 'Start the lesson before finishing it'; end if;
  if p_staff_id is null or v_run.staff_id <> p_staff_id then
    raise exception 'Teacher is not assigned to this lesson run';
  end if;
  if v_run.status = 'finished' then
    return jsonb_build_object('run', to_jsonb(v_run), 'assignment',
      case when v_run.homework_assignment_id is null then null else (
        select to_jsonb(a) from public.academy_assignments a
        where a.academy_id = p_academy_id and a.id = v_run.homework_assignment_id
      ) end, 'duplicate', true);
  end if;

  if p_assign_homework then
    v_title := nullif(trim(p_homework->>'title'), '');
    v_description := nullif(trim(p_homework->>'description'), '');
    if v_title is null then raise exception 'Homework title is required'; end if;
    begin v_due_at := (p_homework->>'due_at')::timestamptz;
    exception when others then raise exception 'A valid homework due date is required'; end;
    insert into public.academy_assignments(
      academy_id, classroom_id, course_id, module_id, lesson_id, title, description,
      assignment_type, due_at, status, created_by, metadata
    ) values (
      p_academy_id, v_run.classroom_id, v_run.course_id, v_run.module_id, v_run.lesson_id,
      v_title, v_description, 'task', v_due_at, 'active', p_actor_id,
      jsonb_build_object('source', 'teacher_lesson_flow', 'teacher_lesson_run_id', v_run.id,
        'session_id', p_session_id, 'finish_idempotency_key', v_key)
    ) on conflict (academy_id, (metadata->>'teacher_lesson_run_id'))
      where metadata->>'source' = 'teacher_lesson_flow'
        and nullif(metadata->>'teacher_lesson_run_id', '') is not null
    do update set title = excluded.title, description = excluded.description,
      due_at = excluded.due_at, updated_at = now()
    returning * into v_assignment;
  end if;

  update public.academy_teacher_lesson_runs set
    status = 'finished', coverage = coalesce(p_coverage, '[]'::jsonb),
    teacher_notes = nullif(trim(p_teacher_notes), ''),
    homework_draft = coalesce(p_homework, '{}'::jsonb),
    homework_assignment_id = v_assignment.id,
    finished_at = now(), finish_idempotency_key = v_key,
    updated_by = p_actor_id, updated_at = now()
  where academy_id = p_academy_id and id = v_run.id returning * into v_run;

  if v_session.status = 'in_progress' then
    perform public.academy_transition_lesson_session(
      p_academy_id, p_session_id, p_actor_id, 'completed', '{}'::jsonb,
      'teacher-finish:' || v_key
    );
  end if;

  if v_assignment.id is not null then
    insert into public.academy_notifications(
      academy_id, channel, type, title, body, status, scheduled_at,
      bot_kind, audience_kind, chat_binding_id, actor_user_id,
      dedupe_key, category, critical_override, metadata
    )
    select
      p_academy_id, 'telegram', 'homework_published', v_assignment.title,
      coalesce(v_assignment.description || E'\n\n', '') || 'Due: ' || to_char(v_assignment.due_at at time zone v_session.timezone, 'DD Mon YYYY HH24:MI'),
      'queued', now(), 'academy_staff', 'group', c.id, p_actor_id,
      'teacher-lesson:' || v_run.id::text || ':homework:' || c.id::text,
      'academic_required', false,
      jsonb_build_object('source', 'teacher_lesson_flow', 'assignment_id', v_assignment.id,
        'session_id', p_session_id, 'binding_purpose', c.purpose)
    from public.academy_telegram_chats c
    join public.academy_telegram_chat_subscriptions s
      on s.academy_id = c.academy_id and s.chat_binding_id = c.id
      and s.event_type = 'homework_published' and s.enabled and s.delivery_mode <> 'off'
    join public.academy_telegram_settings settings
      on settings.academy_id = c.academy_id and settings.enabled
    where c.academy_id = p_academy_id and c.classroom_id = v_run.classroom_id
      and c.status = 'active' and c.purpose = 'classroom_community'
    on conflict (academy_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  insert into public.academy_audit_events(
    academy_id, actor_user_id, action, target_type, target_id,
    classroom_id, idempotency_key, metadata
  ) values (
    p_academy_id, p_actor_id, 'teacher_lesson.finished', 'academy_teacher_lesson_run',
    v_run.id::text, v_run.classroom_id, 'teacher.lesson.finish:' || v_key,
    jsonb_build_object('session_id', p_session_id, 'lesson_id', v_run.lesson_id,
      'coverage_items', jsonb_array_length(v_run.coverage),
      'homework_assignment_id', v_assignment.id, 'staff_id', p_staff_id)
  ) on conflict (academy_id, idempotency_key) where idempotency_key is not null do nothing;

  return jsonb_build_object('run', to_jsonb(v_run), 'assignment',
    case when v_assignment.id is null then null else to_jsonb(v_assignment) end,
    'duplicate', false);
end;
$$;

revoke all on function public.academy_start_teacher_lesson(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.academy_record_teacher_attendance_batch(uuid,uuid,uuid,uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.academy_finish_teacher_lesson(uuid,uuid,uuid,uuid,jsonb,text,jsonb,boolean,text) from public, anon, authenticated;
grant execute on function public.academy_start_teacher_lesson(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,text) to service_role;
grant execute on function public.academy_record_teacher_attendance_batch(uuid,uuid,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_finish_teacher_lesson(uuid,uuid,uuid,uuid,jsonb,text,jsonb,boolean,text) to service_role;
