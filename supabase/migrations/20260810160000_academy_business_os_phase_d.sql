-- Education Business OS Phase D: actual sessions, capacity, exceptions, substitutions, and quality evidence.
create extension if not exists btree_gist;
create unique index if not exists academy_rooms_academy_id_id_uidx on public.academy_rooms(academy_id,id);
create unique index if not exists academy_classroom_schedules_academy_id_id_uidx on public.academy_classroom_schedules(academy_id,id);
create unique index if not exists academy_attendance_academy_id_id_uidx on public.academy_attendance(academy_id,id);
alter table public.academy_classrooms add column if not exists student_capacity integer check(student_capacity is null or student_capacity>=0);

create table public.academy_academic_calendars(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,
 branch_id uuid,name text not null,starts_on date not null,ends_on date not null,status text not null default 'draft' check(status in('draft','active','closed','cancelled')),
 timezone text not null default 'Asia/Tashkent',metadata jsonb not null default '{}'::jsonb,created_by uuid references public.users(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(academy_id,id),
 foreign key(academy_id,branch_id) references public.academy_branches(academy_id,id) on delete restrict,check(ends_on>=starts_on)
);
create table public.academy_calendar_events(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,calendar_id uuid not null,
 event_type text not null check(event_type in('holiday','closure','exam','term_break','special_schedule','other')),name text not null,
 starts_at timestamptz not null,ends_at timestamptz not null,affects_billing boolean not null default false,affects_schedule boolean not null default true,
 reason text,metadata jsonb not null default '{}'::jsonb,created_by uuid references public.users(id) on delete set null,created_at timestamptz not null default now(),
 unique(academy_id,id),foreign key(academy_id,calendar_id) references public.academy_academic_calendars(academy_id,id) on delete restrict,check(ends_at>starts_at)
);
create table public.academy_staff_availability(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,staff_id uuid not null,
 day_of_week smallint not null check(day_of_week between 0 and 6),starts_at time not null,ends_at time not null,timezone text not null default 'Asia/Tashkent',
 available boolean not null default true,effective_from date not null default current_date,effective_to date,reason text,is_active boolean not null default true,
 created_by uuid references public.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(academy_id,id),foreign key(academy_id,staff_id) references public.academy_staff(academy_id,id) on delete cascade,
 check(ends_at>starts_at),check(effective_to is null or effective_to>=effective_from)
);
create table public.academy_room_availability(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,room_id uuid not null,
 day_of_week smallint not null check(day_of_week between 0 and 6),starts_at time not null,ends_at time not null,timezone text not null default 'Asia/Tashkent',
 available boolean not null default true,effective_from date not null default current_date,effective_to date,reason text,is_active boolean not null default true,
 created_by uuid references public.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(academy_id,id),foreign key(academy_id,room_id) references public.academy_rooms(academy_id,id) on delete cascade,
 check(ends_at>starts_at),check(effective_to is null or effective_to>=effective_from)
);

create table public.academy_lesson_sessions(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,
 branch_id uuid not null,classroom_id uuid not null,room_id uuid,primary_staff_id uuid not null,calendar_id uuid,
 title text not null,session_type text not null default 'regular' check(session_type in('regular','trial','make_up','exam','workshop','individual','other')),
 delivery_mode text not null default 'physical' check(delivery_mode in('physical','online','hybrid')),
 starts_at timestamptz not null,ends_at timestamptz not null,timezone text not null default 'Asia/Tashkent',
 status text not null default 'scheduled' check(status in('scheduled','confirmed','in_progress','completed','cancelled','rescheduled','missed')),
 source_schedule_id uuid,source_session_id uuid,cancellation_reason text,rescheduled_to_session_id uuid,
 idempotency_key text not null,metadata jsonb not null default '{}'::jsonb,created_by uuid references public.users(id) on delete set null,
 updated_by uuid references public.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 slot tstzrange generated always as(tstzrange(starts_at,ends_at,'[)')) stored,
 unique(academy_id,id),unique(academy_id,idempotency_key),
 foreign key(academy_id,branch_id) references public.academy_branches(academy_id,id) on delete restrict,
 foreign key(academy_id,classroom_id) references public.academy_classrooms(academy_id,id) on delete restrict,
 foreign key(academy_id,room_id) references public.academy_rooms(academy_id,id) on delete restrict,
 foreign key(academy_id,primary_staff_id) references public.academy_staff(academy_id,id) on delete restrict,
 foreign key(academy_id,calendar_id) references public.academy_academic_calendars(academy_id,id) on delete restrict,
 foreign key(academy_id,source_schedule_id) references public.academy_classroom_schedules(academy_id,id) on delete restrict,
 foreign key(academy_id,source_session_id) references public.academy_lesson_sessions(academy_id,id) on delete restrict,
 foreign key(academy_id,rescheduled_to_session_id) references public.academy_lesson_sessions(academy_id,id) on delete restrict,
 check(ends_at>starts_at),check(delivery_mode<>'physical' or room_id is not null)
);
alter table public.academy_lesson_sessions add constraint academy_sessions_teacher_no_overlap exclude using gist(academy_id with =,primary_staff_id with =,slot with &&) where(status in('scheduled','confirmed','in_progress'));
alter table public.academy_lesson_sessions add constraint academy_sessions_room_no_overlap exclude using gist(academy_id with =,room_id with =,slot with &&) where(room_id is not null and status in('scheduled','confirmed','in_progress'));
alter table public.academy_lesson_sessions add constraint academy_sessions_classroom_no_overlap exclude using gist(academy_id with =,classroom_id with =,slot with &&) where(status in('scheduled','confirmed','in_progress'));

create table public.academy_session_staff_assignments(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,session_id uuid not null,
 staff_id uuid not null,assignment_role text not null check(assignment_role in('primary','assistant','substitute','observer')),
 replaces_staff_id uuid,reason text,assigned_by uuid references public.users(id) on delete set null,assigned_at timestamptz not null default now(),
 ended_at timestamptz,metadata jsonb not null default '{}'::jsonb,unique(academy_id,id),
 foreign key(academy_id,session_id) references public.academy_lesson_sessions(academy_id,id) on delete restrict,
 foreign key(academy_id,staff_id) references public.academy_staff(academy_id,id) on delete restrict,
 foreign key(academy_id,replaces_staff_id) references public.academy_staff(academy_id,id) on delete restrict
);
create unique index academy_session_one_current_primary_idx on public.academy_session_staff_assignments(academy_id,session_id) where assignment_role in('primary','substitute') and ended_at is null;

alter table public.academy_attendance drop constraint if exists academy_attendance_classroom_id_contact_id_session_date_key;
alter table public.academy_attendance add column if not exists session_id uuid;
alter table public.academy_attendance add constraint academy_attendance_session_fk foreign key(academy_id,session_id) references public.academy_lesson_sessions(academy_id,id) on delete restrict;
create unique index academy_attendance_legacy_unique_idx on public.academy_attendance(classroom_id,contact_id,session_date) where session_id is null;
create unique index academy_attendance_session_unique_idx on public.academy_attendance(academy_id,session_id,contact_id) where session_id is not null;

create table public.academy_attendance_exceptions(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,attendance_id uuid not null,
 exception_type text not null check(exception_type in('illness','approved_absence','late_excused','technical_issue','academy_cancelled','holiday','other')),
 effect text not null check(effect in('none','make_up_eligible','credit_eligible','transferred_lesson','attendance_override')),
 reason text not null,status text not null default 'approved' check(status in('requested','approved','rejected','applied','cancelled')),
 approved_by uuid references public.users(id) on delete set null,created_by uuid references public.users(id) on delete set null,
 created_at timestamptz not null default now(),metadata jsonb not null default '{}'::jsonb,unique(academy_id,id),
 foreign key(academy_id,attendance_id) references public.academy_attendance(academy_id,id) on delete restrict
);
create table public.academy_make_up_lessons(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,contact_id uuid not null,
 original_session_id uuid not null,replacement_session_id uuid,attendance_exception_id uuid,
 make_up_type text not null default 'make_up' check(make_up_type in('make_up','transferred_lesson','holiday_extension','manual_credit')),
 status text not null default 'requested' check(status in('requested','approved','scheduled','delivered','credited','rejected','cancelled')),
 expires_on date,reason text not null,approved_by uuid references public.users(id) on delete set null,
 idempotency_key text not null,created_by uuid references public.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(academy_id,id),unique(academy_id,idempotency_key),foreign key(academy_id,contact_id) references public.academy_contacts(academy_id,id) on delete restrict,
 foreign key(academy_id,original_session_id) references public.academy_lesson_sessions(academy_id,id) on delete restrict,
 foreign key(academy_id,replacement_session_id) references public.academy_lesson_sessions(academy_id,id) on delete restrict,
 foreign key(academy_id,attendance_exception_id) references public.academy_attendance_exceptions(academy_id,id) on delete restrict
);
create table public.academy_session_quality_reviews(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,session_id uuid not null,
 reviewer_user_id uuid not null references public.users(id) on delete restrict,review_type text not null default 'observation' check(review_type in('observation','student_feedback','parent_feedback','academic_audit','incident_review')),
 score numeric(5,2) check(score is null or score between 0 and 100),strengths text,improvements text,action_required boolean not null default false,
 action_owner_user_id uuid references public.users(id) on delete set null,action_due_on date,status text not null default 'completed' check(status in('draft','completed','follow_up','resolved')),
 metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(academy_id,id),
 foreign key(academy_id,session_id) references public.academy_lesson_sessions(academy_id,id) on delete restrict
);

create or replace view public.academy_room_capacity_summary with(security_invoker=true) as
select r.academy_id,r.id room_id,r.branch_id,r.name,r.capacity,
 coalesce(s.occupied_minutes,0)::bigint occupied_minutes,coalesce(a.available_minutes,0)::bigint available_minutes,
 greatest(coalesce(a.available_minutes,0)-coalesce(s.occupied_minutes,0),0)::bigint unused_minutes,
 case when coalesce(a.available_minutes,0)>0 then round(coalesce(s.occupied_minutes,0)::numeric/a.available_minutes*100,2) else null end utilization_percent
from public.academy_rooms r
left join(select academy_id,room_id,sum(extract(epoch from(ends_at-starts_at))/60)::bigint occupied_minutes from public.academy_lesson_sessions where room_id is not null and status in('scheduled','confirmed','in_progress','completed') group by academy_id,room_id)s on s.academy_id=r.academy_id and s.room_id=r.id
left join(select academy_id,room_id,sum(extract(epoch from(ends_at-starts_at))/60)::bigint available_minutes from public.academy_room_availability where available and is_active group by academy_id,room_id)a on a.academy_id=r.academy_id and a.room_id=r.id;

create or replace view public.academy_room_peak_periods with(security_invoker=true) as
select academy_id,room_id,extract(isodow from starts_at)::smallint day_of_week,
 extract(hour from starts_at)::smallint hour_of_day,count(*)::integer session_count,
 sum(extract(epoch from(ends_at-starts_at))/60)::bigint occupied_minutes
from public.academy_lesson_sessions
where room_id is not null and status in('scheduled','confirmed','in_progress','completed')
group by academy_id,room_id,extract(isodow from starts_at),extract(hour from starts_at);

create or replace view public.academy_classroom_capacity_summary with(security_invoker=true) as
select c.academy_id,c.id classroom_id,c.name,c.student_capacity,coalesce(m.enrolled_students,0)::integer enrolled_students,
 case when coalesce(c.student_capacity,0)>0 then round(coalesce(m.enrolled_students,0)::numeric/c.student_capacity*100,2) else null end fill_percent,
 coalesce(att.attendance_rate,0)::numeric attendance_rate
from public.academy_classrooms c
left join(select academy_id,classroom_id,count(*)::integer enrolled_students from public.academy_classroom_memberships where role='student' and status='active' group by academy_id,classroom_id)m on m.academy_id=c.academy_id and m.classroom_id=c.id
left join(select academy_id,classroom_id,round(100.0*count(*) filter(where status in('present','late'))/nullif(count(*),0),2) attendance_rate from public.academy_attendance group by academy_id,classroom_id)att on att.academy_id=c.academy_id and att.classroom_id=c.id;

create or replace function public.academy_create_lesson_session(p_academy_id uuid,p_actor_id uuid,p_payload jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.academy_lesson_sessions%rowtype;v_start timestamptz;v_end timestamptz;v_staff uuid;v_room uuid;v_class uuid;v_branch uuid;v_mode text;v_enrolled int;v_capacity int;
begin select * into v from public.academy_lesson_sessions where academy_id=p_academy_id and idempotency_key=p_idempotency_key;if found then return to_jsonb(v);end if;
 v_start:=(p_payload->>'starts_at')::timestamptz;v_end:=(p_payload->>'ends_at')::timestamptz;v_staff:=(p_payload->>'primary_staff_id')::uuid;v_class:=(p_payload->>'classroom_id')::uuid;v_branch:=(p_payload->>'branch_id')::uuid;v_room:=nullif(p_payload->>'room_id','')::uuid;v_mode:=lower(coalesce(nullif(p_payload->>'delivery_mode',''),'physical'));
 if v_end<=v_start then raise exception 'Session end must be after start';end if;if v_mode='physical' and v_room is null then raise exception 'Physical sessions require a room';end if;
 if exists(select 1 from public.academy_calendar_events e join public.academy_academic_calendars c on c.academy_id=e.academy_id and c.id=e.calendar_id where e.academy_id=p_academy_id and e.affects_schedule and e.starts_at<v_end and e.ends_at>v_start and(c.branch_id is null or c.branch_id=v_branch)) then raise exception 'Session conflicts with an academic calendar closure';end if;
 if exists(select 1 from public.academy_staff_availability a where a.academy_id=p_academy_id and a.staff_id=v_staff and a.is_active and v_start::date between a.effective_from and coalesce(a.effective_to,'infinity'::date)) and not exists(select 1 from public.academy_staff_availability a where a.academy_id=p_academy_id and a.staff_id=v_staff and a.is_active and a.available and extract(dow from(v_start at time zone a.timezone))=a.day_of_week and(v_start at time zone a.timezone)::time>=a.starts_at and(v_end at time zone a.timezone)::time<=a.ends_at and v_start::date between a.effective_from and coalesce(a.effective_to,'infinity'::date)) then raise exception 'Teacher is unavailable for this session';end if;
 if v_room is not null and exists(select 1 from public.academy_room_availability a where a.academy_id=p_academy_id and a.room_id=v_room and a.is_active and v_start::date between a.effective_from and coalesce(a.effective_to,'infinity'::date)) and not exists(select 1 from public.academy_room_availability a where a.academy_id=p_academy_id and a.room_id=v_room and a.is_active and a.available and extract(dow from(v_start at time zone a.timezone))=a.day_of_week and(v_start at time zone a.timezone)::time>=a.starts_at and(v_end at time zone a.timezone)::time<=a.ends_at and v_start::date between a.effective_from and coalesce(a.effective_to,'infinity'::date)) then raise exception 'Room is unavailable for this session';end if;
 select count(*) into v_enrolled from public.academy_classroom_memberships where academy_id=p_academy_id and classroom_id=v_class and role='student' and status='active';select least(coalesce(c.student_capacity,2147483647),coalesce(r.capacity,2147483647)) into v_capacity from public.academy_classrooms c left join public.academy_rooms r on r.academy_id=c.academy_id and r.id=v_room where c.academy_id=p_academy_id and c.id=v_class;if v_enrolled>v_capacity then raise exception 'Session room/classroom capacity is below active enrollment';end if;
 insert into public.academy_lesson_sessions(academy_id,branch_id,classroom_id,room_id,primary_staff_id,calendar_id,title,session_type,delivery_mode,starts_at,ends_at,timezone,status,source_schedule_id,source_session_id,idempotency_key,metadata,created_by,updated_by)
 values(p_academy_id,v_branch,v_class,v_room,v_staff,nullif(p_payload->>'calendar_id','')::uuid,trim(p_payload->>'title'),lower(coalesce(nullif(p_payload->>'session_type',''),'regular')),v_mode,v_start,v_end,coalesce(nullif(p_payload->>'timezone',''),'Asia/Tashkent'),lower(coalesce(nullif(p_payload->>'status',''),'scheduled')),nullif(p_payload->>'source_schedule_id','')::uuid,nullif(p_payload->>'source_session_id','')::uuid,p_idempotency_key,coalesce(p_payload->'metadata','{}'),p_actor_id,p_actor_id)returning * into v;
 insert into public.academy_session_staff_assignments(academy_id,session_id,staff_id,assignment_role,assigned_by,reason)values(p_academy_id,v.id,v_staff,'primary',p_actor_id,'Initial session teacher');
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,classroom_id,metadata)values(p_academy_id,p_actor_id,'session.created','academy_lesson_session',v.id::text,v.classroom_id,jsonb_build_object('starts_at',v.starts_at,'room_id',v.room_id,'staff_id',v.primary_staff_id));
 insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)values('session.created','v1','academy_lesson_session',v.id,p_actor_id,jsonb_build_object('academy_id',p_academy_id,'session_id',v.id,'classroom_id',v.classroom_id),'session.created:'||v.id::text);return to_jsonb(v);
