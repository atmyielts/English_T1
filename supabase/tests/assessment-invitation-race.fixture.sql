insert into users(id) values('71000000-0000-4000-8000-000000000028'),('71000000-0000-4000-8000-000000000029');
create table fixture_invitation_race_ids(n integer,id uuid,recipient uuid,email text,data jsonb);
do $$declare role_version uuid;i integer;id uuid;recipient uuid;email text;begin
 role_version:=(assessment_staff_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','invitation-race-role','role.create','{"title":"Concurrent invited reader","capabilities":["banks.read"],"reason":"Invitation replay and competing acceptance"}')->>'id')::uuid;
 for i in 1..2 loop
  id:=gen_random_uuid();recipient:=case when i=1 then '71000000-0000-4000-8000-000000000028'::uuid else '71000000-0000-4000-8000-000000000029'::uuid end;email:='race'||i||'@example.test';
  insert into fixture_invitation_race_ids values(i,id,recipient,email,jsonb_build_object('id',id,'recipient_email',email,'role_version_id',role_version,'permission_expires_at',null,'expires_at',clock_timestamp()+interval '1 day','key_id','race','token_hash',repeat('a',64),'acknowledged',true,'reason','Concurrent invitation'));
 end loop;
end;$$;
create function fixture_invitation_race(p_n integer,p_action text,p_key text) returns jsonb language plpgsql as $$declare row fixture_invitation_race_ids;review jsonb;receipt jsonb;begin
 select * into row from fixture_invitation_race_ids where n=p_n;
 if p_action='create' then receipt:=assessment_invitation_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',p_key,'invite.create',row.data);
 elsif p_action='revoke' then receipt:=assessment_invitation_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',p_key,'invite.revoke',jsonb_build_object('id',row.id,'expected_revision',1,'reason','Concurrent invitation revocation'));
 else review:=assessment_invitation_preview(row.recipient,'10000000-0000-4000-8000-000000000001',row.id,repeat('a',64),row.email);receipt:=assessment_invitation_accept(row.recipient,'10000000-0000-4000-8000-000000000001',p_key,row.id,repeat('a',64),row.email,review->>'review_hash');end if;
 return jsonb_build_object('ok',true,'receipt',receipt);
 exception when unique_violation or check_violation then return jsonb_build_object('ok',false);
end;$$;
