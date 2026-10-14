import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {transformSync} from 'esbuild';
import assert from 'node:assert/strict';
const moduleOf=(file,dependencies={})=>{
 const module={exports:{}};
 const source=readFileSync(new URL('../supabase/functions/academy/'+file,import.meta.url),'utf8');
 runInNewContext(transformSync(source,{loader:'ts',format:'cjs',target:'es2022'}).code,{module,exports:module.exports,require:name=>{assert(Object.hasOwn(dependencies,name));return dependencies[name];}});
 return module.exports;
};
const access=moduleOf('access.ts'),scope=moduleOf('capability-scope.ts',{'./access.ts':access});
const source=readFileSync(new URL('../supabase/functions/academy/index.ts',import.meta.url),'utf8');
const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);};
const js=transformSync(section('const mergeAccessRows =','const relationMissing =')+section('const isAcademyTenantRow =','const resolveAcademyId =')+';({loadMemberships})',{loader:'ts',target:'es2022'}).code;
const testNow='2026-10-13T21:30:00Z';
class TestDate extends Date{constructor(value=testNow){super(value);}static now(){return Date.parse(testNow);}}
const context={...access,...scope,Date:TestDate,crypto:webcrypto,normalizeText:(v,n=300)=>String(v??'').trim().slice(0,n),normalizeEmail:v=>String(v??'').trim().toLowerCase(),toStringArray:v=>Array.isArray(v)?[...new Set(v)]:[],toJsonObject:v=>v&&typeof v==='object'?v:{},relationMissing:()=>false};
const {loadMemberships}=runInNewContext(js,context);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),academy=id(2),email='owned@example.invalid';
const grant=(patch={})=>({id:id(3),academy_id:academy,user_id:null,email,role:'manager',status:'active',scope_type:'students',scope_ids:[id(4)],starts_at:'2020-01-01T00:00:00Z',expires_at:null,...patch});
const plain=value=>JSON.parse(JSON.stringify(value));let checks=0;
function fixture({grants=[],staff=[],assignments=[],memberships=[],centers=[],tenants=[],beforeAcceptance,acceptanceError}={}){
 const data={academy_role_grants:plain(grants),academy_staff:plain(staff),academy_staff_branch_assignments:plain(assignments),tenant_memberships:plain(memberships),partner_center_profiles:plain(centers),tenants:plain(tenants)},updates=[];
 return {updates,data,from(table){
  const filters=[];let patch;
  const chain={select(){return this;},order(){return this;},limit(){return this;},eq(key,value){filters.push(row=>row[key]===value);return this;},is(key,value){filters.push(row=>row[key]===value);return this;},in(key,values){filters.push(row=>values.includes(row[key]));return this;},lte(key,value){filters.push(row=>row[key]!=null&&row[key]<=value);return this;},contains(key,value){filters.push(row=>Object.entries(value).every(([k,v])=>row[key]?.[k]===v));return this;},or(value){
   const key=value.startsWith('expires_at')?'expires_at':'ends_on',boundary=value.match(/\.(?:gt|gte)\.(.*)$/)?.[1];assert(boundary);
   filters.push(row=>row[key]==null||row[key]>boundary);return this;
  },update(value){patch=value;return this;},async maybeSingle(){const result=execute();return {...result,data:result.data?.[0]??null};},then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject);}};
  function execute(){
   if(patch?.accepted_at){beforeAcceptance?.(data.academy_role_grants);if(acceptanceError)return {data:null,error:{message:'Owned fixture error'}};}
   const rows=(data[table]??[]).filter(row=>filters.every(fn=>fn(row)));
   if(patch){updates.push({table,patch:plain(patch),matched:rows.length});for(const row of rows)Object.assign(row,plain(patch));}
   return {data:plain(rows),error:null};
  }
  return chain;
 }};
}
for(const changed of [{status:'revoked'},{email:'reassigned@example.invalid'},{user_id:id(9)},{expires_at:'2020-01-01T00:00:00Z'}]){
 const db=fixture({grants:[grant({status:'invited'})],beforeAcceptance:rows=>Object.assign(rows[0],changed)});
 assert.deepEqual(plain(await loadMemberships(db,actor,email)),[]);assert(db.updates.every(u=>!u.patch.accepted_at||u.matched===0));checks++;
}
{
 const db=fixture({grants:[grant({status:'invited',role:'admin'})],beforeAcceptance:rows=>Object.assign(rows[0],{role:'teacher',scope_type:'classrooms',scope_ids:[id(5)]})});
 const rows=plain(await loadMemberships(db,actor,email));assert.equal(rows[0].role,'teacher');assert.equal(rows[0].authority_entries[0].role,'teacher');
 assert.deepEqual(rows[0].authority_entries[0].scope_ids,[id(5)]);checks++;
}
{
 const db=fixture({grants:[grant({status:'invited'})],acceptanceError:true});await assert.rejects(()=>loadMemberships(db,actor,email),/accept academy access invitation/);checks++;
}
for(const principalEmail of [email,null]){
 const db=fixture({grants:[grant({user_id:id(9)})],staff:[{id:id(10),academy_id:academy,user_id:id(9),email,role:'admin',is_active:true}]});
 assert.deepEqual(plain(await loadMemberships(db,actor,principalEmail)),[]);checks++;
}
{
 const db=fixture({grants:[grant({user_id:actor})]});const rows=plain(await loadMemberships(db,actor,null));
 assert.deepEqual(plain(scope.resolveAcademyCapabilityScope(academy,rows[0].authority_entries,'manageContacts').studentIds),[id(4)]);checks++;
}
{
 const db=fixture({grants:[grant({user_id:actor,role:'branch_manager',scope_type:'branches',scope_ids:[id(6)]}),grant({id:id(7),user_id:actor,role:'teacher',scope_type:'classrooms',scope_ids:[id(8)]})]});
 const rows=plain(await loadMemberships(db,actor,email));assert.equal(rows.length,1);assert.equal(rows[0].authority_entries.length,2);
 const contacts=scope.resolveAcademyCapabilityScope(academy,rows[0].authority_entries,'manageContacts');
 assert.deepEqual(plain(contacts.branchIds),[id(6)]);assert.deepEqual(plain(contacts.classroomIds),[]);
 const grading=scope.resolveAcademyCapabilityScope(academy,rows[0].authority_entries,'gradeSubmissions');assert.deepEqual(plain(grading.classroomIds),[id(8)]);checks++;
}
for(const status of ['active','paused']){
 const center=id(20),child={id:academy,type:'team',metadata:{service_family:'academy',parent_center_id:center}};
 const memberships=[{tenant_id:center,user_id:actor,role:'owner',status:'active',tenants:{id:center,type:'personal',metadata:{}}},
  {tenant_id:academy,user_id:actor,role:'owner',status:'active',tenants:child}];
 const rows=plain(await loadMemberships(fixture({memberships,centers:[{tenant_id:center,status}],tenants:[child]}),actor,email));
 assert.equal(rows.length,1);assert.equal(rows[0].role,'owner');
 assert.equal(rows[0].authority_entries.some(row=>row.source==='tenant'),true);
 assert.equal(rows[0].authority_entries.some(row=>row.source==='center'),status==='active');checks++;
}
{
 const center=id(20),child={id:academy,type:'team',metadata:{service_family:'academy',parent_center_id:center}};
 const rows=plain(await loadMemberships(fixture({memberships:[{tenant_id:center,user_id:actor,role:'owner',status:'active',tenants:{id:center,type:'personal',metadata:{}}}],centers:[{tenant_id:center,status:'paused'}],tenants:[child]}),actor,email));
 assert.deepEqual(rows,[]);checks++;
}
for(const status of ['active','revoked','suspended','expired']){
 const profile={id:id(30),academy_id:academy,user_id:actor,email,role:'admin',classroom_ids:[],is_active:true,managed_grant_id:id(3)};
 const rows=plain(await loadMemberships(fixture({grants:[grant({user_id:actor,status})],staff:[profile]}),actor,email));
 if(status==='active'){
  assert.equal(rows[0].staff_id,id(30));assert.equal(rows[0].authority_entries.length,1);
  assert.equal(rows[0].authority_entries[0].source,'grant');assert.equal(rows[0].authority_entries[0].staff_id,id(30));
  assert.deepEqual(plain(scope.resolveAcademyCapabilityScope(academy,rows[0].authority_entries,'manageContacts').studentIds),[id(4)]);
 }else assert.deepEqual(rows,[]);
 checks++;
}
{
 const profile={id:id(30),academy_id:academy,user_id:actor,email,role:'admin',classroom_ids:[],is_active:false,managed_grant_id:id(3)};
 const rows=plain(await loadMemberships(fixture({grants:[grant({user_id:actor,role:'teacher',scope_type:'classrooms',scope_ids:[id(5)]})],staff:[profile]}),actor,email));
 assert.equal(rows[0].staff_id,id(30));assert.equal(rows[0].authority_entries.length,1);checks++;
}
{
 const profile={id:id(30),academy_id:academy,user_id:actor,email,role:'admin',is_active:true,managed_grant_id:id(3)};
 const assignment=(branch,patch={})=>({academy_id:academy,staff_id:id(30),branch_id:branch,status:'active',starts_on:'2020-01-01',ends_on:null,
  academy_branches:{academy_id:academy,id:branch,timezone:'Asia/Tashkent',is_active:true},...patch});
 const branches=[id(6),id(7),id(8),id(9),id(10),id(11),id(12),id(13)];
 const rows=plain(await loadMemberships(fixture({grants:[grant({user_id:actor,role:'admin',scope_type:'branches',scope_ids:branches})],staff:[profile],assignments:[
  assignment(id(6)),assignment(id(7),{starts_on:'2999-01-01'}),assignment(id(8),{status:'paused'}),assignment(id(9),{ends_on:'2000-01-01'}),
  assignment(id(10),{academy_id:id(99)}),assignment(id(11),{academy_branches:{academy_id:academy,id:id(11),timezone:'Invalid/Timezone',is_active:true}}),
  assignment(id(12),{academy_branches:{academy_id:academy,id:id(12),timezone:'UTC',is_active:false}}),assignment(id(13),{academy_branches:null}),assignment(id(99)),
 ]}),actor,email));
 assert.deepEqual(rows[0].branch_ids,[id(6)]);assert.deepEqual(rows[0].authority_entries[0].scope_ids,[id(6)]);
 assert.deepEqual(plain(scope.resolveAcademyCapabilityScope(academy,rows[0].authority_entries,'manageStaff').branchIds),[id(6)]);checks++;
}
for(const [timezone,starts,ends,expected] of [['Asia/Tashkent','2026-10-14',null,true],['UTC','2026-10-14',null,false],['Asia/Tashkent','2020-01-01','2026-10-13',false],['UTC','2020-01-01','2026-10-13',true]]){
 const profile={id:id(30),academy_id:academy,user_id:id(99),email:'other@example.invalid',role:'admin',is_active:true,managed_grant_id:id(3)};
 const rows=plain(await loadMemberships(fixture({grants:[grant({user_id:actor,role:'admin',scope_type:'branches',scope_ids:[id(6)]})],staff:[profile],assignments:[
  {academy_id:academy,staff_id:id(30),branch_id:id(6),status:'active',starts_on:starts,ends_on:ends,
   academy_branches:{academy_id:academy,id:id(6),timezone,is_active:true}},
 ]}),actor,email));
 assert.deepEqual(rows[0].authority_entries[0].scope_ids,expected?[id(6)]:[]);assert.equal(rows[0].staff_id,undefined);checks++;
}
console.log(JSON.stringify({suite:'actual-academy-authority-loader',checks,productionTouched:false}));
