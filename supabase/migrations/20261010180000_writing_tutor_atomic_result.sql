-- Persist feedback and its replay receipt in one transaction. Older session
-- columns remain readable; browser clients cannot forge new grading history.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
revoke insert,update,delete on public.writing_tutor_sessions from public,anon,authenticated;
do $$ declare c record; begin
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='writing_tutor_sessions' loop
    execute format('revoke insert(%I),update(%I) on public.writing_tutor_sessions from public,anon,authenticated',c.column_name,c.column_name);
  end loop;
end $$;

create function public.complete_writing_tutor_request(p_user_id uuid,p_request_id uuid,p_lease_token uuid,p_feedback jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='3s' set statement_timeout='15s' as $$
declare
  v_request public.ai_request_ledger%rowtype;
  v_session public.writing_tutor_sessions%rowtype;
  v_result jsonb;
  v_max numeric;
  v_key text;
  v_item jsonb;
begin
  if p_feedback is null or jsonb_typeof(p_feedback)<>'object'
    or p_feedback->>'exam_type' not in ('ielts','itep')
    or p_feedback->>'task_type' not in ('task1','task2')
    or not (p_feedback ?& array['exam_type','task_type','word_count','overall_band','criteria','strengths','improvements','actionable_feedback','feedback','word_count_comment','model','tokens_used'])
    or (select count(*) from jsonb_object_keys(p_feedback))<>12 then
    raise exception 'Invalid writing feedback' using errcode='22023';
  end if;
  v_max := case when p_feedback->>'exam_type'='itep' then 6 else 9 end;
  if jsonb_typeof(p_feedback->'overall_band')<>'number'
    or (p_feedback->>'overall_band')::numeric not between 0 and v_max
    or jsonb_typeof(p_feedback->'word_count')<>'number'
    or (p_feedback->>'word_count')::numeric not between 1 and 10000
    or trunc((p_feedback->>'word_count')::numeric)<>(p_feedback->>'word_count')::numeric
    or jsonb_typeof(p_feedback->'criteria')<>'object'
    or (select count(*) from jsonb_object_keys(p_feedback->'criteria'))<>4 then
    raise exception 'Invalid writing scores' using errcode='22023';
  end if;
  foreach v_key in array array['TR','CC','LR','GRA'] loop
    if not ((p_feedback->'criteria') ? v_key) or jsonb_typeof(p_feedback->'criteria'->v_key)<>'number'
      or (p_feedback->'criteria'->>v_key)::numeric not between 0 and v_max then
      raise exception 'Invalid writing criterion' using errcode='22023';
    end if;
  end loop;
  foreach v_key in array array['feedback','word_count_comment','model'] loop
    if jsonb_typeof(p_feedback->v_key)<>'string' or char_length(p_feedback->>v_key)>(case when v_key='feedback' then 8000 when v_key='model' then 200 else 1000 end)
      or (v_key in ('feedback','model') and char_length(trim(p_feedback->>v_key))=0) then
      raise exception 'Invalid writing text' using errcode='22023';
    end if;
  end loop;
  foreach v_key in array array['strengths','improvements','actionable_feedback'] loop
    if jsonb_typeof(p_feedback->v_key)<>'array' or jsonb_array_length(p_feedback->v_key)>3 then
      raise exception 'Invalid writing advice' using errcode='22023';
    end if;
    for v_item in select value from jsonb_array_elements(p_feedback->v_key) loop
      if jsonb_typeof(v_item)<>'string' or char_length(v_item#>>'{}') not between 1 and 1000 then
        raise exception 'Invalid writing advice' using errcode='22023';
      end if;
    end loop;
  end loop;
  if p_feedback->'tokens_used'<>'null'::jsonb and (jsonb_typeof(p_feedback->'tokens_used')<>'number'
    or (p_feedback->>'tokens_used')::numeric not between 0 and 100000
    or trunc((p_feedback->>'tokens_used')::numeric)<>(p_feedback->>'tokens_used')::numeric) then
    raise exception 'Invalid writing usage' using errcode='22023';
  end if;
  perform public.require_open_ai_actor(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('ai:global:writing-tutor',0));
  perform pg_advisory_xact_lock(hashtextextended('ai:user:writing-tutor:' || p_user_id::text,0));
  select * into v_request from public.ai_request_ledger
    where user_id=p_user_id and service='writing-tutor' and request_id=p_request_id for update;
  if not found or v_request.lease_token is distinct from p_lease_token then
    raise exception 'Writing reservation not found' using errcode='42501';
  end if;
  if v_request.status='succeeded' then
    if (v_request.result-'session_id'-'graded_at') is distinct from p_feedback then
      raise exception 'Writing result conflicts with saved result' using errcode='40001';
    end if;
    return v_request.result;
  end if;
  if v_request.status not in ('started','uncertain') then
    raise exception 'Writing request has not started' using errcode='40001';
  end if;
  insert into public.writing_tutor_sessions(user_id,exam_type,task_type,word_count,overall_band,criteria,feedback,model,tokens_used)
    values(p_user_id,p_feedback->>'exam_type',p_feedback->>'task_type',(p_feedback->>'word_count')::integer,
      (p_feedback->>'overall_band')::numeric,p_feedback->'criteria',p_feedback->>'feedback',p_feedback->>'model',
      (p_feedback->>'tokens_used')::integer) returning * into v_session;
  v_result := p_feedback || jsonb_build_object('session_id',v_session.id,'graded_at',v_session.created_at);
  perform public.finish_ai_request(p_user_id,'writing-tutor',p_request_id,p_lease_token,'succeeded',v_result,null);
  return v_result;
end $$;
revoke all on function public.complete_writing_tutor_request(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_writing_tutor_request(uuid,uuid,uuid,jsonb) to service_role;
commit;
