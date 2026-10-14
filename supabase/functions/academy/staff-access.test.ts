import {assertEquals,assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {runAcademyStaffCommand,readAcademyStaffDirectory,StaffAccessError} from './staff-access.ts';
const actor='00000000-0000-4000-8000-000000000001',academy='00000000-0000-4000-8000-000000000002',grant='00000000-0000-4000-8000-000000000003',profile='00000000-0000-4000-8000-000000000004';
Deno.test('staff command pins verified actor, strips forged identity and canonicalizes resources',async()=>{
 let args:Record<string,unknown>|undefined;
 const db={rpc:(name:string,input:Record<string,unknown>)=>{assertEquals(name,'academy_staff_access_command');args=input;return Promise.resolve({data:{replayed:false,grant:{id:grant,academy_id:academy},staff_profile:{id:profile,academy_id:academy,managed_grant_id:grant}},error:null});}};
 await runAcademyStaffCommand(db,actor,academy,'upsert_staff',{actor_id:profile,user_id:profile,academy_id:profile,staff_role:'Teacher',classroom_ids:[grant,grant],idempotency_key:'owned-save'});
 assertEquals(args?.p_actor_id,actor);assertEquals(args?.p_request_key,'owned-save');assertEquals(args?.p_payload,{staff_role:'teacher',classroom_ids:[grant]});
});
Deno.test('malformed resources never reach staff database command',async()=>{
 let calls=0;const db={rpc:()=>{calls++;return Promise.resolve({data:null,error:null});}};
 for(const input of [{classroom_ids:['bad']},{id:'bad'},{idempotency_key:'bad key'},{scope_ids:null}])await assertRejects(()=>runAcademyStaffCommand(db,actor,academy,'upsert_staff',input),StaffAccessError);
 assertEquals(calls,0);
});
Deno.test('staff errors withhold database internals and preserve same-request retry semantics',async()=>{
 for(const [code,status,retryable] of [['42501',403,false],['23505',409,false],['P0002',404,false],['22P02',400,false],['55P03',503,true],['40P01',503,true]] as const){
  const db={rpc:()=>Promise.resolve({data:null,error:{code,message:'PRIVATE DATABASE DETAIL'}})};
  try{await runAcademyStaffCommand(db,actor,academy,'remove_staff',{id:grant});throw Error('Expected denial');}catch(error){if(!(error instanceof StaffAccessError))throw error;assertEquals(error.status,status);assertEquals(error.retryable,retryable);assertEquals(error.message.includes('PRIVATE'),false);}
 }
});
Deno.test('foreign or half-linked staff responses cannot be accepted as confirmed success',async()=>{
 for(const data of [{replayed:false,grant:{id:grant,academy_id:profile},staff_profile:{id:profile,academy_id:academy,managed_grant_id:grant}},{replayed:false,grant:{id:grant,academy_id:academy},staff_profile:{id:profile,academy_id:academy,managed_grant_id:profile}}]){
  await assertRejects(()=>runAcademyStaffCommand({rpc:()=>Promise.resolve({data,error:null})},actor,academy,'upsert_staff',{}),StaffAccessError);
 }
});
Deno.test('staff directory pins actor and validates bounded namespace and cursor',async()=>{
 let args:Record<string,unknown>|undefined;
 const data={staff:[{id:grant,academy_id:academy,source:'grant'}],has_more:true,cursor:{after_id:grant,after_source:'grant'}};
 const db={rpc:(_name:string,input:Record<string,unknown>)=>{args=input;return Promise.resolve({data,error:null});}};
 await readAcademyStaffDirectory(db,actor,academy,{after_id:profile,after_source:'staff',actor_id:profile,limit:9999});
 assertEquals(args,{p_academy_id:academy,p_actor_id:actor,p_payload:{limit:300,after_id:profile,after_source:'staff'}});
 await assertRejects(()=>readAcademyStaffDirectory(db,actor,academy,{after_id:'bad',after_source:'staff'}),StaffAccessError);
 for(const patch of [{staff:[{id:grant,academy_id:profile,source:'grant'}]},{cursor:{after_id:profile,after_source:'grant'}}])
  await assertRejects(()=>readAcademyStaffDirectory({rpc:()=>Promise.resolve({data:{...data,...patch},error:null})},actor,academy),StaffAccessError);
});
