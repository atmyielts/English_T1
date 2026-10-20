import {invitationTokenHash,parseAccessInvitation} from './staff-invitations.ts';
type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export class LearnerInvitationError extends Error{
 constructor(public status:number,message:string,public retryable=false){super(message);this.name='LearnerInvitationError';}
}
async function rpc(db:Db,name:string,args:Record<string,unknown>){
 let response:Awaited<ReturnType<Db['rpc']>>;
 try{response=await db.rpc(name,args);}catch{throw new LearnerInvitationError(503,'We could not confirm this invitation. Try the same invitation again.',true);}
 const {data,error}=response;
 if(error){
  if(error.code==='42501')throw new LearnerInvitationError(403,'You do not have permission to use this invitation with your current account.');
  if(error.code==='23505')throw new LearnerInvitationError(409,'The invitation details or linked account changed. Refresh and review the invitation.');
  if(error.code==='P0010')throw new LearnerInvitationError(410,'Invitation has expired. Ask the academy for a new link.');
  if(error.code==='P0002')throw new LearnerInvitationError(404,'Invitation or student record is no longer available.');
  if(error.code?.startsWith('22'))throw new LearnerInvitationError(400,'Check the student, parent and email before continuing.');
  throw new LearnerInvitationError(503,'We could not confirm this invitation. Try the same invitation again.',true);
 }
 if(!object(data))throw new LearnerInvitationError(503,'We could not confirm this invitation. Try the same invitation again.',true);
 return data;
}
function invitation(value:unknown,academyId?:string){
 const row=parseAccessInvitation(value,academyId);
 if(!['student','guardian'].includes(String(row.invite_kind)))throw new LearnerInvitationError(503,'We could not confirm this invitation. Try the same invitation again.',true);
 if(row.review_hash!=null&&(typeof row.review_hash!=='string'||!/^[0-9a-f]{32}$/.test(row.review_hash))
  ||row.student_name!=null&&typeof row.student_name!=='string'||row.classroom_name!=null&&typeof row.classroom_name!=='string'
  ||row.shared_sections!=null&&(!Array.isArray(row.shared_sections)||!row.shared_sections.every(section=>typeof section==='string'&&['Attendance','Grades','Homework','Timetable','Payments','Messages'].includes(section)))
  ||row.access_status!=null&&!['invited','active','trial','paused','pending','stopped'].includes(String(row.access_status)))
  throw new LearnerInvitationError(503,'We could not load the invitation details. Open the link again.',true);
 return row;
}
export async function runLearnerInvitation(db:Db,actorId:string,academyId:string,action:string,input:Record<string,unknown>,deliver:(email:string,url:string)=>Promise<boolean>,redirect:(token:string)=>string){
 if(!uuid.test(actorId)||!uuid.test(academyId)||!['create_access_invitation','resend_access_invitation','revoke_access_invitation'].includes(action))throw new LearnerInvitationError(403,'Forbidden');
 const key=input.idempotency_key??null;
 if(key!==null&&(typeof key!=='string'||key.length>160||!/^[A-Za-z0-9_.:-]+$/.test(key)))throw new LearnerInvitationError(400,'Try this invitation again.');
 if(action==='revoke_access_invitation'){
  const id=input.invitation_id??input.id;
  if(typeof id!=='string'||!uuid.test(id))throw new LearnerInvitationError(400,'Choose a valid invitation.');
  const result=await rpc(db,'academy_learner_invitation_revoke',{p_academy_id:academyId,p_actor_id:actorId,p_invitation_id:id,p_request_key:key});
  invitation(result.invitation,academyId);return result;
 }
 const token=input._delivery_token??[...crypto.getRandomValues(new Uint8Array(32))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))throw new LearnerInvitationError(400,'Try this invitation again.');
 const hash=await invitationTokenHash(token),payload:Record<string,unknown>={};
 for(const field of action==='resend_access_invitation'?['invitation_id']:['invite_kind','email','contact_id','classroom_id','guardian_relationship_id'])if(input[field]!=null&&input[field]!=='')payload[field]=input[field];
 if(action==='resend_access_invitation'&&payload.invitation_id==null)payload.invitation_id=input.id;
 for(const field of ['contact_id','classroom_id','guardian_relationship_id','invitation_id'])if(payload[field]!=null&&(typeof payload[field]!=='string'||!uuid.test(payload[field] as string)))throw new LearnerInvitationError(400,'Choose a valid student, group and parent.');
 const prepared=await rpc(db,'academy_learner_invitation_prepare',{p_academy_id:academyId,p_actor_id:actorId,p_action:action,p_payload:payload,p_token_hash:hash,p_request_key:key});
 let current=invitation(prepared.invitation,academyId);
 if(current.status==='expired'||Date.parse(String(current.token_expires_at))<=Date.now())throw new LearnerInvitationError(410,'Invitation has expired. Ask the academy for a new link.');
 if(prepared.deliver!==true)return {...prepared,acceptance_url:null};
 const claim=await rpc(db,'academy_learner_invitation_delivery',{p_academy_id:academyId,p_actor_id:actorId,p_invitation_id:current.id,p_token_hash:hash,p_action:'claim'});
 current=invitation(claim.invitation,academyId);
 if(current.status==='expired'||Date.parse(String(current.token_expires_at))<=Date.now())throw new LearnerInvitationError(410,'Invitation has expired. Ask the academy for a new link.');
 if(claim.claimed!==true)return {invitation:current,replayed:prepared.replayed,acceptance_url:current.status==='pending'?redirect(token):null,retryable:current.status==='pending'&&current.delivery_status!=='sent'};
 if(typeof claim.attempt_id!=='string'||!uuid.test(claim.attempt_id))throw new LearnerInvitationError(503,'We could not confirm email delivery. Try the same invitation again.',true);
 let sent=false;try{sent=await deliver(current.email,redirect(token));}catch{/* Preserve a valid same-token retry after an unconfirmed provider result. */}
 const finished=await rpc(db,'academy_learner_invitation_delivery',{p_academy_id:academyId,p_actor_id:actorId,p_invitation_id:current.id,p_token_hash:hash,p_action:'finish',p_attempt_id:claim.attempt_id,p_sent:sent});
 current=invitation(finished.invitation,academyId);
 return {invitation:current,replayed:prepared.replayed,acceptance_url:current.status==='pending'?redirect(token):null,retryable:!sent&&current.status==='pending'};
}
export async function inspectLearnerInvitation(db:Db,actorId:string,tokenHash:string){
 if(!uuid.test(actorId)||!/^[0-9a-f]{64}$/.test(tokenHash))throw new LearnerInvitationError(400,'This invitation link is incomplete.');
 const result=await rpc(db,'academy_learner_invitation_status',{p_actor_id:actorId,p_token_hash:tokenHash});
 invitation(result.invitation);return result;
}
export async function acceptLearnerInvitation(db:Db,actorId:string,tokenHash:string,reviewHash:unknown){
 if(!uuid.test(actorId)||!/^[0-9a-f]{64}$/.test(tokenHash)||typeof reviewHash!=='string'||!/^[0-9a-f]{32}$/.test(reviewHash))throw new LearnerInvitationError(409,'Open the invitation again and review its details before accepting.');
 const result=await rpc(db,'academy_learner_accept_invitation',{p_actor_id:actorId,p_token_hash:tokenHash,p_review_hash:reviewHash});
 const row=invitation(result.invitation);
 if(row.status!=='accepted'||row.accepted_by!==actorId||typeof result.access_status!=='string')throw new LearnerInvitationError(503,'We could not confirm your account link. Check the invitation again.',true);
 return {...result,invitation:{...row,access_status:result.access_status}};
}
export async function readLearnerInvitations(db:Db,actorId:string,academyId:string,payload:Record<string,unknown>={}){
 if(!uuid.test(actorId)||!uuid.test(academyId))throw new LearnerInvitationError(403,'Forbidden');
 const mode=String(payload.mode??'invitations');
 if(!['invitations','contacts','classrooms','relationships','guardians'].includes(mode)||payload.after_id!=null&&(typeof payload.after_id!=='string'||!uuid.test(payload.after_id)))throw new LearnerInvitationError(400,'Choose a valid invitation list.');
 const result=await rpc(db,'academy_learner_invitation_directory',{p_academy_id:academyId,p_actor_id:actorId,p_payload:{mode,limit:300,...(payload.after_id?{after_id:payload.after_id}:{})}});
 if(!Array.isArray(result[mode])||typeof result.has_more!=='boolean')throw new LearnerInvitationError(503,'The invitation list did not finish loading. Refresh it.',true);
 for(const row of result[mode] as unknown[]){
  if(mode==='invitations')invitation(row,academyId);
  else if(!object(row)||row.academy_id!==academyId||typeof row.id!=='string'||!uuid.test(row.id))throw new LearnerInvitationError(503,'The invitation list did not finish loading. Refresh it.',true);
 }
 if(result.has_more&&(!object(result.cursor)||typeof result.cursor.after_id!=='string'||!uuid.test(result.cursor.after_id)))throw new LearnerInvitationError(503,'The invitation list did not finish loading. Refresh it.',true);
 return result;
}
