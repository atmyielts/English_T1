import {DurableObject} from 'cloudflare:workers';
import {CoordinatorEngine} from './engine.ts';
import {digest,RuntimeError,type Backend,type Binding,type Invocation,type RecoveryResult,type RecoveryTicket} from './protocol.ts';
import {consumeRecovery,dispatchRecovery,recoveryTicket} from './recovery.ts';
import {boundedJson} from './http.ts';
interface Env {ATTEMPTS:DurableObjectNamespace<AttemptCoordinator>;RECOVERY_QUEUE:Queue<RecoveryTicket>;RECOVERY_BATCH_LIMIT?:string;SUPABASE_URL:string;SUPABASE_ANON_KEY:string;ASSESSMENT_COORDINATOR_SECRET:string;ALLOWED_ORIGINS:string}
const uuid=(value:unknown)=>{if(typeof value!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))throw new RuntimeError(422,'invalid_id','Expected a UUID');return value;};
const object=(value:unknown)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new RuntimeError(422,'invalid_body','Expected a JSON object');return value as Record<string,unknown>;};
function configured(env:Env){let target:URL;try{target=new URL(env.SUPABASE_URL);}catch{throw new RuntimeError(503,'service_unconfigured','The coordinator is not configured');}if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash||target.pathname!=='/'||!env.SUPABASE_ANON_KEY||!env.ASSESSMENT_COORDINATOR_SECRET||env.ASSESSMENT_COORDINATOR_SECRET.length<32)throw new RuntimeError(503,'service_unconfigured','The coordinator is not configured');}
async function body(req:Request){
 const reader=req.body?.getReader();if(!reader)return {};
 let bytes=0;const chunks:Uint8Array[]=[];
 for(;;){const{done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>200000){await reader.cancel();throw new RuntimeError(413,'payload_too_large','Request exceeds 200 KB');}chunks.push(value);}
 const payload=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){payload.set(chunk,offset);offset+=chunk.byteLength;}
 try{return object(JSON.parse(new TextDecoder().decode(payload)));}catch(cause){if(cause instanceof RuntimeError)throw cause;throw new RuntimeError(400,'invalid_json','Expected valid JSON');}
}
class Bridge implements Backend {
 constructor(private env:Env){}
 private async call<T=import('./protocol.ts').Result>(binding:Binding,action:string,data:Record<string,unknown>,bearer='',key=''):Promise<T>{
  const {ok,status,payload}=await boundedJson<{data:T;code?:string;error?:string}>(`${this.env.SUPABASE_URL.replace(/\/$/,'')}/functions/v1/assessment-runtime`,{method:'POST',headers:{'Content-Type':'application/json','x-assessment-coordinator-key':this.env.ASSESSMENT_COORDINATOR_SECRET,apikey:this.env.SUPABASE_ANON_KEY,...(bearer?{authorization:bearer}:{}),...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify({tenant_id:binding.tenant,attempt_id:binding.attempt,action,data})});
  if(!ok)throw new RuntimeError(status,payload.code??'canonical_error',payload.error??'The canonical exam service is unavailable');return payload.data;
 }
 invoke(input:Invocation){return this.call(input,input.action,input.data,input.bearer,input.key);}
 expire(binding:Binding){return this.call(binding,'alarm.expire',{});}
 claim(limit:number){return this.call<unknown>({tenant:'',attempt:'',actor:''},'schedule.claim',{limit});}
 recover(ticket:RecoveryTicket){return this.call<RecoveryResult>({tenant:ticket.tenant_id,attempt:ticket.attempt_id,actor:''},'schedule.reconcile',{revision:ticket.revision,lease_token:ticket.lease_token});}
}
export class AttemptCoordinator extends DurableObject<Env>{
 private engine:CoordinatorEngine;
 constructor(ctx:DurableObjectState,env:Env){super(ctx,env);this.engine=new CoordinatorEngine({get:key=>ctx.storage.get(key),put:(key,value)=>ctx.storage.put(key,value),setAlarm:time=>ctx.storage.setAlarm(time),deleteAlarm:()=>ctx.storage.deleteAlarm()},new Bridge(env));}
 async fetch(req:Request){try{const input=await req.json() as Invocation;return Response.json({data:await this.engine.invoke(input)},{headers:{'Cache-Control':'no-store'}});}catch(cause){return failure(cause);}}
 async alarm(){try{await this.engine.alarm();}catch{await this.ctx.storage.setAlarm(Date.now()+30000);throw new Error('Canonical expiry reconciliation failed');}}
 async recover(ticket:RecoveryTicket){await this.engine.recover(recoveryTicket(ticket));}
}
function failure(cause:unknown){const known=cause instanceof RuntimeError;return Response.json({code:known?cause.code:'coordinator_unavailable',error:known?cause.message:'The coordinator could not complete this request'},{status:known?cause.status:503,headers:{'Cache-Control':'no-store'}});}
export default {
 async scheduled(_controller:ScheduledController,env:Env){
  configured(env);if(!env.RECOVERY_QUEUE)throw new RuntimeError(503,'recovery_unconfigured','Recovery queue is not configured');
  const bridge=new Bridge(env),count=await dispatchRecovery(limit=>bridge.claim(limit),env.RECOVERY_QUEUE,Number(env.RECOVERY_BATCH_LIMIT??200));
  console.log({event:'assessment.recovery.dispatch',count});
 },
 async queue(batch:MessageBatch<unknown>,env:Env){
  configured(env);
  await consumeRecovery(batch.messages,async ticket=>{const stub=env.ATTEMPTS.get(env.ATTEMPTS.idFromName(`${ticket.tenant_id}:${ticket.attempt_id}`));await stub.recover(ticket);},(outcome,code)=>console.log({event:'assessment.recovery.consumer',outcome,code}));
 },
 async fetch(req:Request,env:Env){
  const origin=req.headers.get('origin'),allowed=(env.ALLOWED_ORIGINS??'').split(',').map(value=>value.trim()).filter(Boolean);
  const cors:Record<string,string>={'Vary':'Origin','Cache-Control':'no-store'};
  if(origin&&allowed.includes(origin))cors['Access-Control-Allow-Origin']=origin;
  if(origin&&!allowed.includes(origin))return new Response('Origin denied',{status:403,headers:cors});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization,content-type,idempotency-key'}});
  let response:Response;
  try{
   configured(env);const url=new URL(req.url),match=/^\/attempts\/([^/]+)\/(state|commands)$/.exec(url.pathname);
   if(!match)throw new RuntimeError(404,'not_found','Route not found');
   if((match[2]==='state'&&req.method!=='GET')||(match[2]==='commands'&&req.method!=='POST'))throw new RuntimeError(405,'method_not_allowed','Method not allowed');
   const tenant=uuid(url.searchParams.get('tenant_id')),attempt=uuid(match[1]),bearer=req.headers.get('authorization')??'';
   if(!/^Bearer \S+$/.test(bearer))throw new RuntimeError(401,'unauthorized','Sign in to continue');
   const auth=await boundedJson<{id:string}>(`${env.SUPABASE_URL.replace(/\/$/,'')}/auth/v1/user`,{headers:{authorization:bearer,apikey:env.SUPABASE_ANON_KEY}});
   if(!auth.ok)throw new RuntimeError(auth.status>=500||auth.status===429?503:401,'unauthorized','The candidate session could not be verified');
   const actor=uuid(auth.payload.id),payload=match[2]==='commands'?await body(req):{};
   const action=match[2]==='state'?'snapshot':String(payload.action),data=match[2]==='commands'?object(payload.data):{};
   if(!['snapshot','lease.acquire','lease.renew','lease.release','response.append','section.advance','attempt.submit','break.begin','break.end'].includes(action))throw new RuntimeError(422,'unknown_action','Unknown runtime action');
   const key=req.headers.get('idempotency-key')??'';
   if(action!=='snapshot'&&(key.length<8||key.length>200))throw new RuntimeError(422,'invalid_key','Use an idempotency key of 8–200 characters');
   const cleaned={...data};
   if(action==='lease.acquire'){const token=String(data.token);if(!/^[a-f0-9]{64}$/.test(token))throw new RuntimeError(422,'invalid_lease','Use a random 256-bit lease token');cleaned.token_hash=await digest(token);delete cleaned.token;}
   else if(action!=='snapshot'){const lease=object(data.lease),token=String(lease.token);if(!/^[a-f0-9]{64}$/.test(token))throw new RuntimeError(422,'invalid_lease','Use a random 256-bit lease token');cleaned.lease={device_id:uuid(lease.device_id),epoch:lease.epoch,token_hash:await digest(token)};}
   const invocation:Invocation={tenant,attempt,actor,bearer,key,action,data:cleaned};
   const stub=env.ATTEMPTS.get(env.ATTEMPTS.idFromName(`${tenant}:${attempt}`));
   response=await stub.fetch(new Request('https://attempt.internal',{method:'POST',body:JSON.stringify(invocation)}));
  }catch(cause){response=failure(cause);}
  const headers=new Headers(response.headers);for(const[key,value]of Object.entries(cors))headers.set(key,value);
  return new Response(response.body,{status:response.status,headers});
 }
};
