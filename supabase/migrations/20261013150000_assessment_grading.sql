begin;
alter table public.assessment_capability_grants drop constraint assessment_capability_grants_capability_check;
alter table public.assessment_capability_grants add constraint assessment_capability_grants_capability_check check(capability in ('banks.read','items.write','items.approve','assessments.publish','exams.manage','grades.manage','grades.mark','grades.moderate','results.release','results.read','audit.read','proctor.manage','proctor.observe','proctor.review'));
create trigger immutable_record before update or delete on public.assessment_rubrics for each row execute function public.assessment_immutable();
create table public.assessment_grading_policies (
 tenant_id uuid not null,window_id uuid primary key,marker_count integer not null default 2 check(marker_count in (1,2)),tolerance_percent numeric(9,6) not null default 0 check(tolerance_percent between 0 and 100),
 updated_by uuid not null references public.users(id),updated_at timestamptz not null default clock_timestamp(),foreign key(tenant_id,window_id) references public.assessment_exam_windows(tenant_id,id)
);
alter table public.assessment_attempts add column grading_policy_snapshot jsonb not null default '{"marker_count":2,"tolerance_percent":0}'::jsonb;
create function public.assessment_grading_pin_policy() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare win uuid;policy public.assessment_grading_policies;
begin
 if tg_op='UPDATE' then if new.grading_policy_snapshot is distinct from old.grading_policy_snapshot then raise exception 'immutable_grading_policy' using errcode='23514';end if;return new;end if;
 select window_id into win from public.assessment_registrations where id=new.registration_id;
 perform 1 from public.assessment_exam_windows where id=win for update;
 select * into policy from public.assessment_grading_policies where window_id=win;
 new.grading_policy_snapshot:=jsonb_build_object('marker_count',coalesce(policy.marker_count,2),'tolerance_percent',coalesce(policy.tolerance_percent,0));return new;
end; $$;
create trigger assessment_grading_pin_policy before insert or update of grading_policy_snapshot on public.assessment_attempts for each row execute function public.assessment_grading_pin_policy();
create table public.assessment_grading_jobs (
 tenant_id uuid not null,attempt_id uuid not null,generation integer not null check(generation>0),state text not null default 'pending' check(state in ('pending','leased','committed')),
 lease_token uuid,leased_until timestamptz,dispatch_attempts integer not null default 0,created_at timestamptz not null default clock_timestamp(),committed_at timestamptz,
 primary key(attempt_id,generation),foreign key(tenant_id,attempt_id) references public.assessment_attempts(tenant_id,id),check((lease_token is null)=(leased_until is null))
);
create index assessment_grading_pending on public.assessment_grading_jobs(state,leased_until,created_at) where state<>'committed';
create table public.assessment_grading_runs (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,attempt_id uuid not null,generation integer not null,
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),scorer_version text not null check(scorer_version='assessment.scorer.v1'),objective_scores jsonb not null,policy_snapshot jsonb not null,
 status text not null default 'needs_human' check(status in ('needs_human','ready','approved','released')),approved_by uuid references public.users(id),approved_at timestamptz,approved_hash text,score_revision_id uuid references public.assessment_score_revisions(id),created_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,id),unique(attempt_id,generation),foreign key(tenant_id,attempt_id) references public.assessment_attempts(tenant_id,id)
);
create table public.assessment_grading_tasks (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,run_id uuid not null,item_version_id uuid not null,item_snapshot jsonb not null,rubric_snapshot jsonb not null,response_snapshot jsonb not null,max_score numeric(16,6) not null check(max_score>0),created_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,id),unique(run_id,item_version_id),foreign key(tenant_id,run_id) references public.assessment_grading_runs(tenant_id,id),foreign key(tenant_id,item_version_id) references public.assessment_item_versions(tenant_id,id)
);
create table public.assessment_grading_assignments (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,task_id uuid not null,marker_id uuid not null references public.users(id),slot integer not null check(slot in (1,2)),assigned_by uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp(),revoked_at timestamptz,
 unique(tenant_id,id),foreign key(tenant_id,task_id) references public.assessment_grading_tasks(tenant_id,id)
);
create unique index assessment_grading_slot on public.assessment_grading_assignments(task_id,slot) where revoked_at is null;
create unique index assessment_grading_marker on public.assessment_grading_assignments(task_id,marker_id) where revoked_at is null;
create table public.assessment_grading_marks (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,assignment_id uuid not null,revision integer not null check(revision>0),criteria jsonb not null,score numeric(16,6) not null check(score>=0),rationale text not null check(length(rationale) between 1 and 5000),created_by uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp(),
 unique(assignment_id,revision),foreign key(tenant_id,assignment_id) references public.assessment_grading_assignments(tenant_id,id)
);
create table public.assessment_grading_adjudications (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,task_id uuid not null,input_hash text not null,score numeric(16,6) not null check(score>=0),rationale text not null check(length(rationale) between 1 and 5000),created_by uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp(),foreign key(tenant_id,task_id) references public.assessment_grading_tasks(tenant_id,id)
);
create table public.assessment_grading_releases (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,run_id uuid not null unique,score_revision_id uuid not null references public.assessment_score_revisions(id),release_at timestamptz not null,released_by uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp(),foreign key(tenant_id,run_id) references public.assessment_grading_runs(tenant_id,id)
);
create table public.assessment_grading_commands (
 tenant_id uuid not null,actor_id uuid not null references public.users(id),idempotency_key text not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key)
);
create function public.assessment_grading_run_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'immutable_grading_run' using errcode='23514';end if;
 if (new.id,new.tenant_id,new.attempt_id,new.generation,new.input_hash,new.scorer_version,new.objective_scores,new.policy_snapshot,new.created_at) is distinct from (old.id,old.tenant_id,old.attempt_id,old.generation,old.input_hash,old.scorer_version,old.objective_scores,old.policy_snapshot,old.created_at) then raise exception 'immutable_grading_inputs' using errcode='23514';end if;
 if old.status in ('approved','released') and ((new.approved_by,new.approved_at,new.approved_hash,new.score_revision_id) is distinct from (old.approved_by,old.approved_at,old.approved_hash,old.score_revision_id) or new.status not in ('approved','released') or (old.status='released' and new.status<>'released')) then raise exception 'immutable_grading_approval' using errcode='23514';end if;
 return new;
