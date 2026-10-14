type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
type Invitation=Record<string,unknown>&{id:string;academy_id:string;email:string;status:string;delivery_status:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export class StaffInvitationError extends Error{constructor(public status:number,message:string,public retryable=false){super(message);this.name='StaffInvitationError';}}
async function rpc(db:Db,name:string,args:Record<string,unknown>){
 const {data,error}=await db.rpc(name,args);
 if(error){
  if(error.code==='42501')throw new StaffInvitationError(403,'Your current account or access does not cover this invitation.');
  if(error.code==='23505')throw new StaffInvitationError(409,'This invitation conflicts with the current staff identity or access. Refresh and review the staff grant.');
  if(error.code==='P0010')throw new StaffInvitationError(410,'Invitation has expired.');
  if(error.code==='P0002')throw new StaffInvitationError(404,'Invitation or staff grant is no longer available.');
  if(error.code?.startsWith('22'))throw new StaffInvitationError(400,'Review the invitation role, resources and recipient.');
  throw new StaffInvitationError(503,'We could not confirm this invitation request. Retry the same request.',true);
 }
 if(!object(data))throw new StaffInvitationError(503,'We could not confirm this invitation request. Retry the same request.',true);
 return data;
}
function invitation(value:unknown,academyId?:string):Invitation{
 if(!object(value)||typeof value.id!=='string'||!uuid.test(value.id)||typeof value.academy_id!=='string'||!uuid.test(value.academy_id)
  ||(academyId&&value.academy_id!==academyId)||typeof value.email!=='string'||typeof value.status!=='string'||typeof value.delivery_status!=='string'
  ||['token_hash','delivery_attempt_id','delivery_actor_id','delivery_lease_until','metadata'].some(field=>Object.hasOwn(value,field)))
  throw new StaffInvitationError(503,'The invitation service returned an incomplete response. Retry the same request.',true);
 return value as Invitation;
}
export async function invitationTokenHash(raw:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function runStaffInvitation(db:Db,actorId:string,academyId:string,action:string,input:Record<string,unknown>,deliver:(email:string,url:string)=>Promise<boolean>,redirect:(token:string)=>string){
 if(!uuid.test(actorId)||!uuid.test(academyId)||!['create_access_invitation','resend_access_invitation','revoke_access_invitation'].includes(action))throw new StaffInvitationError(403,'Forbidden');
 const key=input.idempotency_key??null;
 if(key!==null&&(typeof key!=='string'||key.length>160||!/^[A-Za-z0-9_.:-]+$/.test(key)))throw new StaffInvitationError(400,'Choose a valid request identity.');
 if(action==='revoke_access_invitation'){
  const id=input.invitation_id??input.id;if(typeof id!=='string'||!uuid.test(id))throw new StaffInvitationError(400,'Choose a valid invitation.');
  const result=await rpc(db,'academy_staff_invitation_revoke',{p_academy_id:academyId,p_actor_id:actorId,p_invitation_id:id,p_request_key:key});
  invitation(result.invitation,academyId);return result;
 }
 const token=input._delivery_token??[...crypto.getRandomValues(new Uint8Array(32))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))throw new StaffInvitationError(400,'Choose a valid invitation delivery identity.');
 const hash=await invitationTokenHash(token),payload:Record<string,unknown>={};
 for(const field of action==='resend_access_invitation'?['invitation_id']:['email','role','display_name','classroom_ids','branch_ids','scope_type','scope_ids'])if(Object.hasOwn(input,field))payload[field]=input[field];
 if(action==='resend_access_invitation'&&payload.invitation_id==null)payload.invitation_id=input.id;
 const prepared=await rpc(db,'academy_staff_invitation_prepare',{p_academy_id:academyId,p_actor_id:actorId,p_action:action,p_payload:payload,p_token_hash:hash,p_request_key:key});
 let current=invitation(prepared.invitation,academyId);
 if(current.status==='expired'||Date.parse(String(current.token_expires_at))<=Date.now())throw new StaffInvitationError(410,'Invitation has expired.');
 if(prepared.deliver!==true)return {...prepared,acceptance_url:null};
 const claim=await rpc(db,'academy_staff_invitation_delivery',{p_academy_id:academyId,p_actor_id:actorId,p_invitation_id:current.id,p_token_hash:hash,p_action:'claim'});
 current=invitation(claim.invitation,academyId);
 if(current.status==='expired'||Date.parse(String(current.token_expires_at))<=Date.now())throw new StaffInvitationError(410,'Invitation has expired.');
 if(claim.claimed!==true)return {invitation:current,replayed:prepared.replayed,acceptance_url:current.status==='pending'?redirect(token):null,retryable:current.status==='pending'&&current.delivery_status!=='sent'};
 if(typeof claim.attempt_id!=='string'||!uuid.test(claim.attempt_id))throw new StaffInvitationError(503,'We could not confirm this delivery attempt. Retry the same request.',true);
 let sent=false;try{sent=await deliver(current.email,redirect(token));}catch{/* provider result is unconfirmed, keep the same acceptance token */}
 const finished=await rpc(db,'academy_staff_invitation_delivery',{p_academy_id:academyId,p_actor_id:actorId,p_invitation_id:current.id,p_token_hash:hash,p_action:'finish',p_attempt_id:claim.attempt_id,p_sent:sent});
 current=invitation(finished.invitation,academyId);
 return {invitation:current,replayed:prepared.replayed,acceptance_url:current.status==='pending'?redirect(token):null,retryable:!sent&&current.status==='pending'};
}
export async function acceptStaffAccess(db:Db,actorId:string,input:{grantId?:string;tokenHash?:string}){
 if(!uuid.test(actorId)||Boolean(input.grantId)===Boolean(input.tokenHash)||(input.grantId&&!uuid.test(input.grantId))||(input.tokenHash&&!/^[0-9a-f]{64}$/.test(input.tokenHash)))throw new StaffInvitationError(400,'Choose a valid staff invitation.');
 const result=await rpc(db,'academy_staff_accept_access',{p_actor_id:actorId,p_grant_id:input.grantId??null,p_token_hash:input.tokenHash??null});
 if(!object(result.grant)||typeof result.grant.id!=='string'||!uuid.test(result.grant.id)||result.grant.user_id!==actorId||result.grant.status!=='active')throw new StaffInvitationError(503,'We could not confirm staff activation. Refresh and try again.',true);
 if(input.tokenHash)invitation(result.invitation,String(result.grant.academy_id));
 return result;
}
export async function readStaffInvitations(db:Db,actorId:string,academyId:string){
 const result=await rpc(db,'academy_staff_invitation_directory',{p_academy_id:academyId,p_actor_id:actorId,p_payload:{limit:500}});
 if(!Array.isArray(result.invitations)||typeof result.has_more!=='boolean')throw new StaffInvitationError(503,'The invitation directory returned an incomplete response.');
 for(const row of result.invitations)invitation(row,academyId);
 return result;
}
