begin;
alter table public.proctor_sessions add column assignment_revision integer not null default 0 check(assignment_revision>=0);
create index proctor_sessions_workload_page on public.proctor_sessions(tenant_id,created_at,id);
create index proctor_registrations_window on public.assessment_registrations(tenant_id,window_id,id);
-- Legacy session.assign and new reviewed batches share the same revision fence.
create function public.proctor_assignment_revision() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if tg_op='INSERT' or tg_op='DELETE' or (new.active,new.assigned_by) is distinct from(old.active,old.assigned_by) then
  update public.proctor_sessions set assignment_revision=assignment_revision+1 where id=coalesce(new.session_id,old.session_id);
 end if;return null;
end;$$;
create trigger proctor_assignment_revision after insert or update or delete on public.proctor_assignments for each row execute function public.proctor_assignment_revision();

create function public.proctor_workload_read(p_actor uuid,p_tenant uuid,p_data jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare manager boolean:=public.assessment_has_capability(p_tenant,p_actor,'proctor.manage');lim integer:=coalesce((p_data->>'limit')::integer,25);state_filter text:=coalesce(p_data->>'state','all');assignment_filter text:=coalesce(p_data->>'assignment','all');result jsonb;cursor jsonb;begin
 if not manager and not(public.assessment_has_capability(p_tenant,p_actor,'proctor.observe') or public.assessment_has_capability(p_tenant,p_actor,'proctor.review')) then raise exception 'proctor_access_required' using errcode='42501';end if;
 if lim not between 1 and 50 or state_filter not in('all','preparing','active','paused','completed') or assignment_filter not in('all','mine','unassigned') then raise exception 'invalid_workload_filter' using errcode='22023';end if;
 if assignment_filter='unassigned' and not manager then raise exception 'supervisor_required' using errcode='42501';end if;
 if p_data->'after' is not null and p_data->'after'<>'null'::jsonb and (p_data#>>'{after,created_at}' is null or p_data#>>'{after,id}' is null) then raise exception 'invalid_workload_cursor' using errcode='22023';end if;
 with page as materialized(
 select s.*,w.id window_id,w.title window_title,coalesce(nullif(to_jsonb(u)->>'full_name',''),nullif(to_jsonb(u)->>'name',''),u.id::text) candidate_name
 from public.proctor_sessions s join public.assessment_registrations r on r.id=s.registration_id join public.assessment_exam_windows w on w.id=r.window_id join public.users u on u.id=s.candidate_id
 where s.tenant_id=p_tenant and(manager or public.proctor_can_access(p_tenant,s.id,p_actor))
 and(state_filter='all' or s.state=state_filter) and(p_data->>'window_id' is null or w.id=(p_data->>'window_id')::uuid) and(p_data->>'candidate_id' is null or s.candidate_id=(p_data->>'candidate_id')::uuid)
 and(assignment_filter<>'mine' or exists(select 1 from public.proctor_assignments a where a.session_id=s.id and a.active and a.user_id=p_actor and public.assessment_has_capability(p_tenant,a.user_id,case a.assignment_role when 'observer' then 'proctor.observe' else 'proctor.review' end)))
 and(assignment_filter<>'unassigned' or not exists(select 1 from public.proctor_assignments a where a.session_id=s.id and a.active and a.assignment_role='observer' and public.assessment_has_capability(p_tenant,a.user_id,'proctor.observe')))
 and(p_data#>>'{after,id}' is null or(s.created_at,s.id)>((p_data#>>'{after,created_at}')::timestamptz,(p_data#>>'{after,id}')::uuid))
 order by s.created_at,s.id limit lim+1),visible as(select * from page order by created_at,id limit lim)
 select coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'candidate_id',s.candidate_id,'candidate_name',s.candidate_name,'window_id',s.window_id,'window_title',s.window_title,'state',s.state,'monitoring_mode',s.policy_snapshot->>'mode','created_at',s.created_at,'assignment_revision',s.assignment_revision,'can_observe',public.proctor_can_access(p_tenant,s.id,p_actor,'observer'),'last_heartbeat_at',s.last_heartbeat_at,'loss_since',(select loss_since from public.proctor_capture_watchdogs where session_id=s.id),'observers',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'name',coalesce(nullif(to_jsonb(staff)->>'full_name',''),nullif(to_jsonb(staff)->>'name',''),staff.id::text)) order by a.user_id) from public.proctor_assignments a join public.users staff on staff.id=a.user_id where a.session_id=s.id and a.active and a.assignment_role='observer' and(manager or a.user_id=p_actor) and public.assessment_has_capability(p_tenant,a.user_id,'proctor.observe')),'[]'::jsonb)) order by s.created_at,s.id) from visible s),'[]'::jsonb),
 case when(select count(*) from page)>lim then(select jsonb_build_object('created_at',created_at,'id',id) from visible order by created_at desc,id desc limit 1) else null end into result,cursor;
 return jsonb_build_object('rows',result,'next',cursor,'manager',manager,'server_time',clock_timestamp());
end;$$;

