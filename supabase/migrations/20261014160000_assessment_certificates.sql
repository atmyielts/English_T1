begin;
create function public.assessment_staff_capabilities() returns text[] language sql immutable as $$
 select array['banks.read','items.write','items.approve','assessments.publish','exams.manage','grades.mark','grades.moderate','results.read','results.release','audit.read','team.manage','certificates.manage'];
$$;
revoke all on function public.assessment_staff_capabilities() from public,anon,authenticated;
grant execute on function public.assessment_staff_capabilities() to service_role;
alter table public.assessment_capability_grants drop constraint assessment_capability_grants_capability_check;
alter table public.assessment_capability_grants add constraint assessment_capability_grants_capability_check check(capability in('banks.read','items.write','items.approve','assessments.publish','exams.manage','grades.manage','grades.mark','grades.moderate','results.read','results.release','audit.read','team.manage','certificates.manage','proctor.manage','proctor.observe','proctor.review'));
alter table public.assessment_staff_role_versions drop constraint assessment_staff_role_versions_capabilities_check;
alter table public.assessment_staff_role_versions add constraint assessment_staff_role_versions_capabilities_check check(cardinality(capabilities) between 1 and 12 and capabilities<@public.assessment_staff_capabilities());
create or replace function public.assessment_has_capability(p_tenant uuid,p_user uuid,p_capability text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_capability=any(public.assessment_staff_capabilities()||array['grades.manage','proctor.manage','proctor.observe','proctor.review']) and exists(select 1 from public.tenant_memberships m where m.tenant_id=p_tenant and m.user_id=p_user and m.status='active' and (m.role in('owner','admin') or exists(select 1 from public.assessment_capability_grants g where g.tenant_id=p_tenant and g.user_id=p_user and g.capability=p_capability and g.revoked_at is null and (g.expires_at is null or g.expires_at>clock_timestamp())) or exists(select 1 from public.assessment_staff_role_assignments a join public.assessment_staff_role_versions v on v.id=a.role_version_id where a.tenant_id=p_tenant and a.user_id=p_user and a.revoked_at is null and (a.expires_at is null or a.expires_at>clock_timestamp()) and p_capability=any(v.capabilities))));
$$;
-- Preserve the entire existing delegated-authority/revision/replay implementation.
-- Replace only its two fixed registries with the explicit shared catalogue above;
-- fail migration on source drift instead of silently weakening a permission guard.
do $migration$ declare source text;old_catalog text:='array[''banks.read'',''items.write'',''items.approve'',''assessments.publish'',''exams.manage'',''grades.mark'',''grades.moderate'',''results.read'',''results.release'',''audit.read'',''team.manage'']';signature text;
begin
 foreach signature in array array['public.assessment_staff_command(uuid,uuid,text,text,jsonb)','public.assessment_staff_read(uuid,uuid,text,uuid,uuid,integer)'] loop
  source:=pg_get_functiondef(signature::regprocedure);
  if strpos(source,old_catalog)=0 then raise exception 'staff_registry_source_drift';end if;
  source:=replace(source,old_catalog,'public.assessment_staff_capabilities()');
  if signature like '%_command(%' then
   if strpos(source,'cardinality(caps) not between 1 and 11')=0 then raise exception 'staff_registry_limit_drift';end if;
   source:=replace(source,'cardinality(caps) not between 1 and 11','cardinality(caps) not between 1 and cardinality(public.assessment_staff_capabilities())');
  end if;execute source;
 end loop;
end; $migration$;
create or replace function public.assessment_grading_read(p_actor uuid,p_tenant uuid,p_kind text,p_id uuid default null,p_after uuid default null,p_limit integer default 100) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if p_kind='access' then return public.assessment_grading_read_v1(p_actor,p_tenant,p_kind,p_id,p_after,p_limit)||jsonb_build_object('can_manage_team',public.assessment_has_capability(p_tenant,p_actor,'team.manage'),'can_manage_certificates',public.assessment_has_capability(p_tenant,p_actor,'certificates.manage'));end if;
 return public.assessment_grading_read_v1(p_actor,p_tenant,p_kind,p_id,p_after,p_limit);
end; $$;

create table public.assessment_certificate_programs(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),title text not null check(length(btrim(title)) between 1 and 200),description text not null check(length(btrim(description)) between 1 and 2000),
 minimum_percent numeric(9,6) not null check(minimum_percent between 0 and 100),valid_days integer check(valid_days between 1 and 36500),
 created_by uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp(),approved_by uuid references public.users(id),approved_at timestamptz,
 unique(tenant_id,id),check((approved_by is null)=(approved_at is null)),check(approved_by is distinct from created_by)
);
create table public.assessment_certificates(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,program_id uuid not null,attempt_id uuid not null,run_id uuid not null,score_revision_id uuid not null references public.assessment_score_revisions(id),candidate_id uuid not null references public.users(id),
 state text not null default 'pending' check(state in('pending','issued','revoked','cancelled')),revision integer not null default 1,
 key_id text not null check(key_id ~ '^[a-zA-Z0-9_-]{1,64}$'),payload_text text not null check(octet_length(payload_text)<=20000),payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),signature text check(signature ~ '^[a-zA-Z0-9_-]{86}$'),
 prepared_by uuid not null references public.users(id),prepared_at timestamptz not null default clock_timestamp(),sealed_at timestamptz,expires_at timestamptz,
 revoked_at timestamptz,revoked_by uuid references public.users(id),reason text,
 unique(tenant_id,id),unique(tenant_id,program_id,score_revision_id),foreign key(tenant_id,program_id) references public.assessment_certificate_programs(tenant_id,id),foreign key(tenant_id,attempt_id) references public.assessment_attempts(tenant_id,id),foreign key(tenant_id,run_id) references public.assessment_grading_runs(tenant_id,id),
 check((state in('issued','revoked'))=(signature is not null)),check((state in('issued','revoked'))=(sealed_at is not null)),
 check((state in('revoked','cancelled'))=(revoked_at is not null)),check((state in('revoked','cancelled'))=(revoked_by is not null)),check((state in('revoked','cancelled'))=(reason is not null)),check(reason is null or length(btrim(reason)) between 1 and 5000),check(revision between 1 and 3)
);
create index assessment_certificates_candidate on public.assessment_certificates(tenant_id,candidate_id,id);
create table public.assessment_certificate_commands(tenant_id uuid not null references public.tenants(id),actor_id uuid not null references public.users(id),idempotency_key text not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key));
create trigger immutable_record before update or delete on public.assessment_certificate_commands for each row execute function public.assessment_immutable();
create function public.assessment_certificate_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'immutable_certificate' using errcode='23514';end if;
 if tg_table_name='assessment_certificate_programs' then
  if old.approved_by is not null or new.approved_by is null or new.approved_at is null or (to_jsonb(new)-array['approved_by','approved_at']) is distinct from (to_jsonb(old)-array['approved_by','approved_at']) then raise exception 'immutable_certificate_program' using errcode='23514';end if;
 else
  if not ((old.state='pending' and new.state in('issued','cancelled')) or (old.state='issued' and new.state='revoked')) or new.revision<>old.revision+1 or (to_jsonb(new)-array['state','revision','signature','sealed_at','revoked_at','revoked_by','reason']) is distinct from (to_jsonb(old)-array['state','revision','signature','sealed_at','revoked_at','revoked_by','reason'])
   or (old.state='issued' and (new.signature,new.sealed_at) is distinct from (old.signature,old.sealed_at)) then raise exception 'immutable_certificate' using errcode='23514';end if;
 end if;return new;
