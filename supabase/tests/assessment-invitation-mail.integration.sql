\set ON_ERROR_STOP on
begin;
do $$declare a uuid:='00000000-0000-4000-8000-000000000001';t uuid:='10000000-0000-4000-8000-000000000001';r uuid;i uuid;ids uuid[]:='{}';deliveries uuid[]:='{}';tokens uuid[]:='{}';n integer;d jsonb;receipt jsonb;claim jsonb;handoff jsonb;org_before jsonb;replacement uuid:=gen_random_uuid();begin
 select jsonb_agg(to_jsonb(m) order by tenant_id,user_id,status,role) into org_before from tenant_memberships m;
 r:=(assessment_staff_command(a,t,'mail-test-author-role','role.create','{"title":"Mailed author","capabilities":["banks.read","items.write"],"reason":"Email invitation test"}')->>'id')::uuid;
 for n in 1..7 loop
  i:=gen_random_uuid();ids:=array_append(ids,i);deliveries:=array_append(deliveries,gen_random_uuid());
  perform assessment_invitation_command(a,t,'mail-test-invitation-'||n,'invite.create',jsonb_build_object('id',i,'recipient_email','mail'||n||'@example.test','role_version_id',r,'expires_at',clock_timestamp()+interval '1 day','permission_expires_at',null,'key_id','test','token_hash',repeat('a',64),'acknowledged',true,'reason','Canonical SMTP invitation'));
  d:=jsonb_build_object('id',deliveries[n],'invitation_id',i,'expected_invitation_revision',1,'kind','invitation','locale','uz','send_after',clock_timestamp(),'retry_of',null,'reason','Send reviewed invitation','acknowledged',true);
  receipt:=assessment_invitation_mail_command(a,t,'mail-test-queue-'||n,'mail.queue',d);
  if assessment_invitation_mail_command(a,t,'mail-test-queue-'||n,'mail.queue',d)<>receipt then raise exception 'Queue replay changed';end if;
 end loop;
 begin perform assessment_invitation_mail_claim(21);raise exception 'Unbounded mail claim';exception when invalid_parameter_value then null;end;
 claim:=assessment_invitation_mail_claim(20);if jsonb_array_length(claim)<>7 or jsonb_array_length(assessment_invitation_mail_claim(20))<>0 then raise exception 'Mail leased more than once';end if;
 for n in 1..7 loop tokens:=array_append(tokens,(select lease_token from assessment_invitation_mail where id=deliveries[n]));end loop;
 handoff:=assessment_invitation_mail_begin(t,deliveries[1],tokens[1]);if handoff->'send'<>'true'::jsonb or handoff->'invitation'->>'recipient_email'<>'mail1@example.test' then raise exception 'Canonical handoff missing';end if;
 if assessment_invitation_mail_begin(t,deliveries[1],tokens[1])->'send'<>'false'::jsonb then raise exception 'Duplicate begin released another message';end if;
 receipt:=assessment_invitation_mail_report(t,deliveries[1],tokens[1],'accepted','smtp_accepted');if assessment_invitation_mail_report(t,deliveries[1],tokens[1],'accepted','smtp_accepted')<>receipt then raise exception 'Lost SMTP receipt not recoverable';end if;
 begin perform assessment_invitation_mail_report(t,deliveries[1],tokens[1],'retry','smtp_connect');raise exception 'Conflicting SMTP receipt changed outcome';exception when unique_violation then null;end;
 if assessment_invitation_mail_read(a,t,ids[1])->0 ? 'lease_token' then raise exception 'Private transport lease exposed';end if;
 -- Safe pre-handoff failures are retried; another begin on the old lease fails.
 perform assessment_invitation_mail_report(t,deliveries[2],tokens[2],'retry','begin_unavailable');
 begin perform assessment_invitation_mail_begin(t,deliveries[2],tokens[2]);raise exception 'Old lease restarted a message';exception when unique_violation then null;end;
 perform assessment_invitation_mail_begin(t,deliveries[3],tokens[3]);perform assessment_invitation_mail_report(t,deliveries[3],tokens[3],'uncertain','smtp_unknown');
 d:=jsonb_build_object('id',replacement,'invitation_id',ids[3],'expected_invitation_revision',1,'kind','invitation','locale','en','send_after',clock_timestamp()+interval '2 minutes','reason','Explicit review of unknown handoff','acknowledged',true,'retry_of',deliveries[3],'expected_source_revision',(select revision from assessment_invitation_mail where id=deliveries[3]));
 begin perform assessment_invitation_mail_command(a,t,'mail-unsafe-duplicate','mail.queue',d);raise exception 'Uncertain delivery automatically duplicated';exception when check_violation then null;end;
 perform assessment_invitation_mail_command(a,t,'mail-reviewed-duplicate','mail.queue',d||jsonb_build_object('possible_duplicate_ack',true));
 if(select state from assessment_invitation_mail where id=deliveries[3])<>'uncertain' then raise exception 'Replacement rewrote original uncertainty';end if;
 -- A revoked invitation or withdrawn sender cancels before SMTP handoff.
 perform assessment_invitation_command(a,t,'mail-revoke-invitation','invite.revoke',jsonb_build_object('id',ids[4],'expected_revision',1,'reason','Do not mail revoked link'));
 if assessment_invitation_mail_begin(t,deliveries[4],tokens[4])->>'state'<>'cancelled' then raise exception 'Revoked invitation sent';end if;
 update tenant_memberships set status='inactive' where tenant_id=t and user_id=a;
 if assessment_invitation_mail_begin(t,deliveries[5],tokens[5])->>'state'<>'cancelled' then raise exception 'Withdrawn sender mailed';end if;
 begin perform assessment_invitation_mail_command(a,t,'mail-test-queue-7','mail.queue',d);raise exception 'Withdrawn manager replayed mail receipt';exception when insufficient_privilege then null;end;
 update tenant_memberships set status='active' where tenant_id=t and user_id=a;
 perform assessment_invitation_mail_begin(t,deliveries[6],tokens[6]);
 -- Only this disposable test DB uses a privileged clock fixture to age leases.
 alter table assessment_invitation_mail disable trigger assessment_invitation_mail_guard;
 update assessment_invitation_mail set lease_until=clock_timestamp()-interval '1 second' where id=any(array[deliveries[6],deliveries[7]]);
 alter table assessment_invitation_mail enable trigger assessment_invitation_mail_guard;
 perform assessment_invitation_mail_claim(20);
 if(select state from assessment_invitation_mail where id=deliveries[6])<>'uncertain' or(select state from assessment_invitation_mail where id=deliveries[7])<>'queued' then raise exception 'Abandoned SMTP handoff blindly retried or unsent lease stranded';end if;
 alter table assessment_invitation_mail disable trigger assessment_invitation_mail_guard;
 update assessment_invitation_mail set attempt_count=4,next_attempt_at=clock_timestamp()-interval '1 second' where id=deliveries[7];
 alter table assessment_invitation_mail enable trigger assessment_invitation_mail_guard;
 perform assessment_invitation_mail_claim(20);
 perform assessment_invitation_mail_report(t,deliveries[7],(select lease_token from assessment_invitation_mail where id=deliveries[7]),'retry','begin_unavailable');
 if(select state from assessment_invitation_mail where id=deliveries[7])<>'failed' or jsonb_array_length(assessment_invitation_mail_claim(20))<>0 then raise exception 'Mail attempts were unbounded';end if;
 -- A late definitive receipt can clarify an expired in-flight lease, without resend.
 perform assessment_invitation_mail_report(t,deliveries[6],tokens[6],'accepted','smtp_accepted');
 if(select state from assessment_invitation_mail where id=deliveries[6])<>'accepted' then raise exception 'Late SMTP acceptance lost';end if;
 perform assessment_invitation_mail_command(a,t,'mail-cancel-reminder','mail.cancel',jsonb_build_object('id',replacement,'expected_revision',1,'reason','Cancel scheduled duplicate','acknowledged',true));
 begin delete from assessment_invitation_mail where id=deliveries[1];raise exception 'Mail history deleted';exception when check_violation then null;end;
 if org_before is distinct from(select jsonb_agg(to_jsonb(m) order by tenant_id,user_id,status,role) from tenant_memberships m) or exists(select 1 from assessment_memberships) then raise exception 'Mail delivery changed institution memberships';end if;
 if has_table_privilege('authenticated','public.assessment_invitation_mail','select') or has_function_privilege('authenticated','public.assessment_invitation_mail_begin(uuid,uuid,uuid)','execute') or has_function_privilege('service_role','public.assessment_invitation_mail_event(uuid,text,text)','execute') then raise exception 'Private mail authority exposed';end if;
end;$$;
rollback;
