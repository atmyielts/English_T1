begin;
-- Appeal workflow (RESULT-01): institution filing deadline, assignment to an
-- independent moderator, and a second stage where a different independent
-- reviewer decides after the candidate escalates an upheld result. Released
-- scores are never edited here; a regrade still goes through grading.

create table public.assessment_appeal_policies(
 tenant_id uuid primary key references public.tenants(id),
 filing_days integer check(filing_days between 1 and 365),
 escalation_days integer check(escalation_days between 1 and 365),
 revision integer not null default 1,
 updated_by uuid not null references public.users(id),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.assessment_appeal_policies enable row level security;
revoke all on public.assessment_appeal_policies from anon,authenticated;
grant all on public.assessment_appeal_policies to service_role;

alter table public.assessment_result_appeals
 add column assigned_to uuid references public.users(id),
 add column stage integer not null default 1 check(stage in(1,2)),
 add column first_decided_by uuid references public.users(id),
 add column escalated_at timestamptz,
 add column escalation_reason text check(escalation_reason is null or length(btrim(escalation_reason)) between 1 and 5000);
alter table public.assessment_result_appeals drop constraint assessment_result_appeals_status_check;
alter table public.assessment_result_appeals add constraint assessment_result_appeals_status_check check(status in('submitted','withdrawn','upheld','regrade_requested','escalated'));
alter table public.assessment_result_appeals drop constraint assessment_result_appeals_revision_check;
alter table public.assessment_result_appeals add constraint assessment_result_appeals_revision_check check(revision between 1 and 50);
alter table public.assessment_result_appeals add constraint assessment_result_appeals_stage_check2 check((stage=2)=(escalated_at is not null) and (stage=2)=(escalation_reason is not null) and (stage=2)=(first_decided_by is not null));
alter table public.assessment_appeal_events drop constraint assessment_appeal_events_event_check;
alter table public.assessment_appeal_events add constraint assessment_appeal_events_event_check check(event in('submitted','withdrawn','upheld','regrade_requested','assigned','escalated'));
create index assessment_appeals_assigned on public.assessment_result_appeals(tenant_id,assigned_to,status);

-- Allowed changes: decisions from submitted/escalated, escalation of an
-- upheld first-stage decision, and assignment while open. Everything else
-- about an appeal is immutable.
create or replace function public.assessment_appeal_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare movable text[]:=array['status','revision','decided_at','decided_by','explanation','requested_generation','assigned_to','stage','first_decided_by','escalated_at','escalation_reason'];begin
 if tg_op='DELETE' then raise exception 'immutable_appeal' using errcode='23514';end if;
 if new.revision<>old.revision+1 or (to_jsonb(new)-movable) is distinct from (to_jsonb(old)-movable) then raise exception 'immutable_appeal' using errcode='23514';end if;
 if new.status=old.status then
  -- Assignment only, while the appeal is open.
  if old.status not in('submitted','escalated') or (to_jsonb(new)-array['assigned_to','revision']) is distinct from (to_jsonb(old)-array['assigned_to','revision']) then raise exception 'immutable_appeal' using errcode='23514';end if;
 elsif old.status='submitted' and new.status in('withdrawn','upheld','regrade_requested') and new.stage=1 then null;
 elsif old.status='upheld' and old.stage=1 and new.status='escalated' and new.stage=2 then null;
 elsif old.status='escalated' and new.status in('withdrawn','upheld','regrade_requested') and new.stage=2 then null;
 else raise exception 'immutable_appeal' using errcode='23514';end if;
 return new;
end;$$;

alter function public.assessment_appeal_command(uuid,uuid,text,text,jsonb) rename to assessment_appeal_command_v1;
create function public.assessment_appeal_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_appeal_commands;appeal public.assessment_result_appeals;attempt public.assessment_attempts;policy public.assessment_appeal_policies;
 request jsonb;result jsonb;released timestamptz;note text;target text;run public.assessment_grading_runs;generation integer;assignee uuid;begin
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 select * into policy from public.assessment_appeal_policies where tenant_id=p_tenant;
 -- First-stage filing deadline, counted from the release time of the appealed result.
 if p_action='appeal.submit' and policy.filing_days is not null then
  select l.release_at into released from public.assessment_grading_releases l where l.tenant_id=p_tenant and l.score_revision_id=(p_data->>'score_revision_id')::uuid;
  if released is not null and clock_timestamp()>released+make_interval(days=>policy.filing_days)
   and not exists(select 1 from public.assessment_appeal_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key)
  then raise exception 'appeal_window_closed' using errcode='23514';end if;
 end if;
 -- Once assigned, only the assignee decides a first-stage appeal.
 if p_action='appeal.decide' then
  select * into appeal from public.assessment_result_appeals where tenant_id=p_tenant and id=(p_data->>'appeal_id')::uuid;
  if found and appeal.status='submitted' and appeal.assigned_to is not null and appeal.assigned_to<>p_actor then raise exception 'appeal_assigned_to_another_reviewer' using errcode='42501';end if;
  if not found or appeal.status<>'escalated' then return public.assessment_appeal_command_v1(p_actor,p_tenant,p_key,p_action,p_data);end if;
 elsif p_action='appeal.withdraw' then
  select * into appeal from public.assessment_result_appeals where tenant_id=p_tenant and id=(p_data->>'appeal_id')::uuid;
  if not found or appeal.status<>'escalated' then return public.assessment_appeal_command_v1(p_actor,p_tenant,p_key,p_action,p_data);end if;
 elsif p_action not in('appeal.assign','appeal.escalate','appeal.policy.set') then
  return public.assessment_appeal_command_v1(p_actor,p_tenant,p_key,p_action,p_data);
 end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_appeal' using errcode='22023';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'appeals'||p_key,0));
 if p_action='appeal.policy.set' then
  if not public.assessment_has_capability(p_tenant,p_actor,'results.release') then raise exception 'forbidden' using errcode='42501';end if;
  select * into prior from public.assessment_appeal_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
  if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
  if coalesce((p_data->>'expected_revision')::integer,0)<>coalesce(policy.revision,0) then raise exception 'appeal_policy_revision_conflict' using errcode='23505';end if;
  if (p_data ? 'filing_days' and jsonb_typeof(p_data->'filing_days') not in('number','null')) or (p_data ? 'escalation_days' and jsonb_typeof(p_data->'escalation_days') not in('number','null')) then raise exception 'invalid_appeal_policy' using errcode='22023';end if;
  insert into public.assessment_appeal_policies(tenant_id,filing_days,escalation_days,updated_by) values(p_tenant,(p_data->>'filing_days')::integer,(p_data->>'escalation_days')::integer,p_actor)
  on conflict (tenant_id) do update set filing_days=excluded.filing_days,escalation_days=excluded.escalation_days,revision=public.assessment_appeal_policies.revision+1,updated_by=p_actor,updated_at=clock_timestamp() returning * into policy;
  result:=jsonb_build_object('filing_days',policy.filing_days,'escalation_days',policy.escalation_days,'revision',policy.revision);
  insert into public.assessment_appeal_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,p_action,p_tenant,result);
  return result;
 end if;
 select * into appeal from public.assessment_result_appeals where tenant_id=p_tenant and id=(p_data->>'appeal_id')::uuid;
 if not found then raise exception 'appeal_not_found' using errcode='P0002';end if;
 select * into attempt from public.assessment_attempts where tenant_id=p_tenant and id=appeal.attempt_id for update;
 select * into appeal from public.assessment_result_appeals where id=appeal.id for update;
 if p_action in('appeal.escalate','appeal.withdraw') then
  if appeal.candidate_id<>p_actor then raise exception 'candidate_appeal_only' using errcode='42501';end if;
 elsif not public.assessment_has_capability(p_tenant,p_actor,'grades.moderate') then raise exception 'forbidden' using errcode='42501';
 end if;
 select * into prior from public.assessment_appeal_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if jsonb_typeof(p_data->'expected_revision') is distinct from 'number' or p_data->>'expected_revision'<>appeal.revision::text then raise exception 'appeal_revision_conflict' using errcode='23505';end if;
 if p_action='appeal.assign' then
  if appeal.status not in('submitted','escalated') then raise exception 'appeal_closed' using errcode='23514';end if;
  assignee:=(p_data->>'reviewer_id')::uuid;
  -- The assignee must be able to decide: a current moderator, independent of the
  -- marking, and for stage 2 not the first-stage decider.
  if assignee is null or not public.assessment_has_capability(p_tenant,assignee,'grades.moderate') or not public.assessment_appeal_independent(assignee,appeal.run_id) or assignee=appeal.first_decided_by then raise exception 'independent_appeal_reviewer_required' using errcode='42501';end if;
  update public.assessment_result_appeals set assigned_to=assignee,revision=revision+1 where id=appeal.id returning * into appeal;
  target:='assigned';note:='Assigned for independent review';
 elsif p_action='appeal.escalate' then
  if appeal.status<>'upheld' or appeal.stage<>1 then raise exception 'appeal_not_escalatable' using errcode='23514';end if;
  if policy.escalation_days is not null and clock_timestamp()>appeal.decided_at+make_interval(days=>policy.escalation_days) then raise exception 'appeal_window_closed' using errcode='23514';end if;
  note:=btrim(p_data->>'reason');if note is null or length(note) not between 1 and 5000 then raise exception 'appeal_explanation_required' using errcode='22023';end if;
  update public.assessment_result_appeals set status='escalated',stage=2,revision=revision+1,first_decided_by=decided_by,escalated_at=clock_timestamp(),escalation_reason=note,assigned_to=null where id=appeal.id returning * into appeal;
  target:='escalated';
 elsif p_action='appeal.withdraw' then
  if appeal.status<>'escalated' then raise exception 'appeal_closed' using errcode='23514';end if;
  note:=btrim(p_data->>'explanation');if note is null or length(note) not between 1 and 5000 then raise exception 'appeal_explanation_required' using errcode='22023';end if;
  update public.assessment_result_appeals set status='withdrawn',revision=revision+1,decided_by=p_actor,decided_at=clock_timestamp(),explanation=note where id=appeal.id returning * into appeal;
  target:='withdrawn';
 else -- second-stage decision
  if not public.assessment_appeal_independent(p_actor,appeal.run_id) or p_actor=appeal.first_decided_by then raise exception 'independent_appeal_reviewer_required' using errcode='42501';end if;
  if appeal.assigned_to is not null and appeal.assigned_to<>p_actor then raise exception 'appeal_assigned_to_another_reviewer' using errcode='42501';end if;
  note:=btrim(p_data->>'explanation');if note is null or length(note) not between 1 and 5000 then raise exception 'appeal_explanation_required' using errcode='22023';end if;
  target:=p_data->>'outcome';if target is null or target not in('upheld','regrade_requested') then raise exception 'invalid_appeal_outcome' using errcode='22023';end if;
  if target='regrade_requested' then
   select * into run from public.assessment_grading_runs where tenant_id=p_tenant and id=appeal.run_id for update;
   result:=public.assessment_grading_command(p_actor,p_tenant,'appeal.regrade:'||appeal.id||':stage2','grade.regrade',jsonb_build_object('run_id',run.id,'reason','Appeal '||appeal.id||' (second stage): '||left(note,4880)));
   generation:=(result->>'generation')::integer;
  end if;
  update public.assessment_result_appeals set status=target,revision=revision+1,decided_by=p_actor,decided_at=clock_timestamp(),explanation=note,requested_generation=generation where id=appeal.id returning * into appeal;
 end if;
 insert into public.assessment_appeal_events(tenant_id,appeal_id,revision,event,actor_id,explanation) values(p_tenant,appeal.id,appeal.revision,target,p_actor,note);
 result:=jsonb_build_object('id',appeal.id,'status',appeal.status,'stage',appeal.stage,'revision',appeal.revision,'assigned_to',appeal.assigned_to,'requested_generation',appeal.requested_generation);
 insert into public.assessment_appeal_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,p_action,appeal.id,result);
 insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)
 values('assessment.'||p_action,'v1','assessment_appeal',appeal.id,appeal.candidate_id,result,'assessment.appeal:'||appeal.id||':'||appeal.revision);
 return result;