end;$$;

create or replace function public.academy_transition_lesson_session(p_academy_id uuid,p_session_id uuid,p_actor_id uuid,p_next_status text,p_payload jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$declare v public.academy_lesson_sessions%rowtype;v_next text:=lower(trim(p_next_status));v_new jsonb;v_minutes int;v_students int;
begin select * into v from public.academy_lesson_sessions where academy_id=p_academy_id and id=p_session_id for update;if not found then raise exception 'Session not found';end if;
 if exists(select 1 from public.domain_event_outbox where idempotency_key='session.transition:'||p_idempotency_key) then return jsonb_build_object('session',to_jsonb(v));end if;
 if v_next='rescheduled' and v.status in('scheduled','confirmed') then v_new:=public.academy_create_lesson_session(p_academy_id,p_actor_id,jsonb_build_object('branch_id',v.branch_id,'classroom_id',v.classroom_id,'room_id',coalesce(nullif(p_payload->>'room_id','')::uuid,v.room_id),'primary_staff_id',coalesce(nullif(p_payload->>'primary_staff_id','')::uuid,v.primary_staff_id),'calendar_id',v.calendar_id,'title',v.title,'session_type',v.session_type,'delivery_mode',v.delivery_mode,'starts_at',p_payload->>'starts_at','ends_at',p_payload->>'ends_at','timezone',v.timezone,'source_session_id',v.id),p_idempotency_key||':replacement');update public.academy_lesson_sessions set status='rescheduled',rescheduled_to_session_id=(v_new->>'id')::uuid,updated_by=p_actor_id,updated_at=now() where academy_id=p_academy_id and id=v.id returning * into v;
 elsif(v.status in('scheduled','confirmed') and v_next in('confirmed','in_progress','cancelled','missed'))or(v.status='in_progress' and v_next in('completed','cancelled')) then update public.academy_lesson_sessions set status=v_next,cancellation_reason=case when v_next='cancelled' then nullif(trim(p_payload->>'reason'),'') else cancellation_reason end,updated_by=p_actor_id,updated_at=now() where academy_id=p_academy_id and id=v.id returning * into v;
 else raise exception 'Invalid session transition';end if;
 if v_next='cancelled' and nullif(trim(p_payload->>'reason'),'') is null then raise exception 'Cancellation reason is required';end if;
 if v_next='completed' then v_minutes:=greatest(round(extract(epoch from(v.ends_at-v.starts_at))/60),1);select count(*) into v_students from public.academy_attendance where academy_id=p_academy_id and session_id=v.id and status in('present','late');insert into public.academy_lesson_deliveries(academy_id,branch_id,classroom_id,staff_id,delivered_on,started_at,ended_at,duration_minutes,delivery_status,student_count,verified_by,idempotency_key,metadata)values(p_academy_id,v.branch_id,v.classroom_id,v.primary_staff_id,(v.starts_at at time zone v.timezone)::date,v.starts_at,v.ends_at,v_minutes,'delivered',v_students,p_actor_id,'session:'||v.id::text,jsonb_build_object('session_id',v.id))on conflict(academy_id,idempotency_key)do nothing;end if;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,classroom_id,metadata)values(p_academy_id,p_actor_id,'session.'||v_next,'academy_lesson_session',v.id::text,v.classroom_id,jsonb_build_object('reason',p_payload->>'reason','replacement_session_id',v_new->>'id'));
 insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)values('session.'||v_next,'v1','academy_lesson_session',v.id,p_actor_id,jsonb_build_object('academy_id',p_academy_id,'session_id',v.id,'status',v_next,'replacement',v_new),'session.transition:'||p_idempotency_key);return jsonb_build_object('session',to_jsonb(v),'replacement',v_new);
