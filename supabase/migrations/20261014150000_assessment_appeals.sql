begin;
-- Appeals are academic review requests, not Proctor findings or direct score edits.
create table public.assessment_result_appeals (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,attempt_id uuid not null,
 run_id uuid not null,score_revision_id uuid not null references public.assessment_score_revisions(id),
 candidate_id uuid not null references public.users(id),category text not null check(category in('scoring','procedure','accessibility')),
 reason text not null check(length(btrim(reason)) between 1 and 5000),
 status text not null default 'submitted' check(status in('submitted','withdrawn','upheld','regrade_requested')),
 revision integer not null default 1 check(revision between 1 and 2),created_at timestamptz not null default clock_timestamp(),
 decided_at timestamptz,decided_by uuid references public.users(id),explanation text,
 requested_generation integer check(requested_generation>1),
 unique(tenant_id,id),unique(tenant_id,score_revision_id),
 foreign key(tenant_id,attempt_id) references public.assessment_attempts(tenant_id,id),
 foreign key(tenant_id,run_id) references public.assessment_grading_runs(tenant_id,id),
 check((status='submitted')=(decided_at is null)),check((status='submitted')=(decided_by is null)),
 check((status='submitted')=(explanation is null)),
 check(explanation is null or length(btrim(explanation)) between 1 and 5000),
 check((status='regrade_requested')=(requested_generation is not null))
);
create index assessment_appeals_queue on public.assessment_result_appeals(tenant_id,status,id);
create index assessment_appeals_candidate on public.assessment_result_appeals(tenant_id,candidate_id,id);
create table public.assessment_appeal_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,appeal_id uuid not null,
 revision integer not null,event text not null check(event in('submitted','withdrawn','upheld','regrade_requested')),
 actor_id uuid not null references public.users(id),explanation text not null check(length(btrim(explanation)) between 1 and 5000),
 created_at timestamptz not null default clock_timestamp(),unique(appeal_id,revision),
 foreign key(tenant_id,appeal_id) references public.assessment_result_appeals(tenant_id,id)
);
create trigger immutable_record before update or delete on public.assessment_appeal_events for each row execute function public.assessment_immutable();
create table public.assessment_appeal_commands (
 tenant_id uuid not null,actor_id uuid not null references public.users(id),idempotency_key text not null,
 request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,actor_id,idempotency_key)
);
create trigger immutable_record before update or delete on public.assessment_appeal_commands for each row execute function public.assessment_immutable();
alter table public.assessment_result_appeals enable row level security;
alter table public.assessment_appeal_events enable row level security;
alter table public.assessment_appeal_commands enable row level security;
revoke all on public.assessment_result_appeals,public.assessment_appeal_events,public.assessment_appeal_commands from public,anon,authenticated;
grant all on public.assessment_result_appeals,public.assessment_appeal_events,public.assessment_appeal_commands to service_role;

create function public.assessment_appeal_independent(p_actor uuid,p_run uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.assessment_grading_runs r join public.assessment_attempts a on a.id=r.attempt_id
 where r.id=p_run and a.candidate_id<>p_actor and r.approved_by is distinct from p_actor)
 and not exists(select 1 from public.assessment_grading_releases where run_id=p_run and released_by=p_actor)
 and not exists(select 1 from public.assessment_grading_marks m join public.assessment_grading_assignments x on x.id=m.assignment_id
 join public.assessment_grading_tasks t on t.id=x.task_id where t.run_id=p_run and m.created_by=p_actor)
 and not exists(select 1 from public.assessment_grading_adjudications d join public.assessment_grading_tasks t on t.id=d.task_id where t.run_id=p_run and d.created_by=p_actor);
$$;
create function public.assessment_appeal_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'immutable_appeal' using errcode='23514';end if;
 if old.status<>'submitted' or new.status='submitted' or new.revision<>old.revision+1
 or (to_jsonb(new)-array['status','revision','decided_at','decided_by','explanation','requested_generation'])
 is distinct from (to_jsonb(old)-array['status','revision','decided_at','decided_by','explanation','requested_generation'])
 then raise exception 'immutable_appeal' using errcode='23514';end if;return new;
end; $$;
create trigger assessment_appeal_guard before update or delete on public.assessment_result_appeals for each row execute function public.assessment_appeal_guard();

create function public.assessment_appeal_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_appeal_commands;appeal public.assessment_result_appeals;run public.assessment_grading_runs;
 attempt public.assessment_attempts;request jsonb;result jsonb;score uuid;appeal_reason text;target_status text;generation integer;
