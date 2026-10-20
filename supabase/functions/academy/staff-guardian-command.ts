import {LegacyImportCommandError} from './legacy-import-command.ts';
type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
export const staffGuardianActions=new Set(['create_guardian_relationship','issue_guardian_link','revoke_guardian_relationship','upsert_guardian_preferences','send_guardian_message','queue_guardian_notification']);
export async function staffGuardianCommand(db:Db,academyId:string,actorId:string,command:string,payload:Record<string,unknown>){
 const {action:_,command:__,academy_id:___,idempotency_key:key,...values}=payload;
 let response;
 try{response=await db.rpc('academy_staff_guardian_command',{p_academy_id:academyId,p_actor_id:actorId,p_command:command,p_payload:values,p_request_key:key});}
 catch{throw new LegacyImportCommandError(503,'We could not confirm this parent action. Retry the same request.',true);}
 if(response.error){
  const code=response.error.code??'';
  throw new LegacyImportCommandError(code==='42501'?403:code==='23505'?409:code.startsWith('22')?400:503,
   code==='42501'?'Your current access or parent consent does not allow this action.':code==='23505'?'The parent action changed. Refresh and review it.':code.startsWith('22')?'Review the parent action details.':'We could not confirm this parent action. Retry the same request.',!['42501','23505'].includes(code)&&!code.startsWith('22'));
 }
 const result=response.data as Record<string,unknown>|null;
 if(!result||result.actor_id!==actorId)throw new LegacyImportCommandError(503,'The parent action returned an incomplete result. Retry the same request.',true);
 return result;
}
