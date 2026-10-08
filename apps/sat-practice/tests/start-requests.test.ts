import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { acknowledgeStart, pendingStart, startActor, startSelection } from '../src/lib/start-requests.ts';
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
function storage(){const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};}
Deno.test('Lost response and reload reuse one actor-scoped start ID until the owned drill loads',()=>{
  const db=storage(),selection=startSelection('/start',{section_type:'math',question_count:10}),create=()=>id;
  assertEquals(pendingStart(db,actor,selection,create),id);
  assertEquals(pendingStart(db,actor,selection,()=>{throw Error('Must replay');}),id);
  assertEquals(pendingStart(db,other,selection,()=>other),other);
  acknowledgeStart(db,other,id);assertEquals(pendingStart(db,actor,selection,()=>{throw Error('Must remain');}),id);
  acknowledgeStart(db,actor,id);assertEquals(pendingStart(db,actor,selection,()=>other),other);
});
Deno.test('Normalized property order and blank controls keep identity; different selection and review remain separate',()=>{
  const a=startSelection('/start',{section_type:'math',question_count:10,domain:''});
  assertEquals(a,startSelection('/start',{question_count:10,domain:undefined,section_type:'math'}));
  assertEquals(a===startSelection('/review',{question_count:10,section_type:'math'}),false);
  assertEquals(a===startSelection('/start',{question_count:9,section_type:'math'}),false);
});
Deno.test('Storage failure stops before an unrepeatable mutation; bad token cannot borrow another actor',()=>{
  const failed={...storage(),setItem:()=>{throw Error('disabled');}};
  assertThrows(()=>pendingStart(failed,actor,'selection',()=>id),Error,'Enable browser storage');
  assertThrows(()=>startActor('bad-token'),Error,'Sign in again');
  const token='qa.'+btoa(JSON.stringify({sub:actor}))+'.signature';assertEquals(startActor(token),actor);
});
