import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createNativeSessionDb,bindSql} from './lib/academy-session-test-db.mjs';

const native=process.argv.includes('--native');
const db=native?await createNativeSessionDb():new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const academy=id(1),foreign=id(2),branch=id(3),other=id(4),foreignBranch=id(5),actor=id(6),otherActor=id(7),inactive=id(8);
let checks=0;
const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
const reject=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
const config=(expected=2,patch={})=>({branch_id:branch,source_filename:'students.csv',expected_rows:expected,column_mapping:{full_name:'Name',phone:'Phone'},balance_convention:'credit_positive',currency:'UZS',date_format:'iso',create_missing_groups:false,duplicate_strategy:'reject',...patch});
const source=(name='Aziz',phone='901234567')=>({source:{Name:name,Phone:phone,Salary:'Do not persist'},mapped:{full_name:'Forged name',phone:'Forged phone'},row_number:999});
const sql='select academy_stage_student_import($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb,$6::integer,$7::boolean,$8::uuid[]) as data';
const args=(key,cfg,batch=[],offset=0,seal=false,scope=[branch],who=actor)=>[academy,who,key,JSON.stringify(cfg),JSON.stringify(batch),offset,seal,scope];
const stage=async(...input)=>(await rows(sql,args(...input)))[0].data.job;
try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create table tenants(id uuid primary key);
    create table users(id uuid primary key,is_active boolean not null);
    create table academy_branches(id uuid primary key,academy_id uuid not null references tenants(id),timezone text not null,is_active boolean not null,unique(academy_id,id));`);
  await rows('insert into tenants values($1),($2)',[academy,foreign]);
  await rows('insert into users values($1,true),($2,true),($3,false)',[actor,otherActor,inactive]);
  await rows("insert into academy_branches values($1,$2,'Asia/Tashkent',true),($3,$2,'UTC',true),($4,$5,'UTC',true)",[branch,academy,other,foreignBranch,foreign]);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261012160000_academy_student_import_staging.sql',import.meta.url),'utf8'));
  const c=config();
  const first=await stage(' file-one ',c,[source()]);
  eq(first.idempotency_key,'file-one');eq(first.status,'uploading');eq(first.staged_rows,1);
  const selected=(await rows('select source_data,mapped_data from academy_student_import_rows where job_id=$1',[first.id]))[0];
  eq(selected.source_data,{Name:'Aziz',Phone:'901234567'});eq(selected.mapped_data,{full_name:'Aziz',phone:'901234567'});
  eq((await stage('file-one',c,[source()])).id,first.id);
  await reject(()=>stage('file-one',c,[source('Changed')]),/different values/);
  await reject(()=>stage('file-one',config(3)),/another file, actor or scope/);
  await reject(()=>stage('file-one',c,[],0,false,[branch],otherActor),/another file, actor or scope/);
  await reject(()=>stage('file-one',c,[],0,false,null),/another file, actor or scope/);
  await reject(()=>stage('file-one',c,[],0,true),/every expected row/);
  eq((await stage('file-one',c)).status,'uploading');
  const sealed=await stage('file-one',c,[source('Dilnoza','909876543')],1,true);
  eq(sealed.status,'sealed');eq(sealed.staged_rows,2);eq(sealed.validation,null);eq(sealed.receipt,null);
  eq((await stage('file-one',c,[source()],0,true)).id,sealed.id);
  await reject(()=>stage('file-one',c,[source('Tampered')]),/different values/);
  await reject(()=>rows('update academy_student_import_rows set source_data=$1::jsonb where job_id=$2',[JSON.stringify({Name:'tampered'}),first.id]),/sealed import/);
  await reject(()=>rows('delete from academy_student_import_rows where job_id=$1',[first.id]),/sealed import/);
  await reject(()=>rows('update academy_student_import_rows set row_number=5 where job_id=$1',[first.id]),/cannot move/);
  // A failed seal with a final missing range rolls back its newly inserted rows.
  await stage('partial',config(3),[source()],0);
  await reject(()=>stage('partial',config(3),[source('Third')],2,true),/every expected row/);
  eq((await stage('partial',config(3))).staged_rows,1);
  await stage('partial',config(3),[source('Third')],2);
  eq((await stage('partial',config(3),[source('Second')],1,true)).staged_rows,3);
  for(const scope of [[],[other],[null]])await reject(()=>stage('denied-scope',c,[],0,false,scope),/Forbidden import branch/);
  await reject(()=>stage('foreign',config(2,{branch_id:foreignBranch}),[],0,false,null),/active import branch/);
  await reject(()=>stage('inactive',c,[],0,false,[branch],inactive),/active account/);
  await reject(()=>stage('null-settings',null),/Import settings/);
  await reject(()=>stage('missing-count',config(undefined,{expected_rows:null})),/budget/);
  await reject(()=>stage('overflow',c,[],2147483647),/budget/);
  await reject(()=>stage('unknown-field',config(1,{column_mapping:{...c.column_mapping,role:'Salary'}}),[source()]),/mapping field/);
  await reject(()=>stage('object-cell',config(1),[{source:{Name:{private:'object'},Phone:'901234567'}}]),/source cell/);
  await reject(()=>stage('too-long',config(1),[{source:{Name:'x'.repeat(2001),Phone:'901234567'}}]),/source cell/);
  await reject(()=>stage('too-many',config(5000),Array.from({length:201},()=>source())),/budget/);
  for(const patch of [{currency:'usd'},{balance_convention:null},{date_format:'guess'},{create_missing_groups:'false'},{column_mapping:{phone:'Phone'}}]){
    await reject(()=>stage('invalid-config',config(1,patch),[source()]),/Valid import settings/);
  }
  const exotic=JSON.parse('{"__proto__":"Aziz","constructor":"901234567"}');
  const exoticJob=await stage('exotic',config(1,{column_mapping:{full_name:'__proto__',phone:'constructor'}}),[{source:exotic}],0,true);
  eq((await rows('select mapped_data from academy_student_import_rows where job_id=$1',[exoticJob.id]))[0].mapped_data,{full_name:'Aziz',phone:'901234567'});
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role};`);
    try{
      await reject(()=>stage('browser',c),/permission denied/);
      await reject(()=>rows('select * from academy_student_import_jobs'),/permission denied/);
      await reject(()=>rows('select * from academy_student_import_rows'),/permission denied/);
    }finally{await db.exec('reset role;');}
  }
  // Real independent backends must serialize same-job chunks and key creation.
  if(native){
    const concurrent=config(2);
    const held=await db.holdTransaction(bindSql(sql,args('concurrent',concurrent,[source()],0)),'student-import-holder');
    const pending=db.independent(bindSql(sql,args('concurrent',concurrent,[source('Second')],1,true)),'student-import-contender');
    pending.catch(()=>{});
    try{await db.waitForLock('student-import-contender');checks++;await held.commit();await pending;}
    catch(error){await held.rollback().catch(()=>{});await pending.catch(()=>{});throw error;}
    const final=await stage('concurrent',concurrent);eq(final.staged_rows,2);eq(final.status,'sealed');
    eq((await rows("select count(*)::int as n from academy_student_import_jobs where idempotency_key='concurrent'"))[0].n,1);
  }
  const started=performance.now(),large=config(5000);
  for(let offset=0;offset<5000;offset+=200){
    await stage('large-file',large,Array.from({length:200},(_,i)=>source(`Student ${offset+i+1}`,String(900000000+offset+i))),offset,offset===4800);
  }
  const largeJob=await stage('large-file',large);eq(largeJob.staged_rows,5000);eq(largeJob.status,'sealed');
  eq((await rows('select count(*)::int as n,max(row_number)::int as last from academy_student_import_rows where job_id=$1',[largeJob.id]))[0],{n:5000,last:5000});
  console.log(JSON.stringify({suite:'student-import-staging',database:native?'native PostgreSQL 17':'PGlite',checks,rows:5000,batchSize:200,localStagingMilliseconds:Math.round(performance.now()-started),productionTouched:false}));
}finally{await db.close();}
