\set ON_ERROR_STOP on
begin;
alter table public.users add column full_name text;alter table public.tenants add column name text;
update public.users set full_name='Dilshod Karimov' where id='00000000-0000-4000-8000-000000000003';update public.tenants set name='Assessment test center';
-- Synthetic signature shapes prove SQL state custody, not crypto. Native API and
-- connected browser acceptance independently verify real Ed25519 credentials.
do $$declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';reviewer uuid:='00000000-0000-4000-8000-000000000002';candidate uuid:='00000000-0000-4000-8000-000000000003';program uuid;draft uuid;root_id uuid;cancelled uuid;child uuid;grandchild uuid;blocked uuid;run public.assessment_grading_runs;input jsonb;material jsonb;original jsonb;before_scores jsonb;receipt jsonb;retirement jsonb;begin
 select jsonb_agg(to_jsonb(s) order by id) into before_scores from public.assessment_score_revisions s;
 select r.* into run from public.assessment_grading_runs r join public.assessment_attempts a on a.id=r.attempt_id join public.assessment_registrations g on g.id=a.registration_id join public.assessment_exam_windows w on w.id=g.window_id where w.title='Grading sitting' and r.generation=2;
 program:=(public.assessment_certificate_command(owner,t,'life-program-create','program.create','{"title":"Placement award","description":"Reviewed released result threshold.","minimum_percent":70,"valid_days":365}')->>'id')::uuid;
 perform public.assessment_certificate_command(reviewer,t,'life-program-approve','program.approve',jsonb_build_object('id',program,'review_hash',public.assessment_certificate_program_hash(program)));
 input:=jsonb_build_object('program_id',program,'attempt_id',run.attempt_id,'score_revision_id',run.score_revision_id,'key_id','lifecycle-key');
 root_id:=(public.assessment_certificate_command(owner,t,'life-root-prepare','certificate.prepare',input)->>'id')::uuid;
 material:=public.assessment_certificate_read(owner,t,'signing',root_id);perform public.assessment_certificate_seal(owner,t,root_id,'lifecycle-key',material->>'payload_hash',repeat('A',86));original:=public.assessment_certificate_read(candidate,t,'download',root_id);
 begin perform public.assessment_certificate_command(owner,t,'life-root-duplicate','certificate.prepare',input);raise exception 'Ordinary issuance bypassed root uniqueness';exception when unique_violation then null;end;
 input:=input||jsonb_build_object('id',root_id,'expected_revision',2,'reason','Reissue with the current recorded recipient name.');
 perform public.assessment_staff_command(owner,t,'life-candidate-grant','capability.grant',jsonb_build_object('user_id',candidate,'capability','certificates.manage','expected_revision',0,'reason','Fixture proves self-award denial even with explicit manager capability.'));
 begin perform public.assessment_certificate_command(candidate,t,'life-candidate-replace','certificate.replace.prepare',input);raise exception 'Candidate replaced own certificate';exception when insufficient_privilege then if sqlerrm<>'candidate_certificate_self_issue' then raise;end if;end;
 begin perform public.assessment_certificate_command(owner,'10000000-0000-4000-8000-000000000002','life-foreign-replace','certificate.replace.prepare',input);raise exception 'Foreign tenant replacement allowed';exception when insufficient_privilege then null;end;
 begin perform public.assessment_certificate_command(owner,t,'life-stale-replace','certificate.replace.prepare',input||'{"expected_revision":1}');raise exception 'Stale replacement accepted';exception when unique_violation then null;end;
 begin perform public.assessment_certificate_command(owner,t,'life-wrong-subject','certificate.replace.prepare',input||jsonb_build_object('attempt_id',gen_random_uuid()));raise exception 'Replacement changed academic subject';exception when check_violation then null;end;
 cancelled:=(public.assessment_certificate_command(owner,t,'life-cancel-prepare','certificate.replace.prepare',input)->>'id')::uuid;
 if public.assessment_certificate_status(root_id,'lifecycle-key',original->>'payload_hash',repeat('A',86))->>'status'<>'valid' or jsonb_array_length(public.assessment_certificate_read(candidate,t,'candidate'))<>1 then raise exception 'Unsealed replacement hid original or disclosed pending identity';end if;
 begin perform public.assessment_certificate_command(owner,t,'life-duplicate-successor','certificate.replace.prepare',input);raise exception 'Two active successor intents allowed';exception when unique_violation then null;end;
 perform public.assessment_certificate_command(owner,t,'life-cancel-replacement','certificate.cancel',jsonb_build_object('id',cancelled,'expected_revision',1,'reason','Withdraw unfinished correction.'));
 update public.users set full_name='Dilshod O‘ktamov Karimov' where id=candidate;
 receipt:=public.assessment_certificate_command(owner,t,'life-child-prepare','certificate.replace.prepare',input);child:=(receipt->>'id')::uuid;
 if public.assessment_certificate_command(owner,t,'life-child-prepare','certificate.replace.prepare',input||'{"key_id":"rotated-key"}')<>receipt then raise exception 'Rotation changed replacement receipt';end if;
 begin perform public.assessment_certificate_command(owner,t,'life-child-prepare','certificate.replace.prepare',input||'{"reason":"Changed reviewed reason"}');raise exception 'Replay changed replacement review';exception when unique_violation then null;end;
 material:=public.assessment_certificate_read(owner,t,'signing',child);
 if(material->>'payload_text')::jsonb->>'replaces_certificate_id'<>root_id::text or(material->>'payload_text')::jsonb->>'recipient'<>'Dilshod O‘ktamov Karimov' then raise exception 'Replacement claims lost signed predecessor/current recorded identity';end if;
 perform public.assessment_certificate_seal(owner,t,child,'lifecycle-key',material->>'payload_hash',repeat('B',86));perform public.assessment_certificate_seal(owner,t,child,'lifecycle-key',material->>'payload_hash',repeat('B',86));
 if public.assessment_certificate_status(root_id,'lifecycle-key',original->>'payload_hash',repeat('A',86))->>'status'<>'replaced' or public.assessment_certificate_status(root_id,'lifecycle-key',original->>'payload_hash',repeat('A',86))->>'replacement_id'<>child::text then raise exception 'Original status did not retain sealed successor';end if;
 if public.assessment_certificate_status(root_id,'wrong-key',original->>'payload_hash',repeat('A',86))->>'status'<>'not_found' then raise exception 'Identifier alone disclosed replacement metadata';end if;
 if public.assessment_certificate_read(candidate,t,'download',root_id)<>original then raise exception 'Replacement rewrote original signed bytes';end if;
 if(select count(*) from public.assessment_audit_events where action='certificates.replaced' and target_id=root_id)<>1 or(select count(*) from public.domain_event_outbox where aggregate_id=root_id and event_type='assessment.certificate.replaced')<>1 then raise exception 'Replacement duplicated consequential history';end if;
 -- A second link remains independent; revoking it must not revive its ancestors.
 input:=input||jsonb_build_object('id',child,'reason','Further reviewed institutional reissue.');
 grandchild:=(public.assessment_certificate_command(owner,t,'life-grandchild-prepare','certificate.replace.prepare',input)->>'id')::uuid;
 material:=public.assessment_certificate_read(owner,t,'signing',grandchild);perform public.assessment_certificate_seal(owner,t,grandchild,'lifecycle-key',material->>'payload_hash',repeat('C',86));
 perform public.assessment_certificate_command(owner,t,'life-grandchild-revoke','certificate.revoke',jsonb_build_object('id',grandchild,'expected_revision',2,'reason','Institution permanently withdrew this award.'));
 if public.assessment_certificate_status(child,'lifecycle-key',(select payload_hash from public.assessment_certificates where id=child),repeat('B',86))->>'status'<>'replaced' then raise exception 'Revoked successor revived predecessor';end if;
 begin perform public.assessment_certificate_command(owner,t,'life-revoked-replace','certificate.replace.prepare',input||jsonb_build_object('id',grandchild));raise exception 'Revoked award resurrected through replacement';exception when unique_violation then null;end;
 -- A new program tests retirement between prepare and seal without touching the
 -- already sealed chain. Replay of sealed material remains possible afterward.
 draft:=(public.assessment_certificate_command(owner,t,'life-retire-program','program.create','{"title":"New award policy","description":"Reviewed current threshold.","minimum_percent":0}')->>'id')::uuid;
 perform public.assessment_certificate_command(reviewer,t,'life-retire-approve','program.approve',jsonb_build_object('id',draft,'review_hash',public.assessment_certificate_program_hash(draft)));
 blocked:=(public.assessment_certificate_command(owner,t,'life-before-retirement','certificate.prepare',jsonb_build_object('program_id',draft,'attempt_id',run.attempt_id,'score_revision_id',run.score_revision_id,'key_id','lifecycle-key'))->>'id')::uuid;
 retirement:=jsonb_build_object('id',draft,'review_hash',public.assessment_certificate_program_hash(draft),'reason','Stop new awards under this obsolete policy.');
 begin perform public.assessment_certificate_command(owner,t,'life-bad-retirement','program.retire',retirement||jsonb_build_object('review_hash',repeat('f',64)));raise exception 'Unreviewed retirement accepted';exception when unique_violation then null;end;
 receipt:=public.assessment_certificate_command(owner,t,'life-retire-command','program.retire',retirement);
 if public.assessment_certificate_command(owner,t,'life-retire-command','program.retire',retirement)<>receipt then raise exception 'Retirement replay changed receipt';end if;
 begin perform public.assessment_certificate_command(owner,t,'life-after-retirement','certificate.prepare',jsonb_build_object('program_id',draft,'attempt_id',run.attempt_id,'score_revision_id',run.score_revision_id,'key_id','lifecycle-key'));raise exception 'Retired program admitted new award';exception when check_violation then null;end;
 material:=public.assessment_certificate_read(owner,t,'signing',blocked);
 begin perform public.assessment_certificate_seal(owner,t,blocked,'lifecycle-key',material->>'payload_hash',repeat('D',86));raise exception 'Retired program sealed pending award';exception when check_violation then null;end;
 perform public.assessment_certificate_command(owner,t,'life-blocked-cancel','certificate.cancel',jsonb_build_object('id',blocked,'expected_revision',1,'reason','Program retired before signature committed.'));
 perform public.assessment_certificate_command(owner,t,'life-retire-old-program','program.retire',jsonb_build_object('id',program,'review_hash',public.assessment_certificate_program_hash(program),'reason','Close old award policy.'));
 perform public.assessment_certificate_seal(owner,t,root_id,'lifecycle-key',original->>'payload_hash',repeat('A',86));
 if public.assessment_certificate_read(candidate,t,'download',root_id)<>original then raise exception 'Retirement altered original claims';end if;
 begin update public.assessment_certificate_program_retirements set reason='Changed history';raise exception 'Retirement mutable';exception when check_violation then null;end;
 begin update public.assessment_certificate_replacement_preparations set reason='Changed history';raise exception 'Replacement intent mutable';exception when check_violation then null;end;
 begin update public.assessment_certificates set replaces_certificate_id=null where id=child;raise exception 'Signed predecessor mutable';exception when check_violation then null;end;
 if (select jsonb_agg(to_jsonb(s) order by id) from public.assessment_score_revisions s) is distinct from before_scores then raise exception 'Credential lifecycle changed scores';end if;
 if has_function_privilege('service_role','public.assessment_certificate_seal_v33(uuid,uuid,uuid,text,text,text)','execute') or has_function_privilege('anon','public.assessment_certificate_command(uuid,uuid,text,text,jsonb)','execute') or has_table_privilege('service_role','public.assessment_certificate_replacement_preparations','insert') then raise exception 'Lifecycle bypass granted';end if;
end;$$;
rollback;
