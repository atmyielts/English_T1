-- Staff grading shares the student's submission lock and binds the reviewed
-- attempt, revision, assignment and rubric to one current-authority receipt.
begin;
create table public.academy_grading_events(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete restrict,
 actor_id uuid not null references public.users(id) on delete restrict,submission_id uuid not null references public.academy_submissions(id) on delete restrict,
 request_key text not null,before_snapshot jsonb not null,after_snapshot jsonb not null,created_at timestamptz not null default now(),unique(academy_id,request_key)
);
alter table public.academy_grading_events enable row level security;
revoke all on public.academy_grading_events from public,anon,authenticated;
grant all on public.academy_grading_events to service_role;
create trigger academy_grading_events_immutable before update or delete on public.academy_grading_events for each row execute function public.academy_reject_operational_finance_history_mutation();
create function public.academy_grading_context(p_academy uuid,p_actor uuid,p_assignment uuid,p_contact uuid,p_submission uuid default null)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare auths jsonb;assignment public.academy_assignments;submission public.academy_submissions;classroom public.academy_classrooms;contact public.academy_contacts;scope jsonb;
begin
 auths:=public.academy_current_authorities(p_academy,p_actor);
 if p_submission is not null then
  select * into submission from public.academy_submissions where academy_id=p_academy and id=p_submission;
  if not found or(p_assignment is not null and submission.assignment_id<>p_assignment) or(p_contact is not null and submission.contact_id<>p_contact) then raise exception using errcode='42501',message='This submission is outside the requested assignment';end if;
  p_assignment:=submission.assignment_id;p_contact:=submission.contact_id;
 end if;
 select * into assignment from public.academy_assignments where academy_id=p_academy and id=p_assignment for share;
 if not found then raise exception using errcode='42501',message='This assignment is unavailable';end if;
 if submission.id is not null and submission.classroom_id is distinct from assignment.classroom_id then raise exception using errcode='42501',message='The submission and assignment no longer share a classroom';end if;
 perform public.academy_command_resource(p_academy,'classroom',assignment.classroom_id);
 select * into classroom from public.academy_classrooms where academy_id=p_academy and id=assignment.classroom_id for share;
 select * into contact from public.academy_contacts where academy_id=p_academy and id=p_contact for share;
 if contact.id is null then raise exception using errcode='42501',message='This learner is unavailable';end if;
 perform 1 from public.academy_classroom_memberships where academy_id=p_academy and classroom_id=assignment.classroom_id and contact_id=p_contact and role='student' and status in('active','trial','paused','completed','transferred','withdrawn','expired') for share;
 if not found then raise exception using errcode='42501',message='This learner has no membership in the assignment classroom';end if;
 -- A learner's membership in a second class or primary branch never promotes
 -- that second grant into grading authority over this assignment.
 scope:=jsonb_build_object('kind','contact','contact_id',p_contact,'classroom_ids',jsonb_build_array(classroom.id),'branch_id',classroom.branch_id,'branch_ids',jsonb_build_array(classroom.branch_id));
 perform public.academy_assert_current_capability(p_academy,p_actor,'gradeSubmissions',scope);
 return jsonb_build_object('actor_id',p_actor,'academy_id',p_academy,'assignment_id',assignment.id,'classroom_id',classroom.id,'contact_id',contact.id,'scope',scope,'assignment',to_jsonb(assignment));
