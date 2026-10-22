import {ContractError} from '../../../packages/assessment-core/src/mod.ts';
import type {ApiRepository} from './api-handler.ts';
interface AuthPort {auth:{getUser(token:string):PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
interface DatabasePort {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>}
/** Production RPC mapping for the integration API. Token and scope failures are 401/403. */
export function createApiRepository(auth:AuthPort,service:DatabasePort):ApiRepository{
  const rpc=async(name:string,args:Record<string,unknown>)=>{
    const {data,error}=await service.rpc(name,args);
    if(!error)return data;
    const status=error.message==='invalid_token'?401:error.code==='42501'?403:error.code==='P0002'?404:error.code==='23505'?409:['22023','22P02','23514','23503'].includes(error.code??'')?422:500;
    throw new ContractError(status===500?'database_error':error.message,status===500?'The integration database request failed.':error.message,status);
  };
  return {
    async user(token){const {data,error}=await auth.auth.getUser(token);return error?null:data.user?.id??null;},
    clientCommand:async(actor,tenant,key,action,data)=>await rpc('assessment_api_client_command',{p_actor:actor,p_tenant:tenant,p_key:key,p_action:action,p_data:data}) as Record<string,unknown>,
    clientList:(actor,tenant)=>rpc('assessment_api_client_list',{p_actor:actor,p_tenant:tenant}),
    issue:async(client,secretHash,tokenHash)=>await rpc('assessment_api_token_issue',{p_client:client,p_secret_hash:secretHash,p_token_hash:tokenHash}) as {expires_at:string;scopes:string[];tenant_id:string},
    read:async(tokenHash,kind,filter,after,limit)=>await rpc('assessment_api_read',{p_token_hash:tokenHash,p_kind:kind,p_filter:filter,p_after:after,p_limit:limit}) as {data:unknown[];next_after:string|null},
    command:(tokenHash,key,action,data)=>rpc('assessment_api_command',{p_token_hash:tokenHash,p_key:key,p_action:action,p_data:data}),
  };
}
