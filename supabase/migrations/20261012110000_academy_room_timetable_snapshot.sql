-- A bounded, single-snapshot reader. The Edge caller must authorize the Academy
-- and physical branch before invoking this service-only RPC.
create or replace function public.academy_room_timetable_branches(p_academy_id uuid,p_branch_ids uuid[] default null)
returns jsonb language sql stable security definer set search_path=public as $$
  with bounded as materialized (
    select id,name,timezone,is_active from public.academy_branches
    where academy_id=p_academy_id and (p_branch_ids is null or id=any(p_branch_ids))
    order by name,id limit 201
  ), visible as (select * from bounded order by name,id limit 200)
  select jsonb_build_object('branches',coalesce((select jsonb_agg(to_jsonb(b) order by b.name,b.id) from visible b),'[]'::jsonb),
    'truncated',(select count(*) from bounded)>200);
$$;
revoke all on function public.academy_room_timetable_branches(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.academy_room_timetable_branches(uuid,uuid[]) to service_role;

create or replace function public.academy_room_timetable_snapshot(
  p_academy_id uuid,p_branch_id uuid,p_from date,p_days integer
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_branch public.academy_branches%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if p_from is null or p_days is null or p_days not in(1,7,14) then
    raise exception 'A start date and a 1, 7 or 14 day window are required';
  end if;
  select * into v_branch from public.academy_branches
    where academy_id=p_academy_id and id=p_branch_id;
  if not found then raise exception 'Branch not found';end if;
  v_start:=p_from::timestamp at time zone v_branch.timezone;
  v_end:=(p_from+p_days)::timestamp at time zone v_branch.timezone;
  if v_end<=v_start then raise exception 'Branch date window is invalid';end if;

  with room_source as materialized (
    select id,name,capacity,is_active from public.academy_rooms
    where academy_id=p_academy_id and branch_id=p_branch_id
    order by name,id limit 201
  ), room_rows as (select * from room_source order by name,id limit 200),
  session_source as materialized (
    select s.id,s.classroom_id,c.name as classroom_name,s.room_id,
      s.primary_staff_id,t.display_name as teacher_name,s.title,s.delivery_mode,
      s.starts_at,s.ends_at,s.status,s.rescheduled_to_session_id,
      (r.id is not null and r.branch_id<>p_branch_id) as room_branch_mismatch
    from public.academy_lesson_sessions s
    left join public.academy_classrooms c on c.academy_id=s.academy_id and c.id=s.classroom_id
    left join public.academy_staff t on t.academy_id=s.academy_id and t.id=s.primary_staff_id
    left join public.academy_rooms r on r.academy_id=s.academy_id and r.id=s.room_id
    where s.academy_id=p_academy_id and s.branch_id=p_branch_id
      and s.starts_at<v_end and s.ends_at>v_start
    order by s.starts_at,s.id limit 5001
  ), session_rows as (select * from session_source order by starts_at,id limit 5000),
  closure_source as materialized (
    select e.id,e.name,e.starts_at,e.ends_at from public.academy_calendar_events e
    join public.academy_academic_calendars c on c.academy_id=e.academy_id and c.id=e.calendar_id
    where e.academy_id=p_academy_id and e.affects_schedule
      and (c.branch_id is null or c.branch_id=p_branch_id)
      and e.starts_at<v_end and e.ends_at>v_start
    order by e.starts_at,e.id limit 501
  ), closure_rows as (select * from closure_source order by starts_at,id limit 500),
  series_source as materialized (
    select s.id,s.classroom_id,c.name as classroom_name,s.room_id,
      s.primary_staff_id,t.display_name as teacher_name,s.title,s.delivery_mode,
      s.skip_calendar_closures,s.source_schedule_id,q.day_of_week,q.start_time,q.end_time,
      coalesce(nullif(q.timezone,''),term.timezone) as timezone,
      greatest(s.starts_on,term.starts_on,p_from-2) as starts_on,
      least(s.ends_on,term.ends_on,p_from+p_days+1) as ends_on,
      (q.id is null or not q.is_active or q.classroom_id<>s.classroom_id or not c.is_active
        or s.primary_staff_id is null or t.id is null or not t.is_active
        or (term.branch_id is not null and term.branch_id<>p_branch_id)
        or (s.delivery_mode<>'online' and (r.id is null or not r.is_active or r.branch_id<>p_branch_id))) as needs_setup
    from public.academy_timetable_series s
    join public.academy_timetable_terms term on term.academy_id=s.academy_id and term.id=s.term_id
    join public.academy_classrooms c on c.academy_id=s.academy_id and c.id=s.classroom_id
    left join public.academy_classroom_schedules q on q.academy_id=s.academy_id and q.id=s.source_schedule_id
    left join public.academy_rooms r on r.academy_id=s.academy_id and r.id=s.room_id
    left join public.academy_staff t on t.academy_id=s.academy_id and t.id=s.primary_staff_id
    where s.academy_id=p_academy_id and s.status='active' and term.status='active'
      and coalesce(s.branch_id,term.branch_id,c.branch_id)=p_branch_id
      and s.starts_on<=p_from+p_days+1 and s.ends_on>=p_from-2
      and term.starts_on<=p_from+p_days+1 and term.ends_on>=p_from-2
    order by s.id limit 1001
  ), series_rows as (select * from series_source order by id limit 1000),
  occurrence_source as materialized (
    select s.*,d::date as occurrence_date,
      (d::date+s.start_time) at time zone s.timezone as starts_at,
      case when s.end_time is null
        then ((d::date+s.start_time) at time zone s.timezone)+interval '1 hour'
        else (d::date+s.end_time) at time zone s.timezone end as ends_at,
      (((d::date+s.start_time) at time zone s.timezone) at time zone s.timezone)<>(d::date+s.start_time)
        or (s.end_time is not null and (((d::date+s.end_time) at time zone s.timezone) at time zone s.timezone)<>(d::date+s.end_time)) as invalid_local_time
    from series_rows s
    cross join lateral generate_series(s.starts_on::timestamp,s.ends_on::timestamp,interval '1 day') d
    where not s.needs_setup and extract(dow from d)=s.day_of_week
  ), projected_source as materialized (
    select o.id as series_id,o.occurrence_date,o.classroom_id,o.classroom_name,o.room_id,
      o.primary_staff_id,o.teacher_name,o.title,o.delivery_mode,o.starts_at,o.ends_at,
      exists(select 1 from public.academy_lesson_sessions busy
        where busy.academy_id=p_academy_id and busy.status in('scheduled','confirmed','in_progress')
          and busy.starts_at<o.ends_at and busy.ends_at>o.starts_at
          and (busy.primary_staff_id=o.primary_staff_id or busy.classroom_id=o.classroom_id
            or (o.room_id is not null and busy.room_id=o.room_id))) as has_recorded_conflict
    from occurrence_source o
    where not o.invalid_local_time and o.ends_at>o.starts_at and o.starts_at<v_end and o.ends_at>v_start
      -- Any recorded occurrence, including cancellation or rescheduling, owns
      -- the recurrence identity. Never resurrect its old slot as a new plan.
      and not exists(select 1 from public.academy_lesson_sessions s
        where s.academy_id=p_academy_id and s.timetable_series_id=o.id
          and s.timetable_occurrence_date=o.occurrence_date)
      and not(o.skip_calendar_closures and exists(
        select 1 from public.academy_calendar_events e
        join public.academy_academic_calendars c on c.academy_id=e.academy_id and c.id=e.calendar_id
        where e.academy_id=p_academy_id and e.affects_schedule
          and (c.branch_id is null or c.branch_id=p_branch_id)
          and e.starts_at<o.ends_at and e.ends_at>o.starts_at))
    order by o.starts_at,o.id limit 5001
  ), projected_rows as (select * from projected_source order by starts_at,series_id limit 5000),
  unassigned_source as materialized (
    select q.id,q.classroom_id,c.name as classroom_name,q.day_of_week,q.start_time,q.end_time,q.timezone
    from public.academy_classroom_schedules q
    join public.academy_classrooms c on c.academy_id=q.academy_id and c.id=q.classroom_id
    where q.academy_id=p_academy_id and c.branch_id=p_branch_id and c.is_active and q.is_active
      and exists(select 1 from generate_series(p_from::timestamp,(p_from+p_days-1)::timestamp,interval '1 day') d
        where extract(dow from d)=q.day_of_week)
      and not exists(select 1 from series_rows s where s.source_schedule_id=q.id)
    order by c.name,q.id limit 201
  ), unassigned_rows as (select * from unassigned_source order by classroom_name,id limit 200)
  select jsonb_build_object(
    'schema_version',1,'generated_at',now(),
    'branch',jsonb_build_object('id',v_branch.id,'name',v_branch.name,'timezone',v_branch.timezone,'is_active',v_branch.is_active),
    'from',p_from,'days',p_days,'starts_at',v_start,'ends_at',v_end,
    'rooms',coalesce((select jsonb_agg(to_jsonb(r) order by r.name,r.id) from room_rows r),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(to_jsonb(s) order by s.starts_at,s.id) from session_rows s),'[]'::jsonb),
    'planned',coalesce((select jsonb_agg(to_jsonb(o) order by o.starts_at,o.series_id) from projected_rows o),'[]'::jsonb),
    'closures',coalesce((select jsonb_agg(to_jsonb(c) order by c.starts_at,c.id) from closure_rows c),'[]'::jsonb),
    'unassigned_schedules',coalesce((select jsonb_agg(to_jsonb(q) order by q.classroom_name,q.id) from unassigned_rows q),'[]'::jsonb),
    'warnings',jsonb_build_object(
      'series_needing_setup',(select count(*) from series_rows where needs_setup),
      'invalid_occurrences',(select count(*) from occurrence_source where (invalid_local_time or ends_at<=starts_at) and starts_at>=v_start and starts_at<v_end),
      'room_branch_mismatches',(select count(*) from session_source where room_branch_mismatch),
      'rooms_truncated',(select count(*) from room_source)>200,
      'sessions_truncated',(select count(*) from session_source)>5000,
      'series_truncated',(select count(*) from series_source)>1000,
      'plans_truncated',(select count(*) from projected_source)>5000,
      'closures_truncated',(select count(*) from closure_source)>500,
      'unassigned_truncated',(select count(*) from unassigned_source)>200
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.academy_room_timetable_snapshot(uuid,uuid,date,integer) from public,anon,authenticated;
grant execute on function public.academy_room_timetable_snapshot(uuid,uuid,date,integer) to service_role;
