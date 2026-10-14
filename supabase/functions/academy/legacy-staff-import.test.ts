import {assertEquals,assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {legacyStaffCommand,LegacyStaffImportError} from './legacy-staff-import.ts';
const actor='00000000-0000-4000-8000-000000000001',academy='00000000-0000-4000-8000-000000000002',target='00000000-0000-4000-8000-000000000003',job='00000000-0000-4000-8000-000000000004';
const effect={id:target,academy_id:academy,import_job_id:job,import_row_id:target,target_table:'academy_staff'};
const history={import_job_id:target,status:'completed',rollback_status:'available',committed_rows:1,failed_rows:0,pending_rows:0,recovery_pending:1,completed:0,manual_required:0,failed:0};
Deno.test('legacy staff commands pin the verified actor and exact reviewed record',async()=>{
 for(const action of ['commit','recover','finish'] as const){
  let args:Record<string,unknown>|undefined;
  const db={rpc:(name:string,input:Record<string,unknown>)=>{
   assertEquals(name,action==='commit'?'academy_legacy_staff_import_row':action==='recover'?'academy_legacy_staff_import_recover':'academy_legacy_staff_import_finish');args=input;
   return Promise.resolve({data:action==='finish'?history:{effect,committed:true,manual_required:false},error:null});
  }};
  await legacyStaffCommand(db,actor,academy,action,target,{confirm:true,reason:'Owned correction',recovery:true});
  assertEquals(args?.p_actor_id,actor);assertEquals(args?.p_academy_id,academy);
  assertEquals(args?.[action==='commit'?'p_row_id':action==='recover'?'p_effect_id':'p_job_id'],target);
 }
});
Deno.test('malformed legacy staff identifiers cannot reach a privileged RPC',async()=>{
 let calls=0;const db={rpc:()=>{calls++;return Promise.resolve({data:null,error:null});}};
 for(const ids of [['bad',academy,target],[actor,'bad',target],[actor,academy,'bad']])await assertRejects(()=>legacyStaffCommand(db,ids[0],ids[1],'commit',ids[2]),LegacyStaffImportError);
 assertEquals(calls,0);
});
Deno.test('legacy staff database errors are safe and classify retryable outcomes',async()=>{
 for(const [code,status,retryable] of [['42501',403,false],['23505',409,false],['P0002',404,false],['22P02',400,false],['55P03',503,true],['40P01',503,true]] as const){
  try{await legacyStaffCommand({rpc:()=>Promise.resolve({data:null,error:{code}})},actor,academy,'commit',target);throw Error('Expected denial');}
  catch(e){if(!(e instanceof LegacyStaffImportError))throw e;assertEquals(e.status,status);assertEquals(e.retryable,retryable);}
 }
 await assertRejects(()=>legacyStaffCommand({rpc:()=>Promise.reject(Error('PRIVATE TRANSPORT DETAIL'))},actor,academy,'commit',target),LegacyStaffImportError,'Retry the same request.');
});
Deno.test('legacy staff cannot confirm foreign, wrong-row or incomplete evidence',async()=>{
 for(const data of [{},{effect:{...effect,academy_id:actor},committed:true},{effect:{...effect,import_row_id:actor},committed:true},{effect:{...effect,target_table:'academy_contacts'},committed:true}])
  await assertRejects(()=>legacyStaffCommand({rpc:()=>Promise.resolve({data,error:null})},actor,academy,'commit',target),LegacyStaffImportError);
 for(const data of [{...history,import_job_id:job},{...history,pending_rows:-1},{...history,committed_rows:1.5}])
  await assertRejects(()=>legacyStaffCommand({rpc:()=>Promise.resolve({data,error:null})},actor,academy,'finish',target),LegacyStaffImportError);
});
Deno.test('an intentional skipped duplicate is distinct from a committed staff row',async()=>{
 const data={skipped:true,committed:false,replayed:false};
 assertEquals(await legacyStaffCommand({rpc:()=>Promise.resolve({data,error:null})},actor,academy,'commit',target),data);
});
