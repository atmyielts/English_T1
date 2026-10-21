begin;

create table public.assessment_certificate_program_retirements (
 program_id uuid primary key, tenant_id uuid not null, retired_by uuid not null references public.users(id),
 retired_at timestamptz not null default clock_timestamp(), review_hash text not null check(review_hash ~ '^[a-f0-9]{64}$'),
 reason text not null check(length(btrim(reason)) between 1 and 5000),
 foreign key(tenant_id,program_id) references public.assessment_certificate_programs(tenant_id,id)
);
create trigger immutable_retirement before update or delete on public.assessment_certificate_program_retirements for each row execute function public.assessment_immutable();
alter table public.assessment_certificate_program_retirements enable row level security;
revoke all on public.assessment_certificate_program_retirements from public,anon,authenticated,service_role;

alter table public.assessment_certificates add column replaces_certificate_id uuid;
alter table public.assessment_certificates add foreign key(tenant_id,replaces_certificate_id) references public.assessment_certificates(tenant_id,id);
alter table public.assessment_certificates add check(replaces_certificate_id is distinct from id);
-- Retain one ordinary award per result/program. Explicit reviewed replacements
-- may share that pair, but a predecessor has at most one live successor intent.
do $$ declare constraint_name text;begin
 select conname into constraint_name from pg_constraint where conrelid='public.assessment_certificates'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (tenant_id, program_id, score_revision_id)';
 if constraint_name is null then raise exception 'certificate_uniqueness_source_drift';end if;
 execute format('alter table public.assessment_certificates drop constraint %I',constraint_name);
end;$$;
create unique index assessment_certificate_root_result on public.assessment_certificates(tenant_id,program_id,score_revision_id) where replaces_certificate_id is null;
create unique index assessment_certificate_one_successor on public.assessment_certificates(replaces_certificate_id) where replaces_certificate_id is not null and state<>'cancelled';
create table public.assessment_certificate_replacement_preparations (
 certificate_id uuid primary key, tenant_id uuid not null, predecessor_id uuid not null,
 predecessor_revision integer not null check(predecessor_revision between 1 and 3),
 predecessor_payload_hash text not null check(predecessor_payload_hash ~ '^[a-f0-9]{64}$'),
 reason text not null check(length(btrim(reason)) between 1 and 5000), prepared_by uuid not null references public.users(id), prepared_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,certificate_id) references public.assessment_certificates(tenant_id,id),
 foreign key(tenant_id,predecessor_id) references public.assessment_certificates(tenant_id,id)
);
create trigger immutable_replacement_preparation before update or delete on public.assessment_certificate_replacement_preparations for each row execute function public.assessment_immutable();
alter table public.assessment_certificate_replacement_preparations enable row level security;
revoke all on public.assessment_certificate_replacement_preparations from public,anon,authenticated,service_role;

alter function public.assessment_certificate_command(uuid,uuid,text,text,jsonb) rename to assessment_certificate_command_v33;
create function public.assessment_certificate_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_certificate_commands;request jsonb;result jsonb;program public.assessment_certificate_programs;predecessor public.assessment_certificates;run public.assessment_grading_runs;attempt public.assessment_attempts;
 rid uuid;total numeric;maximum numeric;recipient text;issuer text;exam_title text;claims jsonb;payload text;issued timestamptz:=clock_timestamp();expiry timestamptz;
