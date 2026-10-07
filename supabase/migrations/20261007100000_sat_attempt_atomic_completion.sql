-- Additive, compatible with the previous Edge version. Only the service can
-- finalize progress. Shared simulator sessions/responses keep their permissions.
create table public.sat_practice_attempt_results (
  attempt_id uuid primary key references public.sat_practice_lab_attempts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.sat_practice_attempt_results enable row level security;
revoke all on public.sat_practice_attempt_results from public,anon,authenticated;
grant all on public.sat_practice_attempt_results to service_role;

do $$ declare t text; c record; begin
  foreach t in array array['sat_practice_lab_attempts','sat_practice_mastery','sat_practice_srs_queue','sat_practice_daily_activity','sat_practice_mistake_notebook'] loop
    execute format('revoke insert,update,delete,truncate on public.%I from public,anon,authenticated',t);
    for c in select column_name from information_schema.columns where table_schema='public' and table_name=t loop
      execute format('revoke insert(%I),update(%I) on public.%I from public,anon,authenticated',c.column_name,c.column_name,t);
    end loop;
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
end $$;

create function public.complete_sat_practice_attempt(
  p_user_id uuid,p_attempt_id uuid,p_answers jsonb,p_questions jsonb,p_scored_items jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a public.sat_practice_lab_attempts%rowtype;
  m public.sat_practice_mastery%rowtype;
  s public.sat_practice_srs_queue%rowtype;
  q jsonb; item jsonb; answer jsonb; result jsonb; notebook jsonb:='[]'; mistake jsonb;
  n integer; i integer; correct_count integer:=0; was_correct boolean;
  accuracy numeric; rolling numeric; level numeric; box integer; interval_days integer;
  stamp timestamptz:=now(); day_utc date:=(now() at time zone 'UTC')::date;
begin
  if p_user_id is null or p_attempt_id is null or p_answers is null
    or jsonb_typeof(p_answers)<>'object' or octet_length(p_answers::text)>65536 then
    raise exception 'Invalid submission' using errcode='22023';
  end if;
  -- Actor lock protects aggregates across different attempts; attempt lock protects replay.
  perform pg_advisory_xact_lock(hashtextextended('sat-practice-completion:'||p_user_id::text,0));
  select * into a from public.sat_practice_lab_attempts where id=p_attempt_id and user_id=p_user_id for update;
  if not found then raise exception 'Attempt not found' using errcode='P0002'; end if;
  if exists(select 1 from jsonb_object_keys(p_answers) k where not(k=any(a.question_ids::text[]))) then
    raise exception 'Answer does not belong to this attempt' using errcode='22023';
  end if;
  if a.status='scored' then
    if a.answers is distinct from p_answers then
      raise exception 'This drill was already submitted with different answers' using errcode='23505';
    end if;
    select r.result into result from public.sat_practice_attempt_results r where r.attempt_id=a.id and r.user_id=p_user_id;
    -- Historical completions must never be reprocessed or rewarded again.
    return coalesce(result,jsonb_build_object('attempt',to_jsonb(a),'questions',null,'notebook','[]'::jsonb,'legacy_result',true));
  end if;
  if a.status not in ('in_progress','submitted') then
    raise exception 'This drill cannot be submitted' using errcode='23505';
  end if;
  n:=cardinality(a.question_ids);
  if n not between 1 and 100 or (select count(distinct id) from unnest(a.question_ids) id)<>n
    or p_questions is null or jsonb_typeof(p_questions)<>'array'
    or p_scored_items is null or jsonb_typeof(p_scored_items)<>'array' then
    raise exception 'Invalid question set' using errcode='22023';
  end if;
  if jsonb_array_length(p_questions)<>n or jsonb_array_length(p_scored_items)<>n then
    raise exception 'The complete question set is required' using errcode='22023';
  end if;
  if a.session_id is not null then
    perform 1 from public.sessions where id=a.session_id and user_id=p_user_id
      and metadata->>'mode'='sat_practice_lab' for update;
    if not found then raise exception 'Invalid drill session' using errcode='22023'; end if;
  end if;
  for i in 0..n-1 loop
    q:=p_questions->i; item:=p_scored_items->i; answer:=coalesce(p_answers->a.question_ids[i+1]::text,'null'::jsonb);
    if q->>'id' is distinct from a.question_ids[i+1]::text
      or item->>'question_id' is distinct from a.question_ids[i+1]::text
      or jsonb_typeof(item->'correct') is distinct from 'boolean'
      or item->'answer' is distinct from answer or item->'expected' is distinct from q->'correct'
      or q->'correct' is null or q->'correct'='null'::jsonb
      or coalesce(q->>'section_type','') not in ('reading_writing','math')
      or coalesce(q->>'difficulty','') not in ('easy','medium','hard')
      or coalesce(q->>'domain','') not in ('grammar','transitions','rhetoric','vocabulary_in_context','command_of_evidence','algebra','advanced_math','problem_solving_data_analysis','geometry_trig')
      or coalesce(q->>'type','')='' or jsonb_typeof(q->'data') is distinct from 'object' then
      raise exception 'Invalid scored question' using errcode='22023';
    end if;
    was_correct:=(item->>'correct')::boolean;
    if was_correct then correct_count:=correct_count+1; end if;
    select * into m from public.sat_practice_mastery where user_id=p_user_id
      and section_type=q->>'section_type' and domain=q->>'domain' and difficulty=q->>'difficulty';
    rolling:=case when m.rolling_accuracy is null then case when was_correct then 1 else 0 end
      else m.rolling_accuracy*0.7+(case when was_correct then 0.3 else 0 end) end;
    level:=round(rolling*0.75+least(1,(coalesce(m.attempts,0)+1)::numeric/12)*0.25,3);
    insert into public.sat_practice_mastery(user_id,section_type,domain,difficulty,attempts,rolling_accuracy,last_accuracy,mastery_status,mastery_level,last_practiced_at,updated_at)
      values(p_user_id,q->>'section_type',q->>'domain',q->>'difficulty',coalesce(m.attempts,0)+1,round(rolling,3),case when was_correct then 1 else 0 end,
        case when level>=0.9 then 'mastered' when level>=0.72 then 'stable' when level>=0.48 then 'building' when level>0 then 'weak' else 'new' end,level,stamp,stamp)
      on conflict(user_id,section_type,domain,difficulty) do update set
        attempts=excluded.attempts,rolling_accuracy=excluded.rolling_accuracy,last_accuracy=excluded.last_accuracy,
        mastery_status=excluded.mastery_status,mastery_level=excluded.mastery_level,last_practiced_at=stamp,updated_at=stamp;
    select * into s from public.sat_practice_srs_queue where user_id=p_user_id and question_id=a.question_ids[i+1];
    box:=case when was_correct then least(5,coalesce(s.leitner_box,1)+1) else 1 end;
    interval_days:=(array[1,2,4,8,16])[box];
    insert into public.sat_practice_srs_queue(user_id,question_id,leitner_box,interval_days,next_review_at,last_reviewed_at,correct_count,incorrect_count,updated_at)
      values(p_user_id,a.question_ids[i+1],box,interval_days,stamp+make_interval(days=>interval_days),stamp,
        coalesce(s.correct_count,0)+case when was_correct then 1 else 0 end,coalesce(s.incorrect_count,0)+case when was_correct then 0 else 1 end,stamp)
      on conflict(user_id,question_id) do update set leitner_box=excluded.leitner_box,interval_days=excluded.interval_days,
        next_review_at=excluded.next_review_at,last_reviewed_at=stamp,correct_count=excluded.correct_count,incorrect_count=excluded.incorrect_count,updated_at=stamp;
    if a.session_id is not null then
      insert into public.responses(session_id,content_unit_id,type,data,metadata)
        values(a.session_id,a.question_ids[i+1],q->>'type',case when jsonb_typeof(answer)='object' then answer else jsonb_build_object('value',answer) end,
          jsonb_build_object('source','sat_practice','attempt_id',a.id));
    end if;
    if not was_correct then
      insert into public.sat_practice_mistake_notebook(user_id,section_type,domain,difficulty,source,source_session_id,question_id,reason_tag,mistake_pattern,coach_note,status,next_review_at,last_seen_at)
        values(p_user_id,q->>'section_type',q->>'domain',q->>'difficulty','practice_lab',a.session_id,a.question_ids[i+1],'unknown',replace(q->>'domain','_',' ')||' miss',
          'Review the underlying concept, then retry a similar item.','active',stamp,stamp) returning to_jsonb(sat_practice_mistake_notebook.*) into mistake;
      notebook:=notebook||jsonb_build_array(mistake);
    end if;
  end loop;
  insert into public.sat_practice_daily_activity(user_id,day,attempts,minutes_studied,xp_earned,updated_at)
    values(p_user_id,day_utc,1,greatest(5,ceil(n*1.5)::integer),correct_count*10+25,stamp)
    on conflict(user_id,day) do update set attempts=sat_practice_daily_activity.attempts+1,
      minutes_studied=sat_practice_daily_activity.minutes_studied+excluded.minutes_studied,
      xp_earned=sat_practice_daily_activity.xp_earned+excluded.xp_earned,updated_at=stamp;
  accuracy:=round(correct_count::numeric/n,3);
  update public.sat_practice_lab_attempts set answers=p_answers,scored_items=p_scored_items,submitted_at=stamp,
    scored_at=stamp,score_raw=correct_count,score_accuracy=accuracy,status='scored' where id=a.id returning * into a;
  if a.session_id is not null then
    update public.sessions set status='completed',completed_at=stamp where id=a.session_id and user_id=p_user_id;
  end if;
  result:=jsonb_build_object('attempt',to_jsonb(a),'questions',p_questions,'notebook',notebook);
  insert into public.sat_practice_attempt_results(attempt_id,user_id,result) values(a.id,p_user_id,result);
  return result;
end $$;
revoke all on function public.complete_sat_practice_attempt(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_sat_practice_attempt(uuid,uuid,jsonb,jsonb,jsonb) to service_role;
