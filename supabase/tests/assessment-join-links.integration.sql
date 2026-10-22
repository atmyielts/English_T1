\set ON_ERROR_STOP on
begin;
insert into users(id) values('00000000-0000-4000-8000-0000000000e1'),('00000000-0000-4000-8000-0000000000e2'),('00000000-0000-4000-8000-0000000000e3');
do $$ declare
 tenant uuid:='10000000-0000-4000-8000-000000000001'; other_tenant uuid:='10000000-0000-4000-8000-000000000002';
 owner uuid:='00000000-0000-4000-8000-000000000001'; outsider uuid:='00000000-0000-4000-8000-000000000004';
 learner uuid:='00000000-0000-4000-8000-0000000000e1'; second uuid:='00000000-0000-4000-8000-0000000000e2'; third uuid:='00000000-0000-4000-8000-0000000000e3';
 version_id uuid; win uuid; closed_win uuid; link jsonb; replay jsonb; newer jsonb; preview jsonb; entry jsonb; again jsonb; profile jsonb;
begin
 select assessment_version_id into version_id from assessment_forms limit 1;
 win:=(public.assessment_command(owner,tenant,'join-window-0001','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Mock exam','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '1 hour'))->>'id')::uuid;
 -- Staff create a link; a lost reply returns the same link, not a second one.
 link:=public.assessment_command(owner,tenant,'join-link-create-1','join_link.create',jsonb_build_object('window_id',win,'max_joins',2));
 replay:=public.assessment_command(owner,tenant,'join-link-create-1','join_link.create',jsonb_build_object('window_id',win,'max_joins',2));
 if replay<>link or link->>'code' !~ '^[a-f0-9]{64}$' then raise exception 'Join link replay or code wrong: %',link;end if;
 if (select count(*) from assessment_join_links where window_id=win)<>1 then raise exception 'Replay created another link';end if;
 -- Another institution cannot create links for this sitting, and a person without exam rights cannot either.
 begin perform public.assessment_command(outsider,tenant,'join-link-outsider','join_link.create',jsonb_build_object('window_id',win));raise exception 'Outsider created a join link';exception when insufficient_privilege then null;end;
 begin perform public.assessment_command(outsider,other_tenant,'join-link-foreign','join_link.create',jsonb_build_object('window_id',win));raise exception 'Foreign sitting accepted';exception when no_data_found then null;end;
 -- A candidate who is not an institution member previews the sitting, then joins.
 preview:=public.assessment_join_preview(learner,(link->>'id')::uuid,link->>'code');
 if preview->>'state'<>'open' or preview->>'title'<>'Mock exam' or preview->>'tenant_id'<>tenant::text or preview->>'institution'<>'Institution' then raise exception 'Preview wrong: %',preview;end if;
 begin perform public.assessment_join_preview(learner,(link->>'id')::uuid,repeat('0',64));raise exception 'Wrong code previewed';exception when no_data_found then if sqlerrm<>'join_link_invalid' then raise;end if;end;
 entry:=public.assessment_join_accept(learner,(link->>'id')::uuid,link->>'code');
 if entry->>'reused'<>'false' or entry->>'tenant_id'<>tenant::text then raise exception 'Join wrong: %',entry;end if;
 if not exists(select 1 from assessment_registrations where id=(entry->>'registration_id')::uuid and window_id=win and candidate_id=learner and created_by=learner and extra_seconds=0) then raise exception 'Registration not created for the joiner';end if;
 if exists(select 1 from tenant_memberships where user_id=learner) then raise exception 'Joining made the candidate an institution member';end if;
 -- Joining again returns the same registration and does not use up a place.
 again:=public.assessment_join_accept(learner,(link->>'id')::uuid,link->>'code');
 if again->>'registration_id'<>entry->>'registration_id' or again->>'reused'<>'true' then raise exception 'Repeat join wrong: %',again;end if;
 if public.assessment_join_preview(learner,(link->>'id')::uuid,link->>'code')->>'state'<>'joined' then raise exception 'Preview does not show joined';end if;
 if (select joined from assessment_join_links where id=(link->>'id')::uuid)<>1 then raise exception 'Repeat join counted twice';end if;
 -- The link has two places.
 perform public.assessment_join_accept(second,(link->>'id')::uuid,link->>'code');
 if public.assessment_join_preview(third,(link->>'id')::uuid,link->>'code')->>'state'<>'full' then raise exception 'Full link not shown full';end if;
 begin perform public.assessment_join_accept(third,(link->>'id')::uuid,link->>'code');raise exception 'Full link accepted a join';exception when check_violation then if sqlerrm<>'join_link_full' then raise;end if;end;
 -- A new link replaces the old one: the old link stops working, but people already registered keep their place.
 newer:=public.assessment_command(owner,tenant,'join-link-create-2','join_link.create',jsonb_build_object('window_id',win));
 if newer->>'code'=link->>'code' then raise exception 'Replacement reused the code';end if;
 begin perform public.assessment_join_accept(third,(link->>'id')::uuid,link->>'code');raise exception 'Replaced link accepted a join';exception when check_violation then if sqlerrm<>'join_link_revoked' then raise;end if;end;
 if public.assessment_join_accept(second,(link->>'id')::uuid,link->>'code')->>'reused'<>'true' then raise exception 'Registered candidate lost access after replacement';end if;
 perform public.assessment_join_accept(third,(newer->>'id')::uuid,newer->>'code');
 perform public.assessment_command(owner,tenant,'join-link-revoke-1','join_link.revoke',jsonb_build_object('id',newer->>'id'));
 if public.assessment_join_preview(outsider,(newer->>'id')::uuid,newer->>'code')->>'state'<>'revoked' then raise exception 'Revoked link not shown revoked';end if;
 -- Closed sittings take no new joins and no new links.
 closed_win:=(public.assessment_command(owner,tenant,'join-window-0002','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Closing soon','opens_at',clock_timestamp()-interval '2 hours','closes_at',clock_timestamp()+interval '1 hour'))->>'id')::uuid;
 link:=public.assessment_command(owner,tenant,'join-link-create-3','join_link.create',jsonb_build_object('window_id',closed_win));
 update assessment_exam_windows set closes_at=clock_timestamp()-interval '1 second' where id=closed_win;
 begin perform public.assessment_join_accept(learner,(link->>'id')::uuid,link->>'code');raise exception 'Closed sitting accepted a join';exception when check_violation then if sqlerrm<>'window_closed' then raise;end if;end;
 begin perform public.assessment_command(owner,tenant,'join-link-create-4','join_link.create',jsonb_build_object('window_id',closed_win));raise exception 'Link created for a closed sitting';exception when check_violation then null;end;
 -- The candidate finds their institution without a tenant link.
 if public.assessment_candidate_institutions(learner)<>jsonb_build_array(jsonb_build_object('tenant_id',tenant,'name','Institution')) then raise exception 'Candidate institutions wrong: %',public.assessment_candidate_institutions(learner);end if;
 -- The institution chooses the name candidates see, with a revision fence.
 profile:=public.assessment_command(owner,tenant,'institution-name-1','institution.rename',jsonb_build_object('name','  Atlas Learning Centre ','revision',0));
 if profile->>'name'<>'Atlas Learning Centre' or profile->>'revision'<>'1' then raise exception 'Rename wrong: %',profile;end if;
 begin perform public.assessment_command(owner,tenant,'institution-name-2','institution.rename',jsonb_build_object('name','Stale','revision',0));raise exception 'Stale rename accepted';exception when unique_violation then null;end;
 begin perform public.assessment_command(outsider,tenant,'institution-name-3','institution.rename',jsonb_build_object('name','Hijack','revision',1));raise exception 'Outsider renamed the institution';exception when insufficient_privilege then null;end;
 if public.assessment_join_preview(learner,(newer->>'id')::uuid,newer->>'code')->>'institution'<>'Atlas Learning Centre' then raise exception 'Preview ignores the chosen name';end if;
 if (select tenants->>'name' from jsonb_to_recordset(public.assessment_workspaces(owner)) as x(tenant_id uuid,tenants jsonb) where tenant_id=tenant)<>'Atlas Learning Centre' then raise exception 'Workspace ignores the chosen name';end if;
 -- History and privacy.
 begin update assessment_join_links set code=repeat('1',64) where id=(newer->>'id')::uuid;raise exception 'Join link code edited';exception when check_violation then null;end;
 begin delete from assessment_join_links where id=(newer->>'id')::uuid;raise exception 'Join link deleted';exception when check_violation then null;end;
 begin update assessment_join_links set revoked_at=null,revoked_by=null where id=(newer->>'id')::uuid;raise exception 'Revoked link reopened';exception when check_violation then null;end;
 if (select count(*) from assessment_audit_events where action='registration.join')<>3 then raise exception 'Join audit wrong';end if;
 if has_table_privilege('authenticated','public.assessment_join_links','select') or has_function_privilege('authenticated','public.assessment_join_accept(uuid,uuid,text)','execute') or has_function_privilege('anon','public.assessment_join_preview(uuid,uuid,text)','execute') then raise exception 'Join links exposed to clients';end if;
end $$;
rollback;
