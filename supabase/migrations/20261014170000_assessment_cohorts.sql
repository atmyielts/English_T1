begin;
create table public.assessment_cohorts(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),title text not null check(length(btrim(title)) between 1 and 200),description text not null default '' check(length(description)<=2000),state text not null default 'active' check(state in('active','archived')),revision bigint not null default 1 check(revision>0),created_by uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp(),unique(tenant_id,id)
);
create table public.assessment_cohort_members(
 tenant_id uuid not null,cohort_id uuid not null,user_id uuid not null references public.users(id),active boolean not null default true,extra_seconds integer not null default 0 check(extra_seconds between 0 and 86400),updated_by uuid not null references public.users(id),updated_at timestamptz not null default clock_timestamp(),primary key(cohort_id,user_id),foreign key(tenant_id,cohort_id) references public.assessment_cohorts(tenant_id,id)
);
create table public.assessment_cohort_commands(tenant_id uuid not null references public.tenants(id),actor_id uuid not null references public.users(id),idempotency_key text not null check(length(idempotency_key) between 8 and 200),request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key));
create table public.assessment_roster_jobs(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,cohort_id uuid not null,window_id uuid not null,review_hash text not null check(review_hash ~ '^[a-f0-9]{64}$'),window_snapshot jsonb not null,cohort_revision bigint not null,
 created_by uuid not null references public.users(id),authorized_by uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp(),state text not null default 'queued' check(state in('queued','running','completed','completed_with_issues','blocked','cancelled')),revision bigint not null default 1,total integer not null check(total>0),processed integer not null default 0 check(processed>=0),blocked_reason text,lease_token uuid,leased_until timestamptz,finished_at timestamptz,
 unique(tenant_id,id),foreign key(tenant_id,cohort_id) references public.assessment_cohorts(tenant_id,id),foreign key(tenant_id,window_id) references public.assessment_exam_windows(tenant_id,id),check(processed<=total),check((lease_token is null)=(leased_until is null))
);
create index assessment_roster_pending on public.assessment_roster_jobs(created_at,id) where state in('queued','running');
create table public.assessment_roster_targets(
 tenant_id uuid not null,job_id uuid not null,user_id uuid not null references public.users(id),name text not null,eligible_at_review boolean not null,extra_seconds integer not null check(extra_seconds between 0 and 86400),outcome text not null default 'pending' check(outcome in('pending','created','existing','conflict','inactive','removed','cancelled')),registration_id uuid,processed_at timestamptz,
 primary key(job_id,user_id),foreign key(tenant_id,job_id) references public.assessment_roster_jobs(tenant_id,id),foreign key(tenant_id,registration_id) references public.assessment_registrations(tenant_id,id),check((outcome='pending')=(processed_at is null)),check((outcome in('created','existing','conflict'))=(registration_id is not null))
);
create index assessment_roster_target_pending on public.assessment_roster_targets(job_id,user_id) where outcome='pending';
create trigger immutable_record before update or delete on public.assessment_cohort_commands for each row execute function public.assessment_immutable();
create function public.assessment_roster_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if tg_op='DELETE' then raise exception 'immutable_roster_history' using errcode='23514';end if;
 if tg_table_name='assessment_roster_targets' then
  if old.outcome<>'pending' or new.outcome='pending' or (to_jsonb(new)-array['outcome','registration_id','processed_at']) is distinct from (to_jsonb(old)-array['outcome','registration_id','processed_at']) then raise exception 'immutable_roster_target' using errcode='23514';end if;
 else
  if (to_jsonb(new)-array['authorized_by','state','revision','processed','blocked_reason','lease_token','leased_until','finished_at']) is distinct from (to_jsonb(old)-array['authorized_by','state','revision','processed','blocked_reason','lease_token','leased_until','finished_at']) or new.revision<>old.revision+1 or old.state in('completed','completed_with_issues','cancelled') then raise exception 'immutable_roster_job' using errcode='23514';end if;
 end if;return new;
