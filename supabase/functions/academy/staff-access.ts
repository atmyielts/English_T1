import {normalizeAcademyRole} from './access.ts';
type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const staffAccessActions=new Set(['upsert_staff','remove_staff','upsert_staff_branch_assignment']);
export class StaffAccessError extends Error{constructor(public status:number,message:string,public retryable=false){super(message);this.name='StaffAccessError';}}
export async function readAcademyStaffDirectory(db:Db,actorId:string,academyId:string,input:Record<string,unknown>={}){
 if(!uuid.test(actorId)||!uuid.test(academyId))throw new StaffAccessError(403,'Forbidden');
 const payload:Record<string,unknown>={limit:300};
 if(input.after_source!=null||input.after_id!=null){
  if(!['grant','staff'].includes(String(input.after_source))||typeof input.after_id!=='string'||!uuid.test(input.after_id))throw new StaffAccessError(400,'Choose a valid staff page.');
  payload.after_source=input.after_source;payload.after_id=input.after_id.toLowerCase();
 }
 const {data,error}=await db.rpc('academy_staff_directory',{p_academy_id:academyId.toLowerCase(),p_actor_id:actorId.toLowerCase(),p_payload:payload});
 if(error)throw new StaffAccessError(error.code==='42501'?403:503,error.code==='42501'?'Your current access does not cover staff management.':'The staff directory is temporarily unavailable.');
 if(!object(data)||!Array.isArray(data.staff)||typeof data.has_more!=='boolean'||data.staff.some(row=>!object(row)||row.academy_id!==academyId.toLowerCase()||typeof row.id!=='string'||!uuid.test(row.id)||!['grant','staff'].includes(String(row.source))))throw new StaffAccessError(503,'The staff directory returned an incomplete response.');
 const cursor=data.cursor,last=data.staff.at(-1);
 if(data.has_more?(!object(cursor)||!object(last)||cursor.after_id!==last.id||cursor.after_source!==last.source):cursor!==null)throw new StaffAccessError(503,'The staff directory returned an incomplete response.');
 return data;
}
export async function runAcademyStaffCommand(db:Db,actorId:string,academyId:string,action:string,input:unknown){
 if(!uuid.test(actorId)||!uuid.test(academyId)||!staffAccessActions.has(action))throw new StaffAccessError(403,'Forbidden');
 if(!object(input))throw new StaffAccessError(400,'Choose a valid staff change.');
 const payload:Record<string,unknown>={};
 const fields=action==='upsert_staff'?['id','staff_email','email','name','display_name','staff_role','role','scope_type','scope_ids','classroom_ids','branch_ids','status','is_active','starts_at','expires_at']:
  action==='remove_staff'?['id']:['id','staff_id','branch_id','assignment_role','is_primary','starts_on','ends_on','status'];
 for(const field of fields)if(Object.hasOwn(input,field))payload[field]=input[field];
 for(const field of ['id','staff_id','branch_id'])if(payload[field]!=null){if(typeof payload[field]!=='string'||!uuid.test(payload[field]))throw new StaffAccessError(400,'Choose a valid staff or branch record.');payload[field]=payload[field].toLowerCase();}
 if(action==='upsert_staff'){
  for(const field of ['role','staff_role'])if(payload[field]!=null)payload[field]=normalizeAcademyRole(payload[field]);
  for(const field of ['classroom_ids','branch_ids','scope_ids'])if(Object.hasOwn(payload,field)){
   const value=payload[field];if(!Array.isArray(value)||value.length>500||value.some(id=>typeof id!=='string'||!uuid.test(id)))throw new StaffAccessError(400,'Choose valid access resources.');
   payload[field]=[...new Set(value.map(id=>(id as string).toLowerCase()))].sort();
  }
 }
 const requestKey=input.idempotency_key??null;
 if(requestKey!==null&&(typeof requestKey!=='string'||requestKey.length>160||!/^[A-Za-z0-9_.:-]+$/.test(requestKey)))throw new StaffAccessError(400,'Choose a valid request identity.');
 const {data,error}=await db.rpc('academy_staff_access_command',{p_academy_id:academyId.toLowerCase(),p_actor_id:actorId.toLowerCase(),p_action:action,p_payload:payload,p_request_key:requestKey});
 if(error){
  if(error.code==='42501')throw new StaffAccessError(403,'Your current staff access does not cover these records.');
  if(error.code==='23505')throw new StaffAccessError(409,'This staff change conflicts with an existing account, record or request. Refresh and review it.');
  if(error.code==='P0002')throw new StaffAccessError(404,'The staff record is no longer available.');
  if(error.code?.startsWith('22')||error.code==='P0001'||error.code==='23514')throw new StaffAccessError(400,'Review the staff role, resources, dates and status.');
  throw new StaffAccessError(503,'We could not confirm this staff change. Retry the same request.',true);
 }
 if(!object(data)||typeof data.replayed!=='boolean')throw new StaffAccessError(503,'We could not confirm this staff change. Retry the same request.',true);
 for(const field of ['grant','staff_profile','assignment'])if(data[field]!=null){const row=data[field];if(!object(row)||row.academy_id!==academyId.toLowerCase()||typeof row.id!=='string'||!uuid.test(row.id))throw new StaffAccessError(503,'We could not confirm this staff change. Retry the same request.',true);}
 if(action==='upsert_staff'&&(!object(data.grant)||!object(data.staff_profile)||data.staff_profile.managed_grant_id!==data.grant.id))throw new StaffAccessError(503,'We could not confirm this staff change. Retry the same request.',true);
 if(action==='remove_staff'&&data.ok!==true||action==='upsert_staff_branch_assignment'&&!object(data.assignment))throw new StaffAccessError(503,'We could not confirm this staff change. Retry the same request.',true);
 return data;
}