begin
 if p_key is null or length(p_key) not between 8 and 200 or p_data is null or jsonb_typeof(p_data)<>'object' or p_action is null or p_action not in('program.create','program.approve','program.retire','certificate.prepare','certificate.replace.prepare','certificate.revoke','certificate.cancel') then raise exception 'invalid_certificate_command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));
 if not public.assessment_has_capability(p_tenant,p_actor,'certificates.manage') then raise exception 'forbidden' using errcode='42501';end if;
 request:=jsonb_build_object('action',p_action,'data',case when p_action in('certificate.prepare','certificate.replace.prepare') then p_data-'key_id' else p_data end);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'certificates'||p_key,0));
 select * into prior from public.assessment_certificate_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action in('program.approve','program.retire','certificate.prepare','certificate.replace.prepare') then
  select * into program from public.assessment_certificate_programs where tenant_id=p_tenant and id=(case when p_action in('program.approve','program.retire') then p_data->>'id' else p_data->>'program_id' end)::uuid;
  if not found then raise exception 'certificate_program_not_found' using errcode='P0002';end if;
  if exists(select 1 from public.assessment_certificate_program_retirements where program_id=program.id) then raise exception 'certificate_program_retired' using errcode='23514';end if;
 end if;
 if p_action not in('program.retire','certificate.replace.prepare') then return public.assessment_certificate_command_v33(p_actor,p_tenant,p_key,p_action,p_data);end if;
 if p_action='program.retire' then
  if p_data->>'review_hash' is distinct from public.assessment_certificate_program_hash(program.id) then raise exception 'certificate_program_review_required' using errcode='23505';end if;
  if coalesce(length(btrim(p_data->>'reason')),0) not between 1 and 5000 then raise exception 'certificate_reason_required' using errcode='22023';end if;
  insert into public.assessment_certificate_program_retirements(program_id,tenant_id,retired_by,review_hash,reason) values(program.id,p_tenant,p_actor,p_data->>'review_hash',btrim(p_data->>'reason'));
  rid:=program.id;result:=jsonb_build_object('id',rid,'retired',true);
 else
  select * into predecessor from public.assessment_certificates where tenant_id=p_tenant and id=(p_data->>'id')::uuid for update;
  if not found then raise exception 'certificate_not_found' using errcode='P0002';end if;
  if predecessor.state<>'issued' or predecessor.revision::text is distinct from p_data->>'expected_revision' then raise exception 'certificate_revision_conflict' using errcode='23505';end if;
  if exists(select 1 from public.assessment_certificates where replaces_certificate_id=predecessor.id and state<>'cancelled') then raise exception 'certificate_replacement_exists' using errcode='23505';end if;
  if coalesce(length(btrim(p_data->>'reason')),0) not between 1 and 5000 then raise exception 'certificate_reason_required' using errcode='22023';end if;
  select * into attempt from public.assessment_attempts where tenant_id=p_tenant and id=(p_data->>'attempt_id')::uuid for update;
  if not found or attempt.id<>predecessor.attempt_id or attempt.candidate_id<>predecessor.candidate_id then raise exception 'certificate_replacement_subject_mismatch' using errcode='23514';end if;
  if attempt.candidate_id=p_actor then raise exception 'candidate_certificate_self_issue' using errcode='42501';end if;
  if program.approved_by is null then raise exception 'approved_certificate_program_required' using errcode='23514';end if;
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
  claims:=jsonb_build_object('schema_version','schood.certificate.v1','certificate_id',rid,'program_id',program.id,'issuer',issuer,'recipient',recipient,'achievement',program.title,'criteria',program.description,'minimum_percent',program.minimum_percent,'exam',exam_title,'grading_generation',run.generation,'score_revision_id',run.score_revision_id,'score',total,'maximum_score',maximum,'issued_at',issued,'expires_at',expiry,'replaces_certificate_id',predecessor.id);
  payload:=claims::text;
  insert into public.assessment_certificates(id,tenant_id,program_id,attempt_id,run_id,score_revision_id,candidate_id,key_id,payload_text,payload_hash,prepared_by,prepared_at,expires_at,replaces_certificate_id) values(rid,p_tenant,program.id,attempt.id,run.id,run.score_revision_id,attempt.candidate_id,p_data->>'key_id',payload,encode(sha256(convert_to(payload,'UTF8')),'hex'),p_actor,issued,expiry,predecessor.id);
  insert into public.assessment_certificate_replacement_preparations(certificate_id,tenant_id,predecessor_id,predecessor_revision,predecessor_payload_hash,reason,prepared_by) values(rid,p_tenant,predecessor.id,predecessor.revision,predecessor.payload_hash,btrim(p_data->>'reason'),p_actor);
  result:=jsonb_build_object('id',rid);
 end if;
 insert into public.assessment_certificate_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'certificates.'||p_action,rid,jsonb_build_object('predecessor_id',predecessor.id,'score_revision_id',run.score_revision_id,'reason',p_data->>'reason'));
 return result;
end;$$;

