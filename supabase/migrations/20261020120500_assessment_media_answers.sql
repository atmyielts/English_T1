begin;
-- Academic submissions share the encrypted/scanned artifact transport, never
-- Proctor recording identity, permissions, retention or academic decisions.
alter table public.assessment_artifacts add column purpose text not null default 'prompt' check(purpose in('prompt','answer'));
create table public.assessment_answer_assets (
 tenant_id uuid not null,artifact_id uuid primary key,attempt_id uuid not null,item_version_id uuid not null,
 source text not null check(source in('upload','capture')),content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 admitted_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,artifact_id) references public.assessment_artifacts(tenant_id,id),
 foreign key(tenant_id,attempt_id) references public.assessment_attempts(tenant_id,id),
 foreign key(tenant_id,item_version_id) references public.assessment_item_versions(tenant_id,id)
);
create index assessment_answer_assets_item on public.assessment_answer_assets(tenant_id,attempt_id,item_version_id,admitted_at);
create table public.assessment_answer_commands (
 tenant_id uuid not null,actor_id uuid not null,idempotency_key text not null,request jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key)
);
alter table public.assessment_answer_assets enable row level security;
alter table public.assessment_answer_commands enable row level security;
revoke all on public.assessment_answer_assets,public.assessment_answer_commands from anon,authenticated;
grant all on public.assessment_answer_assets,public.assessment_answer_commands to service_role;
create trigger immutable_record before update or delete on public.assessment_answer_assets for each row execute function public.assessment_immutable();
create trigger immutable_record before update or delete on public.assessment_answer_commands for each row execute function public.assessment_immutable();

create function public.assessment_answer_binding_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_table_name='assessment_artifacts' and tg_op='UPDATE' then
  if new.purpose is distinct from old.purpose then raise exception 'immutable_artifact_purpose' using errcode='23514';end if;return new;
 end if;
 if tg_table_name='assessment_artifacts' then
  if new.purpose='answer' and not exists(select 1 from public.assessment_answer_assets where artifact_id=new.id) then raise exception 'academic_binding_required' using errcode='23514';end if;
 else
  if not exists(select 1 from public.assessment_artifacts a join public.assessment_attempts att on att.tenant_id=a.tenant_id and att.id=new.attempt_id
   where a.id=new.artifact_id and a.tenant_id=new.tenant_id and a.purpose='answer' and a.created_by=att.candidate_id
   and new.content_hash=encode(sha256(convert_to(jsonb_build_object('attempt_id',new.attempt_id,'item_version_id',new.item_version_id,'source',new.source,'mime',a.mime,'byte_length',a.byte_length,'parts',a.expected_parts)::text,'UTF8')),'hex')) then raise exception 'invalid_academic_binding' using errcode='23514';end if;
 end if;return new;
end;$$;
create trigger immutable_purpose before update on public.assessment_artifacts for each row execute function public.assessment_answer_binding_guard();
create constraint trigger academic_binding_required after insert on public.assessment_artifacts deferrable initially deferred for each row execute function public.assessment_answer_binding_guard();
create trigger academic_binding_guard before insert on public.assessment_answer_assets for each row execute function public.assessment_answer_binding_guard();

create function public.assessment_media_policy_valid(p jsonb,kind text) returns boolean language plpgsql immutable as $$declare mime text;source text;begin
 if kind not in('audio_response','video_response','file_response') or jsonb_typeof(p) is distinct from 'object' or p->>'schema_version' is distinct from 'assessment.media-policy.v1'
  or exists(select 1 from jsonb_object_keys(p) k where k not in('schema_version','mimes','max_bytes','sources'))
  or jsonb_typeof(p->'mimes') is distinct from 'array' or jsonb_typeof(p->'sources') is distinct from 'array'
  or jsonb_typeof(p->'max_bytes') is distinct from 'number' then return false;end if;
 if jsonb_array_length(p->'mimes') not between 1 and 10 or jsonb_array_length(p->'sources') not between 1 and 2
  or exists(select 1 from jsonb_array_elements(p->'mimes') e where jsonb_typeof(e) is distinct from 'string')
  or exists(select 1 from jsonb_array_elements(p->'sources') e where jsonb_typeof(e) is distinct from 'string')
  or (select count(distinct value) from jsonb_array_elements(p->'mimes'))<>jsonb_array_length(p->'mimes')
  or (select count(distinct value) from jsonb_array_elements(p->'sources'))<>jsonb_array_length(p->'sources')
  or (p->>'max_bytes')::numeric not between 1 and 2147483648 or (p->>'max_bytes')::numeric<>trunc((p->>'max_bytes')::numeric) then return false;end if;
 for mime in select jsonb_array_elements_text(p->'mimes') loop
  if (kind='audio_response' and mime not in('audio/mpeg','audio/wav','audio/ogg')) or (kind='video_response' and mime not in('video/mp4','video/webm')) or (kind='file_response' and mime not in('application/pdf','image/png','image/jpeg','image/webp')) then return false;end if;
 end loop;
 for source in select jsonb_array_elements_text(p->'sources') loop if source not in('upload','capture') or (kind='file_response' and source<>'upload') then return false;end if;end loop;
 return true;
