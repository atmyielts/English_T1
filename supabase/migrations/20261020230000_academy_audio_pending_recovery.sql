-- Pending uploads that can no longer commit must not consume all of an actor's
-- reservation slots. Keep their immutable bytes/metadata and retry identity.
begin;
create index academy_audio_pending_actor on public.academy_assignment_audio(academy_id,actor_id) where state='reserved';
create function public.academy_audio_pending_count(p_academy uuid,p_actor uuid,p_authorities jsonb)
returns integer language sql stable set search_path=public as $$
 select count(*)::integer
 from public.academy_assignment_audio a
 join public.academy_assignments assignment on assignment.academy_id=a.academy_id and assignment.id=a.assignment_id and assignment.classroom_id=a.classroom_id
 join public.academy_classrooms classroom on classroom.academy_id=a.academy_id and classroom.id=a.classroom_id
 join public.academy_contacts contact on contact.academy_id=a.academy_id and contact.id=a.contact_id and contact.status in('active','trial','paused')
 left join public.academy_submissions submission on submission.academy_id=a.academy_id and submission.assignment_id=a.assignment_id and submission.contact_id=a.contact_id
 where a.academy_id=p_academy and a.actor_id=p_actor and a.state='reserved'
 and exists(select 1 from public.academy_classroom_memberships m where m.academy_id=a.academy_id and m.classroom_id=a.classroom_id and m.contact_id=a.contact_id and m.role='student'
  and((a.kind='feedback' and m.status in('active','paused','completed')) or(a.kind='submission' and m.status='active')))
 and case when a.kind='feedback' then
  submission.id=a.submission_id and submission.attempt_number=a.attempt_number
  and public.academy_command_covers(p_authorities,'gradeSubmissions',jsonb_build_object('kind','classroom','classroom_id',classroom.id,'branch_id',classroom.branch_id,'active',classroom.is_active))
 else contact.user_id=p_actor and contact.status in('active','trial') and assignment.status='active'
  and(assignment.released_at is null or assignment.released_at<=clock_timestamp())
  and(assignment.due_at is null or assignment.due_at>=clock_timestamp() or assignment.allow_late_submission)
  and coalesce(submission.attempt_number,0)<assignment.attempts_allowed
 end
