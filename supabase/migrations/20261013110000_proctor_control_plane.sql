begin;
alter table public.assessment_capability_grants drop constraint assessment_capability_grants_capability_check;
alter table public.assessment_capability_grants add constraint assessment_capability_grants_capability_check check
 (capability in ('banks.read','items.write','items.approve','assessments.publish','exams.manage','grades.manage','results.read','audit.read','proctor.manage','proctor.observe','proctor.review'));

create table public.proctor_policies (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 title text not null check(length(title) between 1 and 200), policy jsonb not null check(policy->>'schema_version'='proctor.policy.v1'),
 created_by uuid not null references public.users(id), created_at timestamptz not null default now(), unique(tenant_id,id)
);
create table public.proctor_window_policies (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, window_id uuid not null unique, policy_id uuid not null,
 created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
 foreign key(tenant_id,window_id) references public.assessment_exam_windows(tenant_id,id),
 foreign key(tenant_id,policy_id) references public.proctor_policies(tenant_id,id)
);
create table public.proctor_preparations (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, registration_id uuid not null unique,
 candidate_id uuid not null references public.users(id), policy_id uuid not null,
 consented_at timestamptz not null default clock_timestamp(), consent_version text not null default 'proctor.consent.v1',
 foreign key(tenant_id,registration_id) references public.assessment_registrations(tenant_id,id),
 foreign key(tenant_id,policy_id) references public.proctor_policies(tenant_id,id)
);
create table public.proctor_identity_checks (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, registration_id uuid not null,
 level integer not null check(level in (1,3)), method text not null check(method in ('onsite_attended','remote_attended')),
 verified_by uuid not null references public.users(id), notes text not null check(length(notes) between 10 and 5000),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,registration_id) references public.assessment_registrations(tenant_id,id)
);
create table public.proctor_sessions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, attempt_id uuid not null unique,
 candidate_id uuid not null references public.users(id), policy_id uuid not null, policy_snapshot jsonb not null,
 state text not null default 'active' check(state in ('active','paused','completed')),
 paused_at timestamptz, last_heartbeat_at timestamptz, completed_at timestamptz, created_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,id), foreign key(tenant_id,attempt_id) references public.assessment_attempts(tenant_id,id),
 foreign key(tenant_id,policy_id) references public.proctor_policies(tenant_id,id)
);
alter table public.sessions add column proctor_session_id uuid references public.proctor_sessions(id);
create table public.proctor_assignments (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, session_id uuid not null,
 user_id uuid not null references public.users(id), assignment_role text not null check(assignment_role in ('observer','reviewer')),
 active boolean not null default true, assigned_by uuid not null references public.users(id), created_at timestamptz not null default clock_timestamp(),
 unique(session_id,user_id,assignment_role), foreign key(tenant_id,session_id) references public.proctor_sessions(tenant_id,id)
);
create table public.proctor_event_streams (
 tenant_id uuid not null, session_id uuid not null, stream_id uuid not null,
 last_sequence integer not null default 0, primary key(session_id,stream_id),
 foreign key(tenant_id,session_id) references public.proctor_sessions(tenant_id,id)
);
create table public.proctor_event_receipts (
 tenant_id uuid not null, session_id uuid not null, stream_id uuid not null, sequence integer not null check(sequence>0),
 event_id uuid not null, received_at timestamptz not null, payload_hash text not null,
 primary key(session_id,stream_id,sequence), foreign key(tenant_id,session_id) references public.proctor_sessions(tenant_id,id)
);
create table public.proctor_integrity_events (
 id uuid not null default gen_random_uuid(), tenant_id uuid not null, session_id uuid not null, stream_id uuid not null,
 sequence integer not null, kind text not null, source text not null check(source='browser_reported'),
 occurred_at timestamptz not null, received_at timestamptz not null default clock_timestamp(),
 details jsonb not null default '{}', primary key(id,received_at),
 foreign key(tenant_id,session_id) references public.proctor_sessions(tenant_id,id)
) partition by range(received_at);
create table public.proctor_integrity_events_default partition of public.proctor_integrity_events default;
create index proctor_events_session on public.proctor_integrity_events(tenant_id,session_id,received_at);
create table public.proctor_review_cases (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, session_id uuid not null,
 title text not null check(length(title) between 1 and 200), opened_by uuid not null references public.users(id),
 state text not null default 'open' check(state in ('open','reviewing','resolved')),
 disposition text check(disposition in ('clear','confirmed','insufficient_evidence')),
 created_at timestamptz not null default clock_timestamp(), resolved_at timestamptz,
 unique(tenant_id,id), foreign key(tenant_id,session_id) references public.proctor_sessions(tenant_id,id)
);
create table public.proctor_case_findings (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, case_id uuid not null,
 reviewer_id uuid not null references public.users(id), disposition text not null check(disposition in ('clear','confirmed','insufficient_evidence')),
 rationale text not null check(length(rationale) between 10 and 10000), evidence_event_ids uuid[] not null default '{}',
 created_at timestamptz not null default clock_timestamp(), unique(case_id,reviewer_id),
 foreign key(tenant_id,case_id) references public.proctor_review_cases(tenant_id,id)
);
create table public.proctor_commands (
 tenant_id uuid not null, actor_id uuid not null, idempotency_key text not null,
 request jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,actor_id,idempotency_key)
);
create index proctor_sessions_tenant on public.proctor_sessions(tenant_id,state,created_at);
create index proctor_assignments_user on public.proctor_assignments(tenant_id,user_id,active);
create index proctor_cases_session on public.proctor_review_cases(tenant_id,session_id,state);
create index proctor_identity_registration on public.proctor_identity_checks(tenant_id,registration_id,level);

