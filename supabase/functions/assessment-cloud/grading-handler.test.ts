import {createGradingHandler,type GradingRepository} from './grading-handler.ts';
const actor='00000000-0000-4000-8000-000000000001',tenant='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001',secret='synthetic-grading-worker-secret-00000000';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
let calls:unknown[]=[];
const repository:GradingRepository={user:token=>Promise.resolve(token==='valid'?actor:null),read:(who,scope,kind,record,after,limit)=>{calls.push({who,scope,kind,record,after,limit});return Promise.resolve([]);},command:(who,scope,key,action,data)=>{calls.push({who,scope,key,action,data});return Promise.resolve({id});},claim:()=>Promise.resolve([]),bundle:()=>Promise.resolve({input_hash:'a'.repeat(64),items:[{item_version_id:id,item:{schema_version:'assessment.item.v1',type:'single_choice',prompt:'2 + 2?',locale:'en',max_score:1,tags:[],options:[{id:'a',text:'4'},{id:'b',text:'5'}]},key:{correct:'a'},response:'a'}]}),receipt:()=>Promise.resolve(null),commit:(_tenant,_attempt,_generation,_lease,report)=>{calls.push(report);return Promise.resolve({id,generation:1});}};
const req=(path:string,body?:unknown,headers:Record<string,string>={})=>new Request(`https://test.invalid/assessment-cloud/grading/${path}?tenant_id=${tenant}`,{method:body?'POST':'GET',headers:{authorization:'Bearer valid','Idempotency-Key':'grading-command-001',...headers},...(body?{body:JSON.stringify(body)}:{})});
Deno.test('grading reads require identity, exact origin and bounded pagination',async()=>{
 calls=[];const handle=createGradingHandler(repository,['https://assessment.schood.online'],secret);
 equal((await handle(req('worklist',undefined,{authorization:'Bearer invalid'}))).status,401);equal((await handle(req('worklist',undefined,{origin:'https://foreign.invalid'}))).status,403);
 equal((await handle(new Request(`https://test.invalid/assessment-cloud/grading/worklist?tenant_id=${tenant}&limit=101`,{headers:{authorization:'Bearer valid'}}))).status,422);equal(calls.length,0);
 equal((await handle(req('candidate/results'))).status,200);equal((calls[0] as {who:string}).who,actor);
});
Deno.test('human mark command strips forged authority, automatic approval and supplied total',async()=>{
 calls=[];const response=await createGradingHandler(repository,[],secret)(req('commands',{action:'mark.submit',data:{task_id:id,criteria:{accuracy:6},rationale:' Reviewed response ',actor:'forged',tenant_id:'forged',total:999,status:'approved',source:'ai'}}));
 equal(response.status,200);equal(calls[0],{who:actor,scope:tenant,key:'grading-command-001',action:'mark.submit',data:{task_id:id,criteria:{accuracy:6},rationale:'Reviewed response'}});
});
Deno.test('worker processing cannot be invoked by candidate credentials and reconstructs objective report server-side',async()=>{
 const handle=createGradingHandler(repository,[],secret),job={action:'job.process',data:{tenant_id:tenant,attempt_id:id,generation:1,lease_token:actor,report:{scores:999}}};calls=[];
 equal((await handle(req('internal',job))).status,403);equal(calls.length,0);
 const response=await handle(req('internal',job,{'x-assessment-grading-key':secret,authorization:''}));equal(response.status,200);
 equal(calls[0],{scorer_version:'assessment.scorer.v1',input_hash:'a'.repeat(64),scores:[{item_version_id:id,score:1,max_score:1,status:'scored'}]});
 const body=await response.json();equal(body.data,{id,generation:1});equal(JSON.stringify(body).includes('correct'),false);
});
Deno.test('processed job receipt recovers without re-reading private keys or recalculating grades',async()=>{
 const handle=createGradingHandler({...repository,receipt:()=>Promise.resolve({id,generation:1}),bundle:()=>{throw new Error('Must not rescore committed generation');}},[],secret);
 equal((await handle(req('internal',{action:'job.process',data:{tenant_id:tenant,attempt_id:id,generation:1,lease_token:actor}},{'x-assessment-grading-key':secret}))).status,200);
});
Deno.test('no public objective overwrite, AI invalidation or private bundle endpoint exists',async()=>{
 const handle=createGradingHandler(repository,[],secret);calls=[];
 for(const action of ['score.override','grade.auto_approve','attempt.invalidate','job.claim'])equal((await handle(req('commands',{action,data:{run_id:id}}))).status,422);
 equal((await handle(req('bundle/'+id))).status,404);equal(calls.length,0);
});
Deno.test('marks require finite six-decimal values and human review tokens before API writes',async()=>{
 const handle=createGradingHandler(repository,[],secret);calls=[];
 equal((await handle(req('commands',{action:'mark.submit',data:{task_id:id,criteria:{accuracy:0.1234567},rationale:'Invalid'}}))).status,422);
 equal((await handle(req('commands',{action:'grade.approve',data:{run_id:id,review_hash:'forged'}}))).status,422);equal(calls.length,0);
});
Deno.test('grade release carries the reviewed feedback hash, not a caller supplied disclosure snapshot',async()=>{
 calls=[];const handle=createGradingHandler(repository,[],secret),hash='a'.repeat(64);
 equal((await handle(req('commands',{action:'grade.release',data:{run_id:id,feedback_review_hash:hash,feedback_snapshot:{level:'questions'},approved_by:actor}}))).status,200);
 equal(calls[0],{who:actor,scope:tenant,key:'grading-command-001',action:'grade.release',data:{run_id:id,feedback_review_hash:hash}});
 equal((await handle(req('commands',{action:'grade.release',data:{run_id:id,feedback_review_hash:'bad'}}))).status,422);
 equal(calls.length,1);
});
