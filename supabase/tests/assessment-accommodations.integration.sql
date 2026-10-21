begin;
do $$declare
 t uuid:='10000000-0000-4000-8000-000000000001';o uuid:='00000000-0000-4000-8000-000000000001';c uuid:='00000000-0000-4000-8000-000000000003';
 v uuid;f jsonb;w uuid;r uuid;a uuid;b uuid;answer uuid;policy jsonb;input jsonb;lease jsonb;receipt jsonb;result jsonb;base timestamptz;before_scores jsonb;
begin
 select assessment_version_id,manifest into v,f from public.assessment_forms limit 1;answer:=(f#>>'{sections,0,items,0,item_version_id}')::uuid;
 select jsonb_agg(to_jsonb(s) order by id) into before_scores from public.assessment_score_revisions s;
 w:=(public.assessment_command(o,t,'accommodation-window','window.create',jsonb_build_object('assessment_version_id',v,'title','Accommodated exam','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '4 hours'))->>'id')::uuid;
 r:=(public.assessment_command(o,t,'accommodation-registration','registration.create',jsonb_build_object('window_id',w,'candidate_id',c))->>'id')::uuid;
 policy:='{"schema_version":"assessment.break-policy.v1","clock":"stopped","max_breaks":3,"max_seconds":120,"total_seconds":240}';
 input:=jsonb_build_object('registration_id',r,'revision',0,'extra_seconds',300,'break_policy',policy,'reason','Approved timed assessment support; no diagnosis stored');
 begin perform public.assessment_command(c,t,'accommodation-forged','registration.accommodate',input);raise exception 'Candidate approved own policy';exception when insufficient_privilege then null;end;
 begin perform public.assessment_command(o,t,'accommodation-invalid','registration.accommodate',jsonb_set(input,'{break_policy,max_seconds}','121.5'));raise exception 'Fractional policy accepted';exception when invalid_parameter_value then null;end;
 receipt:=public.assessment_command(o,t,'accommodation-approve','registration.accommodate',input);
 if receipt->>'revision'<>'1' or public.assessment_command(o,t,'accommodation-approve','registration.accommodate',input)<>receipt then raise exception 'Approval receipt changed';end if;
 begin perform public.assessment_command(o,t,'accommodation-stale','registration.accommodate',input);raise exception 'Stale approval accepted';exception when unique_violation then null;end;
 a:=(public.assessment_command(c,t,'accommodation-start','attempt.start',jsonb_build_object('registration_id',r,'manifest',f,'manifest_hash',repeat('a',64)))->>'id')::uuid;
 if (select accommodations#>>'{policy,max_breaks}' from public.assessment_attempts where id=a)<>'3' then raise exception 'Policy not pinned';end if;
 begin perform public.assessment_command(o,t,'accommodation-late','registration.accommodate',jsonb_set(input,'{revision}','1'));raise exception 'Post-start edit accepted';exception when check_violation then null;end;
 begin update public.assessment_registrations set extra_seconds=0 where id=r;raise exception 'Direct post-start edit accepted';exception when check_violation then null;end;
 begin update public.assessment_attempts set accommodations='{}' where id=a;raise exception 'Pinned policy edited';exception when check_violation then null;end;
 perform public.assessment_runtime_command(c,t,'accommodation-lease','lease.acquire',jsonb_build_object('attempt_id',a,'device_id',c,'token_hash',repeat('a',64)));
 lease:=jsonb_build_object('device_id',c,'token_hash',repeat('a',64),'epoch',1);
 input:=jsonb_build_object('attempt_id',a,'lease',lease);
 select deadline_at into base from public.assessment_attempts where id=a;
 begin perform public.assessment_runtime_command(o,t,'accommodation-foreign','break.begin',input);raise exception 'Foreign break accepted';exception when no_data_found then null;end;
 begin perform public.assessment_runtime_command(c,t,'accommodation-no-lease','break.begin',input-'lease');raise exception 'Unleased break accepted';exception when insufficient_privilege then null;end;
 receipt:=public.assessment_runtime_command(c,t,'accommodation-break-1','break.begin',input);b:=(receipt#>>'{result,id}')::uuid;
 if (select deadline_at from public.assessment_attempts where id=a)<>base+interval '120 seconds' then raise exception 'Stopped credit not reserved';end if;
 if (public.assessment_runtime_command(c,t,'accommodation-break-1','break.begin',input)->'result')<>receipt->'result' or(select count(*) from public.assessment_breaks where attempt_id=a)<>1 then raise exception 'Break replay duplicated';end if;
 if (select due_at from public.assessment_runtime_schedule where attempt_id=a)>(receipt#>>'{result,ends_at}')::timestamptz then raise exception 'Break end not scheduled';end if;
 result:=public.assessment_runtime_command(c,t,'accommodation-break-answer','response.append',input||jsonb_build_object('sequence',1,'item_version_id',answer,'response','a','payload_hash',repeat('a',64)));
 if result->>'rejected'<>'assessment_break_active' or exists(select 1 from public.assessment_runtime_commands where idempotency_key='accommodation-break-answer') then raise exception 'Break answer acknowledged';end if;
 result:=public.assessment_runtime_command(c,t,'accommodation-break-submit','attempt.submit',input);if result->>'rejected'<>'assessment_break_active' then raise exception 'Break submit accepted';end if;
 perform public.assessment_runtime_command(c,t,'accommodation-end-1','break.end',input||jsonb_build_object('break_id',b));
 if (select deadline_at from public.assessment_attempts where id=a)>base+interval '2 seconds' then raise exception 'Unused credit retained';end if;
 -- A human/system pause terminates a break, and candidate commands cannot resume it.
 receipt:=public.assessment_runtime_command(c,t,'accommodation-break-2','break.begin',input);b:=(receipt#>>'{result,id}')::uuid;
 update public.assessment_attempts set state='paused' where id=a;
 if exists(select 1 from public.assessment_breaks where id=b and (ended_at is null or end_reason<>'proctor_pause')) then raise exception 'Pause did not fence break';end if;
 result:=public.assessment_runtime_command(c,t,'accommodation-paused-end','break.end',input||jsonb_build_object('break_id',b));if result->>'rejected'<>'attempt_not_active' or (select state from public.assessment_attempts where id=a)<>'paused' then raise exception 'Candidate resumed pause';end if;
 -- Canonical automatic end uses the scheduled timestamp, not late observation.
 update public.assessment_attempts set state='active' where id=a;
 receipt:=public.assessment_runtime_command(c,t,'accommodation-break-3','break.begin',input);b:=(receipt#>>'{result,id}')::uuid;
 update public.assessment_breaks set started_at=clock_timestamp()-interval '120 seconds',ends_at=clock_timestamp()-interval '1 second' where id=b;
 perform public.assessment_runtime_expire(t,a);
 if exists(select 1 from public.assessment_breaks where id=b and (ended_at is null or ended_at<>ends_at or end_reason<>'elapsed')) then raise exception 'Late alarm failed exact end';end if;
 begin perform public.assessment_runtime_command(c,t,'accommodation-exhausted','break.begin',input);raise exception 'Break count exceeded';exception when check_violation then if sqlerrm<>'break_allowance_exhausted' then raise;end if;end;
 if(select jsonb_agg(to_jsonb(s) order by id) from public.assessment_score_revisions s) is distinct from before_scores then raise exception 'Accommodations changed scores';end if;
 if has_function_privilege('service_role','public.assessment_runtime_command_before_breaks(uuid,uuid,text,text,jsonb)','execute') or has_function_privilege('authenticated','public.assessment_break_finish(uuid,uuid,timestamptz,text)','execute') then raise exception 'Break bypass exposed';end if;
end;$$;
-- Running clocks, rotated leases, time-based exhaustion, sitting close and
-- pause/resume overlap. Each sitting is independent of the stopped-clock one above.
do $$declare
 t uuid:='10000000-0000-4000-8000-000000000001';o uuid:='00000000-0000-4000-8000-000000000001';c uuid:='00000000-0000-4000-8000-000000000003';
 v uuid;f jsonb;w uuid;r uuid;a uuid;b uuid;lease jsonb;input jsonb;receipt jsonb;result jsonb;base timestamptz;section_base timestamptz;ending timestamptz;closing timestamptz;epoch bigint;started timestamptz;paused timestamptz;
begin
 select assessment_version_id,manifest into v,f from public.assessment_forms limit 1;
 -- Running clock: no academic time is granted and the break ends by the attempt deadline.
 w:=(public.assessment_command(o,t,'running-window','window.create',jsonb_build_object('assessment_version_id',v,'title','Running-clock sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '4 hours'))->>'id')::uuid;
 r:=(public.assessment_command(o,t,'running-registration','registration.create',jsonb_build_object('window_id',w,'candidate_id',c))->>'id')::uuid;
 perform public.assessment_command(o,t,'running-approve','registration.accommodate',jsonb_build_object('registration_id',r,'revision',0,'extra_seconds',0,'reason','Approved rest break','break_policy','{"schema_version":"assessment.break-policy.v1","clock":"running","max_breaks":2,"max_seconds":60,"total_seconds":60}'::jsonb));
 a:=(public.assessment_command(c,t,'running-start','attempt.start',jsonb_build_object('registration_id',r,'manifest',f,'manifest_hash',repeat('a',64)))->>'id')::uuid;
 epoch:=(public.assessment_runtime_command(c,t,'running-lease','lease.acquire',jsonb_build_object('attempt_id',a,'device_id',c,'token_hash',repeat('b',64)))#>>'{result,epoch}')::bigint;
 lease:=jsonb_build_object('device_id',c,'token_hash',repeat('b',64),'epoch',epoch);input:=jsonb_build_object('attempt_id',a,'lease',lease);
 begin perform public.assessment_runtime_command(c,t,'running-stale-epoch','break.begin',jsonb_set(input,'{lease,epoch}',to_jsonb(epoch+7)));raise exception 'Stale lease epoch accepted';exception when insufficient_privilege then null;end;
 begin perform public.assessment_runtime_command(c,t,'running-stale-token','break.begin',jsonb_set(input,'{lease,token_hash}',to_jsonb(repeat('c',64))));raise exception 'Foreign lease token accepted';exception when insufficient_privilege then null;end;
 update public.assessment_attempts set deadline_at=clock_timestamp()+interval '30 seconds',section_deadline_at=clock_timestamp()+interval '30 seconds' where id=a;
 select deadline_at,section_deadline_at into base,section_base from public.assessment_attempts where id=a;
 receipt:=public.assessment_runtime_command(c,t,'running-break-1','break.begin',input);b:=(receipt#>>'{result,id}')::uuid;ending:=(receipt#>>'{result,ends_at}')::timestamptz;
 if receipt#>>'{result,clock}'<>'running' or ending>base then raise exception 'Running break outlasted the attempt deadline';end if;
 if (select deadline_at from public.assessment_attempts where id=a)<>base or (select section_deadline_at from public.assessment_attempts where id=a)<>section_base then raise exception 'Running break granted academic time';end if;
 if receipt#>'{snapshot,accommodations,active}' is null or receipt#>>'{snapshot,accommodations,active,id}'<>b::text then raise exception 'Active break missing from candidate projection';end if;
 perform public.assessment_runtime_command(c,t,'running-end-1','break.end',input||jsonb_build_object('break_id',b));
 if (select deadline_at from public.assessment_attempts where id=a)<>base then raise exception 'Running break end changed deadline';end if;
 begin perform public.assessment_runtime_command(c,t,'running-end-again','break.end',input||jsonb_build_object('break_id',b));raise exception 'Ended break ended twice';exception when check_violation then if sqlerrm<>'break_not_active' then raise;end if;end;
 -- Exhaustion is by allowance time as well as count: one full 60-second break uses the whole total.
 update public.assessment_attempts set deadline_at=clock_timestamp()+interval '2 hours',section_deadline_at=clock_timestamp()+interval '2 hours' where id=a;
 delete from public.assessment_breaks where id=b;
 receipt:=public.assessment_runtime_command(c,t,'running-break-2','break.begin',input);b:=(receipt#>>'{result,id}')::uuid;
 update public.assessment_breaks set started_at=clock_timestamp()-interval '60 seconds',ends_at=clock_timestamp()-interval '1 millisecond' where id=b;
 result:=public.assessment_runtime_snapshot(t,a,c);
 if result#>'{accommodations,active}'<>'null'::jsonb or (result#>>'{accommodations,used_seconds}')::numeric<59.9 then raise exception 'Elapsed running break not closed in the projection';end if;
 begin perform public.assessment_runtime_command(c,t,'running-break-3','break.begin',input);raise exception 'Time allowance exceeded';exception when check_violation then if sqlerrm<>'break_allowance_exhausted' then raise;end if;end;

 -- Stopped clock near sitting close: the break and the extended deadline both end by closing time.
 closing:=clock_timestamp()+interval '90 seconds';
 w:=(public.assessment_command(o,t,'closing-window','window.create',jsonb_build_object('assessment_version_id',v,'title','Closing sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',closing))->>'id')::uuid;
 r:=(public.assessment_command(o,t,'closing-registration','registration.create',jsonb_build_object('window_id',w,'candidate_id',c))->>'id')::uuid;
 perform public.assessment_command(o,t,'closing-approve','registration.accommodate',jsonb_build_object('registration_id',r,'revision',0,'extra_seconds',0,'reason','Approved rest break','break_policy','{"schema_version":"assessment.break-policy.v1","clock":"stopped","max_breaks":1,"max_seconds":600,"total_seconds":600}'::jsonb));
 a:=(public.assessment_command(c,t,'closing-start','attempt.start',jsonb_build_object('registration_id',r,'manifest',f,'manifest_hash',repeat('a',64)))->>'id')::uuid;
 epoch:=(public.assessment_runtime_command(c,t,'closing-lease','lease.acquire',jsonb_build_object('attempt_id',a,'device_id',c,'token_hash',repeat('d',64)))#>>'{result,epoch}')::bigint;
 input:=jsonb_build_object('attempt_id',a,'lease',jsonb_build_object('device_id',c,'token_hash',repeat('d',64),'epoch',epoch));
 receipt:=public.assessment_runtime_command(c,t,'closing-break','break.begin',input);
 if (receipt#>>'{result,ends_at}')::timestamptz>closing or (select deadline_at from public.assessment_attempts where id=a)>closing or (select section_deadline_at from public.assessment_attempts where id=a)>closing then raise exception 'Break or deadline outlasted the sitting';end if;

 -- Pause overlap: the break ends at the pause, then resume adds only the paused interval.
 w:=(public.assessment_command(o,t,'overlap-window','window.create',jsonb_build_object('assessment_version_id',v,'title','Overlap sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '4 hours'))->>'id')::uuid;
 r:=(public.assessment_command(o,t,'overlap-registration','registration.create',jsonb_build_object('window_id',w,'candidate_id',c))->>'id')::uuid;
 perform public.assessment_command(o,t,'overlap-approve','registration.accommodate',jsonb_build_object('registration_id',r,'revision',0,'extra_seconds',0,'reason','Approved rest break','break_policy','{"schema_version":"assessment.break-policy.v1","clock":"stopped","max_breaks":2,"max_seconds":300,"total_seconds":300}'::jsonb));
 a:=(public.assessment_command(c,t,'overlap-start','attempt.start',jsonb_build_object('registration_id',r,'manifest',f,'manifest_hash',repeat('a',64)))->>'id')::uuid;
 epoch:=(public.assessment_runtime_command(c,t,'overlap-lease','lease.acquire',jsonb_build_object('attempt_id',a,'device_id',c,'token_hash',repeat('e',64)))#>>'{result,epoch}')::bigint;
 input:=jsonb_build_object('attempt_id',a,'lease',jsonb_build_object('device_id',c,'token_hash',repeat('e',64),'epoch',epoch));
 select deadline_at into base from public.assessment_attempts where id=a;
 receipt:=public.assessment_runtime_command(c,t,'overlap-break','break.begin',input);b:=(receipt#>>'{result,id}')::uuid;
 select started_at into started from public.assessment_breaks where id=b;
 update public.assessment_attempts set state='paused' where id=a;
 select ended_at into paused from public.assessment_breaks where id=b;
 if (select deadline_at from public.assessment_attempts where id=a)<>base+(paused-started) then raise exception 'Pause overlap credited reserved break time';end if;
 if (select count(*) from public.assessment_audit_events where action='assessment.break.ended' and details->>'break_id'=b::text)<>1 then raise exception 'Pause produced duplicate break end audit';end if;
end;$$;
rollback;
