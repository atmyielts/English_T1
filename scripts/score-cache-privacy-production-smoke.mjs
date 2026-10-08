// Exclusive-QA cached row only. Never reads or changes a customer's prediction.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
if (!process.argv.includes('--live')) throw Error('Explicit --live required');
const project='bbjawctnqrufvnesdsel',qa='5850d65b-8dac-4fd1-9add-a977f95baa5a',base='https://'+project+'.supabase.co';
const lookup=spawnSync('supabase',['projects','api-keys','--project-ref',project,'--output','json'],{encoding:'utf8',windowsHide:true,timeout:20000});
if(lookup.status!==0)throw Error('Production key lookup failed; credentials not logged');
const keys=JSON.parse(lookup.stdout),anon=keys.find(k=>k.name==='anon')?.api_key,service=keys.find(k=>k.name==='service_role')?.api_key;
if(!anon||!service)throw Error('Production key lookup incomplete');
const admin={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},publicHeaders={apikey:anon,Authorization:'Bearer '+anon,'Content-Type':'application/json'};
const run=randomUUID(),id=randomUUID(),examType='qa_privacy_'+run,checks=[],cleanupErrors=[];
const filter='id=eq.'+id+'&user_id=eq.'+qa+'&metadata->>qa_run_id=eq.'+run;
let qaHeaders,created=false,fixtureRemoved=false,logoutConfirmed=false;
const assert=(v,m)=>{if(!v)throw Error(m);};
async function request(path,headers=admin,method='GET',body){const r=await fetch(base+path,{headers,method,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:r.status,data:await r.json().catch(()=>null)};}
try {
  // Stop before fixture creation if the public cache is still available.
  const denied=await request('/rest/v1/score_predictions?select=id&limit=0',publicHeaders,'HEAD');
  assert(denied.status===401||denied.status===403,'Cache permissions are not yet private; apply reviewed migration first');
  const user=await request('/auth/v1/admin/users/'+qa);
  assert(user.status===200&&user.data?.app_metadata?.qa_readiness_audit===true&&user.data.email?.endsWith('@example.invalid'),'Refusing non-QA identity');
  const link=await request('/auth/v1/admin/generate_link',admin,'POST',{type:'magiclink',email:user.data.email});
  assert(link.status===200,'QA authentication setup failed');
  const hash=link.data?.properties?.hashed_token??link.data?.hashed_token;
  const auth=await request('/auth/v1/verify',{apikey:anon,'Content-Type':'application/json'},'POST',{type:'magiclink',token_hash:hash});
  assert(auth.status===200&&auth.data?.user?.id===qa,'QA authentication verification failed');
  qaHeaders={apikey:anon,Authorization:'Bearer '+auth.data.access_token,'Content-Type':'application/json'};
  const own={id,user_id:qa,exam_type:examType,predicted_band:6,metadata:{qa_readiness_audit:true,qa_run_id:run}};
  created=true;
  const insert=await request('/rest/v1/score_predictions',admin,'POST',own);
  assert(insert.status===201,'Service-role owned-QA cache insert failed');
  const patch=await request('/rest/v1/score_predictions?'+filter,admin,'PATCH',{predicted_band:6.5});
  const read=await request('/rest/v1/score_predictions?'+filter+'&select=id,predicted_band');
  assert(patch.status===204&&read.status===200&&read.data?.length===1&&Number(read.data[0].predicted_band)===6.5,'Service-role owned-QA cache read/update failed');
  checks.push({case:'service-role-owned-QA-insert-read-update-compatible',passed:true});
  for(const [role,headers] of [['anon',publicHeaders],['authenticated-exclusive-QA',qaHeaders]]){
    const attempts=[
      ['select-row','GET','?'+filter+'&select=id'],
      ['select-column','GET','?'+filter+'&select=predicted_band'],
      ['insert','POST','',{...own,id:randomUUID(),exam_type:examType+'_denied'}],
      ['update','PATCH','?'+filter,{predicted_band:9}],
      ['delete','DELETE','?'+filter],
    ];
    for(const [operation,method,path,body] of attempts){
      const result=await request('/rest/v1/score_predictions'+path,headers,method,body);
      assert((result.status===401||result.status===403)&&result.data?.code==='42501','Expected permission denial: '+role+' '+operation+' HTTP '+result.status);
      checks.push({case:role+'-'+operation+'-denied',passed:true});
    }
  }
  const unchanged=await request('/rest/v1/score_predictions?'+filter+'&select=id,predicted_band');
  assert(unchanged.status===200&&unchanged.data?.length===1&&Number(unchanged.data[0].predicted_band)===6.5,'Denied browser commands changed own-QA cache');
  checks.push({case:'browser-denials-retain-original-owned-QA-cache',passed:true});
} finally {
  // Cleanup each resource independently so one cleanup failure cannot skip logout.
  if(created){try{
    const removed=await request('/rest/v1/score_predictions?user_id=eq.'+qa+'&metadata->>qa_run_id=eq.'+run,admin,'DELETE');
    const absent=await request('/rest/v1/score_predictions?user_id=eq.'+qa+'&metadata->>qa_run_id=eq.'+run+'&select=id');
    assert(removed.status===204&&absent.status===200&&absent.data?.length===0,'Own-QA fixture absence not confirmed');fixtureRemoved=true;
  }catch{cleanupErrors.push('own-QA cache cleanup not confirmed');}}
  if(qaHeaders){try{const result=await request('/auth/v1/logout?scope=local',qaHeaders,'POST');assert(result.status===204,'QA logout failed');logoutConfirmed=true;}catch{cleanupErrors.push('QA logout not confirmed');}}
  console.log(JSON.stringify({fixtureRemoved,logoutConfirmed,cleanupErrors}));
  if(cleanupErrors.length)throw Error(cleanupErrors.join('; '));
}
const evidence={checkedAt:new Date().toISOString(),productionContacted:true,exclusiveQaOnly:true,customerRowsRead:0,customerRowsChanged:0,checks,fixtureRemoved,logoutConfirmed};
const output=process.argv.find(v=>v.startsWith('--output='))?.slice(9);if(output)writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
