import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
import assert from 'node:assert/strict';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),other=id(2),academy=id(3),guardian=id(4),relationship=id(5);
const session=(user=actor,subject=user)=>({user:{id:user},access_token:'owned.'+Buffer.from(JSON.stringify({sub:subject})).toString('base64url')+'.fixture'});
const page={actor_id:actor,guardians:[],children:[],preferences:[],notifications:[],has_more:false};
const claim={actor_id:actor,academy_id:academy,guardian:{id:guardian,academy_id:academy,status:'verified'},relationship:{id:relationship,academy_id:academy,guardian_id:guardian,status:'active',consent_status:'granted'}};
const source=readFileSync('apps/academy/src/lib/parentRequest.ts','utf8').replaceAll('import.meta.env','ownedEnv');
const js=transformSync(source,{loader:'ts',format:'cjs',target:'es2022'}).code;
function client({sessions=[session()],refresh=session(),responses=[page],status=200,networkError=false}={}){
 const calls=[];let reads=0,refreshes=0;
 const auth={getSession:async()=>({data:{session:sessions[Math.min(reads++,sessions.length-1)]}}),refreshSession:async()=>{refreshes++;return {data:{session:refresh}};}};
 const module={exports:{}};
 runInNewContext(js,{module,exports:module.exports,require:name=>{assert.equal(name,'./supabase');return {supabase:{auth}};},ownedEnv:{VITE_SUPABASE_URL:'https://owned.invalid',VITE_SUPABASE_ANON_KEY:'owned-public-key'},TextEncoder,atob,AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{
  calls.push({url,...options});if(networkError)throw Error('Owned transport unavailable');
  const value=responses[Math.min(calls.length-1,responses.length-1)],code=Array.isArray(status)?status[Math.min(calls.length-1,status.length-1)]:status;
  return {status:code,ok:code>=200&&code<300,json:async()=>value};
 }});
 return {send:module.exports.parentRequest,calls,refreshes:()=>refreshes};
}
let checks=0;
async function rejected(options,action='guardian_dashboard',payload={},expected=actor,status=503){
 const c=client(options);await assert.rejects(()=>c.send('',action,payload,expected),e=>e.status===status);checks++;return c;
}
{
 const c=client();await c.send('','guardian_dashboard',{action:'remove_staff',command:'remove_staff'},actor);
 const body=JSON.parse(c.calls[0].body);assert.equal(body.action,'guardian_portal_read_command');assert.equal(body.command,'guardian_dashboard');assert.equal(c.calls.length,1);checks+=3;
}
assert.equal((await rejected({},'guardian_dashboard',{},other,409)).calls.length,0);checks++;
assert.equal((await rejected({sessions:[session(),session(other)]},'guardian_dashboard',{},actor,409)).calls.length,0);checks++;
assert.equal((await rejected({sessions:[session(),session(),session(other)]},'guardian_dashboard',{},actor,409)).calls.length,1);checks++;
assert.equal((await rejected({sessions:[session(actor,other)]},'guardian_dashboard',{},actor,409)).calls.length,0);checks++;
await rejected({responses:[{...page,actor_id:other}]});
await rejected({responses:[{actor_id:actor,relationship_id:id(99),requests:[],events:[]}]},'guardian_service_requests',{relationship_id:relationship});
{
 const c=client({responses:[{error:'Sign in again'},page],status:[401,200]});await c.send('','guardian_dashboard',{},actor);
 assert.equal(c.refreshes(),1);assert.equal(c.calls.length,2);assert.equal(c.calls[0].body,c.calls[1].body);checks+=3;
}
assert.equal((await rejected({responses:[{error:'Sign in again'}],status:401,refresh:session(other)},'guardian_dashboard',{},actor,409)).calls.length,1);checks++;
{
 const c=client({responses:[claim]});await c.send('','guardian_claim_link',{token:'owned-token',confirm_access:true},actor);
 assert.equal(JSON.parse(c.calls[0].body).action,'guardian_link_command');checks++;
}
await rejected({responses:[{...claim,relationship:{...claim.relationship,guardian_id:other}}]},'guardian_claim_link',{token:'owned-token'});
await rejected({responses:[null]});
await rejected({networkError:true});
await rejected({responses:[{error:'Access expired'}],status:403},'guardian_dashboard',{},actor,403);
await rejected({},'remove_staff',{},actor,400);
assert.equal((await rejected({},'guardian_dashboard',{},'',401)).calls.length,0);checks++;
assert.equal((await rejected({},'guardian_dashboard',{oversized:'x'.repeat(70000)},actor,413)).calls.length,0);checks++;
console.log(JSON.stringify({suite:'parent-account-pinned-transport',checks,productionTouched:false}));
