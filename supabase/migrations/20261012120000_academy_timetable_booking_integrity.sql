-- Additive command receipts; legacy generation runs remain valid.
alter table public.academy_timetable_generation_runs add column if not exists idempotency_key text;
alter table public.academy_timetable_generation_runs add column if not exists request_scope jsonb;
create unique index if not exists academy_timetable_generation_request_uidx
  on public.academy_timetable_generation_runs(academy_id,idempotency_key) where idempotency_key is not null;

create or replace function public.academy_booking_time_allowed(
  p_academy_id uuid,p_kind text,p_resource_id uuid,p_start timestamptz,p_end timestamptz
) returns boolean language sql stable security definer set search_path=public as $$
  with rules as materialized (
    select day_of_week,starts_at,ends_at,timezone,available,effective_from,effective_to
    from public.academy_staff_availability where p_kind='staff' and academy_id=p_academy_id and staff_id=p_resource_id and is_active
    union all
    select day_of_week,starts_at,ends_at,timezone,available,effective_from,effective_to
    from public.academy_room_availability where p_kind='room' and academy_id=p_academy_id and room_id=p_resource_id and is_active
  ), applicable as materialized (
    select * from rules where effective_from<=(p_end at time zone timezone)::date
      and coalesce(effective_to,'infinity'::date)>=(p_start at time zone timezone)::date
  ), windows as (
    select a.available,tstzrange((d::date+a.starts_at) at time zone a.timezone,
      (d::date+a.ends_at) at time zone a.timezone,'[)') as slot
    from applicable a cross join lateral generate_series(
      greatest(a.effective_from,(p_start at time zone a.timezone)::date)::timestamp,
      least(coalesce(a.effective_to,'infinity'::date),(p_end at time zone a.timezone)::date)::timestamp,
      interval '1 day') d where extract(dow from d)=a.day_of_week
  )
  select p_end>p_start and p_kind in('staff','room')
    and not exists(select 1 from windows where not available and slot&&tstzrange(p_start,p_end,'[)'))
    and (not exists(select 1 from applicable where available)
      or coalesce((select range_agg(slot) from windows where available)@>tstzrange(p_start,p_end,'[)'),false));
$$;

create or replace function public.academy_validate_lesson_booking(
  p_academy_id uuid,p_branch_id uuid,p_classroom_id uuid,p_room_id uuid,p_staff_id uuid,
  p_mode text,p_start timestamptz,p_end timestamptz
) returns void language plpgsql security definer set search_path=public as $$
declare v_room public.academy_rooms%rowtype;v_class public.academy_classrooms%rowtype;v_count integer;
begin
  if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '24 hours' then
    raise exception 'Lesson duration must be positive and no longer than 24 hours';end if;
  if p_mode not in('physical','online','hybrid') then raise exception 'Invalid lesson delivery mode';end if;
  if not exists(select 1 from public.academy_branches where academy_id=p_academy_id and id=p_branch_id and is_active) then
    raise exception 'An active physical branch is required';end if;
  select * into v_class from public.academy_classrooms where academy_id=p_academy_id and id=p_classroom_id and is_active;
  if not found then raise exception 'An active classroom is required';end if;
  if not exists(select 1 from public.academy_staff where academy_id=p_academy_id and id=p_staff_id and is_active) then
    raise exception 'An active teacher is required';end if;
  if p_room_id is not null then
    select * into v_room from public.academy_rooms where academy_id=p_academy_id and id=p_room_id and is_active;
    if not found or v_room.branch_id<>p_branch_id then raise exception 'Room belongs to another branch or is inactive';end if;
  elsif p_mode in('physical','hybrid') then raise exception 'Physical and hybrid lessons require a room';end if;
  if exists(select 1 from public.academy_calendar_events e join public.academy_academic_calendars c
    on c.academy_id=e.academy_id and c.id=e.calendar_id where e.academy_id=p_academy_id and e.affects_schedule
    and e.starts_at<p_end and e.ends_at>p_start and(c.branch_id is null or c.branch_id=p_branch_id)) then
    raise exception 'Session conflicts with an academic calendar closure';end if;
  if not public.academy_booking_time_allowed(p_academy_id,'staff',p_staff_id,p_start,p_end) then raise exception 'Teacher is unavailable for this session';end if;
  if p_room_id is not null and not public.academy_booking_time_allowed(p_academy_id,'room',p_room_id,p_start,p_end) then raise exception 'Room is unavailable for this session';end if;
  select count(*) into v_count from public.academy_classroom_memberships where academy_id=p_academy_id and classroom_id=p_classroom_id and role='student' and status='active';
  if v_count>least(coalesce(v_class.student_capacity,2147483647),coalesce(v_room.capacity,2147483647)) then
    raise exception 'Session room/classroom capacity is below active enrollment';end if;
