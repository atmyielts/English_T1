import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
import assert from 'node:assert/strict';
const moduleOf=file=>{
 const module={exports:{}};
 runInNewContext(transformSync(readFileSync('supabase/functions/academy/'+file,'utf8'),{loader:'ts',format:'cjs',target:'es2022'}).code,{module,exports:module.exports});return module.exports;
};
const policy=moduleOf('access.ts'),branches=moduleOf('mutation-branches.ts'),contacts=moduleOf('contact-save.ts');
const source=readFileSync('supabase/functions/academy/index.ts','utf8');
const start=source.indexOf('      if (actionBody === "upsert_contact") {'),end=source.indexOf('      if (actionBody === "create_classroom")',start);
assert(start>0&&end>start);
const handler=transformSync('async function save(sb,academyId,access,userId,body){const actionBody="upsert_contact";'+source.slice(start,end)+'};save',{loader:'ts',target:'es2022'}).code;
const normalizeText=(value,max=300)=>String(value??'').trim().slice(0,max);
const save=runInNewContext(handler,{
 ...contacts,...branches,...policy,normalizeText,normalizeEmail:value=>normalizeText(value).toLowerCase(),
 json:(status,body)=>({status,body}),ensureContactInAccessScope:async()=>{},
 validateBranchScopedMutation:(sb,academy,access,body,action)=>branches.validateAcademyMutationBranches(sb,academy,policy.academyAccessBranchIds(access),body,action),
});
const academy='academy',actor='receptionist',access={tenant_id:academy,role:'receptionist',status:'active',branch_ids:['branch-a'],classroom_ids:[]};
function fixture(changeBeforeUpdate){
 const rows={
  academy_branches:[{id:'branch-a',academy_id:academy},{id:'branch-b',academy_id:academy}],
  academy_contacts:[{id:'own',academy_id:academy,primary_branch_id:'branch-a',user_id:'original-student',created_by:'original-admin',email:'a@example.invalid',phone:'123'},
   {id:'foreign',academy_id:academy,primary_branch_id:'branch-b',user_id:'other-student',created_by:'original-admin',email:'b@example.invalid',phone:'456'}],
  users:[{id:'different-student',email:'changed@example.invalid'}],
 };
 const writes=[];
 const db={from:table=>{
  let filters=[],patch=null,insert=false;
  const query={
   select:()=>query,eq:(key,value)=>{filters.push(row=>row[key]===value);return query;},is:(key,value)=>{filters.push(row=>(row[key]??null)===value);return query;},
   in:(key,values)=>{filters.push(row=>values.includes(row[key]));return query;},
   update:value=>{patch=value;if(changeBeforeUpdate)changeBeforeUpdate(rows[table]);return query;},
   insert:value=>{patch=value;insert=true;return query;},
   maybeSingle:async()=>{
    if(insert){const row={id:'created',...patch};rows[table].push(row);writes.push(row);return {data:row,error:null};}
    const matched=rows[table].filter(row=>filters.every(filter=>filter(row)));
    if(matched.length>1)return {data:null,error:{message:'Multiple rows'}};
    if(patch&&matched.length){Object.assign(matched[0],patch);writes.push({...matched[0]});}
    // Each HTTP read returns a detached snapshot; later database changes must
    // not mutate the response object already held by the command handler.
    return {data:matched[0]?{...matched[0]}:null,error:null};
   },
   then:(resolve,reject)=>Promise.resolve({data:rows[table].filter(row=>filters.every(filter=>filter(row))),error:null}).then(resolve,reject),
  };return query;
 }};
 return {db,rows,writes};
}
let checks=0;
for(const body of [
 {id:'foreign',branch_id:'branch-a',phone:'456',first_name:'Blocked'},
 {branch_id:'branch-a',phone:'456',first_name:'Blocked'},
 {branch_id:'branch-a',email:'b@example.invalid',first_name:'Blocked'},
]){
 const f=fixture();const result=await save(f.db,academy,access,actor,body);assert.equal(result.status,403);assert.equal(f.writes.length,0);checks++;
}
{
 const f=fixture();const result=await save(f.db,academy,access,actor,{id:'own',phone:'123',email:'b@example.invalid'});assert.equal(result.status,409);assert.equal(f.writes.length,0);checks++;
}
{
 const f=fixture();const result=await save(f.db,academy,access,actor,{id:'own',phone:'123',email:'changed@example.invalid',first_name:'Updated'});
 assert.equal(result.status,200);assert.equal(f.writes[0].user_id,'original-student');assert.equal(f.writes[0].created_by,'original-admin');checks++;
}
for(const [key,value] of [['user_id','new-binding'],['primary_branch_id','branch-b']]){
 const f=fixture(rows=>rows[0][key]=value);const result=await save(f.db,academy,access,actor,{id:'own',phone:'123',first_name:'Blocked'});assert.equal(result.status,409);assert.equal(f.writes.length,0);checks++;
}
{
 const f=fixture();const result=await save(f.db,academy,access,actor,{phone:'999',first_name:'New'});assert.equal(result.status,200);assert.equal(f.writes[0].primary_branch_id,'branch-a');assert.equal(f.writes[0].created_by,actor);checks++;
}
console.log(JSON.stringify({suite:'actual-academy-contact-save-handler',checks,productionTouched:false}));