end; $$;
create trigger roster_job_guard before update or delete on public.assessment_roster_jobs for each row execute function public.assessment_roster_guard();
create trigger roster_target_guard before update or delete on public.assessment_roster_targets for each row execute function public.assessment_roster_guard();
create function public.assessment_cohort_window(p_tenant uuid,p_window uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',w.id,'assessment_version_id',w.assessment_version_id,'title',w.title,'opens_at',w.opens_at,'closes_at',w.closes_at,'required_services',w.required_services,'proctor_policy_id',b.policy_id) from public.assessment_exam_windows w left join public.proctor_window_policies b on b.window_id=w.id where w.tenant_id=p_tenant and w.id=p_window;
$$;
create function public.assessment_cohort_plan(p_tenant uuid,p_cohort uuid,p_window uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cohort public.assessment_cohorts;sitting jsonb;members jsonb;payload jsonb;
begin
 select * into cohort from public.assessment_cohorts where tenant_id=p_tenant and id=p_cohort;if not found then raise exception 'cohort_not_found' using errcode='P0002';end if;
 sitting:=public.assessment_cohort_window(p_tenant,p_window);if sitting is null then raise exception 'sitting_not_found' using errcode='P0002';end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(nullif(left(coalesce(to_jsonb(u)->>'full_name',to_jsonb(u)->>'display_name',to_jsonb(u)->>'name',to_jsonb(u)->>'username'),200),''),'Member '||left(u.id::text,8)),'extra_seconds',m.extra_seconds,'eligible',exists(select 1 from public.tenant_memberships a where a.tenant_id=p_tenant and a.user_id=m.user_id and a.status='active'),'registration_id',r.id,'registered_extra_seconds',r.extra_seconds) order by m.user_id),'[]'::jsonb) into members from public.assessment_cohort_members m join public.users u on u.id=m.user_id left join public.assessment_registrations r on r.window_id=p_window and r.candidate_id=m.user_id where m.tenant_id=p_tenant and m.cohort_id=p_cohort and m.active;
 payload:=jsonb_build_object('cohort_id',cohort.id,'cohort_title',cohort.title,'cohort_state',cohort.state,'cohort_revision',cohort.revision,'sitting',sitting,'members',members);
 return payload||jsonb_build_object('review_hash',encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
end; $$;
create function public.assessment_cohort_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_cohort_commands;cohort public.assessment_cohorts;job public.assessment_roster_jobs;plan jsonb;request jsonb;result jsonb;rid uuid;target uuid;
begin
 if p_key is null or length(p_key) not between 8 and 200 or p_data is null or jsonb_typeof(p_data)<>'object' or p_action is null or p_action not in('cohort.create','cohort.revise','member.add','member.remove','job.create','job.resume','job.cancel') then raise exception 'invalid_cohort_command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));
 if not public.assessment_has_capability(p_tenant,p_actor,'exams.manage') then raise exception 'forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'cohorts'||p_key,0));request:=jsonb_build_object('action',p_action,'data',p_data);
 select * into prior from public.assessment_cohort_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action in('job.resume','job.cancel') then
  select * into job from public.assessment_roster_jobs where tenant_id=p_tenant and id=(p_data->>'job_id')::uuid for update;if not found then raise exception 'roster_job_not_found' using errcode='P0002';end if;
  if p_data->>'expected_revision' is distinct from job.revision::text or job.state in('completed','completed_with_issues','cancelled') then raise exception 'roster_job_revision_conflict' using errcode='23505';end if;
  if coalesce(length(btrim(p_data->>'reason')),0) not between 1 and 2000 then raise exception 'roster_reason_required' using errcode='22023';end if;
  if p_action='job.cancel' then
   update public.assessment_roster_targets set outcome='cancelled',processed_at=clock_timestamp() where job_id=job.id and outcome='pending';
   update public.assessment_roster_jobs set state='cancelled',revision=revision+1,lease_token=null,leased_until=null,processed=total,finished_at=clock_timestamp(),blocked_reason=p_data->>'reason' where id=job.id;
  else
   if job.state<>'blocked' then raise exception 'roster_job_not_blocked' using errcode='23514';end if;
   if job.window_snapshot is distinct from public.assessment_cohort_window(p_tenant,job.window_id) then raise exception 'roster_sitting_changed' using errcode='23514';end if;
   if (job.window_snapshot->>'closes_at')::timestamptz<=clock_timestamp() then raise exception 'sitting_closed' using errcode='23514';end if;
   if not exists(select 1 from public.assessment_cohorts where id=job.cohort_id and state='active') then raise exception 'cohort_archived' using errcode='23514';end if;
   update public.assessment_roster_jobs set state='queued',revision=revision+1,authorized_by=p_actor,lease_token=null,leased_until=null,blocked_reason=null where id=job.id;
  end if;rid:=job.id;result:=jsonb_build_object('id',rid);
 elsif p_action='cohort.create' then
  insert into public.assessment_cohorts(tenant_id,title,description,created_by) values(p_tenant,btrim(p_data->>'title'),coalesce(p_data->>'description',''),p_actor) returning id into rid;result:=jsonb_build_object('id',rid);
 else
  select * into cohort from public.assessment_cohorts where tenant_id=p_tenant and id=(p_data->>'cohort_id')::uuid for update;if not found then raise exception 'cohort_not_found' using errcode='P0002';end if;
  if p_action='job.create' then
   perform 1 from public.assessment_exam_windows where tenant_id=p_tenant and id=(p_data->>'window_id')::uuid for share;
   plan:=public.assessment_cohort_plan(p_tenant,cohort.id,(p_data->>'window_id')::uuid);
   if cohort.state<>'active' then raise exception 'cohort_archived' using errcode='23514';end if;
   if plan->>'review_hash' is distinct from p_data->>'review_hash' then raise exception 'roster_review_changed' using errcode='23505';end if;
   if jsonb_array_length(plan->'members')=0 then raise exception 'cohort_empty' using errcode='23514';end if;
   if (plan->'sitting'->>'closes_at')::timestamptz<=clock_timestamp() then raise exception 'sitting_closed' using errcode='23514';end if;
   insert into public.assessment_roster_jobs(tenant_id,cohort_id,window_id,review_hash,window_snapshot,cohort_revision,created_by,authorized_by,total) values(p_tenant,cohort.id,(p_data->>'window_id')::uuid,plan->>'review_hash',plan->'sitting',cohort.revision,p_actor,p_actor,jsonb_array_length(plan->'members')) returning id into rid;
   insert into public.assessment_roster_targets(tenant_id,job_id,user_id,name,eligible_at_review,extra_seconds) select p_tenant,rid,(value->>'user_id')::uuid,value->>'name',(value->>'eligible')::boolean,(value->>'extra_seconds')::integer from jsonb_array_elements(plan->'members');
   result:=jsonb_build_object('id',rid,'total',jsonb_array_length(plan->'members'));
  else
   if p_data->>'expected_revision' is distinct from cohort.revision::text then raise exception 'cohort_revision_conflict' using errcode='23505';end if;
   if p_action='cohort.revise' then
    if coalesce(p_data->>'state','') not in('active','archived') then raise exception 'invalid_cohort_state' using errcode='22023';end if;
    update public.assessment_cohorts set title=btrim(p_data->>'title'),description=coalesce(p_data->>'description',''),state=p_data->>'state',revision=revision+1 where id=cohort.id;
   else
    if cohort.state<>'active' then raise exception 'cohort_archived' using errcode='23514';end if;target:=(p_data->>'user_id')::uuid;
    if p_action='member.add' then
     if not exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=target and status='active') then raise exception 'active_institution_member_required' using errcode='23514';end if;
     insert into public.assessment_cohort_members(tenant_id,cohort_id,user_id,extra_seconds,updated_by) values(p_tenant,cohort.id,target,(p_data->>'extra_seconds')::integer,p_actor) on conflict(cohort_id,user_id) do update set active=true,extra_seconds=excluded.extra_seconds,updated_by=p_actor,updated_at=clock_timestamp();
    else update public.assessment_cohort_members set active=false,updated_by=p_actor,updated_at=clock_timestamp() where tenant_id=p_tenant and cohort_id=cohort.id and user_id=target and active;if not found then raise exception 'cohort_member_not_found' using errcode='P0002';end if;end if;
    update public.assessment_cohorts set revision=revision+1 where id=cohort.id;
   end if;rid:=cohort.id;result:=jsonb_build_object('id',rid,'revision',cohort.revision+1);
  end if;
 end if;
 insert into public.assessment_cohort_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'cohorts.'||p_action,rid,jsonb_build_object('user_id',target,'reason',p_data->>'reason','result',result));
 return result;
