-- Gap-only canonical fixture for command concurrency, not physical capture/launch proof.
create table proctor_citation_race_ids(case_id uuid,recording_id uuid,head_hash text);
do $$ declare tenant uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';sid uuid;candidate uuid;rid uuid:=gen_random_uuid();entry jsonb;head text;result jsonb;begin
 select id,candidate_id into sid,candidate from proctor_sessions where tenant_id=tenant limit 1;
 insert into proctor_recordings(id,tenant_id,session_id,candidate_id,source,mime) values(rid,tenant,sid,candidate,'camera','video/webm');
 entry:=jsonb_build_object('schema','proctor.segment.v1','recording_id',rid,'sequence',1,'start_ms',0,'end_ms',1000,'previous_hash',repeat('0',64),'kind','gap','sha256',null,'byte_length',null,'parts',null,'reason','No footage in this gap-only concurrency fixture');head:=encode(sha256(convert_to(entry::text,'UTF8')),'hex');
 insert into proctor_recording_segments(tenant_id,recording_id,sequence,kind,state,start_ms,end_ms,reason,previous_hash,chain_hash,committed_at) values(tenant,rid,1,'gap','committed',0,1000,entry->>'reason',repeat('0',64),head,clock_timestamp());
 update proctor_recordings set last_sequence=1,head_hash=head,last_end_ms=1000 where id=rid;
 update proctor_recordings set state='sealed',close_reason='runtime_end',sealed_at=clock_timestamp() where id=rid;
 result:=proctor_command(owner,tenant,'citation-race-case-open','case.create',jsonb_build_object('session_id',sid,'title','Concurrent recording citations'));
 insert into proctor_citation_race_ids values((result->>'id')::uuid,rid,head);
end; $$;
