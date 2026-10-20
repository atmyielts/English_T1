import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
const source=readFileSync('apps/academy/src/lib/client.ts','utf8');
const start=source.indexOf('type GuardianPortalPage='),end=source.indexOf('export const teacherStudioClaimGuardianLink',start);
assert.ok(start>=0&&end>start);
const code=transformSync(source.slice(start,end).replaceAll('export const ','const '),{loader:'ts',target:'es2022'}).code;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),a={relationship_id:id(2),details_loaded:false,student:{name:'First child'}},b={relationship_id:id(3),details_loaded:false,student:{name:'Second child'}};
function load(respond){
 const calls=[];
 const fn=runInNewContext(code+';teacherStudioGuardianDashboard',{parentRequest:async(...args)=>{calls.push(args);return respond(...args);},Map,Set,Error});
 return {fn,calls};
}
let checks=0;
{
 let count=0;const selected={...b,details_loaded:true,messages:[{body:'Owned selected history'}]};
 const c=load(()=>++count===1?{guardians:[{id:id(4)}],children:[a],selected_child:selected,preferences:[{id:id(5)}],notifications:[],has_more:true,cursor:{after_id:a.relationship_id}}:
  {guardians:[{id:id(4)}],children:[b],selected_child:null,preferences:[{id:id(5)}],notifications:[],has_more:false,cursor:null});
 const result=await c.fn(b.relationship_id,actor);
 assert.equal(result.children.length,2);assert.equal(result.children.find(row=>row.relationship_id===b.relationship_id).messages[0].body,'Owned selected history');checks+=2;
 assert.equal(result.guardians.length,1);assert.equal(result.preferences.length,1);checks+=2;
 assert.deepEqual(c.calls.map(call=>call[3]),[actor,actor]);assert.equal(c.calls[1][2].list_only,true);assert.equal(c.calls[1][2].after_id,a.relationship_id);checks+=3;
}
{
 const c=load(()=>({guardians:[],children:[],selected_child:null,preferences:[],notifications:[],has_more:true,cursor:{after_id:id(2)}}));
 await assert.rejects(()=>c.fn(undefined,actor),/Try again/);assert.equal(c.calls.length,2);checks+=2;
}
{
 let count=0;const c=load(()=>{if(count++)throw Object.assign(Error('Your account changed'),{status:409});return {guardians:[],children:[a],selected_child:null,preferences:[],notifications:[],has_more:true,cursor:{after_id:id(2)}};});
 await assert.rejects(()=>c.fn(undefined,actor),e=>e.status===409);checks++;
}
console.log(JSON.stringify({suite:'parent-portal-selected-child-pagination',checks,productionTouched:false}));
