/** Disposable plan and sitting for the billing/integrations browser journey. */
export function seedAssessmentIntegrations(sql,actors,tenant){
 sql(`insert into entitlements(user_id,tenant_id,resource_type,resource_id,value,source) values('${actors.owner}','${tenant}','product',assessment_product_id(),'{"plan_id":"fixture-plan","limits":{"assessment_attempts_monthly":10}}','click') on conflict (tenant_id,resource_type,resource_id) do update set value=excluded.value,is_active=true,ends_at=null;
 create table assessment_integration_fixture_ids(window_id uuid);
 insert into assessment_integration_fixture_ids select (assessment_command('${actors.owner}','${tenant}','browser-integration-window','window.create',jsonb_build_object('assessment_version_id',(select assessment_version_id from assessment_exam_windows limit 1),'title','Integration sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '3 hours'))->>'id')::uuid;`);
 return JSON.parse(sql(`select jsonb_build_object('window',window_id,'candidate','${actors.candidate}') from assessment_integration_fixture_ids;`));
}
export function assessmentIntegrationProof(sql,tenant,ids){return JSON.parse(sql(`select jsonb_build_object(
 'endpoints',(select count(*) from assessment_webhook_endpoints where tenant_id='${tenant}' and state='active'),
 'plaintext_secrets',(select count(*) from assessment_webhook_endpoints where tenant_id='${tenant}' and secret_ciphertext like 'whsec_%'),
 'registration_deliveries',(select count(*) from assessment_webhook_deliveries d join assessment_events e on e.id=d.event_id where d.tenant_id='${tenant}' and e.type='registration.created' and e.data->>'window_id'='${ids.window}'),
 'api_registrations',(select count(*) from assessment_registrations where window_id='${ids.window}'),
 'integration_audits',(select count(*) from assessment_audit_events where tenant_id='${tenant}' and actor_kind='integration'),
 'clients_revoked',(select count(*) from assessment_api_clients where tenant_id='${tenant}' and state='revoked'),
 'live_tokens',(select count(*) from assessment_api_tokens t join assessment_api_clients c on c.id=t.client_id where c.tenant_id='${tenant}'),
 'webhook_audits',(select count(*) from assessment_audit_events where tenant_id='${tenant}' and action like 'webhook.%'),
 'client_audits',(select count(*) from assessment_audit_events where tenant_id='${tenant}' and action like 'api.client.%')
 );`));}