alter function public.assessment_certificate_seal(uuid,uuid,uuid,text,text,text) rename to assessment_certificate_seal_v33;
create function public.assessment_certificate_seal(p_actor uuid,p_tenant uuid,p_id uuid,p_key_id text,p_payload_hash text,p_signature text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare certificate public.assessment_certificates;predecessor public.assessment_certificates;intent public.assessment_certificate_replacement_preparations;result jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));
 if not public.assessment_has_capability(p_tenant,p_actor,'certificates.manage') then raise exception 'forbidden' using errcode='42501';end if;
 select * into certificate from public.assessment_certificates where tenant_id=p_tenant and id=p_id for update;
 if certificate.state='pending' then
  if exists(select 1 from public.assessment_certificate_program_retirements where program_id=certificate.program_id) then raise exception 'certificate_program_retired' using errcode='23514';end if;
  if certificate.replaces_certificate_id is not null then
   select * into intent from public.assessment_certificate_replacement_preparations where certificate_id=p_id;
   select * into predecessor from public.assessment_certificates where tenant_id=p_tenant and id=certificate.replaces_certificate_id for update;
   if intent.certificate_id is null or predecessor.id is null or predecessor.state<>'issued' or predecessor.revision<>intent.predecessor_revision or predecessor.payload_hash<>intent.predecessor_payload_hash or predecessor.attempt_id<>certificate.attempt_id or predecessor.candidate_id<>certificate.candidate_id or intent.predecessor_id<>predecessor.id or (certificate.payload_text::jsonb->>'replaces_certificate_id') is distinct from predecessor.id::text then raise exception 'certificate_replacement_predecessor_changed' using errcode='23505';end if;
  end if;
 end if;
 result:=public.assessment_certificate_seal_v33(p_actor,p_tenant,p_id,p_key_id,p_payload_hash,p_signature);
 if certificate.state='pending' and certificate.replaces_certificate_id is not null then
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'certificates.replaced',predecessor.id,jsonb_build_object('replacement_id',p_id,'predecessor_payload_hash',predecessor.payload_hash,'reason',intent.reason));
  insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key) values('assessment.certificate.replaced','v1','assessment_certificate',predecessor.id,certificate.candidate_id,jsonb_build_object('certificate_id',predecessor.id,'replacement_id',p_id),'assessment.certificate.replaced:'||predecessor.id);
 end if;
 return result;
end;$$;

alter function public.assessment_certificate_read(uuid,uuid,text,uuid,uuid,integer) rename to assessment_certificate_read_v33;
create function public.assessment_certificate_read(p_actor uuid,p_tenant uuid,p_kind text,p_id uuid default null,p_after uuid default null,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare value jsonb;begin
 value:=public.assessment_certificate_read_v33(p_actor,p_tenant,p_kind,p_id,p_after,p_limit);
 if p_kind='programs' then return(select coalesce(jsonb_agg(entry.value||jsonb_build_object('retirement',(select jsonb_build_object('retired_at',r.retired_at,'reason',r.reason) from public.assessment_certificate_program_retirements r where r.tenant_id=p_tenant and r.program_id=(entry.value->>'id')::uuid)) order by entry.ordinality),'[]'::jsonb) from jsonb_array_elements(value) with ordinality entry);end if;
 if p_kind in('candidate','institution') then return(select coalesce(jsonb_agg(entry.value||jsonb_build_object('attempt_id',c.attempt_id,'replaces_certificate_id',c.replaces_certificate_id,'replacement_id',(select n.id from public.assessment_certificates n where n.tenant_id=p_tenant and n.replaces_certificate_id=c.id and n.state in('issued','revoked')),'replacement_pending',p_kind='institution' and exists(select 1 from public.assessment_certificates n where n.replaces_certificate_id=c.id and n.state='pending')) order by entry.ordinality),'[]'::jsonb) from jsonb_array_elements(value) with ordinality entry join public.assessment_certificates c on c.tenant_id=p_tenant and c.id=(entry.value->>'id')::uuid);end if;
 return value;
end;$$;

alter function public.assessment_certificate_status(uuid,text,text,text) rename to assessment_certificate_status_v33;
create function public.assessment_certificate_status(p_id uuid,p_key_id text,p_payload_hash text,p_signature text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare value jsonb;replacement uuid;begin
 value:=public.assessment_certificate_status_v33(p_id,p_key_id,p_payload_hash,p_signature);
 if value->>'status' not in('not_found','revoked') then
  select id into replacement from public.assessment_certificates where replaces_certificate_id=p_id and state in('issued','revoked');
  if found then return value||jsonb_build_object('status','replaced','replacement_id',replacement);end if;
 end if;return value;
end;$$;

revoke all on function public.assessment_certificate_command_v33(uuid,uuid,text,text,jsonb),public.assessment_certificate_seal_v33(uuid,uuid,uuid,text,text,text),public.assessment_certificate_read_v33(uuid,uuid,text,uuid,uuid,integer),public.assessment_certificate_status_v33(uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.assessment_certificate_command(uuid,uuid,text,text,jsonb),public.assessment_certificate_seal(uuid,uuid,uuid,text,text,text),public.assessment_certificate_read(uuid,uuid,text,uuid,uuid,integer),public.assessment_certificate_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.assessment_certificate_command(uuid,uuid,text,text,jsonb),public.assessment_certificate_seal(uuid,uuid,uuid,text,text,text),public.assessment_certificate_read(uuid,uuid,text,uuid,uuid,integer),public.assessment_certificate_status(uuid,text,text,text) to service_role;
commit;
