begin;
do $$declare
 t uuid:='10000000-0000-4000-8000-000000000001';o uuid:='00000000-0000-4000-8000-000000000001';c uuid:='00000000-0000-4000-8000-000000000003';admin uuid:='00000000-0000-4000-8000-0000000000ad';
 v uuid;f jsonb;w uuid;r uuid;r2 uuid;a uuid;a2 uuid;receipt jsonb;result jsonb;summary jsonb;unit uuid;sitting jsonb;start jsonb;
begin
 insert into public.users(id,role) values(admin,'admin');
 select assessment_version_id,manifest into v,f from public.assessment_forms limit 1;
 sitting:=jsonb_build_object('assessment_version_id',v,'title','Metered sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '3 hours');
 if (select status from public.products where id=public.assessment_product_id())<>'draft' then raise exception 'Assessment product must not be sellable before approved plans exist';end if;
 if public.assessment_billing_enforced() then raise exception 'Billing enforcement on by default';end if;

 -- Off by default: usage is metered but nothing is refused.
 w:=(public.assessment_command(o,t,'ent-window','window.create',sitting)->>'id')::uuid;
 r:=(public.assessment_command(o,t,'ent-registration','registration.create',jsonb_build_object('window_id',w,'candidate_id',c))->>'id')::uuid;
 r2:=(public.assessment_command(o,t,'ent-registration-2','registration.create',jsonb_build_object('window_id',(public.assessment_command(o,t,'ent-window-second','window.create',jsonb_set(sitting,'{title}','"Second metered sitting"'))->>'id')::uuid,'candidate_id',c))->>'id')::uuid;
 start:=jsonb_build_object('registration_id',r,'manifest',f,'manifest_hash',repeat('a',64));
 receipt:=public.assessment_command(c,t,'ent-start','attempt.start',start);a:=(receipt->>'id')::uuid;
 if public.assessment_command(c,t,'ent-start','attempt.start',start)<>receipt or (select count(*) from public.assessment_usage_ledger where source_id=a)<>1 then raise exception 'Start replay metered twice';end if;
 if (select state from public.assessment_usage_ledger where source_id=a)<>'reserved' then raise exception 'Started attempt not reserved';end if;
 update public.assessment_attempts set state='submitted',submitted_at=clock_timestamp() where id=a;
 if (select state from public.assessment_usage_ledger where source_id=a)<>'consumed' then raise exception 'Finished attempt not consumed';end if;

 -- Only Schood support changes enforcement; the command is idempotent.
 begin perform public.assessment_billing_configure(o,'ent-config-owner',true,'Institution tried');raise exception 'Institution owner changed enforcement';exception when insufficient_privilege then null;end;
 result:=public.assessment_billing_configure(admin,'ent-config-on',true,'Pilot plan enforcement');
 if public.assessment_billing_configure(admin,'ent-config-on',true,'Pilot plan enforcement')<>result or not public.assessment_billing_enforced() then raise exception 'Enforcement replay changed';end if;
 begin perform public.assessment_billing_configure(admin,'ent-config-on',false,'Different');raise exception 'Config key reused for a different change';exception when unique_violation then null;end;

 -- Enforced without an entitlement: new sittings and starts are refused.
 begin perform public.assessment_command(o,t,'ent-window-2','window.create',sitting);raise exception 'Unentitled sitting created';exception when insufficient_privilege then if sqlerrm<>'assessment_subscription_required' then raise;end if;end;
 begin perform public.assessment_command(c,t,'ent-start-2','attempt.start',jsonb_set(start,'{registration_id}',to_jsonb(r2)));raise exception 'Unentitled attempt started';exception when insufficient_privilege then if sqlerrm<>'assessment_subscription_required' then raise;end if;end;
 if exists(select 1 from public.assessment_attempts where registration_id=r2) then raise exception 'Refused start left an attempt';end if;

 -- A one-attempt monthly plan is already filled by the consumed unit.
 insert into public.entitlements(user_id,tenant_id,resource_type,resource_id,value,source) values(o,t,'product',public.assessment_product_id(),'{"plan_id":"fixture-plan","limits":{"assessment_attempts_monthly":1}}','click');
 perform public.assessment_command(o,t,'ent-window-3','window.create',jsonb_set(sitting,'{title}','"Entitled sitting"'));
 begin perform public.assessment_command(c,t,'ent-start-3','attempt.start',jsonb_set(start,'{registration_id}',to_jsonb(r2)));raise exception 'Quota exceeded';exception when check_violation then if sqlerrm<>'assessment_quota_exhausted' then raise;end if;end;
 if (select count(*) from public.assessment_usage_ledger where tenant_id=t and state in('reserved','consumed') and period_start=public.assessment_usage_period(clock_timestamp()))<>1 then raise exception 'Refused start was charged';end if;

 -- Support releases a unit with authority, reason and audit; capacity returns.
 unit:=(select id from public.assessment_usage_ledger where source_id=a);
 begin perform public.assessment_usage_adjust(o,t,'ent-release-owner',jsonb_build_object('action','release','ledger_id',unit,'reason','self-service'));raise exception 'Institution released its own usage';exception when insufficient_privilege then null;end;
 begin perform public.assessment_usage_adjust(admin,t,'ent-release-blank',jsonb_build_object('action','release','ledger_id',unit,'reason',' '));raise exception 'Unexplained adjustment accepted';exception when invalid_parameter_value then null;end;
 result:=public.assessment_usage_adjust(admin,t,'ent-release-1',jsonb_build_object('action','release','ledger_id',unit,'reason','Candidate device failed before the first question'));
 if result->>'state'<>'released' or public.assessment_usage_adjust(admin,t,'ent-release-1',jsonb_build_object('action','release','ledger_id',unit,'reason','Candidate device failed before the first question'))<>result then raise exception 'Release replay changed';end if;
 begin perform public.assessment_usage_adjust(admin,t,'ent-release-2',jsonb_build_object('action','release','ledger_id',unit,'reason','Again'));raise exception 'Released twice';exception when check_violation then null;end;
 a2:=(public.assessment_command(c,t,'ent-start-4','attempt.start',jsonb_set(start,'{registration_id}',to_jsonb(r2)))->>'id')::uuid;
 if (select state from public.assessment_usage_ledger where source_id=a2)<>'reserved' then raise exception 'Start after release not metered';end if;
 result:=public.assessment_usage_adjust(admin,t,'ent-restore-1',jsonb_build_object('action','restore','ledger_id',unit,'reason','Device failure not confirmed by the centre'));
 if result->>'state'<>'consumed' then raise exception 'Restore did not return the unit to consumed';end if;

 -- Institution view: owner sees period usage and adjustments; candidates do not.
 summary:=public.assessment_billing_summary(o,t);
 if not (summary->>'enforced')::boolean or (summary->>'attempt_limit')::int<>1 or (summary->>'attempts_consumed')::int<>1 or (summary->>'attempts_reserved')::int<>1 or jsonb_array_length(summary->'units')<2 then raise exception 'Billing summary wrong: %',summary;end if;
 if (select jsonb_array_length(u->'adjustments') from jsonb_array_elements(summary->'units') u where u->>'id'=unit::text)<>2 then raise exception 'Adjustments missing from summary';end if;
 if jsonb_array_length(public.assessment_billing_summary(o,t,(summary#>>'{units,0,created_at}')::timestamptz,(summary#>>'{units,0,id}')::uuid,1)->'units')<>1 then raise exception 'Keyset page wrong';end if;
 begin perform public.assessment_billing_summary(c,t);raise exception 'Candidate read institution billing';exception when insufficient_privilege then null;end;

 -- An expired entitlement stops new sittings again.
 update public.entitlements set ends_at=clock_timestamp()-interval '1 second' where tenant_id=t and resource_id=public.assessment_product_id();
 begin perform public.assessment_command(o,t,'ent-window-4','window.create',sitting);raise exception 'Expired entitlement accepted';exception when insufficient_privilege then null;end;

 if (select count(*) from public.assessment_audit_events where action in('billing.usage.release','billing.usage.restore') and target_id=unit)<>2 then raise exception 'Adjustments not audited';end if;
 if has_function_privilege('authenticated','public.assessment_billing_summary(uuid,uuid,timestamptz,uuid,integer)','execute') or has_function_privilege('authenticated','public.assessment_usage_adjust(uuid,uuid,text,jsonb)','execute') or has_function_privilege('service_role','public.assessment_attempt_meter()','execute') then raise exception 'Billing functions exposed';end if;
end;$$;
rollback;