end; $$;
create trigger grading_run_guard before update or delete on public.assessment_grading_runs for each row execute function public.assessment_grading_run_guard();
create function public.assessment_grading_assignment_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'immutable_grading_assignment' using errcode='23514';end if;
 if (new.id,new.tenant_id,new.task_id,new.marker_id,new.slot,new.assigned_by,new.created_at) is distinct from (old.id,old.tenant_id,old.task_id,old.marker_id,old.slot,old.assigned_by,old.created_at) or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then raise exception 'immutable_grading_assignment' using errcode='23514';end if;return new;
end; $$;
create trigger grading_assignment_guard before update or delete on public.assessment_grading_assignments for each row execute function public.assessment_grading_assignment_guard();
create function public.assessment_grading_enqueue() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin if new.state in ('submitted','expired') then insert into public.assessment_grading_jobs(tenant_id,attempt_id,generation) values(new.tenant_id,new.id,1) on conflict do nothing;end if;return new;end; $$;
create trigger assessment_grading_enqueue after insert or update of state on public.assessment_attempts for each row execute function public.assessment_grading_enqueue();
insert into public.assessment_grading_jobs(tenant_id,attempt_id,generation) select tenant_id,id,1 from public.assessment_attempts where state in ('submitted','expired');
do $$ declare name text;begin
 foreach name in array array['assessment_grading_policies','assessment_grading_jobs','assessment_grading_runs','assessment_grading_tasks','assessment_grading_assignments','assessment_grading_marks','assessment_grading_adjudications','assessment_grading_releases','assessment_grading_commands'] loop
  execute format('alter table public.%I enable row level security',name);execute format('revoke all on public.%I from anon,authenticated',name);execute format('grant all on public.%I to service_role',name);
 end loop;
 foreach name in array array['assessment_grading_tasks','assessment_grading_marks','assessment_grading_adjudications','assessment_grading_releases','assessment_grading_commands'] loop execute format('create trigger immutable_record before update or delete on public.%I for each row execute function public.assessment_immutable()',name);end loop;
end; $$;

create function public.assessment_grading_claim(p_limit integer default 100) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_claim_limit' using errcode='22023';end if;
 with picked as(select attempt_id,generation from public.assessment_grading_jobs where state<>'committed' and (leased_until is null or leased_until<=clock_timestamp()) order by created_at,attempt_id,generation limit p_limit for update skip locked), claimed as(
 update public.assessment_grading_jobs j set state='leased',lease_token=gen_random_uuid(),leased_until=clock_timestamp()+interval '3 minutes',dispatch_attempts=dispatch_attempts+1 from picked where j.attempt_id=picked.attempt_id and j.generation=picked.generation returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('schema_version','assessment.grading.job.v1','tenant_id',tenant_id,'attempt_id',attempt_id,'generation',generation,'lease_token',lease_token)),'[]'::jsonb) into result from claimed;return result;
