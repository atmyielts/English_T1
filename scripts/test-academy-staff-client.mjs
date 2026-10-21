import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../apps/academy/src/lib/staffRequest.ts',import.meta.url),'utf8');
const compiled=buildSync({stdin:{contents:source,loader:'ts',resolveDir:dirname(fileURLToPath(new URL('../apps/academy/src/lib/staffRequest.ts',import.meta.url)))},bundle:true,write:false,external:['./supabase'],format:'cjs',target:'es2022',define:{'import.meta.env.VITE_SUPABASE_URL':'"https://owned.invalid"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"public-fixture"'}}).outputFiles[0].text;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),other=id(2),academy=id(3);
const session=who=>({user:{id:who},access_token:'owned.'+Buffer.from(JSON.stringify({sub:who})).toString('base64url')+'.fixture'});
function client(initial,refreshed=initial,respond=()=>new Response('{}'),sessionStorage=undefined){
 const calls=[],module={exports:{}};let current=initial;
 runInNewContext(compiled,{module,exports:module.exports,crypto:webcrypto,require:()=>({supabase:{auth:{getSession:async()=>({data:{session:current}}),refreshSession:async()=>({data:{session:refreshed}})}}}),
  sessionStorage,atob,TextEncoder,structuredClone,AbortController,setTimeout,clearTimeout,fetch:async(...args)=>{calls.push(args);return respond(...args);}});
 return {...module.exports,calls,switchTo:who=>{current=session(who);}};
}
let checks=0;
for(const value of [session(other),{...session(actor),access_token:session(other).access_token}]){
 const c=client(value);await assert.rejects(()=>c.staffRequest(academy,'upsert_staff',{id:id(4)},actor),e=>e.status===409&&!e.retryable);
 assert.equal(c.calls.length,0);checks++;
}
{
 const c=client(session(actor),session(other),()=>new Response('{}',{status:401}));
 await assert.rejects(()=>c.staffRequest(academy,'remove_staff',{id:id(4)},actor),e=>e.status===409&&!e.retryable);assert.equal(c.calls.length,1);checks++;
}
{
 let count=0;const c=client(session(actor),undefined,()=>{if(count++===0)throw Error('Owned network interruption');return new Response('{"ok":true}');});
 const payload={id:id(4)};
 await assert.rejects(()=>c.staffRequest(academy,'remove_staff',payload,actor),e=>e.status===503&&e.retryable);
 await c.staffRequest(academy,'remove_staff',payload,actor);
 const bodies=c.calls.map(([,request])=>JSON.parse(request.body));assert.equal(bodies[0].idempotency_key,bodies[1].idempotency_key);
 assert.equal(bodies[1].academy_id,academy);assert.equal(bodies[1].id,id(4));checks++;
 assert.equal(bodies[1].action,'staff_access_command');assert.equal(bodies[1].command,'remove_staff');checks++;
}
{
 const c=client(session(actor),undefined,()=>{c.switchTo(other);return new Response('{"ok":true}');});
 await assert.rejects(()=>c.staffRequest(academy,'remove_staff',{id:id(4)},actor),e=>e.status===409);checks++;
}
{
 let count=0;const c=client(session(actor),undefined,()=>new Response(count++===0?'{}':'{"ok":true}'));
 const payload={id:id(4)};
 await assert.rejects(()=>c.staffRequest(academy,'remove_staff',payload,actor),e=>e.status===503&&e.retryable);
 await c.staffRequest(academy,'remove_staff',payload,actor);
 assert.equal(JSON.parse(c.calls[0][1].body).idempotency_key,JSON.parse(c.calls[1][1].body).idempotency_key);checks++;
}
{
 let count=0;const c=client(session(actor),undefined,()=>new Response(JSON.stringify({invitation:{id:id(4),academy_id:academy},retryable:count++===0}),{status:count===1?202:200}));
 const body={invite_kind:'staff',email:'owned@example.invalid',role:'teacher'};
 await assert.rejects(()=>c.staffRequest(academy,'create_access_invitation',body,actor),e=>e.status===202&&e.retryable);
 await c.staffRequest(academy,'create_access_invitation',body,actor);
 const first=JSON.parse(c.calls[0][1].body),second=JSON.parse(c.calls[1][1].body);
 assert.equal(first.idempotency_key,second.idempotency_key);assert.equal(first._delivery_token,second._delivery_token);assert.match(first._delivery_token,/^[a-f0-9]{64}$/);checks++;
 assert.equal(first.action,'access_invitation_command');assert.equal(first.command,'create_access_invitation');checks++;
}
{
 const c=client(session(actor),undefined,()=>new Response('{"error":"Not found"}',{status:404}));
 await assert.rejects(()=>c.staffRequest(academy,'upsert_staff',{},actor),e=>e.status===503&&e.retryable);checks++;
}
{
 const progress={import_job_id:id(4),status:'committing',rollback_status:'available',committed_rows:25,failed_rows:0,pending_rows:2,recovery_pending:25,completed:0,manual_required:0,failed:0};
 let count=0;const c=client(session(actor),undefined,()=>new Response(JSON.stringify(count++===0?{...progress,import_job_id:id(5)}:progress),{status:207}));
 const payload={import_job_id:id(4),confirm_commit:true};
 await assert.rejects(()=>c.staffRequest(academy,'commit_import_job',payload,actor),e=>e.status===503&&e.retryable);
 const saved=await c.staffRequest(academy,'commit_import_job',payload,actor);assert.equal(saved.pending_rows,2);
 const first=JSON.parse(c.calls[0][1].body),second=JSON.parse(c.calls[1][1].body);
 assert.equal(first.action,'legacy_import_command');assert.equal(first.command,'commit_import_job');assert.equal(first.idempotency_key,second.idempotency_key);checks++;
 const switched=client(session(actor),undefined,()=>{switched.switchTo(other);return new Response(JSON.stringify(progress));});
 await assert.rejects(()=>switched.staffRequest(academy,'commit_import_job',payload,actor),e=>e.status===409);checks++;
}
{
 const row={id:id(4),academy_id:academy,invite_kind:'guardian',status:'pending',review_hash:'a'.repeat(32),shared_sections:['Attendance']};
 const c=client(session(actor),undefined,()=>new Response(JSON.stringify({invitation:row})));
 await c.staffRequest('','invitation_status',{token:'owned-token'},actor);
 const body=JSON.parse(c.calls[0][1].body);assert.equal(body.action,'invitation_link_command');assert.equal(body.command,'invitation_status');checks++;
 const refreshed=client(session(actor),session(other),()=>new Response('{}',{status:401}));
 await assert.rejects(()=>refreshed.staffRequest('','accept_access_invitation',{token:'owned-token',review_hash:'a'.repeat(32)},actor),e=>e.status===409);assert.equal(refreshed.calls.length,1);checks++;
 for(const bad of [{...row,shared_sections:[{}]},{...row,review_hash:'bad'},{...row,status:'accepted',accepted_by:other}]){
  const malformed=client(session(actor),undefined,()=>new Response(JSON.stringify({invitation:bad})));
  await assert.rejects(()=>malformed.staffRequest('','accept_access_invitation',{token:'owned-token',review_hash:'a'.repeat(32)},actor),e=>e.status===503&&e.retryable);checks++;
 }
 const switched=client(session(actor),undefined,()=>{switched.switchTo(other);return new Response(JSON.stringify({invitation:{...row,status:'accepted',accepted_by:actor}}));});
 await assert.rejects(()=>switched.staffRequest('','accept_access_invitation',{token:'owned-token',review_hash:'a'.repeat(32)},actor),e=>e.status===409);checks++;
}
{
 const dashboard={actor_id:actor,guardians:[],children:[],preferences:[],notifications:[],has_more:false};
 const c=client(session(actor),undefined,()=>new Response(JSON.stringify(dashboard)));
 await c.staffRequest('','guardian_dashboard',{relationship_id:id(4)},actor);
 assert.equal(JSON.parse(c.calls[0][1].body).action,'guardian_portal_read_command');checks++;
 for(const data of [{...dashboard,actor_id:other},{...dashboard,children:null}]){
  await assert.rejects(()=>client(session(actor),undefined,()=>new Response(JSON.stringify(data))).staffRequest('','guardian_dashboard',{},actor),e=>e.status===503&&e.retryable);checks++;
 }
 const request={actor_id:actor,relationship_id:id(4),requests:[],events:[]};
 const bad=client(session(actor),undefined,()=>new Response(JSON.stringify({...request,relationship_id:id(5)})));
 await assert.rejects(()=>bad.staffRequest('','guardian_service_requests',{relationship_id:id(4)},actor),e=>e.status===503);checks++;
 const switched=client(session(actor),undefined,()=>{switched.switchTo(other);return new Response(JSON.stringify(dashboard));});
 await assert.rejects(()=>switched.staffRequest('','guardian_dashboard',{},actor),e=>e.status===409);checks++;
 const refreshed=client(session(actor),session(other),()=>new Response('{}',{status:401}));
 await assert.rejects(()=>refreshed.staffRequest('','guardian_dashboard',{},actor),e=>e.status===409);assert.equal(refreshed.calls.length,1);checks++;
}