end; $$;
create trigger certificate_guard before update or delete on public.assessment_certificates for each row execute function public.assessment_certificate_guard();
create trigger certificate_program_guard before update or delete on public.assessment_certificate_programs for each row execute function public.assessment_certificate_guard();
create function public.assessment_certificate_program_hash(p_id uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$
 select encode(sha256(convert_to((to_jsonb(p)-array['approved_by','approved_at'])::text,'UTF8')),'hex') from public.assessment_certificate_programs p where id=p_id;
$$;
create function public.assessment_certificate_current(p_id uuid) returns boolean language sql volatile security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.assessment_certificates c join public.assessment_grading_releases l on l.run_id=c.run_id join public.assessment_grading_runs r on r.id=l.run_id
 where c.id=p_id and l.release_at<=clock_timestamp() and not exists(select 1 from public.assessment_grading_releases newer join public.assessment_grading_runs n on n.id=newer.run_id where n.attempt_id=c.attempt_id and n.generation>r.generation and newer.release_at<=clock_timestamp()));
$$;
create function public.assessment_certificate_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_certificate_commands;request jsonb;result jsonb;program public.assessment_certificate_programs;certificate public.assessment_certificates;run public.assessment_grading_runs;attempt public.assessment_attempts;
 rid uuid;total numeric;maximum numeric;recipient text;issuer text;exam_title text;claims jsonb;payload text;issued timestamptz:=clock_timestamp();expiry timestamptz;
