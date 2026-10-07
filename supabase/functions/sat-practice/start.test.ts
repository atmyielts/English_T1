import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { readStartBody, startAttempt } from './start.ts';
import { AttemptError, attemptQuestions, submitAttempt } from './completion.ts';
import { questionForLearner } from './access.ts';
const actor='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',qid='33333333-3333-4333-8333-333333333333';
const question={id:qid,type:'question_numeric',data:{prompt:'Original'},correct:{value:'12',feedback:{explanation:'Private until scored'}}};

Deno.test('Malformed, non-object and oversized request bodies cannot become an unrestricted start',async()=>{
  const request=(body?:string)=>new Request('https://example.test/start',{method:'POST',body});
  assertEquals(await readStartBody(request()),{});assertEquals(await readStartBody(request('{}')),{});
  assertEquals(await readStartBody(request(JSON.stringify({request_id:id}))),{request_id:id});
  for (const body of ['{broken','[]','null','"default"']) await assertRejects(()=>readStartBody(request(body)),AttemptError,'Invalid');
  const error=await assertRejects(()=>readStartBody(request(' '.repeat(16385))),AttemptError,'too large');
  assertEquals((error as AttemptError).status,413);
});

Deno.test('Atomic starts pass authenticated actor, durable identity and strictly normalized selection',async()=>{
  let calls=0;
  const sb={rpc:(name:string,p:any)=>{calls++;assertEquals(name,'start_sat_practice_attempt');assertEquals(p,{p_user_id:actor,p_request_id:id,p_filters:{limit:2,section_type:'math',question_ids:[]}});return Promise.resolve({data:{attempt:{id},questions:[question]},error:null});}};
  const r=await startAttempt(sb,actor,{request_id:id.toUpperCase(),section_type:'math',question_count:2,question_ids:[]});
  assertEquals(r.questions,[question]);assertEquals(Object.hasOwn(questionForLearner(r.questions[0]),'correct'),false);
  await assertRejects(()=>startAttempt(sb,actor,{request_id:'invalid'}),AttemptError,'Invalid');
  await assertRejects(()=>startAttempt(sb,actor,{question_count:1.5}),AttemptError,'between');assertEquals(calls,1);
});
Deno.test('Start outages, collisions, empty selection and foreign review expose only actionable errors',async()=>{
  for(const [code,status] of [['P0002',404],['P0001',409],['23505',409],['22023',400],['22P02',400],['XX000',503]] as const){
    const e=await assertRejects(()=>startAttempt({rpc:()=>Promise.resolve({error:{code,message:'private database details'}})},actor,{request_id:id}),AttemptError);
    assertEquals((e as AttemptError).status,status);assertEquals(e.message.includes('database details'),false);
  }
});
Deno.test('Legacy clients get a server identity and notebook starts carry server-owned review selection',async()=>{
  let payload:any;
  const sb={rpc:(_name:string,p:any)=>{payload=p;return Promise.resolve({data:{attempt:{id:p.p_request_id},questions:[question]},error:null});}};
  await startAttempt(sb,actor,{});assertEquals(typeof payload.p_request_id,'string');assertEquals(payload.p_filters,{limit:10});
  await startAttempt(sb,actor,{request_id:id,question_ids:[]},{id:qid,section_type:'math',domain:'algebra',difficulty:'easy'});
  assertEquals(payload.p_filters,{limit:6,section_type:'math',domain:'algebra',difficulty:'easy',retry_notebook_id:qid});
});
const snapshotDb=(source:any,sourceError:any=null)=>({from:(table:string)=>{
  const query:any={select:()=>query,eq:()=>query,maybeSingle:()=>Promise.resolve({data:table==='sat_practice_attempt_sources'?source:{id,user_id:actor,status:'in_progress',question_ids:[qid]},error:table==='sat_practice_attempt_sources'?sourceError:null})};return query;
},rpc:(_name:string,p:any)=>Promise.resolve({data:{attempt:{id},questions:p.p_questions,scored:p.p_scored_items},error:null})});
Deno.test('Owned resume and submit use frozen text and keys without querying edited live content',async()=>{
  const sb=snapshotDb({questions:[question]}),attempt={id,question_ids:[qid]};let loads=0;
  const legacy=()=>{loads++;throw Error('Live keys changed');};
  assertEquals(await attemptQuestions(sb,actor,attempt,legacy),[question]);
  const r=await submitAttempt(sb,actor,{attempt_id:id,answers:{[qid]:{text:'12'}}},legacy);
  assertEquals(r.questions,[question]);assertEquals(r.scored[0].correct,true);assertEquals(loads,0);
});
Deno.test('Snapshot outage or corruption cannot silently substitute current questions; legacy absence remains compatible',async()=>{
  const attempt={id,question_ids:[qid]};let loads=0;const fallback=()=>{loads++;return Promise.resolve([question]);};
  for(const [source,error] of [[null,{message:'outage'}],[{questions:[]},null],[{questions:[{...question,id}]},null]]){
    await assertRejects(()=>attemptQuestions(snapshotDb(source,error),actor,attempt,fallback),AttemptError);
  }
  assertEquals(loads,0);assertEquals(await attemptQuestions(snapshotDb(null),actor,attempt,fallback),[question]);assertEquals(loads,1);
});
