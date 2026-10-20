import {supabase} from './supabase';

export class StaffRequestError extends Error {
 constructor(message:string,public status:number,public retryable=false){super(message);this.name='StaffRequestError';}
}
const url=String(import.meta.env.VITE_SUPABASE_URL??'').replace(/\/$/,''),anon=String(import.meta.env.VITE_SUPABASE_ANON_KEY??'');
const pending=new Map<string,string>();
const tokens=new Map<string,string>();
const invitationActions=new Set(['create_access_invitation','resend_access_invitation','revoke_access_invitation']);
const guardianActions=new Set(['create_guardian_relationship','issue_guardian_link','revoke_guardian_relationship','upsert_guardian_preferences','send_guardian_message','queue_guardian_notification']);
const importActions=new Set(['create_import_job','add_import_row','commit_import_job','rollback_import_job']);
const linkActions=new Set(['invitation_status','accept_access_invitation']);
const portalReadActions=new Set(['guardian_dashboard','guardian_service_requests']);
async function sessionFor(actor?:string,refresh=false){
 const result=refresh?await supabase.auth.refreshSession():await supabase.auth.getSession();
 const session=result.data.session;
 if(result.error||!session)throw new StaffRequestError('Sign in again to continue.',401);
 let subject:unknown;
 try{subject=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub;}catch{throw new StaffRequestError('Sign in again to continue.',401);}
 if(subject!==session.user.id||(actor&&actor!==session.user.id))throw new StaffRequestError('Your account changed. Reopen this page.',409);
 return session;
}
export async function staffRequest<T>(academyId:string,action:string,payload:Record<string,unknown>,expectedActor?:string):Promise<T>{
 if(expectedActor==='')throw new StaffRequestError('Sign in again to continue.',401);
 const initial=await sessionFor(expectedActor),actor=initial.user.id;
 const identity=JSON.stringify([actor,academyId,action,payload]);
 const requestKey=typeof payload.idempotency_key==='string'?payload.idempotency_key:pending.get(identity)??crypto.randomUUID();
 pending.set(identity,requestKey);
 let deliveryToken:string|undefined;
 if(action==='create_access_invitation'||action==='resend_access_invitation'){
  deliveryToken=tokens.get(identity)??[...crypto.getRandomValues(new Uint8Array(32))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  tokens.set(identity,deliveryToken);
 }
 const body=JSON.stringify({...payload,action:guardianActions.has(action)?'staff_guardian_command':action==='guardian_claim_link'?'guardian_link_command':portalReadActions.has(action)?'guardian_portal_read_command':linkActions.has(action)?'invitation_link_command':importActions.has(action)?'legacy_import_command':invitationActions.has(action)?'access_invitation_command':'staff_access_command',command:action,
  academy_id:academyId,idempotency_key:requestKey,...(deliveryToken?{_delivery_token:deliveryToken}:{})});
 const confirmationError=portalReadActions.has(action)?'We could not load your parent portal. Try again.':linkActions.has(action)?'We could not confirm your account link. Open the invitation again.':'We could not confirm this change. Try the same change again.';
 if(new TextEncoder().encode(body).byteLength>65536)throw new StaffRequestError('There is too much information to save at once. Save fewer changes.',413);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{
  const send=async(refresh=false)=>{
   const session=await sessionFor(actor,refresh);
   return fetch(`${url}/functions/v1/academy`,{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body,signal:controller.signal});
  };
  let response=await send();if(response.status===401)response=await send(true);
  const value=await response.json().catch(()=>null);
  if(!response.ok){
   if(response.status===404&&value?.error==='Not found')throw new StaffRequestError('This service is temporarily unavailable. Try again.',503,true);
   throw new StaffRequestError(typeof value?.error==='string'?value.error:'Your changes could not be saved. Try again.',response.status,value?.retryable===true||response.status>=500);
  }
  if(!value||typeof value!=='object'||Array.isArray(value))throw new StaffRequestError(confirmationError,503,true);
  const row=guardianActions.has(action)?value[action==='create_guardian_relationship'?'relationship':action==='issue_guardian_link'?'link':action==='revoke_guardian_relationship'?'relationship':action==='upsert_guardian_preferences'?'preference':action==='send_guardian_message'?'message':'notification']:action==='guardian_claim_link'?value.guardian:invitationActions.has(action)||linkActions.has(action)?value.invitation:action==='upsert_staff'?value.staff:action==='upsert_staff_branch_assignment'?value.assignment:null;
  const legacyRevoke=action==='revoke_access_invitation'&&row?.academy_id==null&&row?.id===(payload.invitation_id??payload.id);
  const importValid=action==='create_import_job'?value.import_job?.academy_id===academyId&&value.import_job?.created_by===actor&&typeof value.import_job?.id==='string':action==='add_import_row'?value.import_row?.academy_id===academyId&&value.import_row?.import_job_id===payload.import_job_id&&typeof value.import_row?.id==='string':importActions.has(action)&&value.import_job_id===payload.import_job_id&&
   ['committed_rows','failed_rows','pending_rows','recovery_pending','completed','manual_required','failed'].every(key=>Number.isSafeInteger(value[key])&&value[key]>=0);
  const portalValid=portalReadActions.has(action)&&value.actor_id===actor&&(action==='guardian_dashboard'
   ? ['guardians','children','preferences','notifications'].every(key=>Array.isArray(value[key]))&&typeof value.has_more==='boolean'
   : value.relationship_id===payload.relationship_id&&Array.isArray(value.requests)&&Array.isArray(value.events));
  const guardianLinkValid=action==='guardian_claim_link'&&value.actor_id===actor&&row?.status==='verified'&&typeof row.id==='string'
   &&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)&&row.academy_id===value.academy_id&&value.relationship?.guardian_id===row.id&&value.relationship?.academy_id===row.academy_id
   &&value.relationship?.status==='active'&&value.relationship?.consent_status==='granted';
  const linkValid=linkActions.has(action)&&row&&typeof row.academy_id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.academy_id)
   &&['student','staff','guardian'].includes(row.invite_kind)&&['pending','accepted','revoked','expired'].includes(row.status)
   &&(row.review_hash==null||typeof row.review_hash==='string'&&/^[0-9a-f]{32}$/.test(row.review_hash))
   &&(row.student_name==null||typeof row.student_name==='string')&&(row.classroom_name==null||typeof row.classroom_name==='string')
   &&(row.shared_sections==null||Array.isArray(row.shared_sections)&&row.shared_sections.every((section:unknown)=>typeof section==='string'&&['Attendance','Grades','Homework','Timetable','Payments','Messages'].includes(section)))
   &&(row.access_status==null||['invited','active','trial','paused','pending','stopped'].includes(row.access_status))
   &&(action!=='accept_access_invitation'||row.status==='accepted'&&row.accepted_by===actor)
   &&!['token_hash','metadata','delivery_attempt_id','delivery_lease_until','delivery_actor_id'].some(field=>Object.hasOwn(row,field));
  if(guardianActions.has(action)?value.actor_id!==actor||!row||typeof row.id!=='string':action==='guardian_claim_link'?!guardianLinkValid:portalReadActions.has(action)?!portalValid:importActions.has(action)?!importValid:action==='remove_staff'?value.ok!==true:(!row||(!linkActions.has(action)&&row.academy_id!==academyId)||(linkActions.has(action)&&!linkValid)||typeof row.id!=='string'
    ||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id))&&!legacyRevoke)
   throw new StaffRequestError(confirmationError,503,true);
  if(invitationActions.has(action)&&value.retryable===true)throw new StaffRequestError('Invitation is saved, but email delivery is unconfirmed. Retry the same invitation.',202,true);
  await sessionFor(actor); // Do not publish the previous account's result after a switch.
  pending.delete(identity);
  tokens.delete(identity);
  return value as T;
 }catch(error){
  if(error instanceof StaffRequestError){
   if(invitationActions.has(action)&&!error.retryable){pending.delete(identity);tokens.delete(identity);}
   throw error;
  }
  throw new StaffRequestError(confirmationError,503,true);
 }finally{clearTimeout(timer);}
}
