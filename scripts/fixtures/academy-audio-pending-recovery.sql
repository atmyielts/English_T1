begin;
do $fixture$
declare actor uuid:=gen_random_uuid();student uuid:=gen_random_uuid();peer uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();branch uuid:=gen_random_uuid();classroom uuid:=gen_random_uuid();
 child uuid:=gen_random_uuid();other_child uuid:=gen_random_uuid();assignment uuid:=gen_random_uuid();result jsonb;again jsonb;feedback jsonb;payload jsonb;audio uuid;submission uuid;count_value integer;row_value jsonb;seen uuid[]:='{}';cursor_value jsonb:='{}';pages integer:=0;
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select id,id||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned audio fixture"}' from unnest(array[actor,student,peer]) id;
 insert into public.tenants(id,name,slug,type,created_by) values(academy,'Owned audio Academy',academy::text,'team',actor);
 insert into public.tenant_memberships(tenant_id,user_id,role,status) values(academy,actor,'owner','active');
 insert into public.academy_branches(id,academy_id,branch_key,name,timezone,is_default) values(branch,academy,'owned-audio','Owned audio branch','Asia/Tashkent',true);
 insert into public.academy_classrooms(id,academy_id,branch_id,name,created_by) values(classroom,academy,branch,'Owned audio class',actor);
 insert into public.academy_contacts(id,academy_id,primary_branch_id,user_id,first_name,email,status,created_by)
 values(child,academy,branch,student,'Owned student',student||'@example.invalid','active',actor),(other_child,academy,branch,peer,'Owned peer',peer||'@example.invalid','active',actor);
 insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status)
 values(academy,classroom,child,'student','active'),(academy,classroom,other_child,'student','active');
 insert into public.academy_assignments(id,academy_id,classroom_id,title,status,attempts_allowed,allow_late_submission,created_by)
 values(assignment,academy,classroom,'Owned spoken response','active',2,true,actor);
 payload:=jsonb_build_object('assignment_id',assignment,'kind','submission','content_hash',repeat('a',64),'mime_type','audio/webm','size_bytes',1000,'text_context','Equivalent written response for the owned recording');
 result:=public.academy_audio_command(academy,student,'reserve',payload,'owned-audio-one');audio:=(result->'audio'->>'id')::uuid;
 again:=public.academy_audio_command(academy,student,'reserve',payload,'owned-audio-one');
 if result->'audio'->>'id'<>again->'audio'->>'id' then raise exception 'Audio reserve replay created a second object';end if;
 begin perform public.academy_audio_command(academy,student,'reserve',payload||jsonb_build_object('content_hash',repeat('b',64)),'owned-audio-one');raise exception 'Different audio reused a retry key';exception when unique_violation then null;end;
 begin perform public.academy_audio_command(academy,peer,'commit',jsonb_build_object('audio_id',audio,'object_key',result->'audio'->>'object_key','bucket','academy-assignment-audio-private-v1'),'owned-audio-one');raise exception 'Peer finalized another student recording';exception when insufficient_privilege then null;end;
 result:=public.academy_audio_command(academy,student,'commit',jsonb_build_object('audio_id',audio,'object_key',result->'audio'->>'object_key','bucket','academy-assignment-audio-private-v1'),'owned-audio-one');submission:=(result->'audio'->>'submission_id')::uuid;
 if (select submission_content from public.academy_submissions where id=submission) is not null then raise exception 'Private transcript leaked into legacy submissions';end if;
 if (select submission_content from public.academy_submissions where id=submission) is not null then raise exception 'Private transcript leaked into legacy submissions';end if;
 if result->'audio'->>'attempt_number'<>'1' or result->'audio'->>'state'<>'committed' then raise exception 'Audio commit did not persist one attempt';end if;
 again:=public.academy_audio_command(academy,student,'commit',jsonb_build_object('audio_id',audio,'object_key','academy/'||academy||'/private-audio/'||audio,'bucket','academy-assignment-audio-private-v1'),'owned-audio-one');
 if again->>'replayed'<>'true' or(select attempt_number from public.academy_submissions where id=submission)<>1 then raise exception 'Audio response replay consumed another attempt';end if;
 feedback:=public.academy_audio_command(academy,actor,'reserve',jsonb_build_object('assignment_id',assignment,'submission_id',submission,'kind','feedback','expected_attempt_number',1,'content_hash',repeat('c',64),'mime_type','audio/ogg','size_bytes',2000,'text_context','Equivalent teacher feedback transcript'),'owned-feedback');
 feedback:=public.academy_audio_command(academy,actor,'commit',jsonb_build_object('audio_id',feedback->'audio'->>'id','object_key',feedback->'audio'->>'object_key','bucket','academy-assignment-audio-private-v1'),'owned-feedback');
 result:=public.academy_audio_command(academy,student,'list',jsonb_build_object('assignment_id',assignment,'kind','submission'),null);
 if jsonb_array_length(result->'recordings')<>2 or result->'recordings'->0?'object_key' or result->'recordings'->0?'bucket' then raise exception 'Student audio history omitted feedback or leaked storage coordinates';end if;
 result:=public.academy_audio_command(academy,student,'playback',jsonb_build_object('audio_id',feedback->'audio'->>'id'),null);
 if result->'audio'->>'submission_id'<>submission::text then raise exception 'Student cannot listen to own teacher feedback';end if;
 begin perform public.academy_audio_command(academy,peer,'playback',jsonb_build_object('audio_id',audio),null);raise exception 'Peer listened to another student audio';exception when insufficient_privilege then null;end;
 begin perform public.academy_audio_command(academy,peer,'reserve',jsonb_build_object('assignment_id',assignment,'submission_id',submission,'kind','feedback','expected_attempt_number',1,'content_hash',repeat('d',64),'mime_type','audio/ogg','size_bytes',2000,'text_context','Forged feedback'),'owned-peer-feedback');raise exception 'Student forged teacher feedback';exception when insufficient_privilege then null;end;
 update public.academy_classroom_memberships set status='transferred' where academy_id=academy and contact_id=child;
 perform public.academy_audio_command(academy,student,'playback',jsonb_build_object('audio_id',feedback->'audio'->>'id'),null);
 begin perform public.academy_audio_command(academy,student,'reserve',jsonb_build_object('assignment_id',assignment,'kind','submission','content_hash',repeat('e',64),'mime_type','audio/webm','size_bytes',1000,'text_context','Transferred upload'),'owned-transferred-audio');raise exception 'Transferred enrollment submitted another recording';exception when insufficient_privilege then null;end;
 update public.academy_classroom_memberships set status='active' where academy_id=academy and contact_id=child;
 update public.academy_contacts set status='paused' where id=child;
 begin perform public.academy_audio_command(academy,student,'reserve',jsonb_build_object('assignment_id',assignment,'kind','submission','content_hash',repeat('e',64),'mime_type','audio/webm','size_bytes',1000,'text_context','Paused upload'),'owned-paused-audio');raise exception 'Paused student uploaded a new attempt';exception when insufficient_privilege then null;end;
 perform public.academy_audio_command(academy,student,'list',jsonb_build_object('assignment_id',assignment,'kind','submission'),null);
 -- Tied historical timestamps must traverse without repetition or omission.
 with ids as materialized(select gen_random_uuid() id,i from generate_series(1,205) i)
 insert into public.academy_assignment_audio(id,academy_id,assignment_id,classroom_id,contact_id,actor_id,submission_id,kind,request_key,payload,text_context,content_hash,mime_type,size_bytes,object_key,bucket,state,attempt_number,committed_at)
 select id,academy,assignment,classroom,child,actor,submission,'feedback','owned-audio-page-'||i,'{}','Owned retained feedback '||i,repeat('a',64),'audio/webm',1000,'academy/'||academy||'/private-audio/'||id,'academy-assignment-audio-private-v1','committed',1,'2020-01-01T00:00:00Z' from ids;
 loop
  result:=public.academy_audio_command(academy,student,'list',jsonb_build_object('assignment_id',assignment,'kind','submission')||cursor_value,null);pages:=pages+1;
  for row_value in select value from jsonb_array_elements(result->'recordings') loop
   if(row_value->>'id')::uuid=any(seen) then raise exception 'Audio history repeated a record';end if;seen:=seen||(row_value->>'id')::uuid;
  end loop;
  exit when not(result->>'has_more')::boolean;
  if pages>4 then raise exception 'Audio history did not finish';end if;cursor_value:=result->'cursor';
 end loop;
 if cardinality(seen)<>207 or pages<>3 then raise exception 'Audio history skipped retained feedback';end if;
 -- Feedback must remain pinned to the attempt reviewed by the teacher.
 update public.academy_contacts set status='active' where id=child;
 feedback:=public.academy_audio_command(academy,actor,'reserve',jsonb_build_object('assignment_id',assignment,'submission_id',submission,'kind','feedback','expected_attempt_number',1,'content_hash',repeat('f',64),'mime_type','audio/ogg','size_bytes',2000,'text_context','Feedback reserved against attempt one'),'owned-stale-feedback');
 update public.academy_submissions set score=75,feedback='{"comment":"Earlier grade"}',notes='Earlier teacher note',submission_content='Earlier written response' where id=submission;
 result:=public.academy_audio_command(academy,student,'reserve',payload,'owned-audio-two');
 result:=public.academy_audio_command(academy,student,'commit',jsonb_build_object('audio_id',result->'audio'->>'id','object_key',result->'audio'->>'object_key','bucket','academy-assignment-audio-private-v1'),'owned-audio-two');
 if result->'audio'->>'attempt_number'<>'2' or (select previous_submission_snapshot->>'score' from public.academy_assignment_audio where id=(result->'audio'->>'id')::uuid)<>'75' then raise exception 'New audio discarded the previous grade snapshot';end if;
 if (select score is not null or graded_at is not null or submission_content<>'Earlier written response' from public.academy_submissions where id=submission) then raise exception 'New audio inherited its prior grade or replaced earlier writing';end if;
 begin perform public.academy_audio_command(academy,actor,'commit',jsonb_build_object('audio_id',feedback->'audio'->>'id','object_key',feedback->'audio'->>'object_key','bucket','academy-assignment-audio-private-v1'),'owned-stale-feedback');raise exception 'Feedback changed to the new student attempt';exception when unique_violation then null;end;
 begin perform public.academy_assignment_written_command(academy,student,assignment,'{"submission_content":"Attempt over limit","metadata":{"response_kind":"text"}}');raise exception 'Written submission ignored the audio attempt counter';exception when unique_violation then null;end;
 perform public.academy_assignment_written_command(academy,peer,assignment,'{"submission_content":"Owned written response","metadata":{"response_kind":"text"}}');
 if (select attempt_number from public.academy_submissions where assignment_id=assignment and contact_id=other_child)<>1 then raise exception 'Written atomic command did not create an attempt';end if;
 begin update public.academy_assignment_audio set text_context='Changed institutional feedback' where id=audio;raise exception 'Committed audio history was rewritten';exception when check_violation then null;end;
 if (select public from storage.buckets where id='academy-assignment-audio-private-v1') is distinct from false then raise exception 'Audio bucket is public';end if;
 if has_table_privilege('authenticated','public.academy_assignment_audio','SELECT') or has_function_privilege('authenticated','public.academy_audio_command(uuid,uuid,text,jsonb,text)','EXECUTE') then raise exception 'Browser role bypasses the audio gateway';end if;
