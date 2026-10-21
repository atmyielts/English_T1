\set ON_ERROR_STOP on
insert into users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');
insert into tenants values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into tenant_memberships values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','active','owner'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','active','admin'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','active','owner');
do $$ declare
 tenant uuid:='10000000-0000-4000-8000-000000000001'; author uuid:='00000000-0000-4000-8000-000000000001'; reviewer uuid:='00000000-0000-4000-8000-000000000002'; candidate uuid:='00000000-0000-4000-8000-000000000003';
 bank uuid; item uuid; assessment uuid; published_version uuid; window_id uuid; registration uuid; attempt uuid; form jsonb; result jsonb; definition jsonb;
begin
 result:=pg_temp.assessment_command(author,tenant,'bank-00001','bank.create','{"title":"Placement bank"}'); bank:=(result->>'id')::uuid;
 if pg_temp.assessment_command(author,tenant,'bank-00001','bank.create','{"title":"Placement bank"}')<>result then raise exception 'Replay changed result'; end if;
 begin perform pg_temp.assessment_command(author,tenant,'bank-00001','bank.create','{"title":"Other"}'); raise exception 'Conflict accepted'; exception when unique_violation then null; end;
 begin perform pg_temp.assessment_command('00000000-0000-4000-8000-000000000004',tenant,'bank-00002','bank.create','{"title":"Foreign"}'); raise exception 'Foreign tenant write accepted'; exception when insufficient_privilege then null; end;
 result:=pg_temp.assessment_command(author,tenant,'item-00001','item.create',jsonb_build_object('bank_id',bank,'item',jsonb_build_object('schema_version','assessment.item.v1','type','single_choice','prompt','2 + 2?','locale','en','max_score',1,'tags','[]'::jsonb,'options','[{"id":"a","text":"4"},{"id":"b","text":"5"}]'::jsonb),'key','{"correct":"a"}'::jsonb)); item:=(result->>'id')::uuid;
 perform pg_temp.assessment_command(author,tenant,'submit-0001','item.submit',jsonb_build_object('id',item));
 begin perform pg_temp.assessment_command(author,tenant,'approve-001','item.approve',jsonb_build_object('id',item)); raise exception 'Self approval accepted'; exception when check_violation then null; end;
 perform pg_temp.assessment_command(reviewer,tenant,'approve-002','item.approve',jsonb_build_object('id',item));
 begin update assessment_item_versions set payload='{}' where id=item; raise exception 'Payload mutation accepted'; exception when check_violation then null; end;
 definition:=jsonb_build_object('schema_version','assessment.definition.v1','title','Placement','locale','en','duration_seconds',600,'shuffle_items',false,'shuffle_options',false,'sections',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000001','title','Math','item_version_ids',jsonb_build_array(item),'draw_count',1)));
 result:=pg_temp.assessment_command(author,tenant,'assess-0001','assessment.create',jsonb_build_object('definition',definition)); assessment:=(result->>'id')::uuid;
 result:=pg_temp.assessment_command(author,tenant,'publish-001','assessment.publish',jsonb_build_object('id',assessment,'revision',1)); published_version:=(result->>'id')::uuid;
 if not exists(select 1 from assessment_runtime_items where assessment_version_id=published_version and item_version_id=item) then raise exception 'Spine compilation missing'; end if;
 if exists(select 1 from assessment_versions av join experiences e on e.id=av.experience_id join products p on p.id=e.product_id where av.id=published_version and (e.is_active or p.status='active')) then raise exception 'Institution exam exposed in legacy public catalog'; end if;
 begin delete from assessment_versions where id=published_version; raise exception 'Publication deletion accepted'; exception when check_violation then null; end;
 result:=pg_temp.assessment_command(author,tenant,'window-0001','window.create',jsonb_build_object('assessment_version_id',published_version,'title','Today','opens_at',now()-interval '1 hour','closes_at',now()+interval '1 hour')); window_id:=(result->>'id')::uuid;
 result:=pg_temp.assessment_command(author,tenant,'register-01','registration.create',jsonb_build_object('window_id',window_id,'candidate_id',candidate)); registration:=(result->>'id')::uuid;
 form:=jsonb_build_object('schema_version','assessment.manifest.v1','assessment_version_id',published_version,'duration_seconds',600,'sections',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000001','items',jsonb_build_array(jsonb_build_object('item_version_id',item)))));
 result:=pg_temp.assessment_command(candidate,tenant,'start-00001','attempt.start',jsonb_build_object('registration_id',registration,'manifest',form,'manifest_hash',repeat('a',64))); attempt:=(result->>'id')::uuid;
 if (pg_temp.assessment_command(candidate,tenant,'start-00002','attempt.start',jsonb_build_object('registration_id',registration,'manifest',form,'manifest_hash',repeat('b',64)))->>'id')::uuid<>attempt then raise exception 'Concurrent lease duplicated'; end if;
 begin perform pg_temp.assessment_command(author,tenant,'save-000001','response.append',jsonb_build_object('attempt_id',attempt,'sequence',1,'item_version_id',item,'response','a','payload_hash','hash1')); raise exception 'Other candidate write accepted'; exception when no_data_found then null; end;
 begin perform pg_temp.assessment_command(candidate,tenant,'save-000002','response.append',jsonb_build_object('attempt_id',attempt,'sequence',2,'item_version_id',item,'response','a','payload_hash','hash1')); raise exception 'Sequence gap accepted'; exception when unique_violation then null; end;
 result:=pg_temp.assessment_command(candidate,tenant,'save-000003','response.append',jsonb_build_object('attempt_id',attempt,'sequence',1,'item_version_id',item,'response','a','payload_hash','hash1'));
 if (pg_temp.assessment_command(candidate,tenant,'save-000004','response.append',jsonb_build_object('attempt_id',attempt,'sequence',1,'item_version_id',item,'response','a','payload_hash','hash1'))->>'id')<>result->>'id' then raise exception 'Sequence replay duplicated'; end if;
 begin perform pg_temp.assessment_command(candidate,tenant,'save-000005','response.append',jsonb_build_object('attempt_id',attempt,'sequence',1,'item_version_id',item,'response','b','payload_hash','hash2')); raise exception 'Sequence conflict accepted'; exception when unique_violation then null; end;
 perform pg_temp.assessment_command(candidate,tenant,'finish-0001','attempt.submit',jsonb_build_object('attempt_id',attempt));
 begin perform pg_temp.assessment_command(candidate,tenant,'save-000006','response.append',jsonb_build_object('attempt_id',attempt,'sequence',2,'item_version_id',item,'response','a','payload_hash','hash1')); raise exception 'Finalized attempt write accepted'; exception when check_violation then null; end;
 if not exists(select 1 from domain_event_outbox where aggregate_id=attempt) then raise exception 'Submission event missing'; end if;
 if (select count(*) from responses)<>1 then raise exception 'Unexpected response count'; end if;
end; $$;
-- Exercise actual RLS as authenticated users, rather than asserting policy text.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
do $$ begin
 if (select count(*) from assessment_item_banks)<>0 then raise exception 'Foreign tenant bank leaked'; end if;
 if (select count(*) from assessment_item_versions)<>0 then raise exception 'Foreign tenant item leaked'; end if;
 begin perform * from assessment_item_keys; raise exception 'Answer keys readable'; exception when insufficient_privilege then null; end;
 begin perform pg_temp.assessment_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','forged-0001','bank.create','{"title":"Forged"}'); raise exception 'RPC executable by user'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$ begin if (select count(*) from assessment_item_banks)<>1 then raise exception 'Owner cannot read bank'; end if; end; $$;
reset role;
