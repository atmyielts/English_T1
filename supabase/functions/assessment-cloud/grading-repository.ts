import {ContractError} from '../../../packages/assessment-core/src/mod.ts';
import type {GradingRepository} from './grading-handler.ts';
interface AuthPort {auth:{getUser(token:string):PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
interface DatabasePort {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>}
export function createGradingRepository(auth:AuthPort,service:DatabasePort):GradingRepository{
 const rpc=async(name:string,args:Record<string,unknown>)=>{const{data,error}=await service.rpc(name,args);if(error){const status=error.code==='42501'?403:error.code==='P0002'?404:error.code==='23505'?409:['22023','23514','23503'].includes(error.code??'')?422:500;throw new ContractError(status===500?'database_error':error.message,status===500?'Grading database request failed':error.message,status);}return data;};
 return {
  async user(token){const{data,error}=await auth.auth.getUser(token);return error?null:data.user?.id??null;},
  read:(actor,tenant,kind,id,after,limit)=>rpc('assessment_grading_read',{p_actor:actor,p_tenant:tenant,p_kind:kind,p_id:id,p_after:after,p_limit:limit}),
  command:(actor,tenant,key,action,data)=>rpc('assessment_grading_command',{p_actor:actor,p_tenant:tenant,p_key:key,p_action:action,p_data:data}),
  claim:limit=>rpc('assessment_grading_claim',{p_limit:limit}),
  receipt:(tenant,attempt,generation)=>rpc('assessment_grading_receipt',{p_tenant:tenant,p_attempt:attempt,p_generation:generation}),
  bundle:(tenant,attempt,generation,lease)=>rpc('assessment_grading_bundle',{p_tenant:tenant,p_attempt:attempt,p_generation:generation,p_lease_token:lease}),
  commit:(tenant,attempt,generation,lease,report)=>rpc('assessment_grading_commit',{p_tenant:tenant,p_attempt:attempt,p_generation:generation,p_lease_token:lease,p_report:report})
 };
}
