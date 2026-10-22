import {ContractError} from '../../../packages/assessment-core/src/mod.ts';
import type {ClaimedDelivery,WebhookRepository} from './webhook-handler.ts';
interface AuthPort {auth:{getUser(token:string):PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
interface DatabasePort {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>}
/** Production RPC mapping for institution webhooks. */
export function createWebhookRepository(auth:AuthPort,service:DatabasePort):WebhookRepository{
  const rpc=async(name:string,args:Record<string,unknown>)=>{
    const {data,error}=await service.rpc(name,args);
    if(!error)return data;
    const status=error.code==='42501'?403:error.code==='P0002'?404:error.code==='23505'?409:['22023','22P02','23514'].includes(error.code??'')?422:500;
    throw new ContractError(status===500?'database_error':error.message,status===500?'The webhook database request failed.':error.message,status);
  };
  return {
    async user(token){const {data,error}=await auth.auth.getUser(token);return error?null:data.user?.id??null;},
    command:async(actor,tenant,key,action,data)=>await rpc('assessment_webhook_command',{p_actor:actor,p_tenant:tenant,p_key:key,p_action:action,p_data:data}) as Record<string,unknown>,
    read:(actor,tenant,kind,endpoint,before,beforeId,limit)=>rpc('assessment_webhook_read',{p_actor:actor,p_tenant:tenant,p_kind:kind,p_endpoint:endpoint,p_before:before,p_before_id:beforeId,p_limit:limit}),
    claim:async limit=>await rpc('assessment_webhook_claim',{p_limit:limit}) as ClaimedDelivery[],
    report:(delivery,lease,status,error,retry)=>rpc('assessment_webhook_report',{p_delivery:delivery,p_lease:lease,p_status:status,p_error:error,p_retry_seconds:retry}),
  };
}
