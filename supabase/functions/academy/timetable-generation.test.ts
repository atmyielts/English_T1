import {assertEquals,assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {generateAcademyTimetable,publicTimetableRun,TimetableGenerationError} from './timetable-generation.ts';
const academy='00000000-0000-4000-8000-000000000001',term='00000000-0000-4000-8000-000000000002',branch='00000000-0000-4000-8000-000000000003';
const access={tenant_id:academy,role:'owner',status:'active'};
const fake=()=>{
  const calls:Array<Record<string,unknown>>=[];
  return {calls,db:{rpc:(_name:string,args:Record<string,unknown>)=>{calls.push(args);return Promise.resolve({data:{run:{academy_id:academy,term_id:args.p_term_id,dry_run:args.p_dry_run,status:args.p_dry_run?'preview_ready':'completed'}},error:null});}}};
};
Deno.test('generation uses one atomic command and forwards server scope rather than browser scope',async()=>{
  const f=fake();await generateAcademyTimetable(f.db,{...access,role:'branch_manager',branch_ids:[branch]},'actor',{term_id:term,dry_run:false,idempotency_key:'retry',p_branch_ids:null});
  assertEquals(f.calls,[{p_academy_id:academy,p_term_id:term,p_actor_id:'actor',p_dry_run:false,p_key:'retry',p_branch_ids:[branch],p_classroom_ids:null}]);
});
Deno.test('reception and teacher cannot generate; empty branch scopes never reach SQL',async()=>{
  for(const role of ['receptionist','teacher','assistant','student','cashier','branch_manager']){
    const f=fake();await assertRejects(()=>generateAcademyTimetable(f.db,{...access,role,branch_ids:[]},'actor',{term_id:term}),TimetableGenerationError,'Forbidden');assertEquals(f.calls.length,0);
  }
});
Deno.test('generation preserves a legacy preview default and validates complete inputs',async()=>{
  const f=fake();await generateAcademyTimetable(f.db,access,'actor',{term_id:term});assertEquals(f.calls[0].p_dry_run,true);assertEquals(f.calls[0].p_key,null);
  for(const patch of [{term_id:term+'junk'},{dry_run:'false'},{idempotency_key:''},{idempotency_key:'x'.repeat(181)}]){
    const rejected=fake();await assertRejects(()=>generateAcademyTimetable(rejected.db,access,'actor',{term_id:term,...patch}),TimetableGenerationError);assertEquals(rejected.calls.length,0);
  }
});
Deno.test('failed commits surface the durable failed run, not a successful half-complete response',async()=>{
  const run={academy_id:academy,term_id:term,dry_run:false,status:'failed',generated_count:0,error:'Room conflict'};
  const db={rpc:()=>Promise.resolve({data:{run},error:null})};
  const error=await assertRejects(()=>generateAcademyTimetable(db,access,'actor',{term_id:term,dry_run:false}),TimetableGenerationError,'Room conflict');assertEquals(error.run,run);
});
Deno.test('generation normalizes term identity and rejects a preview response presented as a committed result',async()=>{
  const alphaTerm='00000000-0000-4000-8000-abcdefabcdef';
  const f=fake();await generateAcademyTimetable(f.db,access,'actor',{term_id:alphaTerm.toUpperCase()});assertEquals(f.calls[0].p_term_id,alphaTerm);
  const db={rpc:()=>Promise.resolve({data:{run:{academy_id:academy,term_id:term,dry_run:true,status:'preview_ready'}},error:null})};
  await assertRejects(()=>generateAcademyTimetable(db,access,'actor',{term_id:term,dry_run:false}),TimetableGenerationError,'incomplete response');
});
Deno.test('provider internals are hidden and an unknown outcome keeps retryable status',async()=>{
  const sqlError='duplicate key value violates unique constraint "private_owned_value" CONTEXT: SQL statement INSERT INTO secret_schema';
  const db={rpc:()=>Promise.resolve({data:null,error:{message:sqlError}})};
  const error=await assertRejects(()=>generateAcademyTimetable(db,access,'actor',{term_id:term}),TimetableGenerationError);
  assertEquals(error.status,503);assertEquals(error.message,'The timetable could not be created. Refresh the preview and try again.');
  const run={academy_id:academy,term_id:term,dry_run:false,status:'failed',generated_count:0,error:sqlError};
  const failed=await assertRejects(()=>generateAcademyTimetable({rpc:()=>Promise.resolve({data:{run},error:null})},access,'actor',{term_id:term,dry_run:false}),TimetableGenerationError);
  assertEquals(failed.status,409);assertEquals(failed.run?.error,error.message);
  assertEquals<unknown>(publicTimetableRun({status:'preview_ready',error:null,evidence:{conflicts:[{series_id:term,reason:sqlError},{reason:'Teacher is unavailable for this session'}]}}),
    {status:'preview_ready',error:null,evidence:{conflicts:[{series_id:term,reason:error.message},{reason:'Teacher is unavailable for this session'}]}});
});
