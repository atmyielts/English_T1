\set ON_ERROR_STOP on
begin;
alter table users add column full_name text;
alter table tenants add column name text;
update users set full_name='Dilshod Karimov' where id='00000000-0000-4000-8000-000000000003';
update tenants set name='Assessment test center';
do $$ declare tenant uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';reviewer uuid:='00000000-0000-4000-8000-000000000002';candidate uuid:='00000000-0000-4000-8000-000000000003';run assessment_grading_runs;old_run assessment_grading_runs;program uuid;strict_program uuid;certificate uuid;result jsonb;input jsonb;material jsonb;visible jsonb;before_scores jsonb;withdrawal jsonb;future_score uuid;future_run uuid;cancel_program uuid;cancel_id uuid;
begin
 if public.assessment_has_capability(tenant,'00000000-0000-4000-8000-000000000007','certificates.manage') then raise exception 'Result publisher inherited certificate rights';end if;
 perform assessment_staff_command(owner,tenant,'cert-permission-grant','capability.grant','{"user_id":"00000000-0000-4000-8000-000000000007","capability":"certificates.manage","expected_revision":0,"reason":"Explicit certificate permission"}');
 if not (assessment_grading_read('00000000-0000-4000-8000-000000000007',tenant,'access')->>'can_manage_certificates')::boolean then raise exception 'Dedicated certificate permission absent from workspace';end if;
 select r.* into run from assessment_grading_runs r join assessment_attempts a on a.id=r.attempt_id join assessment_registrations g on g.id=a.registration_id join assessment_exam_windows w on w.id=g.window_id where w.title='Grading sitting' and r.generation=2;
 select * into old_run from assessment_grading_runs where attempt_id=run.attempt_id and generation=1;
 select jsonb_agg(to_jsonb(s) order by id) into before_scores from assessment_score_revisions s where attempt_id=run.attempt_id;
 result:=assessment_certificate_command(owner,tenant,'cert-program-create','program.create','{"title":"Mathematics placement","description":"Approved score meets the 70 percent criterion.","minimum_percent":70,"valid_days":365}');program:=(result->>'id')::uuid;
 begin perform assessment_certificate_command(owner,tenant,'cert-own-program-approve','program.approve',jsonb_build_object('id',program,'review_hash',assessment_certificate_program_hash(program)));raise exception 'Creator approved own program';exception when insufficient_privilege then null;end;
 input:=jsonb_build_object('attempt_id',run.attempt_id,'score_revision_id',run.score_revision_id,'program_id',program,'key_id','key-a');
 begin perform assessment_certificate_command(owner,tenant,'cert-unapproved-program','certificate.prepare',input);raise exception 'Unapproved program issued';exception when check_violation then null;end;
 perform assessment_certificate_command(reviewer,tenant,'cert-review-program','program.approve',jsonb_build_object('id',program,'review_hash',assessment_certificate_program_hash(program)));
 begin update assessment_certificate_programs set minimum_percent=0 where id=program;raise exception 'Approved criteria mutated';exception when check_violation then null;end;
 begin perform assessment_certificate_command(candidate,tenant,'cert-candidate-bypass','certificate.prepare',input);raise exception 'Candidate issued credential';exception when insufficient_privilege then null;end;
 begin perform assessment_certificate_command(owner,tenant,'cert-old-result','certificate.prepare',jsonb_set(input,'{score_revision_id}',to_jsonb(old_run.score_revision_id)));raise exception 'Superseded score issued';exception when check_violation then null;end;
 begin perform assessment_certificate_command(owner,'10000000-0000-4000-8000-000000000002','cert-foreign-tenant','certificate.prepare',input);raise exception 'Foreign certificate issued';exception when insufficient_privilege then null;end;
 result:=assessment_certificate_command(owner,tenant,'cert-strict-program','program.create','{"title":"Excellence","description":"At least 90 percent required.","minimum_percent":90}');strict_program:=(result->>'id')::uuid;perform assessment_certificate_command(reviewer,tenant,'cert-strict-approval','program.approve',jsonb_build_object('id',strict_program,'review_hash',assessment_certificate_program_hash(strict_program)));
 begin perform assessment_certificate_command(owner,tenant,'cert-under-threshold','certificate.prepare',jsonb_set(input,'{program_id}',to_jsonb(strict_program)));raise exception 'Under-threshold certificate issued';exception when check_violation then null;end;
 result:=assessment_certificate_command(owner,tenant,'cert-first-issuance','certificate.prepare',input);certificate:=(result->>'id')::uuid;
 if jsonb_array_length(assessment_certificate_read(candidate,tenant,'candidate'))<>0 then raise exception 'Candidate saw unsigned preparation';end if;
 if assessment_certificate_command(owner,tenant,'cert-first-issuance','certificate.prepare',jsonb_set(input,'{key_id}','"key-b"'))<>result then raise exception 'Key rotation changed preparation receipt';end if;
 material:=assessment_certificate_read(owner,tenant,'signing',certificate);
 if material->>'key_id'<>'key-a' or material->>'payload_hash'<>encode(sha256(convert_to(material->>'payload_text','UTF8')),'hex') or (material->>'payload_text')::jsonb->>'recipient'<>'Dilshod Karimov' then raise exception 'Canonical signing snapshot incorrect';end if;
 begin perform assessment_certificate_seal(owner,tenant,certificate,'key-b',material->>'payload_hash',repeat('A',86));raise exception 'Different signing key sealed preparation';exception when unique_violation then null;end;
 -- SQL fixtures use an explicit synthetic signature shape; real Ed25519 is covered by API/browser tests.
 result:=assessment_certificate_seal(owner,tenant,certificate,'key-a',material->>'payload_hash',repeat('A',86));
 if assessment_certificate_seal(owner,tenant,certificate,'key-a',material->>'payload_hash',repeat('A',86))<>result then raise exception 'Seal replay duplicated receipt';end if;
 if assessment_certificate_status(certificate,'key-a',material->>'payload_hash',repeat('A',86))->>'status'<>'valid' then raise exception 'Issued certificate not valid';end if;
 visible:=assessment_certificate_read(candidate,tenant,'download',certificate);if visible->>'signature'<>repeat('A',86) then raise exception 'Candidate cannot download own certificate';end if;
 begin perform assessment_certificate_read('00000000-0000-4000-8000-000000000004',tenant,'download',certificate);raise exception 'Foreign candidate downloaded identity';exception when insufficient_privilege then null;end;
 begin update assessment_certificates set payload_text='{}' where id=certificate;raise exception 'Signed claims mutable';exception when check_violation then null;end;
 begin
  -- Canonical-shape seeded release exercises status supersession, not worker execution.
  insert into assessment_score_revisions(tenant_id,attempt_id,scores,status,source,approved_by) select tenant_id,attempt_id,scores,status,source,approved_by from assessment_score_revisions where id=run.score_revision_id returning id into future_score;
  insert into assessment_grading_runs(tenant_id,attempt_id,generation,input_hash,scorer_version,objective_scores,policy_snapshot,status,approved_by,approved_at,approved_hash,score_revision_id)
   values(tenant,run.attempt_id,3,run.input_hash,run.scorer_version,run.objective_scores,run.policy_snapshot,'released',owner,clock_timestamp(),run.approved_hash,future_score) returning id into future_run;
  insert into assessment_grading_releases(tenant_id,run_id,score_revision_id,release_at,released_by) values(tenant,future_run,future_score,clock_timestamp(),owner);
  if assessment_certificate_status(certificate,'key-a',material->>'payload_hash',repeat('A',86))->>'status'<>'superseded' then raise exception 'New released generation did not supersede credential';end if;
  raise exception 'rollback supersession fixture' using errcode='ZX010';
 exception when sqlstate 'ZX010' then null;end;
 result:=assessment_certificate_command(owner,tenant,'cert-cancel-program','program.create','{"title":"Cancellation fixture","description":"At least 70 percent","minimum_percent":70}');cancel_program:=(result->>'id')::uuid;
 perform assessment_certificate_command(reviewer,tenant,'cert-cancel-program-review','program.approve',jsonb_build_object('id',cancel_program,'review_hash',assessment_certificate_program_hash(cancel_program)));
 result:=assessment_certificate_command(owner,tenant,'cert-cancel-preparation','certificate.prepare',jsonb_build_object('attempt_id',run.attempt_id,'score_revision_id',run.score_revision_id,'program_id',cancel_program,'key_id','key-a'));cancel_id:=(result->>'id')::uuid;
 perform assessment_certificate_command(owner,tenant,'cert-cancel-receipt','certificate.cancel',jsonb_build_object('id',cancel_id,'expected_revision',1,'reason','Cancel unfinished issuance.'));
 if (select state from assessment_certificates where id=cancel_id)<>'cancelled' or jsonb_array_length(assessment_certificate_read(candidate,tenant,'candidate'))<>1 then raise exception 'Cancelled preparation was exposed as issued';end if;
 begin perform assessment_certificate_seal(owner,tenant,cancel_id,'key-a',(select payload_hash from assessment_certificates where id=cancel_id),repeat('A',86));raise exception 'Cancelled preparation sealed';exception when unique_violation then null;end;
 begin
  -- An expired immutable historical row with a synthetic signature shape exercises
  -- the time predicate. Cryptographic signatures are checked in API/browser tests.
  insert into assessment_certificate_programs(tenant_id,title,description,minimum_percent,valid_days,created_by,approved_by,approved_at) values(tenant,'Historical expiry fixture','At least 70 percent',70,365,owner,reviewer,clock_timestamp()) returning id into cancel_program;
  cancel_id:=gen_random_uuid();visible:=jsonb_set(jsonb_set(jsonb_set((material->>'payload_text')::jsonb,'{certificate_id}',to_jsonb(cancel_id)),'{issued_at}','"2020-01-01T00:00:00Z"'),'{expires_at}','"2021-01-01T00:00:00Z"');
  visible:=jsonb_set(visible,'{program_id}',to_jsonb(cancel_program));
  insert into assessment_certificates(id,tenant_id,program_id,attempt_id,run_id,score_revision_id,candidate_id,state,revision,key_id,payload_text,payload_hash,signature,prepared_by,prepared_at,sealed_at,expires_at)
   values(cancel_id,tenant,cancel_program,run.attempt_id,run.id,run.score_revision_id,candidate,'issued',2,'key-a',visible::text,encode(sha256(convert_to(visible::text,'UTF8')),'hex'),repeat('A',86),owner,'2020-01-01','2020-01-01','2021-01-01');
  if assessment_certificate_status(cancel_id,'key-a',encode(sha256(convert_to(visible::text,'UTF8')),'hex'),repeat('A',86))->>'status'<>'expired' then raise exception 'Expired credential appeared valid';end if;
  raise exception 'rollback expiration fixture' using errcode='ZX011';
 exception when sqlstate 'ZX011' then null;end;
 -- A live challenge must make an already issued certificate explicitly under review.
 perform assessment_appeal_command(candidate,tenant,'cert-appeal-submission','appeal.submit',jsonb_build_object('attempt_id',run.attempt_id,'score_revision_id',run.score_revision_id,'category','scoring','reason','Review the result after issuance.'));
 if assessment_certificate_status(certificate,'key-a',material->>'payload_hash',repeat('A',86))->>'status'<>'under_review' then raise exception 'Live appeal not reflected in certificate status';end if;
 input:=jsonb_build_object('id',certificate,'expected_revision',2,'reason','Institution corrected its award decision.');perform assessment_certificate_command(owner,tenant,'cert-revocation','certificate.revoke',input);
 if assessment_certificate_status(certificate,'key-a',material->>'payload_hash',repeat('A',86))->>'status'<>'revoked' then raise exception 'Revocation not effective';end if;
 if assessment_certificate_command(owner,tenant,'cert-revocation','certificate.revoke',input)->>'id'<>certificate::text then raise exception 'Revocation lost receipt';end if;
 update tenant_memberships set status='inactive' where tenant_id=tenant and user_id=owner;
 begin perform assessment_certificate_command(owner,tenant,'cert-revocation','certificate.revoke',input);raise exception 'Revoked manager replayed receipt';exception when insufficient_privilege then null;end;
 if (select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s where attempt_id=run.attempt_id) is distinct from before_scores then raise exception 'Certificates modified academic scores';end if;
 if (select count(*) from assessment_audit_events where action='certificates.issued' and target_id=certificate)<>1 or (select count(*) from domain_event_outbox where aggregate_id=certificate and event_type='assessment.certificate.issued')<>1 then raise exception 'Issuance retry duplicated audit/notification intent';end if;
end; $$;
set role authenticated;
do $$ begin
 begin perform * from assessment_certificates;raise exception 'Raw signed claims readable';exception when insufficient_privilege then null;end;
 begin perform assessment_certificate_status(gen_random_uuid(),'key-a',repeat('a',64),repeat('A',86));raise exception 'Public SQL status bypass accepted';exception when insufficient_privilege then null;end;
 begin perform assessment_certificate_seal(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'key-a',repeat('a',64),repeat('A',86));raise exception 'Candidate seal bypass accepted';exception when insufficient_privilege then null;end;
end; $$;
reset role;
rollback;
