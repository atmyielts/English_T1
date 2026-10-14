import {assertEquals,assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {runStaffInvitation,acceptStaffAccess,invitationTokenHash,StaffInvitationError} from './staff-invitations.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),academy=id(2),token='a'.repeat(64),attempt=id(4);
const pending={id:id(3),academy_id:academy,email:'owned@example.invalid',status:'pending',delivery_status:'queued',token_expires_at:'2099-01-01T00:00:00Z'};
const redirect=(raw:string)=>'https://owned.invalid/invite?token='+raw;
Deno.test('staff invitation pins actor and commits preparation before delivery without storing raw tokens',async()=>{
 const calls:Array<{name:string;args:Record<string,unknown>}>=[];let sends=0;
 const db={rpc:(name:string,args:Record<string,unknown>)=>{calls.push({name,args});
  return Promise.resolve({data:name==='academy_staff_invitation_prepare'?{invitation:pending,deliver:true,replayed:false}:
   args.p_action==='claim'?{invitation:pending,claimed:true,attempt_id:attempt}:{invitation:{...pending,delivery_status:'sent'},updated:true},error:null});}};
 const result=await runStaffInvitation(db,actor,academy,'create_access_invitation',{email:pending.email,role:'teacher',classroom_ids:[id(5)],actor_id:id(99),user_id:id(99),metadata:{bad:true},_delivery_token:token,idempotency_key:'owned-save'},async(email,url)=>{
  assertEquals(calls.length,2);assertEquals(email,pending.email);assertEquals(url,redirect(token));sends++;return true;
 },redirect);
 assertEquals(sends,1);assertEquals(result.retryable,false);
 assertEquals(calls[0].args.p_actor_id,actor);assertEquals(calls[0].args.p_payload,{email:pending.email,role:'teacher',classroom_ids:[id(5)]});
 assertEquals(calls[0].args.p_token_hash,await invitationTokenHash(token));assertEquals(JSON.stringify(calls).includes(token),false);
 assertEquals(calls[2].args.p_attempt_id,attempt);assertEquals(calls[2].args.p_sent,true);
});
Deno.test('already-sent or leased invitation replay cannot trigger duplicate email requests',async()=>{
 for(const status of ['sent','queued']){
  let sends=0;
  const db={rpc:(name:string)=>Promise.resolve({data:name==='academy_staff_invitation_prepare'?{invitation:pending,deliver:true,replayed:true}:{invitation:{...pending,delivery_status:status},claimed:false},error:null})};
  const result=await runStaffInvitation(db,actor,academy,'resend_access_invitation',{invitation_id:pending.id,_delivery_token:token,idempotency_key:'same'},async()=>{sends++;return true;},redirect);
  assertEquals(sends,0);assertEquals(result.retryable,status!=='sent');
 }
});
Deno.test('an unconfirmed provider result records failure with the same valid acceptance token',async()=>{
 let finish:Record<string,unknown>|undefined;
 const db={rpc:(name:string,args:Record<string,unknown>)=>{
  if(args.p_action==='finish')finish=args;
  return Promise.resolve({data:name==='academy_staff_invitation_prepare'?{invitation:pending,deliver:true,replayed:false}:
   args.p_action==='claim'?{invitation:pending,claimed:true,attempt_id:attempt}:{invitation:{...pending,delivery_status:'failed'}},error:null});}};
 const result=await runStaffInvitation(db,actor,academy,'create_access_invitation',{email:pending.email,_delivery_token:token},()=>Promise.reject(Error('PRIVATE PROVIDER DETAIL')),redirect);
 assertEquals(finish?.p_sent,false);assertEquals(result.retryable,true);assertEquals(result.acceptance_url,redirect(token));assertEquals(JSON.stringify(result).includes('PRIVATE'),false);
});
Deno.test('database refusal or a foreign/secret-bearing response cannot send invitations',async()=>{
 for(const data of [{invitation:{...pending,academy_id:id(99)},deliver:true},{invitation:{...pending,token_hash:'secret'},deliver:true}]){
  let sends=0;await assertRejects(()=>runStaffInvitation({rpc:()=>Promise.resolve({data,error:null})},actor,academy,'create_access_invitation',{_delivery_token:token},async()=>{sends++;return true;},redirect),StaffInvitationError);
  assertEquals(sends,0);
 }
 for(const [code,status,retryable] of [['42501',403,false],['23505',409,false],['P0010',410,false],['P0002',404,false],['55P03',503,true],['P0001',503,true]] as const){
  try{await runStaffInvitation({rpc:()=>Promise.resolve({data:null,error:{code}})},actor,academy,'create_access_invitation',{_delivery_token:token},async()=>{throw Error('must not deliver');},redirect);throw Error('Expected refusal');}
  catch(error){if(!(error instanceof StaffInvitationError))throw error;assertEquals(error.status,status);assertEquals(error.retryable,retryable);}
 }
});
Deno.test('activation pins the verified recipient and rejects another-account results',async()=>{
 let args:Record<string,unknown>|undefined;
 const db={rpc:(_name:string,input:Record<string,unknown>)=>{args=input;return Promise.resolve({data:{grant:{id:id(5),academy_id:academy,user_id:actor,status:'active'},invitation:{...pending,status:'accepted'},replayed:false},error:null});}};
 await acceptStaffAccess(db,actor,{tokenHash:'b'.repeat(64)});assertEquals(args?.p_actor_id,actor);assertEquals(args?.p_grant_id,null);
 await assertRejects(()=>acceptStaffAccess({rpc:()=>Promise.resolve({data:{grant:{id:id(5),academy_id:academy,user_id:id(99),status:'active'}},error:null})},actor,{grantId:id(5)}),StaffInvitationError);
});
