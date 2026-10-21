import {ContractError} from '../../../packages/assessment-core/src/mod.ts';
import type {StaffRepository} from './staff-handler.ts';
type Client={auth:{getUser(token:string):Promise<{data:{user:{id:string}|null};error:unknown}>};rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>};
export function createStaffRepository(auth:Pick<Client,'auth'>,service:Pick<Client,'rpc'>):StaffRepository{
 async function rpc(name:string,args:Record<string,unknown>){const {data,error}=await service.rpc(name,args);if(error){const status=error.code==='42501'?403:error.code==='P0002'?404:error.code==='23505'?409:['22023','22007','23514','23503'].includes(error.code??'')?422:500;throw new ContractError(status===500?'database_error':error.message,status===500?'Staff database request failed':error.message,status);}return data;}
 return {async user(token){const result=await auth.auth.getUser(token);return result.error?null:result.data.user?.id??null;},read:(actor,tenant,kind,id,after,limit)=>rpc('assessment_staff_read',{p_actor:actor,p_tenant:tenant,p_kind:kind,p_id:id,p_after:after,p_limit:limit}),command:(actor,tenant,key,action,data)=>rpc('assessment_staff_command',{p_actor:actor,p_tenant:tenant,p_key:key,p_action:action,p_data:data})};
}