end;$$;
create function public.assessment_media_item_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if new.payload ? 'media_response' and not public.assessment_media_policy_valid(new.payload->'media_response',new.payload->>'type') then raise exception 'invalid_media_answer_policy' using errcode='23514';end if;
 return new;
end;$$;
create trigger media_answer_policy before insert or update of payload on public.assessment_item_versions for each row execute function public.assessment_media_item_guard();

create function public.assessment_answer_read(p_actor uuid,p_tenant uuid,p_attempt uuid,p_item uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;begin
 if not exists(select 1 from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt and candidate_id=p_actor) then raise exception 'not_found' using errcode='P0002';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'content_hash',b.content_hash,'filename',a.filename,'mime',a.mime,'byte_length',a.byte_length,'state',a.state,'source',b.source,'upload_expires_at',a.upload_expires_at) order by b.admitted_at,a.id),'[]') into result
 from public.assessment_answer_assets b join public.assessment_artifacts a on a.id=b.artifact_id where b.tenant_id=p_tenant and b.attempt_id=p_attempt and b.item_version_id=p_item;
 return result;
end;$$;

create function public.assessment_answer_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare att public.assessment_attempts;lease public.assessment_attempt_leases;a public.assessment_artifacts;b public.assessment_answer_assets;prior public.assessment_answer_commands;request jsonb;result jsonb;item jsonb;policy jsonb;upload jsonb;part jsonb;bytes bigint;part_count integer;pos integer:=0;kind text;fingerprint text;
begin
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 if p_action='upload.begin' then
  select * into att from public.assessment_attempts where tenant_id=p_tenant and id=(p_data->>'attempt_id')::uuid and candidate_id=p_actor for update;
 else
  select att0.* into att from public.assessment_attempts att0 join public.assessment_answer_assets b0 on b0.attempt_id=att0.id where b0.tenant_id=p_tenant and b0.artifact_id=(p_data->>'artifact_id')::uuid and att0.candidate_id=p_actor for update of att0;
 end if;
 if att.id is null then raise exception 'not_found' using errcode='P0002';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data-'lease');perform pg_advisory_xact_lock(hashtextextended('academic-answer:'||p_tenant::text||p_actor::text||p_key,0));
 select * into prior from public.assessment_answer_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='upload.begin' then
  select * into lease from public.assessment_attempt_leases where attempt_id=att.id for update;
  if lease.attempt_id is null or lease.expires_at<=clock_timestamp() or (p_data#>>'{lease,device_id}')::uuid is distinct from lease.device_id or p_data#>>'{lease,token_hash}' is distinct from lease.token_hash or (p_data#>>'{lease,epoch}')::bigint is distinct from lease.epoch then raise exception 'device_lease_invalid' using errcode='42501';end if;
  perform public.proctor_capture_enforce(p_tenant,att.id);select * into att from public.assessment_attempts where id=att.id;
  if att.state='paused' and exists(select 1 from public.proctor_capture_launches l join public.proctor_sessions s on s.id=l.session_id where s.attempt_id=att.id) then return jsonb_build_object('rejected','capture_continuity_required');end if;
  if att.state<>'active' or least(att.deadline_at,att.section_deadline_at)<=clock_timestamp() then raise exception 'answer_admission_closed' using errcode='23514';end if;
  select v.payload into item from public.assessment_forms f,jsonb_array_elements(f.manifest->'sections'->att.section_index->'items') i join public.assessment_item_versions v on v.id=(i->>'item_version_id')::uuid and v.tenant_id=p_tenant where f.id=att.form_id and i->>'item_version_id'=p_data->>'item_version_id';
  if item is null then raise exception 'not_found' using errcode='P0002';end if;policy:=item->'media_response';
  if not public.assessment_media_policy_valid(policy,item->>'type') then raise exception 'media_answer_policy_required' using errcode='23514';end if;
  upload:=p_data->'upload';
  if jsonb_typeof(upload) is distinct from 'object' or jsonb_typeof(upload->'filename') is distinct from 'string' or length(trim(upload->>'filename')) not between 1 and 240 or jsonb_typeof(upload->'byte_length') is distinct from 'number' or jsonb_typeof(upload->'parts') is distinct from 'array'
   or not(policy->'mimes' ? (upload->>'mime')) or not(policy->'sources' ? (p_data->>'source')) then raise exception 'invalid_academic_upload' using errcode='22023';end if;
  bytes:=(upload->>'byte_length')::bigint;
  if bytes not between 1 and (policy->>'max_bytes')::bigint or bytes::numeric<>(upload->>'byte_length')::numeric then raise exception 'invalid_artifact_size' using errcode='22023';end if;
  part_count:=ceil(bytes::numeric/1048576)::integer;if jsonb_array_length(upload->'parts')<>part_count then raise exception 'invalid_part_manifest' using errcode='22023';end if;
  for part in select value from jsonb_array_elements(upload->'parts') loop
   if jsonb_typeof(part->'sha256') is distinct from 'string' or part->>'sha256' !~ '^[a-f0-9]{64}$' or jsonb_typeof(part->'byte_length') is distinct from 'number' or (part->>'byte_length')::numeric<>least(1048576,bytes-pos::bigint*1048576) or exists(select 1 from jsonb_object_keys(part) k where k not in('sha256','byte_length')) then raise exception 'invalid_part_manifest' using errcode='22023';end if;pos:=pos+1;
  end loop;
  -- Total immutable reservations are bounded even after cancellation/scan.
  if (select count(*) from public.assessment_answer_assets where attempt_id=att.id and item_version_id=(p_data->>'item_version_id')::uuid)>=20 then raise exception 'answer_reservation_limit' using errcode='23514';end if;
  kind:=case when upload->>'mime' like 'image/%' then 'image' when upload->>'mime' like 'audio/%' then 'audio' when upload->>'mime' like 'video/%' then 'video' else 'file' end;
  insert into public.assessment_artifacts(tenant_id,created_by,filename,mime,kind,byte_length,expected_parts,purpose) values(p_tenant,p_actor,upload->>'filename',upload->>'mime',kind,bytes,upload->'parts','answer') returning * into a;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('attempt_id',att.id,'item_version_id',(p_data->>'item_version_id')::uuid,'source',p_data->>'source','mime',a.mime,'byte_length',a.byte_length,'parts',a.expected_parts)::text,'UTF8')),'hex');
  insert into public.assessment_answer_assets(tenant_id,artifact_id,attempt_id,item_version_id,source,content_hash) values(p_tenant,a.id,att.id,(p_data->>'item_version_id')::uuid,p_data->>'source',fingerprint);
  result:=jsonb_build_object('id',a.id,'content_hash',fingerprint,'state',a.state,'chunk_bytes',1048576,'part_count',part_count,'upload_expires_at',a.upload_expires_at);
 elsif p_action='upload.cancel' then
  select * into a from public.assessment_artifacts where id=(p_data->>'artifact_id')::uuid for update;
  if exists(select 1 from public.assessment_response_journal where attempt_id=att.id and response->>'artifact_id'=a.id::text) then raise exception 'submitted_answer_cannot_be_cancelled' using errcode='23514';end if;
  if a.state not in('uploading','cancelled') then raise exception 'artifact_already_completed' using errcode='23514';end if;
  update public.assessment_artifacts set state='cancelled' where id=a.id;result:=jsonb_build_object('id',a.id,'state','cancelled');
 else raise exception 'unknown_media_answer_action' using errcode='22023';end if;
 insert into public.assessment_answer_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'answer.'||p_action,a.id,jsonb_build_object('attempt_id',att.id,'content_hash',fingerprint));
 return result;
