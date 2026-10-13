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
const code=transformSync('async function dispatch(sb,access,body,actionBody){const academyId=access.tenant_id,userId="owned-actor";'+source.slice(start,end)+'}',{loader:'ts',target:'es2022'}).code;
const dispatch=runInNewContext(code+';dispatch',{...policy,json:(status,body)=>({status,body}),normalizeText:(v,max=300)=>String(v??'').trim().slice(0,max),toIntOrNull:v=>Number.isFinite(Number(v))?Math.floor(Number(v)):null});
const access=(role,status='active')=>({tenant_id:'owned-academy',role,status});let checks=0;
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
const writes=[];const sb={rpc:async(name,args)=>{writes.push({name,args});return {data:{id:'owned-job',import_type:'contacts'}};},from:()=>{throw Error('Creation must not perform a second configuration write');}};
const body={idempotency_key:'owned-key',import_type:'contacts',source_filename:'owned.csv',column_mapping:{first_name:'Name'},import_mode:'dry_run',duplicate_strategy:'skip'};
const result=await dispatch(sb,access('owner'),body,'create_import_job');assert.equal(result.status,200);assert.equal(writes.length,1);assert.equal(writes[0].args.p_payload.import_mode,'dry_run');assert.equal(writes[0].args.p_payload.duplicate_strategy,'skip');checks+=4;
const malicious={rpc:async()=>({data:{id:'wrong-kind',import_type:'staff'}})};
assert.equal((await dispatch(malicious,access('manager'),body,'create_import_job')).status,403);checks++;
const untouched={from:()=>{throw Error('Invalid row ordinals must fail before database access');}};
assert.equal((await dispatch(untouched,access('owner'),{import_job_id:'owned-job',row_number:1.5,mapped_data:{}},'add_import_row')).status,400);checks++;
console.log(JSON.stringify({suite:'actual-legacy-import-handlers',checks,productionTouched:false}));
