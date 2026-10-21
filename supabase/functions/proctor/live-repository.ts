import {ContractError} from '../../../packages/assessment-core/src/mod.ts';
import type {LiveRepository} from './live-handler.ts';
type Database={rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>};
export function createLiveRepository(user:LiveRepository['user'],database:Database):LiveRepository{
 async function rpc(name:string,args:Record<string,unknown>){const{data,error}=await database.rpc(name,args);if(error){const status=error.code==='42501'?403:error.code==='P0002'?404:error.code==='23505'?409:['22023','22007','22P02','23514','23503'].includes(error.code??'')?422:500;throw new ContractError(status===500?'database_error':error.message,status===500?'Live authority database request failed.':error.message,status);}return data;}
 return{user,read:(actor,tenant,session)=>rpc('proctor_live_read',{p_actor:actor,p_tenant:tenant,p_session:session}),
  command:(actor,tenant,key,action,data)=>rpc('proctor_live_command',{p_actor:actor,p_tenant:tenant,p_key:key,p_action:action,p_data:data}),
  context:(actor,tenant,id,touch)=>rpc('proctor_live_context',{p_actor:actor,p_tenant:tenant,p_id:id,p_touch:touch}),
  report:(tenant,id,action,data)=>rpc('proctor_live_report',{p_tenant:tenant,p_id:id,p_action:action,p_data:data})};
}
