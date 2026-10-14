type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export class LegacyStaffImportError extends Error{constructor(public status:number,message:string,public retryable=false){super(message);this.name='LegacyStaffImportError';}}
export async function legacyStaffCommand(db:Db,actorId:string,academyId:string,action:'commit'|'recover'|'finish',targetId:string,input:{confirm?:boolean;reason?:string;recovery?:boolean}={}){
 if(![actorId,academyId,targetId].every(id=>uuid.test(id)))throw new LegacyStaffImportError(400,'Choose a valid staff import record.');
 const args:Record<string,unknown>={p_academy_id:academyId,p_actor_id:actorId};
 const name=action==='commit'?'academy_legacy_staff_import_row':action==='recover'?'academy_legacy_staff_import_recover':'academy_legacy_staff_import_finish';
 if(action==='commit'){args.p_row_id=targetId;args.p_confirm=input.confirm===true;}
 if(action==='recover'){args.p_effect_id=targetId;args.p_reason=input.reason??'';}
 if(action==='finish'){args.p_job_id=targetId;args.p_recovery=input.recovery===true;args.p_reason=input.reason??null;}
 let result:Awaited<ReturnType<Db['rpc']>>;
 try{result=await db.rpc(name,args);}catch{throw new LegacyStaffImportError(503,'We could not confirm this staff import result. Retry the same request.',true);}
 const {data,error}=result;
 if(error){
  if(error.code==='42501')throw new LegacyStaffImportError(403,'Your current access does not cover this staff import.');
  if(error.code==='23505')throw new LegacyStaffImportError(409,'The staff import or access changed. Refresh and review it.');
  if(error.code==='P0002')throw new LegacyStaffImportError(404,'The staff import record is no longer available.');
  if(error.code?.startsWith('22'))throw new LegacyStaffImportError(400,'Review the staff import data and confirmation.');
  throw new LegacyStaffImportError(503,'We could not confirm this staff import result. Retry the same request.',true);
 }
 const incomplete=()=>{throw new LegacyStaffImportError(503,'The staff import returned an incomplete result. Retry the same request.',true);};
 if(!object(data))return incomplete();
 if(action==='finish'){
  if(data.import_job_id!==targetId||!['ready','committing','failed','completed'].includes(String(data.status))||
   !['available','unavailable','completed','partial','manual_required'].includes(String(data.rollback_status))||
   !['committed_rows','failed_rows','pending_rows','recovery_pending','completed','manual_required','failed'].every(key=>Number.isSafeInteger(data[key])&&Number(data[key])>=0))return incomplete();
 }else if(action==='commit'&&data.skipped===true){
  if(data.committed!==false||data.effect!=null)return incomplete();
 }else{
  if(!object(data.effect)||data.effect.academy_id!==academyId||!uuid.test(String(data.effect.id))||
   !uuid.test(String(data.effect.import_job_id))||data.effect.target_table!=='academy_staff'||
   (action==='commit'?data.committed!==true||data.effect.import_row_id!==targetId:data.effect.id!==targetId||typeof data.manual_required!=='boolean'))return incomplete();
 }
 return data;
}
