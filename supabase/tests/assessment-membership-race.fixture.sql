insert into users(id) values('71000000-0000-4000-8000-000000000027');
insert into assessment_memberships(tenant_id,user_id,status,created_by,updated_by) values('10000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000027','active','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
select assessment_staff_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','membership-race-grant','capability.grant','{"user_id":"71000000-0000-4000-8000-000000000027","capability":"items.write","expected_revision":0,"reason":"Membership race author"}');
create function public.fixture_membership_race(p_key text,p_action text,p_revision bigint) returns jsonb language plpgsql as $$declare result jsonb;begin
 result:=assessment_staff_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',p_key,p_action,jsonb_build_object('user_id','71000000-0000-4000-8000-000000000027','expected_revision',p_revision,'reason','Concurrent membership transition'));
 return jsonb_build_object('won',true,'receipt',result);exception when unique_violation then return jsonb_build_object('won',false);end;$$;
create function public.fixture_membership_race_write(p_key text) returns jsonb language plpgsql as $$declare result jsonb;begin
 result:=public.assessment_command('71000000-0000-4000-8000-000000000027','10000000-0000-4000-8000-000000000001',p_key,'bank.create','{"title":"Concurrent local Assessment author"}');return jsonb_build_object('accepted',true,'receipt',result);
 exception when insufficient_privilege then return jsonb_build_object('accepted',false);end;$$;
