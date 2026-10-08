// Production storage contract only. One tagged, exclusive-QA fixture; no grading,
// price, content, migration or customer-record changes. A short-lived tagged QA
// entitlement is created and removed on the exclusive test tenant only.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
if(!process.argv.includes('--live'))throw Error('Explicit --live required.');
const qa='5850d65b-8dac-4fd1-9add-a977f95baa5a',project='bbjawctnqrufvnesdsel',base='https://'+project+'.supabase.co';
const output=process.argv.find(v=>v.startsWith('--output='))?.slice(9);
const lookup=spawnSync('supabase',['projects','api-keys','--project-ref',project,'--output','json'],{encoding:'utf8',windowsHide:true,timeout:20000});
if(lookup.status!==0)throw Error('QA key lookup failed; credentials not logged.');
const keys=JSON.parse(lookup.stdout),anon=keys.find(k=>k.name==='anon')?.api_key,service=keys.find(k=>k.name==='service_role')?.api_key;
if(!anon||!service)throw Error('QA key lookup incomplete.');
const admin={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},checks=[],runId=randomUUID(),id=randomUUID();
let qaHeaders,tenant,grantId,created=false,cleanupConfirmed=false,grantCleanupConfirmed=false;
const assert=(v,m)=>{if(!v)throw Error(m);};
async function request(path,headers=admin,method='GET',body){const r=await fetch(base+path,{headers,method,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return {status:r.status,data:await r.json().catch(()=>null)};}
const ownedFilter='id=eq.'+id+'&user_id=eq.'+qa+'&metadata->>qa_run_id=eq.'+runId;
try{
  const user=await request('/auth/v1/admin/users/'+qa);
  assert(user.status===200&&user.data?.app_metadata?.qa_readiness_audit===true&&user.data.email?.endsWith('@example.invalid'),'Refusing non-QA identity.');
  const link=await request('/auth/v1/admin/generate_link',admin,'POST',{type:'magiclink',email:user.data.email});
  assert(link.status===200,'QA auth setup failed.');const hash=link.data?.properties?.hashed_token??link.data?.hashed_token;
  const session=await request('/auth/v1/verify',{apikey:anon,'Content-Type':'application/json'},'POST',{type:'magiclink',token_hash:hash});
  assert(session.status===200&&session.data?.user?.id===qa,'QA auth verification failed.');
  qaHeaders={apikey:anon,Authorization:'Bearer '+session.data.access_token,'Content-Type':'application/json'};
  const access=await request('/functions/v1/access-effective',qaHeaders);tenant=access.data?.tenant_id;
  assert(access.status===200&&access.data?.user?.id===qa&&tenant,'QA tenant unavailable.');
  const t=await request('/rest/v1/tenants?id=eq.'+tenant+'&select=id,type,created_by');
  const members=await request('/rest/v1/tenant_memberships?tenant_id=eq.'+tenant+'&select=user_id,role');
  assert(t.status===200&&t.data?.length===1&&t.data[0].type==='personal'&&t.data[0].created_by===qa&&members.status===200&&members.data?.length===1&&members.data[0].user_id===qa&&members.data[0].role==='owner','Refusing non-exclusive QA tenant.');
  const product='5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef';
  const preexisting=await request('/rest/v1/entitlements?tenant_id=eq.'+tenant+'&resource_type=eq.product&resource_id=eq.'+product+'&select=id');
  assert(preexisting.status===200&&preexisting.data?.length===0&&!access.data?.effective_product_ids?.includes(product),'QA SAT access must start unentitled.');
  grantId=randomUUID();
  const granted=await request('/rest/v1/entitlements',admin,'POST',{id:grantId,user_id:qa,tenant_id:tenant,resource_type:'product',resource_id:product,source:'qa_readiness_audit',is_active:true,starts_at:new Date(Date.now()-5000).toISOString(),ends_at:new Date(Date.now()+600000).toISOString(),value:{qa_readiness_audit:true,qa_run_id:runId}});
  assert(granted.status===201,'Exclusive QA grant failed.');
  const experiences=await request('/rest/v1/experiences?product_id=eq.5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef&is_active=eq.true&select=id&order=id&limit=1');
  assert(experiences.status===200&&experiences.data?.length===1,'Published SAT experience required.');
  const experience=experiences.data[0].id;
  const sections=await request('/rest/v1/sections?experience_id=eq.'+experience+'&select=id&order=display_order&limit=1');
  assert(sections.status===200&&sections.data?.length===1,'Published section required.');const section=sections.data[0].id;
  const parts=await request('/rest/v1/parts?section_id=eq.'+section+'&select=id&order=display_order&limit=1');
  assert(parts.status===200&&parts.data?.length===1,'Published part required.');
  const units=await request('/rest/v1/content_units?part_id=eq.'+parts.data[0].id+'&type=like.question_*&select=id,type&order=display_order&limit=1');
  assert(units.status===200&&units.data?.length===1,'Published question required.');const unit=units.data[0];
  // The fixture has no registration/token and cannot change a customer exam.
  // Set created before sending so an ambiguous write still gets exact cleanup.
  created=true;
  const inserted=await request('/rest/v1/sessions',admin,'POST',{id,user_id:qa,experience_id:experience,status:'active',started_at:new Date().toISOString(),metadata:{qa_readiness_audit:true,qa_run_id:runId,mode:'qa_storage_contract',deadlines:{[section]:new Date(Date.now()+300000).toISOString()}}});
  assert(inserted.status===201,'QA fixture creation failed.');
  const payload={session_id:id,content_unit_id:unit.id,type:unit.type,data:{selected_option:'QA_STORAGE_CONTRACT_ONLY'}};
  const saved=await request('/rest/v1/responses',qaHeaders,'POST',payload);
  assert(saved.status===201,'Authenticated own answer write did not succeed: HTTP '+saved.status+'; code '+(saved.data?.code??'unavailable'));
  const read=await request('/rest/v1/responses?session_id=eq.'+id+'&select=id,data',qaHeaders);
  assert(read.status===200&&read.data?.length===1&&read.data[0].data?.selected_option===payload.data.selected_option,'Own answer was not retained.');
  checks.push({case:'real-authenticated-own-answer-insert-and-read-confirmed',passed:true});
  const single={...qaHeaders,Prefer:'return=representation',Accept:'application/vnd.pgrst.object+json'};
  const closed=await request('/rest/v1/sessions?'+ownedFilter+'&select=id,status',single,'PATCH',{status:'completed',completed_at:new Date().toISOString()});
  assert(closed.status===200&&closed.data?.id===id&&closed.data?.status==='completed','Production completion did not return the exact owned row.');
  checks.push({case:'real-completion-representation-confirms-owned-id-and-status',passed:true});
  const late=await request('/rest/v1/responses',qaHeaders,'POST',payload);
  assert(late.status===403,'Closed attempt accepted an answer write.');
  checks.push({case:'closed-own-attempt-rejects-later-answer-writes',passed:true});
  const missing=await request('/rest/v1/sessions?id=eq.'+randomUUID()+'&select=id,status',single,'PATCH',{status:'completed',completed_at:new Date().toISOString()});
  assert(missing.status===406,'Zero-row session update unexpectedly confirmed a completion.');
  checks.push({case:'single-row-completion-contract-rejects-no-matching-session',passed:true});
}finally{
  if(created){
    const removed=await request('/rest/v1/sessions?'+ownedFilter,admin,'DELETE');
    const sessions=await request('/rest/v1/sessions?'+ownedFilter+'&select=id');
    const responses=await request('/rest/v1/responses?session_id=eq.'+id+'&select=id');
    assert(removed.status===204&&sessions.status===200&&sessions.data?.length===0&&responses.status===200&&responses.data?.length===0,'Exclusive QA fixture cleanup not confirmed.');
    cleanupConfirmed=true;
  }
  if(grantId&&tenant){
    const removed=await request('/rest/v1/entitlements?id=eq.'+grantId+'&user_id=eq.'+qa+'&tenant_id=eq.'+tenant+'&source=eq.qa_readiness_audit',admin,'DELETE');
    const check=await request('/rest/v1/entitlements?id=eq.'+grantId+'&select=id');
    assert(removed.status===204&&check.status===200&&check.data?.length===0,'Exclusive QA grant cleanup not confirmed.');
    grantCleanupConfirmed=true;
  }
  if(qaHeaders){const logout=await request('/auth/v1/logout?scope=local',qaHeaders,'POST');assert(logout.status===204,'QA logout failed.');}
  console.log(JSON.stringify({qaFixtureAbsenceConfirmed:cleanupConfirmed,qaGrantAbsenceConfirmed:grantCleanupConfirmed,qaLogoutConfirmed:Boolean(qaHeaders)}));
}
const evidence={checkedAt:new Date().toISOString(),productionContacted:true,exclusiveQaOnly:true,mode:'direct authenticated storage contract with temporary QA access; no paid UI, grading or provider proof',checks,fixtureCleanupConfirmed:cleanupConfirmed,qaGrantAbsenceConfirmed:grantCleanupConfirmed,qaLogoutConfirmed:true};
if(output)writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
