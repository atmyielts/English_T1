import {Miniflare} from 'miniflare';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const owner='00000000-0000-4000-8000-000000000003',tenant='10000000-0000-4000-8000-000000000001',attempt='80000000-0000-4000-8000-000000000001',alarmAttempt='80000000-0000-4000-8000-000000000002';
const secret='synthetic-coordinator-secret-000000000',device=owner,token='a'.repeat(64);
const directory=await mkdtemp(path.join(tmpdir(),'schood-coordinator-test-'));
const receipts=new Map(),calls=[];let finalized=false,alarmCalls=0,alarmResolve;
const alarmObserved=new Promise(resolve=>{alarmResolve=resolve;});
const snapshot=id=>({attempt_id:id,state:id===alarmAttempt&&finalized?'expired':'active',deadline_at:new Date(Date.now()+600000).toISOString(),section_deadline_at:new Date(Date.now()+600000).toISOString(),closes_at:new Date(Date.now()+3600000).toISOString(),section_index:0,last_sequence:receipts.size,lease_epoch:1,lease_expires_at:new Date(Date.now()+60000).toISOString(),server_time:new Date().toISOString(),next_deadline_at:id===alarmAttempt?(finalized?null:new Date(Date.now()+1200).toISOString()):new Date(Date.now()+600000).toISOString()});
async function upstream(request){
 const url=new URL(request.url),authorization=request.headers.get('authorization');
 if(url.pathname==='/auth/v1/user')return Response.json({id:authorization==='Bearer foreign'?'00000000-0000-4000-8000-000000000004':owner},{status:authorization==='Bearer invalid'?401:200});
 assert.equal(url.pathname,'/functions/v1/assessment-runtime');assert.equal(request.headers.get('x-assessment-coordinator-key'),secret);
 const body=await request.json();assert.equal(body.tenant_id,tenant);
 if(body.action==='alarm.expire'){alarmCalls++;finalized=true;alarmResolve();return Response.json({data:{snapshot:snapshot(body.attempt_id)}});}
 assert.equal(authorization,'Bearer synthetic');calls.push(body.action);
 if(body.action==='snapshot')return Response.json({data:{snapshot:snapshot(body.attempt_id)}});
 const key=request.headers.get('idempotency-key');assert.ok(key);
 if(!receipts.has(key)){if(body.action==='lease.acquire'){assert.equal(body.data.token,undefined);assert.match(body.data.token_hash,/^[a-f0-9]{64}$/);}receipts.set(key,{id:'canonical-receipt',epoch:1});}
 return Response.json({data:{result:receipts.get(key),snapshot:snapshot(body.attempt_id)}});
}
const options={modules:true,scriptPath:fileURLToPath(new URL('../dist/index.js',import.meta.url)),compatibilityDate:'2026-07-30',durableObjects:{ATTEMPTS:{className:'AttemptCoordinator',useSQLite:true}},durableObjectsPersist:directory,bindings:{SUPABASE_URL:'https://canonical-tests.invalid',SUPABASE_ANON_KEY:'synthetic-anon',ASSESSMENT_COORDINATOR_SECRET:secret,ALLOWED_ORIGINS:'https://exam-tests.invalid'},outboundService:upstream};
let worker;
const send=async(action,data,key)=>{
 const response=await worker.dispatchFetch(`https://coordinator-tests.invalid/attempts/${attempt}/commands?tenant_id=${tenant}`,{method:'POST',headers:{authorization:'Bearer synthetic',origin:'https://exam-tests.invalid','Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({action,data})});
 const payload=await response.json();assert.equal(response.status,200,JSON.stringify(payload));return payload;
};
try{
 worker=new Miniflare(options);
 const denied=await worker.dispatchFetch(`https://coordinator-tests.invalid/attempts/${attempt}/state?tenant_id=${tenant}`,{headers:{origin:'https://foreign-tests.invalid',authorization:'Bearer synthetic'}});assert.equal(denied.status,403);
 const acquired=await send('lease.acquire',{device_id:device,token},'local-acquire-001');assert.equal(acquired.data.result.epoch,1);
 const command={sequence:1,item_version_id:owner,response:'private-answer',lease:{device_id:device,token,epoch:1}};
 const saved=await send('response.append',command,'local-response-001');assert.equal(saved.data.result.id,'canonical-receipt');
 await send('response.append',command,'local-response-001');assert.equal(calls.filter(action=>action==='response.append').length,1);
 await worker.dispose();worker=new Miniflare(options);
 await send('response.append',command,'local-response-001');assert.equal(calls.filter(action=>action==='response.append').length,1);
 const foreign=await worker.dispatchFetch(`https://coordinator-tests.invalid/attempts/${attempt}/state?tenant_id=${tenant}`,{headers:{authorization:'Bearer foreign'}});assert.equal(foreign.status,404);
 const alarmState=await worker.dispatchFetch(`https://coordinator-tests.invalid/attempts/${alarmAttempt}/state?tenant_id=${tenant}`,{headers:{authorization:'Bearer synthetic'}});assert.equal(alarmState.status,200);
 let timeout;try{await Promise.race([alarmObserved,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Native Durable Object alarm did not fire')),10000);})]);}finally{clearTimeout(timeout);}
 assert.ok(alarmCalls>=1);
 process.stdout.write('Passed real local workerd/SQLite DO gateway: origin/identity checks, lease hashing, canonical commit receipts, restart replay, cross-candidate denial and native alarm reconciliation. Upstream Auth/Postgres responses are synthetic; SQL transactions have separate tests.\n');
}finally{
 if(worker)await worker.dispose();
 const resolved=path.resolve(directory);
 if(path.dirname(resolved)!==path.resolve(tmpdir())||!path.basename(resolved).startsWith('schood-coordinator-test-'))throw new Error('Refusing cleanup outside the generated test directory');
 await rm(resolved,{recursive:true,force:true});
}
