\set ON_ERROR_STOP on
do $$declare candidate uuid:='00000000-0000-4000-8000-000000000003';t uuid:='10000000-0000-4000-8000-000000000001';a public.assessment_attempts;asset public.assessment_artifacts;b public.assessment_answer_assets;data jsonb;receipt jsonb;expired uuid;begin
 select x.* into a from public.assessment_attempts x join public.assessment_registrations g on g.id=x.registration_id join public.assessment_exam_windows w on w.id=g.window_id where w.title='Academic answer admission race';
 select request->'data',result into data,receipt from public.assessment_answer_commands where tenant_id=t and actor_id=candidate and idempotency_key='answer-race-admission';
 data:=data||jsonb_build_object('lease',(select jsonb_build_object('device_id',device_id,'token_hash',token_hash,'epoch',epoch) from public.assessment_attempt_leases where attempt_id=a.id));
 begin perform public.assessment_answer_command(candidate,t,'answer-outside-section','upload.begin',jsonb_set(data,'{item_version_id}',to_jsonb(candidate)));raise exception 'Non-section question received upload admission';exception when no_data_found then null;end;
 update public.assessment_attempts set deadline_at=clock_timestamp()-interval '1 second',section_deadline_at=clock_timestamp()-interval '1 second' where id=a.id;
 begin perform public.assessment_answer_command(candidate,t,'answer-expired-admission','upload.begin',data);raise exception 'Unfinalized but expired clock admitted new answer';exception when check_violation then null;end;
 if public.assessment_answer_command(candidate,t,'answer-race-admission','upload.begin',data)<>receipt then raise exception 'Existing receipt could not recover beyond deadline';end if;
 perform public.assessment_artifact_transport(candidate,t,'chunk.authorize',jsonb_build_object('artifact_id',receipt->>'id','index',0));
 if exists(select 1 from public.assessment_response_journal where attempt_id=a.id) then raise exception 'Admission or recovery implicitly selected an academic answer';end if;
 select * into asset from public.assessment_artifacts where id=(receipt->>'id')::uuid;
 select * into b from public.assessment_answer_assets where artifact_id=asset.id;
 -- Privileged fixture represents an upload admitted more than 24h ago. No
 -- production command can change an expiry or introduce post-deadline content.
 insert into public.assessment_artifacts(tenant_id,created_by,filename,mime,kind,byte_length,expected_parts,purpose,upload_expires_at) values(t,candidate,asset.filename,asset.mime,asset.kind,asset.byte_length,asset.expected_parts,'answer',clock_timestamp()-interval '1 second') returning id into expired;
 insert into public.assessment_answer_assets(tenant_id,artifact_id,attempt_id,item_version_id,source,content_hash) values(t,expired,a.id,b.item_version_id,b.source,b.content_hash);
 begin perform public.assessment_artifact_transport(candidate,t,'chunk.authorize',jsonb_build_object('artifact_id',expired,'index',0));raise exception 'Expired recovery lease accepted new bytes';exception when check_violation then null;end;
 begin perform public.assessment_artifact_transport(candidate,t,'upload.complete',jsonb_build_object('artifact_id',expired));raise exception 'Expired recovery completed an upload';exception when check_violation then null;end;
 begin perform public.assessment_answer_read('00000000-0000-4000-8000-000000000004',t,a.id,b.item_version_id);raise exception 'Foreign candidate enumerated academic assets';exception when no_data_found then null;end;
 begin
  insert into public.assessment_artifacts(tenant_id,created_by,filename,mime,kind,byte_length,expected_parts,purpose) values(t,candidate,'orphan.pdf','application/pdf','file',3,asset.expected_parts,'answer');
  set constraints academic_binding_required immediate;
  raise exception 'Unbound academic artifact committed';
 exception when check_violation then null;end;
end;$$;
set constraints all immediate;
