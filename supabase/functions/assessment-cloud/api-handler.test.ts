import {createApiHandler,sha256,type ApiRepository} from './api-handler.ts';
import {ContractError} from '../../../packages/assessment-core/src/mod.ts';
const actor='00000000-0000-4000-8000-000000000001',tenant='00000000-0000-4000-8000-000000000002',client='00000000-0000-4000-8000-000000000003';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
function fixture(){
 const secrets=new Map<string,string>(),tokens=new Set<string>(),calls:unknown[][]=[];let receipt:Record<string,unknown>|null=null;
 const repository:ApiRepository={user:t=>Promise.resolve(t==='staff'?actor:null),
  clientCommand:(_a,_t,_k,action,data)=>{calls.push([action,data]);if(!receipt){receipt={id:client,revision:1,state:'active',secret_check:data.secret_hash};secrets.set(client,String(data.secret_hash));}return Promise.resolve(receipt);},
  clientList:()=>Promise.resolve([]),
  issue:(id,hash,token)=>{if(secrets.get(id)!==hash)return Promise.reject(new ContractError('invalid_client','invalid_client',403));tokens.add(token);return Promise.resolve({expires_at:new Date(Date.now()+900000).toISOString(),scopes:['events:read'],tenant_id:tenant});},
  read:(hash,kind,filter,after,limit)=>{calls.push(['read',kind,filter,after,limit]);if(!tokens.has(hash))return Promise.reject(new ContractError('invalid_token','invalid_token',401));return Promise.resolve({data:[],next_after:null});},
  command:(hash,key,action,data)=>{calls.push(['command',key,action,data]);return tokens.has(hash)?Promise.resolve({id:client}):Promise.reject(new ContractError('invalid_token','invalid_token',401));}};
 return {repository,calls};
}
const staff=(body:unknown,key='client-key-0001')=>new Request(`https://test.invalid/assessment-cloud/api-clients/commands?tenant_id=${tenant}`,{method:'POST',headers:{authorization:'Bearer staff','content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
Deno.test('integration API is off until enabled',async()=>{
 equal((await createApiHandler(fixture().repository,[],{enabled:false})(new Request('https://test.invalid/assessment-cloud/v1/events'))).status,503);
});
Deno.test('client secret is shown once and only its hash is stored; tokens come from client credentials',async()=>{
 const {repository,calls}=fixture(),handle=createApiHandler(repository,[],{enabled:true});
 equal((await handle(staff({action:'client.create',data:{name:'SIS',scopes:['grades:write']}}))).status,422);
 const created=(await(await handle(staff({action:'client.create',data:{name:'SIS',scopes:['events:read']}}))).json()).data;
 const secret=created.client_secret as string;if(!/^sk_[A-Za-z0-9_-]{43}$/.test(secret)||JSON.stringify(calls).includes(secret)||'secret_check' in created)throw new Error('Secret handling wrong');
 equal((calls[0][1] as {secret_hash:string}).secret_hash,await sha256(secret));
 equal((await(await handle(staff({action:'client.create',data:{name:'SIS',scopes:['events:read']}}))).json()).data.client_secret_unavailable,true);
 const token=(body:string,auth?:string)=>handle(new Request('https://test.invalid/assessment-cloud/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...(auth?{authorization:auth}:{})},body}));
 equal((await token(`grant_type=password&client_id=${client}&client_secret=${secret}`)).status,400);
 equal((await token(`grant_type=client_credentials&client_id=${client}&client_secret=sk_${'x'.repeat(43)}`)).status,401);
 const issued=await(await token('grant_type=client_credentials',`Basic ${btoa(`${client}:${secret}`)}`)).json();
 equal([issued.token_type,issued.scope,/^at_[A-Za-z0-9_-]{43}$/.test(issued.access_token),issued.expires_in>800],['Bearer','events:read',true,true]);
 const v1=(path:string,init:RequestInit={})=>handle(new Request(`https://test.invalid/assessment-cloud/v1/${path}`,{...init,headers:{authorization:`Bearer ${issued.access_token}`,'content-type':'application/json',...(init.headers??{})}}));
 equal((await v1('events?after=12&limit=50')).status,200);equal(JSON.stringify(calls.at(-1)),JSON.stringify(['read','events',null,'12',50]));
 equal((await v1('events?after=not-a-number')).status,422);equal((await v1('results?limit=501')).status,422);
 equal((await v1('registrations',{method:'POST',body:JSON.stringify({window_id:client,candidate_id:actor,extra:'x'})})).status,422);
 equal((await v1('registrations',{method:'POST',headers:{'idempotency-key':'sis-0001'},body:JSON.stringify({window_id:client,candidate_id:actor,extra_seconds:999})})).status,201);
 equal(JSON.stringify(calls.at(-1)),JSON.stringify(['command','sis-0001','registration.create',{window_id:client,candidate_id:actor}]));
 equal((await handle(new Request('https://test.invalid/assessment-cloud/v1/events',{headers:{authorization:'Bearer at_'+'z'.repeat(43)}}))).status,401);
 equal((await handle(new Request('https://test.invalid/assessment-cloud/v1/events'))).status,401);
});