end;$$;

create function public.assessment_media_response_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$declare kind text;begin
 select payload->>'type' into kind from public.assessment_item_versions where id=new.item_version_id;
 if kind not in('audio_response','video_response','file_response') or new.response='null'::jsonb then return new;end if;
 if jsonb_typeof(new.response) is distinct from 'object' or new.response->>'schema_version' is distinct from 'assessment.media-answer.v1'
  or exists(select 1 from jsonb_object_keys(new.response) k where k not in('schema_version','artifact_id','content_hash')) then raise exception 'invalid_academic_answer' using errcode='23514';end if;
 if not exists(select 1 from public.assessment_answer_assets b join public.assessment_artifacts a on a.id=b.artifact_id where b.tenant_id=new.tenant_id and b.attempt_id=new.attempt_id and b.item_version_id=new.item_version_id and b.artifact_id=(new.response->>'artifact_id')::uuid and b.content_hash=new.response->>'content_hash' and a.state in('uploading','quarantined','ready')) then raise exception 'academic_answer_binding_mismatch' using errcode='23514';end if;
 return new;
end;$$;
create trigger media_answer_binding before insert on public.assessment_response_journal for each row execute function public.assessment_media_response_guard();

-- Prompt libraries and author commands cannot expose or manipulate answers,
-- including when an institution staff member is also taking an examination.
create or replace function public.assessment_artifact_read(p_actor uuid,p_tenant uuid,p_after uuid default null,p_limit integer default 100) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;begin
 if not public.assessment_has_capability(p_tenant,p_actor,'banks.read') then raise exception 'forbidden' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_page_limit' using errcode='22023';end if;
 select coalesce(jsonb_agg(row order by id),'[]') into result from(select id,filename,mime,kind,byte_length,state,created_by,created_at,completed_at,manifest_hash from public.assessment_artifacts where tenant_id=p_tenant and purpose='prompt' and (p_after is null or id>p_after) order by id limit p_limit+1) row;
 return jsonb_build_object('items',case when jsonb_array_length(result)>p_limit then result-p_limit else result end,'next_cursor',case when jsonb_array_length(result)>p_limit then result->(p_limit-1)->>'id' else null end);
