\set ON_ERROR_STOP on
begin;
insert into users values('00000000-0000-4000-8000-000000000031'),('00000000-0000-4000-8000-000000000032'),('00000000-0000-4000-8000-000000000033');
do $$declare a uuid:='00000000-0000-4000-8000-000000000001';t uuid:='10000000-0000-4000-8000-000000000001';u uuid:='00000000-0000-4000-8000-000000000031';other_user uuid:='00000000-0000-4000-8000-000000000032';rid uuid;inv uuid:=gen_random_uuid();data jsonb;review jsonb;receipt jsonb;org_before jsonb;assignment uuid;begin
 select jsonb_agg(to_jsonb(m) order by tenant_id,user_id,status,role) into org_before from tenant_memberships m;
 rid:=(assessment_staff_command(a,t,'invite-role-create','role.create','{"title":"Invited author","capabilities":["banks.read","items.write"],"reason":"Reviewed author permissions"}')->>'id')::uuid;
 data:=jsonb_build_object('id',inv,'recipient_email','recipient@example.test','role_version_id',rid,'expires_at',clock_timestamp()+interval '1 day','permission_expires_at',null,'key_id','test','token_hash',repeat('a',64),'acknowledged',true,'reason','Welcome Assessment author');
 receipt:=assessment_invitation_command(a,t,'invitation-create-001','invite.create',data);
 if assessment_invitation_command(a,t,'invitation-create-001','invite.create',data)<>receipt then raise exception 'Create replay changed';end if;
 if assessment_invitation_read(a,t,inv)->>'token_hash' is not null then raise exception 'Invitation read exposed token hash';end if;
 begin perform assessment_invitation_preview(u,t,inv,repeat('b',64),'recipient@example.test');raise exception 'Wrong token accepted';exception when insufficient_privilege then null;end;
 begin perform assessment_invitation_preview(u,t,inv,repeat('a',64),'wrong@example.test');raise exception 'Wrong email accepted';exception when insufficient_privilege then null;end;
 begin perform assessment_invitation_preview(u,'10000000-0000-4000-8000-000000000002',inv,repeat('a',64),'recipient@example.test');raise exception 'Foreign institution accepted';exception when insufficient_privilege then null;end;
 review:=assessment_invitation_preview(u,t,inv,repeat('a',64),'recipient@example.test');
 -- Revising the template cannot change the reviewed invitation's pinned rights.
 perform assessment_staff_command(a,t,'invite-role-revise','role.revise',jsonb_build_object('role_id',(select role_id from assessment_staff_role_versions where id=rid),'expected_version',1,'title','Author revised','capabilities',jsonb_build_array('banks.read'),'reason','New narrower role version'));
 if assessment_invitation_preview(u,t,inv,repeat('a',64),'recipient@example.test')->>'review_hash'<>review->>'review_hash' then raise exception 'Invitation silently upgraded';end if;
 begin perform assessment_invitation_accept(u,t,'invite-accept-bad',inv,repeat('a',64),'recipient@example.test',repeat('b',64));raise exception 'Stale review accepted';exception when unique_violation then null;end;
 receipt:=assessment_invitation_accept(u,t,'invite-accept-001',inv,repeat('a',64),'recipient@example.test',review->>'review_hash');assignment:=(receipt->>'assignment_id')::uuid;
 if assessment_invitation_accept(u,t,'invite-accept-001',inv,repeat('a',64),'recipient@example.test',review->>'review_hash')<>receipt or assessment_invitation_accept(u,t,'invite-accept-other-key',inv,repeat('a',64),'recipient@example.test',review->>'review_hash')<>receipt then raise exception 'Accept replay changed';end if;
 if not assessment_has_capability(t,u,'items.write') or assessment_has_capability(t,u,'team.manage') or assessment_has_capability(t,u,'proctor.review') or jsonb_array_length(assessment_workspaces(u))<>1 then raise exception 'Invitation did not grant exact service role';end if;
 if exists(select 1 from tenant_memberships where user_id=u) or (select count(*) from assessment_staff_role_assignments where user_id=u)<>1 or (select count(*) from assessment_audit_events where action='staff.invite.accept' and target_id=inv)<>1 then raise exception 'Invitation created global membership or duplicated assignment/audit';end if;
 begin perform assessment_invitation_preview(other_user,t,inv,repeat('a',64),'recipient@example.test');raise exception 'Accepted invite transferred to another identity';exception when insufficient_privilege then null;end;
 begin perform assessment_invitation_read(a,t,inv,null,1,true);raise exception 'Accepted link recovered';exception when insufficient_privilege then null;end;
 perform assessment_staff_command(a,t,'invite-suspend-recipient','member.suspend',jsonb_build_object('user_id',u,'expected_revision',1,'reason','Suspend invited staff'));
 perform assessment_staff_command(a,t,'invite-revoke-role','role.revoke',jsonb_build_object('assignment_id',assignment,'expected_revision',1,'reason','Withdraw role after acceptance'));
 perform assessment_invitation_accept(u,t,'invite-accept-001',inv,repeat('a',64),'recipient@example.test',review->>'review_hash');
 if assessment_has_capability(t,u,'items.write') or (select status from assessment_memberships where tenant_id=t and user_id=u)<>'suspended' or (select count(*) from assessment_staff_role_assignments where user_id=u)<>1 then raise exception 'Historical receipt reactivated access';end if;
 -- Another pending invitation may not bypass a service suspension.
 inv:=gen_random_uuid();data:=data||jsonb_build_object('id',inv);
 perform assessment_invitation_command(a,t,'invite-suspended-create','invite.create',data);
 review:=assessment_invitation_preview(u,t,inv,repeat('a',64),'recipient@example.test');
 begin perform assessment_invitation_accept(u,t,'invite-suspended-accept',inv,repeat('a',64),'recipient@example.test',review->>'review_hash');raise exception 'Suspension bypassed';exception when insufficient_privilege then null;end;
 perform assessment_invitation_command(a,t,'invite-pending-revoke','invite.revoke',jsonb_build_object('id',inv,'expected_revision',1,'reason','Revoke pending invitation'));
 begin perform assessment_invitation_preview(u,t,inv,repeat('a',64),'recipient@example.test');raise exception 'Revoked invitation reviewed';exception when check_violation then null;end;
 -- The inviter must still hold current authority when a new recipient accepts.
 inv:=gen_random_uuid();data:=data||jsonb_build_object('id',inv,'recipient_email','another@example.test');
 perform assessment_invitation_command(a,t,'invite-authority-create','invite.create',data);
 review:=assessment_invitation_preview(other_user,t,inv,repeat('a',64),'another@example.test');
 update tenant_memberships set status='inactive' where tenant_id=t and user_id=a;
 begin perform assessment_invitation_accept(other_user,t,'invite-authority-accept',inv,repeat('a',64),'another@example.test',review->>'review_hash');raise exception 'Withdrawn inviter accepted';exception when insufficient_privilege then null;end;
 if exists(select 1 from assessment_memberships where tenant_id=t and user_id=other_user) then raise exception 'Failed acceptance left membership';end if;
 update tenant_memberships set status='active' where tenant_id=t and user_id=a;
 if org_before is distinct from (select jsonb_agg(to_jsonb(m) order by tenant_id,user_id,status,role) from tenant_memberships m) then raise exception 'Organization memberships changed';end if;
 -- Expired links remain visible to managers but cannot be accepted.
 inv:=gen_random_uuid();data:=data||jsonb_build_object('id',inv,'recipient_email','expiry@example.test','expires_at',clock_timestamp()+interval '100 milliseconds');
 perform assessment_invitation_command(a,t,'invite-expiry-create','invite.create',data);perform pg_sleep(0.15);
 if assessment_invitation_read(a,t,inv)->>'state'<>'expired' then raise exception 'Expired invitation displayed as pending';end if;
 begin perform assessment_invitation_preview('00000000-0000-4000-8000-000000000033',t,inv,repeat('a',64),'expiry@example.test');raise exception 'Expired invitation reviewed';exception when check_violation then null;end;
 -- Delegated managers cannot offer unheld rights or outlive their own authority.
 insert into assessment_memberships(tenant_id,user_id,status,created_by,updated_by) values(t,other_user,'active',a,a);
 perform assessment_staff_command(a,t,'invite-manager-management','capability.grant',jsonb_build_object('user_id',other_user,'capability','team.manage','expected_revision',0,'expires_at',clock_timestamp()+interval '10 minutes','reason','Bounded invitation manager'));
 perform assessment_staff_command(a,t,'invite-manager-read','capability.grant',jsonb_build_object('user_id',other_user,'capability','banks.read','expected_revision',0,'expires_at',clock_timestamp()+interval '10 minutes','reason','Bounded delegated reading'));
 data:=data||jsonb_build_object('id',gen_random_uuid(),'recipient_email','delegated@example.test','expires_at',clock_timestamp()+interval '1 minute','permission_expires_at',clock_timestamp()+interval '4 minutes');
 begin perform assessment_invitation_command(other_user,t,'invite-manager-excess','invite.create',data);raise exception 'Unheld rights offered';exception when insufficient_privilege then null;end;
 perform assessment_staff_command(a,t,'invite-manager-write','capability.grant',jsonb_build_object('user_id',other_user,'capability','items.write','expected_revision',0,'expires_at',clock_timestamp()+interval '5 minutes','reason','Bounded delegated authoring'));
 begin perform assessment_invitation_command(other_user,t,'invite-manager-unbounded','invite.create',data||jsonb_build_object('permission_expires_at',null));raise exception 'Unbounded role lifetime offered';exception when check_violation then null;end;
 data:=data||jsonb_build_object('permission_expires_at',clock_timestamp()+interval '4 minutes');
 perform assessment_invitation_command(other_user,t,'invite-manager-bounded','invite.create',data);
 begin delete from assessment_staff_invitations where id=inv;raise exception 'Invitation history deleted';exception when check_violation then null;end;
 if has_table_privilege('authenticated','public.assessment_staff_invitations','select') or has_function_privilege('authenticated','public.assessment_invitation_accept(uuid,uuid,text,uuid,text,text,text)','execute') or has_function_privilege('service_role','public.assessment_invitation_snapshot(uuid)','execute') then raise exception 'Private invitation authority exposed';end if;
end;$$;
rollback;
