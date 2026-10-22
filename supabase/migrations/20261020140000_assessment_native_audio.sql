begin;
-- Additive format support. Existing immutable questions, admissions, manifests,
-- response references and scan reports are not rewritten or reclassified.
create or replace function public.assessment_media_policy_valid(p jsonb,kind text) returns boolean language plpgsql immutable as $$declare mime text;source text;begin
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
  if (kind='audio_response' and mime not in('audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/mp4')) or (kind='video_response' and mime not in('video/mp4','video/webm')) or (kind='file_response' and mime not in('application/pdf','image/png','image/jpeg','image/webp')) then return false;end if;
 end loop;
 for source in select jsonb_array_elements_text(p->'sources') loop if source not in('upload','capture') or (kind='file_response' and source<>'upload') then return false;end if;end loop;
 return true;
end;$$;

-- Preserve the purpose-isolation wrapper installed by the academic-answer
-- migration. Its private prompt implementation retains all original locks,
-- authority, reservation, manifest, cancellation and stable-receipt checks.
create or replace function public.assessment_prompt_artifact_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_artifact_commands;request jsonb;result jsonb;a public.assessment_artifacts;part jsonb;pos integer:=0;bytes bigint;count integer;kind text;
begin
 if not public.assessment_has_capability(p_tenant,p_actor,'items.write') then raise exception 'forbidden' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data);perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||p_key,0));
 select * into prior from public.assessment_artifact_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='upload.begin' then
  kind:=case when p_data->>'mime' in ('image/png','image/jpeg','image/webp') then 'image' when p_data->>'mime' in ('audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/mp4') then 'audio' when p_data->>'mime' in ('video/mp4','video/webm') then 'video' when p_data->>'mime'='application/pdf' then 'file' else null end;
  if kind is null or jsonb_typeof(p_data->'filename') is distinct from 'string' or length(trim(p_data->>'filename')) not between 1 and 240 or jsonb_typeof(p_data->'byte_length') is distinct from 'number' or jsonb_typeof(p_data->'parts') is distinct from 'array' then raise exception 'invalid_artifact' using errcode='22023';end if;
  bytes:=(p_data->>'byte_length')::bigint;if bytes not between 1 and 2147483648 or bytes::numeric<>(p_data->>'byte_length')::numeric then raise exception 'invalid_artifact_size' using errcode='22023';end if;
  count:=ceil(bytes::numeric/1048576)::integer;if jsonb_array_length(p_data->'parts')<>count then raise exception 'invalid_part_manifest' using errcode='22023';end if;
  for part in select value from jsonb_array_elements(p_data->'parts') loop
   if jsonb_typeof(part->'sha256') is distinct from 'string' or (part->>'sha256') !~ '^[a-f0-9]{64}$' or jsonb_typeof(part->'byte_length') is distinct from 'number' or (part->>'byte_length')::numeric<>least(1048576,bytes-pos::bigint*1048576) then raise exception 'invalid_part_manifest' using errcode='22023';end if;pos:=pos+1;
  end loop;
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
revoke all on function public.assessment_media_policy_valid(jsonb,text),public.assessment_prompt_artifact_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
commit;