create function public.proctor_can_access(p_tenant uuid,p_session uuid,p_user uuid,p_assignment text default null)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.assessment_has_capability(p_tenant,p_user,'proctor.manage') or exists(
  select 1 from public.proctor_assignments a where a.tenant_id=p_tenant and a.session_id=p_session and a.user_id=p_user and a.active
   and (p_assignment is null or a.assignment_role=p_assignment)
   and public.assessment_has_capability(p_tenant,p_user,case a.assignment_role when 'observer' then 'proctor.observe' else 'proctor.review' end));
$$;
create function public.proctor_start_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare binding public.proctor_window_policies; pol public.proctor_policies; reg public.assessment_registrations;
begin
 select * into reg from public.assessment_registrations where id=new.registration_id;
 -- Serialize attachment versus launch using the same sitting lock.
 perform 1 from public.assessment_exam_windows where id=reg.window_id for update;
 select * into binding from public.proctor_window_policies where window_id=reg.window_id;
 if not found then return new; end if;
 select * into pol from public.proctor_policies where id=binding.policy_id;
 if not exists(select 1 from public.proctor_preparations where registration_id=reg.id and candidate_id=new.candidate_id and policy_id=pol.id) then raise exception 'proctor_consent_required' using errcode='23514'; end if;
 if (pol.policy->>'identity_level')::integer=2 then raise exception 'document_liveness_provider_required' using errcode='23514'; end if;
 if (pol.policy->>'identity_level')::integer in (1,3) and not exists(select 1 from public.proctor_identity_checks where registration_id=reg.id and level>=(pol.policy->>'identity_level')::integer and public.assessment_has_capability(new.tenant_id,verified_by,'proctor.manage')) then raise exception 'identity_verification_required' using errcode='23514'; end if;
 -- Capture/secure modes cannot be silently downgraded to browser telemetry.
 if pol.policy->>'mode'<>'browser' or (pol.policy->>'camera')::boolean or (pol.policy->>'microphone')::boolean or (pol.policy->>'screen')::boolean or (pol.policy->>'second_camera')::boolean then raise exception 'capture_or_secure_client_required' using errcode='23514'; end if;
 return new;