begin
 if p_key is null or length(p_key) not between 8 and 200 or p_data is null or jsonb_typeof(p_data)<>'object' or p_action is null or p_action not in('program.create','program.approve','certificate.prepare','certificate.revoke','certificate.cancel') then raise exception 'invalid_certificate_command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));
 if not public.assessment_has_capability(p_tenant,p_actor,'certificates.manage') then raise exception 'forbidden' using errcode='42501';end if;
 request:=jsonb_build_object('action',p_action,'data',case when p_action='certificate.prepare' then p_data-'key_id' else p_data end);perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'certificates'||p_key,0));
 select * into prior from public.assessment_certificate_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='program.create' then
  insert into public.assessment_certificate_programs(tenant_id,title,description,minimum_percent,valid_days,created_by) values(p_tenant,btrim(p_data->>'title'),btrim(p_data->>'description'),(p_data->>'minimum_percent')::numeric,(p_data->>'valid_days')::integer,p_actor) returning id into rid;result:=jsonb_build_object('id',rid);
 elsif p_action='program.approve' then
  select * into program from public.assessment_certificate_programs where tenant_id=p_tenant and id=(p_data->>'id')::uuid for update;if not found then raise exception 'certificate_program_not_found' using errcode='P0002';end if;
  if program.created_by=p_actor then raise exception 'independent_certificate_approver_required' using errcode='42501';end if;
  if program.approved_by is not null or p_data->>'review_hash' is distinct from public.assessment_certificate_program_hash(program.id) then raise exception 'certificate_program_review_required' using errcode='23505';end if;
  update public.assessment_certificate_programs set approved_by=p_actor,approved_at=clock_timestamp() where id=program.id;rid:=program.id;result:=jsonb_build_object('id',rid);
 elsif p_action='certificate.prepare' then
  select * into attempt from public.assessment_attempts where tenant_id=p_tenant and id=(p_data->>'attempt_id')::uuid for update;if not found then raise exception 'certificate_result_not_found' using errcode='P0002';end if;
  if attempt.candidate_id=p_actor then raise exception 'candidate_certificate_self_issue' using errcode='42501';end if;
  select * into program from public.assessment_certificate_programs where tenant_id=p_tenant and id=(p_data->>'program_id')::uuid and approved_by is not null;if not found then raise exception 'approved_certificate_program_required' using errcode='23514';end if;
  select r.* into run from public.assessment_grading_runs r join public.assessment_grading_releases l on l.run_id=r.id where r.tenant_id=p_tenant and r.attempt_id=attempt.id and l.release_at<=clock_timestamp() order by r.generation desc limit 1;
  if run.id is null or run.score_revision_id is distinct from (p_data->>'score_revision_id')::uuid then raise exception 'latest_released_result_required' using errcode='23514';end if;
  if exists(select 1 from public.assessment_result_appeals where attempt_id=attempt.id and (status='submitted' or status='regrade_requested' and requested_generation>run.generation)) or exists(select 1 from public.assessment_grading_jobs where attempt_id=attempt.id and state<>'committed') then raise exception 'certificate_review_pending' using errcode='23514';end if;
  select sum((s->>'score')::numeric),sum((s->>'max_score')::numeric) into total,maximum from public.assessment_score_revisions v,jsonb_array_elements(v.scores)s where v.id=run.score_revision_id;
  if maximum is null or maximum<=0 or total is null or total*100<program.minimum_percent*maximum then raise exception 'certificate_threshold_not_met' using errcode='23514';end if;
  select left(coalesce(nullif(btrim(to_jsonb(u)->>'full_name'),''),nullif(btrim(to_jsonb(u)->>'display_name'),''),nullif(btrim(to_jsonb(u)->>'name'),'')),200) into recipient from public.users u where u.id=attempt.candidate_id;
  select left(coalesce(nullif(btrim(to_jsonb(t)->>'name'),''),nullif(btrim(to_jsonb(t)->>'title'),'')),200) into issuer from public.tenants t where t.id=p_tenant;
  if recipient is null or issuer is null then raise exception 'certificate_identity_profile_required' using errcode='23514';end if;
  select w.title into exam_title from public.assessment_registrations g join public.assessment_exam_windows w on w.id=g.window_id where g.id=attempt.registration_id;
  rid:=gen_random_uuid();expiry:=case when program.valid_days is null then null else issued+make_interval(days=>program.valid_days) end;
  claims:=jsonb_build_object('schema_version','schood.certificate.v1','certificate_id',rid,'program_id',program.id,'issuer',issuer,'recipient',recipient,'achievement',program.title,'criteria',program.description,'minimum_percent',program.minimum_percent,'exam',exam_title,'grading_generation',run.generation,'score_revision_id',run.score_revision_id,'score',total,'maximum_score',maximum,'issued_at',issued,'expires_at',expiry);
  payload:=claims::text;
  insert into public.assessment_certificates(id,tenant_id,program_id,attempt_id,run_id,score_revision_id,candidate_id,key_id,payload_text,payload_hash,prepared_by,prepared_at,expires_at) values(rid,p_tenant,program.id,attempt.id,run.id,run.score_revision_id,attempt.candidate_id,p_data->>'key_id',payload,encode(sha256(convert_to(payload,'UTF8')),'hex'),p_actor,issued,expiry);
  result:=jsonb_build_object('id',rid);
 else
  select * into certificate from public.assessment_certificates where tenant_id=p_tenant and id=(p_data->>'id')::uuid for update;if not found then raise exception 'certificate_not_found' using errcode='P0002';end if;
  if certificate.state<>(case when p_action='certificate.cancel' then 'pending' else 'issued' end) or certificate.revision::text is distinct from p_data->>'expected_revision' then raise exception 'certificate_revision_conflict' using errcode='23505';end if;
  if coalesce(length(btrim(p_data->>'reason')),0) not between 1 and 5000 then raise exception 'certificate_reason_required' using errcode='22023';end if;
  update public.assessment_certificates set state=case when p_action='certificate.cancel' then 'cancelled' else 'revoked' end,revision=revision+1,revoked_by=p_actor,revoked_at=clock_timestamp(),reason=btrim(p_data->>'reason') where id=certificate.id;
  rid:=certificate.id;result:=jsonb_build_object('id',rid);
 end if;
 insert into public.assessment_certificate_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'certificates.'||p_action,rid,jsonb_build_object('score_revision_id',run.score_revision_id,'reason',p_data->>'reason'));
 return result;