create function public.proctor_workload_staff(p_actor uuid,p_tenant uuid,p_role text,p_after uuid default null,p_limit integer default 25) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;next_id uuid;begin
 if not public.assessment_has_capability(p_tenant,p_actor,'proctor.manage') then raise exception 'supervisor_required' using errcode='42501';end if;
 if p_role is null or p_role not in('observer','reviewer') or p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_workload_filter' using errcode='22023';end if;
 with page as materialized(select u.id,coalesce(nullif(to_jsonb(u)->>'full_name',''),nullif(to_jsonb(u)->>'name',''),u.id::text) name from public.users u
 where(p_after is null or u.id>p_after) and((exists(select 1 from public.tenant_memberships m where m.tenant_id=p_tenant and m.user_id=u.id and m.status='active') and public.assessment_has_capability(p_tenant,u.id,case p_role when 'observer' then 'proctor.observe' else 'proctor.review' end)) or exists(select 1 from public.proctor_assignments a where a.tenant_id=p_tenant and a.user_id=u.id and a.active and a.assignment_role=p_role)) order by u.id limit p_limit+1),visible as(select * from page order by id limit p_limit)
 select coalesce((select jsonb_agg(jsonb_build_object('user_id',u.id,'name',u.name,'eligible',public.assessment_has_capability(p_tenant,u.id,case p_role when 'observer' then 'proctor.observe' else 'proctor.review' end),'active_assignments',(select count(*) from public.proctor_assignments a join public.proctor_sessions s on s.id=a.session_id where a.tenant_id=p_tenant and a.user_id=u.id and a.active and a.assignment_role=p_role and s.state<>'completed')) order by u.id) from visible u),'[]'::jsonb),
 case when(select count(*) from page)>p_limit then(select id from visible order by id desc limit 1) else null end into result,next_id;
 return jsonb_build_object('rows',result,'next',next_id,'server_time',clock_timestamp());
end;$$;

create table public.proctor_workload_commands(tenant_id uuid not null references public.tenants(id),actor_id uuid not null references public.users(id),idempotency_key text not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key));
alter table public.proctor_workload_commands enable row level security;
create function public.proctor_workload_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.proctor_workload_commands;request jsonb:=jsonb_build_object('action',p_action,'data',p_data);target jsonb;s public.proctor_sessions;userid uuid:=(p_data->>'user_id')::uuid;role_name text:=p_data->>'role';rows jsonb:='[]';rid uuid;result jsonb;begin
 -- Hold the actual organization/grant rows through commit. Concurrent removal
 -- cannot cross a successful assignment's authority check unnoticed.
 perform 1 from public.tenant_memberships where tenant_id=p_tenant and user_id in(p_actor,userid) order by user_id,role for share;
 perform 1 from public.assessment_capability_grants where tenant_id=p_tenant and user_id in(p_actor,userid) order by user_id,capability for share;
 if not public.assessment_has_capability(p_tenant,p_actor,'proctor.manage') then raise exception 'supervisor_required' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 or p_action is null or p_action not in('assignment.set','assignment.remove') or role_name is null or role_name not in('observer','reviewer') or userid is null or coalesce(length(btrim(p_data->>'reason')),0) not between 10 and 2000 or jsonb_typeof(p_data->'targets')<>'array' or coalesce(jsonb_array_length(p_data->'targets'),0) not between 1 and 50 then raise exception 'invalid_assignment_change' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||p_key,0));
 select * into prior from public.proctor_workload_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if(select count(distinct value->>'session_id') from jsonb_array_elements(p_data->'targets'))<>jsonb_array_length(p_data->'targets') then raise exception 'duplicate_assignment_target' using errcode='22023';end if;
 -- Sorted session locks serialize bulk changes with legacy per-session assigns.
 for target in select value from jsonb_array_elements(p_data->'targets') order by value->>'session_id' loop
  select * into s from public.proctor_sessions where tenant_id=p_tenant and id=(target->>'session_id')::uuid for update;
  if not found then raise exception 'session_not_found' using errcode='P0002';end if;
  if target->>'expected_revision' is null or(target->>'expected_revision')::integer<>s.assignment_revision then raise exception 'assignment_revision_conflict' using errcode='23505';end if;
  if p_action='assignment.set' and(s.state='completed' or s.candidate_id=userid) then raise exception 'invalid_assignment_target' using errcode='23514';end if;
 end loop;
 if p_action='assignment.set' and not public.assessment_has_capability(p_tenant,userid,case role_name when 'observer' then 'proctor.observe' else 'proctor.review' end) then raise exception 'assignee_capability_required' using errcode='23514';end if;
 for target in select value from jsonb_array_elements(p_data->'targets') order by value->>'session_id' loop
  if p_action='assignment.set' then
   insert into public.proctor_assignments(tenant_id,session_id,user_id,assignment_role,assigned_by) values(p_tenant,(target->>'session_id')::uuid,userid,role_name,p_actor) on conflict(session_id,user_id,assignment_role) do update set active=true,assigned_by=excluded.assigned_by returning id into rid;
  else update public.proctor_assignments set active=false,assigned_by=p_actor where tenant_id=p_tenant and session_id=(target->>'session_id')::uuid and user_id=userid and assignment_role=role_name returning id into rid;end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('session_id',target->>'session_id','assignment_id',rid,'revision',(select assignment_revision from public.proctor_sessions where id=(target->>'session_id')::uuid)));rid:=null;
 end loop;
 result:=jsonb_build_object('rows',rows,'action',p_action,'user_id',userid,'role',role_name);
 insert into public.proctor_workload_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.workload.'||p_action,userid,jsonb_build_object('role',role_name,'reason',p_data->>'reason','sessions',rows));return result;
end;$$;
revoke all on public.proctor_workload_commands from public,anon,authenticated,service_role;
revoke all on function public.proctor_assignment_revision() from public,anon,authenticated,service_role;
revoke all on function public.proctor_workload_read(uuid,uuid,jsonb),public.proctor_workload_staff(uuid,uuid,text,uuid,integer),public.proctor_workload_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.proctor_workload_read(uuid,uuid,jsonb),public.proctor_workload_staff(uuid,uuid,text,uuid,integer),public.proctor_workload_command(uuid,uuid,text,text,jsonb) to service_role;
commit;
