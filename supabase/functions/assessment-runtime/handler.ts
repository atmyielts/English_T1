import { ContractError,hash,object,text,uuid } from '../../../packages/assessment-core/src/mod.ts';
export interface RuntimeRepository {
 user(token:string):Promise<string|null>;
 snapshot(tenant:string,attempt:string,actor:string):Promise<unknown>;
 command(actor:string,tenant:string,key:string,action:string,data:Record<string,unknown>):Promise<unknown>;
 expire(tenant:string,attempt:string):Promise<unknown>;
 claim(limit:number):Promise<unknown>;
 reconcile(tenant:string,attempt:string,revision:number,token:string):Promise<unknown>;
}
function integer(value:unknown,label:string,min=1){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>1000000)throw new ContractError('invalid_number',`${label} must be a valid positive integer`);return value;}
function hex(value:unknown){const raw=text(value,'Lease token hash',64);if(!/^[a-f0-9]{64}$/.test(raw))throw new ContractError('invalid_lease','Use a SHA-256 lease token hash');return raw;}
export function createRuntimeHandler(repository:RuntimeRepository,secret:string){
 if(secret.length<32)throw new Error('Coordinator secret must contain at least 32 characters');
 return async(req:Request):Promise<Response>=>{
  const requestId=crypto.randomUUID(),reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Request-ID':requestId}});
  try{
   if(req.method!=='POST')throw new ContractError('method_not_allowed','Method not allowed',405);
   const supplied=req.headers.get('x-assessment-coordinator-key')??'';
   const a=new TextEncoder().encode(await hash(supplied)),b=new TextEncoder().encode(await hash(secret));let difference=0;
   for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
   if(difference!==0)throw new ContractError('coordinator_required','A trusted coordinator must send this request',403);
   const content=await req.text();if(new TextEncoder().encode(content).length>200000)throw new ContractError('payload_too_large','Request exceeds 200 KB',413);
   let body:Record<string,unknown>;try{body=object(JSON.parse(content));}catch{throw new ContractError('invalid_json','Expected a JSON object',400);}
   const action=text(body.action,'Action',80);
   if(action==='schedule.claim'){const input=object(body.data),limit=integer(input.limit,'Claim limit');if(limit>100)throw new ContractError('invalid_number','Claim limit cannot exceed 100');return reply(200,{data:await repository.claim(limit),request_id:requestId});}
   const tenant=uuid(body.tenant_id),attempt=uuid(body.attempt_id);
   if(action==='schedule.reconcile'){const input=object(body.data);return reply(200,{data:await repository.reconcile(tenant,attempt,integer(input.revision,'Schedule revision'),uuid(input.lease_token)),request_id:requestId});}
   if(action==='alarm.expire')return reply(200,{data:{snapshot:await repository.expire(tenant,attempt)},request_id:requestId});
   const bearer=/^Bearer (\S+)$/.exec(req.headers.get('authorization')??'');const actor=bearer?await repository.user(bearer[1]):null;
   if(!actor)throw new ContractError('unauthorized','Sign in to continue',401);
   if(action==='snapshot')return reply(200,{data:{snapshot:await repository.snapshot(tenant,attempt,actor)},request_id:requestId});
   const key=text(req.headers.get('idempotency-key'),'Idempotency key',200);if(key.length<8)throw new ContractError('invalid_key','Use an idempotency key of at least eight characters');
   const data=object(body.data),input:Record<string,unknown>={attempt_id:attempt};
   if(action==='lease.acquire'){input.device_id=uuid(data.device_id);input.token_hash=hex(data.token_hash);if(data.takeover!==undefined&&typeof data.takeover!=='boolean')throw new ContractError('invalid_takeover','Takeover must be true or false');if(data.takeover===true)input.takeover=true;}
   else{
    const lease=object(data.lease);input.lease={device_id:uuid(lease.device_id),token_hash:hex(lease.token_hash),epoch:integer(lease.epoch,'Lease epoch')};
    if(action==='response.append'){
     if(data.response===undefined||new TextEncoder().encode(JSON.stringify(data.response)).length>100000)throw new ContractError('invalid_response','Response is missing or exceeds 100 KB');
     input.sequence=integer(data.sequence,'Response sequence');input.item_version_id=uuid(data.item_version_id);input.response=data.response;
     input.payload_hash=await hash({item_version_id:input.item_version_id,response:input.response});
    }else if(action==='break.end')input.break_id=uuid(data.break_id);
    else if(!['lease.renew','lease.release','section.advance','attempt.submit','break.begin'].includes(action))throw new ContractError('unknown_action','Unknown runtime action');
   }
   return reply(200,{data:await repository.command(actor,tenant,key,action,input),request_id:requestId});
  }catch(cause){if(cause instanceof ContractError)return reply(cause.status,{code:cause.code,error:cause.message,request_id:requestId});console.error('assessment runtime request failed',{request_id:requestId});return reply(500,{code:'internal_error',error:'The exam coordinator could not complete this request',request_id:requestId});}
 };
}