begin
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 if p_action not in('appeal.submit','appeal.withdraw','appeal.decide') then raise exception 'unknown_appeal_action' using errcode='22023';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_appeal' using errcode='22023';end if;
 -- Serialize the command receipt before aggregate locks, matching the other command services.
 request:=jsonb_build_object('action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'appeals'||p_key,0));
 if p_action='appeal.submit' then
  select * into attempt from public.assessment_attempts where tenant_id=p_tenant and id=(p_data->>'attempt_id')::uuid for update;
 else
  select * into appeal from public.assessment_result_appeals where tenant_id=p_tenant and id=(p_data->>'appeal_id')::uuid;
  if not found then raise exception 'appeal_not_found' using errcode='P0002';end if;
  select * into attempt from public.assessment_attempts where tenant_id=p_tenant and id=appeal.attempt_id for update;
  select * into appeal from public.assessment_result_appeals where tenant_id=p_tenant and id=appeal.id for update;
 end if;
 if attempt.id is null then raise exception 'appeal_not_found' using errcode='P0002';end if;
 -- Current authority is checked before returning even a cached receipt.
 if p_action='appeal.decide' then
  if not public.assessment_has_capability(p_tenant,p_actor,'grades.moderate') then raise exception 'forbidden' using errcode='42501';end if;
  if not public.assessment_appeal_independent(p_actor,appeal.run_id) then raise exception 'independent_appeal_reviewer_required' using errcode='42501';end if;
 elsif attempt.candidate_id<>p_actor then raise exception 'candidate_appeal_only' using errcode='42501';end if;
 select * into prior from public.assessment_appeal_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='appeal.submit' then
  appeal_reason:=btrim(p_data->>'reason');
  if appeal_reason is null or length(appeal_reason) not between 1 and 5000 or coalesce(p_data->>'category','') not in('scoring','procedure','accessibility') then raise exception 'invalid_appeal' using errcode='22023';end if;
  score:=(p_data->>'score_revision_id')::uuid;
  select r.* into run from public.assessment_grading_releases l join public.assessment_grading_runs r on r.id=l.run_id
   where l.tenant_id=p_tenant and r.attempt_id=attempt.id and l.release_at<=clock_timestamp() order by r.generation desc limit 1;
  if run.id is null or score is null or run.score_revision_id<>score then raise exception 'latest_released_result_required' using errcode='23514';end if;
  if exists(select 1 from public.assessment_result_appeals where tenant_id=p_tenant and score_revision_id=score) then raise exception 'appeal_already_exists' using errcode='23505';end if;
  insert into public.assessment_result_appeals(tenant_id,attempt_id,run_id,score_revision_id,candidate_id,category,reason)
   values(p_tenant,attempt.id,run.id,score,p_actor,p_data->>'category',appeal_reason) returning * into appeal;
  target_status:='submitted';
 else
  if jsonb_typeof(p_data->'expected_revision') is distinct from 'number' or p_data->>'expected_revision'<>appeal.revision::text then raise exception 'appeal_revision_conflict' using errcode='23505';end if;
  if appeal.status<>'submitted' then raise exception 'appeal_closed' using errcode='23514';end if;
  appeal_reason:=btrim(p_data->>'explanation');if appeal_reason is null or length(appeal_reason) not between 1 and 5000 then raise exception 'appeal_explanation_required' using errcode='22023';end if;
  if p_action='appeal.withdraw' then target_status:='withdrawn';
  else
   target_status:=p_data->>'outcome';if target_status is null or target_status not in('upheld','regrade_requested') then raise exception 'invalid_appeal_outcome' using errcode='22023';end if;
   select * into run from public.assessment_grading_runs where tenant_id=p_tenant and id=appeal.run_id for update;
   if not public.assessment_has_capability(p_tenant,p_actor,'grades.moderate') or not public.assessment_appeal_independent(p_actor,run.id) then raise exception 'independent_appeal_reviewer_required' using errcode='42501';end if;
   if target_status='regrade_requested' then
    -- The existing grading service owns generations, jobs and score approval/release.
    result:=public.assessment_grading_command(p_actor,p_tenant,'appeal.regrade:'||appeal.id,'grade.regrade',jsonb_build_object('run_id',run.id,'reason','Appeal '||appeal.id||': '||left(appeal_reason,4900)));
    generation:=(result->>'generation')::integer;
   end if;
  end if;
  update public.assessment_result_appeals set status=target_status,revision=revision+1,decided_by=p_actor,decided_at=clock_timestamp(),explanation=appeal_reason,requested_generation=generation where id=appeal.id returning * into appeal;
 end if;
 insert into public.assessment_appeal_events(tenant_id,appeal_id,revision,event,actor_id,explanation) values(p_tenant,appeal.id,appeal.revision,target_status,p_actor,appeal_reason);
 result:=jsonb_build_object('id',appeal.id,'status',appeal.status,'revision',appeal.revision,'requested_generation',appeal.requested_generation);
 insert into public.assessment_appeal_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,p_action,appeal.id,jsonb_build_object('attempt_id',attempt.id,'score_revision_id',appeal.score_revision_id,'status',appeal.status,'revision',appeal.revision));
 insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)
 values('assessment.'||p_action,'v1','assessment_appeal',appeal.id,appeal.candidate_id,result,'assessment.appeal:'||appeal.id||':'||appeal.revision);
 return result;
