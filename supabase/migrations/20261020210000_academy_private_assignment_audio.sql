begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('academy-assignment-audio-private-v1','academy-assignment-audio-private-v1',false,20971600,array['application/octet-stream']);
-- The bucket is private. Current Storage RLS and HTTP denial are qualified
-- before activation; no ownership or policy on the managed objects table changes.
create table public.academy_assignment_audio(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete restrict,
 assignment_id uuid not null references public.academy_assignments(id) on delete restrict,
 classroom_id uuid not null references public.academy_classrooms(id) on delete restrict,
 contact_id uuid not null references public.academy_contacts(id) on delete restrict,
 actor_id uuid not null references public.users(id) on delete restrict,
 submission_id uuid references public.academy_submissions(id) on delete restrict,
 kind text not null check(kind in('submission','feedback')),request_key text not null check(request_key ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 payload jsonb not null,text_context text not null check(length(trim(text_context)) between 1 and 10000),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),mime_type text not null,
 size_bytes integer not null check(size_bytes between 1 and 20971520),object_key text not null unique,
 bucket text,state text not null default 'reserved' check(state in('reserved','committed')),
 attempt_number integer,previous_submission_snapshot jsonb not null default '{}',created_at timestamptz not null default now(),committed_at timestamptz,
 unique(academy_id,actor_id,request_key),
 check((state='reserved' and committed_at is null) or(state='committed' and bucket is not null and submission_id is not null and attempt_number>=1 and committed_at is not null))
);
alter table public.academy_assignment_audio enable row level security;
create index academy_assignment_audio_history on public.academy_assignment_audio(academy_id,assignment_id,contact_id,committed_at desc,id desc) where state='committed';
revoke all on public.academy_assignment_audio from public,anon,authenticated;
grant all on public.academy_assignment_audio to service_role;

create function public.academy_audio_history_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' or old.state='committed' then raise exception using errcode='23514',message='Retain institutional audio history';end if;
 if(to_jsonb(old)-array['bucket','state','attempt_number','submission_id','committed_at','previous_submission_snapshot']) is distinct from(to_jsonb(new)-array['bucket','state','attempt_number','submission_id','committed_at','previous_submission_snapshot'])
  or new.state<>'committed' then raise exception using errcode='23514',message='Only a reserved audio upload may be finalized';end if;
 return new;
end;$$;
revoke all on function public.academy_audio_history_guard() from public,anon,authenticated,service_role;
create trigger academy_audio_history_immutable before update or delete on public.academy_assignment_audio for each row execute function public.academy_audio_history_guard();

-- Every operation reads current Auth/account, grant and subject membership under
-- locks. A supplied contact/actor or storage URL never establishes authority.
create function public.academy_audio_context(p_academy uuid,p_actor uuid,p_assignment uuid,p_kind text,p_submission uuid,p_write boolean)
returns jsonb language plpgsql set search_path=public as $$
declare assignment public.academy_assignments;submission public.academy_submissions;contact public.academy_contacts;auths jsonb;scope jsonb;
begin
 if p_kind not in('submission','feedback') then raise exception using errcode='22023',message='Choose an audio submission or feedback';end if;
 auths:=public.academy_current_authorities(p_academy,p_actor);
 select * into assignment from public.academy_assignments where academy_id=p_academy and id=p_assignment for share;
 if not found then raise exception using errcode='42501',message='This assignment is unavailable';end if;
 scope:=public.academy_command_resource(p_academy,'classroom',assignment.classroom_id);
 if p_kind='feedback' then
  if not public.academy_command_covers(auths,'gradeSubmissions',scope) then raise exception using errcode='42501',message='Current access does not cover this classroom feedback';end if;
  select * into submission from public.academy_submissions where academy_id=p_academy and assignment_id=p_assignment and id=p_submission for share;
  if not found then raise exception using errcode='42501',message='This student submission is unavailable';end if;
  select * into contact from public.academy_contacts where academy_id=p_academy and id=submission.contact_id for share;
 else
  perform public.academy_student_contacts_command(p_actor);
  select * into contact from public.academy_contacts c where c.academy_id=p_academy and c.user_id=p_actor and c.status in('active','trial','paused')
   and exists(select 1 from public.academy_classroom_memberships m where m.academy_id=p_academy and m.classroom_id=assignment.classroom_id and m.contact_id=c.id and m.role='student' and (m.status in('active','paused','completed') or(not p_write and m.status in('transferred','withdrawn','expired')))) order by c.id limit 1 for share;
  if contact.id is null or(not p_write and p_submission is not null and public.academy_command_covers(auths,'gradeSubmissions',scope)) then
   -- Authorized staff can listen to student submissions through the same route.
   if p_write or not public.academy_command_covers(auths,'gradeSubmissions',scope) or p_submission is null then raise exception using errcode='42501',message='This assignment is outside your enrollment';end if;
   select * into submission from public.academy_submissions where academy_id=p_academy and assignment_id=p_assignment and id=p_submission for share;
   select * into contact from public.academy_contacts where academy_id=p_academy and id=submission.contact_id for share;
  elsif p_submission is not null then
   select * into submission from public.academy_submissions where academy_id=p_academy and assignment_id=p_assignment and id=p_submission and contact_id=contact.id for share;
   if submission.id is null then raise exception using errcode='42501',message='This is another student submission';end if;
  end if;
 end if;
 if contact.id is null or(p_write and contact.status not in('active','trial','paused')) then raise exception using errcode='42501',message='This student record is unavailable';end if;
 perform 1 from public.academy_classroom_memberships where academy_id=p_academy and classroom_id=assignment.classroom_id and contact_id=contact.id and role='student'
  and(status in('active','paused','completed') or(not p_write and status in('transferred','withdrawn','expired'))) for share;
 if not found then raise exception using errcode='42501',message='This student is outside the classroom';end if;
 if p_write and p_kind='submission' then
  if contact.status='paused' or assignment.status<>'active' or(assignment.released_at is not null and assignment.released_at>clock_timestamp()) then raise exception using errcode='42501',message='This assignment is not open for submission';end if;
  perform 1 from public.academy_classroom_memberships where academy_id=p_academy and classroom_id=assignment.classroom_id and contact_id=contact.id and role='student' and status='active' for share;
  if not found then raise exception using errcode='42501',message='Active classroom enrollment is required';end if;
  if assignment.due_at<clock_timestamp() and not assignment.allow_late_submission then raise exception using errcode='23505',message='The submission window is closed';end if;
 end if;
 return jsonb_build_object('academy_id',p_academy,'assignment_id',p_assignment,'classroom_id',assignment.classroom_id,'contact_id',contact.id,'submission_id',submission.id);
