-- Only run in a disposable clone or inside an explicitly rolled-back release
-- transaction. The published questions and private keys are never edited live.
do $fixture$
declare
 actor uuid:=gen_random_uuid();foreign_actor uuid:=gen_random_uuid();rows jsonb;question jsonb;started jsonb;scored jsonb;replayed jsonb;answers jsonb;items jsonb;
 qid uuid;count_rows integer;result_count integer:=0;section text;domain text;
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select id,'sat-qa-'||id||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned rollback-only SAT fixture"}' from unnest(array[actor,foreign_actor]) id;
 select jsonb_agg(q) into rows from public.select_sat_practice_questions(actor,null,null,null,null,null,100,false) q
 where q->'metadata'->>'content_revision'='original-2026-10-v1';
 if jsonb_array_length(rows)<>27 then raise exception 'Expected 27 original foundation exercises';end if;result_count:=result_count+1;
 for question in select * from jsonb_array_elements(rows) loop
  if jsonb_array_length(question->'data'->'options')<>4 or question->'correct'->>'option_id' not in('A','B','C','D')
   or length(coalesce(question->'correct'->'feedback'->>'explanation',''))<20 or question->'data'?'feedback' or question->'metadata'?'feedback' then raise exception 'Original item structure or private explanation differs';end if;
  result_count:=result_count+1;
 end loop;
 for domain in select unnest(array['grammar','transitions','rhetoric','vocabulary_in_context','command_of_evidence','algebra','advanced_math','problem_solving_data_analysis','geometry_trig']) loop
  select count(*) into count_rows from public.select_sat_practice_questions(actor,null,domain,null,null,null,100,false) q where q->'metadata'->>'content_revision'='original-2026-10-v1';
  if count_rows<>3 then raise exception 'Foundation domain coverage differs';end if;result_count:=result_count+1;
 end loop;
 qid:=(rows->0->>'id')::uuid;
 started:=public.start_sat_practice_attempt(actor,gen_random_uuid(),jsonb_build_object('limit',1,'question_ids',jsonb_build_array(qid)));
 if jsonb_array_length(started->'questions')<>1 or (started->'questions'->0->>'id')::uuid<>qid then raise exception 'Started original exercise differs';end if;result_count:=result_count+1;
 question:=started->'questions'->0;
 -- This row was inserted earlier in the same rollback-only transaction. Test
 -- frozen grading without modifying any committed published key.
 update public.answer_keys set correct=jsonb_build_object('option_id',case when question->'correct'->>'option_id'='A' then 'B' else 'A' end) where content_unit_id=qid;
 answers:=jsonb_build_object(qid::text,jsonb_build_object('selected_option',question->'correct'->>'option_id'));
 items:=jsonb_build_array(jsonb_build_object('question_id',qid,'correct',true,'answer',answers->qid::text,'expected',question->'correct'));
 scored:=public.complete_sat_practice_attempt(actor,(started->'attempt'->>'id')::uuid,answers,started->'questions',items);
 if scored->'questions' is distinct from started->'questions' or (scored->'attempt'->>'score_raw')::integer<>1 then raise exception 'Original feedback or score changed after editing a current key';end if;result_count:=result_count+1;
 replayed:=public.complete_sat_practice_attempt(actor,(started->'attempt'->>'id')::uuid,answers,started->'questions',items);
 if replayed->'questions' is distinct from scored->'questions' or replayed->'attempt'->>'id'<>scored->'attempt'->>'id' then raise exception 'Original result retry differs';end if;result_count:=result_count+1;
 if has_function_privilege('anon','public.select_sat_practice_questions(uuid,text,text,text,text,uuid[],integer,boolean)','EXECUTE')
  or has_function_privilege('authenticated','public.select_sat_practice_questions(uuid,text,text,text,text,uuid[],integer,boolean)','EXECUTE') then raise exception 'Browser role gained private bank RPC access';end if;result_count:=result_count+1;
 perform set_config('schood.qa.sat_foundations_checks',result_count::text,true);
end;
$fixture$;
select current_setting('schood.qa.sat_foundations_checks')::integer as sat_foundations_checks;
