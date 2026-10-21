begin;
do $$declare
 t uuid:='10000000-0000-4000-8000-000000000001';o uuid:='00000000-0000-4000-8000-000000000001';c uuid:='00000000-0000-4000-8000-000000000003';
 v uuid;f jsonb;w uuid;r uuid;a uuid;endpoint jsonb;ep uuid;claimed jsonb;item jsonb;result jsonb;d uuid;lease uuid;i integer;rows jsonb;
begin
 select assessment_version_id,manifest into v,f from public.assessment_forms limit 1;
 -- Management authority and idempotency; ciphertext is not part of command identity or reads.
 begin perform public.assessment_webhook_command(c,t,'hook-foreign','endpoint.create',jsonb_build_object('url','https://hooks.example.org/a','events','["registration.created"]'::jsonb,'secret_ciphertext','v1:x'));raise exception 'Candidate created webhook';exception when insufficient_privilege then null;end;
 endpoint:=public.assessment_webhook_command(o,t,'hook-create','endpoint.create',jsonb_build_object('url','https://hooks.example.org/a','events','["attempt.submitted","registration.created","result.released"]'::jsonb,'secret_ciphertext','v1:first'));ep:=(endpoint->>'id')::uuid;
 if public.assessment_webhook_command(o,t,'hook-create','endpoint.create',jsonb_build_object('url','https://hooks.example.org/a','events','["attempt.submitted","registration.created","result.released"]'::jsonb,'secret_ciphertext','v1:different-bytes'))<>endpoint then raise exception 'Create replay changed';end if;
 if (select count(*) from public.assessment_webhook_endpoints where tenant_id=t)<>1 or endpoint::text like '%v1:%' then raise exception 'Create replay duplicated or leaked secret';end if;
 begin perform public.assessment_webhook_command(o,t,'hook-http','endpoint.create',jsonb_build_object('url','http://hooks.example.org/b','events','["registration.created"]'::jsonb,'secret_ciphertext','v1:y'));raise exception 'Plain HTTP endpoint stored';exception when check_violation then null;end;
 if public.assessment_webhook_read(o,t,'endpoints',null,null,null,10)::text like '%v1:%' then raise exception 'Endpoint read leaked ciphertext';end if;

 -- Producers: registration, submission and a scheduled release each emit one event and one delivery.
 w:=(public.assessment_command(o,t,'hook-window','window.create',jsonb_build_object('assessment_version_id',v,'title','Webhook sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'))->>'id')::uuid;
 r:=(public.assessment_command(o,t,'hook-registration','registration.create',jsonb_build_object('window_id',w,'candidate_id',c))->>'id')::uuid;
 if (select count(*) from public.assessment_events where type='registration.created' and subject_id=r)<>1 then raise exception 'Registration event missing';end if;
 if (select data from public.assessment_events where subject_id=r)<>jsonb_build_object('registration_id',r,'window_id',w) then raise exception 'Registration event carried extra data';end if;
 a:=(public.assessment_command(c,t,'hook-start','attempt.start',jsonb_build_object('registration_id',r,'manifest',f,'manifest_hash',repeat('a',64)))->>'id')::uuid;
 update public.assessment_attempts set state='submitted',submitted_at=clock_timestamp() where id=a;
 update public.assessment_attempts set state='submitted' where id=a;
 if (select count(*) from public.assessment_events where type='attempt.submitted' and subject_id=a)<>1 then raise exception 'Submission event missing or duplicated';end if;
 if (select count(*) from public.assessment_webhook_deliveries where endpoint_id=ep)<>2 then raise exception 'Deliveries not fanned out';end if;

 -- Claim, fail with backoff, stale lease, then success.
 update public.assessment_webhook_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where endpoint_id=ep;
 claimed:=public.assessment_webhook_claim(10);
 if jsonb_array_length(claimed)<>2 or (claimed->0->>'secret_ciphertext')<>'v1:first' or (claimed->0->>'attempt')<>'1' then raise exception 'Claim wrong: %',claimed;end if;
 if jsonb_array_length(public.assessment_webhook_claim(10))<>0 then raise exception 'Leased deliveries claimed twice';end if;
 item:=claimed->0;d:=(item->>'delivery_id')::uuid;lease:=(item->>'lease_token')::uuid;
 result:=public.assessment_webhook_report(d,lease,503,'Service Unavailable',60);
 if result->>'state'<>'pending' or (select next_attempt_at from public.assessment_webhook_deliveries where id=d)<clock_timestamp()+interval '55 seconds' then raise exception 'Failure not scheduled for retry';end if;
 if (public.assessment_webhook_report(d,lease,200,null,60)->>'accepted')::boolean then raise exception 'Stale lease report accepted';end if;
 item:=claimed->1;result:=public.assessment_webhook_report((item->>'delivery_id')::uuid,(item->>'lease_token')::uuid,204,null,60);
 if result->>'state'<>'delivered' then raise exception 'Success not recorded';end if;
 if (public.assessment_webhook_report((item->>'delivery_id')::uuid,(item->>'lease_token')::uuid,500,'late',60)->>'accepted')::boolean then raise exception 'Delivered outcome overwritten';end if;

 -- Repeated failures end in the dead-letter state; replay requeues it.
 for i in 1..7 loop
  update public.assessment_webhook_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id=d;
  claimed:=public.assessment_webhook_claim(10);item:=claimed->0;
  perform public.assessment_webhook_report((item->>'delivery_id')::uuid,(item->>'lease_token')::uuid,500,'Internal Server Error',60);
 end loop;
 if (select state||':'||attempts from public.assessment_webhook_deliveries where id=d)<>'dead:8' then raise exception 'Dead letter not reached: %',(select state||':'||attempts from public.assessment_webhook_deliveries where id=d);end if;
 begin perform public.assessment_webhook_command(c,t,'hook-replay-foreign','delivery.replay',jsonb_build_object('delivery_id',d));raise exception 'Candidate replayed delivery';exception when insufficient_privilege then null;end;
 result:=public.assessment_webhook_command(o,t,'hook-replay','delivery.replay',jsonb_build_object('delivery_id',d));
 if (select state||':'||attempts from public.assessment_webhook_deliveries where id=d)<>'pending:0' then raise exception 'Replay did not requeue';end if;

 -- Rotation keeps the previous secret signing for its overlap window only.
 endpoint:=public.assessment_webhook_command(o,t,'hook-rotate','endpoint.rotate',jsonb_build_object('endpoint_id',ep,'revision',1,'secret_ciphertext','v1:second'));
 if (endpoint->>'secret_version')::int<>2 then raise exception 'Rotation not versioned';end if;
 begin perform public.assessment_webhook_command(o,t,'hook-rotate-stale','endpoint.rotate',jsonb_build_object('endpoint_id',ep,'revision',1,'secret_ciphertext','v1:third'));raise exception 'Stale rotation accepted';exception when unique_violation then null;end;
 update public.assessment_webhook_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id=d;
 item:=public.assessment_webhook_claim(10)->0;
 if item->>'secret_ciphertext'<>'v1:second' or item->>'previous_secret_ciphertext'<>'v1:first' then raise exception 'Rotation overlap not offered';end if;
 perform public.assessment_webhook_report((item->>'delivery_id')::uuid,(item->>'lease_token')::uuid,200,null,60);
 update public.assessment_webhook_endpoints set previous_secret_expires_at=clock_timestamp()-interval '1 second' where id=ep;

 -- A scheduled release is delivered no earlier than its release time.
 perform public.assessment_event_emit(t,'result.released',gen_random_uuid(),'{"release_id":"x"}'::jsonb,clock_timestamp()+interval '1 day');
 if (select count(*) from public.assessment_webhook_deliveries dd join public.assessment_events e on e.id=dd.event_id where e.type='result.released' and dd.next_attempt_at<clock_timestamp()+interval '23 hours')<>0 then raise exception 'Scheduled release announced early';end if;

 -- Disabling stops pending deliveries; history stays readable without secrets.
 perform public.assessment_webhook_command(o,t,'hook-disable','endpoint.disable',jsonb_build_object('endpoint_id',ep,'revision',2));
 if exists(select 1 from public.assessment_webhook_deliveries where endpoint_id=ep and state in('pending','delivering')) then raise exception 'Disabled endpoint kept pending deliveries';end if;
 rows:=public.assessment_webhook_read(o,t,'deliveries',ep,null,null,2);
 if jsonb_array_length(rows)<>2 or rows::text like '%v1:%' then raise exception 'Delivery history wrong or leaked secret';end if;
 if jsonb_array_length(public.assessment_webhook_read(o,t,'deliveries',ep,(rows->1->>'created_at')::timestamptz,(rows->1->>'id')::uuid,10))<1 then raise exception 'Delivery keyset page empty';end if;
 begin perform public.assessment_webhook_read(c,t,'deliveries',null,null,null,10);raise exception 'Candidate read webhook history';exception when insufficient_privilege then null;end;

 if (select count(*) from public.assessment_audit_events where action like 'webhook.%' and tenant_id=t)<>4 then raise exception 'Webhook commands not audited: %',(select count(*) from public.assessment_audit_events where action like 'webhook.%');end if;
 if has_function_privilege('authenticated','public.assessment_webhook_claim(integer)','execute') or has_function_privilege('service_role','public.assessment_event_emit(uuid,text,uuid,jsonb,timestamptz)','execute') then raise exception 'Webhook delivery plane exposed';end if;
end;$$;
rollback;
