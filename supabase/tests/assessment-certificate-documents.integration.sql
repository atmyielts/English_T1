\set ON_ERROR_STOP on
begin;
alter table public.users add column full_name text;alter table public.tenants add column name text;
update public.users set full_name='Dilshod Karimov' where id='00000000-0000-4000-8000-000000000003';update public.tenants set name='Assessment test center';
-- Crypto/rendering are separately native-tested; these signature shapes test
-- only canonical custody, state predicates and authority, not cryptography.
do $$declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';reviewer uuid:='00000000-0000-4000-8000-000000000002';candidate uuid:='00000000-0000-4000-8000-000000000003';program uuid;cid uuid;run public.assessment_grading_runs;record jsonb;result jsonb;payload_hash text;prior_scores jsonb;begin
 select jsonb_agg(to_jsonb(s) order by id) into prior_scores from public.assessment_score_revisions s;
 select r.* into run from public.assessment_grading_runs r join public.assessment_attempts a on a.id=r.attempt_id join public.assessment_registrations g on g.id=a.registration_id join public.assessment_exam_windows w on w.id=g.window_id where w.title='Grading sitting' and r.generation=2;
 program:=(public.assessment_certificate_command(owner,t,'pdf-program-create','program.create','{"title":"Placement award","description":"Independently approved award for a released result.","minimum_percent":0,"valid_days":365}')->>'id')::uuid;
 perform public.assessment_certificate_command(reviewer,t,'pdf-program-approve','program.approve',jsonb_build_object('id',program,'review_hash',public.assessment_certificate_program_hash(program)));
 cid:=(public.assessment_certificate_command(owner,t,'pdf-certificate-prepare','certificate.prepare',jsonb_build_object('program_id',program,'attempt_id',run.attempt_id,'score_revision_id',run.score_revision_id,'key_id','doc-fixture-key'))->>'id')::uuid;
 select c.payload_hash into payload_hash from public.assessment_certificates c where c.id=cid;
 begin perform public.assessment_certificate_reference(cid,'doc-fixture-key',payload_hash,repeat('A',86));raise exception 'Pending reference disclosed recipient';exception when no_data_found then null;end;
 perform public.assessment_certificate_seal(owner,t,cid,'doc-fixture-key',payload_hash,repeat('A',86));
 record:=public.assessment_certificate_reference(cid,'doc-fixture-key',payload_hash,repeat('A',86));
 if record#>>'{record,id}'<>cid::text or jsonb_array_length(record->'documents')<>0 then raise exception 'Reference lost exact signing record';end if;
 begin perform public.assessment_certificate_reference(cid,'doc-fixture-key',payload_hash,repeat('B',86));raise exception 'ID/hash without holder signature disclosed claims';exception when no_data_found then null;end;
 begin perform public.assessment_certificate_reference(cid,'wrong-key',payload_hash,repeat('A',86));raise exception 'Wrong key resolved identity';exception when no_data_found then null;end;
 result:=public.assessment_certificate_document_report(candidate,t,cid,payload_hash,repeat('a',64),'en',repeat('b',64),1024);
 if public.assessment_certificate_document_report(candidate,t,cid,payload_hash,repeat('a',64),'en',repeat('b',64),1024)<>result then raise exception 'Document retry changed immutable receipt';end if;
 begin perform public.assessment_certificate_document_report(owner,t,cid,payload_hash,repeat('a',64),'en',repeat('c',64),1024);raise exception 'Same renderer/language changed original bytes';exception when unique_violation then null;end;
 begin perform public.assessment_certificate_document_report('00000000-0000-4000-8000-000000000004',t,cid,payload_hash,repeat('a',64),'ru',repeat('b',64),1024);raise exception 'Foreign actor recorded private document';exception when insufficient_privilege then null;end;
 begin perform public.assessment_certificate_document_report(candidate,t,cid,repeat('f',64),repeat('a',64),'en',repeat('b',64),1024);raise exception 'Foreign payload digest recorded';exception when unique_violation then null;end;
 begin update public.assessment_certificate_documents set sha256=repeat('d',64) where certificate_id=cid;raise exception 'Document provenance changed';exception when check_violation then null;end;
 record:=public.assessment_certificate_reference(cid,'doc-fixture-key',payload_hash,repeat('A',86));if jsonb_array_length(record->'documents')<>1 or record#>>'{documents,0,sha256}'<>repeat('b',64) then raise exception 'Reference omitted rendered-file proof';end if;
 perform public.assessment_certificate_command(owner,t,'pdf-permanent-revocation','certificate.revoke',jsonb_build_object('id',cid,'expected_revision',2,'reason','Institution revoked the original award after review.'));
 if public.assessment_certificate_status(cid,'doc-fixture-key',payload_hash,repeat('A',86))->>'status'<>'revoked' then raise exception 'QR reference hid revocation';end if;
 perform public.assessment_certificate_document_report(candidate,t,cid,payload_hash,repeat('a',64),'en',repeat('b',64),1024);
 if(select count(*) from public.assessment_certificate_documents)<>1 or(select count(*) from public.assessment_audit_events where action='certificates.document.rendered')<>1 then raise exception 'Report/revocation duplicated document or audit';end if;
 if(select jsonb_agg(to_jsonb(s) order by id) from public.assessment_score_revisions s) is distinct from prior_scores then raise exception 'Document custody changed academic scores';end if;
 if has_function_privilege('anon','public.assessment_certificate_reference(uuid,text,text,text)','execute') or has_table_privilege('authenticated','public.assessment_certificate_documents','select') or has_table_privilege('service_role','public.assessment_certificate_documents','insert') then raise exception 'Private document custody exposed';end if;
end;$$;
rollback;
