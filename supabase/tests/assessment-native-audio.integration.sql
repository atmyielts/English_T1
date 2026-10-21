\set ON_ERROR_STOP on
begin;
do $$declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';reviewer uuid:='00000000-0000-4000-8000-000000000002';candidate uuid:='00000000-0000-4000-8000-000000000003';bank uuid;rubric uuid;mime text;policy jsonb;payload jsonb;ids jsonb:='[]';question uuid;definition jsonb;did uuid;ver uuid;win uuid;reg uuid;form jsonb;aid uuid;lease jsonb;data jsonb;reply jsonb;prior jsonb;artifact uuid;seq integer:=0;begin
 select id into bank from public.assessment_item_banks where tenant_id=t limit 1;
 select id into rubric from public.assessment_rubrics where tenant_id=t limit 1;
 foreach mime in array array['audio/webm','audio/mp4'] loop
  policy:=jsonb_build_object('schema_version','assessment.media-policy.v1','mimes',jsonb_build_array(mime),'max_bytes',1048576,'sources',jsonb_build_array('capture','upload'));
  if not public.assessment_media_policy_valid(policy,'audio_response') or public.assessment_media_policy_valid(policy,'video_response') or public.assessment_media_policy_valid(policy,'file_response') then raise exception 'Native audio policy type isolation failed';end if;
  if public.assessment_media_policy_valid(jsonb_set(policy,'{mimes}',jsonb_build_array(mime,mime)),'audio_response') or public.assessment_media_policy_valid(policy||'{"approved":true}','audio_response') then raise exception 'Native audio policy accepted duplicates or caller approval';end if;
  payload:=jsonb_build_object('schema_version','assessment.item.v1','type','audio_response','prompt','Record your spoken answer','locale','en','max_score',9,'tags','[]'::jsonb,'rubric_id',rubric,'media_response',policy);
  question:=(public.assessment_command(owner,t,'native-create-'||mime,'item.create',jsonb_build_object('bank_id',bank,'item',payload,'key','{}'::jsonb))->>'id')::uuid;
  ids:=ids||jsonb_build_array(question);
  perform public.assessment_command(owner,t,'native-submit-'||mime,'item.submit',jsonb_build_object('id',question));
  perform public.assessment_command(reviewer,t,'native-approve-'||mime,'item.approve',jsonb_build_object('id',question));
  data:=jsonb_build_object('filename','Native audio prompt','mime',mime,'byte_length',3,'parts',jsonb_build_array(jsonb_build_object('sha256',repeat('b',64),'byte_length',3)));
  reply:=public.assessment_artifact_command(owner,t,'native-prompt-'||mime,'upload.begin',data);
  artifact:=(reply->>'id')::uuid;
  if not exists(select 1 from public.assessment_artifacts a where a.id=artifact and a.mime=data->>'mime' and a.kind='audio' and a.purpose='prompt') then raise exception 'Native prompt classified incorrectly';end if;
  if public.assessment_artifact_command(owner,t,'native-prompt-'||mime,'upload.begin',data)<>reply then raise exception 'Native prompt replay changed identity';end if;
  perform public.assessment_artifact_command(owner,t,'native-prompt-cancel-'||mime,'upload.cancel',jsonb_build_object('artifact_id',artifact));
 end loop;
 definition:=jsonb_build_object('schema_version','assessment.definition.v1','title','Native spoken answers','locale','en','duration_seconds',600,'shuffle_items',false,'shuffle_options',false,'sections',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000001','title','Speaking','item_version_ids',ids,'draw_count',2)));
 did:=(public.assessment_command(owner,t,'native-definition','assessment.create',jsonb_build_object('definition',definition))->>'id')::uuid;
 ver:=(public.assessment_command(owner,t,'native-publish','assessment.publish',jsonb_build_object('id',did,'revision',1))->>'id')::uuid;
 win:=(public.assessment_command(owner,t,'native-window','window.create',jsonb_build_object('assessment_version_id',ver,'title','Native speaking sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '1 hour'))->>'id')::uuid;
 reg:=(public.assessment_command(owner,t,'native-registration','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate))->>'id')::uuid;
 form:=jsonb_build_object('schema_version','assessment.manifest.v1','assessment_version_id',ver,'duration_seconds',600,'locale','en','title','Native speaking','sections',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000001','items',(select jsonb_agg(jsonb_build_object('item_version_id',v.id,'item',v.payload)) from public.assessment_item_versions v where ids ? v.id::text))));
 aid:=(public.assessment_command(candidate,t,'native-start','attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('e',64)))->>'id')::uuid;
 lease:=public.assessment_runtime_command(candidate,t,'native-lease','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',candidate,'token_hash',repeat('a',64)));
 lease:=jsonb_build_object('device_id',candidate,'token_hash',repeat('a',64),'epoch',lease#>>'{result,epoch}');
 for question,mime in select v.id,v.payload#>>'{media_response,mimes,0}' from public.assessment_item_versions v where ids ? v.id::text loop
  data:=jsonb_build_object('attempt_id',aid,'item_version_id',question,'source','capture','lease',lease,'upload',jsonb_build_object('filename','Native audio answer','mime',mime,'byte_length',3,'parts',jsonb_build_array(jsonb_build_object('sha256',repeat('b',64),'byte_length',3))));
  reply:=public.assessment_answer_command(candidate,t,'native-admit-'||mime,'upload.begin',data);
  if public.assessment_answer_command(candidate,t,'native-admit-'||mime,'upload.begin',data)<>reply then raise exception 'Native answer replay changed binding';end if;
  if not exists(select 1 from public.assessment_artifacts a where a.id=(reply->>'id')::uuid and a.kind='audio' and a.purpose='answer' and a.mime=data#>>'{upload,mime}') then raise exception 'Native audio answer classified incorrectly';end if;
  begin perform public.assessment_artifact_command(owner,t,'native-answer-cancel-'||mime,'upload.cancel',jsonb_build_object('artifact_id',reply->>'id'));raise exception 'Native audio purpose boundary bypassed';exception when no_data_found then null;end;
 end loop;
 if (select last_sequence from public.assessment_attempts where id=aid)<>0 then raise exception 'Native format admission selected an answer';end if;
 if has_function_privilege('service_role','assessment_prompt_artifact_command(uuid,uuid,text,text,jsonb)','execute') or has_function_privilege('authenticated','assessment_media_policy_valid(jsonb,text)','execute') then raise exception 'Native audio migration exposed private helpers';end if;
end;$$;
set constraints all immediate;
rollback;
