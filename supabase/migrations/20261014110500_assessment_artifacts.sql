begin;
create table public.assessment_artifacts (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 created_by uuid not null references public.users(id),filename text not null,mime text not null,
 kind text not null check(kind in ('image','audio','video','file')),byte_length bigint not null check(byte_length between 1 and 2147483648),
 expected_parts jsonb not null,state text not null default 'uploading' check(state in ('uploading','quarantined','ready','rejected','cancelled')),
 manifest jsonb,manifest_hash text,created_at timestamptz not null default clock_timestamp(),
 upload_expires_at timestamptz not null default clock_timestamp()+interval '24 hours',completed_at timestamptz,
 unique(tenant_id,id)
);
create table public.assessment_artifact_parts (
 tenant_id uuid not null,artifact_id uuid not null,index integer not null check(index between 0 and 2047),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),byte_length integer not null check(byte_length between 1 and 1048576),
 cipher_sha256 text not null check(cipher_sha256 ~ '^[a-f0-9]{64}$'),iv text not null check(iv ~ '^[a-f0-9]{24}$'),
 key_id text not null,object_key text not null unique,etag text not null,created_at timestamptz not null default clock_timestamp(),
 primary key(artifact_id,index),foreign key(tenant_id,artifact_id) references public.assessment_artifacts(tenant_id,id)
);
create table public.assessment_artifact_commands (
 tenant_id uuid not null,actor_id uuid not null,idempotency_key text not null,request jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key)
);
create table public.assessment_artifact_scan_jobs (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,artifact_id uuid not null unique,
 state text not null default 'queued' check(state in ('queued','leased','completed')),
 lease_token uuid,lease_expires_at timestamptz,attempts integer not null default 0,created_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,artifact_id) references public.assessment_artifacts(tenant_id,id)
);
create table public.assessment_artifact_scan_reports (
 job_id uuid primary key references public.assessment_artifact_scan_jobs(id),tenant_id uuid not null,
 artifact_id uuid not null,report jsonb not null,created_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,artifact_id) references public.assessment_artifacts(tenant_id,id)
);
create index assessment_artifacts_library on public.assessment_artifacts(tenant_id,id);
create index assessment_artifact_scan_due on public.assessment_artifact_scan_jobs(state,lease_expires_at,created_at);
do $$ declare t text;begin
 foreach t in array array['assessment_artifacts','assessment_artifact_parts','assessment_artifact_commands','assessment_artifact_scan_jobs','assessment_artifact_scan_reports'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['assessment_artifact_parts','assessment_artifact_commands','assessment_artifact_scan_reports'] loop
  execute format('create trigger immutable_record before update or delete on public.%I for each row execute function public.assessment_immutable()',t);
 end loop;
end; $$;
create function public.assessment_artifact_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'artifact_deletion_requires_retention_workflow' using errcode='23514';end if;
 if (new.id,new.tenant_id,new.created_by,new.filename,new.mime,new.kind,new.byte_length,new.expected_parts,new.created_at,new.upload_expires_at) is distinct from (old.id,old.tenant_id,old.created_by,old.filename,old.mime,old.kind,old.byte_length,old.expected_parts,old.created_at,old.upload_expires_at) then raise exception 'immutable_artifact_identity' using errcode='23514';end if;
 if old.manifest is not null and (new.manifest,new.manifest_hash,new.completed_at) is distinct from (old.manifest,old.manifest_hash,old.completed_at) then raise exception 'immutable_artifact_manifest' using errcode='23514';end if;
 if new.state<>old.state and not ((old.state='uploading' and new.state in ('quarantined','cancelled')) or (old.state='quarantined' and new.state in ('ready','rejected'))) then raise exception 'invalid_artifact_transition' using errcode='23514';end if;
 return new;
end; $$;
create trigger artifact_guard before update or delete on public.assessment_artifacts for each row execute function public.assessment_artifact_guard();

create function public.assessment_artifact_read(p_actor uuid,p_tenant uuid,p_after uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if not public.assessment_has_capability(p_tenant,p_actor,'banks.read') then raise exception 'forbidden' using errcode='42501';end if;
 if p_limit not between 1 and 100 then raise exception 'invalid_page_limit' using errcode='22023';end if;
 select coalesce(jsonb_agg(row order by id),'[]') into result from (select id,filename,mime,kind,byte_length,state,created_by,created_at,completed_at,manifest_hash from public.assessment_artifacts where tenant_id=p_tenant and (p_after is null or id>p_after) order by id limit p_limit+1) row;
 return jsonb_build_object('items',case when jsonb_array_length(result)>p_limit then result- p_limit else result end,'next_cursor',case when jsonb_array_length(result)>p_limit then result->(p_limit-1)->>'id' else null end);
end; $$;
create function public.assessment_artifact_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_artifact_commands;request jsonb;result jsonb;a public.assessment_artifacts;part jsonb;pos integer:=0;bytes bigint;count integer;kind text;
begin
 if not public.assessment_has_capability(p_tenant,p_actor,'items.write') then raise exception 'forbidden' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data);perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||p_key,0));
 select * into prior from public.assessment_artifact_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='upload.begin' then
  kind:=case when p_data->>'mime' in ('image/png','image/jpeg','image/webp') then 'image' when p_data->>'mime' in ('audio/mpeg','audio/wav','audio/ogg') then 'audio' when p_data->>'mime' in ('video/mp4','video/webm') then 'video' when p_data->>'mime'='application/pdf' then 'file' else null end;
  if kind is null or jsonb_typeof(p_data->'filename') is distinct from 'string' or length(trim(p_data->>'filename')) not between 1 and 240 or jsonb_typeof(p_data->'byte_length') is distinct from 'number' or jsonb_typeof(p_data->'parts') is distinct from 'array' then raise exception 'invalid_artifact' using errcode='22023';end if;
  bytes:=(p_data->>'byte_length')::bigint;if bytes not between 1 and 2147483648 or bytes::numeric<>(p_data->>'byte_length')::numeric then raise exception 'invalid_artifact_size' using errcode='22023';end if;
  count:=ceil(bytes::numeric/1048576)::integer;if jsonb_array_length(p_data->'parts')<>count then raise exception 'invalid_part_manifest' using errcode='22023';end if;
  for part in select value from jsonb_array_elements(p_data->'parts') loop
   if jsonb_typeof(part->'sha256') is distinct from 'string' or (part->>'sha256') !~ '^[a-f0-9]{64}$' or jsonb_typeof(part->'byte_length') is distinct from 'number' or (part->>'byte_length')::numeric<>least(1048576,bytes-pos::bigint*1048576) then raise exception 'invalid_part_manifest' using errcode='22023';end if;pos:=pos+1;
  end loop;
  -- Bounded reservations are a transport safety ceiling, not product billing.
  perform pg_advisory_xact_lock(hashtextextended('artifact-reservation:'||p_tenant::text,0));
  if (select count(*) from public.assessment_artifacts where tenant_id=p_tenant and created_by=p_actor and state='uploading' and upload_expires_at>clock_timestamp())>=20 then raise exception 'upload_reservation_limit' using errcode='23514';end if;
  insert into public.assessment_artifacts(tenant_id,created_by,filename,mime,kind,byte_length,expected_parts) values(p_tenant,p_actor,p_data->>'filename',p_data->>'mime',kind,bytes,p_data->'parts') returning * into a;
  result:=jsonb_build_object('id',a.id,'state',a.state,'chunk_bytes',1048576,'part_count',count,'upload_expires_at',a.upload_expires_at);
 elsif p_action='upload.cancel' then
  select * into a from public.assessment_artifacts where tenant_id=p_tenant and id=(p_data->>'artifact_id')::uuid for update;
  if not found or a.created_by<>p_actor then raise exception 'not_found' using errcode='P0002';end if;
  if a.state not in ('uploading','cancelled') then raise exception 'artifact_already_completed' using errcode='23514';end if;
  update public.assessment_artifacts set state='cancelled' where id=a.id;result:=jsonb_build_object('id',a.id,'state','cancelled');
 else raise exception 'unknown_artifact_action' using errcode='22023';end if;
 insert into public.assessment_artifact_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id) values(p_tenant,p_actor,'artifact.'||p_action,a.id);
 return result;