end; $$;
create function public.assessment_grading_input(p_tenant uuid,p_attempt uuid,p_generation integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare att public.assessment_attempts;items jsonb;payload jsonb;expected integer;distinct_items integer;
begin
 select * into att from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt;if not found or att.state not in ('submitted','expired') then raise exception 'attempt_not_finalized' using errcode='23514';end if;
 select jsonb_agg(jsonb_build_object('item_version_id',v.id,'item',v.payload,'key',k.key,'response',coalesce(r.response,'null'::jsonb),'rubric',case when b.id is null then null else jsonb_build_object('id',b.id,'title',b.title,'criteria',b.criteria) end) order by v.id) into items
 from public.assessment_forms f cross join lateral jsonb_array_elements(f.manifest->'sections') section cross join lateral jsonb_array_elements(section->'items') entry
 join public.assessment_item_versions v on v.id=(entry->>'item_version_id')::uuid and v.tenant_id=p_tenant join public.assessment_item_keys k on k.item_version_id=v.id and k.tenant_id=p_tenant
 left join public.assessment_rubrics b on b.id=(v.payload->>'rubric_id')::uuid and b.tenant_id=p_tenant
 left join lateral(select response from public.assessment_response_journal where attempt_id=p_attempt and item_version_id=v.id order by sequence desc limit 1) r on true where f.id=att.form_id;
 select count(*),count(distinct entry->>'item_version_id') into expected,distinct_items from public.assessment_forms f cross join lateral jsonb_array_elements(f.manifest->'sections') section cross join lateral jsonb_array_elements(section->'items') entry where f.id=att.form_id;
 if expected<1 or expected>25000 or expected<>distinct_items or items is null or jsonb_array_length(items)<>expected then raise exception 'invalid_grading_form' using errcode='23514';end if;
 payload:=jsonb_build_object('attempt_id',p_attempt,'generation',p_generation,'policy',att.grading_policy_snapshot,'items',items);
 return payload||jsonb_build_object('input_hash',encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
end; $$;
create function public.assessment_grading_bundle(p_tenant uuid,p_attempt uuid,p_generation integer,p_lease_token uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.assessment_grading_jobs where tenant_id=p_tenant and attempt_id=p_attempt and generation=p_generation and state='leased' and lease_token=p_lease_token and leased_until>clock_timestamp()) then raise exception 'invalid_grading_lease' using errcode='42501';end if;
 return public.assessment_grading_input(p_tenant,p_attempt,p_generation);
end; $$;
create function public.assessment_grading_receipt(p_tenant uuid,p_attempt uuid,p_generation integer) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'generation',r.generation) from public.assessment_grading_runs r join public.assessment_grading_jobs j on j.attempt_id=r.attempt_id and j.generation=r.generation where r.tenant_id=p_tenant and r.attempt_id=p_attempt and r.generation=p_generation and j.state='committed';
$$;
create function public.assessment_grading_commit(p_tenant uuid,p_attempt uuid,p_generation integer,p_lease_token uuid,p_report jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.assessment_grading_jobs;existing public.assessment_grading_runs;input jsonb;entry jsonb;score jsonb;run_id uuid;expected integer;has_human boolean:=false;point numeric;maximum numeric;candidate uuid;
begin
 select candidate_id into candidate from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt for update;if not found then raise exception 'not_found' using errcode='P0002';end if;
 select * into job from public.assessment_grading_jobs where tenant_id=p_tenant and attempt_id=p_attempt and generation=p_generation for update;
 select * into existing from public.assessment_grading_runs where tenant_id=p_tenant and attempt_id=p_attempt and generation=p_generation;
 if job.state='committed' and existing.id is not null then if existing.input_hash is distinct from p_report->>'input_hash' or existing.objective_scores is distinct from p_report->'scores' then raise exception 'grading_commit_conflict' using errcode='23505';end if;return jsonb_build_object('id',existing.id,'generation',existing.generation);end if;
 if job.state is distinct from 'leased' or job.lease_token is distinct from p_lease_token or job.leased_until<=clock_timestamp() then raise exception 'invalid_grading_lease' using errcode='42501';end if;
 input:=public.assessment_grading_input(p_tenant,p_attempt,p_generation);
 if p_report->>'scorer_version' is distinct from 'assessment.scorer.v1' or p_report->>'input_hash' is distinct from input->>'input_hash' or jsonb_typeof(p_report->'scores') is distinct from 'array' then raise exception 'invalid_grading_report' using errcode='23514';end if;
 expected:=jsonb_array_length(input->'items');if jsonb_array_length(p_report->'scores')<>expected or (select count(distinct value->>'item_version_id') from jsonb_array_elements(p_report->'scores'))<>expected then raise exception 'invalid_grading_items' using errcode='23514';end if;
 for entry in select value from jsonb_array_elements(input->'items') loop
  select value into score from jsonb_array_elements(p_report->'scores') where value->>'item_version_id'=entry->>'item_version_id';maximum:=(entry->'item'->>'max_score')::numeric;
  if score is null or (score->>'max_score')::numeric is distinct from maximum or maximum<>round(maximum,6) then raise exception 'invalid_grading_maximum' using errcode='23514';end if;
  if entry->'item'->>'type' in ('essay','audio_response','video_response','file_response') then
   if score->>'status' is distinct from 'needs_human' or score->'score' is distinct from 'null'::jsonb or jsonb_typeof(entry->'rubric') is distinct from 'object' then raise exception 'subjective_human_required' using errcode='23514';end if;has_human:=true;
  else
   if jsonb_typeof(score->'score') is distinct from 'number' or score->>'status' is distinct from 'scored' then raise exception 'invalid_objective_score' using errcode='23514';end if;
   point:=(score->>'score')::numeric;if point<0 or point>maximum or point<>round(point,6) then raise exception 'invalid_objective_score' using errcode='23514';end if;
  end if;
 end loop;
 insert into public.assessment_grading_runs(tenant_id,attempt_id,generation,input_hash,scorer_version,objective_scores,policy_snapshot,status) values(p_tenant,p_attempt,p_generation,input->>'input_hash','assessment.scorer.v1',p_report->'scores',input->'policy',case when has_human then 'needs_human' else 'ready' end) returning id into run_id;
 for entry in select value from jsonb_array_elements(input->'items') where value->'item'->>'type' in ('essay','audio_response','video_response','file_response') loop
  insert into public.assessment_grading_tasks(tenant_id,run_id,item_version_id,item_snapshot,rubric_snapshot,response_snapshot,max_score) values(p_tenant,run_id,(entry->>'item_version_id')::uuid,entry->'item',entry->'rubric',entry->'response',(entry->'item'->>'max_score')::numeric);
 end loop;
 insert into public.assessment_score_revisions(tenant_id,attempt_id,scores,status,source) values(p_tenant,p_attempt,p_report->'scores','needs_human','deterministic');
 update public.assessment_grading_jobs set state='committed',lease_token=null,leased_until=null,committed_at=clock_timestamp() where attempt_id=p_attempt and generation=p_generation;
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,candidate,'grading.deterministic.complete',run_id,jsonb_build_object('source','server_grading_job','generation',p_generation,'scorer_version','assessment.scorer.v1'));
 return jsonb_build_object('id',run_id,'generation',p_generation);
end; $$;

create function public.assessment_grading_task_decision(p_task uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare task public.assessment_grading_tasks;run public.assessment_grading_runs;marks jsonb;decision public.assessment_grading_adjudications;fingerprint text;needed integer;achieved numeric;low numeric;high numeric;counted integer;
begin
 select * into task from public.assessment_grading_tasks where id=p_task;if not found then raise exception 'not_found' using errcode='P0002';end if;
 select * into run from public.assessment_grading_runs where id=task.run_id;needed:=(run.policy_snapshot->>'marker_count')::integer;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'marker_id',a.marker_id,'score',m.score,'criteria',m.criteria,'revision',m.revision) order by a.slot),'[]'::jsonb),count(m.id),min(m.score),max(m.score),avg(m.score)
 into marks,counted,low,high,achieved from public.assessment_grading_assignments a
 join lateral(select * from public.assessment_grading_marks where assignment_id=a.id order by revision desc limit 1) m on true where a.task_id=task.id and a.revoked_at is null;
 fingerprint:=encode(sha256(convert_to(marks::text,'UTF8')),'hex');
 if counted<needed then return jsonb_build_object('status','awaiting_marks','score',null,'input_hash',fingerprint,'marks',marks);end if;
 select * into decision from public.assessment_grading_adjudications where task_id=task.id and input_hash=fingerprint order by created_at desc,id desc limit 1;
 if decision.id is not null then return jsonb_build_object('status','adjudicated','score',decision.score,'input_hash',fingerprint,'marks',marks,'adjudication_id',decision.id);end if;
 if high-low>task.max_score*(run.policy_snapshot->>'tolerance_percent')::numeric/100 then return jsonb_build_object('status','needs_moderation','score',null,'input_hash',fingerprint,'marks',marks);end if;
 return jsonb_build_object('status','agreed','score',round(achieved,6),'input_hash',fingerprint,'marks',marks);