end; $$;
create function public.assessment_certificate_seal(p_actor uuid,p_tenant uuid,p_id uuid,p_key_id text,p_payload_hash text,p_signature text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare certificate public.assessment_certificates;
begin
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));
 if not public.assessment_has_capability(p_tenant,p_actor,'certificates.manage') then raise exception 'forbidden' using errcode='42501';end if;
 select * into certificate from public.assessment_certificates where tenant_id=p_tenant and id=p_id for update;if not found then raise exception 'certificate_not_found' using errcode='P0002';end if;
 if certificate.prepared_by<>p_actor then raise exception 'certificate_issuer_required' using errcode='42501';end if;
 if certificate.key_id<>p_key_id or certificate.payload_hash<>p_payload_hash or p_signature is null or p_signature!~'^[a-zA-Z0-9_-]{86}$' then raise exception 'certificate_signature_conflict' using errcode='23505';end if;
 if certificate.state in('issued','revoked') then if certificate.signature<>p_signature then raise exception 'certificate_signature_conflict' using errcode='23505';end if;return jsonb_build_object('id',certificate.id,'state',certificate.state);end if;
 if certificate.state<>'pending' then raise exception 'certificate_revision_conflict' using errcode='23505';end if;
 if not public.assessment_certificate_current(certificate.id) or certificate.expires_at<=clock_timestamp() then raise exception 'latest_released_result_required' using errcode='23514';end if;
 if exists(select 1 from public.assessment_result_appeals a join public.assessment_grading_runs r on r.id=certificate.run_id where a.attempt_id=certificate.attempt_id and (a.status='submitted' or a.status='regrade_requested' and a.requested_generation>r.generation)) or exists(select 1 from public.assessment_grading_jobs where attempt_id=certificate.attempt_id and state<>'committed') then raise exception 'certificate_review_pending' using errcode='23514';end if;
 update public.assessment_certificates set state='issued',revision=revision+1,signature=p_signature,sealed_at=clock_timestamp() where id=p_id;
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'certificates.issued',p_id,jsonb_build_object('payload_hash',p_payload_hash,'key_id',p_key_id));
 insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key) values('assessment.certificate.issued','v1','assessment_certificate',p_id,certificate.candidate_id,jsonb_build_object('certificate_id',p_id),'assessment.certificate.issued:'||p_id);
 return jsonb_build_object('id',p_id,'state','issued');
