import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { savedAnswerText, savedFeedback } from '../src/lib/saved-feedback.ts';
const question={id:'original-question',data:{options:[{id:'A',label:'First original choice'},{id:'B',label:'Second original choice'}]},correct:{option_id:'A',feedback:{explanation:'Later changed explanation'}}};
const attempt={status:'scored',scored_items:[{question_id:question.id,correct:false,expected:{option_id:'B',feedback:{explanation:'Original saved explanation'}},answer:{selected_option:'A'}}]};
Deno.test('Feedback preserves the recorded outcome, expected choice and explanation after current keys change',()=>{
  assertEquals(savedFeedback(attempt,question,true),{correct:false,expected:'B: Second original choice',explanation:'Original saved explanation'});
});
Deno.test('Legacy or unconfirmed question sources never borrow feedback from current keys',()=>{
  assertEquals(savedFeedback(attempt,question,false),null);
  assertEquals(savedFeedback({...attempt,status:'in_progress'},question,true),null);
});
Deno.test('Ambiguous, unrelated or malformed scorer records do not invent outcomes',()=>{
  assertEquals(savedFeedback({...attempt,scored_items:[...attempt.scored_items,...attempt.scored_items]},question,true),null);
  assertEquals(savedFeedback({...attempt,scored_items:[{...attempt.scored_items[0],question_id:'someone-else'}]},question,true),null);
  assertEquals(savedFeedback({...attempt,scored_items:[{question_id:question.id,correct:'true'}]},question,true),null);
});
Deno.test('Numeric zero and saved accepted alternatives remain readable without generating an explanation',()=>{
  const numeric={status:'scored',scored_items:[{question_id:question.id,correct:true,expected:{value:0}}]};
  assertEquals(savedFeedback(numeric,question,true),{correct:true,expected:'0',explanation:null});
  assertEquals(savedFeedback({...numeric,scored_items:[{question_id:question.id,correct:true,expected:[0,'0.0']}]},question,true),{correct:true,expected:'0 or 0.0',explanation:null});
});
Deno.test('Legacy saved answers preserve choices, numeric zero and text without dumping malformed records',()=>{
  assertEquals(savedAnswerText({selected_option:'D'}),'D');
  assertEquals(savedAnswerText({option_id:'A'}),'A');
  assertEquals(savedAnswerText({value:0}),'0');
  assertEquals(savedAnswerText({text:'original answer'}),'original answer');
  assertEquals(savedAnswerText(null),'No answer entered.');
  assertEquals(savedAnswerText({unexpected:{current_key:'B'}}),'The saved answer format is unavailable.');
});
Deno.test('Grid-in results show every accepted answer and the saved explanation',()=>{
  const spr={id:'spr',data:{prompt:'x'}};
  const row={status:'scored',scored_items:[{question_id:'spr',correct:true,expected:{accepted:['2/3','.6667'],feedback:{explanation:'Divide by 3.'}},answer:{text:'4/6'}}]};
  assertEquals(savedFeedback(row,spr,true),{correct:true,expected:'2/3 or .6667',explanation:'Divide by 3.'});
});
