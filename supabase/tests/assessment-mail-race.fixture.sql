create table fixture_assessment_mail_ids(n integer,id uuid,invitation uuid,data jsonb,token uuid);
do $$declare r uuid;i uuid;id uuid;n integer;begin
 r:=(assessment_staff_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','mail-race-role','role.create','{"title":"Mail race reader","capabilities":["banks.read"],"reason":"Mail handoff races"}')->>'id')::uuid;
 for n in 1..2 loop i:=gen_random_uuid();id:=gen_random_uuid();
  perform assessment_invitation_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','mail-race-invite-'||n,'invite.create',jsonb_build_object('id',i,'recipient_email','mail-race-'||n||'@example.test','role_version_id',r,'expires_at',clock_timestamp()+interval '1 day','key_id','race','token_hash',repeat('a',64),'reason','Mail race invitation','acknowledged',true));
  insert into fixture_assessment_mail_ids values(n,id,i,jsonb_build_object('id',id,'invitation_id',i,'expected_invitation_revision',1,'kind','invitation','locale','en','send_after',clock_timestamp(),'retry_of',null,'reason','Race-safe delivery','acknowledged',true),null);
 end loop;
end;$$;
create function fixture_mail_queue(p_n integer) returns jsonb language sql as $$select assessment_invitation_mail_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','mail-race-create-'||p_n,'mail.queue',data) from fixture_assessment_mail_ids where n=p_n;$$;
create function fixture_mail_compete(p_action text,p_key text) returns jsonb language plpgsql as $$declare x fixture_assessment_mail_ids;result jsonb;begin select * into x from fixture_assessment_mail_ids where n=2;
 if p_action='begin' then result:=assessment_invitation_mail_begin('10000000-0000-4000-8000-000000000001',x.id,x.token);
 else result:=assessment_invitation_mail_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',p_key,'mail.cancel',jsonb_build_object('id',x.id,'expected_revision',2,'reason','Competing mail cancellation','acknowledged',true));end if;return result;
 exception when unique_violation or check_violation then return jsonb_build_object('lost',true);
end;$$;
