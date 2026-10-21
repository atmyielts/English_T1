import {ContractError} from '../../../packages/assessment-core/src/mod.ts';
import type {RuntimeRepository} from './handler.ts';
export interface RuntimeAuthPort {auth:{getUser(token:string):PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface RuntimeDatabasePort {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>}
/** Production RPC mapping shared by the Edge entry and connected database tests. */
export function createRuntimeRepository(auth:RuntimeAuthPort,service:RuntimeDatabasePort):RuntimeRepository {
 const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await service.rpc(name,args);if(error){const status=error.code==='42501'?403:error.code==='P0002'?404:error.code==='23505'?409:['22023','23514','23503'].includes(error.code??'')?422:500;throw new ContractError(status===500?'database_error':error.message,status===500?'Runtime database request failed':error.message,status);}return data;};
 return {
  async user(token){const {data,error}=await auth.auth.getUser(token);return error?null:data.user?.id??null;},
  snapshot:(tenant,attempt,actor)=>rpc('assessment_runtime_snapshot',{p_tenant:tenant,p_attempt:attempt,p_actor:actor}),
  async command(actor,tenant,key,action,data){
   const result=await rpc('assessment_runtime_command',{p_actor:actor,p_tenant:tenant,p_key:key,p_action:action,p_data:data});
   // The database commits an automatic pause while refusing this NEW command.
   // Throw only after the RPC returned; raising inside SQL would undo the pause.
   // This is never a command receipt and must not be cached/acknowledged by DO.
   if(result&&typeof result==='object'&&'rejected' in result){
    if(result.rejected==='assessment_break_active')throw new ContractError('assessment_break_active','End the approved break before answering or submitting.',422);
    if(result.rejected==='attempt_not_active')throw new ContractError('attempt_not_active','The exam is no longer active. A break cannot resume a proctor pause or a finalized exam.',422);
    if(result.rejected==='capture_continuity_required')throw new ContractError('capture_continuity_required','Required recording was interrupted. Restore recording and ask an institution proctor to resume the exam.',422);
    throw new ContractError('database_error','The exam command was not accepted',500);
   }
   return result;
  },
  expire:(tenant,attempt)=>rpc('assessment_runtime_expire',{p_tenant:tenant,p_attempt:attempt}),
  claim:limit=>rpc('assessment_runtime_schedule_claim',{p_limit:limit}),
  reconcile:(tenant,attempt,revision,token)=>rpc('assessment_runtime_schedule_reconcile',{p_tenant:tenant,p_attempt:attempt,p_revision:revision,p_lease_token:token})
 };
}
