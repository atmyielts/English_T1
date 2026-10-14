import {assertEquals,assertThrows} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {decodeStudentImportConfig,decodeStudentImportRows,studentImportAuthority,StudentImportInputError} from './student-import-input.ts';
const academy='00000000-0000-4000-8000-000000000001',branch='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003';
const input={branch_id:branch,source_filename:'students.csv',expected_rows:201,column_mapping:{full_name:'Name',phone:'Phone',balance:'Balance'},balance_convention:'credit_positive',currency:'UZS',date_format:'iso',create_missing_groups:false,duplicate_strategy:'reject'};
Deno.test('import rows are derived from mapped source columns and cannot smuggle actor/capability/branch fields',()=>{
  const config=decodeStudentImportConfig(input),rows=decodeStudentImportRows([{Name:'Aziz',Phone:'901234567',Balance:'800000',branch_id:other,is_admin:true,Salary:'private unrelated column'}],config,200);
  assertEquals(rows,[{row_number:201,source:{Name:'Aziz',Phone:'901234567',Balance:'800000'},mapped:{full_name:'Aziz',phone:'901234567',balance:'800000'}}]);
  assertThrows(()=>decodeStudentImportConfig({...input,column_mapping:{...input.column_mapping,role:'Admin'}}),StudentImportInputError,'unsupported');
  const strange=decodeStudentImportConfig({...input,column_mapping:{full_name:'__proto__',phone:'constructor'}});
  const raw=JSON.parse('{"__proto__":"Aziz","constructor":"901234567"}');
  const selected=decodeStudentImportRows([raw],strange,0)[0].source;
  assertEquals(Object.hasOwn(selected,'__proto__'),true);assertEquals<unknown>(selected.constructor,'901234567');
});
Deno.test('complete identities and exact batch/file budgets are enforced before database access',()=>{
  for(const patch of [{branch_id:branch+'junk'},{expected_rows:5001},{expected_rows:0},{currency:'usd'},{balance_convention:'guess'},{date_format:'guess'},{create_missing_groups:'false'},
    {balance_convention:['credit_positive']},{date_format:['iso']},{duplicate_strategy:['reject']}])assertThrows(()=>decodeStudentImportConfig({...input,...patch}),StudentImportInputError);
  const config=decodeStudentImportConfig(input);
  assertThrows(()=>decodeStudentImportRows(Array(201).fill({}),config,0),StudentImportInputError,'200');
  assertThrows(()=>decodeStudentImportRows([{}],config,201),StudentImportInputError,'range');
  assertThrows(()=>decodeStudentImportRows([{Name:{secret:'data'}}],config,0),StudentImportInputError,'cell');
  assertThrows(()=>decodeStudentImportRows([{Name:'Aziz',Phone:'901234567',Balance:9007199254740992}],config,0),StudentImportInputError,'exact text');
  assertThrows(()=>decodeStudentImportRows([{Name:'Aziz',Phone:901234567.5}],config,0),StudentImportInputError,'exact text');
});
Deno.test('reception can prepare its branch but never inherits finance authority or a foreign branch',()=>{
  const config=decodeStudentImportConfig(input),access={tenant_id:academy,role:'receptionist',status:'active',branch_ids:[branch]};
  assertEquals(studentImportAuthority(access,config),{academy_id:academy,branch_ids:[branch],can_post_opening_balances:false,can_create_groups:false});
  assertThrows(()=>studentImportAuthority(access,{...config,branch_id:other}),StudentImportInputError,'Forbidden');
  assertThrows(()=>studentImportAuthority(access,{...config,create_missing_groups:true}),StudentImportInputError,'classroom');
  assertThrows(()=>studentImportAuthority({...access,role:'teacher'},config),StudentImportInputError,'Forbidden');
  assertThrows(()=>studentImportAuthority({...access,status:'disabled'},config),StudentImportInputError,'Forbidden');
});
