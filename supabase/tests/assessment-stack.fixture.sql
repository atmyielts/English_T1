-- Synthetic users and a real approved two-section examination for the connected stack test.
insert into users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');
insert into tenants values('10000000-0000-4000-8000-000000000001');
insert into tenant_memberships values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','active','owner'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','active','admin');
create table stack_test_ids(name text primary key,id uuid not null);
do $$ declare tenant uuid:='10000000-0000-4000-8000-000000000001'; author uuid:='00000000-0000-4000-8000-000000000001'; reviewer uuid:='00000000-0000-4000-8000-000000000002'; candidate uuid:='00000000-0000-4000-8000-000000000003';
 bank uuid; item1 uuid; item2 uuid; assessment uuid; version_id uuid; win uuid; reg uuid; result jsonb; definition jsonb; form jsonb; label text;
begin
 result:=assessment_command(author,tenant,'stack-bank-create','bank.create','{"title":"Connected stack bank"}');bank:=(result->>'id')::uuid;
 result:=assessment_command(author,tenant,'stack-item-first','item.create',jsonb_build_object('bank_id',bank,'item','{"schema_version":"assessment.item.v1","type":"single_choice","prompt":"First section prompt","locale":"en","max_score":1,"tags":[],"options":[{"id":"a","text":"4"},{"id":"b","text":"5"}]}'::jsonb,'key','{"correct":"a"}'::jsonb));item1:=(result->>'id')::uuid;
 result:=assessment_command(author,tenant,'stack-item-second','item.create',jsonb_build_object('bank_id',bank,'item','{"schema_version":"assessment.item.v1","type":"single_choice","prompt":"Second section prompt","locale":"en","max_score":1,"tags":[],"options":[{"id":"a","text":"4"},{"id":"b","text":"5"}]}'::jsonb,'key','{"correct":"b"}'::jsonb));item2:=(result->>'id')::uuid;
 perform assessment_command(author,tenant,'stack-submit-first','item.submit',jsonb_build_object('id',item1));perform assessment_command(reviewer,tenant,'stack-approve-first','item.approve',jsonb_build_object('id',item1));
 perform assessment_command(author,tenant,'stack-submit-second','item.submit',jsonb_build_object('id',item2));perform assessment_command(reviewer,tenant,'stack-approve-second','item.approve',jsonb_build_object('id',item2));
 definition:=jsonb_build_object('schema_version','assessment.definition.v1','title','Connected test','locale','en','duration_seconds',600,'shuffle_items',false,'shuffle_options',false,'sections',jsonb_build_array(
  jsonb_build_object('id','20000000-0000-4000-8000-000000000001','title','First','duration_seconds',300,'item_version_ids',jsonb_build_array(item1),'draw_count',1),
  jsonb_build_object('id','20000000-0000-4000-8000-000000000002','title','Second','duration_seconds',300,'item_version_ids',jsonb_build_array(item2),'draw_count',1)));
 result:=assessment_command(author,tenant,'stack-assessment-create','assessment.create',jsonb_build_object('definition',definition));assessment:=(result->>'id')::uuid;
 result:=assessment_command(author,tenant,'stack-publication','assessment.publish',jsonb_build_object('id',assessment,'revision',1));version_id:=(result->>'id')::uuid;
 form:=jsonb_build_object('schema_version','assessment.manifest.v1','assessment_version_id',version_id,'duration_seconds',600,'sections',jsonb_build_array(
  jsonb_build_object('id','20000000-0000-4000-8000-000000000001','duration_seconds',300,'items',jsonb_build_array(jsonb_build_object('item_version_id',item1))),
  jsonb_build_object('id','20000000-0000-4000-8000-000000000002','duration_seconds',300,'items',jsonb_build_array(jsonb_build_object('item_version_id',item2)))));
 foreach label in array array['delivery','alarm','orphan'] loop
  result:=assessment_command(author,tenant,'stack-window-'||label,'window.create',jsonb_build_object('assessment_version_id',version_id,'title',label,'opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '1 hour'));win:=(result->>'id')::uuid;
  result:=assessment_command(author,tenant,'stack-registration-'||label,'registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate));reg:=(result->>'id')::uuid;
  result:=assessment_command(candidate,tenant,'stack-start-'||label,'attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('a',64)));
  insert into stack_test_ids values(label,(result->>'id')::uuid);
 end loop;
 insert into stack_test_ids values('item1',item1),('item2',item2);
end; $$;
