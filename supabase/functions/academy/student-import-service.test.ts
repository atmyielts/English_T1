import {assertEquals,assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {handleStudentImportService,readStudentImportRequest,StudentImportServiceError} from './student-import-service.ts';
const academy='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002',job='00000000-0000-4000-8000-000000000003',branch='00000000-0000-4000-8000-000000000004';
const settings={branch_id:branch,source_filename:'owned.csv',expected_rows:1,column_mapping:{full_name:'Name',phone:'Phone'},balance_convention:'credit_positive',currency:'UZS',date_format:'iso',create_missing_groups:false,duplicate_strategy:'reject'};
Deno.test('student import service uses the Auth actor and a single guarded command without caller capabilities',async()=>{
 const calls:Record<string,unknown>[]=[];
 const db={rpc:(name:string,args:Record<string,unknown>)=>{calls.push({name,...args});return Promise.resolve({data:{job:{id:job,academy_id:academy}},error:null});}};
 await handleStudentImportService(db,'student_import_stage',{academy_id:academy,actor_id:job,can_finance:true,branch_ids:[branch],key:'stable-key',settings,rows:[{Name:'Owned',Phone:'901234567',Salary:'private'}],offset:0,seal:true},actor);
 assertEquals(calls,[{name:'academy_student_import_command',p_academy_id:academy,p_actor_id:actor,p_action:'stage',p_payload:{key:'stable-key',settings,rows:[{row_number:1,source:{Name:'Owned',Phone:'901234567'},mapped:{full_name:'Owned',phone:'901234567'}}],offset:0,seal:true}}]);
});
Deno.test('invalid identities, preview hashes and batch shapes fail before database access',async()=>{
 const db={rpc:()=>{throw Error('Unexpected database access');}};
 for(const body of [{academy_id:academy+'junk',job_id:job},{academy_id:academy,job_id:job,preview_hash:'not-a-hash',key:'k'}])await assertRejects(()=>handleStudentImportService(db,'student_import_commit',body,actor),StudentImportServiceError);
 await assertRejects(()=>handleStudentImportService(db,'student_import_stage',{academy_id:academy,key:'k',settings,rows:[{}],offset:0,seal:'true'},actor),StudentImportServiceError);
 await assertRejects(()=>handleStudentImportService(db,'student_import_rows',{academy_id:academy,job_id:job,offset:0.5},actor),StudentImportServiceError);
});
Deno.test('database permission denial, contention and an unknown outcome retain distinct retry behavior',async()=>{
 for(const [code,status,retryable] of [['42501',403,false],['55P03',503,true],['57014',503,true],['P0001',400,false],['PGRST202',503,true]]){
  const db={rpc:()=>Promise.resolve({data:null,error:{code:String(code),message:'Private provider diagnostic'}})};
  const error=await assertRejects(()=>handleStudentImportService(db,'student_import_job',{academy_id:academy,job_id:job},actor),StudentImportServiceError);
  assertEquals(error.status,status);assertEquals(error.retryable,retryable);assertEquals(error.message.includes('Private provider'),false);
 }
});
Deno.test('mismatched job identities and incomplete responses are never accepted as success',async()=>{
 for(const data of [{job:{id:job,academy_id:branch}},{job:{id:branch,academy_id:academy}},null]){
  await assertRejects(()=>handleStudentImportService({rpc:()=>Promise.resolve({data,error:null})},'student_import_job',{academy_id:academy,job_id:job},actor),StudentImportServiceError);
 }
});
Deno.test('import JSON is bounded while streaming, including a missing content-length header',async()=>{
 const request=(body:BodyInit,headers:Record<string,string>={'Content-Type':'application/json'})=>new Request('https://owned.invalid/?action=student_import_stage',{method:'POST',headers,body});
 assertEquals(await readStudentImportRequest(request(JSON.stringify({academy_id:academy}))),{academy_id:academy});
 await assertRejects(()=>readStudentImportRequest(request('x'.repeat(2*1024*1024+1))),StudentImportServiceError,'too large');
 await assertRejects(()=>readStudentImportRequest(request('{}',{'Content-Type':'multipart/form-data'})),StudentImportServiceError,'JSON');
 await assertRejects(()=>readStudentImportRequest(request('[]')),StudentImportServiceError);
 await assertRejects(()=>readStudentImportRequest(request('{bad')),StudentImportServiceError);
});