end; $$;
create function public.assessment_certificate_read(p_actor uuid,p_tenant uuid,p_kind text,p_id uuid default null,p_after uuid default null,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare manager boolean;certificate public.assessment_certificates;result jsonb;
begin
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_page_limit' using errcode='22023';end if;
 manager:=public.assessment_has_capability(p_tenant,p_actor,'certificates.manage');
 if p_kind='access' then return jsonb_build_object('can_manage',manager);end if;
 if p_kind in('programs','results','institution','signing') and not manager then raise exception 'forbidden' using errcode='42501';end if;
 if p_kind='programs' then return (select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('review_hash',public.assessment_certificate_program_hash(p.id)) order by p.id),'[]'::jsonb) from(select * from public.assessment_certificate_programs where tenant_id=p_tenant and (p_after is null or id>p_after) order by id limit p_limit)p);end if;
 if p_kind='results' then return (select coalesce(jsonb_agg(value order by id),'[]'::jsonb) from(select r.id,jsonb_build_object('id',r.id,'attempt_id',r.attempt_id,'score_revision_id',r.score_revision_id,'generation',r.generation,'candidate',coalesce(to_jsonb(u)->>'full_name',to_jsonb(u)->>'display_name',to_jsonb(u)->>'name','Candidate account'),'exam',w.title) value from public.assessment_grading_runs r join public.assessment_grading_releases l on l.run_id=r.id join public.assessment_attempts a on a.id=r.attempt_id join public.users u on u.id=a.candidate_id join public.assessment_registrations g on g.id=a.registration_id join public.assessment_exam_windows w on w.id=g.window_id
 where r.tenant_id=p_tenant and a.candidate_id<>p_actor and l.release_at<=clock_timestamp() and not exists(select 1 from public.assessment_grading_runs newer join public.assessment_grading_releases nl on nl.run_id=newer.id where newer.attempt_id=r.attempt_id and newer.generation>r.generation and nl.release_at<=clock_timestamp()) and (p_after is null or r.id>p_after) order by r.id limit p_limit)visible);end if;
 if p_kind in('institution','candidate') then return(select coalesce(jsonb_agg(value order by id),'[]'::jsonb) from(select c.id,jsonb_build_object('id',c.id,'state',c.state,'revision',c.revision,'claims',c.payload_text::jsonb,'current_result',public.assessment_certificate_current(c.id)) value from public.assessment_certificates c where c.tenant_id=p_tenant and (case when p_kind='candidate' then c.candidate_id=p_actor and c.state in('issued','revoked') else true end) and (p_after is null or c.id>p_after) order by c.id limit p_limit)visible);end if;
 select * into certificate from public.assessment_certificates where tenant_id=p_tenant and id=p_id;if not found then raise exception 'certificate_not_found' using errcode='P0002';end if;
 if p_kind='signing' then if certificate.prepared_by<>p_actor then raise exception 'certificate_issuer_required' using errcode='42501';end if;return jsonb_build_object('id',certificate.id,'key_id',certificate.key_id,'payload_text',certificate.payload_text,'payload_hash',certificate.payload_hash,'signature',certificate.signature);end if;
 if p_kind<>'download' then raise exception 'unknown_certificate_resource' using errcode='22023';end if;
 if not manager and certificate.candidate_id<>p_actor then raise exception 'forbidden' using errcode='42501';end if;
 if certificate.state not in('issued','revoked') then raise exception 'certificate_not_issued' using errcode='23514';end if;
 return jsonb_build_object('id',certificate.id,'key_id',certificate.key_id,'payload_text',certificate.payload_text,'payload_hash',certificate.payload_hash,'signature',certificate.signature);