end;$$;
revoke all on function public.academy_grading_context(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.academy_grading_context(uuid,uuid,uuid,uuid,uuid) to service_role;

create function public.academy_grading_command(p_academy uuid,p_actor uuid,p_command text,p_payload jsonb,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='35s' as $$
declare context jsonb;assignment public.academy_assignments;submission public.academy_submissions;rubric public.academy_rubrics;receipt public.academy_operational_command_receipts;
 scope jsonb;target uuid;target_contact uuid;target_assignment uuid;expected integer;score_value numeric;maximum numeric;feedback_value jsonb;criterion jsonb;criterion_id text;criterion_max numeric;criterion_score numeric;total_score numeric:=0;total_max numeric:=0;scores jsonb:='{}';result jsonb;position integer:=0;before_state jsonb;
begin
 if coalesce(p_command,'') not in('grade_submission','submit_assignment') or jsonb_typeof(p_payload) is distinct from 'object' or coalesce(p_request_key,'') !~ '^[A-Za-z0-9_.:-]{1,160}$' or octet_length(p_payload::text)>60000 then raise exception using errcode='22023',message='Review this grading change and its retry key';end if;
 perform public.academy_current_authorities(p_academy,p_actor);
 perform pg_advisory_xact_lock(hashtextextended('operational-command:'||p_academy::text||':'||p_request_key,0));
 context:=public.academy_grading_context(p_academy,p_actor,nullif(p_payload->>'assignment_id','')::uuid,nullif(p_payload->>'contact_id','')::uuid,nullif(p_payload->>'submission_id','')::uuid);
 target_assignment:=(context->>'assignment_id')::uuid;target_contact:=(context->>'contact_id')::uuid;scope:=context->'scope';
 select * into assignment from public.academy_assignments where academy_id=p_academy and id=target_assignment;
 select * into receipt from public.academy_operational_command_receipts where academy_id=p_academy and actor_id=p_actor and request_key=p_request_key;
 if found then
  if receipt.command<>p_command or receipt.payload is distinct from p_payload then raise exception using errcode='23505',message='This retry belongs to another grading change';end if;
  return receipt.result||'{"replayed":true}';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('assignment-submission:'||target_assignment::text||':'||target_contact::text,0));
 select * into submission from public.academy_submissions where academy_id=p_academy and assignment_id=target_assignment and contact_id=target_contact for update;
 before_state:=case when submission.id is null then '{}'::jsonb else to_jsonb(submission) end;
 if submission.id is not null and submission.classroom_id is distinct from assignment.classroom_id then raise exception using errcode='42501',message='The submission and assignment no longer share a classroom';end if;
 if nullif(p_payload->>'submission_id','') is not null and submission.id is distinct from(p_payload->>'submission_id')::uuid then raise exception using errcode='23505',message='The reviewed submission identity changed';end if;
 expected:=(p_payload->>'expected_attempt_number')::integer;
 if expected is null or expected<0 or expected<>coalesce(submission.attempt_number,0) or(submission.id is not null and (nullif(p_payload->>'expected_updated_at','')::timestamptz is distinct from submission.updated_at)) or(nullif(p_payload->>'expected_assignment_updated_at','')::timestamptz is distinct from assignment.updated_at) then raise exception using errcode='23505',message='The assignment or submission attempt changed. Refresh and review it';end if;
 if p_command='grade_submission' and submission.id is null then raise exception using errcode='23505',message='The reviewed submission no longer exists';end if;
 if submission.id is null then
  if assignment.status<>'active' then raise exception using errcode='23505',message='This assignment is not open for new manual work';end if;
  perform 1 from public.academy_classroom_memberships where academy_id=p_academy and classroom_id=assignment.classroom_id and contact_id=target_contact and role='student' and status in('active','trial','paused','completed');
  if not found then raise exception using errcode='42501',message='A retained withdrawn learner cannot receive new manual work';end if;
 end if;
 score_value:=nullif(p_payload->>'score','')::numeric;maximum:=coalesce(nullif(p_payload->>'max_score','')::numeric,submission.max_score,assignment.max_score);
 target:=nullif(p_payload->>'session_id','')::uuid;
 if target is not null then
  perform 1 from public.academy_lesson_sessions where academy_id=p_academy and id=target and classroom_id=assignment.classroom_id for share;
  if not found or(submission.id is not null and submission.session_id is distinct from target) then raise exception using errcode='42501',message='The lesson link is outside this reviewed classroom work';end if;
 end if;
 if(p_command='grade_submission' and score_value is null) or maximum is null or maximum<=0 or maximum::text in('NaN','Infinity','-Infinity') or(score_value is not null and(score_value<0 or score_value>maximum or score_value::text in('NaN','Infinity','-Infinity'))) then raise exception using errcode='22023',message='Use a valid score and positive maximum';end if;
 if score_value is null and submission.id is not null then raise exception using errcode='22023',message='Review an existing submission through grading';end if;
 feedback_value:=case when p_payload?'feedback' then p_payload->'feedback' else coalesce(submission.feedback,'{}') end;
 if jsonb_typeof(feedback_value) is distinct from 'object' or length(coalesce(p_payload->>'notes',''))>2000 then raise exception using errcode='22023',message='Review the feedback and notes';end if;
 if score_value is not null and assignment.rubric_id is not null then
  select * into rubric from public.academy_rubrics where academy_id=p_academy and id=assignment.rubric_id and status<>'archived' for share;
  if rubric.id is null or rubric.criteria is distinct from p_payload->'expected_rubric_criteria' or feedback_value->>'rubric_id' is distinct from rubric.id::text then raise exception using errcode='23505',message='The assignment rubric changed. Refresh and review it';end if;
  if jsonb_typeof(rubric.criteria) is distinct from 'array' or jsonb_array_length(rubric.criteria)=0 or jsonb_typeof(feedback_value->'rubric_scores') is distinct from 'object' then raise exception using errcode='22023',message='Review the rubric criteria and scores';end if;
  for criterion in select value from jsonb_array_elements(rubric.criteria) loop
   position:=position+1;criterion_id:=coalesce(criterion->>'id','criterion-'||position);criterion_max:=coalesce(nullif(criterion->>'max_points',''),nullif(criterion->>'max_score',''))::numeric;criterion_score:=nullif(feedback_value->'rubric_scores'->>criterion_id,'')::numeric;
   if scores?criterion_id then raise exception using errcode='22023',message='Rubric criteria need unique identifiers';end if;
   if criterion_max is null or criterion_max<=0 or criterion_score is null or criterion_score<0 or criterion_score>criterion_max then raise exception using errcode='22023',message='A rubric score is outside its criterion range';end if;
   total_score:=total_score+criterion_score;total_max:=total_max+criterion_max;scores:=scores||jsonb_build_object(criterion_id,criterion_score);
  end loop;
  if abs(score_value-round(total_score,2))>0.001 or abs(maximum-round(total_max,2))>0.001 then raise exception using errcode='22023',message='Score and maximum must match the current rubric totals';end if;
  feedback_value:=feedback_value||jsonb_build_object('rubric_scores',scores);
 end if;
 if submission.id is null then
  insert into public.academy_submissions(academy_id,assignment_id,classroom_id,contact_id,user_id,session_id,attempt_number,score,max_score,status,submitted_at,graded_at,graded_by,notes,feedback)
  values(p_academy,target_assignment,assignment.classroom_id,target_contact,(select user_id from public.academy_contacts where academy_id=p_academy and id=target_contact),target,1,score_value,maximum,case when score_value is null then 'submitted' else 'graded' end,now(),case when score_value is null then null else now() end,case when score_value is null then null else p_actor end,nullif(trim(p_payload->>'notes'),''),feedback_value) returning * into submission;
 else
  update public.academy_submissions set score=score_value,max_score=maximum,status=case when score_value is null then 'submitted' else 'graded' end,graded_at=case when score_value is null then null else now() end,graded_by=case when score_value is null then null else p_actor end,notes=case when p_payload?'notes' then nullif(trim(p_payload->>'notes'),'') else submission.notes end,feedback=feedback_value
  where academy_id=p_academy and id=submission.id returning * into submission;
 end if;
 insert into public.academy_grading_events(academy_id,actor_id,submission_id,request_key,before_snapshot,after_snapshot) values(p_academy,p_actor,submission.id,p_request_key,before_state,to_jsonb(submission));
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,classroom_id,idempotency_key,metadata)
 values(p_academy,p_actor,case when score_value is null then 'submission.recorded' else 'submission.graded' end,'academy_submission',submission.id::text,target_contact,assignment.classroom_id,'grading:'||p_request_key,jsonb_build_object('assignment_id',target_assignment,'attempt_number',submission.attempt_number,'score',score_value,'max_score',maximum));
 result:=jsonb_build_object('actor_id',p_actor,'request_key',p_request_key,'command',p_command,'replayed',false,'submission',to_jsonb(submission));
 insert into public.academy_operational_command_receipts(academy_id,actor_id,request_key,command,payload,protected_scopes,result) values(p_academy,p_actor,p_request_key,p_command,p_payload,jsonb_build_array(scope),result);
 perform public.academy_grading_context(p_academy,p_actor,target_assignment,target_contact,submission.id);
 return result;
end;$$;
revoke all on function public.academy_grading_command(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_grading_command(uuid,uuid,text,jsonb,text) to service_role;
commit;