{
 let count=0;const c=client(session(actor),undefined,(_url,request)=>{
  if(count++===0)throw Error('Owned financial response loss');const body=JSON.parse(request.body);return new Response(JSON.stringify({actor_id:actor,request_key:body.idempotency_key,replayed:true,cash_movement:{id:id(7)}}));
 });
 const payload={shift_id:id(4),direction:'outgoing',amount:500,idempotency_key:'owned-frozen-finance'};
 await assert.rejects(()=>c.staffRequest(academy,'record_cash_movement',payload,actor),e=>e.status===503&&e.retryable);
 assert.equal(c.hasPendingFinance(academy,actor),true);checks++;
 await assert.rejects(()=>c.staffRequest(academy,'record_cash_movement',{...payload,amount:700},actor),e=>e.status===409);assert.equal(c.calls.length,1);checks++;
 await assert.rejects(()=>c.staffRequest(academy,'record_cash_movement',{...payload,idempotency_key:'new-random-key'},actor),e=>e.status===409);assert.equal(c.calls.length,1);checks++;
 await c.retryFinanceRequest(academy,actor);assert.deepEqual(JSON.parse(c.calls[1][1].body),JSON.parse(c.calls[0][1].body));assert.equal(c.hasPendingFinance(academy,actor),false);checks++;
}
{
 const c=client(session(actor),undefined,()=>{throw Error('Owned uncertain action');});
 await assert.rejects(()=>c.staffRequest(academy,'open_cashier_shift',{cashbox_id:id(4),opening_balance:100},actor));
 c.switchTo(other);await assert.rejects(()=>c.retryFinanceRequest(academy,actor),e=>e.status===409);assert.equal(c.calls.length,1);checks++;
}
console.log(JSON.stringify({suite:'staff-pinned-account-and-retry-client',checks,productionTouched:false}));