end; $$;
create trigger proctor_start_guard before insert on public.assessment_attempts for each row execute function public.proctor_start_guard();
create function public.proctor_attempt_sync() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare binding public.proctor_window_policies; pol public.proctor_policies; sid uuid;
begin
 if tg_op='INSERT' then
  select w.* into binding from public.proctor_window_policies w join public.assessment_registrations r on r.window_id=w.window_id where r.id=new.registration_id;
  if found then
   select * into pol from public.proctor_policies where id=binding.policy_id;
   insert into public.proctor_sessions(tenant_id,attempt_id,candidate_id,policy_id,policy_snapshot) values(new.tenant_id,new.id,new.candidate_id,pol.id,pol.policy) returning id into sid;
   update public.sessions set proctor_session_id=sid where id=new.session_id;
  end if;
 elsif new.state in ('submitted','expired') then
  update public.proctor_sessions set state='completed' where attempt_id=new.id;
 end if;
 return new;
end; $$;
create trigger proctor_attempt_sync after insert or update of state on public.assessment_attempts for each row execute function public.proctor_attempt_sync();

create function public.proctor_session_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if (new.id,new.tenant_id,new.attempt_id,new.candidate_id,new.policy_id,new.policy_snapshot,new.created_at)
   is distinct from (old.id,old.tenant_id,old.attempt_id,old.candidate_id,old.policy_id,old.policy_snapshot,old.created_at) then raise exception 'immutable_proctor_session_binding' using errcode='23514'; end if;
 if old.state='completed' and new.state<>'completed' then raise exception 'session_finalized' using errcode='23514'; end if;
 if old.state<>'completed' and new.state='completed' then new.completed_at:=clock_timestamp();
 elsif new.completed_at is distinct from old.completed_at then raise exception 'immutable_completion_time' using errcode='23514'; end if;
 return new;
end; $$;
create trigger proctor_session_guard before update on public.proctor_sessions for each row execute function public.proctor_session_guard();