end;$$;

create or replace function public.academy_assign_session_substitute(p_academy_id uuid,p_session_id uuid,p_staff_id uuid,p_actor_id uuid,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$declare v public.academy_lesson_sessions%rowtype;v_assignment public.academy_session_staff_assignments%rowtype;v_old uuid;
begin select * into v_assignment from public.academy_session_staff_assignments where academy_id=p_academy_id and metadata->>'idempotency_key'=p_idempotency_key;if found then return jsonb_build_object('session',(select to_jsonb(s) from public.academy_lesson_sessions s where s.id=p_session_id),'assignment',to_jsonb(v_assignment));end if;
 select * into v from public.academy_lesson_sessions where academy_id=p_academy_id and id=p_session_id and status in('scheduled','confirmed') for update;if not found then raise exception 'Substitutable session not found';end if;v_old:=v.primary_staff_id;
 update public.academy_session_staff_assignments set ended_at=now() where academy_id=p_academy_id and session_id=p_session_id and ended_at is null and assignment_role in('primary','substitute');
 update public.academy_lesson_sessions set primary_staff_id=p_staff_id,updated_by=p_actor_id,updated_at=now() where academy_id=p_academy_id and id=p_session_id returning * into v;
 insert into public.academy_session_staff_assignments(academy_id,session_id,staff_id,assignment_role,replaces_staff_id,reason,assigned_by,metadata)values(p_academy_id,p_session_id,p_staff_id,'substitute',v_old,trim(p_reason),p_actor_id,jsonb_build_object('idempotency_key',p_idempotency_key))returning * into v_assignment;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,classroom_id,metadata)values(p_academy_id,p_actor_id,'session.substitute_assigned','academy_lesson_session',p_session_id::text,v.classroom_id,jsonb_build_object('old_staff_id',v_old,'new_staff_id',p_staff_id,'reason',p_reason));return jsonb_build_object('session',to_jsonb(v),'assignment',to_jsonb(v_assignment));end;$$;