end;
$$;

-- Protect direct inserts as well as the RPC. Cancellation/completion remain
-- possible for historical records; unchanged accepted bookings are preserved.
create or replace function public.academy_lesson_booking_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in('scheduled','confirmed','in_progress') and (tg_op='INSERT' or
    old.status not in('scheduled','confirmed','in_progress') or
    row(new.branch_id,new.classroom_id,new.room_id,new.primary_staff_id,new.calendar_id,new.delivery_mode,new.starts_at,new.ends_at,new.timezone)
      is distinct from row(old.branch_id,old.classroom_id,old.room_id,old.primary_staff_id,old.calendar_id,old.delivery_mode,old.starts_at,old.ends_at,old.timezone)) then
    if nullif(trim(new.timezone),'') is null then raise exception 'A valid lesson timezone is required';end if;
    begin
      perform new.starts_at at time zone new.timezone;
    exception when invalid_parameter_value then raise exception 'A valid lesson timezone is required';end;
    if new.calendar_id is not null and exists(select 1 from public.academy_academic_calendars c
      where c.academy_id=new.academy_id and c.id=new.calendar_id and c.branch_id is not null and c.branch_id<>new.branch_id) then
      raise exception 'Academic calendar belongs to another branch';end if;
    perform public.academy_validate_lesson_booking(new.academy_id,new.branch_id,new.classroom_id,new.room_id,new.primary_staff_id,new.delivery_mode,new.starts_at,new.ends_at);
  end if;
  return new;
end;
$$;
create trigger academy_lesson_booking_guard before insert or update on public.academy_lesson_sessions
  for each row execute function public.academy_lesson_booking_guard();

