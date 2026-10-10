-- Additive compatibility: old rows/writers are explicitly unverified.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
alter table public.speaking_coach_sessions add column assessment_scope text not null default 'legacy_unverified'
  check (assessment_scope in ('legacy_unverified','transcript_only'));
revoke insert,update,delete on public.speaking_coach_sessions from public,anon,authenticated;
do $$ declare c record; begin
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='speaking_coach_sessions' loop
    execute format('revoke insert(%I),update(%I) on public.speaking_coach_sessions from public,anon,authenticated',c.column_name,c.column_name);
  end loop;
end $$;

create function public.complete_speaking_coach_request(p_user_id uuid,p_request_id uuid,p_lease_token uuid,p_feedback jsonb,p_transcript text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='3s' set statement_timeout='15s' as $$
declare
  v_request public.ai_request_ledger%rowtype;
  v_session public.speaking_coach_sessions%rowtype;
  v_result jsonb;
  v_hash text;
  v_key text;
  v_item jsonb;
begin
  if p_transcript is null or char_length(trim(p_transcript)) not between 20 and 20000
    or p_feedback is null or jsonb_typeof(p_feedback)<>'object'
    or not (p_feedback ?& array['assessment_scope','overall_band','criteria','observations','strengths','improvements','feedback','topic','task_type','word_count','duration_secs','model'])
    or (select count(*) from jsonb_object_keys(p_feedback))<>12
    or (p_feedback->>'assessment_scope') is distinct from 'transcript_only'
    or (p_feedback->'overall_band') is distinct from 'null'::jsonb
    or (p_feedback->'criteria') is distinct from 'null'::jsonb
    or coalesce(p_feedback->>'task_type','') not in ('part1','part2','part3','free') then
    raise exception 'Invalid transcript feedback' using errcode='22023';
  end if;
  if jsonb_typeof(p_feedback->'word_count')<>'number'
    or (p_feedback->>'word_count')::numeric not between 1 and 10000
    or trunc((p_feedback->>'word_count')::numeric)<>(p_feedback->>'word_count')::numeric
    or jsonb_typeof(p_feedback->'observations')<>'object'
    or not ((p_feedback->'observations') ?& array['coherence','vocabulary','grammar'])
    or (select count(*) from jsonb_object_keys(p_feedback->'observations'))<>3 then
    raise exception 'Invalid transcript observations' using errcode='22023';
  end if;
  foreach v_key in array array['coherence','vocabulary','grammar'] loop
    if jsonb_typeof(p_feedback->'observations'->v_key)<>'string'
      or char_length(trim(p_feedback->'observations'->>v_key)) not between 1 and 2000 then
      raise exception 'Invalid transcript observations' using errcode='22023';
    end if;
  end loop;
  foreach v_key in array array['feedback','topic','model'] loop
    if jsonb_typeof(p_feedback->v_key)<>'string'
      or char_length(trim(p_feedback->>v_key)) not between (case when v_key='topic' then 5 else 1 end) and (case when v_key='feedback' then 6000 when v_key='topic' then 2000 else 200 end) then
      raise exception 'Invalid transcript text' using errcode='22023';
    end if;
  end loop;
  foreach v_key in array array['strengths','improvements'] loop
    if jsonb_typeof(p_feedback->v_key)<>'array' or jsonb_array_length(p_feedback->v_key)>3 then
      raise exception 'Invalid transcript advice' using errcode='22023';
    end if;
    for v_item in select value from jsonb_array_elements(p_feedback->v_key) loop
      if jsonb_typeof(v_item)<>'string' or char_length(trim(v_item#>>'{}')) not between 1 and 1000 then
        raise exception 'Invalid transcript advice' using errcode='22023';
      end if;
    end loop;
  end loop;
  if p_feedback->'duration_secs'<>'null'::jsonb and (jsonb_typeof(p_feedback->'duration_secs')<>'number'
    or (p_feedback->>'duration_secs')::numeric not between 1 and 900
    or trunc((p_feedback->>'duration_secs')::numeric)<>(p_feedback->>'duration_secs')::numeric) then
    raise exception 'Invalid transcript duration' using errcode='22023';
  end if;
  v_hash:=encode(sha256(convert_to(p_transcript,'UTF8')),'hex');
  perform public.require_open_ai_actor(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('ai:global:speaking-coach',0));
  perform pg_advisory_xact_lock(hashtextextended('ai:user:speaking-coach:' || p_user_id::text,0));
  select * into v_request from public.ai_request_ledger where user_id=p_user_id and service='speaking-coach' and request_id=p_request_id for update;
  if not found or v_request.lease_token is distinct from p_lease_token then
    raise exception 'Speaking reservation not found' using errcode='42501';
  end if;
  if v_request.status='succeeded' then
    if (v_request.result-'session_id'-'graded_at'-'transcript_hash') is distinct from p_feedback
      or (v_request.result->>'transcript_hash') is distinct from v_hash then
      raise exception 'Speaking result conflicts with saved result' using errcode='40001';
    end if;
    return v_request.result;
  end if;
  if v_request.status not in ('started','uncertain') then
    raise exception 'Speaking request has not started' using errcode='40001';
  end if;
  insert into public.speaking_coach_sessions(user_id,topic,task_type,transcript,word_count,overall_band,criteria,feedback,model,duration_secs,assessment_scope)
    values(p_user_id,p_feedback->>'topic',p_feedback->>'task_type',p_transcript,(p_feedback->>'word_count')::integer,
      null,p_feedback->'observations',p_feedback->>'feedback',p_feedback->>'model',(p_feedback->>'duration_secs')::integer,'transcript_only') returning * into v_session;
  v_result:=p_feedback||jsonb_build_object('session_id',v_session.id,'graded_at',v_session.created_at,'transcript_hash',v_hash);
  perform public.finish_ai_request(p_user_id,'speaking-coach',p_request_id,p_lease_token,'succeeded',v_result,null);
  return v_result;
end $$;
revoke all on function public.complete_speaking_coach_request(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.complete_speaking_coach_request(uuid,uuid,uuid,jsonb,text) to service_role;
commit;
