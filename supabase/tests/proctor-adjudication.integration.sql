\set ON_ERROR_STOP on
begin;
insert into users(id) values('00000000-0000-4000-8000-0000000000a1'),('00000000-0000-4000-8000-0000000000a2'),('00000000-0000-4000-8000-0000000000a3'),('00000000-0000-4000-8000-0000000000a4');
insert into tenant_memberships values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a2','active','member'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a3','active','member'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a4','active','admin');
do $$ declare
 tenant uuid:='10000000-0000-4000-8000-000000000001'; supervisor uuid:='00000000-0000-4000-8000-000000000001';
 candidate uuid:='00000000-0000-4000-8000-0000000000a1'; first uuid:='00000000-0000-4000-8000-0000000000a2'; second uuid:='00000000-0000-4000-8000-0000000000a3'; senior uuid:='00000000-0000-4000-8000-0000000000a4';
 pol uuid; win uuid; reg uuid; attempt uuid; session uuid; case_id uuid; agreed uuid; form jsonb; version_id uuid; result jsonb; replay jsonb;
begin
 select id into version_id from assessment_versions limit 1;select manifest into form from assessment_forms limit 1;
 win:=(public.assessment_command(supervisor,tenant,'adj-win-0001','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Adjudicated sitting','opens_at',now()-interval '1 hour','closes_at',now()+interval '1 hour'))->>'id')::uuid;
 reg:=(public.assessment_command(supervisor,tenant,'adj-reg-0001','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate))->>'id')::uuid;
 pol:=(proctor_command(supervisor,tenant,'adj-policy-01','policy.create','{"title":"Two reviewers","policy":{"schema_version":"proctor.policy.v1","mode":"browser","identity_level":0,"camera":false,"microphone":false,"screen":false,"second_camera":false,"reviewer_quorum":2}}')->>'id')::uuid;
 perform proctor_command(supervisor,tenant,'adj-attach-01','policy.attach',jsonb_build_object('window_id',win,'policy_id',pol));
 perform proctor_command(candidate,tenant,'adj-consent-1','preparation.accept',jsonb_build_object('registration_id',reg,'policy_id',pol,'acknowledged',true));
 attempt:=(public.assessment_command(candidate,tenant,'adj-start-001','attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('a',64)))->>'id')::uuid;
 select id into session from proctor_sessions where attempt_id=attempt;
 insert into assessment_capability_grants(tenant_id,user_id,capability,granted_by) select tenant,u,'proctor.review',supervisor from unnest(array[first,second]) u;
 perform proctor_command(supervisor,tenant,'adj-assign-01','session.assign',jsonb_build_object('session_id',session,'user_id',first,'assignment_role','reviewer'));
 perform proctor_command(supervisor,tenant,'adj-assign-02','session.assign',jsonb_build_object('session_id',session,'user_id',second,'assignment_role','reviewer'));
 case_id:=(proctor_command(first,tenant,'adj-case-0001','case.create',jsonb_build_object('session_id',session,'title','Left the test tab several times'))->>'id')::uuid;
 -- No decision before the full quorum has reported.
 perform proctor_command(first,tenant,'adj-find-0001','case.finding',jsonb_build_object('case_id',case_id,'disposition','confirmed','rationale','Tab hidden for long periods during section two.','evidence_event_ids','[]'::jsonb));
 begin perform proctor_command(senior,tenant,'adj-early-001','case.adjudicate',jsonb_build_object('case_id',case_id,'disposition','clear','rationale','Too early for a senior decision here.'));raise exception 'Adjudicated before quorum';exception when check_violation then if sqlerrm<>'adjudication_not_needed' then raise;end if;end;
 perform proctor_command(second,tenant,'adj-find-0002','case.finding',jsonb_build_object('case_id',case_id,'disposition','clear','rationale','Absences match the documented break policy.','evidence_event_ids','[]'::jsonb));
 if (select state from proctor_review_cases where id=case_id)<>'reviewing' then raise exception 'Disagreement resolved itself';end if;
 -- A reviewer of the case, or someone without manager rights, cannot decide it.
 begin perform proctor_command(first,tenant,'adj-self-0001','case.adjudicate',jsonb_build_object('case_id',case_id,'disposition','confirmed','rationale','I already said it was confirmed.'));raise exception 'Reviewer adjudicated own case';exception when insufficient_privilege then null;end;
 insert into assessment_capability_grants(tenant_id,user_id,capability,granted_by) values(tenant,first,'proctor.manage',supervisor);
 begin perform proctor_command(first,tenant,'adj-self-0002','case.adjudicate',jsonb_build_object('case_id',case_id,'disposition','confirmed','rationale','I already said it was confirmed.'));raise exception 'Reviewer manager adjudicated own case';exception when check_violation then if sqlerrm<>'adjudicator_must_be_independent' then raise;end if;end;
 begin perform proctor_command(senior,tenant,'adj-short-001','case.adjudicate',jsonb_build_object('case_id',case_id,'disposition','clear','rationale','ok'));raise exception 'Empty rationale accepted';exception when invalid_parameter_value then null;end;
 -- Disclosure waits for a decision.
 begin perform proctor_command(senior,tenant,'adj-disc-early','case.disclose',jsonb_build_object('case_id',case_id,'summary','Your test was reviewed and no concern was found.'));raise exception 'Disclosed before resolution';exception when check_violation then if sqlerrm<>'case_not_resolved' then raise;end if;end;
 result:=proctor_command(senior,tenant,'adj-decide-01','case.adjudicate',jsonb_build_object('case_id',case_id,'disposition','clear','rationale','Break log explains every absence; no evidence of outside help.'));
 replay:=proctor_command(senior,tenant,'adj-decide-01','case.adjudicate',jsonb_build_object('case_id',case_id,'disposition','clear','rationale','Break log explains every absence; no evidence of outside help.'));
 if replay<>result or (select state||':'||disposition from proctor_review_cases where id=case_id)<>'resolved:clear' then raise exception 'Adjudication wrong: %',result;end if;
 begin perform proctor_command(senior,tenant,'adj-decide-02','case.adjudicate',jsonb_build_object('case_id',case_id,'disposition','confirmed','rationale','Changing my mind about this decision.'));raise exception 'Second decision accepted';exception when check_violation then if sqlerrm<>'case_resolved' then raise;end if;end;
 begin perform proctor_command(second,tenant,'adj-find-late','case.finding',jsonb_build_object('case_id',case_id,'disposition','confirmed','rationale','Late finding after the decision.','evidence_event_ids','[]'::jsonb));raise exception 'Finding after decision accepted';exception when check_violation then null;end;
 -- The candidate sees the explanation, once, and nothing about other people.
 if jsonb_array_length(public.proctor_candidate_outcomes(candidate,tenant))<>0 then raise exception 'Outcome visible before disclosure';end if;
 perform proctor_command(senior,tenant,'adj-disc-0001','case.disclose',jsonb_build_object('case_id',case_id,'summary','Your test was reviewed by our staff. The time away from the test matched your approved breaks, so no concern was recorded.'));
 begin perform proctor_command(senior,tenant,'adj-disc-0002','case.disclose',jsonb_build_object('case_id',case_id,'summary','A different explanation sent a second time.'));raise exception 'Second disclosure accepted';exception when unique_violation then null;end;
 result:=public.proctor_candidate_outcomes(candidate,tenant);
 if jsonb_array_length(result)<>1 or result->0->>'disposition'<>'clear' or result->0->>'sitting'<>'Adjudicated sitting' or result->0 ? 'rationale' then raise exception 'Candidate outcome wrong: %',result;end if;
 if jsonb_array_length(public.proctor_candidate_outcomes(first,tenant))<>0 then raise exception 'Outcome leaked to another person';end if;
 result:=public.proctor_case_outcome(second,tenant,case_id);
 if result#>>'{adjudication,disposition}'<>'clear' or result#>>'{disclosure,disposition}'<>'clear' then raise exception 'Staff case outcome wrong: %',result;end if;
 begin perform public.proctor_case_outcome(candidate,tenant,case_id);raise exception 'Candidate read the staff case outcome';exception when no_data_found then null;end;
 -- An agreeing quorum still resolves without a senior decision.
 agreed:=(proctor_command(second,tenant,'adj-case-0002','case.create',jsonb_build_object('session_id',session,'title','Copy and paste attempt'))->>'id')::uuid;
 perform proctor_command(first,tenant,'adj-find-0003','case.finding',jsonb_build_object('case_id',agreed,'disposition','insufficient_evidence','rationale','A single paste with no matching content.','evidence_event_ids','[]'::jsonb));
 perform proctor_command(second,tenant,'adj-find-0004','case.finding',jsonb_build_object('case_id',agreed,'disposition','insufficient_evidence','rationale','Agree: one paste of the candidate own text.','evidence_event_ids','[]'::jsonb));
 if (select state from proctor_review_cases where id=agreed)<>'resolved' then raise exception 'Agreeing quorum did not resolve';end if;
 begin perform proctor_command(senior,tenant,'adj-agreed-01','case.adjudicate',jsonb_build_object('case_id',agreed,'disposition','confirmed','rationale','Overriding an agreed outcome here.'));raise exception 'Agreed outcome overridden';exception when check_violation then null;end;
 -- History is immutable and private.
 begin update proctor_case_adjudications set disposition='confirmed';raise exception 'Adjudication rewritten';exception when others then if sqlerrm like '%rewritten%' then raise;end if;end;
 begin delete from proctor_case_disclosures;raise exception 'Disclosure deleted';exception when others then if sqlerrm like '%deleted%' then raise;end if;end;
 if (select count(*) from proctor_case_adjudications)<>1 or (select count(*) from proctor_case_disclosures)<>1 then raise exception 'Immutable history changed';end if;
 if has_table_privilege('authenticated','public.proctor_case_disclosures','select') or has_function_privilege('authenticated','public.proctor_candidate_outcomes(uuid,uuid)','execute') then raise exception 'Outcomes exposed to clients';end if;
end $$;
rollback;