end;$$;

-- Reads add stage, assignment, deadlines and what this reader may do next.
alter function public.assessment_appeal_read(uuid,uuid,text,uuid,uuid,integer) rename to assessment_appeal_read_v1;
create function public.assessment_appeal_read(p_actor uuid,p_tenant uuid,p_kind text,p_id uuid default null,p_after uuid default null,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare base jsonb;appeal public.assessment_result_appeals;policy public.assessment_appeal_policies;moderator boolean;released timestamptz;begin
 if p_kind='policy' then
  if not public.assessment_has_capability(p_tenant,p_actor,'grades.moderate') and not public.assessment_has_capability(p_tenant,p_actor,'results.release') then raise exception 'forbidden' using errcode='42501';end if;
  select * into policy from public.assessment_appeal_policies where tenant_id=p_tenant;
  return jsonb_build_object('filing_days',policy.filing_days,'escalation_days',policy.escalation_days,'revision',coalesce(policy.revision,0),'can_edit',public.assessment_has_capability(p_tenant,p_actor,'results.release'));
 end if;
 base:=public.assessment_appeal_read_v1(p_actor,p_tenant,p_kind,p_id,p_after,p_limit);
 if p_kind in('queue','candidate') then
  return coalesce((select jsonb_agg(row||jsonb_build_object('stage',a.stage,'assigned_to',a.assigned_to,'assigned_to_me',a.assigned_to=p_actor) order by row->>'id') from jsonb_array_elements(base) row join public.assessment_result_appeals a on a.id=(row->>'id')::uuid),'[]'::jsonb);
 end if;
 select * into appeal from public.assessment_result_appeals where tenant_id=p_tenant and id=p_id;
 select * into policy from public.assessment_appeal_policies where tenant_id=p_tenant;
 moderator:=public.assessment_has_capability(p_tenant,p_actor,'grades.moderate');
 select l.release_at into released from public.assessment_grading_releases l where l.score_revision_id=appeal.score_revision_id;
 return base||jsonb_build_object('stage',appeal.stage,'assigned_to',appeal.assigned_to,'escalated_at',appeal.escalated_at,'escalation_reason',appeal.escalation_reason,
  'filing_deadline',case when policy.filing_days is null then null else released+make_interval(days=>policy.filing_days) end,
  'escalation_deadline',case when policy.escalation_days is null or appeal.status<>'upheld' or appeal.stage<>1 then null else appeal.decided_at+make_interval(days=>policy.escalation_days) end,
  'can_escalate',appeal.candidate_id=p_actor and appeal.status='upheld' and appeal.stage=1 and (policy.escalation_days is null or clock_timestamp()<=appeal.decided_at+make_interval(days=>policy.escalation_days)),
  'can_withdraw',appeal.candidate_id=p_actor and appeal.status in('submitted','escalated'),
  'can_assign_self',moderator and appeal.status in('submitted','escalated') and public.assessment_appeal_independent(p_actor,appeal.run_id) and p_actor is distinct from appeal.first_decided_by and appeal.assigned_to is distinct from p_actor,
  'can_decide',moderator and appeal.status in('submitted','escalated') and public.assessment_appeal_independent(p_actor,appeal.run_id) and p_actor is distinct from appeal.first_decided_by and (appeal.assigned_to is null or appeal.assigned_to=p_actor),
  'can_regrade',coalesce((base->>'can_regrade')::boolean,false) or (moderator and appeal.status='escalated' and public.assessment_appeal_independent(p_actor,appeal.run_id) and p_actor is distinct from appeal.first_decided_by and (appeal.assigned_to is null or appeal.assigned_to=p_actor)));
end;$$;
revoke all on function public.assessment_appeal_command_v1(uuid,uuid,text,text,jsonb),public.assessment_appeal_read_v1(uuid,uuid,text,uuid,uuid,integer),public.assessment_appeal_guard() from public,anon,authenticated,service_role;
revoke all on function public.assessment_appeal_command(uuid,uuid,text,text,jsonb),public.assessment_appeal_read(uuid,uuid,text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.assessment_appeal_command(uuid,uuid,text,text,jsonb),public.assessment_appeal_read(uuid,uuid,text,uuid,uuid,integer) to service_role;
commit;