end; $$;

create function public.assessment_appeal_read(p_actor uuid,p_tenant uuid,p_kind text,p_id uuid default null,p_after uuid default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare appeal public.assessment_result_appeals;moderator boolean;result jsonb;
begin
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_page_limit' using errcode='22023';end if;
 moderator:=public.assessment_has_capability(p_tenant,p_actor,'grades.moderate');
 if p_kind='queue' and not moderator then raise exception 'forbidden' using errcode='42501';end if;
 if p_kind in('queue','candidate') then
  select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) into result from (
   select jsonb_build_object('id',a.id,'attempt_id',a.attempt_id,'score_revision_id',a.score_revision_id,'category',a.category,'status',a.status,'revision',a.revision,'created_at',a.created_at) value
   from public.assessment_result_appeals a where a.tenant_id=p_tenant and (case when p_kind='candidate' then a.candidate_id=p_actor else a.candidate_id<>p_actor end)
   and (p_after is null or a.id>p_after) order by a.id limit p_limit
  ) visible;return result;
 end if;
 if p_kind<>'detail' then raise exception 'unknown_appeal_resource' using errcode='22023';end if;
 select * into appeal from public.assessment_result_appeals where tenant_id=p_tenant and id=p_id;
 if not found then raise exception 'appeal_not_found' using errcode='P0002';end if;
 if appeal.candidate_id<>p_actor and not moderator then raise exception 'forbidden' using errcode='42501';end if;
 return jsonb_build_object('id',appeal.id,'attempt_id',appeal.attempt_id,'run_id',appeal.run_id,'score_revision_id',appeal.score_revision_id,
  'category',appeal.category,'reason',appeal.reason,'status',appeal.status,'revision',appeal.revision,'created_at',appeal.created_at,
  'explanation',appeal.explanation,'decided_at',appeal.decided_at,'requested_generation',appeal.requested_generation,
  'can_withdraw',appeal.candidate_id=p_actor and appeal.status='submitted',
  'can_decide',moderator and appeal.status='submitted' and public.assessment_appeal_independent(p_actor,appeal.run_id),
  'can_regrade',moderator and appeal.status='submitted' and public.assessment_appeal_independent(p_actor,appeal.run_id)
   and exists(select 1 from public.assessment_grading_runs r where r.id=appeal.run_id and r.generation=(select max(generation) from public.assessment_grading_runs where attempt_id=appeal.attempt_id))
   and not exists(select 1 from public.assessment_grading_jobs where attempt_id=appeal.attempt_id and state<>'committed'),
  'released_result',(select jsonb_build_object('generation',r.generation,'total',(select sum((s->>'score')::numeric) from jsonb_array_elements(v.scores)s),'max_score',(select sum((s->>'max_score')::numeric) from jsonb_array_elements(v.scores)s),'released_at',l.release_at,'title',w.title)
   from public.assessment_grading_runs r join public.assessment_grading_releases l on l.run_id=r.id join public.assessment_score_revisions v on v.id=l.score_revision_id
   join public.assessment_attempts a on a.id=r.attempt_id join public.assessment_registrations g on g.id=a.registration_id join public.assessment_exam_windows w on w.id=g.window_id where r.id=appeal.run_id),
  'events',(select coalesce(jsonb_agg(jsonb_build_object('revision',e.revision,'event',e.event,'explanation',e.explanation,'created_at',e.created_at) order by e.revision),'[]'::jsonb) from public.assessment_appeal_events e where e.appeal_id=appeal.id));
end; $$;
revoke all on function public.assessment_appeal_independent(uuid,uuid),public.assessment_appeal_guard() from public,anon,authenticated,service_role;
revoke all on function public.assessment_appeal_command(uuid,uuid,text,text,jsonb),public.assessment_appeal_read(uuid,uuid,text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.assessment_appeal_command(uuid,uuid,text,text,jsonb),public.assessment_appeal_read(uuid,uuid,text,uuid,uuid,integer) to service_role;
commit;