end; $$;

-- Only the trusted media transport calls this RPC; its Edge bridge verifies
-- an actual user token and rechecks author authority before every storage action.
create function public.assessment_artifact_transport(p_actor uuid,p_tenant uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.assessment_artifacts;part public.assessment_artifact_parts;expected jsonb;idx integer;part_manifest jsonb;att public.assessment_attempts;
begin
 select * into a from public.assessment_artifacts where tenant_id=p_tenant and id=(p_data->>'artifact_id')::uuid for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 if p_action='read.authorize' then
  if a.state<>'ready' then raise exception 'artifact_not_ready' using errcode='23514';end if;
  if p_data->>'attempt_id' is null then
   if not public.assessment_has_capability(p_tenant,p_actor,'banks.read') then raise exception 'forbidden' using errcode='42501';end if;
  else
   select * into att from public.assessment_attempts where tenant_id=p_tenant and id=(p_data->>'attempt_id')::uuid and candidate_id=p_actor and state='active' and deadline_at>clock_timestamp() and section_deadline_at>clock_timestamp();
   if not found or not exists(select 1 from public.assessment_forms f,jsonb_array_elements(f.manifest->'sections'->att.section_index->'items') i,jsonb_array_elements(coalesce(i->'item'->'media','[]')) m where f.id=att.form_id and f.tenant_id=p_tenant and m->>'artifact_id'=a.id::text) then raise exception 'not_found' using errcode='P0002';end if;
  end if;
  return jsonb_build_object('artifact_id',a.id,'tenant_id',a.tenant_id,'mime',a.mime,'kind',a.kind,'byte_length',a.byte_length,'manifest_hash',a.manifest_hash,'parts',a.manifest);
 end if;
 if not public.assessment_has_capability(p_tenant,p_actor,'items.write') then raise exception 'forbidden' using errcode='42501';end if;
 if a.created_by<>p_actor then raise exception 'not_found' using errcode='P0002';end if;
 if p_action in ('chunk.authorize','chunk.receipt') then
  if jsonb_typeof(p_data->'index') is distinct from 'number' or (p_data->>'index')::numeric<>trunc((p_data->>'index')::numeric) then raise exception 'invalid_part_index' using errcode='22023';end if;
  idx:=(p_data->>'index')::integer;expected:=a.expected_parts->idx;
  if idx<0 or expected is null then raise exception 'invalid_part_index' using errcode='22023';end if;
  select * into part from public.assessment_artifact_parts where artifact_id=a.id and index=idx;
  if p_action='chunk.authorize' then
   if part.artifact_id is null and (a.state<>'uploading' or a.upload_expires_at<=clock_timestamp()) then raise exception 'upload_not_active' using errcode='23514';end if;
   if a.state='cancelled' then raise exception 'upload_not_active' using errcode='23514';end if;
   return jsonb_build_object('artifact_id',a.id,'tenant_id',a.tenant_id,'index',idx,'sha256',expected->>'sha256','byte_length',expected->'byte_length','receipt',case when part.artifact_id is null then null else to_jsonb(part) end);
  end if;
  if p_data->>'sha256' is distinct from expected->>'sha256' or jsonb_typeof(p_data->'byte_length') is distinct from 'number' or (p_data->>'byte_length')::numeric<>(expected->>'byte_length')::numeric then raise exception 'part_manifest_conflict' using errcode='23505';end if;
  if part.artifact_id is not null then return to_jsonb(part);end if;
  if a.state<>'uploading' or a.upload_expires_at<=clock_timestamp() then raise exception 'upload_not_active' using errcode='23514';end if;
  if p_data->>'object_key' is distinct from ('assessment/'||p_tenant||'/'||a.id||'/'||idx||'/'||(expected->>'sha256')) or coalesce(length(p_data->>'key_id'),0) not between 1 and 80 or coalesce(length(p_data->>'etag'),0) not between 1 and 200 then raise exception 'invalid_storage_receipt' using errcode='22023';end if;
  insert into public.assessment_artifact_parts(tenant_id,artifact_id,index,sha256,byte_length,cipher_sha256,iv,key_id,object_key,etag) values(p_tenant,a.id,idx,p_data->>'sha256',(expected->>'byte_length')::integer,p_data->>'cipher_sha256',p_data->>'iv',p_data->>'key_id',p_data->>'object_key',p_data->>'etag') returning * into part;
  return to_jsonb(part);
 elsif p_action='upload.complete' then
  if a.manifest is not null then return jsonb_build_object('id',a.id,'state',a.state,'manifest_hash',a.manifest_hash);end if;
  if a.state<>'uploading' or a.upload_expires_at<=clock_timestamp() then raise exception 'upload_not_active' using errcode='23514';end if;
  if (select count(*) from public.assessment_artifact_parts where artifact_id=a.id)<>jsonb_array_length(a.expected_parts) then raise exception 'artifact_parts_missing' using errcode='23514';end if;
  select jsonb_agg(jsonb_build_object('index',p.index,'sha256',p.sha256,'byte_length',p.byte_length,'cipher_sha256',p.cipher_sha256,'iv',p.iv,'key_id',p.key_id,'object_key',p.object_key,'etag',p.etag) order by p.index) into part_manifest from public.assessment_artifact_parts p where artifact_id=a.id;
  update public.assessment_artifacts set state='quarantined',manifest=part_manifest,manifest_hash=encode(sha256(convert_to(part_manifest::text,'UTF8')),'hex'),completed_at=clock_timestamp() where id=a.id returning * into a;
  insert into public.assessment_artifact_scan_jobs(tenant_id,artifact_id) values(p_tenant,a.id);
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'artifact.upload.complete',a.id,jsonb_build_object('manifest_hash',a.manifest_hash));
  return jsonb_build_object('id',a.id,'state',a.state,'manifest_hash',a.manifest_hash);
 else raise exception 'unknown_artifact_transport' using errcode='22023';end if;
