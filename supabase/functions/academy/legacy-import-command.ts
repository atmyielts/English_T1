type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export class LegacyImportCommandError extends Error{constructor(public status:number,message:string,public retryable=false){super(message);this.name='LegacyImportCommandError';}}
export async function legacyImportCommand(db:Db,actorId:string,academyId:string,action:'create'|'stage'|'commit'|'recover',jobId:string|null,payload:Record<string,unknown>){
 if(![actorId,academyId,...(jobId?[jobId]:[])].every(id=>uuid.test(id)))throw new LegacyImportCommandError(400,'Choose a valid import record.');
 let result:Awaited<ReturnType<Db['rpc']>>;
 try{result=await db.rpc('academy_legacy_import_command',{p_academy_id:academyId,p_actor_id:actorId,p_action:action,p_job_id:jobId,p_payload:payload});}
 catch{throw new LegacyImportCommandError(503,'We could not confirm this import. Retry the same request.',true);}
 const {data,error}=result;
 if(error){
  if(error.code==='42501')throw new LegacyImportCommandError(403,'Your current access does not cover this import.');
  if(error.code==='23505')throw new LegacyImportCommandError(409,'The import or its records changed. Refresh and review them.');
  if(error.code==='P0002')throw new LegacyImportCommandError(404,'This import is no longer available.');
  if(error.code?.startsWith('22'))throw new LegacyImportCommandError(400,'Review the import values and confirmation.');
  throw new LegacyImportCommandError(503,'We could not confirm this import. Retry the same request.',true);
 }
 const row=object(data)?data[action==='create'?'import_job':'import_row']:null;
 const valid=object(data)&&(action==='create'||action==='stage'
  ?object(row)&&uuid.test(String(row.id))&&row.academy_id===academyId&&(action==='create'?row.created_by===actorId:row.import_job_id===jobId)
  :data.import_job_id===jobId&&['committed_rows','failed_rows','pending_rows','recovery_pending','completed','manual_required','failed'].every(key=>Number.isSafeInteger(data[key])&&Number(data[key])>=0));
 if(!valid)throw new LegacyImportCommandError(503,'The import returned an incomplete result. Retry the same request.',true);
 return data as Record<string,unknown>;
}
