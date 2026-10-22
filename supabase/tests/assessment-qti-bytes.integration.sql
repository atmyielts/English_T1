\set ON_ERROR_STOP on
begin;
do $$declare a uuid:='00000000-0000-4000-8000-000000000001';t uuid:='10000000-0000-4000-8000-000000000001';bank uuid;job uuid;data jsonb;ticket jsonb;scan jsonb;legacy jsonb;ack jsonb;
begin
 if has_function_privilege('service_role','public.assessment_qti_report_before_bytes(uuid,text,uuid,text,jsonb)','execute') or has_function_privilege('authenticated','public.assessment_qti_command_before_bytes(uuid,uuid,text,text,jsonb)','execute') or has_function_privilege('service_role','public.assessment_qti_read_before_bytes(uuid,uuid,uuid,integer,integer)','execute') then raise exception 'Private byte wrappers bypassable';end if;
 bank:=(assessment_command(a,t,'qti-byte-bank','bank.create','{"title":"Byte verification authority"}')->>'id')::uuid;
 data:=jsonb_build_object('bank_id',bank,'filename','bytes.zip','source_hash',repeat('a',64),'processor_id',repeat('f',64),'byte_length',22,'parts',jsonb_build_array(jsonb_build_object('sha256',repeat('a',64),'byte_length',22)));
 job:=(assessment_qti_command(a,t,'qti-byte-source','source.begin',data)->>'id')::uuid;
 perform assessment_qti_transport(a,t,'part.receipt',jsonb_build_object('job_id',job,'index',0,'sha256',repeat('a',64),'byte_length',22,'cipher_sha256',repeat('b',64),'iv',repeat('c',24),'key_id','test-only','etag','byte-test','object_key','assessment-qti/'||t||'/'||job||'/0/'||repeat('a',64)));
 perform assessment_qti_transport(a,t,'complete',jsonb_build_object('job_id',job));
 ticket:=assessment_qti_claim('scan',repeat('f',64),1)->0;
 legacy:=jsonb_build_object('source_hash',repeat('a',64),'byte_length',22,'verdict','clean','engine_version','SQL metadata fixture only - not AV','signature_version',repeat('d',64),'report_hash',repeat('e',64));
 begin perform assessment_qti_report(job,'scan',(ticket->>'lease_token')::uuid,repeat('f',64),legacy);raise exception 'Legacy scan newly admitted';exception when check_violation then null;end;
 scan:=legacy||jsonb_build_object('schema_version','assessment.qti-scan.v2','scan_performed',true,'observed_source_hash',repeat('a',64),'reason','clean');
 begin perform assessment_qti_report(job,'scan',(ticket->>'lease_token')::uuid,repeat('f',64),scan||'{"scan_performed":false}');raise exception 'Unperformed clean scan accepted';exception when check_violation then null;end;
 begin perform assessment_qti_report(job,'scan',(ticket->>'lease_token')::uuid,repeat('f',64),scan||jsonb_build_object('observed_source_hash',repeat('b',64)));raise exception 'Wrong-byte clean scan accepted';exception when check_violation then null;end;
 ack:=assessment_qti_report(job,'scan',(ticket->>'lease_token')::uuid,repeat('f',64),scan);
 if assessment_qti_report(job,'scan',(ticket->>'lease_token')::uuid,repeat('f',64),scan)<>ack then raise exception 'Verified scan replay changed';end if;
 if assessment_qti_read(a,t,job)->'scan'->'byte_verified' is distinct from 'true'::jsonb then raise exception 'Verified byte result not projected to authorized author';end if;
 -- Model a report committed before this additive upgrade, using the owner-only predecessor.
 -- Historical receipts can replay, but they cannot become new byte-verified clearance.
 perform assessment_qti_command(a,t,'qti-byte-cancel','cancel',jsonb_build_object('id',job,'expected_revision',(select revision from assessment_qti_jobs where id=job),'reason','End verified fixture'));
 data:=jsonb_set(data,'{source_hash}',to_jsonb(repeat('b',64)));
 job:=(assessment_qti_command(a,t,'qti-legacy-source','source.begin',data)->>'id')::uuid;
 perform assessment_qti_transport(a,t,'part.receipt',jsonb_build_object('job_id',job,'index',0,'sha256',repeat('a',64),'byte_length',22,'cipher_sha256',repeat('b',64),'iv',repeat('c',24),'key_id','test-only','etag','legacy-test','object_key','assessment-qti/'||t||'/'||job||'/0/'||repeat('a',64)));
 perform assessment_qti_transport(a,t,'complete',jsonb_build_object('job_id',job));ticket:=assessment_qti_claim('scan',repeat('f',64),1)->0;
 legacy:=legacy||jsonb_build_object('source_hash',repeat('b',64));
 ack:=assessment_qti_report_before_bytes(job,'scan',(ticket->>'lease_token')::uuid,repeat('f',64),legacy);
 if assessment_qti_report(job,'scan',(ticket->>'lease_token')::uuid,repeat('f',64),legacy)<>ack then raise exception 'Historical receipt lost';end if;
 if assessment_qti_read(a,t,job)->'scan'->'byte_verified' is distinct from 'false'::jsonb or assessment_qti_read(a,t,job)->'scan'->>'reason'<>'historical_metadata' then raise exception 'Historical scan projected as verified bytes';end if;
 ticket:=assessment_qti_claim('parse',repeat('f',64),1)->0;
 begin perform assessment_qti_report(job,'parse',(ticket->>'lease_token')::uuid,repeat('f',64),'{}');raise exception 'Historical metadata unlocked new parsing';exception when insufficient_privilege then null;end;
 begin perform assessment_qti_command(a,t,'legacy-new-adopt','adopt',jsonb_build_object('id',job));raise exception 'Historical metadata unlocked new adoption';exception when insufficient_privilege then null;end;
end;$$;
rollback;