do $$ declare t text; begin
 foreach t in array array['proctor_policies','proctor_preparations','proctor_identity_checks','proctor_integrity_events','proctor_event_receipts','proctor_case_findings'] loop
  execute format('create trigger immutable_record before update or delete on public.%I for each row execute function public.assessment_immutable()',t);
 end loop;
 foreach t in array array['proctor_policies','proctor_window_policies','proctor_preparations','proctor_identity_checks','proctor_sessions','proctor_assignments','proctor_event_streams','proctor_event_receipts','proctor_integrity_events','proctor_integrity_events_default','proctor_review_cases','proctor_case_findings','proctor_commands'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['proctor_policies','proctor_window_policies','proctor_preparations','proctor_identity_checks'] loop
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy supervisor_read on public.%I for select to authenticated using(public.assessment_has_capability(tenant_id,auth.uid(),''proctor.manage''))',t);
 end loop;
 foreach t in array array['proctor_sessions','proctor_assignments','proctor_integrity_events','proctor_review_cases'] loop
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy assigned_read on public.%I for select to authenticated using(public.proctor_can_access(tenant_id,%s,auth.uid()))',t,case when t='proctor_sessions' then 'id' else 'session_id' end);
 end loop;
 grant select on public.proctor_case_findings to authenticated;
 create policy assigned_read on public.proctor_case_findings for select to authenticated using(exists(select 1 from public.proctor_review_cases c where c.id=case_id and public.proctor_can_access(tenant_id,c.session_id,auth.uid(),'reviewer')));
end; $$;

create function public.proctor_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 prior public.proctor_commands; result jsonb; rid uuid; session public.proctor_sessions; att public.assessment_attempts;
 reg public.assessment_registrations; pol public.proctor_policies; binding public.proctor_window_policies;
 review_case public.proctor_review_cases; receipt public.proctor_event_receipts; entry jsonb; stream uuid; seq integer;
 observed_at timestamptz; event_time timestamptz; event_id uuid; matching integer; total integer; elapsed interval; request jsonb;
begin
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501'; end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023'; end if;
 request:=jsonb_build_object('action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'proctor'||p_key,0));
 select * into prior from public.proctor_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505'; end if; return prior.result; end if;
 if p_action in ('policy.create','policy.attach','session.assign','identity.verify','capability.grant','capability.revoke') and not public.assessment_has_capability(p_tenant,p_actor,'proctor.manage') then raise exception 'forbidden' using errcode='42501'; end if;
 case p_action
 when 'capability.grant','capability.revoke' then
  if not exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=p_actor and role in ('owner','admin') and status='active') then raise exception 'owner_or_admin_required' using errcode='42501'; end if;
  if not exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=(p_data->>'user_id')::uuid and status='active') then raise exception 'active_member_required' using errcode='23514'; end if;
  if p_action='capability.grant' then
   insert into public.assessment_capability_grants(tenant_id,user_id,capability,granted_by) values(p_tenant,(p_data->>'user_id')::uuid,p_data->>'capability',p_actor) on conflict do nothing;
  else delete from public.assessment_capability_grants where tenant_id=p_tenant and user_id=(p_data->>'user_id')::uuid and capability=p_data->>'capability'; end if;
  rid:=(p_data->>'user_id')::uuid;
 when 'policy.create' then
  insert into public.proctor_policies(tenant_id,title,policy,created_by) values(p_tenant,p_data->>'title',p_data->'policy',p_actor) returning id into rid;
 when 'policy.attach' then
  perform 1 from public.assessment_exam_windows where id=(p_data->>'window_id')::uuid and tenant_id=p_tenant for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if exists(select 1 from public.assessment_attempts a join public.assessment_registrations r on r.id=a.registration_id where r.window_id=(p_data->>'window_id')::uuid) then raise exception 'sitting_already_started' using errcode='23514'; end if;
  insert into public.proctor_window_policies(tenant_id,window_id,policy_id,created_by) values(p_tenant,(p_data->>'window_id')::uuid,(p_data->>'policy_id')::uuid,p_actor) returning id into rid;
  update public.assessment_exam_windows set required_services=array(select distinct unnest(required_services||array['proctor'])) where id=(p_data->>'window_id')::uuid and tenant_id=p_tenant;
 when 'preparation.accept','identity.verify' then
  select * into reg from public.assessment_registrations where id=(p_data->>'registration_id')::uuid and tenant_id=p_tenant for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  select * into binding from public.proctor_window_policies where window_id=reg.window_id;
  if not found then raise exception 'policy_not_assigned' using errcode='23514'; end if;
  if p_action='preparation.accept' then
   if reg.candidate_id<>p_actor then raise exception 'not_found' using errcode='P0002'; end if;
   if (p_data->>'policy_id')::uuid<>binding.policy_id or p_data->>'acknowledged'<>'true' then raise exception 'consent_required' using errcode='23514'; end if;
   insert into public.proctor_preparations(tenant_id,registration_id,candidate_id,policy_id) values(p_tenant,reg.id,p_actor,binding.policy_id) on conflict(registration_id) do nothing;
   select id into rid from public.proctor_preparations where registration_id=reg.id;
  else
   select * into pol from public.proctor_policies where id=binding.policy_id;
   if (pol.policy->>'identity_level')::integer not in (1,3) then raise exception 'attended_identity_policy_required' using errcode='23514'; end if;
   if p_actor=reg.candidate_id then raise exception 'self_verification_forbidden' using errcode='23514'; end if;
   insert into public.proctor_identity_checks(tenant_id,registration_id,level,method,verified_by,notes) values(p_tenant,reg.id,(pol.policy->>'identity_level')::integer,p_data->>'method',p_actor,p_data->>'notes') returning id into rid;
  end if;
 when 'session.assign','session.pause','session.resume','session.warn','events.append','session.heartbeat','case.create' then
  -- Use canonical attempt -> proctor session lock order, matching runtime expiry/finalization.
  if p_action in ('session.pause','session.resume') then
   perform 1 from public.assessment_attempts where id=(select attempt_id from public.proctor_sessions where id=(p_data->>'session_id')::uuid and tenant_id=p_tenant) for update;
  end if;
  select * into session from public.proctor_sessions where id=(p_data->>'session_id')::uuid and tenant_id=p_tenant for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if p_action in ('events.append','session.heartbeat') then
   if session.candidate_id<>p_actor then raise exception 'not_found' using errcode='P0002'; end if;
  elsif not public.proctor_can_access(p_tenant,session.id,p_actor,case when p_action='case.create' then null else 'observer' end) then raise exception 'assignment_required' using errcode='42501'; end if;
  rid:=session.id;
  case p_action
  when 'session.assign' then
   if not public.assessment_has_capability(p_tenant,(p_data->>'user_id')::uuid,case p_data->>'assignment_role' when 'observer' then 'proctor.observe' else 'proctor.review' end) then raise exception 'assignee_capability_required' using errcode='23514'; end if;
   insert into public.proctor_assignments(tenant_id,session_id,user_id,assignment_role,assigned_by) values(p_tenant,session.id,(p_data->>'user_id')::uuid,p_data->>'assignment_role',p_actor) on conflict(session_id,user_id,assignment_role) do update set active=true,assigned_by=excluded.assigned_by returning id into rid;
  when 'session.heartbeat' then
   if session.state='completed' then raise exception 'session_finalized' using errcode='23514'; end if;
   update public.proctor_sessions set last_heartbeat_at=clock_timestamp() where id=session.id;
  when 'events.append' then
   if session.state='completed' and clock_timestamp()>session.completed_at+interval '1 day' then raise exception 'event_recovery_window_closed' using errcode='23514'; end if;
   stream:=(p_data->>'stream_id')::uuid;
   insert into public.proctor_event_streams(tenant_id,session_id,stream_id) values(p_tenant,session.id,stream) on conflict do nothing;
   for entry in select value from jsonb_array_elements(p_data->'events') loop
    seq:=(entry->>'sequence')::integer;
    select * into receipt from public.proctor_event_receipts where session_id=session.id and stream_id=stream and sequence=seq;
    if found then
     if receipt.payload_hash<>entry->>'payload_hash' then raise exception 'event_sequence_conflict' using errcode='23505'; end if;
     continue;
    end if;
    if seq<>(select last_sequence+1 from public.proctor_event_streams where session_id=session.id and stream_id=stream) then raise exception 'event_sequence_gap' using errcode='23505'; end if;
    if entry->>'kind' not in ('focus_loss','focus_return','tab_hidden','tab_visible','fullscreen_enter','fullscreen_exit','copy','paste','cut','context_menu','online','offline','client_loaded') then raise exception 'invalid_browser_event' using errcode='22023'; end if;
    observed_at:=(entry->>'occurred_at')::timestamptz;
    if observed_at<session.created_at-interval '5 minutes' or observed_at>clock_timestamp()+interval '5 minutes' then raise exception 'event_timestamp_out_of_range' using errcode='22023'; end if;
    event_time:=clock_timestamp();event_id:=gen_random_uuid();
    insert into public.proctor_integrity_events(id,tenant_id,session_id,stream_id,sequence,kind,source,occurred_at,received_at,details) values(event_id,p_tenant,session.id,stream,seq,entry->>'kind','browser_reported',observed_at,event_time,'{}');
    insert into public.proctor_event_receipts values(p_tenant,session.id,stream,seq,event_id,event_time,entry->>'payload_hash');
    update public.proctor_event_streams set last_sequence=seq where session_id=session.id and stream_id=stream;
   end loop;
   result:=jsonb_build_object('id',session.id,'last_sequence',(select last_sequence from public.proctor_event_streams where session_id=session.id and stream_id=stream));
  when 'session.pause','session.resume' then
   select * into att from public.assessment_attempts where id=session.attempt_id for update;
   if att.state in ('submitted','expired') or (p_action='session.pause' and clock_timestamp()>=att.deadline_at) then raise exception 'attempt_finalized' using errcode='23514'; end if;
   if p_action='session.pause' then
    if session.state<>'active' or att.state<>'active' then raise exception 'session_not_active' using errcode='23514'; end if;
    update public.proctor_sessions set state='paused',paused_at=clock_timestamp() where id=session.id;
    update public.assessment_attempts set state='paused' where id=att.id;
    update public.sessions set status='paused',paused_at=clock_timestamp() where id=att.session_id;
   else
    if session.state<>'paused' or att.state<>'paused' then raise exception 'session_not_paused' using errcode='23514'; end if;
    elapsed:=clock_timestamp()-session.paused_at;
    select * into reg from public.assessment_registrations where id=att.registration_id;
    if clock_timestamp()>=(select closes_at from public.assessment_exam_windows where id=reg.window_id) then raise exception 'window_closed' using errcode='23514'; end if;
    update public.assessment_attempts set state='active',deadline_at=least(deadline_at+elapsed,(select closes_at from public.assessment_exam_windows where id=reg.window_id)),section_deadline_at=least(section_deadline_at+elapsed,(select closes_at from public.assessment_exam_windows where id=reg.window_id)) where id=att.id;
    update public.proctor_sessions set state='active',paused_at=null where id=session.id;
    update public.sessions set status='active',resumed_at=clock_timestamp() where id=att.session_id;
   end if;
  when 'session.warn' then
   if session.state='completed' then raise exception 'session_finalized' using errcode='23514'; end if;
  when 'case.create' then
   insert into public.proctor_review_cases(tenant_id,session_id,title,opened_by) values(p_tenant,session.id,p_data->>'title',p_actor) returning id into rid;
  end case;
 when 'case.finding' then
  select * into review_case from public.proctor_review_cases where id=(p_data->>'case_id')::uuid and tenant_id=p_tenant for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if not public.assessment_has_capability(p_tenant,p_actor,'proctor.review') or not public.proctor_can_access(p_tenant,review_case.session_id,p_actor,'reviewer') then raise exception 'review_assignment_required' using errcode='42501'; end if;
  if review_case.state='resolved' then raise exception 'case_resolved' using errcode='23514'; end if;
  select * into session from public.proctor_sessions where id=review_case.session_id;
  if exists(select 1 from jsonb_array_elements_text(p_data->'evidence_event_ids') ids where not exists(select 1 from public.proctor_integrity_events e where e.session_id=session.id and e.id=ids::uuid)) then raise exception 'foreign_evidence' using errcode='23514'; end if;
  insert into public.proctor_case_findings(tenant_id,case_id,reviewer_id,disposition,rationale,evidence_event_ids)
   values(p_tenant,review_case.id,p_actor,p_data->>'disposition',p_data->>'rationale',array(select jsonb_array_elements_text(p_data->'evidence_event_ids'))::uuid[]) returning id into rid;
  select count(*),count(*) filter(where disposition=p_data->>'disposition') into total,matching from public.proctor_case_findings where case_id=review_case.id;
  if total>=coalesce((session.policy_snapshot->>'reviewer_quorum')::integer,2) and total=matching then
   update public.proctor_review_cases set state='resolved',disposition=p_data->>'disposition',resolved_at=clock_timestamp() where id=review_case.id;
  else update public.proctor_review_cases set state='reviewing' where id=review_case.id; end if;
  -- Findings never mutate academic responses or scores. Release policy consumes them separately.
 else raise exception 'unknown_action' using errcode='22023';
 end case;
 result:=coalesce(result,jsonb_build_object('id',rid));
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.'||p_action,rid,jsonb_build_object('reason',p_data->>'reason'));
 insert into public.proctor_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
 return result;
end; $$;
revoke all on function public.proctor_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.proctor_command(uuid,uuid,text,text,jsonb) to service_role;
revoke all on function public.proctor_can_access(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.proctor_can_access(uuid,uuid,uuid,text) to authenticated,service_role;
revoke all on function public.proctor_start_guard(),public.proctor_attempt_sync() from public,anon,authenticated;
commit;