end; $$;
create function public.assessment_grading_summary(p_run uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare run public.assessment_grading_runs;task public.assessment_grading_tasks;entry jsonb;decision jsonb;scores jsonb:='[]'::jsonb;total numeric:=0;maximum numeric:=0;ready boolean:=true;payload jsonb;
begin
 select * into run from public.assessment_grading_runs where id=p_run;if not found then raise exception 'not_found' using errcode='P0002';end if;
 for entry in select value from jsonb_array_elements(run.objective_scores) loop
  if entry->>'status'='needs_human' then
   select * into task from public.assessment_grading_tasks where run_id=run.id and item_version_id=(entry->>'item_version_id')::uuid;decision:=public.assessment_grading_task_decision(task.id);
   entry:=jsonb_build_object('item_version_id',task.item_version_id,'max_score',task.max_score,'score',decision->'score','status',decision->>'status','input_hash',decision->>'input_hash');
   if decision->'score'='null'::jsonb then ready:=false;else total:=total+(decision->>'score')::numeric;end if;
  else total:=total+(entry->>'score')::numeric;end if;
  maximum:=maximum+(entry->>'max_score')::numeric;scores:=scores||jsonb_build_array(entry);
 end loop;
 payload:=jsonb_build_object('id',run.id,'generation',run.generation,'ready',ready,'total',case when ready then total else null end,'max_score',maximum,'scores',scores);
 return payload||jsonb_build_object('review_hash',encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
end; $$;
create function public.assessment_grading_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare run public.assessment_grading_runs;task public.assessment_grading_tasks;assignment public.assessment_grading_assignments;prior public.assessment_grading_commands;candidate uuid;win uuid;request jsonb;result jsonb;needed integer;marker uuid;slot integer;criteria jsonb;criterion jsonb;points numeric;sum_points numeric:=0;sum_max numeric:=0;score numeric;revision integer;rid uuid;summary jsonb;decision jsonb;release_time timestamptz;
begin
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 if p_action not in ('policy.configure','marker.assign','marker.revoke','mark.submit','mark.adjudicate','grade.approve','grade.release','grade.regrade') then raise exception 'unknown_action' using errcode='22023';end if;
 if not public.assessment_has_capability(p_tenant,p_actor,case when p_action='mark.submit' then 'grades.mark' when p_action='grade.release' then 'results.release' else 'grades.moderate' end) then raise exception 'forbidden' using errcode='42501';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data);perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'grading'||p_key,0));
 select * into prior from public.assessment_grading_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='policy.configure' then
  win:=(p_data->>'window_id')::uuid;perform 1 from public.assessment_exam_windows where tenant_id=p_tenant and id=win for update;if not found then raise exception 'not_found' using errcode='P0002';end if;
  if exists(select 1 from public.assessment_attempts a join public.assessment_registrations r on r.id=a.registration_id where r.window_id=win) then raise exception 'grading_policy_frozen' using errcode='23514';end if;
  insert into public.assessment_grading_policies(tenant_id,window_id,marker_count,tolerance_percent,updated_by) values(p_tenant,win,(p_data->>'marker_count')::integer,(p_data->>'tolerance_percent')::numeric,p_actor)
  on conflict(window_id) do update set marker_count=excluded.marker_count,tolerance_percent=excluded.tolerance_percent,updated_by=excluded.updated_by,updated_at=clock_timestamp();result:=jsonb_build_object('window_id',win);
 else
  if p_action in ('marker.assign','marker.revoke','mark.submit','mark.adjudicate') then
   select * into task from public.assessment_grading_tasks where tenant_id=p_tenant and id=(p_data->>'task_id')::uuid;if not found then raise exception 'not_found' using errcode='P0002';end if;
   select * into run from public.assessment_grading_runs where id=task.run_id and tenant_id=p_tenant for update;
  else select * into run from public.assessment_grading_runs where tenant_id=p_tenant and id=(p_data->>'run_id')::uuid for update;end if;
  if run.id is null then raise exception 'not_found' using errcode='P0002';end if;
  select candidate_id into candidate from public.assessment_attempts where id=run.attempt_id;
  if p_actor=candidate then raise exception 'candidate_cannot_grade' using errcode='42501';end if;
  if p_action in ('marker.assign','marker.revoke','mark.submit','mark.adjudicate') and run.status in ('approved','released') then raise exception 'grading_run_finalized' using errcode='23514';end if;
  if p_action='marker.assign' then
   marker:=(p_data->>'marker_id')::uuid;slot:=(p_data->>'slot')::integer;needed:=(run.policy_snapshot->>'marker_count')::integer;
   if slot is null or slot not between 1 and needed or marker=candidate or not public.assessment_has_capability(p_tenant,marker,'grades.mark') then raise exception 'invalid_marker' using errcode='42501';end if;
   insert into public.assessment_grading_assignments(tenant_id,task_id,marker_id,slot,assigned_by) values(p_tenant,task.id,marker,slot,p_actor) returning id into rid;result:=jsonb_build_object('id',rid);
  elsif p_action='marker.revoke' then
   if coalesce(length(btrim(p_data->>'reason')),0) not between 1 and 5000 then raise exception 'reason_required' using errcode='22023';end if;
   update public.assessment_grading_assignments set revoked_at=clock_timestamp() where tenant_id=p_tenant and task_id=task.id and id=(p_data->>'assignment_id')::uuid and revoked_at is null returning id into rid;
   if rid is null then raise exception 'not_found' using errcode='P0002';end if;result:=jsonb_build_object('id',rid);
  elsif p_action='mark.submit' then
   select * into assignment from public.assessment_grading_assignments where tenant_id=p_tenant and task_id=task.id and marker_id=p_actor and revoked_at is null;
   if not found then raise exception 'marker_assignment_required' using errcode='42501';end if;
   criteria:=p_data->'criteria';if jsonb_typeof(criteria) is distinct from 'object' or (select count(*) from jsonb_object_keys(criteria))<>jsonb_array_length(task.rubric_snapshot->'criteria') then raise exception 'invalid_mark_criteria' using errcode='23514';end if;
   for criterion in select value from jsonb_array_elements(task.rubric_snapshot->'criteria') loop
    if jsonb_typeof(criteria->(criterion->>'id')) is distinct from 'number' then raise exception 'invalid_mark_criteria' using errcode='23514';end if;
    points:=(criteria->>(criterion->>'id'))::numeric;
    if points<0 or points>(criterion->>'max_score')::numeric or points<>round(points,6) then raise exception 'invalid_mark_score' using errcode='23514';end if;
    sum_points:=sum_points+points;sum_max:=sum_max+(criterion->>'max_score')::numeric;
   end loop;
   if sum_max<=0 then raise exception 'invalid_rubric' using errcode='23514';end if;score:=round(task.max_score*sum_points/sum_max,6);
   select coalesce(max(m.revision),0)+1 into revision from public.assessment_grading_marks m where m.assignment_id=assignment.id;
   insert into public.assessment_grading_marks(tenant_id,assignment_id,revision,criteria,score,rationale,created_by) values(p_tenant,assignment.id,revision,criteria,score,p_data->>'rationale',p_actor) returning id into rid;result:=jsonb_build_object('id',rid,'revision',revision,'score',score);
  elsif p_action='mark.adjudicate' then
   decision:=public.assessment_grading_task_decision(task.id);
   if decision->>'status'<>'needs_moderation' or decision->>'input_hash' is distinct from p_data->>'review_hash' then raise exception 'moderation_review_required' using errcode='23505';end if;
   if exists(select 1 from public.assessment_grading_assignments where task_id=task.id and marker_id=p_actor and revoked_at is null) then raise exception 'independent_adjudicator_required' using errcode='42501';end if;
   score:=(p_data->>'score')::numeric;if score is null or score<0 or score>task.max_score or score<>round(score,6) then raise exception 'invalid_adjudication_score' using errcode='23514';end if;
   insert into public.assessment_grading_adjudications(tenant_id,task_id,input_hash,score,rationale,created_by) values(p_tenant,task.id,decision->>'input_hash',score,p_data->>'rationale',p_actor) returning id into rid;result:=jsonb_build_object('id',rid);
  elsif p_action='grade.approve' then
   if run.status in ('approved','released') then raise exception 'grading_run_finalized' using errcode='23514';end if;summary:=public.assessment_grading_summary(run.id);
   if not (summary->>'ready')::boolean or summary->>'review_hash' is distinct from p_data->>'review_hash' then raise exception 'grade_review_required' using errcode='23505';end if;
   if exists(select 1 from public.assessment_grading_marks m join public.assessment_grading_assignments a on a.id=m.assignment_id join public.assessment_grading_tasks t on t.id=a.task_id where t.run_id=run.id and m.created_by=p_actor and a.revoked_at is null) then raise exception 'independent_grade_approver_required' using errcode='42501';end if;
   if exists(select 1 from public.assessment_grading_adjudications d join public.assessment_grading_tasks t on t.id=d.task_id where t.run_id=run.id and d.created_by=p_actor and d.input_hash=public.assessment_grading_task_decision(t.id)->>'input_hash') then raise exception 'independent_grade_approver_required' using errcode='42501';end if;
   insert into public.assessment_score_revisions(tenant_id,attempt_id,scores,status,source,approved_by) values(p_tenant,run.attempt_id,summary->'scores','approved','human',p_actor) returning id into rid;
   update public.assessment_grading_runs set status='approved',approved_by=p_actor,approved_at=clock_timestamp(),approved_hash=summary->>'review_hash',score_revision_id=rid where id=run.id;result:=jsonb_build_object('id',run.id,'score_revision_id',rid,'total',summary->'total');
  elsif p_action='grade.release' then
   if run.status<>'approved' then raise exception 'approved_grade_required' using errcode='23514';end if;release_time:=greatest(coalesce((p_data->>'release_at')::timestamptz,clock_timestamp()),clock_timestamp());
   insert into public.assessment_grading_releases(tenant_id,run_id,score_revision_id,release_at,released_by) values(p_tenant,run.id,run.score_revision_id,release_time,p_actor) returning id into rid;update public.assessment_grading_runs set status='released' where id=run.id;
   insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key) values('assessment.result.released','v1','assessment_attempt',run.attempt_id,candidate,jsonb_build_object('tenant_id',p_tenant,'run_id',run.id,'score_revision_id',run.score_revision_id,'release_at',release_time),'assessment.release:'||run.id);result:=jsonb_build_object('id',rid,'release_at',release_time);
  elsif p_action='grade.regrade' then
   if coalesce(length(btrim(p_data->>'reason')),0) not between 1 and 5000 then raise exception 'reason_required' using errcode='22023';end if;
   if run.generation<>(select max(generation) from public.assessment_grading_runs where attempt_id=run.attempt_id) or exists(select 1 from public.assessment_grading_jobs where attempt_id=run.attempt_id and state<>'committed') then raise exception 'regrade_already_pending' using errcode='23505';end if;
   insert into public.assessment_grading_jobs(tenant_id,attempt_id,generation) values(p_tenant,run.attempt_id,run.generation+1);result:=jsonb_build_object('attempt_id',run.attempt_id,'generation',run.generation+1);
  end if;
  if p_action in ('marker.assign','marker.revoke','mark.submit','mark.adjudicate') then summary:=public.assessment_grading_summary(run.id);update public.assessment_grading_runs set status=case when (summary->>'ready')::boolean then 'ready' else 'needs_human' end where id=run.id;end if;
 end if;
 insert into public.assessment_grading_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'grading.'||p_action,coalesce(run.id,win),jsonb_build_object('task_id',task.id,'generation',run.generation,'reason',p_data->>'reason'));
 return result;