create or replace function public.academy_record_session_attendance(p_academy_id uuid,p_session_id uuid,p_contact_id uuid,p_actor_id uuid,p_status text,p_notes text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_session public.academy_lesson_sessions%rowtype;v_attendance public.academy_attendance%rowtype;v_status text:=lower(trim(p_status));
begin
 if v_status not in('present','absent','late','excused') then raise exception 'Invalid attendance status';end if;
 select * into v_session from public.academy_lesson_sessions where academy_id=p_academy_id and id=p_session_id;
 if not found then raise exception 'Session not found';end if;
 if not exists(select 1 from public.academy_classroom_memberships where academy_id=p_academy_id and classroom_id=v_session.classroom_id and contact_id=p_contact_id and role='student' and status='active') then raise exception 'Student is not actively enrolled in this classroom';end if;
 insert into public.academy_attendance(academy_id,classroom_id,contact_id,session_id,session_date,status,notes,marked_by,marked_at)
 values(p_academy_id,v_session.classroom_id,p_contact_id,p_session_id,(v_session.starts_at at time zone v_session.timezone)::date,v_status,nullif(trim(p_notes),''),p_actor_id,now())
 on conflict(academy_id,session_id,contact_id) where session_id is not null do update set status=excluded.status,notes=excluded.notes,marked_by=excluded.marked_by,marked_at=excluded.marked_at
 returning * into v_attendance;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,classroom_id,metadata)
 values(p_academy_id,p_actor_id,'attendance.session_recorded','academy_attendance',v_attendance.id::text,p_contact_id,v_session.classroom_id,jsonb_build_object('session_id',p_session_id,'status',v_status));
 return to_jsonb(v_attendance);
