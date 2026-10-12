import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createNativeSessionDb} from './lib/academy-session-test-db.mjs';
const native=process.argv.includes('--native');
const db=native?await createNativeSessionDb():new PGlite();let checks=0,sequence=0;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const academy=id(1),foreign=id(2),branch=id(3),other=id(4),actor=id(6),reviewer=id(7);
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const reject=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const student=(patch={})=>({full_name:'Aziz G‘ofirov',phone:'901234567',parent_phone:null,group_name:'IELTS A',balance:'800000',joined_on:'2026-10-01',...patch});
const config=(n,patch={})=>({branch_id:branch,source_filename:'students.csv',expected_rows:n,column_mapping:{full_name:'full_name',phone:'phone',email:'email',parent_phone:'parent_phone',parent_name:'parent_name',group_name:'group_name',balance:'balance',joined_on:'joined_on'},balance_convention:'credit_positive',currency:'UZS',date_format:'iso',create_missing_groups:false,duplicate_strategy:'reject',...patch});
const stage=async(source,patch={},seal=true)=>{
  const key='preview-'+(++sequence),c=config(source.length,patch);let job;
  for(let offset=0;offset<source.length;offset+=200){
    job=(await query('select academy_stage_student_import($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb,$6::integer,$7::boolean,$8::uuid[]) as data',
     [academy,actor,key,JSON.stringify(c),JSON.stringify(source.slice(offset,offset+200).map(row=>({source:row}))),offset,seal&&offset+200>=source.length,[branch]]) )[0].data.job;
  }
  return job;
};
const validate=async(job,who=actor,scope=[branch],all=false,groups=false)=>(await query('select academy_validate_student_import($1::uuid,$2::uuid,$3::uuid,$4::uuid[],$5::boolean,$6::boolean) as data',[academy,who,job.id,scope,all,groups]))[0].data.job;
const values=async(job)=>(await query('select normalized_data,validation_errors from academy_student_import_rows where job_id=$1 order by row_number',[job.id]));
const fails=async(row,error,patch={},groupPermission=false)=>{
 const job=await stage([row],patch);const preview=await validate(job,actor,[branch],false,groupPermission);
 eq(preview.status,'sealed');eq(preview.validation.ready,false);eq((await values(job))[0].validation_errors.includes(error),true);return job;
};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create table tenants(id uuid primary key);create table users(id uuid primary key,is_active boolean not null);
  create table academy_branches(id uuid primary key,academy_id uuid not null references tenants(id),timezone text not null,is_active boolean not null,unique(academy_id,id));
  create table academy_localization_settings(academy_id uuid primary key,currency text not null);`);
 await query('insert into tenants values($1),($2)',[academy,foreign]);
 await query('insert into users values($1,true),($2,true)',[actor,reviewer]);
 await query("insert into academy_branches values($1,$2,'Asia/Tashkent',true),($3,$2,'UTC',true)",[branch,academy,other]);
 await query("insert into academy_localization_settings values($1,'UZS')",[academy]);
 const phoneSource=readFileSync(new URL('../supabase/migrations/20260810190000_academy_business_os_phase_g.sql',import.meta.url),'utf8');
 await db.exec(phoneSource.slice(phoneSource.indexOf('create or replace function'),phoneSource.indexOf('alter table')));
 await db.exec(`create table academy_contacts(id uuid primary key,academy_id uuid not null,primary_branch_id uuid not null,first_name text,last_name text,status text not null,phone text,email text,phone_normalized text generated always as(academy_normalize_phone(phone)) stored);
  create index on academy_contacts(academy_id,phone_normalized);create index on academy_contacts(academy_id,lower(email));
  create table academy_classrooms(id uuid primary key,academy_id uuid not null,branch_id uuid not null,name text not null,is_active boolean not null,student_capacity integer);
  create table academy_classroom_memberships(id uuid primary key,academy_id uuid not null,classroom_id uuid not null,contact_id uuid not null,role text not null,status text not null);
  create table academy_guardians(id uuid primary key,academy_id uuid not null,phone text,status text not null,phone_normalized text generated always as(academy_normalize_phone(phone)) stored);
  create index on academy_guardians(academy_id,phone_normalized);
  create table academy_student_guardian_relationships(id uuid primary key,academy_id uuid not null,contact_id uuid not null,guardian_id uuid not null,status text not null,consent_status text not null);`);
 for(const file of ['20261012160000_academy_student_import_staging.sql','20261012170000_academy_student_import_normalization.sql','20261012180000_academy_student_import_preview.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await query("insert into academy_classrooms values($1,$2,$3,'IELTS A',true,2),($4,$2,$5,'Other branch class',true,20),($6,$2,$3,'Inactive class',false,20)",[id(10),academy,branch,id(11),other,id(12)]);
 await query("insert into academy_contacts(id,academy_id,primary_branch_id,first_name,status,phone,email) values($1,$2,$3,'Existing','active','904441111','existing@example.invalid'),($4,$2,$5,'Other branch','active','905551111',null),($6,$2,$3,'Ambiguous A','active','906661111',null),($7,$2,$3,'Ambiguous B','active','+998 90 666 11 11',null),($8,$2,$3,'Paused','paused','907771111',null)",[id(20),academy,branch,id(21),other,id(22),id(23),id(24)]);
 await query("insert into academy_guardians values($1,$2,'908881111','invited'),($3,$2,'+998 90 888 11 11','invited'),($4,$2,'909991111','suspended'),($5,$2,'901111111','verified')",[id(30),academy,id(31),id(32),id(33)]);
 let job=await stage([student({parent_phone:'902222222'})]);
 await reject(()=>query("update academy_student_import_rows set normalization='{}' where job_id=$1",[job.id]),/derived from frozen/);
 let preview=await validate(job);
 eq(preview.status,'validated');eq(preview.validation.create_rows,1);eq(preview.validation.opening_credit,'800000');eq(preview.validation.opening_debt,'0');eq(preview.validation.requires_finance_approval,true);
 eq((await values(job))[0].normalized_data.classroom_id,id(10));
 const originalHash=preview.validation.preview_hash;eq((await validate(job)).validation.preview_hash,originalHash);
 await reject(()=>query("update academy_student_import_rows set normalization='{}' where job_id=$1",[job.id]),/cannot be changed/);
 // Changed references are visible on a repeated preview, not frozen as trusted flags.
 await query('update academy_classrooms set student_capacity=0 where id=$1',[id(10)]);
 preview=await validate(job);eq(preview.validation.ready,false);eq(preview.validation.preview_hash===originalHash,false);
 await query('update academy_classrooms set student_capacity=2 where id=$1',[id(10)]);
 await reject(()=>validate(job,reviewer),/Forbidden import job/);
 eq((await validate(job,reviewer,[branch],true)).validation.ready,true);
 for(const scope of [[],[other],[null]])await reject(()=>validate(job,reviewer,scope,true),/Forbidden import job/);
 const incomplete=await stage([student()],{},false);await reject(()=>validate(incomplete),/sealed upload/);
 await fails(student({phone:'904441111'}),'student_already_exists');
 await fails(student({phone:'905551111'}),'identity_unavailable_in_branch',{duplicate_strategy:'reuse'});
 await fails(student({phone:'906661111'}),'existing_identity_ambiguous',{duplicate_strategy:'reuse'});
 await fails(student({phone:'907771111'}),'existing_student_not_active',{duplicate_strategy:'reuse'});
 await fails(student({phone:'904441111'}),'existing_balance_requires_reconciliation',{duplicate_strategy:'reuse'});
 await fails(student({phone:'901234567',email:'existing@example.invalid',group_name:'Missing'}),'student_already_exists');
 job=await stage([student({phone:'904441111',group_name:'Missing',parent_phone:'123'})],{duplicate_strategy:'skip'});
 preview=await validate(job);eq(preview.validation.ready,false); // Invalid cells are never excused by skip.
 job=await stage([student({phone:'904441111',group_name:'Missing'})],{duplicate_strategy:'skip'});
 preview=await validate(job);eq(preview.validation.skipped_rows,1);eq(preview.validation.balance_rows,0);eq(preview.validation.ready,true);
 await fails(student({group_name:'Other branch class'}),'group_name_unavailable',{create_missing_groups:true},true);
 await fails(student({group_name:'Inactive class'}),'group_name_unavailable',{create_missing_groups:true},true);
 await fails(student({group_name:'New class'}),'group_not_found');
 await fails(student({group_name:'New class'}),'group_creation_forbidden',{create_missing_groups:true});
 job=await stage([student({group_name:'New class'}),student({phone:'901234568',group_name:'NEW CLASS'})],{create_missing_groups:true});
 preview=await validate(job,actor,[branch],false,true);eq(preview.validation.new_groups,1);eq(preview.validation.ready,true);
 await fails(student({parent_phone:'908881111'}),'parent_identity_ambiguous');
 await fails(student({parent_phone:'909991111'}),'parent_identity_suspended');
 await query("insert into academy_student_guardian_relationships values($1,$2,$3,$4,'revoked','revoked')",[id(35),academy,id(20),id(33)]);
 await fails(student({phone:'904441111',balance:'0',parent_phone:'901111111'}),'existing_parent_relationship_requires_review',{duplicate_strategy:'reuse'});
 await query("insert into academy_classroom_memberships values($1,$2,$3,$4,'student','paused')",[id(40),academy,id(10),id(20)]);
 await fails(student({phone:'904441111',balance:'0'}),'existing_membership_requires_review',{duplicate_strategy:'reuse'});
 await query("update academy_classroom_memberships set status='active' where id=$1",[id(40)]);
 job=await stage([student({phone:'904441111',balance:'0'}),student({phone:'901234568',balance:'0'})],{duplicate_strategy:'reuse'});
 preview=await validate(job);eq(preview.validation.ready,true);eq(preview.validation.reuse_rows,1); // Existing active seat is not counted twice.
 job=await stage([student({phone:'901234568'}),student({phone:'901234569'})]);preview=await validate(job);
 eq(preview.validation.invalid_rows,2);eq((await values(job)).every(row=>row.validation_errors.includes('group_capacity_exceeded')),true);
 job=await stage([student({group_name:null}),student({group_name:null,phone:'+998901234567'})]);preview=await validate(job);
 eq(preview.validation.invalid_rows,2);eq((await values(job)).every(row=>row.validation_errors.includes('file_identity_ambiguous')),true);
 job=await stage([student({group_name:null})],{currency:'USD'});await reject(()=>validate(job),/Academy currency/);
 const baseline=(await query('select (select count(*) from academy_contacts)::int contacts,(select count(*) from academy_guardians)::int guardians,(select count(*) from academy_classrooms)::int groups,(select count(*) from academy_classroom_memberships)::int memberships'))[0];
 eq(baseline,{contacts:5,guardians:4,groups:3,memberships:1});
 console.log('PASS: branch/identity/capacity/consent reference qualification');
 const large=Array.from({length:5000},(_,i)=>student({full_name:`Student ${i+1}`,phone:String(910000000+i),group_name:null,balance:'0'}));
 job=await stage(large);const started=performance.now();preview=await validate(job);
 eq(preview.validation.total_rows,5000);eq(preview.validation.create_rows,5000);eq(preview.validation.invalid_rows,0);
 console.log(JSON.stringify({suite:'student-import-preview',database:native?'native PostgreSQL 17':'PGlite',checks,rows:5000,localPreviewMilliseconds:Math.round(performance.now()-started),productionTouched:false}));
}finally{await db.close();}