-- Retain the existing creation signature and its audit/assignment/outbox writes,
-- while using the same validated local-time rules as timetable generation.
create or replace function public.academy_create_lesson_session(p_academy_id uuid,p_actor_id uuid,p_payload jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v public.academy_lesson_sessions%rowtype;v_start timestamptz;v_end timestamptz;
  v_staff uuid;v_room uuid;v_class uuid;v_branch uuid;v_mode text;v_status text;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'A lesson creation key is required';end if;
  if not exists(select 1 from public.users where id=p_actor_id and is_active) then raise exception 'An active account is required';end if;
  v_start:=(p_payload->>'starts_at')::timestamptz;v_end:=(p_payload->>'ends_at')::timestamptz;
  v_staff:=(p_payload->>'primary_staff_id')::uuid;v_class:=(p_payload->>'classroom_id')::uuid;
  v_branch:=(p_payload->>'branch_id')::uuid;v_room:=nullif(p_payload->>'room_id','')::uuid;
  v_mode:=lower(coalesce(nullif(p_payload->>'delivery_mode',''),'physical'));
  v_status:=lower(coalesce(nullif(p_payload->>'status',''),'scheduled'));
  select * into v from public.academy_lesson_sessions where academy_id=p_academy_id and idempotency_key=p_idempotency_key;
  if found then
    if row(v.branch_id,v.classroom_id,v.room_id,v.primary_staff_id,v.calendar_id,v.delivery_mode,v.session_type,v.starts_at,v.ends_at,v.title,v.source_schedule_id,v.source_session_id,v.timezone)
      is distinct from row(v_branch,v_class,v_room,v_staff,nullif(p_payload->>'calendar_id','')::uuid,v_mode,
        lower(coalesce(nullif(p_payload->>'session_type',''),'regular')),v_start,v_end,trim(p_payload->>'title'),
        nullif(p_payload->>'source_schedule_id','')::uuid,nullif(p_payload->>'source_session_id','')::uuid,coalesce(nullif(p_payload->>'timezone',''),'Asia/Tashkent')) then
      raise exception 'Lesson creation key already used for different inputs';end if;
    return to_jsonb(v);
  end if;
  if v_status not in('scheduled','confirmed') then raise exception 'New lessons must be scheduled or confirmed';end if;
  -- The booking trigger is the single validation point for every insert path.
  insert into public.academy_lesson_sessions(academy_id,branch_id,classroom_id,room_id,primary_staff_id,calendar_id,title,
    session_type,delivery_mode,starts_at,ends_at,timezone,status,source_schedule_id,source_session_id,idempotency_key,metadata,created_by,updated_by)
  values(p_academy_id,v_branch,v_class,v_room,v_staff,nullif(p_payload->>'calendar_id','')::uuid,trim(p_payload->>'title'),
    lower(coalesce(nullif(p_payload->>'session_type',''),'regular')),v_mode,v_start,v_end,coalesce(nullif(p_payload->>'timezone',''),'Asia/Tashkent'),
    v_status,nullif(p_payload->>'source_schedule_id','')::uuid,nullif(p_payload->>'source_session_id','')::uuid,p_idempotency_key,
    coalesce(p_payload->'metadata','{}'),p_actor_id,p_actor_id) returning * into v;
  insert into public.academy_session_staff_assignments(academy_id,session_id,staff_id,assignment_role,assigned_by,reason)
    values(p_academy_id,v.id,v_staff,'primary',p_actor_id,'Initial session teacher');
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,classroom_id,metadata)
    values(p_academy_id,p_actor_id,'session.created','academy_lesson_session',v.id::text,v.classroom_id,
      jsonb_build_object('starts_at',v.starts_at,'room_id',v.room_id,'staff_id',v.primary_staff_id));
  insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)
    values('session.created','v1','academy_lesson_session',v.id,p_actor_id,jsonb_build_object('academy_id',p_academy_id,'session_id',v.id,'classroom_id',v.classroom_id),
      'session.created:'||v.id::text);
  return to_jsonb(v);