end;$$;
revoke all on function public.academy_audio_context(uuid,uuid,uuid,text,uuid,boolean) from public,anon,authenticated,service_role;

create function public.academy_audio_command(p_academy uuid,p_actor uuid,p_command text,p_payload jsonb,p_request_key text default null)
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
   if(select count(*) from public.academy_assignment_audio where academy_id=p_academy and actor_id=p_actor and state='reserved')>=3 then raise exception using errcode='23505',message='Finish the pending recordings before uploading another';end if;
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

-- Written/file responses share the same lock and attempt counter as recordings.
-- The gateway supplies uploaded file metadata; the browser cannot call this RPC.
create function public.academy_assignment_written_command(p_academy uuid,p_actor uuid,p_assignment uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='30s' as $$
declare context jsonb;assignment public.academy_assignments;submission public.academy_submissions;next_attempt integer;meta jsonb;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or length(coalesce(p_payload->>'submission_content',''))>10000 or length(coalesce(p_payload->>'submission_url',''))>2000 or length(coalesce(p_payload->>'notes',''))>500 then raise exception using errcode='22023',message='Review the assignment response';end if;
 context:=public.academy_audio_context(p_academy,p_actor,p_assignment,'submission',null,false);
 perform pg_advisory_xact_lock(hashtextextended('assignment-submission:'||p_assignment::text||':'||(context->>'contact_id'),0));
 perform public.academy_audio_context(p_academy,p_actor,p_assignment,'submission',null,true);
 select * into assignment from public.academy_assignments where academy_id=p_academy and id=p_assignment for share;
 select * into submission from public.academy_submissions where assignment_id=p_assignment and contact_id=(context->>'contact_id')::uuid for update;
 next_attempt:=coalesce(submission.attempt_number,0)+1;
 if next_attempt>assignment.attempts_allowed then raise exception using errcode='23505',message='No assignment attempts remain';end if;
 meta:=coalesce(p_payload->'metadata','{}');
 if jsonb_typeof(meta) is distinct from 'object' or coalesce(meta->>'response_kind','') not in('text','file') then raise exception using errcode='22023',message='Choose a written or file response';end if;
 insert into public.academy_submissions(academy_id,assignment_id,classroom_id,contact_id,user_id,status,attempt_number,submitted_at,submission_content,submission_url,notes,metadata,max_score)
 values(p_academy,p_assignment,assignment.classroom_id,(context->>'contact_id')::uuid,p_actor,case when assignment.due_at<clock_timestamp() then 'late' else 'submitted' end,next_attempt,clock_timestamp(),nullif(p_payload->>'submission_content',''),nullif(p_payload->>'submission_url',''),nullif(p_payload->>'notes',''),meta,assignment.max_score)
 on conflict(assignment_id,contact_id) do update set status=case when excluded.status='late' then 'late' else 'resubmitted' end,attempt_number=excluded.attempt_number,submitted_at=excluded.submitted_at,updated_at=clock_timestamp(),submission_content=excluded.submission_content,submission_url=excluded.submission_url,notes=excluded.notes,metadata=excluded.metadata,score=null,feedback='{}',graded_at=null,graded_by=null
 returning * into submission;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,classroom_id,metadata)
 values(p_academy,p_actor,'assignment.submitted','academy_submission',submission.id::text,submission.contact_id,submission.classroom_id,jsonb_build_object('assignment_id',p_assignment,'attempt_number',next_attempt,'status',submission.status));
 perform public.academy_audio_context(p_academy,p_actor,p_assignment,'submission',null,true);
 return to_jsonb(submission);
end;$$;
revoke all on function public.academy_assignment_written_command(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.academy_assignment_written_command(uuid,uuid,uuid,jsonb) to service_role;
commit;
