begin;
do $$declare
 t uuid:='10000000-0000-4000-8000-000000000001';o uuid:='00000000-0000-4000-8000-000000000001';c uuid:='00000000-0000-4000-8000-000000000003';
 h1 text:=repeat('1',64);h2 text:=repeat('2',64);tok text:=repeat('a',64);tok2 text:=repeat('b',64);
 v uuid;w uuid;client jsonb;cid uuid;issued jsonb;page jsonb;reg jsonb;results jsonb;expected bigint;
begin
 select assessment_version_id into v from public.assessment_forms limit 1;
 w:=(public.assessment_command(o,t,'api-window','window.create',jsonb_build_object('assessment_version_id',v,'title','API sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'))->>'id')::uuid;
 -- Management: team.manage only; secret material is not part of command identity.
 begin perform public.assessment_api_client_command(c,t,'api-client-foreign','client.create',jsonb_build_object('name','x','scopes','["events:read"]'::jsonb,'secret_hash',h1,'hint','1111'));raise exception 'Candidate created API client';exception when insufficient_privilege then null;end;
 client:=public.assessment_api_client_command(o,t,'api-client-create','client.create',jsonb_build_object('name','Student information system','scopes','["registrations:write","events:read","registrations:read"]'::jsonb,'secret_hash',h1,'hint','1111'));cid:=(client->>'id')::uuid;
 if public.assessment_api_client_command(o,t,'api-client-create','client.create',jsonb_build_object('name','Student information system','scopes','["registrations:write","events:read","registrations:read"]'::jsonb,'secret_hash',h2,'hint','2222'))<>client or client->>'secret_check'<>h1 then raise exception 'Client create replay changed or stored a second secret';end if;
 if (select count(*) from public.assessment_api_client_secrets where client_id=cid)<>1 then raise exception 'Replay stored another secret';end if;
 begin perform public.assessment_api_client_command(o,t,'api-client-bad-scope','client.create',jsonb_build_object('name','x','scopes','["grades:write"]'::jsonb,'secret_hash',repeat('3',64),'hint','3333'));raise exception 'Unknown scope accepted';exception when check_violation then null;end;
 if public.assessment_api_client_list(o,t)::text like '%'||h1||'%' then raise exception 'Client list leaked a secret hash';end if;

 -- Client credentials → opaque token; wrong secret, missing scope.
 begin perform public.assessment_api_token_issue(cid,repeat('9',64),tok);raise exception 'Wrong secret issued a token';exception when insufficient_privilege then null;end;
 issued:=public.assessment_api_token_issue(cid,h1,tok);
 if issued->>'tenant_id'<>t::text or (issued->>'expires_at')::timestamptz>clock_timestamp()+interval '16 minutes' then raise exception 'Token issue wrong: %',issued;end if;
 begin perform public.assessment_api_read(tok,'results',null,null,10);raise exception 'Unscoped results read';exception when insufficient_privilege then if sqlerrm<>'insufficient_scope' then raise;end if;end;

 -- Write under the creator's authority, idempotent by client key, audited as integration.
 reg:=public.assessment_api_command(tok,'sis-registration-0001','registration.create',jsonb_build_object('window_id',w,'candidate_id',c));
 if public.assessment_api_command(tok,'sis-registration-0001','registration.create',jsonb_build_object('window_id',w,'candidate_id',c))<>reg then raise exception 'API write replay changed';end if;
 begin perform public.assessment_api_command(tok,'sis-registration-0001','registration.create',jsonb_build_object('window_id',w,'candidate_id',o));raise exception 'API key reused for another write';exception when unique_violation then null;end;
 if (select created_by from public.assessment_registrations where id=(reg->>'id')::uuid)<>o then raise exception 'Registration not attributed to client owner';end if;
 if (select actor_kind from public.assessment_audit_events where action='api.registration.create' and target_id=(reg->>'id')::uuid)<>'integration' then raise exception 'Integration write not audited as integration';end if;

 -- Reads: keyset pages and the event feed for reconciling missed webhooks.
 page:=public.assessment_api_read(tok,'registrations',w,null,1);
 if jsonb_array_length(page->'data')<>1 or page->>'next_after'<>(page->'data'->0->>'id') then raise exception 'Registration page wrong: %',page;end if;
 if jsonb_array_length(public.assessment_api_read(tok,'registrations',w,page->>'next_after',10)->'data')<>0 then raise exception 'Page after the last row not empty';end if;
 page:=public.assessment_api_read(tok,'events',null,null,500);
 if not exists(select 1 from jsonb_array_elements(page->'data') e where e->>'type'='registration.created' and e#>>'{data,registration_id}'=reg->>'id') then raise exception 'Event feed missed the registration';end if;
 if page::text like '%secret%' then raise exception 'Event feed leaked secret material';end if;

 -- Results: only released, due, latest-generation results, totals only.
 perform public.assessment_api_client_command(o,t,'api-client-scopes','client.update',jsonb_build_object('client_id',cid,'revision',1,'scopes','["events:read","registrations:read","registrations:write","results:read"]'::jsonb));
 results:=public.assessment_api_read(tok,'results',null,null,500)->'data';
 select count(distinct run.attempt_id) into expected from public.assessment_grading_releases rel join public.assessment_grading_runs run on run.id=rel.run_id where rel.tenant_id=t and rel.release_at<=clock_timestamp();
 if jsonb_array_length(results)<>expected or exists(select 1 from jsonb_array_elements(results) r where (r->>'score')::numeric>(r->>'max_score')::numeric or (r->>'release_at')::timestamptz>clock_timestamp() or r ? 'scores') then raise exception 'Results read wrong (% vs %)',jsonb_array_length(results),expected;end if;

 -- Rotation overlap, then expiry of the old secret.
 perform public.assessment_api_client_command(o,t,'api-client-rotate','client.rotate',jsonb_build_object('client_id',cid,'revision',2,'secret_hash',h2,'hint','2222'));
 perform public.assessment_api_token_issue(cid,h1,repeat('c',64));perform public.assessment_api_token_issue(cid,h2,repeat('d',64));
 update public.assessment_api_client_secrets set expires_at=clock_timestamp()-interval '1 second' where secret_hash=h1;
 begin perform public.assessment_api_token_issue(cid,h1,repeat('e',64));raise exception 'Expired secret still works';exception when insufficient_privilege then null;end;

 -- The client loses access when its creator loses the capability.
 update public.tenant_memberships set status='inactive' where tenant_id=t and user_id=o;
 begin perform public.assessment_api_read(tok,'registrations',null,null,10);raise exception 'Client outlived its creator''s authority';exception when insufficient_privilege then null;end;
 update public.tenant_memberships set status='active' where tenant_id=t and user_id=o;

 -- Revocation removes every token immediately.
 perform public.assessment_api_client_command(o,t,'api-client-revoke','client.revoke',jsonb_build_object('client_id',cid,'revision',3));
 begin perform public.assessment_api_read(tok,'registrations',null,null,10);raise exception 'Revoked client token still works';exception when insufficient_privilege then if sqlerrm<>'invalid_token' then raise;end if;end;
 begin perform public.assessment_api_token_issue(cid,h2,tok2);raise exception 'Revoked client issued a token';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.assessment_api_tokens where client_id=cid) then raise exception 'Revoked tokens remain';end if;
 if has_function_privilege('authenticated','public.assessment_api_read(text,text,uuid,text,integer)','execute') or has_function_privilege('service_role','public.assessment_api_principal(text,text)','execute') then raise exception 'API functions exposed';end if;
end;$$;
rollback;