end; $$;
create function public.assessment_roster_claim(p_limit integer default 20) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.assessment_roster_jobs;token uuid;result jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_page_limit' using errcode='22023';end if;
 for job in select * from public.assessment_roster_jobs where state in('queued','running') and (leased_until is null or leased_until<clock_timestamp()) order by created_at,id for update skip locked limit p_limit loop
  token:=gen_random_uuid();update public.assessment_roster_jobs set state='running',revision=revision+1,lease_token=token,leased_until=clock_timestamp()+interval '2 minutes' where id=job.id;
  result:=result||jsonb_build_array(jsonb_build_object('schema_version','assessment.roster.job.v1','tenant_id',job.tenant_id,'job_id',job.id,'lease_token',token));
 end loop;return result;
end; $$;
create function public.assessment_roster_step(p_tenant uuid,p_job uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.assessment_roster_jobs;target public.assessment_roster_targets;registration public.assessment_registrations;result jsonb;target_outcome text;blocked text;remaining integer;issues boolean;
begin
 -- Staff mutation shares this lock; queue delivery can never adopt its own authority.
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));
 select * into job from public.assessment_roster_jobs where tenant_id=p_tenant and id=p_job for update;if not found then raise exception 'roster_job_not_found' using errcode='P0002';end if;
 if job.state in('completed','completed_with_issues','cancelled','blocked') then return jsonb_build_object('id',job.id,'state',job.state,'processed',job.processed,'total',job.total);end if;
 if job.lease_token is distinct from p_lease or job.leased_until<=clock_timestamp() then raise exception 'invalid_roster_lease' using errcode='23505';end if;
 perform 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=job.authorized_by for share;
 perform 1 from public.assessment_exam_windows where tenant_id=p_tenant and id=job.window_id for share;
 perform 1 from public.assessment_cohorts where tenant_id=p_tenant and id=job.cohort_id for share;
 if not public.assessment_has_capability(p_tenant,job.authorized_by,'exams.manage') then blocked:='authority_lost';
 elsif not exists(select 1 from public.assessment_cohorts where id=job.cohort_id and state='active') then blocked:='cohort_archived';
 elsif job.window_snapshot is distinct from public.assessment_cohort_window(p_tenant,job.window_id) then blocked:='sitting_changed';
 elsif (job.window_snapshot->>'closes_at')::timestamptz<=clock_timestamp() then blocked:='sitting_closed';end if;
 if blocked is not null then
  update public.assessment_roster_jobs set state='blocked',revision=revision+1,lease_token=null,leased_until=null,blocked_reason=blocked where id=job.id;
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,job.authorized_by,'cohorts.job.blocked',job.id,jsonb_build_object('reason',blocked,'processed',job.processed));
  return jsonb_build_object('id',job.id,'state','blocked','processed',job.processed,'total',job.total,'reason',blocked);
 end if;
 for target in select * from public.assessment_roster_targets where job_id=job.id and outcome='pending' order by user_id limit 50 for update loop
  registration:=null;
  perform 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=target.user_id for share;
  if not target.eligible_at_review or not exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=target.user_id and status='active') then target_outcome:='inactive';
  elsif not exists(select 1 from public.assessment_cohort_members where cohort_id=job.cohort_id and user_id=target.user_id and active and extra_seconds=target.extra_seconds) then target_outcome:='removed';
  else
   -- Across jobs and direct registration: one sitting/candidate outcome, no overwrite.
   perform pg_advisory_xact_lock(hashtextextended(job.window_id::text||target.user_id::text||'roster.registration',0));
   select * into registration from public.assessment_registrations where window_id=job.window_id and candidate_id=target.user_id;
   if registration.id is null then
    begin
     result:=public.assessment_command(job.authorized_by,p_tenant,'roster:'||job.id||':'||target.user_id,'registration.create',jsonb_build_object('window_id',job.window_id,'candidate_id',target.user_id,'extra_seconds',target.extra_seconds));
     select * into registration from public.assessment_registrations where id=(result->>'id')::uuid;target_outcome:='created';
    exception when unique_violation then
     select * into registration from public.assessment_registrations where window_id=job.window_id and candidate_id=target.user_id;
     if registration.id is null then raise;end if;target_outcome:=case when registration.extra_seconds=target.extra_seconds then 'existing' else 'conflict' end;
    end;
   else target_outcome:=case when registration.extra_seconds=target.extra_seconds then 'existing' else 'conflict' end;end if;
  end if;
  update public.assessment_roster_targets set outcome=target_outcome,registration_id=registration.id,processed_at=clock_timestamp() where job_id=job.id and user_id=target.user_id;
 end loop;
 select count(*) into remaining from public.assessment_roster_targets where job_id=job.id and outcome='pending';
 issues:=exists(select 1 from public.assessment_roster_targets where job_id=job.id and outcome in('conflict','inactive','removed'));
 target_outcome:=case when remaining>0 then 'queued' when issues then 'completed_with_issues' else 'completed' end;
 update public.assessment_roster_jobs set state=target_outcome,revision=revision+1,processed=total-remaining,lease_token=null,leased_until=null,finished_at=case when remaining=0 then clock_timestamp() else null end where id=job.id;
 if remaining=0 then insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,job.authorized_by,'cohorts.job.finished',job.id,jsonb_build_object('state',target_outcome,'total',job.total));end if;
 return jsonb_build_object('id',job.id,'state',target_outcome,'processed',job.total-remaining,'total',job.total);