end;$fixture$;

do $recovery$
declare ctx record;followup uuid:=gen_random_uuid();result jsonb;audio_id uuid;before_count integer;
begin
 select a.academy_id academy,a.actor_id teacher,a.assignment_id assignment,a.classroom_id classroom,a.contact_id contact,a.submission_id submission,c.user_id student into ctx from public.academy_assignment_audio a join public.academy_contacts c on c.id=a.contact_id where a.request_key='owned-feedback';
 insert into public.academy_assignment_audio(id,academy_id,assignment_id,classroom_id,contact_id,actor_id,submission_id,kind,request_key,payload,text_context,content_hash,mime_type,size_bytes,object_key,attempt_number)
 select id,ctx.academy,ctx.assignment,ctx.classroom,ctx.contact,ctx.teacher,ctx.submission,'feedback','owned-obsolete-feedback-'||i,'{}','Owned obsolete attempt feedback',repeat('a',64),'audio/webm',1000,'academy/'||ctx.academy||'/private-audio/'||id,1 from(select gen_random_uuid() id,i from generate_series(1,3) i) ids;
 select count(*) into before_count from public.academy_assignment_audio where academy_id=ctx.academy and actor_id=ctx.teacher and state='reserved';
 if before_count<3 or public.academy_audio_pending_count(ctx.academy,ctx.teacher,public.academy_current_authorities(ctx.academy,ctx.teacher))<>0 then raise exception 'Obsolete attempt feedback still consumes the pending budget';end if;
 result:=public.academy_audio_command(ctx.academy,ctx.teacher,'reserve',jsonb_build_object('assignment_id',ctx.assignment,'submission_id',ctx.submission,'kind','feedback','expected_attempt_number',2,'content_hash',repeat('b',64),'mime_type','audio/ogg','size_bytes',1000,'text_context','Owned current attempt feedback'),'owned-recovered-feedback');
 if public.academy_audio_pending_count(ctx.academy,ctx.teacher,public.academy_current_authorities(ctx.academy,ctx.teacher))<>1 then raise exception 'Current recoverable feedback stopped consuming a slot';end if;
 perform public.academy_audio_command(ctx.academy,ctx.teacher,'commit',jsonb_build_object('audio_id',result->'audio'->>'id','object_key',result->'audio'->>'object_key','bucket','academy-assignment-audio-private-v1'),'owned-recovered-feedback');
 if(select count(*) from public.academy_assignment_audio where academy_id=ctx.academy and actor_id=ctx.teacher and state='reserved')<>before_count then raise exception 'Recovery erased obsolete feedback instead of retaining it';end if;
 update public.academy_assignments set status='archived' where id=ctx.assignment;
 insert into public.academy_assignment_audio(id,academy_id,assignment_id,classroom_id,contact_id,actor_id,kind,request_key,payload,text_context,content_hash,mime_type,size_bytes,object_key)
 select id,ctx.academy,ctx.assignment,ctx.classroom,ctx.contact,ctx.student,'submission','owned-obsolete-student-'||i,'{}','Owned closed assignment pending recording',repeat('a',64),'audio/webm',1000,'academy/'||ctx.academy||'/private-audio/'||id from(select gen_random_uuid() id,i from generate_series(1,3) i) ids;
 insert into public.academy_assignments(id,academy_id,classroom_id,title,status,attempts_allowed,allow_late_submission,created_by) values(followup,ctx.academy,ctx.classroom,'Owned followup recording','active',4,true,ctx.teacher);
 result:=public.academy_audio_command(ctx.academy,ctx.student,'reserve',jsonb_build_object('assignment_id',followup,'kind','submission','content_hash',repeat('c',64),'mime_type','audio/webm','size_bytes',1000,'text_context','Owned current task recording'),'owned-recovered-student');
 if public.academy_audio_pending_count(ctx.academy,ctx.student,public.academy_current_authorities(ctx.academy,ctx.student))<>1 then raise exception 'Closed assignment recordings still block a new student task';end if;
 for counter in 2..3 loop perform public.academy_audio_command(ctx.academy,ctx.student,'reserve',jsonb_build_object('assignment_id',followup,'kind','submission','content_hash',repeat('c',64),'mime_type','audio/webm','size_bytes',1000,'text_context','Owned current task recording'),'owned-current-slot-'||counter);end loop;
 begin perform public.academy_audio_command(ctx.academy,ctx.student,'reserve',jsonb_build_object('assignment_id',followup,'kind','submission','content_hash',repeat('d',64),'mime_type','audio/webm','size_bytes',1000,'text_context','Owned fourth current pending task'),'owned-current-fourth');raise exception 'Recovery removed the three-current-upload bound';exception when unique_violation then null;end;
 update public.tenant_memberships set status='disabled' where tenant_id=ctx.academy and user_id=ctx.teacher;
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,starts_at,expires_at)
 values(ctx.academy,ctx.teacher,ctx.teacher||'+scoped@example.invalid','teacher','classrooms',jsonb_build_array(ctx.classroom),'active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 minutes');
 result:=public.academy_audio_command(ctx.academy,ctx.teacher,'reserve',jsonb_build_object('assignment_id',ctx.assignment,'submission_id',ctx.submission,'kind','feedback','expected_attempt_number',2,'content_hash',repeat('f',64),'mime_type','audio/ogg','size_bytes',1000,'text_context','Owned scoped pending feedback'),'owned-scoped-current-feedback');
 if public.academy_audio_pending_count(ctx.academy,ctx.teacher,public.academy_current_authorities(ctx.academy,ctx.teacher))<>1 then raise exception 'Current assigned teacher reservations bypassed the pending budget';end if;
 update public.academy_role_grants set status='revoked' where academy_id=ctx.academy and user_id=ctx.teacher;
 if public.academy_audio_pending_count(ctx.academy,ctx.teacher,public.academy_current_authorities(ctx.academy,ctx.teacher))<>0 then raise exception 'Unassigned feedback permanently consumes the actor budget';end if;
 begin perform public.academy_audio_command(ctx.academy,ctx.teacher,'reserve',jsonb_build_object('assignment_id',ctx.assignment,'submission_id',ctx.submission,'kind','feedback','expected_attempt_number',2,'content_hash',repeat('f',64),'mime_type','audio/ogg','size_bytes',1000,'text_context','Owned revoked teacher feedback'),'owned-revoked-slot');raise exception 'Budget recovery promoted a revoked teacher';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','public.academy_audio_pending_count(uuid,uuid,jsonb)','EXECUTE') then raise exception 'Browser can forge a pending audio authority snapshot';end if;
end;$recovery$;
rollback;
select 'audio-pending-recovery-captured-schema-ok';
