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
const context={...access,...scope,crypto:webcrypto,normalizeText:(v,n=300)=>String(v??'').trim().slice(0,n),normalizeEmail:v=>String(v??'').trim().toLowerCase(),toStringArray:v=>Array.isArray(v)?[...new Set(v)]:[],toJsonObject:v=>v&&typeof v==='object'?v:{},relationMissing:()=>false};
const {loadMemberships}=runInNewContext(js,context);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),academy=id(2),email='owned@example.invalid';
const grant=(patch={})=>({id:id(3),academy_id:academy,user_id:null,email,role:'manager',status:'active',scope_type:'students',scope_ids:[id(4)],starts_at:'2020-01-01T00:00:00Z',expires_at:null,...patch});
const plain=value=>JSON.parse(JSON.stringify(value));let checks=0;
function fixture({grants=[],staff=[],memberships=[],centers=[],tenants=[],beforeAcceptance,acceptanceError}={}){
 const data={academy_role_grants:plain(grants),academy_staff:plain(staff),tenant_memberships:plain(memberships),partner_center_profiles:plain(centers),tenants:plain(tenants)},updates=[];
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
console.log(JSON.stringify({suite:'actual-academy-authority-loader',checks,productionTouched:false}));