{
 const storage=new Map(),sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 const first=client(session(actor),undefined,()=>{throw Error('Owned lost response');},sessionStorage);
 await assert.rejects(()=>first.staffRequest(academy,'open_cashier_shift',{cashbox_id:id(70),opening_balance:'9007199254740993'},actor));
 const frozen=first.calls[0][1].body;
 const reloaded=client(session(actor),undefined,(_url,request)=>{const body=JSON.parse(request.body);return new Response(JSON.stringify({actor_id:actor,request_key:body.idempotency_key,replayed:true}));},sessionStorage);
 assert.equal(reloaded.hasPendingFinance(academy,actor),true);assert.equal(reloaded.hasPendingFinance(academy,other),false);
 await reloaded.retryFinanceRequest(academy,actor);assert.equal(reloaded.calls[0][1].body,frozen);assert.equal(storage.size,0);checks++;
}
console.log(JSON.stringify({suite:'finance-reload-recovery',checks}));

{
 const storage=new Map(),sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 const branchSlot='schood.branch.v1:'+JSON.stringify([actor,academy]);storage.set(branchSlot,id(80));
 const first=client(session(actor),undefined,()=>{throw Error('Owned lost branch reply');},sessionStorage);
 await assert.rejects(()=>first.staffRequest(academy,'open_cashier_shift',{cashbox_id:id(70),opening_balance:100},actor));
 assert(first.calls[0][0].includes(id(80)));const original=first.calls[0][1].body;assert(!original.includes('_scope_branch_id'));
 storage.set(branchSlot,id(81));
 const reloaded=client(session(actor),undefined,(_url,request)=>{const body=JSON.parse(request.body);return new Response(JSON.stringify({actor_id:actor,request_key:body.idempotency_key,replayed:true}));},sessionStorage);
 await reloaded.retryFinanceRequest(academy,actor);assert(reloaded.calls[0][0].includes(id(80)));assert(!reloaded.calls[0][0].includes(id(81)));assert.equal(reloaded.calls[0][1].body,original);checks++;
}
console.log(JSON.stringify({suite:'finance-original-branch-retry',checks}));
