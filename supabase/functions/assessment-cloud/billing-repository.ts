import {ContractError} from '../../../packages/assessment-core/src/mod.ts';
import type {BillingRepository} from './billing-handler.ts';
interface AuthPort {auth:{getUser(token:string):PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
interface DatabasePort {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>}
/** Production RPC mapping for the billing namespace. */
export function createBillingRepository(auth:AuthPort,service:DatabasePort):BillingRepository{
  const rpc=async(name:string,args:Record<string,unknown>)=>{
    const {data,error}=await service.rpc(name,args);
    if(!error)return data;
    const status=error.code==='42501'?403:error.code==='P0002'?404:error.code==='23505'?409:['22023','22P02','23514'].includes(error.code??'')?422:500;
    throw new ContractError(status===500?'database_error':error.message,status===500?'The billing database request failed.':error.message,status);
  };
  return {
    async user(token){const {data,error}=await auth.auth.getUser(token);return error?null:data.user?.id??null;},
    summary:(actor,tenant,before,beforeId,limit)=>rpc('assessment_billing_summary',{p_actor:actor,p_tenant:tenant,p_before:before,p_before_id:beforeId,p_limit:limit}),
    adjust:(actor,tenant,key,data)=>rpc('assessment_usage_adjust',{p_actor:actor,p_tenant:tenant,p_key:key,p_data:data}),
    configure:(actor,key,enforced,reason)=>rpc('assessment_billing_configure',{p_actor:actor,p_key:key,p_enforced:enforced,p_reason:reason}),
  };
}
