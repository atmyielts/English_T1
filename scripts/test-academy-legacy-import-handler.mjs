import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
const compileModule=(name,dependencies={})=>{
 const module={exports:{}};
 const text=readFileSync(new URL('../supabase/functions/academy/'+name,import.meta.url),'utf8');
 const js=transformSync(text,{loader:'ts',target:'es2022',format:'cjs'}).code;
 runInNewContext(js,{module,exports:module.exports,require:specifier=>{if(!Object.hasOwn(dependencies,specifier))throw Error('Unexpected test module dependency');return dependencies[specifier];}},{timeout:1000});
 return module.exports;
};
const policy=compileModule('legacy-import-policy.ts',{'./access.ts':compileModule('access.ts')});
const source=readFileSync(new URL('../supabase/functions/academy/index.ts',import.meta.url),'utf8');
const start=source.indexOf('      if (actionBody === "create_import_job")'),end=source.indexOf('      if (actionBody === "upsert_academic_calendar")',start);
assert.ok(start>=0&&end>start);
const code=transformSync('async function dispatch(sb,access,body,actionBody){const academyId=access.tenant_id,userId="00000000-0000-4000-8000-000000000001";'+source.slice(start,end)+'}',{loader:'ts',target:'es2022'}).code;
const dispatch=runInNewContext(code+';dispatch',{...policy,...compileModule('legacy-staff-import.ts'),...compileModule('legacy-import-command.ts'),json:(status,body)=>({status,body}),normalizeText:(v,max=300)=>String(v??'').trim().slice(0,max),toIntOrNull:v=>Number.isFinite(Number(v))?Math.floor(Number(v)):null});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const access=(role,status='active')=>({tenant_id:id(2),role,status});let checks=0;
for(const kind of ['staff','balances'])for(const action of ['create_import_job','add_import_row','commit_import_job','rollback_import_job']){
 const writes=[],reads=[];const job={id:'owned-job',import_type:kind,status:action==='rollback_import_job'?'completed':'ready',rollback_status:'available',duplicate_strategy:'reject',import_mode:'dry_run'};
 const chain={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:job}),update(...args){writes.push(args);return this;},insert(...args){writes.push(args);return this;}};
 const sb={from:table=>{reads.push(table);return chain;},rpc:async(...args)=>{writes.push(args);return {data:job};}};
 const body={idempotency_key:'owned-key',import_type:kind,source_filename:'owned.csv',import_job_id:job.id,row_number:1,mapped_data:{role:'admin',amount:'1000'},confirm_commit:true,reason:'Owned correction'};
 const result=await dispatch(sb,access('manager'),body,action);assert.equal(result.status,403);assert.equal(writes.length,0);checks+=2;
 if(action!=='create_import_job')assert.deepEqual(reads,['academy_import_jobs']);
}
// The real handler sends all immutable settings in one creation command;
// replay does not reconfigure a pre-existing job in a second write.
const writes=[];const sb={rpc:async(name,args)=>{writes.push({name,args});return {data:{import_job:{id:id(3),academy_id:id(2),created_by:id(1),import_type:'contacts'}}};},from:()=>{throw Error('Creation must not perform a second configuration write');}};
const body={idempotency_key:'owned-key',import_type:'contacts',source_filename:'owned.csv',column_mapping:{first_name:'Name'},import_mode:'dry_run',duplicate_strategy:'skip'};
const result=await dispatch(sb,access('owner'),body,'create_import_job');assert.equal(result.status,200);assert.equal(writes.length,1);assert.equal(writes[0].args.p_payload.import_mode,'dry_run');assert.equal(writes[0].args.p_payload.duplicate_strategy,'skip');checks+=4;
const malicious={rpc:async()=>({data:{id:'wrong-kind',import_type:'staff'}})};
await assert.rejects(()=>dispatch(malicious,access('manager'),body,'create_import_job'),/incomplete result/);checks++;
const untouched={from:()=>{throw Error('Invalid row ordinals must fail before database access');}};
assert.equal((await dispatch(untouched,access('owner'),{import_job_id:'owned-job',row_number:1.5,mapped_data:{}},'add_import_row')).status,400);checks++;
for(const action of ['commit_import_job','rollback_import_job']){
 const academy=id(2),jobId=id(3),rowId=id(4),effectId=id(5),calls=[],limits=[];
 const job={id:jobId,import_type:'staff',status:action==='commit_import_job'?'committing':'completed',rollback_status:'available',import_mode:'commit',duplicate_strategy:'reject'};
 const effect={id:effectId,academy_id:academy,import_job_id:jobId,import_row_id:rowId,target_table:'academy_staff'};
 const rows=action==='commit_import_job'?[{id:rowId,mapped_data:{email:'owned@example.invalid',role:'teacher'},validation_status:'valid'}]:[effect];
 const sb={from:table=>{
  const chain={select(){return this;},eq(){return this;},in(){return this;},order(){return this;},limit(n){limits.push(n);return this;},maybeSingle:async()=>({data:job}),
   then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve);},update(){throw Error('Staff history must not be changed outside its atomic command');},insert(){throw Error('Staff source/effects must not be separately written');},delete(){throw Error('Staff recovery must retain both records');}};
  assert.ok(['academy_import_jobs','academy_import_rows','academy_import_effects'].includes(table));return chain;
 },rpc:async(name,args)=>{
  calls.push({name,args});assert.equal(args.p_actor_id,id(1));assert.equal(args.p_academy_id,academy);
  return {error:null,data:name.endsWith('_finish')?{import_job_id:jobId,status:'committing',rollback_status:action==='commit_import_job'?'available':'partial',committed_rows:25,failed_rows:0,pending_rows:1,recovery_pending:1,completed:0,manual_required:0,failed:0}:{effect,committed:true,manual_required:false}};
 }};
 const result=await dispatch(sb,{...access('owner'),tenant_id:academy},{action:'staff_import_command',import_job_id:jobId,confirm_commit:true,reason:'Owned correction'},action);
 assert.equal(result.status,action==='commit_import_job'?207:200);assert.equal(calls.length,2);assert.deepEqual(limits,[25]);checks+=4;
}
for(const kind of ['contacts','leads','guardians','classrooms','balances','enrollments','attendance'])for(const action of ['add_import_row','commit_import_job','rollback_import_job']){
 const calls=[],jobId=id(3),job={id:jobId,import_type:kind,status:'ready'};
 const db={from:table=>{assert.equal(table,'academy_import_jobs');return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:job})};},rpc:async(name,args)=>{
  calls.push({name,args});return {data:action==='add_import_row'?{import_row:{id:id(4),academy_id:id(2),import_job_id:jobId}}:{import_job_id:jobId,committed_rows:1,failed_rows:0,pending_rows:0,recovery_pending:0,completed:0,manual_required:0,failed:0}};
 }};
 const result=await dispatch(db,access('owner'),{import_job_id:jobId,row_number:1,mapped_data:{amount:'1000'},reason:'Owned correction'},action);
 assert.equal(result.status,200);assert.equal(calls.length,1);assert.equal(calls[0].name,'academy_legacy_import_command');assert.equal(calls[0].args.p_actor_id,id(1));checks+=4;
}
console.log(JSON.stringify({suite:'actual-legacy-import-handlers',checks,productionTouched:false}));
