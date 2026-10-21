import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../../',import.meta.url)),container=`schood-assessment-stack-${randomUUID().slice(0,8)}`;
const directory=await mkdtemp(path.join(tmpdir(),'schood-assessment-stack-'));
const owner='00000000-0000-4000-8000-000000000003',foreign='00000000-0000-4000-8000-000000000004',tenant='10000000-0000-4000-8000-000000000001',secret='synthetic-stack-secret-00000000000000',origin='https://exam-tests.invalid';
let worker,gradingWorker,loseResponse=false,started=false;
function docker(args,input){const result=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:8*1024*1024,timeout:60000});if(result.status!==0)throw new Error(result.stderr||String(result.error));return result.stdout.trim();}
function sql(query){return docker(['exec','-i',container,'psql','-U','postgres','-At','-v','ON_ERROR_STOP=1'],query);}
// Dollar quoting is safe because the JSON/string literal is checked against the generated delimiter.
function literal(value){const encoded=typeof value==='string'?value:JSON.stringify(value);let delimiter;do{delimiter=`$s_${randomUUID().replaceAll('-','')}$`;}while(encoded.includes(delimiter));return `${delimiter}${encoded}${delimiter}`;}
async function rpc(name,args){
 assert.match(name,/^assessment_(runtime_(snapshot|command|expire|schedule_claim|schedule_reconcile)|grading_(claim|bundle|receipt|commit|read|command))$/);const values=Object.entries(args).map(([key,value])=>{assert.match(key,/^p_[a-z_]+$/);return `${key}=>${value===null?'null':literal(value)}${['p_data','p_report'].includes(key)?'::jsonb':''}`;});
 const query=`set role service_role;select coalesce(public.${name}(${values.join(',')}),'null'::jsonb);`;
 return new Promise((resolve,reject)=>{
  const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{stdio:['pipe','pipe','pipe']});let output='',error='';
  child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>{
   if(code!==0){const match=/ERROR:\s+([A-Z0-9]{5}):\s+([^\r\n]+)/.exec(error);resolve({data:null,error:{code:match?.[1],message:match?.[2]??'Test database RPC failed'}});return;}
   try{resolve({data:JSON.parse(output.trim().split('\n').at(-1)),error:null});}catch(cause){reject(cause);}
  });child.stdin.end(query);
 });
}
try{
 docker(['run','--detach','--rm','--name',container,'--env','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine']);started=true;
 let ready=false;for(let i=0;i<30;i++){if(spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']).status===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,500));}assert.ok(ready,'Test database did not become ready');
 for(const file of ['supabase/tests/assessment-cloud.fixture.sql','supabase/migrations/20261013100000_assessment_cloud_core.sql','supabase/migrations/20261013110000_proctor_control_plane.sql','supabase/migrations/20261013120000_proctor_candidate_delivery.sql','supabase/migrations/20261013130000_assessment_runtime.sql','supabase/migrations/20261013140000_assessment_recovery_schedule.sql','supabase/migrations/20261013150000_assessment_grading.sql','supabase/migrations/20261014090000_assessment_staff.sql','supabase/migrations/20261014100000_assessment_design.sql','supabase/migrations/20261014110000_assessment_artifacts.sql','supabase/tests/assessment-stack.fixture.sql'])sql(await readFile(path.join(root,file),'utf8'));
 const ids=JSON.parse(sql("select jsonb_object_agg(name,id) from stack_test_ids;"));
 const bundle=await build({stdin:{contents:"export {createRuntimeHandler} from './supabase/functions/assessment-runtime/handler.ts';export {createRuntimeRepository} from './supabase/functions/assessment-runtime/repository.ts';export {createGradingHandler} from './supabase/functions/assessment-cloud/grading-handler.ts';export {createGradingRepository} from './supabase/functions/assessment-cloud/grading-repository.ts';",resolveDir:root,loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',target:'es2022'});
 const {createRuntimeHandler,createRuntimeRepository,createGradingHandler,createGradingRepository}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 const auth={auth:{getUser:async token=>({data:{user:token==='synthetic'?{id:owner}:token==='foreign'?{id:foreign}:token==='grading-owner'?{id:'00000000-0000-4000-8000-000000000001'}:null},error:token==='invalid'?new Error('Invalid synthetic identity'):null})}};
 const bridge=createRuntimeHandler(createRuntimeRepository(auth,{rpc}),secret);
 const options={modules:true,scriptPath:fileURLToPath(new URL('../dist/index.js',import.meta.url)),compatibilityDate:'2026-07-30',durableObjects:{ATTEMPTS:{className:'AttemptCoordinator',useSQLite:true}},durableObjectsPersist:directory,queueProducers:{RECOVERY_QUEUE:'stack-recovery'},queueConsumers:{'stack-recovery':{maxBatchSize:25,maxBatchTimeout:0,maxRetries:2,deadLetterQueue:'stack-recovery-dlq'}},bindings:{SUPABASE_URL:'https://canonical-tests.invalid',SUPABASE_ANON_KEY:'synthetic-anon',ASSESSMENT_COORDINATOR_SECRET:secret,ALLOWED_ORIGINS:origin},outboundService:async request=>{
  const url=new URL(request.url);if(url.pathname==='/auth/v1/user'){const result=await auth.auth.getUser((request.headers.get('authorization')??'').replace(/^Bearer /,''));return Response.json(result.data.user??{}, {status:result.data.user?200:401});}
  const cloned=request.clone(),body=await cloned.json();const response=await bridge(request);
  if(loseResponse&&body.action==='response.append'&&response.ok){loseResponse=false;await response.text();throw new Error('Synthetic network loss after real PostgreSQL commit');}return response;
 }};
 worker=new Miniflare(options);
 async function send(attempt,action,data={},key=randomUUID(),bearer='synthetic'){
  const response=await worker.dispatchFetch(`https://coordinator-tests.invalid/attempts/${attempt}/${action?'commands':'state'}?tenant_id=${tenant}`,{method:action?'POST':'GET',headers:{authorization:`Bearer ${bearer}`,origin,...(action?{'Content-Type':'application/json','Idempotency-Key':key}:{})},...(action?{body:JSON.stringify({action,data})}:{})});return {status:response.status,body:await response.json()};
 }
 const acquired=await send(ids.delivery,'lease.acquire',{device_id:owner,token:'a'.repeat(64)});assert.equal(acquired.status,200,JSON.stringify(acquired.body));assert.equal(acquired.body.data.result.epoch,1);
 const lease={device_id:owner,token:'a'.repeat(64),epoch:1},answer={sequence:1,item_version_id:ids.item1,response:'a',lease};
 const conflict=await send(ids.delivery,'lease.acquire',{device_id:foreign,token:'b'.repeat(64)});assert.equal(conflict.status,409);
 const denied=await send(ids.delivery,undefined,{},randomUUID(),'foreign');assert.equal(denied.status,404);
 assert.equal((await send(ids.orphan,'schedule.claim',{limit:100})).status,422);
 assert.equal((await send(ids.orphan,'schedule.reconcile',{revision:1,lease_token:randomUUID()})).status,422);
 loseResponse=true;const lost=await send(ids.delivery,'response.append',answer,'stack-lost-answer');assert.equal(lost.status,502);assert.equal(lost.body.code,'upstream_invalid_json');assert.equal(sql(`select count(*) from assessment_response_journal where attempt_id='${ids.delivery}';`),'1');
 await worker.dispose();worker=new Miniflare(options);
 const recovered=await send(ids.delivery,'response.append',answer,'stack-lost-answer');assert.equal(recovered.status,200,JSON.stringify(recovered.body));assert.equal(recovered.body.data.snapshot.last_sequence,1);assert.equal(sql(`select count(*) from assessment_response_journal where attempt_id='${ids.delivery}';`),'1');
 const changed=await send(ids.delivery,'response.append',{...answer,response:'b'},'stack-lost-answer');assert.equal(changed.status,409);
 const future=await send(ids.delivery,'response.append',{...answer,sequence:2,item_version_id:ids.item2},'stack-future-answer');assert.equal(future.status,422);
 assert.equal((await send(ids.delivery,'section.advance',{lease},'stack-advance-section')).body.data.snapshot.section_index,1);
 assert.equal((await send(ids.delivery,'response.append',{sequence:2,item_version_id:ids.item2,response:'b',lease},'stack-second-answer')).status,200);
 assert.equal((await send(ids.delivery,'attempt.submit',{lease},'stack-submit')).body.data.snapshot.state,'submitted');
 assert.equal(sql(`select count(*) from domain_event_outbox where aggregate_id='${ids.delivery}';`),'1');
 assert.equal((await send(ids.delivery,'response.append',{...answer,sequence:3},'stack-after-final')).status,422);
 // Schedule a genuine native alarm against real canonical deadlines, without changing the manifest.
 sql(`update assessment_attempts set deadline_at=clock_timestamp()+interval '3 seconds',section_deadline_at=clock_timestamp()+interval '2 seconds' where id='${ids.alarm}';`);
 assert.equal((await send(ids.alarm)).status,200);
 let expired=false;for(let i=0;i<40;i++){if(sql(`select state from assessment_attempts where id='${ids.alarm}';`)==='expired'){expired=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(expired,'Native alarm did not finalize the real canonical attempt');
 assert.equal(sql(`select count(*) from domain_event_outbox where aggregate_id='${ids.alarm}';`),'1');
 // No browser/gateway request has ever bound this third attempt. Cron and the real local queue must recover it.
 sql(`update assessment_attempts set deadline_at=clock_timestamp()-interval '1 second',section_deadline_at=clock_timestamp()-interval '1 second' where id='${ids.orphan}';`);
 const entry=await worker.getWorker(),cron=await entry.scheduled({cron:'* * * * *'});assert.equal(cron.outcome,'ok');
 let orphanRecovered=false;for(let i=0;i<40;i++){if(sql(`select state from assessment_attempts where id='${ids.orphan}';`)==='expired'){orphanRecovered=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(orphanRecovered,'Cron/queue did not recover the disconnected canonical attempt');
 assert.equal(sql(`select count(*) from domain_event_outbox where aggregate_id='${ids.orphan}';`),'1');
 const restored=await send(ids.orphan);assert.equal(restored.status,200);assert.equal(restored.body.data.snapshot.state,'expired');
 const staleTicket={schema_version:'assessment.recovery.v1',tenant_id:tenant,attempt_id:ids.orphan,revision:1,lease_token:randomUUID()};
 const replay=await entry.queue('stack-recovery',[{id:'stale-recovery-job',timestamp:new Date(),attempts:1,body:staleTicket},{id:'malformed-recovery-job',timestamp:new Date(),attempts:1,body:{...staleTicket,revision:0}}]);
 assert.deepEqual(replay.explicitAcks,['stale-recovery-job']);assert.equal(replay.retryMessages.length,1);assert.equal(replay.retryMessages[0].msgId,'malformed-recovery-job');
 assert.equal(sql(`select count(*) from assessment_response_journal where attempt_id='${ids.delivery}';`),'2');
 // The same canonical submissions flow through the actual grading handler/scorer and production RPC mapping.
 const gradingSecret='synthetic-grading-worker-secret-000000000',grading=createGradingHandler(createGradingRepository(auth,{rpc}),[origin],gradingSecret);
 async function gradeRequest(path,body,bearer='grading-owner',privateCall=false){const response=await grading(new Request(`https://canonical-tests.invalid/functions/v1/assessment-cloud/grading/${path}?tenant_id=${tenant}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${bearer}`,'Idempotency-Key':randomUUID(),...(privateCall?{'x-assessment-grading-key':gradingSecret}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:response.status,body:await response.json()};}
 const claimed=await gradeRequest('internal',{action:'job.claim',data:{limit:100}},'',true);assert.equal(claimed.status,200);const job=claimed.body.data.find(row=>row.attempt_id===ids.delivery);assert.ok(job);
 const jobRequest={action:'job.process',data:job};const processed=await gradeRequest('internal',jobRequest,'',true);assert.equal(processed.status,200,JSON.stringify(processed.body));
 const runId=processed.body.data.id,replayed=await gradeRequest('internal',jobRequest,'',true);assert.equal(replayed.body.data.id,runId);assert.equal(sql(`select count(*) from assessment_grading_runs where attempt_id='${ids.delivery}';`),'1');
 assert.equal((await gradeRequest('candidate/results',undefined,'synthetic')).body.data.length,0);
 const review=await gradeRequest(`runs/${runId}`);assert.equal(review.status,200);assert.equal(review.body.data.total,2);
 const approved=await gradeRequest('commands',{action:'grade.approve',data:{run_id:runId,review_hash:review.body.data.review_hash,score:999,actor:owner}});assert.equal(approved.status,200,JSON.stringify(approved.body));
 assert.equal((await gradeRequest('commands',{action:'grade.release',data:{run_id:runId}})).status,200);
 const released=await gradeRequest('candidate/results',undefined,'synthetic');assert.equal(released.body.data[0].total,2);assert.equal((await gradeRequest('candidate/results',undefined,'foreign')).body.data.length,0);
 assert.equal(sql(`select count(*) from domain_event_outbox where aggregate_id='${ids.delivery}' and event_type='assessment.result.released';`),'1');
 process.stdout.write('Passed actual grading handler/scorer -> canonical PostgreSQL: protected job claims, deterministic scoring, committed receipt recovery, review-hash human approval, release isolation and no supplied score override.\n');
 // Recover abandoned producer leases and run the actual separate grading Worker and local Queue.
 sql("update assessment_grading_jobs set leased_until=clock_timestamp()-interval '1 second' where state='leased';");
 gradingWorker=new Miniflare({modules:true,modulesRoot:fileURLToPath(new URL('../../assessment-grading',import.meta.url)),scriptPath:fileURLToPath(new URL('../../assessment-grading/dist/index.js',import.meta.url)),compatibilityDate:'2026-07-30',queueProducers:{GRADING_QUEUE:'stack-grading'},queueConsumers:{'stack-grading':{maxBatchSize:25,maxBatchTimeout:0,maxRetries:2,deadLetterQueue:'stack-grading-dlq'}},bindings:{SUPABASE_URL:'https://canonical-tests.invalid',SUPABASE_ANON_KEY:'synthetic-anon',ASSESSMENT_GRADING_SECRET:gradingSecret},outboundService:request=>grading(request)});
 assert.equal((await gradingWorker.dispatchFetch('https://grading-tests.invalid/commands',{method:'POST'})).status,404);
 const gradeCron=await(await gradingWorker.getWorker()).scheduled({cron:'* * * * *'});assert.equal(gradeCron.outcome,'ok');
 let allGraded=false;for(let i=0;i<40;i++){if(sql('select count(*) from assessment_grading_jobs where state<>\'committed\';')==='0'){allGraded=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(allGraded,'Separate grading cron/queue did not drain canonical jobs');
 assert.equal(sql(`select count(*) from assessment_grading_runs where attempt_id in ('${ids.alarm}','${ids.orphan}') and status='ready' and approved_by is null;`),'2');
 process.stdout.write('Passed actual separate grading cron -> Queue -> Edge scorer -> PostgreSQL; no public Worker route, no automatic human approval or result release.\n');
 process.stdout.write('Passed connected real Worker/SQLite -> runtime handler/repository -> PostgreSQL stack: lease fencing, tenant ownership, lost committed reply + restart replay, changed-answer conflict, future-section denial, section advance, finalization, native alarm and cron -> actual local queue -> disconnected attempt recovery with stale/malformed job handling. Auth identity and Supabase transport are synthetic; no hosted proof.\n');
}finally{
 if(gradingWorker)await gradingWorker.dispose();if(worker)await worker.dispose();if(started)spawnSync('docker',['stop',container],{encoding:'utf8',timeout:20000});
 const resolved=path.resolve(directory);if(path.dirname(resolved)!==path.resolve(tmpdir())||!path.basename(resolved).startsWith('schood-assessment-stack-'))throw new Error('Refusing cleanup outside the generated test directory');await rm(resolved,{recursive:true,force:true});
}