end;$$;
create or replace function public.assessment_item_artifacts_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare m jsonb;begin
 for m in select value from jsonb_array_elements(coalesce(new.payload->'media','[]')) loop
  if not exists(select 1 from public.assessment_artifacts where tenant_id=new.tenant_id and id=(m->>'artifact_id')::uuid and state='ready' and kind=m->>'kind' and purpose='prompt') then raise exception 'artifact_not_ready_or_foreign' using errcode='23514';end if;
 end loop;return new;
end;$$;
alter function public.assessment_artifact_command(uuid,uuid,text,text,jsonb) rename to assessment_prompt_artifact_command;
create function public.assessment_artifact_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$begin
 if p_action<>'upload.begin' and exists(select 1 from public.assessment_artifacts where tenant_id=p_tenant and id=(p_data->>'artifact_id')::uuid and purpose='answer') then raise exception 'not_found' using errcode='P0002';end if;
 return public.assessment_prompt_artifact_command(p_actor,p_tenant,p_key,p_action,p_data);
end;$$;

alter function public.assessment_artifact_transport(uuid,uuid,text,jsonb) rename to assessment_prompt_artifact_transport;
create function public.assessment_artifact_transport(p_actor uuid,p_tenant uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.assessment_artifacts;b public.assessment_answer_assets;part public.assessment_artifact_parts;expected jsonb;idx integer;parts jsonb;context jsonb;begin
 if p_action='read.authorize' and p_data ? 'attempt_id' and p_data ? 'task_id' then raise exception 'ambiguous_artifact_scope' using errcode='22023';end if;
 select * into a from public.assessment_artifacts where tenant_id=p_tenant and id=(p_data->>'artifact_id')::uuid for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 if a.purpose='prompt' then
  if p_data ? 'task_id' then raise exception 'not_found' using errcode='P0002';end if;
  return public.assessment_prompt_artifact_transport(p_actor,p_tenant,p_action,p_data);
 end if;
 select * into b from public.assessment_answer_assets where artifact_id=a.id;
 if p_action='read.authorize' and p_data ? 'task_id' then
  context:=public.assessment_grading_read(p_actor,p_tenant,'task',(p_data->>'task_id')::uuid);
  if context#>>'{response,artifact_id}' is distinct from a.id::text or context#>>'{response,content_hash}' is distinct from b.content_hash then raise exception 'not_found' using errcode='P0002';end if;
 else
  if a.created_by is distinct from p_actor or not exists(select 1 from public.assessment_attempts where tenant_id=p_tenant and id=b.attempt_id and candidate_id=p_actor) then raise exception 'not_found' using errcode='P0002';end if;
  if p_action='read.authorize' and p_data->>'attempt_id' is distinct from b.attempt_id::text then raise exception 'not_found' using errcode='P0002';end if;
 end if;
 if p_action='read.authorize' then
  if a.state<>'ready' then raise exception 'artifact_not_ready' using errcode='23514';end if;
  return jsonb_build_object('artifact_id',a.id,'tenant_id',a.tenant_id,'mime',a.mime,'kind',a.kind,'byte_length',a.byte_length,'manifest_hash',a.manifest_hash,'parts',a.manifest);
 end if;
 -- Content was pinned at admission. Recovery transports those bytes only; it
 -- never appends an answer, changes selection, extends clocks or grants a lease.
 if p_action in('chunk.authorize','chunk.receipt') then
  if jsonb_typeof(p_data->'index') is distinct from 'number' or (p_data->>'index')::numeric<>trunc((p_data->>'index')::numeric) then raise exception 'invalid_part_index' using errcode='22023';end if;
  idx:=(p_data->>'index')::integer;expected:=a.expected_parts->idx;
  if idx<0 or expected is null then raise exception 'invalid_part_index' using errcode='22023';end if;
  select * into part from public.assessment_artifact_parts where artifact_id=a.id and index=idx;
  if p_action='chunk.authorize' then
   if a.state='cancelled' or (part.artifact_id is null and (a.state<>'uploading' or a.upload_expires_at<=clock_timestamp())) then raise exception 'upload_not_active' using errcode='23514';end if;
   return jsonb_build_object('artifact_id',a.id,'tenant_id',a.tenant_id,'index',idx,'sha256',expected->>'sha256','byte_length',expected->'byte_length','receipt',case when part.artifact_id is null then null else to_jsonb(part) end);
  end if;
  if p_data->>'sha256' is distinct from expected->>'sha256' or jsonb_typeof(p_data->'byte_length') is distinct from 'number' or (p_data->>'byte_length')::numeric<>(expected->>'byte_length')::numeric then raise exception 'part_manifest_conflict' using errcode='23505';end if;
  if part.artifact_id is not null then return to_jsonb(part);end if;
  if a.state<>'uploading' or a.upload_expires_at<=clock_timestamp() then raise exception 'upload_not_active' using errcode='23514';end if;
  if p_data->>'object_key' is distinct from ('assessment/'||p_tenant||'/'||a.id||'/'||idx||'/'||(expected->>'sha256')) or coalesce(length(p_data->>'key_id'),0) not between 1 and 80 or coalesce(length(p_data->>'etag'),0) not between 1 and 200 then raise exception 'invalid_storage_receipt' using errcode='22023';end if;
  insert into public.assessment_artifact_parts(tenant_id,artifact_id,index,sha256,byte_length,cipher_sha256,iv,key_id,object_key,etag) values(p_tenant,a.id,idx,p_data->>'sha256',(expected->>'byte_length')::integer,p_data->>'cipher_sha256',p_data->>'iv',p_data->>'key_id',p_data->>'object_key',p_data->>'etag') returning * into part;return to_jsonb(part);
 elsif p_action='upload.complete' then
  if a.manifest is not null then return jsonb_build_object('id',a.id,'state',a.state,'manifest_hash',a.manifest_hash);end if;
  if a.state<>'uploading' or a.upload_expires_at<=clock_timestamp() then raise exception 'upload_not_active' using errcode='23514';end if;
  if (select count(*) from public.assessment_artifact_parts where artifact_id=a.id)<>jsonb_array_length(a.expected_parts) then raise exception 'artifact_parts_missing' using errcode='23514';end if;
  select jsonb_agg(jsonb_build_object('index',p.index,'sha256',p.sha256,'byte_length',p.byte_length,'cipher_sha256',p.cipher_sha256,'iv',p.iv,'key_id',p.key_id,'object_key',p.object_key,'etag',p.etag) order by p.index) into parts from public.assessment_artifact_parts p where artifact_id=a.id;
  update public.assessment_artifacts set state='quarantined',manifest=parts,manifest_hash=encode(sha256(convert_to(parts::text,'UTF8')),'hex'),completed_at=clock_timestamp() where id=a.id returning * into a;
  insert into public.assessment_artifact_scan_jobs(tenant_id,artifact_id) values(p_tenant,a.id);
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'answer.upload.complete',a.id,jsonb_build_object('content_hash',b.content_hash,'manifest_hash',a.manifest_hash));
  return jsonb_build_object('id',a.id,'state',a.state,'manifest_hash',a.manifest_hash);
 end if;raise exception 'unknown_artifact_transport' using errcode='22023';
