import {assertEquals,assertThrows} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {allowedLegacyImportTypes,canUseLegacyImport,permittedLegacyImportHistory,normalizedLegacyImportMapped,legacyImportAmount,legacyImportRowNumber,LegacyImportInputError} from './legacy-import-policy.ts';
const access=(role:string,status='active')=>({tenant_id:'00000000-0000-4000-8000-000000000001',role,status});
Deno.test('general import permission does not grant staff/role or financial adjustment authority',()=>{
 assertEquals(allowedLegacyImportTypes(access('manager')),['contacts','leads','guardians','classrooms','enrollments']);
 for(const role of ['manager','counselor','teacher','assistant','receptionist','branch_manager','accountant','cashier']){
  assertEquals(canUseLegacyImport(access(role),'staff'),false);assertEquals(canUseLegacyImport(access(role),'balances'),false);
 }
 for(const role of ['owner','admin','center_admin']){assertEquals(canUseLegacyImport(access(role),'staff'),true);assertEquals(canUseLegacyImport(access(role),'balances'),true);}
 assertEquals(canUseLegacyImport(access('owner','suspended'),'staff'),false);assertEquals(canUseLegacyImport(access('owner'),'constructor'),false);
});
Deno.test('restricted imports and orphan rows/effects are excluded from history responses',()=>{
 const jobs=[{id:'student-job',import_type:'contacts'},{id:'finance-job',import_type:'balances'},{id:'staff-job',import_type:'staff'}];
 const rows=[{import_job_id:'student-job',mapped_data:{first_name:'Aziz'},academy_import_jobs:{import_type:'contacts'}},{import_job_id:'finance-job',mapped_data:{amount:'private'}},{import_job_id:'unknown-job'}];
 const effects=[{import_job_id:'staff-job',after_snapshot:{role:'admin'}},{import_job_id:'student-job',target_id:'owned-student'}];
 assertEquals(permittedLegacyImportHistory(access('manager'),jobs,rows,effects),{jobs:[jobs[0]],rows:[{import_job_id:'student-job',mapped_data:{first_name:'Aziz'}}],effects:[effects[1]]});
 assertEquals(permittedLegacyImportHistory(access('owner','revoked'),jobs,rows,effects),{jobs:[],rows:[],effects:[]});
});
Deno.test('imported inactive staff and closed-capacity groups preserve explicit values',()=>{
 assertEquals(normalizedLegacyImportMapped('staff',{is_active:'false'}).is_active,false);
 assertEquals(normalizedLegacyImportMapped('staff',{is_active:'нет'}).is_active,false);
 assertEquals(normalizedLegacyImportMapped('classrooms',{student_capacity:'0',is_active:false}),{student_capacity:0,is_active:false});
 for(const raw of [{student_capacity:'2.5'},{student_capacity:'-1'},{student_capacity:'2147483648'}])assertThrows(()=>normalizedLegacyImportMapped('classrooms',raw),LegacyImportInputError);
 assertThrows(()=>normalizedLegacyImportMapped('staff',{is_active:'perhaps'}),LegacyImportInputError);
 assertEquals(normalizedLegacyImportMapped('guardians',{status:'verified'}).status,'invited');
});
Deno.test('opening balances retain exact whole units without Number coercion',()=>{
 assertEquals(legacyImportAmount('9223372036854775807'),'9223372036854775807');assertEquals(legacyImportAmount('-9223372036854775807'),'-9223372036854775807');
 assertEquals(normalizedLegacyImportMapped('balances',{amount:'+800000'}).amount,'800000');
 for(const value of [0,1.5,9007199254740992,'1.5','1e3','9223372036854775808',false,null])assertThrows(()=>legacyImportAmount(value),LegacyImportInputError);
});
Deno.test('fractional, coerced or oversized row ordinals cannot overwrite another row',()=>{
 assertEquals(legacyImportRowNumber(1),1);assertEquals(legacyImportRowNumber('5000'),5000);
 for(const value of [0,1.5,5001,'1.5','1e3','1.0',true,[1],null])assertThrows(()=>legacyImportRowNumber(value),LegacyImportInputError);
});
