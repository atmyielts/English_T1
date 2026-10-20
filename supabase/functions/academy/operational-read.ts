import {LegacyImportCommandError} from './legacy-import-command.ts';
type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
export async function runOperationalRead(db:Db,academyId:string,actorId:string,action:string,payload:Record<string,unknown>){
 let reply;try{reply=await db.rpc('academy_operational_read',{p_academy:academyId,p_actor:actorId,p_action:action,p_payload:payload});}
 catch{throw new LegacyImportCommandError(503,'Unable to load this operational workspace. Try again.',true);}
 const {data,error}=reply;
 if(error)throw new LegacyImportCommandError(error.code==='42501'?403:error.code?.startsWith('22')?400:503,error.code==='42501'?'Your current access does not cover this operational workspace.':'Unable to load this operational workspace. Try again.');
 const result=data as Record<string,unknown>|null;
 if(!result||result.actor_id!==actorId||result.schema_version!==1||typeof result.authority_hash!=='string'||!/^[a-f0-9]{64}$/.test(result.authority_hash))throw new LegacyImportCommandError(503,'Unable to confirm current operational access. Try again.');
 return result;
}