end; $$;
create function public.assessment_cohort_read(p_actor uuid,p_tenant uuid,p_kind text,p_id uuid default null,p_window uuid default null,p_after uuid default null,p_limit integer default 50,p_query text default '') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cohort public.assessment_cohorts;job public.assessment_roster_jobs;plan jsonb;result jsonb;
begin
 if not public.assessment_has_capability(p_tenant,p_actor,'exams.manage') then raise exception 'forbidden' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 100 or length(coalesce(p_query,''))>200 then raise exception 'invalid_page_limit' using errcode='22023';end if;
 if p_kind='directory' then return(select coalesce(jsonb_agg(value order by id),'[]'::jsonb) from(select u.id,jsonb_build_object('id',u.id,'name',coalesce(nullif(left(coalesce(to_jsonb(u)->>'full_name',to_jsonb(u)->>'display_name',to_jsonb(u)->>'name',to_jsonb(u)->>'username'),200),''),'Member '||left(u.id::text,8))) value from public.users u where exists(select 1 from public.tenant_memberships m where m.tenant_id=p_tenant and m.user_id=u.id and m.status='active') and (p_after is null or u.id>p_after) and (p_query='' or position(lower(p_query) in lower(coalesce(to_jsonb(u)->>'full_name',to_jsonb(u)->>'display_name',to_jsonb(u)->>'name',to_jsonb(u)->>'username','')||' '||u.id::text))>0) order by u.id limit p_limit)visible);end if;
 if p_kind='cohorts' then return(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('member_count',(select count(*) from public.assessment_cohort_members m where m.cohort_id=c.id and active)) order by c.id),'[]'::jsonb) from(select * from public.assessment_cohorts where tenant_id=p_tenant and (p_after is null or id>p_after) order by id limit p_limit)c);end if;
 if p_kind='sittings' then return(select coalesce(jsonb_agg(public.assessment_cohort_window(p_tenant,w.id) order by w.id),'[]'::jsonb) from(select * from public.assessment_exam_windows where tenant_id=p_tenant and (p_after is null or id>p_after) order by id limit p_limit)w);end if;
 if p_kind='preview' then
  plan:=public.assessment_cohort_plan(p_tenant,p_id,p_window);
  return (plan-'members')||jsonb_build_object('total',jsonb_array_length(plan->'members'),'eligible',(select count(*) from jsonb_array_elements(plan->'members') where (value->>'eligible')::boolean),'existing',(select count(*) from jsonb_array_elements(plan->'members') where value->>'registration_id' is not null),'conflicts',(select count(*) from jsonb_array_elements(plan->'members') where value->>'registration_id' is not null and value->>'extra_seconds'<>value->>'registered_extra_seconds'),'members',(select coalesce(jsonb_agg(value order by value->>'user_id'),'[]'::jsonb) from(select value from jsonb_array_elements(plan->'members') where p_after is null or (value->>'user_id')::uuid>p_after order by value->>'user_id' limit p_limit)page));
 end if;
 if p_kind='cohort' then
  select * into cohort from public.assessment_cohorts where tenant_id=p_tenant and id=p_id;if not found then raise exception 'cohort_not_found' using errcode='P0002';end if;
  return to_jsonb(cohort)||jsonb_build_object('members',(select coalesce(jsonb_agg(value order by user_id),'[]'::jsonb) from(select m.user_id,jsonb_build_object('id',m.user_id,'extra_seconds',m.extra_seconds,'name',coalesce(to_jsonb(u)->>'full_name',to_jsonb(u)->>'display_name',to_jsonb(u)->>'name','Member '||left(m.user_id::text,8))) value from public.assessment_cohort_members m join public.users u on u.id=m.user_id where m.cohort_id=cohort.id and m.active and (p_after is null or m.user_id>p_after) order by m.user_id limit p_limit)page));
 end if;
 if p_kind='jobs' then return(select coalesce(jsonb_agg(to_jsonb(j)-array['lease_token','leased_until'] order by j.id),'[]'::jsonb) from(select * from public.assessment_roster_jobs where tenant_id=p_tenant and (p_after is null or id>p_after) order by id limit p_limit)j);end if;
 if p_kind='job' then
  select * into job from public.assessment_roster_jobs where tenant_id=p_tenant and id=p_id;if not found then raise exception 'roster_job_not_found' using errcode='P0002';end if;
  return (to_jsonb(job)-array['lease_token','leased_until'])||jsonb_build_object('summary',(select coalesce(jsonb_object_agg(outcome,count),'{}'::jsonb) from(select outcome,count(*) from public.assessment_roster_targets where job_id=job.id group by outcome)s),'targets',(select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id),'[]'::jsonb) from(select user_id,name,extra_seconds,outcome,registration_id,processed_at from public.assessment_roster_targets where job_id=job.id and (p_after is null or user_id>p_after) order by user_id limit p_limit)t));
 end if;raise exception 'unknown_cohort_resource' using errcode='22023';
end; $$;
do $$ declare tab text;begin foreach tab in array array['assessment_cohorts','assessment_cohort_members','assessment_cohort_commands','assessment_roster_jobs','assessment_roster_targets'] loop execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated',tab);execute format('grant all on public.%I to service_role',tab);end loop;end; $$;
revoke all on function public.assessment_roster_guard(),public.assessment_cohort_plan(uuid,uuid,uuid),public.assessment_cohort_window(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.assessment_cohort_command(uuid,uuid,text,text,jsonb),public.assessment_cohort_read(uuid,uuid,text,uuid,uuid,uuid,integer,text),public.assessment_roster_claim(integer),public.assessment_roster_step(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assessment_cohort_command(uuid,uuid,text,text,jsonb),public.assessment_cohort_read(uuid,uuid,text,uuid,uuid,uuid,integer,text),public.assessment_roster_claim(integer),public.assessment_roster_step(uuid,uuid,uuid) to service_role;
commit;
