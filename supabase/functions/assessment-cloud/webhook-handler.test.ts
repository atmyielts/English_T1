import {createWebhookHandler,type ClaimedDelivery,type WebhookRepository} from './webhook-handler.ts';
import {WebhookSecretBox} from './webhook-secrets.ts';
import {verifyWebhook} from '../../../packages/assessment-core/src/webhooks.ts';
const actor='00000000-0000-4000-8000-000000000001',tenant='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
const key=btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
function fixture(){
 const stored:Record<string,unknown>[]=[];let receipt:Record<string,unknown>|null=null,claims:ClaimedDelivery[]=[];
 const repository:WebhookRepository={user:t=>Promise.resolve(t==='valid'?actor:null),
  async command(_a,_t,_k,action,data){stored.push({action,...data});if(!receipt)receipt={id,state:'active',revision:1,secret_check:await digest(String(data.secret_ciphertext))};return receipt;},
  read:()=>Promise.resolve([]),claim:()=>Promise.resolve(claims),report:(...args)=>Promise.resolve({args})};
 return {repository,stored,setClaims:(value:ClaimedDelivery[])=>{claims=value;}};
}
const post=(path:string,body:unknown,headers:Record<string,string>={})=>new Request(`https://test.invalid/assessment-cloud/webhooks/${path}?tenant_id=${tenant}`,{method:'POST',headers:{authorization:'Bearer valid','content-type':'application/json','idempotency-key':'webhook-key-0001',...headers},body:JSON.stringify(body)});
Deno.test('webhook management is off until enabled and configured',async()=>{
 const {repository}=fixture();
 equal((await createWebhookHandler(repository,[],{enabled:false,box:null,dispatchSecret:'d'})(post('commands',{action:'endpoint.create',data:{url:'https://hooks.example.org/a',events:['result.released']}}))).status,503);
});
Deno.test('the signing secret is shown once, stored only as ciphertext, and withheld on a replayed key',async()=>{
 const box=await WebhookSecretBox.create('k1',{k1:key}),{repository,stored}=fixture(),handle=createWebhookHandler(repository,[],{enabled:true,box,dispatchSecret:'d'});
 equal((await handle(post('commands',{action:'endpoint.create',data:{url:'http://hooks.example.org/a',events:['result.released']}}))).status,422);
 const first=await(await handle(post('commands',{action:'endpoint.create',data:{url:'https://hooks.example.org/a',events:['result.released']}}))).json();
 const secret=first.data.signing_secret as string;
 if(!secret?.startsWith('whsec_')||JSON.stringify(stored).includes(secret)||'secret_check' in first.data)throw new Error('Secret handling wrong');
 equal(await box.open(String(stored[0].secret_ciphertext)),secret);
 const replay=await(await handle(post('commands',{action:'endpoint.create',data:{url:'https://hooks.example.org/a',events:['result.released']}}))).json();
 equal(replay.data.signing_secret,undefined);equal(replay.data.signing_secret_unavailable,true);
});
Deno.test('the internal plane needs the dispatch secret and signs thin payloads verifiable with current and previous secrets',async()=>{
 const box=await WebhookSecretBox.create('k2',{k1:key,k2:btoa(String.fromCharCode(...new Uint8Array(32).fill(9)))}),{repository,setClaims}=fixture();
 const current=await box.seal('whsec_current'),previous=await box.seal('whsec_previous');
 setClaims([{delivery_id:id,lease_token:id,attempt:2,url:'https://hooks.example.org/a',secret_ciphertext:current,previous_secret_ciphertext:previous,event:{id,type:'result.released',sequence:7,tenant_id:tenant,occurred_at:'2026-10-22T10:00:00Z',data:{release_id:id}}}]);
 const handle=createWebhookHandler(repository,[],{enabled:true,box,dispatchSecret:'dispatch-secret',now:()=>1_790_000_000_000});
 equal((await handle(post('internal/claim',{limit:10},{'x-assessment-webhook-secret':'wrong'}))).status,403);
 const out=(await(await handle(post('internal/claim',{limit:10},{'x-assessment-webhook-secret':'dispatch-secret'}))).json()).data[0];
 equal(JSON.parse(out.body),{id,type:'result.released',sequence:7,created_at:'2026-10-22T10:00:00Z',tenant_id:tenant,data:{release_id:id}});
 equal(out.headers['Schood-Delivery-Attempt'],'2');
 equal(await verifyWebhook('whsec_current',out.headers['Schood-Signature'],out.body,1_790_000_005),true);
 equal(await verifyWebhook('whsec_previous',out.headers['Schood-Signature'],out.body,1_790_000_005),true);
 if(JSON.stringify(out).includes('v1:k'))throw new Error('Ciphertext sent to the Worker');
 const disabled=createWebhookHandler(repository,[],{enabled:false,box,dispatchSecret:'dispatch-secret'});
 equal((await(await disabled(post('internal/claim',{limit:10},{'x-assessment-webhook-secret':'dispatch-secret'}))).json()).data,[]);
});
