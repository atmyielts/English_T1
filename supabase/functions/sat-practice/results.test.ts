import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { AttemptError, getAttemptResult, submitAttempt } from './completion.ts';
const id='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',qId='33333333-3333-4333-8333-333333333333';
const question={id:qId,correct:{option_id:'B',feedback:{explanation:'Saved original'}}};
const attempt={id,user_id:user,status:'scored',question_ids:[qId],answers:{[qId]:{selected_option:'A'}},score_raw:0};
function fixture(status='scored',receipt:any=null,receiptError:any=null,owned=true){
  const calls:any[]=[];
  return {calls,sb:{from:(table:string)=>{const query:any={select:()=>query,eq:(key:string,value:string)=>{calls.push({table,key,value});return query;},maybeSingle:async()=>({data:table==='sat_practice_lab_attempts'?(owned?{...attempt,status}:null):table==='sat_practice_attempt_results'?(receipt?{result:receipt}:null):{questions:[question]},error:table==='sat_practice_attempt_results'?receiptError:null})};return query;}}};
}
const unavailable=()=>{throw Error('Current bank must not be consulted');};
const redact=(q:any)=>{const {correct,...publicQuestion}=q;return publicQuestion;};
Deno.test('Owned immutable result returns original feedback even when current content is unavailable',async()=>{
  const receipt={attempt,questions:[question],notebook:[]},f=fixture('scored',receipt);
  assertEquals(await getAttemptResult(f.sb,user,id,unavailable,redact),{...receipt,legacy_result:false});
  assertEquals(f.calls.filter(x=>x.key==='user_id').every(x=>x.value===user),true);
});
Deno.test('Legacy score remains readable without current prompts or keys and is explicitly identified',async()=>{
  const f=fixture();assertEquals(await getAttemptResult(f.sb,user,id,unavailable,redact),{attempt,questions:[],legacy_result:true});
  assertEquals(f.calls.some(x=>x.table==='sat_practice_attempt_sources'),false);
});
Deno.test('Receipt outage cannot silently substitute a legacy view or changed bank',async()=>{
  const f=fixture('scored',null,{code:'XX000'});
  await assertRejects(()=>getAttemptResult(f.sb,user,id,unavailable,redact),AttemptError,'temporarily unavailable');
});
Deno.test('Pending owned result redacts the entire frozen key and foreign actors cannot inspect it',async()=>{
  const f=fixture('in_progress');const result=await getAttemptResult(f.sb,user,id,unavailable,redact);
  assertEquals(result.questions,[{id:qId}]);
  const denied=fixture('scored',null,null,false);
  await assertRejects(()=>getAttemptResult(denied.sb,user,id,unavailable,redact),AttemptError,'not found');
  assertEquals(denied.calls.some(x=>x.table==='sat_practice_attempt_results'),false);
});
Deno.test('Legacy submission replay preserves the original score without loading edited questions',async()=>{
  const f=fixture();let writes=0;
  const sb={...f.sb,rpc:async()=>{writes++;return {data:{attempt,questions:null,legacy_result:true},error:null};}};
  const result=await submitAttempt(sb,user,{attempt_id:id,answers:attempt.answers},unavailable);
  assertEquals(result,{attempt,questions:[],legacy_result:true});assertEquals(writes,1);
});
