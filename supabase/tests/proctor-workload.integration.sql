\set ON_ERROR_STOP on
begin;
\ir proctor-workload.fixture.sql
do $$declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';viewer uuid:='00000000-0000-4000-8000-000000000071';reviewer uuid:='00000000-0000-4000-8000-000000000072';candidate uuid:='00000000-0000-4000-8000-000000000073';page jsonb;filters jsonb:=jsonb_build_object('candidate_id',candidate,'limit',10);seen uuid[]:='{}';row jsonb;targets jsonb;result jsonb;sid uuid;other uuid;before_scores bigint;before_attempts bigint;begin
 select count(*) into before_scores from assessment_score_revisions;select count(*) into before_attempts from assessment_attempts;
 loop
  page:=public.proctor_workload_read(owner,t,filters);
  if jsonb_array_length(page->'rows')>10 then raise exception 'Workload exceeded bounded page';end if;
  for row in select value from jsonb_array_elements(page->'rows') loop if(row->>'id')::uuid=any(seen) then raise exception 'Keyset page repeated a tied timestamp';end if;seen:=array_append(seen,(row->>'id')::uuid);end loop;
  exit when page->'next'='null'::jsonb;filters:=filters||jsonb_build_object('after',page->'next');
 end loop;
 if cardinality(seen)<>57 then raise exception 'Workload lost sessions beyond the first page';end if;
 begin perform public.proctor_workload_read('00000000-0000-4000-8000-000000000004',t,'{}');raise exception 'Foreign institution saw workload';exception when insufficient_privilege then null;end;
 if jsonb_array_length(public.proctor_workload_read(viewer,t,'{}')->'rows')<>0 then raise exception 'Unassigned observer enumerated sessions';end if;
 begin perform public.proctor_workload_read(viewer,t,'{"assignment":"unassigned"}');raise exception 'Observer enumerated uncovered candidates';exception when insufficient_privilege then null;end;
 begin perform public.proctor_workload_staff(viewer,t,'observer');raise exception 'Observer read team directory';exception when insufficient_privilege then null;end;
 select session_id into sid from fixture_proctor_workload where n=1;select session_id into other from fixture_proctor_workload where n=2;
 targets:=jsonb_build_object('user_id',viewer,'role','observer','reason','Assign reviewed morning coverage','targets',jsonb_build_array(jsonb_build_object('session_id',sid,'expected_revision',0),jsonb_build_object('session_id',other,'expected_revision',0)));
 result:=public.proctor_workload_command(owner,t,'board-reviewed-assign','assignment.set',targets);
 if public.proctor_workload_command(owner,t,'board-reviewed-assign','assignment.set',targets)<>result then raise exception 'Assignment replay changed receipt';end if;
 if jsonb_array_length(public.proctor_workload_read(viewer,t,'{}')->'rows')<>2 or not public.proctor_can_access(t,sid,viewer,'observer') then raise exception 'Reviewed observer access missing';end if;
 if (public.proctor_workload_read(owner,t,jsonb_build_object('candidate_id',candidate,'assignment','unassigned','limit',50))->'next')='null'::jsonb then raise exception 'Unassigned pagination silently truncated';end if;
 begin perform public.proctor_workload_command(owner,t,'board-stale-revision','assignment.remove',targets);raise exception 'Stale assignment removal accepted';exception when unique_violation then null;end;
 -- A legacy assignment increments the same revision, fencing reviewed batches.
 perform public.proctor_command(owner,t,'board-legacy-assign','session.assign',jsonb_build_object('session_id',sid,'user_id',reviewer,'assignment_role','reviewer'));
 if(select assignment_revision from proctor_sessions where id=sid)<>2 then raise exception 'Legacy assignment bypassed shared revision';end if;
 begin perform public.proctor_workload_command(owner,t,'board-atomic-conflict','assignment.remove',jsonb_set(targets,'{targets}',jsonb_build_array(jsonb_build_object('session_id',other,'expected_revision',1),jsonb_build_object('session_id',sid,'expected_revision',1))));raise exception 'Partial batch committed past conflict';exception when unique_violation then null;end;
 if not public.proctor_can_access(t,other,viewer,'observer') then raise exception 'Rejected batch partially removed assignment';end if;
 targets:=jsonb_set(targets,'{targets}',jsonb_build_array(jsonb_build_object('session_id',sid,'expected_revision',2),jsonb_build_object('session_id',other,'expected_revision',1)));
 perform public.proctor_workload_command(owner,t,'board-reviewed-remove','assignment.remove',targets);
 if public.proctor_can_access(t,sid,viewer,'observer') or jsonb_array_length(public.proctor_workload_read(viewer,t,'{}')->'rows')<>0 then raise exception 'Removed assignment retained access';end if;
 if jsonb_array_length(public.proctor_workload_read(reviewer,t,'{}')->'rows')<>1 or(public.proctor_workload_read(reviewer,t,'{}')#>>'{rows,0,can_observe}')::boolean then raise exception 'Reviewer assignment inherited observation';end if;
 -- Revoked staff remain removable, without being eligible for new assignments.
 perform public.proctor_command(owner,t,'board-revoke-review-cap','capability.revoke',jsonb_build_object('user_id',reviewer,'capability','proctor.review'));
 if not exists(select 1 from jsonb_array_elements(public.proctor_workload_staff(owner,t,'reviewer')->'rows') r where r->>'user_id'=reviewer::text and r->'eligible'='false'::jsonb) then raise exception 'Revoked staff disappeared from assignment removal directory';end if;
 begin perform public.proctor_workload_read(reviewer,t,'{}');raise exception 'Revoked capability retained workload access';exception when insufficient_privilege then null;end;
 if(select count(*) from assessment_score_revisions)<>before_scores or(select count(*) from assessment_attempts)<>before_attempts then raise exception 'Workload modified academic state';end if;
 if(select count(*) from assessment_audit_events where action like 'proctor.workload.%')<>2 or(select count(*) from proctor_workload_commands)<>2 then raise exception 'Workload retries duplicated audit or receipt';end if;
 if has_function_privilege('authenticated','public.proctor_workload_command(uuid,uuid,text,text,jsonb)','execute') or has_table_privilege('service_role','public.proctor_workload_commands','select') then raise exception 'Workload private command custody exposed';end if;
end;$$;
rollback;
