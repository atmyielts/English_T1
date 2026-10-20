import {assertEquals,assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {runLearnerInvitation,inspectLearnerInvitation,acceptLearnerInvitation,readLearnerInvitations,LearnerInvitationError} from './learner-invitations.ts';
import {invitationTokenHash} from './staff-invitations.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),academy=id(2),token='ab'.repeat(32),attempt=id(4),review='c'.repeat(32);
const pending={id:id(3),academy_id:academy,invite_kind:'guardian',email:'owned@example.invalid',status:'pending',delivery_status:'queued',token_expires_at:'2099-01-01T00:00:00Z'};
const redirect=(raw:string)=>'https://owned.invalid/invite?token='+raw;

Deno.test('learner invitation binds the actor and selected relationship before delivery and keeps the retry token',async()=>{
 const calls:Array<{name:string;args:Record<string,unknown>}>=[];let sent=0;
 const db={rpc:(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return Promise.resolve({error:null,data:
  name==='academy_learner_invitation_prepare'?{invitation:pending,deliver:true}:args.p_action==='claim'?{invitation:pending,claimed:true,attempt_id:attempt}:{invitation:{...pending,delivery_status:'failed'}}});}};
 const result=await runLearnerInvitation(db,actor,academy,'create_access_invitation',{invite_kind:'guardian',guardian_relationship_id:id(5),email:pending.email,
  user_id:id(99),actor_id:id(99),metadata:{forged:true},_delivery_token:token,idempotency_key:'owned-parent'},async(email,url)=>{
   assertEquals(calls.length,2);assertEquals(email,pending.email);assertEquals(url,redirect(token));sent++;throw Error('PRIVATE PROVIDER DETAIL');},redirect);
 assertEquals(sent,1);assertEquals(result.retryable,true);assertEquals(result.acceptance_url,redirect(token));
 assertEquals(calls[0].args.p_actor_id,actor);assertEquals(calls[0].args.p_payload,{invite_kind:'guardian',email:pending.email,guardian_relationship_id:id(5)});
 assertEquals(calls[0].args.p_token_hash,await invitationTokenHash(token));assertEquals(JSON.stringify(calls).includes(token),false);
 assertEquals(calls[2].args.p_attempt_id,attempt);assertEquals(calls[2].args.p_sent,false);assertEquals(JSON.stringify(result).includes('PRIVATE'),false);
});
Deno.test('already sent or actively leased learner links do not send duplicate emails',async()=>{
 for(const delivery_status of ['sent','queued']){
  let sent=0;const db={rpc:(name:string)=>Promise.resolve({error:null,data:name==='academy_learner_invitation_prepare'?{invitation:pending,deliver:true,replayed:true}:{invitation:{...pending,delivery_status},claimed:false}})};
  const result=await runLearnerInvitation(db,actor,academy,'resend_access_invitation',{invitation_id:pending.id,_delivery_token:token},async()=>{sent++;return true;},redirect);
  assertEquals(sent,0);assertEquals(result.retryable,delivery_status==='queued');
 }
});
Deno.test('changed recipient details, private response fields and expired claims cannot trigger delivery',async()=>{
 for(const row of [{...pending,academy_id:id(99)},{...pending,token_hash:'private'},{...pending,shared_sections:[{private:true}]}]){
  let sent=0;await assertRejects(()=>runLearnerInvitation({rpc:()=>Promise.resolve({error:null,data:{invitation:row,deliver:true}})},actor,academy,'create_access_invitation',{_delivery_token:token},async()=>{sent++;return true;},redirect));assertEquals(sent,0);
 }
 let sent=0;await assertRejects(()=>runLearnerInvitation({rpc:(name:string)=>Promise.resolve({error:null,data:name==='academy_learner_invitation_prepare'?{invitation:pending,deliver:true}:{invitation:{...pending,token_expires_at:'2000-01-01'},claimed:true,attempt_id:attempt}})},actor,academy,'create_access_invitation',{_delivery_token:token},async()=>{sent++;return true;},redirect),LearnerInvitationError);assertEquals(sent,0);
});
Deno.test('acceptance requires the reviewed details and confirms the same recipient',async()=>{
 let calls=0;const db={rpc:(_name:string,args:Record<string,unknown>)=>{calls++;assertEquals(args.p_actor_id,actor);assertEquals(args.p_review_hash,review);return Promise.resolve({error:null,data:{invitation:{...pending,status:'accepted',accepted_by:actor},access_status:'active'}});}};
 const hash=await invitationTokenHash(token);
 await assertRejects(()=>acceptLearnerInvitation(db,actor,hash,null),LearnerInvitationError);assertEquals(calls,0);
 const accepted=await acceptLearnerInvitation(db,actor,hash,review);assertEquals(accepted.invitation.access_status,'active');
 await assertRejects(()=>acceptLearnerInvitation({rpc:()=>Promise.resolve({error:null,data:{invitation:{...pending,status:'accepted',accepted_by:id(99)},access_status:'active'}})},actor,'a'.repeat(64),review),LearnerInvitationError);
});
Deno.test('directory validates namespace and continuation, and status validates the shared sections',async()=>{
 for(const data of [{contacts:[{id:id(5),academy_id:id(99)}],has_more:false},{contacts:[],has_more:true,cursor:{after_id:'bad'}}]){
  await assertRejects(()=>readLearnerInvitations({rpc:()=>Promise.resolve({data,error:null})},actor,academy,{mode:'contacts'}),LearnerInvitationError);
 }
 await assertRejects(()=>inspectLearnerInvitation({rpc:()=>Promise.resolve({error:null,data:{invitation:{...pending,shared_sections:'Attendance'}}})},actor,'a'.repeat(64)),LearnerInvitationError);
});
Deno.test('database refusals and interruptions give safe actionable errors',async()=>{
 for(const [code,status,retryable] of [['42501',403,false],['23505',409,false],['P0010',410,false],['P0002',404,false],['55P03',503,true]] as const){
  try{await inspectLearnerInvitation({rpc:()=>Promise.resolve({data:null,error:{code}})},actor,'a'.repeat(64));throw Error('Expected refusal');}
  catch(error){if(!(error instanceof LearnerInvitationError))throw error;assertEquals(error.status,status);assertEquals(error.retryable,retryable);}
 }
 await assertRejects(()=>inspectLearnerInvitation({rpc:()=>Promise.reject(Error('PRIVATE transport'))},actor,'a'.repeat(64)),LearnerInvitationError,'Try the same invitation again');
});