$$;
revoke all on function public.academy_audio_pending_count(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_audio_command(p_academy uuid,p_actor uuid,p_command text,p_payload jsonb,p_request_key text default null)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='30s' as $$
declare context jsonb;audio public.academy_assignment_audio;assignment public.academy_assignments;submission public.academy_submissions;target uuid;kind text;rows_value jsonb;next_attempt integer;previous_value jsonb:='{}';
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or p_command not in('reserve','commit','list','playback') then raise exception using errcode='22023',message='Choose a valid audio action';end if;
 if p_command in('reserve','list') then
  kind:=p_payload->>'kind';target:=(p_payload->>'assignment_id')::uuid;
  context:=public.academy_audio_context(p_academy,p_actor,target,case when p_command='list' then 'submission' else kind end,nullif(p_payload->>'submission_id','')::uuid,false);
 else
  perform public.academy_current_authorities(p_academy,p_actor);
  select * into audio from public.academy_assignment_audio where academy_id=p_academy and id=(p_payload->>'audio_id')::uuid for update;
  if not found then raise exception using errcode='42501',message='This recording is unavailable';end if;
  kind:=audio.kind;target:=audio.assignment_id;
  if p_command='commit' and kind='submission' then perform pg_advisory_xact_lock(hashtextextended('assignment-submission:'||target::text||':'||audio.contact_id::text,0));end if;
  -- Students may listen to teacher feedback on their own submission. The
  -- returned subject is independently compared with the stored audio below.
  context:=public.academy_audio_context(p_academy,p_actor,target,case when p_command='playback' then 'submission' else kind end,audio.submission_id,p_command='commit' and audio.state<>'committed');
  if context->>'contact_id'<>audio.contact_id::text or context->>'classroom_id'<>audio.classroom_id::text then raise exception using errcode='42501',message='This recording is outside the current student or classroom';end if;
 end if;
 if p_command='reserve' then
  if coalesce(p_request_key,'') !~ '^[A-Za-z0-9_.:-]{1,160}$' or p_payload->>'content_hash' !~ '^[a-f0-9]{64}$'
   or coalesce(length(trim(p_payload->>'text_context')),0) not between 1 and 10000 or(p_payload->>'size_bytes')::integer not between 1 and 20971520
   or p_payload->>'mime_type' not in('audio/webm','audio/ogg','audio/mp4','audio/wav','audio/mpeg') then raise exception using errcode='22023',message='Provide a supported recording and short text context';end if;
  perform pg_advisory_xact_lock(hashtextextended('academy-audio:'||p_academy::text||':'||p_actor::text||':'||p_request_key,0));
  select * into audio from public.academy_assignment_audio where academy_id=p_academy and actor_id=p_actor and request_key=p_request_key;
  if found then
   if audio.payload is distinct from p_payload then raise exception using errcode='23505',message='This recording retry belongs to different content';end if;
  else
   perform public.academy_audio_context(p_academy,p_actor,target,kind,nullif(p_payload->>'submission_id','')::uuid,true);
   perform pg_advisory_xact_lock(hashtextextended('audio-upload-budget:'||p_academy::text||':'||p_actor::text,0));
   if public.academy_audio_pending_count(p_academy,p_actor,public.academy_current_authorities(p_academy,p_actor))>=3 then raise exception using errcode='23505',message='Finish the pending recordings before uploading another';end if;
   if kind='submission' then
    select * into assignment from public.academy_assignments where academy_id=p_academy and id=target for share;
    if coalesce((select attempt_number from public.academy_submissions where academy_id=p_academy and assignment_id=target and contact_id=(context->>'contact_id')::uuid),0)>=assignment.attempts_allowed then raise exception using errcode='23505',message='No assignment attempts remain';end if;
   else
    select * into submission from public.academy_submissions where academy_id=p_academy and id=(context->>'submission_id')::uuid for share;
    if coalesce((p_payload->>'expected_attempt_number')::integer,0)<>submission.attempt_number then raise exception using errcode='23505',message='The student submitted another attempt; review it before feedback';end if;
   end if;
   audio.id:=gen_random_uuid();
   insert into public.academy_assignment_audio(id,academy_id,assignment_id,classroom_id,contact_id,actor_id,submission_id,kind,request_key,payload,text_context,content_hash,mime_type,size_bytes,object_key,attempt_number)
    values(audio.id,p_academy,target,(context->>'classroom_id')::uuid,(context->>'contact_id')::uuid,p_actor,nullif(context->>'submission_id','')::uuid,kind,p_request_key,p_payload,trim(p_payload->>'text_context'),p_payload->>'content_hash',p_payload->>'mime_type',(p_payload->>'size_bytes')::integer,'academy/'||p_academy||'/private-audio/'||audio.id,case when kind='feedback' then submission.attempt_number else null end)
    returning * into audio;
  end if;
 elsif p_command='commit' then
  if audio.actor_id<>p_actor or audio.request_key is distinct from p_request_key or p_payload->>'object_key' is distinct from audio.object_key then raise exception using errcode='42501',message='This upload belongs to another account';end if;
  if audio.state='committed' then return jsonb_build_object('actor_id',p_actor,'audio',to_jsonb(audio)-array['payload','object_key','bucket','content_hash','previous_submission_snapshot'],'replayed',true);end if;
  if p_payload->>'bucket' is distinct from 'academy-assignment-audio-private-v1' then raise exception using errcode='22023',message='Private upload storage is unavailable';end if;
  if kind='submission' then
   perform pg_advisory_xact_lock(hashtextextended('assignment-submission:'||target::text||':'||audio.contact_id::text,0));
   select * into assignment from public.academy_assignments where academy_id=p_academy and id=target for share;
   select * into submission from public.academy_submissions where academy_id=p_academy and assignment_id=target and contact_id=audio.contact_id for update;
   if submission.id is not null then previous_value:=to_jsonb(submission);end if;
   next_attempt:=coalesce(submission.attempt_number,0)+1;
   if next_attempt>assignment.attempts_allowed then raise exception using errcode='23505',message='No assignment attempts remain';end if;
   insert into public.academy_submissions(academy_id,assignment_id,classroom_id,contact_id,user_id,status,attempt_number,submitted_at,metadata,max_score)
    values(p_academy,target,audio.classroom_id,audio.contact_id,p_actor,case when assignment.due_at<clock_timestamp() then 'late' else 'submitted' end,next_attempt,clock_timestamp(),jsonb_build_object('response_kind','audio'),assignment.max_score)
    on conflict(assignment_id,contact_id) do update set status=case when excluded.status='late' then 'late' else 'resubmitted' end,attempt_number=excluded.attempt_number,submitted_at=excluded.submitted_at,updated_at=clock_timestamp(),
     score=null,feedback='{}',graded_at=null,graded_by=null,notes=null,metadata=coalesce(academy_submissions.metadata,'{}')||excluded.metadata
    returning * into submission;
  else
   select * into submission from public.academy_submissions where academy_id=p_academy and id=audio.submission_id for share;
   if submission.attempt_number is distinct from audio.attempt_number then raise exception using errcode='23505',message='The student submitted another attempt; review it before feedback';end if;
  end if;
  update public.academy_assignment_audio set state='committed',bucket=p_payload->>'bucket',submission_id=submission.id,attempt_number=submission.attempt_number,previous_submission_snapshot=previous_value,committed_at=clock_timestamp() where id=audio.id returning * into audio;
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,classroom_id,metadata)
   values(p_academy,p_actor,'assignment.audio_'||kind,'academy_assignment_audio',audio.id::text,audio.contact_id,audio.classroom_id,jsonb_build_object('request_key',p_request_key,'submission_id',audio.submission_id,'attempt_number',audio.attempt_number));
  perform public.academy_audio_context(p_academy,p_actor,target,kind,audio.submission_id,true);
 elsif p_command='list' then
  if(p_payload->>'before_time' is null) is distinct from(p_payload->>'before_id' is null) then raise exception using errcode='22023',message='Choose a complete audio history cursor';end if;
  select coalesce(jsonb_agg(to_jsonb(t)-array['payload','object_key','bucket','content_hash','previous_submission_snapshot'] order by t.committed_at desc,t.id desc),'[]') into rows_value
   from(select * from public.academy_assignment_audio where academy_id=p_academy and assignment_id=target and classroom_id=(context->>'classroom_id')::uuid and contact_id=(context->>'contact_id')::uuid and state='committed'
    and(p_payload->>'before_time' is null or(committed_at,id)<((p_payload->>'before_time')::timestamptz,(p_payload->>'before_id')::uuid)) order by committed_at desc,id desc limit 101) t;
  perform public.academy_audio_context(p_academy,p_actor,target,'submission',nullif(p_payload->>'submission_id','')::uuid,false);
  return jsonb_build_object('actor_id',p_actor,'assignment_id',target,'contact_id',context->>'contact_id','recordings',case when jsonb_array_length(rows_value)>100 then rows_value-100 else rows_value end,
   'has_more',jsonb_array_length(rows_value)>100,'cursor',case when jsonb_array_length(rows_value)>100 then jsonb_build_object('before_time',rows_value->99->'committed_at','before_id',rows_value->99->'id') else null end);
 elsif audio.state<>'committed' then raise exception using errcode='23505',message='This recording has not finished uploading';
 end if;
 if p_command='reserve' then perform public.academy_audio_context(p_academy,p_actor,target,kind,nullif(p_payload->>'submission_id','')::uuid,audio.state<>'committed');end if;
 -- Storage coordinates are returned only to the authenticated gateway, never
 -- included in browser list/commit responses or accepted from browser metadata.
 return jsonb_build_object('actor_id',p_actor,'audio',case when p_command='playback' then to_jsonb(audio)-'payload' else to_jsonb(audio)-array['payload','content_hash'] end,'replayed',false);
end;$$;
revoke all on function public.academy_audio_command(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_audio_command(uuid,uuid,text,jsonb,text) to service_role;
commit;
