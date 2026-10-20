import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createNativeSessionDb} from './lib/academy-session-test-db.mjs';
const native=process.argv.includes('--native');
const db=native?await createNativeSessionDb():new PGlite();let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const settings={date_format:'iso',balance_convention:'credit_positive',currency:'UZS',as_of_date:'2026-10-12'};
const valid={full_name:'Aziz G‘ofirov',phone:'90 123-45-67',parent_phone:'+998 (90) 765-43-21',group_name:'IELTS A',balance:'800 000',joined_on:'2026-10-01'};
const normalize=async(patch={},format={})=>(await db.query('select academy_normalize_student_import_row($1::jsonb,$2::jsonb) as data',[JSON.stringify({...valid,...patch}),JSON.stringify({...settings,...format})])).rows[0].data;
try{
  await db.exec('create role anon;create role authenticated;create role service_role;');
  await db.exec(readFileSync(new URL('../supabase/migrations/20261012170000_academy_student_import_normalization.sql',import.meta.url),'utf8'));
  const result=await normalize();eq(result.errors,[]);eq(result.normalized,{first_name:'Aziz G‘ofirov',last_name:'',source_full_name:'Aziz G‘ofirov',phone:'+998901234567',parent_phone:'+998907654321',parent_name:null,email:null,group_name:'IELTS A',source_balance:'800000',ledger_amount:'-800000',currency:'UZS',joined_on:'2026-10-01'});
  eq((await normalize({first_name:'Мухаммаджафар',last_name:'Гофиров'})).normalized.first_name,'Мухаммаджафар');
  eq((await normalize({full_name:'李 明'})).errors,[]);
  eq((await normalize({phone:'0044 7700 900123'})).normalized.phone,'+447700900123');
  eq((await normalize({phone:901234567})).normalized.phone,'+998901234567');
  eq((await normalize({phone:'+998901234567',parent_phone:'901234567'})).errors,[]); // Shared household phones do not establish identity/consent.
  for(const phone of ['letters901234567','+99812','+998901234567999','12345','+001234567','90.1234567','998901234567 ext 5'])eq((await normalize({phone})).errors.includes('phone_invalid'),true);
  eq((await normalize({phone:9007199254740992})).errors.includes('phone_unsafe_number'),true);
  eq((await normalize({parent_phone:'123'})).errors.includes('parent_phone_invalid'),true);
  eq((await normalize({parent_name:'Ona',parent_phone:null})).errors.includes('parent_phone_required'),true);
  eq((await normalize({balance:'800,000'})).normalized.ledger_amount,'-800000');
  eq((await normalize({balance:'800\u00a0000'})).normalized.ledger_amount,'-800000');
  eq((await normalize({balance:'800\u202f000'})).normalized.ledger_amount,'-800000');
  eq((await normalize({balance:'-800000'})).normalized.ledger_amount,'800000');
  eq((await normalize({balance:'800000'},{balance_convention:'debt_positive'})).normalized.ledger_amount,'800000');
  eq((await normalize({balance:''})).normalized.ledger_amount,'0');
  eq((await normalize({balance:'9223372036854775807'})).normalized.ledger_amount,'-9223372036854775807');
  for(const balance of ['800000.5','8e5','800.000','800,00','800 00','1,000 000','800000 UZS','--800'])eq((await normalize({balance})).errors.includes('balance_invalid_integer'),true);
  eq((await normalize({balance:'9223372036854775808'})).errors.includes('balance_out_of_range'),true);
  eq((await normalize({balance:9007199254740992})).errors.includes('balance_unsafe_number'),true);
  eq((await normalize({balance:800000.5})).errors.includes('balance_unsafe_number'),true);
  eq((await normalize({joined_on:''})).normalized.joined_on,'2026-10-12');
  eq((await normalize({joined_on:'02/03/2026'},{date_format:'day_first'})).normalized.joined_on,'2026-03-02');
  eq((await normalize({joined_on:'02/03/2026'},{date_format:'month_first'})).normalized.joined_on,'2026-02-03');
  eq((await normalize({joined_on:'2.3.2026'},{date_format:'day_first'})).normalized.joined_on,'2026-03-02');
  eq((await normalize({joined_on:'2024-02-29'})).errors,[]);
  eq((await normalize({joined_on:'2026-02-29'})).errors.includes('join_date_invalid'),true);
  eq((await normalize({joined_on:'31/04/2026'},{date_format:'day_first'})).errors.includes('join_date_invalid'),true);
  eq((await normalize({joined_on:'02/03/2026'})).errors.includes('join_date_format_invalid'),true);
  eq((await normalize({joined_on:'2/3.2026'},{date_format:'day_first'})).errors.includes('join_date_format_invalid'),true);
  for(const full_name of ['12345','---','Aziz\nOther','x'.repeat(361)])eq((await normalize({full_name})).errors.includes('name_invalid'),true);
  eq((await normalize({full_name:true})).errors.includes('full_name_invalid_type'),true);
  eq((await normalize({email:'BAD ADDRESS'})).errors.includes('email_invalid'),true);
  eq((await normalize({email:' Aziz@Example.COM '})).normalized.email,'aziz@example.com');
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role};`);
    try{await assert.rejects(()=>normalize(),/permission denied/);checks++;}finally{await db.exec('reset role;');}
  }
  console.log(JSON.stringify({suite:'student-import-normalization',database:native?'native PostgreSQL 17':'PGlite',checks,productionTouched:false}));
}finally{await db.close();}
