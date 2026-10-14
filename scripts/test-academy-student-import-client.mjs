import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../apps/academy/src/lib/studentImport.ts',import.meta.url),'utf8');
const compiled=transformSync(source,{loader:'ts',format:'cjs',target:'es2022',define:{'import.meta.env.VITE_SUPABASE_URL':'"https://owned.invalid"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"public-fixture"'}}).code;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),other=id(2),academy=id(3);
const session=who=>({user:{id:who},access_token:'owned.'+Buffer.from(JSON.stringify({sub:who})).toString('base64url')+'.fixture'});
function client(initial,refreshed=initial,respond=()=>new Response('{}')){
 const calls=[],module={exports:{}};
 runInNewContext(compiled,{module,exports:module.exports,require:()=>({supabase:{auth:{getSession:async()=>({data:{session:initial}}),refreshSession:async()=>({data:{session:refreshed}})}}}),
  atob,TextEncoder,AbortController,setTimeout,clearTimeout,fetch:async(...args)=>{calls.push(args);return respond(...args);}});
 return {...module.exports,calls};
}
let checks=0;
for(const value of [session(other),{...session(actor),access_token:session(other).access_token}]){
 const c=client(value);await assert.rejects(()=>c.studentImportRequest(academy,actor,'stage',{key:'original',rows:[{Name:'Private fixture'}]}),e=>e.status===409&&!e.retryable);
 assert.equal(c.calls.length,0);checks++;
}
{
 const c=client(session(actor),session(other),()=>new Response('{}',{status:401}));
 await assert.rejects(()=>c.studentImportRequest(academy,actor,'commit',{key:'original'}),e=>e.status===409&&!e.retryable);
 assert.equal(c.calls.length,1);checks++;
}
{
 const c=client(session(actor),undefined,()=>{throw Error('Owned network interruption');});
 await assert.rejects(()=>c.studentImportRequest(academy,actor,'commit',{key:'original'}),e=>e.status===503&&e.retryable);
 const [url,request]=c.calls[0];assert.equal(url,'https://owned.invalid/functions/v1/academy?action=student_import_commit');
 assert.deepEqual(JSON.parse(request.body),{key:'original',action:'student_import_commit',academy_id:academy});checks++;
}
{
 const c=client(session(actor));await assert.rejects(()=>c.studentImportRequest(academy,actor,'stage',{rows:['x'.repeat(2*1024*1024)]}),e=>e.status===413&&!e.retryable);
 assert.equal(c.calls.length,0);checks++;
}
console.log(JSON.stringify({suite:'student-import-pinned-account-client',checks,productionTouched:false}));
