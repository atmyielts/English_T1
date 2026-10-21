-- Dated operational cohorts. Existing rosters establish a baseline now; they
-- never manufacture historical teacher assignments or historical departures.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- The initial roster and its teacher snapshots must be one consistent baseline.
-- Refuse a busy source immediately rather than waiting behind live operations.
lock table public.academy_classroom_memberships,public.academy_classrooms,public.academy_staff in share row exclusive mode nowait;
create table public.academy_retention_coverage(
 academy_id uuid primary key references public.tenants(id) on delete restrict,
 covered_from timestamptz not null
);
create table public.academy_retention_membership_events(
 id bigint generated always as identity primary key,
 academy_id uuid not null references public.tenants(id) on delete restrict,
 membership_id uuid not null,contact_id uuid not null,classroom_id uuid not null,branch_id uuid,
 observed_at timestamptz not null default clock_timestamp(),status text not null,
 removed boolean not null default false,withdrawn_at timestamptz,completed_at timestamptz,
 teacher_ids uuid[] not null default '{}',is_correction boolean not null default false,
 source_kind text not null
);
-- These source identifiers intentionally do not add new inbound foreign keys
-- to imported contacts/groups. The existing lifecycle log owns their retention
-- constraints; an observation must not turn an unchanged import into later use.
create index academy_retention_membership_asof on public.academy_retention_membership_events(academy_id,membership_id,observed_at desc,id desc);
create index academy_retention_class_asof on public.academy_retention_membership_events(academy_id,classroom_id,observed_at desc);
create index academy_retention_contact_asof on public.academy_retention_membership_events(academy_id,contact_id,observed_at desc);
-- Automatic roster observations are not subsequent learner use. Keep every
-- foreign-key and contextual activity guard, excluding only this private log
-- from the two contextual discovery queries. Corrections append new evidence.
do $recovery$
declare definition text;marker text;replacement text;target regprocedure;
begin
 target:='public.academy_student_import_reference_plan()'::regprocedure;
 definition:=pg_get_functiondef(target);
 marker:=$marker$and n.nspname not in('pg_catalog','information_schema') and c.oid<>to_regclass('public.academy_classroom_memberships')$marker$;
 replacement:=marker||$replacement$ and c.oid<>to_regclass('public.academy_retention_membership_events')$replacement$;
 if(length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Mapped import reference discovery changed; review observation classification';end if;
 execute replace(definition,marker,replacement);
 target:='public.academy_legacy_import_used(text,jsonb,uuid)'::regprocedure;
 definition:=pg_get_functiondef(target);
 marker:=$marker$and c.oid<>'public.academy_classroom_memberships'::regclass$marker$;
 replacement:=marker||$replacement$ and c.oid<>to_regclass('public.academy_retention_membership_events')$replacement$;
 if(length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Legacy import reference discovery changed; review observation classification';end if;
 execute replace(definition,marker,replacement);
end;$recovery$;
alter table public.academy_retention_coverage enable row level security;
alter table public.academy_retention_membership_events enable row level security;
revoke all on public.academy_retention_coverage,public.academy_retention_membership_events from public,anon,authenticated;
grant all on public.academy_retention_coverage,public.academy_retention_membership_events to service_role;
grant usage,select on sequence public.academy_retention_membership_events_id_seq to service_role;
create trigger academy_retention_events_immutable before update or delete on public.academy_retention_membership_events for each row execute function public.academy_reject_operational_finance_history_mutation();

create function public.academy_capture_retention_membership(p_row jsonb,p_source text,p_removed boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare academy uuid:=(p_row->>'academy_id')::uuid;classroom uuid:=(p_row->>'classroom_id')::uuid;teachers uuid[];branch uuid;stamp timestamptz:=clock_timestamp();
begin
 if p_row->>'role'<>'student' then return;end if;
 select c.branch_id into branch from public.academy_classrooms c where c.academy_id=academy and c.id=classroom;
 select coalesce(array_agg(s.id order by s.id),'{}') into teachers from public.academy_staff s
 where s.academy_id=academy and s.is_active and s.role='teacher' and coalesce(s.classroom_ids,'[]')@>jsonb_build_array(classroom);
 insert into public.academy_retention_coverage(academy_id,covered_from) values(academy,stamp) on conflict(academy_id) do nothing;
 insert into public.academy_retention_membership_events(academy_id,membership_id,contact_id,classroom_id,branch_id,observed_at,status,removed,withdrawn_at,completed_at,teacher_ids,is_correction,source_kind)
 values(academy,(p_row->>'id')::uuid,(p_row->>'contact_id')::uuid,classroom,branch,stamp,coalesce(p_row->>'status','unknown'),p_removed,nullif(p_row->>'withdrawn_at','')::timestamptz,nullif(p_row->>'completed_at','')::timestamptz,teachers,
  coalesce(p_row->'metadata','{}')?'import_recovery_run_id' or coalesce(p_row->'metadata'->>'legacy_import_recovered','false')='true',p_source);
end;$$;
revoke all on function public.academy_capture_retention_membership(jsonb,text,boolean) from public,anon,authenticated,service_role;

-- Serialize roster/teacher snapshots on the same classroom keys. Snapshot
-- reads do not take staff row locks while another staff write owns its row.
create function public.academy_retention_change_lock() returns trigger language plpgsql security definer set search_path=public as $$
declare old_row jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 new_row jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;class_id uuid;
begin
 if tg_table_name='academy_staff' then
  for class_id in select distinct value::uuid from jsonb_array_elements_text(coalesce(old_row->'classroom_ids','[]')||coalesce(new_row->'classroom_ids','[]')) order by 1 loop
   perform pg_advisory_xact_lock(hashtextextended('retention-class:'||class_id::text,0));
  end loop;
 elsif tg_table_name='academy_classrooms' then
  perform pg_advisory_xact_lock(hashtextextended('retention-class:'||coalesce(new_row->>'id',old_row->>'id'),0));
 else
  raise exception using errcode='22023',message='Unsupported retention capture source';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
-- Membership keys are scalar fields, rather than a JSON array of staff scopes.
create function public.academy_retention_membership_lock() returns trigger language plpgsql security definer set search_path=public as $$
declare ids uuid[];class_id uuid;
begin
 ids:=case when tg_op='INSERT' then array[new.classroom_id] when tg_op='DELETE' then array[old.classroom_id] else array[old.classroom_id,new.classroom_id] end;
 for class_id in select distinct value from unnest(ids) value order by value loop perform pg_advisory_xact_lock(hashtextextended('retention-class:'||class_id::text,0));end loop;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
create function public.academy_retention_membership_changed() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' then perform public.academy_capture_retention_membership(to_jsonb(old),'membership_removed',true);return old;end if;
 if tg_op='UPDATE' and row(old.academy_id,old.contact_id,old.classroom_id,old.role) is distinct from row(new.academy_id,new.contact_id,new.classroom_id,new.role) then
  perform public.academy_capture_retention_membership(to_jsonb(old),'membership_transferred_out',true);
 end if;
 perform public.academy_capture_retention_membership(to_jsonb(new),'membership_'||lower(tg_op),false);return new;
end;$$;
create function public.academy_retention_assignment_changed() returns trigger language plpgsql security definer set search_path=public as $$
declare old_row jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 new_row jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;member public.academy_classroom_memberships;
begin
 if tg_table_name='academy_staff' then
  for member in select m.* from public.academy_classroom_memberships m
   where m.academy_id=coalesce((new_row->>'academy_id')::uuid,(old_row->>'academy_id')::uuid) and m.role='student'
   and (coalesce(old_row->'classroom_ids','[]')||coalesce(new_row->'classroom_ids','[]'))@>jsonb_build_array(m.classroom_id)
   order by m.classroom_id,m.id loop perform public.academy_capture_retention_membership(to_jsonb(member),'teacher_assignment',false);end loop;
 else
  for member in select m.* from public.academy_classroom_memberships m where m.academy_id=new.academy_id and m.classroom_id=new.id and m.role='student' order by m.id loop
   perform public.academy_capture_retention_membership(to_jsonb(member),'classroom_branch',false);
  end loop;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function public.academy_retention_change_lock(),public.academy_retention_membership_lock(),public.academy_retention_membership_changed(),public.academy_retention_assignment_changed() from public,anon,authenticated,service_role;
create trigger academy_retention_membership_lock before insert or update or delete on public.academy_classroom_memberships for each row execute function public.academy_retention_membership_lock();
create trigger academy_retention_membership_capture after insert or update of status,withdrawn_at,completed_at,classroom_id,contact_id,role,metadata or delete on public.academy_classroom_memberships for each row execute function public.academy_retention_membership_changed();
create trigger academy_retention_staff_lock before insert or update of classroom_ids,is_active,role or delete on public.academy_staff for each row execute function public.academy_retention_change_lock();
create trigger academy_retention_staff_capture after insert or update of classroom_ids,is_active,role or delete on public.academy_staff for each row execute function public.academy_retention_assignment_changed();
create trigger academy_retention_class_lock before update of branch_id on public.academy_classrooms for each row execute function public.academy_retention_change_lock();
create trigger academy_retention_class_capture after update of branch_id on public.academy_classrooms for each row execute function public.academy_retention_assignment_changed();
-- No live learner status, teacher assignment or financial value is changed.
do $baseline$
declare member public.academy_classroom_memberships;
begin
 for member in select m.* from public.academy_classroom_memberships m where m.role='student' order by m.academy_id,m.classroom_id,m.id loop
  perform public.academy_capture_retention_membership(to_jsonb(member),'baseline',false);
 end loop;
end;$baseline$;
update public.academy_retention_coverage c set covered_from=(select max(e.observed_at) from public.academy_retention_membership_events e where e.academy_id=c.academy_id);

create function public.academy_teacher_retention_read(p_academy uuid,p_actor uuid,p_from timestamptz,p_to timestamptz,p_branch uuid default null)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='30s' as $$
declare auths jsonb;allowed uuid[];classes uuid[];class_row record;coverage timestamptz;rows jsonb;result jsonb;more boolean;complete boolean;
begin
 if p_from is null or p_to is null or p_to<=p_from or p_to>clock_timestamp() or p_to-p_from>interval '366 days' then raise exception using errcode='22023',message='Choose a recorded period of at most 366 days';end if;
 auths:=public.academy_current_authorities(p_academy,p_actor);
 select coalesce(array_agg(c.id order by c.id),'{}') into allowed from public.academy_classrooms c where c.academy_id=p_academy and(p_branch is null or c.branch_id=p_branch)
 and public.academy_command_covers(auths,'viewStaffPerformance',jsonb_build_object('kind','classroom','classroom_id',c.id,'branch_id',c.branch_id));
 if cardinality(allowed)=0 and not public.academy_command_covers(auths,'viewStaffPerformance',jsonb_build_object('kind',case when p_branch is null then 'academy' else 'branch' end,'branch_id',p_branch)) then raise exception using errcode='42501',message='Current access does not cover this retention report';end if;
 for class_row in select c.id,c.branch_id from public.academy_classrooms c where c.academy_id=p_academy and c.id=any(allowed) order by c.id for share loop
  perform public.academy_assert_current_capability(p_academy,p_actor,'viewStaffPerformance',jsonb_build_object('kind','classroom','classroom_id',class_row.id,'branch_id',class_row.branch_id));
 end loop;
 select covered_from into coverage from public.academy_retention_coverage where academy_id=p_academy;
 complete:=coverage is not null and p_from>=coverage;
 if complete then
  with start_state as materialized(
   select distinct on(e.membership_id) e.* from public.academy_retention_membership_events e where e.academy_id=p_academy and e.classroom_id=any(allowed) and e.observed_at<=p_from order by e.membership_id,e.observed_at desc,e.id desc
  ),end_state as materialized(
   select distinct on(e.membership_id) e.* from public.academy_retention_membership_events e where e.academy_id=p_academy and e.observed_at<=p_to order by e.membership_id,e.observed_at desc,e.id desc
  ),baseline as materialized(
   select s.*,t.teacher from start_state s cross join lateral unnest(s.teacher_ids)t(teacher) where not s.removed and s.status in('active','trial','paused') and not s.is_correction
  ),valid as materialized(
   select b.* from baseline b where not exists(select 1 from public.academy_retention_membership_events e where e.academy_id=p_academy and e.membership_id=b.membership_id and e.is_correction and e.observed_at<=p_to)
  ),cohort as materialized(
   select distinct teacher,contact_id from valid
  ),classified as(
   select c.*,
    exists(select 1 from end_state e where e.contact_id=c.contact_id and not e.removed and not e.is_correction and e.status in('active','trial','paused') and c.teacher=any(e.teacher_ids)) retained,
    exists(select 1 from end_state e where e.contact_id=c.contact_id and not e.removed and not e.is_correction and e.status='paused' and c.teacher=any(e.teacher_ids))
     and not exists(select 1 from end_state e where e.contact_id=c.contact_id and not e.removed and not e.is_correction and e.status in('active','trial') and c.teacher=any(e.teacher_ids)) paused,
    exists(select 1 from end_state e where e.contact_id=c.contact_id and not e.removed and not e.is_correction and e.status in('active','trial','paused')) academy_retained,
    exists(select 1 from end_state e where e.contact_id=c.contact_id and not e.removed and not e.is_correction and e.status in('active','trial','paused') and cardinality(e.teacher_ids)>0) assigned_elsewhere,
    exists(select 1 from end_state e where e.contact_id=c.contact_id and not e.removed and not e.is_correction and e.status='withdrawn' and e.withdrawn_at>=p_from and e.withdrawn_at<=p_to) explicit_departure,
    exists(select 1 from end_state e where e.contact_id=c.contact_id and not e.removed and not e.is_correction and e.status='completed' and e.completed_at>=p_from and e.completed_at<=p_to)
     and not exists(select 1 from valid v left join end_state e on e.membership_id=v.membership_id where v.teacher=c.teacher and v.contact_id=c.contact_id and(e.id is null or e.removed or e.status<>'completed' or e.completed_at is null or e.completed_at<p_from or e.completed_at>p_to)) explicit_completion
   from cohort c
  ),counts as(
   select teacher,count(*)::integer cohort_size,count(*)filter(where retained)::integer retained_students,count(*)filter(where retained and paused)::integer paused_students,
    count(*)filter(where not retained and academy_retained and assigned_elsewhere)::integer teacher_transfers,
    count(*)filter(where not academy_retained and explicit_departure)::integer academy_departures,
    count(*)filter(where not academy_retained and not explicit_departure and explicit_completion)::integer completed_students,
    count(*)filter(where not retained and not(academy_retained and assigned_elsewhere) and not(not academy_retained and(explicit_departure or explicit_completion)))::integer unresolved_changes from classified group by teacher
  ),excluded as(
   select b.teacher,count(distinct b.contact_id)::integer excluded_corrections from baseline b where not exists(select 1 from cohort c where c.teacher=b.teacher and c.contact_id=b.contact_id) group by b.teacher
  ),teachers as(
   select teacher from baseline union select s.id from public.academy_staff s where s.academy_id=p_academy and s.role='teacher' and s.is_active and exists(select 1 from unnest(allowed) c where coalesce(s.classroom_ids,'[]')@>jsonb_build_array(c))
  ),report as(
   select t.teacher staff_id,coalesce(s.display_name,'Former teacher') display_name,coalesce(c.cohort_size,0) cohort_size,coalesce(c.retained_students,0) retained_students,coalesce(c.paused_students,0) paused_students,
    coalesce(c.teacher_transfers,0) teacher_transfers,coalesce(c.academy_departures,0) academy_departures,coalesce(c.completed_students,0) completed_students,
    coalesce(c.cohort_size-c.completed_students,0) retention_denominator,coalesce(c.unresolved_changes,0) unresolved_changes,coalesce(x.excluded_corrections,0) excluded_corrections,
    case when c.cohort_size>c.completed_students and c.unresolved_changes=0 then round(c.retained_students::numeric/(c.cohort_size-c.completed_students)*100,2) end teacher_retention_percent,
    case when c.cohort_size>c.completed_students and c.unresolved_changes=0 then round((c.cohort_size-c.completed_students-c.academy_departures)::numeric/(c.cohort_size-c.completed_students)*100,2) end academy_retention_percent
   from teachers t left join public.academy_staff s on s.academy_id=p_academy and s.id=t.teacher left join counts c on c.teacher=t.teacher left join excluded x on x.teacher=t.teacher order by coalesce(s.display_name,'Former teacher'),t.teacher limit 501
  )select coalesce(jsonb_agg(to_jsonb(report)),'[]') into rows from report;
 else rows:='[]';end if;
 more:=jsonb_array_length(rows)>500;if more then rows:=rows-500;end if;
 result:=jsonb_build_object('schema_version',1,'actor_id',p_actor,'academy_id',p_academy,'from',p_from,'to',p_to,'branch_id',p_branch,'covered_from',coverage,'history_complete',complete,'rows',rows,'has_more',more,
  'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name)order by b.name,b.id),'[]') from public.academy_branches b where b.academy_id=p_academy and exists(select 1 from public.academy_classrooms c where c.academy_id=p_academy and c.branch_id=b.id and public.academy_command_covers(auths,'viewStaffPerformance',jsonb_build_object('kind','classroom','classroom_id',c.id,'branch_id',c.branch_id)))));
 if public.academy_current_authorities(p_academy,p_actor) is distinct from auths then raise exception using errcode='42501',message='Current retention access changed; refresh the report';end if;
 return result;
end;$$;
revoke all on function public.academy_teacher_retention_read(uuid,uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.academy_teacher_retention_read(uuid,uuid,timestamptz,timestamptz,uuid) to service_role;
commit;
