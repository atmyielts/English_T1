import {createRuntimeHandler,type RuntimeRepository} from './handler.ts';
const secret='synthetic-coordinator-secret-000000000',actor='00000000-0000-4000-8000-000000000001',tenant='10000000-0000-4000-8000-000000000001';
let writes:Record<string,unknown>[]=[];
const repository:RuntimeRepository={user:()=>Promise.resolve(actor),snapshot:()=>Promise.resolve({}),expire:()=>Promise.resolve({state:'expired'}),claim:()=>Promise.resolve([]),reconcile:()=>Promise.resolve({accepted:false}),command:(who,_tenant,_key,action,data)=>{writes.push({who,action,data});return Promise.resolve({result:{id:actor},snapshot:{}});}};
function req(action:string,data:unknown={},headers:Record<string,string>={}){return new Request('https://test.invalid/assessment-runtime',{method:'POST',headers:{'x-assessment-coordinator-key':secret,authorization:'Bearer fixture','Idempotency-Key':'runtime-0001',...headers},body:JSON.stringify({tenant_id:tenant,attempt_id:actor,action,data})});}
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`);};
Deno.test('runtime bridge requires coordinator authority before candidate authentication or alarm expiry',async()=>{
 const handle=createRuntimeHandler(repository,secret);equal((await handle(req('alarm.expire',{}, {'x-assessment-coordinator-key':'forged'}))).status,403);
 equal((await createRuntimeHandler({...repository,user:()=>Promise.resolve(null)},secret)(req('snapshot'))).status,401);
 equal((await handle(req('alarm.expire',{}, {authorization:''}))).status,200);
});
Deno.test('runtime reconstructs candidate response and hash, ignoring actor, tenant, state and supplied hash',async()=>{
 writes=[];const response=await createRuntimeHandler(repository,secret)(req('response.append',{actor:tenant,tenant_id:actor,state:'submitted',attempt_id:tenant,item_version_id:actor,sequence:1,response:'a',payload_hash:'forged',lease:{device_id:actor,token_hash:'a'.repeat(64),epoch:1}}));
 equal(response.status,200);const data=writes[0].data as Record<string,unknown>;equal(writes[0].who,actor);equal(data.attempt_id,actor);equal(data.actor,undefined);equal(data.state,undefined);equal(String(data.payload_hash).length,64);equal(data.payload_hash==='forged',false);
});
Deno.test('runtime rejects missing lease fields, unknown actions and invalid hashes before writes',async()=>{
 const handle=createRuntimeHandler(repository,secret);writes=[];
 equal((await handle(req('response.append',{sequence:1,response:'a',item_version_id:actor}))).status,422);
 equal((await handle(req('lease.acquire',{device_id:actor,token_hash:'forged'}))).status,422);
 equal((await handle(req('grade.override',{lease:{device_id:actor,token_hash:'a'.repeat(64),epoch:1}}))).status,422);equal(writes.length,0);
});
Deno.test('recovery actions require coordinator secret, bounded claim and scoped revision ticket, not a candidate bearer',async()=>{
 let calls=0;const handle=createRuntimeHandler({...repository,user:()=>{throw new Error('Recovery must not impersonate candidate authentication');},claim:limit=>{calls++;return Promise.resolve([limit]);},reconcile:(_tenant,_attempt,revision,token)=>{calls++;return Promise.resolve({revision,token});}},secret);
 equal((await handle(req('schedule.claim',{limit:100},{authorization:''}))).status,200);
 equal((await handle(req('schedule.claim',{limit:101}))).status,422);
 equal((await handle(req('schedule.claim',{limit:1},{'x-assessment-coordinator-key':'forged'}))).status,403);
 equal((await handle(req('schedule.reconcile',{revision:1,lease_token:actor},{authorization:''}))).status,200);
 equal((await handle(req('schedule.reconcile',{revision:1,lease_token:'forged'}))).status,422);equal(calls,2);
});
Deno.test('a device takeover is forwarded only as an explicit boolean confirmation',async()=>{
 const handle=createRuntimeHandler(repository,secret);writes=[];const lease={device_id:actor,token_hash:'a'.repeat(64)};
 equal((await handle(req('lease.acquire',{...lease,takeover:true}))).status,200);
 equal((await handle(req('lease.acquire',{...lease,takeover:false}))).status,200);
 equal((await handle(req('lease.acquire',lease))).status,200);
 equal((await handle(req('lease.acquire',{...lease,takeover:'yes'}))).status,422);
 equal(writes.map(row=>(row.data as Record<string,unknown>).takeover),[true,undefined,undefined]);
});
