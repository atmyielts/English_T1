do $$ declare
 tenant uuid:='10000000-0000-4000-8000-000000000001'; owner uuid:='00000000-0000-4000-8000-000000000001'; candidate uuid:='00000000-0000-4000-8000-000000000003';
 version_id uuid; win uuid; reg uuid; aid uuid; form jsonb; item uuid; result jsonb; lease jsonb; next_lease jsonb; response jsonb; frozen jsonb;
begin
 select assessment_version_id,manifest into version_id,form from assessment_forms limit 1;item:=(form#>>'{sections,0,items,0,item_version_id}')::uuid;
 result:=public.assessment_command(owner,tenant,'runtime-window-0001','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Runtime leases','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '1 hour'));win:=(result->>'id')::uuid;
 result:=public.assessment_command(owner,tenant,'runtime-reg-0001','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate));reg:=(result->>'id')::uuid;
 result:=public.assessment_command(candidate,tenant,'runtime-start-0001','attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('a',64)));aid:=(result->>'id')::uuid;
 response:=jsonb_build_object('attempt_id',aid,'sequence',1,'item_version_id',item,'response','a','payload_hash','runtime-hash-1');
 begin perform public.assessment_command(candidate,tenant,'runtime-bypass-001','response.append',response);raise exception 'Candidate bypassed coordinator';exception when insufficient_privilege then null;end;
 begin perform public.assessment_runtime_command(owner,tenant,'runtime-foreign-001','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',owner,'token_hash',repeat('a',64)));raise exception 'Foreign candidate acquired lease';exception when no_data_found then null;end;
 result:=public.assessment_runtime_command(candidate,tenant,'runtime-acquire-001','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',candidate,'token_hash',repeat('b',64)));
 if result#>>'{result,epoch}'<>'1' then raise exception 'Initial lease epoch incorrect';end if;
 if result#>>'{snapshot,lease_epoch}'<>'1' then raise exception 'Runtime snapshot did not expose the committed lease';end if;
 lease:=jsonb_build_object('device_id',candidate,'token_hash',repeat('b',64),'epoch',1);
 begin perform public.assessment_runtime_command(candidate,tenant,'runtime-secondtab-001','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',owner,'token_hash',repeat('c',64)));raise exception 'Second active device accepted';exception when unique_violation then null;end;
 begin perform public.assessment_runtime_command(candidate,tenant,'runtime-missing-001','response.append',response||jsonb_build_object('lease','{}'::jsonb));raise exception 'Missing lease credentials accepted';exception when insufficient_privilege then null;end;
 frozen:=public.assessment_runtime_command(candidate,tenant,'runtime-response-001','response.append',response||jsonb_build_object('lease',lease));
 if frozen#>>'{result,sequence}'<>'1' then raise exception 'Response was not canonically committed';end if;
 if frozen#>>'{snapshot,last_sequence}'<>'1' then raise exception 'Runtime snapshot was stale after response commit';end if;
 perform public.assessment_runtime_command(candidate,tenant,'runtime-release-001','lease.release',jsonb_build_object('attempt_id',aid,'lease',lease));
 result:=public.assessment_runtime_command(candidate,tenant,'runtime-handover-001','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',owner,'token_hash',repeat('c',64)));
 if result#>>'{result,epoch}'<>'2' then raise exception 'Device handover failed to fence old epoch';end if;
 next_lease:=jsonb_build_object('device_id',owner,'token_hash',repeat('c',64),'epoch',2);
 if (public.assessment_runtime_command(candidate,tenant,'runtime-response-001','response.append',response||jsonb_build_object('lease',next_lease))->'result')<>frozen->'result' then raise exception 'Lost committed receipt failed recovery after handover';end if;
 begin perform public.assessment_runtime_command(candidate,tenant,'runtime-stale-001','response.append',(response||jsonb_build_object('sequence',2,'lease',lease)));raise exception 'Old epoch wrote after handover';exception when insufficient_privilege then null;end;
 begin perform public.assessment_runtime_command(candidate,tenant,'runtime-response-001','response.append',(response||jsonb_build_object('response','changed','lease',next_lease)));raise exception 'Semantic replay conflict accepted';exception when unique_violation then null;end;
 perform public.assessment_runtime_command(candidate,tenant,'runtime-response-002','response.append',response||jsonb_build_object('sequence',2,'lease',next_lease,'payload_hash','runtime-hash-2'));
 if (select count(*) from assessment_response_journal where attempt_id=aid)<>2 then raise exception 'Retry duplicated or dropped responses';end if;
 update assessment_attempts set deadline_at=clock_timestamp()-interval '1 second' where id=aid;
 result:=public.assessment_runtime_expire(tenant,aid);if result->>'state'<>'expired' then raise exception 'Server alarm did not expire attempt';end if;
 perform public.assessment_runtime_expire(tenant,aid);
 if (select count(*) from domain_event_outbox where aggregate_id=aid)<>1 then raise exception 'Repeated alarm duplicated grading outbox';end if;
 if (select status from sessions where id=(select session_id from assessment_attempts where id=aid))<>'expired' then raise exception 'Canonical session was not finalized';end if;
 -- Paused clocks do not expire until the immutable sitting close time is reached.
 result:=public.assessment_command(owner,tenant,'runtime-window-0002','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Paused runtime','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '1 hour'));win:=(result->>'id')::uuid;
 result:=public.assessment_command(owner,tenant,'runtime-reg-0002','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate));reg:=(result->>'id')::uuid;
 result:=public.assessment_command(candidate,tenant,'runtime-start-0002','attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('b',64)));aid:=(result->>'id')::uuid;
 update assessment_attempts set state='paused',deadline_at=clock_timestamp()-interval '10 seconds',section_deadline_at=clock_timestamp()-interval '10 seconds' where id=aid;
 if (public.assessment_runtime_expire(tenant,aid)->>'state')<>'paused' then raise exception 'Paused exam expired at its pre-pause deadline';end if;
 update assessment_exam_windows set closes_at=clock_timestamp()-interval '1 second' where id=win;
 if (public.assessment_runtime_expire(tenant,aid)->>'state')<>'expired' then raise exception 'Paused exam exceeded sitting close time';end if;
end; $$;
-- Late alarms advance fixed section clocks from the old deadline, never from the delayed invocation.
do $$ declare
 tenant uuid:='10000000-0000-4000-8000-000000000001'; owner uuid:='00000000-0000-4000-8000-000000000001'; reviewer uuid:='00000000-0000-4000-8000-000000000002'; candidate uuid:='00000000-0000-4000-8000-000000000003';
 bank uuid; first_item uuid; second_item uuid; definition jsonb; form jsonb; result jsonb; aid uuid; assessment uuid; version_id uuid; win uuid; reg uuid;
begin
 select bank_id,id into bank,first_item from assessment_items limit 1;
 select id into first_item from assessment_item_versions where item_id=first_item and status='approved' limit 1;
 result:=public.assessment_command(owner,tenant,'runtime-item-0001','item.create',jsonb_build_object('bank_id',bank,'item',jsonb_build_object('schema_version','assessment.item.v1','type','single_choice','prompt','3 + 3?','locale','en','max_score',1,'tags','[]'::jsonb,'options','[{"id":"a","text":"6"},{"id":"b","text":"7"}]'::jsonb),'key','{"correct":"a"}'::jsonb));second_item:=(result->>'id')::uuid;
 perform public.assessment_command(owner,tenant,'runtime-submit-item1','item.submit',jsonb_build_object('id',second_item));
 perform public.assessment_command(reviewer,tenant,'runtime-approve-item1','item.approve',jsonb_build_object('id',second_item));
 definition:=jsonb_build_object('schema_version','assessment.definition.v1','title','Timed sections','locale','en','duration_seconds',600,'shuffle_items',false,'shuffle_options',false,'sections',jsonb_build_array(
  jsonb_build_object('id','20000000-0000-4000-8000-000000000002','title','First','duration_seconds',10,'item_version_ids',jsonb_build_array(first_item),'draw_count',1),
  jsonb_build_object('id','20000000-0000-4000-8000-000000000003','title','Second','duration_seconds',20,'item_version_ids',jsonb_build_array(second_item),'draw_count',1)));
 result:=public.assessment_command(owner,tenant,'runtime-definition-0001','assessment.create',jsonb_build_object('definition',definition));assessment:=(result->>'id')::uuid;
 result:=public.assessment_command(owner,tenant,'runtime-publish-0001','assessment.publish',jsonb_build_object('id',assessment,'revision',1));version_id:=(result->>'id')::uuid;
 result:=public.assessment_command(owner,tenant,'runtime-section-window','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Section alarms','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '1 hour'));win:=(result->>'id')::uuid;
 result:=public.assessment_command(owner,tenant,'runtime-section-register','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate));reg:=(result->>'id')::uuid;
 form:=jsonb_build_object('schema_version','assessment.manifest.v1','assessment_version_id',version_id,'duration_seconds',600,'sections',jsonb_build_array(
  jsonb_build_object('id','20000000-0000-4000-8000-000000000002','duration_seconds',10,'items',jsonb_build_array(jsonb_build_object('item_version_id',first_item))),
  jsonb_build_object('id','20000000-0000-4000-8000-000000000003','duration_seconds',20,'items',jsonb_build_array(jsonb_build_object('item_version_id',second_item)))));
 result:=public.assessment_command(candidate,tenant,'runtime-section-start','attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('d',64)));aid:=(result->>'id')::uuid;
 update assessment_attempts set section_deadline_at=clock_timestamp()-interval '5 seconds' where id=aid;
 result:=public.assessment_runtime_expire(tenant,aid);
 if result->>'state'<>'active' or (result->>'section_index')::integer<>1 then raise exception 'Timed section did not advance';end if;
 if (select section_deadline_at from assessment_attempts where id=aid)>clock_timestamp()+interval '16 seconds' then raise exception 'Late alarm extended the next section clock';end if;
 update assessment_attempts set section_deadline_at=clock_timestamp()-interval '1 second' where id=aid;
 if (public.assessment_runtime_expire(tenant,aid)->>'state')<>'expired' then raise exception 'Last timed section did not finalize';end if;
end; $$;
set role authenticated;
do $$ begin
 begin perform * from public.assessment_attempt_leases;raise exception 'Candidate can read bearer token hashes';exception when insufficient_privilege then null;end;
 begin perform public.assessment_runtime_expire('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');raise exception 'Candidate invoked server alarm';exception when insufficient_privilege then null;end;
 begin perform public.assessment_control_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','direct-control','bank.create','{}');raise exception 'Private control RPC exposed';exception when insufficient_privilege then null;end;
end; $$;
reset role;