end;$$;

revoke all on function public.academy_create_lesson_session(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_transition_lesson_session(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_assign_session_substitute(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.academy_record_session_attendance(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.academy_create_lesson_session(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_transition_lesson_session(uuid,uuid,uuid,text,jsonb,text) to service_role;
grant execute on function public.academy_assign_session_substitute(uuid,uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.academy_record_session_attendance(uuid,uuid,uuid,uuid,text,text) to service_role;

alter table public.academy_academic_calendars enable row level security;alter table public.academy_calendar_events enable row level security;
alter table public.academy_staff_availability enable row level security;alter table public.academy_room_availability enable row level security;
alter table public.academy_lesson_sessions enable row level security;alter table public.academy_session_staff_assignments enable row level security;
alter table public.academy_attendance_exceptions enable row level security;alter table public.academy_make_up_lessons enable row level security;alter table public.academy_session_quality_reviews enable row level security;
create policy "Academy academic calendars read by staff" on public.academy_academic_calendars for select using(public.academy_org_can_view(academy_id));
create policy "Academy calendar events read by staff" on public.academy_calendar_events for select using(public.academy_org_can_view(academy_id));
create policy "Academy staff availability read by staff" on public.academy_staff_availability for select using(public.academy_org_can_view(academy_id));
create policy "Academy room availability read by staff" on public.academy_room_availability for select using(public.academy_org_can_view(academy_id));
create policy "Academy lesson sessions read by staff" on public.academy_lesson_sessions for select using(public.academy_org_can_view(academy_id));
create policy "Academy session assignments read by staff" on public.academy_session_staff_assignments for select using(public.academy_org_can_view(academy_id));
create policy "Academy attendance exceptions read by staff" on public.academy_attendance_exceptions for select using(public.academy_org_can_view(academy_id));
create policy "Academy makeups read by staff" on public.academy_make_up_lessons for select using(public.academy_org_can_view(academy_id));
create policy "Academy quality reviews read by staff" on public.academy_session_quality_reviews for select using(public.academy_org_can_view(academy_id));
