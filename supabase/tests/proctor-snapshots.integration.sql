\set ON_ERROR_STOP on
begin;
insert into users(id) values('00000000-0000-4000-8000-0000000000f1'),('00000000-0000-4000-8000-0000000000f2');
insert into tenant_memberships values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000f2','active','member');
do $$ declare
 tenant uuid:='10000000-0000-4000-8000-000000000001'; supervisor uuid:='00000000-0000-4000-8000-000000000001';
 candidate uuid:='00000000-0000-4000-8000-0000000000f1'; outsider uuid:='00000000-0000-4000-8000-000000000004'; reviewer uuid:='00000000-0000-4000-8000-0000000000f2';
 pol uuid; plain uuid; win uuid; plain_win uuid; reg uuid; plain_reg uuid; attempt uuid; session uuid; plain_session uuid; form jsonb; version_id uuid; result jsonb; replay jsonb; listed jsonb; case_id uuid;
begin
 select id into version_id from assessment_versions limit 1;select manifest into form from assessment_forms limit 1;
 win:=(public.assessment_command(supervisor,tenant,'snap-win-0001','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Snapshot sitting','opens_at',now()-interval '1 hour','closes_at',now()+interval '1 hour'))->>'id')::uuid;
 reg:=(public.assessment_command(supervisor,tenant,'snap-reg-0001','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate))->>'id')::uuid;
 pol:=(proctor_command(supervisor,tenant,'snap-policy-01','policy.create','{"title":"Proctor Lite","policy":{"schema_version":"proctor.policy.v1","mode":"browser","identity_level":0,"camera":false,"microphone":false,"screen":false,"second_camera":false,"reviewer_quorum":1,"snapshot_interval_seconds":60,"identity_retention_days":7,"recording_retention_days":30}}')->>'id')::uuid;
 perform proctor_command(supervisor,tenant,'snap-attach-01','policy.attach',jsonb_build_object('window_id',win,'policy_id',pol));
 perform proctor_command(candidate,tenant,'snap-consent-1','preparation.accept',jsonb_build_object('registration_id',reg,'policy_id',pol,'acknowledged',true));
 attempt:=(public.assessment_command(candidate,tenant,'snap-start-001','attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('a',64)))->>'id')::uuid;
 select id into session from proctor_sessions where attempt_id=attempt;
 -- The identity photo, then periodic stills; a retry returns the same slot.
 result:=public.proctor_snapshot_reserve(candidate,tenant,session,0,'identity',repeat('a',64),20000,clock_timestamp());
 if result->>'reused'<>'false' or result->>'object_path' !~ ('^'||tenant||'/'||session||'/000000-aaaaaaaaaaaaaaaa\.jpg$') then raise exception 'Identity reservation wrong: %',result;end if;
 replay:=public.proctor_snapshot_reserve(candidate,tenant,session,0,'identity',repeat('a',64),20000,clock_timestamp());
 if replay->>'id'<>result->>'id' or replay->>'reused'<>'true' then raise exception 'Retry did not reuse the slot';end if;
 begin perform public.proctor_snapshot_reserve(candidate,tenant,session,0,'identity',repeat('b',64),20000,clock_timestamp());raise exception 'Different picture replaced a slot';exception when unique_violation then if sqlerrm<>'snapshot_conflict' then raise;end if;end;
 begin perform public.proctor_snapshot_reserve(candidate,tenant,session,1,'identity',repeat('c',64),20000,clock_timestamp());raise exception 'Second identity photo accepted';exception when invalid_parameter_value then null;end;
 perform public.proctor_snapshot_stored(tenant,(result->>'id')::uuid);
 result:=public.proctor_snapshot_reserve(candidate,tenant,session,1,'periodic',repeat('d',64),18000,clock_timestamp());
 -- Not stored yet, so reviewers do not see it.
 if jsonb_array_length(public.proctor_snapshot_list(supervisor,tenant,session))<>1 then raise exception 'Unstored snapshot listed';end if;
 perform public.proctor_snapshot_stored(tenant,(result->>'id')::uuid);
 listed:=public.proctor_snapshot_list(supervisor,tenant,session);
 if jsonb_array_length(listed)<>2 or listed->0->>'kind'<>'identity' or listed->1->>'kind'<>'periodic' then raise exception 'Snapshot list wrong: %',listed;end if;
 -- Someone else's session, a flood beyond the policy rate and impossible times are refused.
 begin perform public.proctor_snapshot_reserve(outsider,tenant,session,2,'periodic',repeat('e',64),18000,clock_timestamp());raise exception 'Outsider stored a snapshot';exception when no_data_found then null;end;
 begin perform public.proctor_snapshot_reserve(candidate,tenant,session,500,'periodic',repeat('e',64),18000,clock_timestamp());raise exception 'Snapshot flood accepted';exception when check_violation then if sqlerrm<>'snapshot_rate_exceeded' then raise;end if;end;
 begin perform public.proctor_snapshot_reserve(candidate,tenant,session,2,'periodic',repeat('e',64),18000,clock_timestamp()+interval '1 hour');raise exception 'Future snapshot accepted';exception when invalid_parameter_value then null;end;
 begin perform public.proctor_snapshot_reserve(candidate,tenant,session,2,'periodic',repeat('e',64),400000,clock_timestamp());raise exception 'Oversized snapshot accepted';exception when check_violation then null;end;
 -- Only the institution's proctor staff or an assigned reviewer can list them.
 begin perform public.proctor_snapshot_list(outsider,tenant,session);raise exception 'Outsider listed snapshots';exception when insufficient_privilege then null;end;
 begin perform public.proctor_snapshot_list(reviewer,tenant,session);raise exception 'Unassigned member listed snapshots';exception when insufficient_privilege then null;end;
 -- A sitting without snapshots in its policy takes none.
 plain_win:=(public.assessment_command(supervisor,tenant,'snap-win-0002','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Signals only','opens_at',now()-interval '1 hour','closes_at',now()+interval '1 hour'))->>'id')::uuid;
 plain_reg:=(public.assessment_command(supervisor,tenant,'snap-reg-0002','registration.create',jsonb_build_object('window_id',plain_win,'candidate_id',candidate))->>'id')::uuid;
 plain:=(proctor_command(supervisor,tenant,'snap-policy-02','policy.create','{"title":"Signals","policy":{"schema_version":"proctor.policy.v1","mode":"browser","identity_level":0,"camera":false,"microphone":false,"screen":false,"second_camera":false,"reviewer_quorum":1}}')->>'id')::uuid;
 perform proctor_command(supervisor,tenant,'snap-attach-02','policy.attach',jsonb_build_object('window_id',plain_win,'policy_id',plain));
 perform proctor_command(candidate,tenant,'snap-consent-2','preparation.accept',jsonb_build_object('registration_id',plain_reg,'policy_id',plain,'acknowledged',true));
 attempt:=(public.assessment_command(candidate,tenant,'snap-start-002','attempt.start',jsonb_build_object('registration_id',plain_reg,'manifest',form,'manifest_hash',repeat('a',64)))->>'id')::uuid;
 select id into plain_session from proctor_sessions where attempt_id=attempt;
 if plain_session is null then raise exception 'Signals-only sitting has no proctor session';end if;
 begin perform public.proctor_snapshot_reserve(candidate,tenant,plain_session,0,'identity',repeat('f',64),18000,clock_timestamp());raise exception 'Snapshot taken without a policy';exception when check_violation then if sqlerrm<>'snapshots_not_required' then raise;end if;end;
 -- Retention: expired snapshots are released for deletion, except while a review case is open.
 if (select expires_at::date-received_at::date from proctor_snapshots where session_id=session and kind='identity')<>7 or (select expires_at::date-received_at::date from proctor_snapshots where session_id=session and kind='periodic')<>30 then raise exception 'Retention not taken from the policy';end if;
 alter table proctor_snapshots disable trigger proctor_snapshot_guard;update proctor_snapshots set expires_at=clock_timestamp()-interval '1 second' where session_id=session;alter table proctor_snapshots enable trigger proctor_snapshot_guard;
 insert into proctor_review_cases(tenant_id,session_id,title,opened_by) values(tenant,session,'Looking away often',supervisor) returning id into case_id;
 if jsonb_array_length(public.proctor_snapshot_expired(100))<>0 then raise exception 'Snapshots under review released for deletion';end if;
 update proctor_review_cases set state='resolved',disposition='clear',resolved_at=clock_timestamp() where id=case_id;
 if jsonb_array_length(public.proctor_snapshot_expired(100))<>2 then raise exception 'Expired snapshots not released';end if;
 if public.proctor_snapshot_forget(array(select id from proctor_snapshots where session_id=session))<>2 then raise exception 'Expired snapshots not forgotten';end if;
 if jsonb_array_length(public.proctor_snapshot_list(supervisor,tenant,session))<>0 or jsonb_array_length(public.proctor_snapshot_expired(100))<>0 then raise exception 'Deleted snapshots still visible';end if;
 -- History cannot be rewritten and clients have no access.
 begin update proctor_snapshots set sha256=repeat('0',64) where session_id=session;raise exception 'Snapshot rewritten';exception when check_violation then null;end;
 begin delete from proctor_snapshots where session_id=session;raise exception 'Snapshot row deleted';exception when check_violation then null;end;
 if has_table_privilege('authenticated','public.proctor_snapshots','select') or has_function_privilege('authenticated','public.proctor_snapshot_reserve(uuid,uuid,uuid,integer,text,text,integer,timestamptz)','execute') then raise exception 'Snapshots exposed to clients';end if;
end $$;
rollback;