end; $$;

create function public.assessment_artifact_scan_claim(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb:='[]';j public.assessment_artifact_scan_jobs;a public.assessment_artifacts;begin
 if p_limit not between 1 and 20 then raise exception 'invalid_claim_limit' using errcode='22023';end if;
 for j in select * from public.assessment_artifact_scan_jobs where state='queued' or (state='leased' and lease_expires_at<=clock_timestamp()) order by created_at,id limit p_limit for update skip locked loop
  update public.assessment_artifact_scan_jobs set state='leased',lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '3 minutes',attempts=attempts+1 where id=j.id returning * into j;
  select * into a from public.assessment_artifacts where id=j.artifact_id and state='quarantined';
  if found then result:=result||jsonb_build_array(jsonb_build_object('job_id',j.id,'tenant_id',j.tenant_id,'artifact_id',j.artifact_id,'lease_token',j.lease_token,'lease_expires_at',j.lease_expires_at,'mime',a.mime,'byte_length',a.byte_length,'manifest_hash',a.manifest_hash,'parts',a.manifest));end if;
 end loop;return result;
end; $$;
create function public.assessment_artifact_scan_bundle(p_job uuid,p_token uuid,p_renew boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.assessment_artifact_scan_jobs;a public.assessment_artifacts;begin
 select * into j from public.assessment_artifact_scan_jobs where id=p_job for update;
 if not found or j.state<>'leased' or j.lease_token is distinct from p_token or j.lease_expires_at<=clock_timestamp() then raise exception 'invalid_scan_lease' using errcode='23505';end if;
 if p_renew then update public.assessment_artifact_scan_jobs set lease_expires_at=clock_timestamp()+interval '3 minutes' where id=j.id returning * into j;end if;
 select * into a from public.assessment_artifacts where tenant_id=j.tenant_id and id=j.artifact_id and state='quarantined';
 if not found then raise exception 'artifact_not_quarantined' using errcode='23514';end if;
 return jsonb_build_object('job_id',j.id,'tenant_id',a.tenant_id,'artifact_id',a.id,'mime',a.mime,'kind',a.kind,'byte_length',a.byte_length,'manifest_hash',a.manifest_hash,'parts',a.manifest,'lease_expires_at',j.lease_expires_at);
end; $$;
create function public.assessment_artifact_scan_report(p_report jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.assessment_artifact_scan_jobs;a public.assessment_artifacts;prior public.assessment_artifact_scan_reports;new_state text;
begin
 select * into j from public.assessment_artifact_scan_jobs where id=(p_report->>'job_id')::uuid for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 select * into prior from public.assessment_artifact_scan_reports where job_id=j.id;
 if found then if prior.report<>p_report then raise exception 'scan_receipt_conflict' using errcode='23505';end if;return jsonb_build_object('id',j.artifact_id,'state',case when prior.report->>'verdict'='clean' then 'ready' else 'rejected' end);end if;
 if j.state<>'leased' or j.lease_token is distinct from (p_report->>'lease_token')::uuid or j.lease_expires_at<=clock_timestamp() then raise exception 'invalid_scan_lease' using errcode='23505';end if;
 select * into a from public.assessment_artifacts where id=j.artifact_id and tenant_id=j.tenant_id for update;
 if a.state<>'quarantined' or p_report->>'manifest_hash' is distinct from a.manifest_hash or coalesce(p_report->>'verdict','') not in ('clean','rejected') or coalesce(length(p_report->>'scanner_id'),0) not between 1 and 120 or coalesce(length(p_report->>'scanner_version'),0) not between 1 and 120 or coalesce(length(p_report->>'signature_version'),0) not between 1 and 120 or coalesce(p_report->>'report_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_scan_report' using errcode='22023';end if;
 if p_report->>'verdict'='clean' and (p_report->>'detected_mime' is distinct from a.mime or p_report->'decoder_checked' is distinct from 'true'::jsonb) then raise exception 'verified_decoder_required' using errcode='23514';end if;
 new_state:=case when p_report->>'verdict'='clean' then 'ready' else 'rejected' end;
 insert into public.assessment_artifact_scan_reports values(j.id,j.tenant_id,j.artifact_id,p_report,clock_timestamp());
 update public.assessment_artifact_scan_jobs set state='completed' where id=j.id;
 update public.assessment_artifacts set state=new_state where id=a.id;
 -- The immutable scanner report is the system-principal audit receipt. Do not
 -- falsely attribute the automated scan decision to the uploading human.
 return jsonb_build_object('id',a.id,'state',new_state);
end; $$;
do $$ declare f text;begin
 foreach f in array array['assessment_artifact_read(uuid,uuid,uuid,integer)','assessment_artifact_command(uuid,uuid,text,text,jsonb)','assessment_artifact_transport(uuid,uuid,text,jsonb)','assessment_artifact_scan_claim(integer)','assessment_artifact_scan_bundle(uuid,uuid,boolean)','assessment_artifact_scan_report(jsonb)'] loop
  execute 'revoke all on function public.'||f||' from public,anon,authenticated';execute 'grant execute on function public.'||f||' to service_role';
 end loop;
end; $$;
create function public.assessment_item_artifacts_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare m jsonb;begin
 for m in select value from jsonb_array_elements(coalesce(new.payload->'media','[]')) loop
  if not exists(select 1 from public.assessment_artifacts where tenant_id=new.tenant_id and id=(m->>'artifact_id')::uuid and state='ready' and kind=m->>'kind') then raise exception 'artifact_not_ready_or_foreign' using errcode='23514';end if;
 end loop;return new;
end; $$;
create trigger ready_item_artifacts before insert on public.assessment_item_versions for each row execute function public.assessment_item_artifacts_guard();
revoke all on function public.assessment_item_artifacts_guard() from public,anon,authenticated,service_role;
commit;