end; $$;
create function public.assessment_grading_read(p_actor uuid,p_tenant uuid,p_kind text,p_id uuid default null,p_after uuid default null,p_limit integer default 100) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare task public.assessment_grading_tasks;run public.assessment_grading_runs;assignment public.assessment_grading_assignments;decision jsonb;summary jsonb;result jsonb;moderator boolean;marker boolean;publisher boolean;
begin
 if p_kind='access' then return jsonb_build_object('can_mark',public.assessment_has_capability(p_tenant,p_actor,'grades.mark'),'can_moderate',public.assessment_has_capability(p_tenant,p_actor,'grades.moderate'),'can_release',public.assessment_has_capability(p_tenant,p_actor,'results.release'),'can_read_banks',public.assessment_has_capability(p_tenant,p_actor,'banks.read'),'can_write_items',public.assessment_has_capability(p_tenant,p_actor,'items.write'),'can_approve_items',public.assessment_has_capability(p_tenant,p_actor,'items.approve'),'can_publish',public.assessment_has_capability(p_tenant,p_actor,'assessments.publish'),'can_manage_exams',public.assessment_has_capability(p_tenant,p_actor,'exams.manage'));end if;
 if p_kind='results' then
  select coalesce(jsonb_agg(value),'[]'::jsonb) into result from (select distinct on(r.attempt_id) jsonb_build_object('attempt_id',r.attempt_id,'generation',r.generation,'score_revision_id',l.score_revision_id,'released_at',l.release_at,'total',(select sum((s->>'score')::numeric) from jsonb_array_elements(v.scores) s),'max_score',(select sum((s->>'max_score')::numeric) from jsonb_array_elements(v.scores) s)) value
   from public.assessment_grading_releases l join public.assessment_grading_runs r on r.id=l.run_id join public.assessment_attempts a on a.id=r.attempt_id join public.assessment_score_revisions v on v.id=l.score_revision_id where l.tenant_id=p_tenant and a.candidate_id=p_actor and l.release_at<=clock_timestamp() order by r.attempt_id,r.generation desc) visible;
  return result;
 end if;
 moderator:=public.assessment_has_capability(p_tenant,p_actor,'grades.moderate');marker:=public.assessment_has_capability(p_tenant,p_actor,'grades.mark');publisher:=public.assessment_has_capability(p_tenant,p_actor,'results.release');
 if not moderator and not marker and not publisher then raise exception 'forbidden' using errcode='42501';end if;
 if p_kind='worklist' then
  if not moderator and not marker then raise exception 'forbidden' using errcode='42501';end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_page_limit' using errcode='22023';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'run_id',t.run_id,'type',t.item_snapshot->>'type','status',public.assessment_grading_task_decision(t.id)->>'status')),'[]'::jsonb) into result from (select t.* from public.assessment_grading_tasks t join public.assessment_grading_runs r on r.id=t.run_id join public.assessment_attempts attempt on attempt.id=r.attempt_id where t.tenant_id=p_tenant and attempt.candidate_id<>p_actor and (moderator or exists(select 1 from public.assessment_grading_assignments a where a.task_id=t.id and a.marker_id=p_actor and a.revoked_at is null)) and (p_after is null or t.id>p_after) order by t.id limit p_limit) t;
  return result;
 elsif p_kind='markers' then
  if not moderator then raise exception 'forbidden' using errcode='42501';end if;
  select * into task from public.assessment_grading_tasks where tenant_id=p_tenant and id=p_id;if not found then raise exception 'not_found' using errcode='P0002';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(left(coalesce(to_jsonb(u)->>'full_name',to_jsonb(u)->>'display_name',to_jsonb(u)->>'name',to_jsonb(u)->>'username'),200),''),'Staff account '||left(u.id::text,8))) order by u.id),'[]'::jsonb) into result from public.users u
  where public.assessment_has_capability(p_tenant,u.id,'grades.mark') and u.id<>(select a.candidate_id from public.assessment_attempts a join public.assessment_grading_runs r on r.attempt_id=a.id where r.id=task.run_id);return result;
 elsif p_kind='runs' then
  if not moderator and not publisher then raise exception 'forbidden' using errcode='42501';end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_page_limit' using errcode='22023';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'generation',r.generation,'status',r.status,'created_at',r.created_at)),'[]'::jsonb) into result from (select r.* from public.assessment_grading_runs r join public.assessment_attempts a on a.id=r.attempt_id where r.tenant_id=p_tenant and a.candidate_id<>p_actor and (moderator or r.status in ('approved','released')) and (p_after is null or r.id>p_after) order by r.id limit p_limit) r;return result;
 elsif p_kind='run' then
  if not moderator and not publisher then raise exception 'forbidden' using errcode='42501';end if;
  select * into run from public.assessment_grading_runs where tenant_id=p_tenant and id=p_id;if not found then raise exception 'not_found' using errcode='P0002';end if;
  if not moderator and run.status not in ('approved','released') then raise exception 'forbidden' using errcode='42501';end if;
  if exists(select 1 from public.assessment_attempts where id=run.attempt_id and candidate_id=p_actor) then raise exception 'candidate_private_grading' using errcode='42501';end if;
  if exists(select 1 from public.assessment_grading_assignments a join public.assessment_grading_tasks t on t.id=a.task_id where t.run_id=run.id and a.marker_id=p_actor and a.revoked_at is null) then raise exception 'blind_marker_review' using errcode='42501';end if;
  summary:=public.assessment_grading_summary(run.id);return summary||jsonb_build_object('status',run.status,'approved_by',run.approved_by,'score_revision_id',run.score_revision_id,'can_approve',moderator and (summary->>'ready')::boolean and run.status in ('needs_human','ready') and not exists(select 1 from public.assessment_grading_adjudications d join public.assessment_grading_tasks t on t.id=d.task_id where t.run_id=run.id and d.created_by=p_actor and d.input_hash=public.assessment_grading_task_decision(t.id)->>'input_hash'),'can_release',publisher and run.status='approved','can_regrade',moderator and run.generation=(select max(generation) from public.assessment_grading_runs where attempt_id=run.attempt_id) and not exists(select 1 from public.assessment_grading_jobs where attempt_id=run.attempt_id and state<>'committed'));
 elsif p_kind='task' then
  select * into task from public.assessment_grading_tasks where tenant_id=p_tenant and id=p_id;if not found then raise exception 'not_found' using errcode='P0002';end if;
  select * into run from public.assessment_grading_runs where id=task.run_id;
  if exists(select 1 from public.assessment_grading_runs r join public.assessment_attempts a on a.id=r.attempt_id where r.id=task.run_id and a.candidate_id=p_actor) then raise exception 'candidate_private_grading' using errcode='42501';end if;
  select * into assignment from public.assessment_grading_assignments where task_id=task.id and marker_id=p_actor and revoked_at is null;
  if assignment.id is null and not moderator then raise exception 'marker_assignment_required' using errcode='42501';end if;
  decision:=public.assessment_grading_task_decision(task.id);
  result:=jsonb_build_object('id',task.id,'run_id',task.run_id,'run_status',run.status,'can_mark',marker and assignment.id is not null and run.status in ('needs_human','ready'),'can_adjudicate',moderator and assignment.id is null and run.status in ('needs_human','ready') and decision->>'status'='needs_moderation','item',task.item_snapshot,'rubric',task.rubric_snapshot,'response',task.response_snapshot,'max_score',task.max_score,'status',decision->>'status','own_mark',(select jsonb_build_object('criteria',m.criteria,'score',m.score,'rationale',m.rationale,'revision',m.revision) from public.assessment_grading_marks m where m.assignment_id=assignment.id order by m.revision desc limit 1));
  if assignment.id is null and moderator then result:=result||jsonb_build_object('marks',decision->'marks','review_hash',decision->>'input_hash','can_assign',run.status in ('needs_human','ready'),'required_markers',(run.policy_snapshot->>'marker_count')::integer,'tolerance_percent',run.policy_snapshot->'tolerance_percent','assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'marker_id',a.marker_id,'slot',a.slot) order by a.slot),'[]'::jsonb) from public.assessment_grading_assignments a where a.task_id=task.id and a.revoked_at is null));end if;return result;
 end if;
 raise exception 'unknown_resource' using errcode='22023';
end; $$;
create function public.assessment_grading_can_read_score(p_tenant uuid,p_attempt uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.assessment_has_capability(p_tenant,auth.uid(),'results.read') and exists(select 1 from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt and candidate_id<>auth.uid());
$$;
revoke all on function public.assessment_grading_can_read_score(uuid,uuid) from public,anon;
grant execute on function public.assessment_grading_can_read_score(uuid,uuid) to authenticated,service_role;
drop policy institution_select on public.assessment_score_revisions;
create policy institution_select on public.assessment_score_revisions for select to authenticated using(public.assessment_grading_can_read_score(tenant_id,attempt_id));
revoke all on function public.assessment_grading_pin_policy(),public.assessment_grading_enqueue(),public.assessment_grading_claim(integer),public.assessment_grading_input(uuid,uuid,integer),public.assessment_grading_bundle(uuid,uuid,integer,uuid),public.assessment_grading_commit(uuid,uuid,integer,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.assessment_grading_task_decision(uuid),public.assessment_grading_summary(uuid),public.assessment_grading_command(uuid,uuid,text,text,jsonb),public.assessment_grading_read(uuid,uuid,text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.assessment_grading_claim(integer),public.assessment_grading_bundle(uuid,uuid,integer,uuid),public.assessment_grading_commit(uuid,uuid,integer,uuid,jsonb) to service_role;
grant execute on function public.assessment_grading_command(uuid,uuid,text,text,jsonb),public.assessment_grading_read(uuid,uuid,text,uuid,uuid,integer) to service_role;
revoke all on function public.assessment_grading_receipt(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.assessment_grading_run_guard(),public.assessment_grading_assignment_guard() from public,anon,authenticated,service_role;
grant execute on function public.assessment_grading_receipt(uuid,uuid,integer) to service_role;
commit;
