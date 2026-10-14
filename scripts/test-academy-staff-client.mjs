import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {transformSync} from 'esbuild';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../apps/academy/src/lib/staffRequest.ts',import.meta.url),'utf8');
const compiled=transformSync(source,{loader:'ts',format:'cjs',target:'es2022',define:{'import.meta.env.VITE_SUPABASE_URL':'"https://owned.invalid"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"public-fixture"'}}).code;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),other=id(2),academy=id(3);
const session=who=>({user:{id:who},access_token:'owned.'+Buffer.from(JSON.stringify({sub:who})).toString('base64url')+'.fixture'});
function client(initial,refreshed=initial,respond=()=>new Response('{}')){
 const calls=[],module={exports:{}};let current=initial;
 runInNewContext(compiled,{module,exports:module.exports,crypto:webcrypto,require:()=>({supabase:{auth:{getSession:async()=>({data:{session:current}}),refreshSession:async()=>({data:{session:refreshed}})}}}),
  atob,TextEncoder,AbortController,setTimeout,clearTimeout,fetch:async(...args)=>{calls.push(args);return respond(...args);}});
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
console.log(JSON.stringify({suite:'staff-pinned-account-and-retry-client',checks,productionTouched:false}));
