/** Four candidates start at the same moment against a two-attempt monthly plan:
 * exactly two starts succeed and exactly two units are charged. Runs only in
 * the caller's disposable local test container and restores enforcement off. */
export async function entitlementsRace(query,parallel){
 const tenant='10000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000001',admin='00000000-0000-4000-8000-0000000000ae';
 const candidates=Array.from({length:4},(_,i)=>`00000000-0000-4000-8000-0000000000b${i}`);
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
 query(`insert into users(id,role) values('${admin}','admin');insert into users(id) values${candidates.map(id=>`('${id}')`).join(',')};insert into tenant_memberships(tenant_id,user_id,status,role) values${candidates.map(id=>`('${tenant}','${id}','active','member')`).join(',')};
 create function fixture_entitlement_start(p_actor uuid,p_key text,p_data jsonb) returns jsonb language plpgsql as $$begin
  return jsonb_build_object('ok',true,'id',public.assessment_command(p_actor,'${tenant}',p_key,'attempt.start',p_data)->>'id');
 exception when others then return jsonb_build_object('ok',false,'error',sqlerrm);end;$$;`);
 const form=JSON.parse(query("select jsonb_build_object('version',assessment_version_id,'manifest',manifest) from assessment_forms limit 1;"));
 const command=(actor,key,action,data)=>JSON.parse(query(`select assessment_command('${actor}','${tenant}','${key}','${action}',${literal(data)});`));
 // Separate sittings so no shared sitting row serialises the starts; only the quota guard can.
 const registrations=candidates.map((candidate,i)=>{const sitting=command(owner,`ent-race-window-${i}`,'window.create',{assessment_version_id:form.version,title:`Quota race sitting ${i}`,opens_at:new Date(Date.now()-3600000).toISOString(),closes_at:new Date(Date.now()+3600000).toISOString()}).id;return command(owner,`ent-race-registration-${i}`,'registration.create',{window_id:sitting,candidate_id:candidate}).id;});
 query(`select assessment_billing_configure('${admin}','ent-race-config-on',true,'Quota race');
  insert into entitlements(user_id,tenant_id,resource_type,resource_id,value,source) values('${owner}','${tenant}','product',assessment_product_id(),'{"limits":{"assessment_attempts_monthly":2}}','click')
  on conflict (tenant_id,resource_type,resource_id) do update set value=excluded.value,is_active=true,ends_at=null;
  update assessment_usage_ledger set state='released' where tenant_id='${tenant}' and state in('reserved','consumed');`);
 try{
  const outcomes=(await parallel(candidates.map((candidate,i)=>`select fixture_entitlement_start('${candidate}','ent-race-start-${i}',${literal({registration_id:registrations[i],manifest:form.manifest,manifest_hash:'a'.repeat(64)})});`))).map(text=>JSON.parse(text));
  const started=outcomes.filter(row=>row.ok),refused=outcomes.filter(row=>!row.ok);
  if(started.length!==2||refused.some(row=>row.error!=='assessment_quota_exhausted'))throw Error('Concurrent starts exceeded or misreported the quota: '+JSON.stringify(outcomes));
  const charged=Number(query(`select count(*) from assessment_usage_ledger where tenant_id='${tenant}' and state in('reserved','consumed');`).trim());
  const attempts=Number(query(`select count(*) from assessment_attempts where registration_id in(${registrations.map(id=>`'${id}'`).join(',')});`).trim());
  if(charged!==2||attempts!==2)throw Error(`Quota race charged ${charged} units for ${attempts} attempts`);
  // Same-key replays after the race neither charge again nor create attempts.
  const replay=(await parallel(Array(4).fill(`select fixture_entitlement_start('${candidates[0]}','ent-race-start-0',${literal({registration_id:registrations[0],manifest:form.manifest,manifest_hash:'a'.repeat(64)})});`))).map(text=>JSON.parse(text));
  if(Number(query(`select count(*) from assessment_usage_ledger where tenant_id='${tenant}' and state in('reserved','consumed');`).trim())!==2||new Set(replay.map(row=>JSON.stringify(row))).size!==1)throw Error('Replay after the quota race changed usage');
 }finally{
  query(`select assessment_billing_configure('${admin}','ent-race-config-off',false,'Quota race finished');`);
 }
}