end;
$$;
revoke all on function public.academy_create_lesson_session(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_create_lesson_session(uuid,uuid,jsonb,text) to service_role;

create or replace function public.academy_generate_timetable(
  p_academy_id uuid,p_term_id uuid,p_actor_id uuid,p_dry_run boolean,
  p_key text default null,p_branch_ids uuid[] default null,p_classroom_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path=public
  set statement_timeout='45s' set lock_timeout='5s' as $$
declare
  v_term public.academy_timetable_terms%rowtype;v_run public.academy_timetable_generation_runs%rowtype;
  v_scope jsonb;v_key text:=coalesce(nullif(trim(p_key),''),gen_random_uuid()::text);
  v_series uuid[];v_raw jsonb;v_row jsonb;v_new jsonb;v_existing uuid;v_closure uuid;
  v_conflicts jsonb:='[]';v_skipped jsonb:='[]';v_conflict_count integer:=0;v_skip_count integer:=0;
  v_count integer:=0;v_generated integer:=0;v_error text;v_evidence jsonb;v_failure boolean:=false;
begin
  if p_dry_run is null then raise exception 'Preview or commit mode is required';end if;
  if not exists(select 1 from public.users where id=p_actor_id and is_active) then raise exception 'An active account is required';end if;
  select * into v_term from public.academy_timetable_terms where academy_id=p_academy_id and id=p_term_id for update;
  if not found then raise exception 'Timetable term not found';end if;
  if v_term.status not in('draft','active') then raise exception 'Only draft or active terms can generate lessons';end if;
  if v_term.ends_on-v_term.starts_on>369 then raise exception 'Term cannot exceed 370 days';end if;
  if p_branch_ids is not null and (v_term.branch_id is null or not v_term.branch_id=any(p_branch_ids)) then raise exception 'Forbidden timetable branch';end if;
  v_scope:=jsonb_build_object('actor',p_actor_id,'term',p_term_id,'dry_run',p_dry_run,
    'branches',case when p_branch_ids is null then null else to_jsonb(array(select distinct unnest(p_branch_ids) order by 1)) end,
    'classrooms',case when p_classroom_ids is null then null else to_jsonb(array(select distinct unnest(p_classroom_ids) order by 1)) end);
  select * into v_run from public.academy_timetable_generation_runs where academy_id=p_academy_id and idempotency_key=v_key;
  if found then
    if v_run.request_scope is distinct from v_scope then raise exception 'Generation key already used for another command';end if;
    return jsonb_build_object('run',to_jsonb(v_run));
  end if;
  select array_agg(id order by id) into v_series from public.academy_timetable_series
    where academy_id=p_academy_id and term_id=p_term_id and status in('draft','active')
      and(p_branch_ids is null or branch_id=any(p_branch_ids))
      and(p_classroom_ids is null or classroom_id=any(p_classroom_ids));
  if coalesce(array_length(v_series,1),0)=0 then raise exception 'Add at least one eligible timetable series before generating';end if;
  if array_length(v_series,1)>500 then raise exception 'A generation request supports at most 500 series';end if;
  -- Lock source definitions in a deterministic order. No preview/commit can
  -- split a single term across two simultaneous generations.
  perform id from public.academy_timetable_series where academy_id=p_academy_id and id=any(v_series) order by id for update;
  perform id from public.academy_classroom_schedules where academy_id=p_academy_id and id in(
    select source_schedule_id from public.academy_timetable_series where academy_id=p_academy_id and id=any(v_series)) order by id for share;
  insert into public.academy_timetable_generation_runs(academy_id,term_id,dry_run,status,requested_by,idempotency_key,request_scope)
    values(p_academy_id,p_term_id,p_dry_run,'running',p_actor_id,v_key,v_scope) returning * into v_run;
  create temp table if not exists _academy_timetable_stage(
    id uuid default gen_random_uuid(),payload jsonb,room_id uuid,classroom_id uuid,staff_id uuid,starts_at timestamptz,ends_at timestamptz,
    slot tstzrange generated always as(tstzrange(starts_at,ends_at,'[)')) stored
  ) on commit drop;
  truncate pg_temp._academy_timetable_stage;
  create index if not exists _academy_timetable_room_idx on pg_temp._academy_timetable_stage using gist(room_id,slot);
  create index if not exists _academy_timetable_class_idx on pg_temp._academy_timetable_stage using gist(classroom_id,slot);
  create index if not exists _academy_timetable_teacher_idx on pg_temp._academy_timetable_stage using gist(staff_id,slot);
  select coalesce(jsonb_agg(to_jsonb(q) order by q.starts_at,q.series_id,q.occurrence_date),'[]') into v_raw from(
    select s.id as series_id,d::date as occurrence_date,s.branch_id,s.classroom_id,s.room_id,s.primary_staff_id,
      s.title,s.session_type,s.delivery_mode,s.skip_calendar_closures,s.source_schedule_id,
      coalesce(nullif(schedule.timezone,''),v_term.timezone) as timezone,
      (d::date+schedule.start_time) at time zone coalesce(nullif(schedule.timezone,''),v_term.timezone) as starts_at,
      case when schedule.end_time is null then ((d::date+schedule.start_time) at time zone coalesce(nullif(schedule.timezone,''),v_term.timezone))+interval '1 hour'
        else (d::date+schedule.end_time) at time zone coalesce(nullif(schedule.timezone,''),v_term.timezone) end as ends_at,
      (schedule.id is null or not schedule.is_active or schedule.classroom_id<>s.classroom_id
        or(((d::date+schedule.start_time) at time zone coalesce(nullif(schedule.timezone,''),v_term.timezone)) at time zone coalesce(nullif(schedule.timezone,''),v_term.timezone))<>(d::date+schedule.start_time)
        or(schedule.end_time is not null and (((d::date+schedule.end_time) at time zone coalesce(nullif(schedule.timezone,''),v_term.timezone)) at time zone coalesce(nullif(schedule.timezone,''),v_term.timezone))<>(d::date+schedule.end_time))
        or(v_term.branch_id is not null and s.branch_id<>v_term.branch_id)) as invalid_source
    from public.academy_timetable_series s
    left join public.academy_classroom_schedules schedule on schedule.academy_id=s.academy_id and schedule.id=s.source_schedule_id
    cross join lateral generate_series(greatest(s.starts_on,v_term.starts_on)::timestamp,least(s.ends_on,v_term.ends_on)::timestamp,interval '1 day') d
    where s.academy_id=p_academy_id and s.id=any(v_series) and (schedule.id is null or extract(dow from d)=schedule.day_of_week)
    limit 50001
  ) q;
  if jsonb_array_length(v_raw)>50000 then raise exception 'Generation exceeds 50000 occurrences; split the term';end if;
  for v_row in select value from jsonb_array_elements(v_raw) loop
    select id into v_existing from public.academy_lesson_sessions where academy_id=p_academy_id
      and timetable_series_id=(v_row->>'series_id')::uuid and timetable_occurrence_date=(v_row->>'occurrence_date')::date;
    if found then
      v_skip_count:=v_skip_count+1;
      if jsonb_array_length(v_skipped)<500 then v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('series_id',v_row->'series_id','date',v_row->'occurrence_date','reason','already_generated','session_id',v_existing));end if;
      continue;
    end if;
    select e.id into v_closure from public.academy_calendar_events e join public.academy_academic_calendars c on c.academy_id=e.academy_id and c.id=e.calendar_id
      where e.academy_id=p_academy_id and e.affects_schedule and(c.branch_id is null or c.branch_id=(v_row->>'branch_id')::uuid)
        and e.starts_at<(v_row->>'ends_at')::timestamptz and e.ends_at>(v_row->>'starts_at')::timestamptz limit 1;
    if found and(v_row->>'skip_calendar_closures')::boolean then
      v_skip_count:=v_skip_count+1;
      if jsonb_array_length(v_skipped)<500 then v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('series_id',v_row->'series_id','date',v_row->'occurrence_date','reason','calendar_closure','event_id',v_closure));end if;
      continue;
    end if;
    v_error:=null;
    begin
      if(v_row->>'invalid_source')::boolean then raise exception 'Series, term or recurring slot configuration is invalid';end if;
      perform public.academy_validate_lesson_booking(p_academy_id,(v_row->>'branch_id')::uuid,(v_row->>'classroom_id')::uuid,
        nullif(v_row->>'room_id','')::uuid,(v_row->>'primary_staff_id')::uuid,v_row->>'delivery_mode',(v_row->>'starts_at')::timestamptz,(v_row->>'ends_at')::timestamptz);
      if exists(select 1 from public.academy_lesson_sessions busy where busy.academy_id=p_academy_id
        and busy.status in('scheduled','confirmed','in_progress') and busy.starts_at<(v_row->>'ends_at')::timestamptz and busy.ends_at>(v_row->>'starts_at')::timestamptz
        and(busy.room_id=nullif(v_row->>'room_id','')::uuid or busy.classroom_id=(v_row->>'classroom_id')::uuid or busy.primary_staff_id=(v_row->>'primary_staff_id')::uuid))
        or exists(select 1 from pg_temp._academy_timetable_stage pending where pending.slot&&tstzrange((v_row->>'starts_at')::timestamptz,(v_row->>'ends_at')::timestamptz,'[)')
          and(pending.room_id=nullif(v_row->>'room_id','')::uuid or pending.classroom_id=(v_row->>'classroom_id')::uuid or pending.staff_id=(v_row->>'primary_staff_id')::uuid)) then
        raise exception 'Room, teacher or classroom conflicts with another lesson';end if;
    exception when others then v_error:=sqlerrm;end;
    if v_error is not null then
      v_conflict_count:=v_conflict_count+1;
      if jsonb_array_length(v_conflicts)<500 then v_conflicts:=v_conflicts||jsonb_build_array(jsonb_build_object('series_id',v_row->'series_id','date',v_row->'occurrence_date','reason',v_error));end if;
    else
      insert into pg_temp._academy_timetable_stage(payload,room_id,classroom_id,staff_id,starts_at,ends_at)
        values(v_row,nullif(v_row->>'room_id','')::uuid,(v_row->>'classroom_id')::uuid,(v_row->>'primary_staff_id')::uuid,(v_row->>'starts_at')::timestamptz,(v_row->>'ends_at')::timestamptz);
      v_count:=v_count+1;
    end if;
  end loop;
  select jsonb_build_object('conflicts',v_conflicts,'skipped',v_skipped,'candidates',coalesce(jsonb_agg(payload),'[]'),
    'conflicts_truncated',v_conflict_count>500,'skipped_truncated',v_skip_count>500,'candidates_truncated',v_count>500)
    into v_evidence from(select payload from pg_temp._academy_timetable_stage order by starts_at,payload->>'series_id' limit 500) q;
  if not p_dry_run and v_conflict_count=0 then
    begin
      if not exists(select 1 from public.users where id=p_actor_id and is_active) then raise exception 'An active account is required';end if;
      if exists(select 1 from public.academy_lesson_sessions saved join pg_temp._academy_timetable_stage pending
        on saved.academy_id=p_academy_id and saved.idempotency_key='timetable:'||(pending.payload->>'series_id')||':'||(pending.payload->>'occurrence_date')) then
        raise exception 'A lesson creation key is already in use without its occurrence identity';end if;
      insert into public.academy_lesson_sessions(id,academy_id,branch_id,classroom_id,room_id,primary_staff_id,calendar_id,title,session_type,
        delivery_mode,starts_at,ends_at,timezone,status,source_schedule_id,idempotency_key,metadata,created_by,updated_by,
        timetable_term_id,timetable_series_id,timetable_occurrence_date,timetable_generation_run_id)
      select id,p_academy_id,(payload->>'branch_id')::uuid,classroom_id,room_id,staff_id,v_term.academic_calendar_id,payload->>'title',
        payload->>'session_type',payload->>'delivery_mode',starts_at,ends_at,payload->>'timezone','scheduled',(payload->>'source_schedule_id')::uuid,
        'timetable:'||(payload->>'series_id')||':'||(payload->>'occurrence_date'),jsonb_build_object('timetable_generated',true),p_actor_id,p_actor_id,
        p_term_id,(payload->>'series_id')::uuid,(payload->>'occurrence_date')::date,v_run.id
      from pg_temp._academy_timetable_stage order by starts_at,payload->>'series_id';
      get diagnostics v_generated=row_count;
      insert into public.academy_session_staff_assignments(academy_id,session_id,staff_id,assignment_role,assigned_by,reason)
        select p_academy_id,id,staff_id,'primary',p_actor_id,'Initial session teacher' from pg_temp._academy_timetable_stage;
      insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,classroom_id,metadata)
        select p_academy_id,p_actor_id,'session.created','academy_lesson_session',id::text,classroom_id,
          jsonb_build_object('starts_at',starts_at,'room_id',room_id,'staff_id',staff_id) from pg_temp._academy_timetable_stage;
      insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)
        select 'session.created','v1','academy_lesson_session',id,p_actor_id,
          jsonb_build_object('academy_id',p_academy_id,'session_id',id,'classroom_id',classroom_id),'session.created:'||id::text
        from pg_temp._academy_timetable_stage;
      update public.academy_timetable_series set status='active' where academy_id=p_academy_id and id=any(v_series);
      update public.academy_timetable_terms set status='active' where academy_id=p_academy_id and id=p_term_id;
    exception when others then v_failure:=true;v_error:=sqlerrm;v_generated:=0;end;
  end if;
  update public.academy_timetable_generation_runs set status=case when p_dry_run then 'preview_ready' when v_failure or v_conflict_count>0 then 'failed' else 'completed' end,
    candidate_count=v_count,conflict_count=v_conflict_count,skipped_count=v_skip_count,generated_count=v_generated,evidence=v_evidence,
    error=case when v_failure then v_error when not p_dry_run and v_conflict_count>0 then 'Resolve timetable conflicts before committing' else null end,finished_at=now()
    where academy_id=p_academy_id and id=v_run.id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run));
end;
$$;

revoke all on function public.academy_booking_time_allowed(uuid,text,uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.academy_validate_lesson_booking(uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.academy_lesson_booking_guard() from public,anon,authenticated;
revoke all on function public.academy_generate_timetable(uuid,uuid,uuid,boolean,text,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.academy_generate_timetable(uuid,uuid,uuid,boolean,text,uuid[],uuid[]) to service_role;