end; $$;
create function public.assessment_certificate_status(p_id uuid,p_key_id text,p_payload_hash text,p_signature text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare certificate public.assessment_certificates;
begin
 select * into certificate from public.assessment_certificates where id=p_id and key_id=p_key_id and payload_hash=p_payload_hash and signature=p_signature;
 if not found or certificate.state not in('issued','revoked') then return jsonb_build_object('status','not_found');end if;
 return jsonb_build_object('status',case when certificate.state='revoked' then 'revoked' when certificate.expires_at<=clock_timestamp() then 'expired' when not public.assessment_certificate_current(certificate.id) then 'superseded'
  when exists(select 1 from public.assessment_result_appeals a join public.assessment_grading_runs r on r.id=certificate.run_id where a.attempt_id=certificate.attempt_id and (a.status='submitted' or a.status='regrade_requested' and a.requested_generation>r.generation)) or exists(select 1 from public.assessment_grading_jobs where attempt_id=certificate.attempt_id and state<>'committed') then 'under_review' else 'valid' end,'checked_at',clock_timestamp());
end; $$;
do $$ declare tab text;begin foreach tab in array array['assessment_certificate_programs','assessment_certificates','assessment_certificate_commands'] loop execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated',tab);execute format('grant all on public.%I to service_role',tab);end loop;end; $$;
revoke all on function public.assessment_certificate_guard(),public.assessment_certificate_program_hash(uuid),public.assessment_certificate_current(uuid) from public,anon,authenticated,service_role;
revoke all on function public.assessment_certificate_command(uuid,uuid,text,text,jsonb),public.assessment_certificate_seal(uuid,uuid,uuid,text,text,text),public.assessment_certificate_read(uuid,uuid,text,uuid,uuid,integer),public.assessment_certificate_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.assessment_certificate_command(uuid,uuid,text,text,jsonb),public.assessment_certificate_seal(uuid,uuid,uuid,text,text,text),public.assessment_certificate_read(uuid,uuid,text,uuid,uuid,integer),public.assessment_certificate_status(uuid,text,text,text) to service_role;
commit;