end;$$;

-- A task's immutable answer stays an opaque reference; scan readiness is a
-- current projection. Never copy the candidate or original filename to markers.
alter function public.assessment_grading_read(uuid,uuid,text,uuid,uuid,integer) rename to assessment_grading_read_pre_media;
create function public.assessment_grading_read(p_actor uuid,p_tenant uuid,p_kind text,p_id uuid default null,p_after uuid default null,p_limit integer default 100) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;asset jsonb;begin
 result:=public.assessment_grading_read_pre_media(p_actor,p_tenant,p_kind,p_id,p_after,p_limit);
 if p_kind='task' and result#>>'{response,schema_version}'='assessment.media-answer.v1' then
  select jsonb_build_object('id',a.id,'mime',a.mime,'kind',a.kind,'byte_length',a.byte_length,'state',a.state) into asset from public.assessment_artifacts a join public.assessment_answer_assets b on b.artifact_id=a.id join public.assessment_grading_tasks task on task.id=p_id join public.assessment_grading_runs r on r.id=task.run_id where a.id=(result#>>'{response,artifact_id}')::uuid and a.tenant_id=p_tenant and b.attempt_id=r.attempt_id and b.item_version_id=task.item_version_id and b.content_hash=result#>>'{response,content_hash}';
  result:=result||jsonb_build_object('answer_asset',asset,'can_mark',coalesce((result->>'can_mark')::boolean,false) and coalesce(asset->>'state'='ready',false),'can_adjudicate',coalesce((result->>'can_adjudicate')::boolean,false) and coalesce(asset->>'state'='ready',false));
 end if;return result;
end;$$;
create function public.assessment_media_mark_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$declare task public.assessment_grading_tasks;begin
 if tg_table_name='assessment_grading_marks' then select t.* into task from public.assessment_grading_tasks t join public.assessment_grading_assignments a on a.task_id=t.id where a.id=new.assignment_id;
 else select * into task from public.assessment_grading_tasks where id=new.task_id;end if;
 if task.response_snapshot->>'schema_version'='assessment.media-answer.v1' and not exists(select 1 from public.assessment_artifacts a join public.assessment_answer_assets b on b.artifact_id=a.id join public.assessment_grading_runs r on r.id=task.run_id where a.id=(task.response_snapshot->>'artifact_id')::uuid and a.tenant_id=task.tenant_id and a.state='ready' and b.attempt_id=r.attempt_id and b.item_version_id=task.item_version_id and b.content_hash=task.response_snapshot->>'content_hash') then raise exception 'academic_answer_not_ready' using errcode='23514';end if;return new;
end;$$;
create trigger academic_answer_ready before insert on public.assessment_grading_marks for each row execute function public.assessment_media_mark_guard();
create trigger academic_answer_ready before insert on public.assessment_grading_adjudications for each row execute function public.assessment_media_mark_guard();

do $$declare f text;begin
 foreach f in array array['assessment_answer_read(uuid,uuid,uuid,uuid)','assessment_answer_command(uuid,uuid,text,text,jsonb)','assessment_artifact_command(uuid,uuid,text,text,jsonb)','assessment_artifact_transport(uuid,uuid,text,jsonb)','assessment_grading_read(uuid,uuid,text,uuid,uuid,integer)'] loop execute 'revoke all on function public.'||f||' from public,anon,authenticated';execute 'grant execute on function public.'||f||' to service_role';end loop;
 foreach f in array array['assessment_answer_binding_guard()','assessment_media_policy_valid(jsonb,text)','assessment_media_item_guard()','assessment_media_response_guard()','assessment_media_mark_guard()','assessment_prompt_artifact_command(uuid,uuid,text,text,jsonb)','assessment_prompt_artifact_transport(uuid,uuid,text,jsonb)','assessment_grading_read_pre_media(uuid,uuid,text,uuid,uuid,integer)'] loop execute 'revoke all on function public.'||f||' from public,anon,authenticated,service_role';end loop;
end;$$;
commit;
