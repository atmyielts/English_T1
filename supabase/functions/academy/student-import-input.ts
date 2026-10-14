import {academyAccessBranchIds,buildAcademyPermissions,type MembershipRow} from './access.ts';
type Scalar=string|number|boolean|null;
export type StudentImportConfig={branch_id:string;source_filename:string;column_mapping:Record<string,string>;expected_rows:number;balance_convention:'credit_positive'|'debt_positive';currency:string;date_format:'iso'|'day_first'|'month_first';create_missing_groups:boolean;duplicate_strategy:'reject'|'skip'|'reuse'};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const fields=new Set(['full_name','first_name','last_name','phone','email','parent_phone','parent_name','group_name','balance','joined_on']);
export class StudentImportInputError extends Error{constructor(public status:number,message:string){super(message);this.name='StudentImportInputError';}}
const invalid=(message:string):never=>{throw new StudentImportInputError(400,message);};
export function decodeStudentImportConfig(input:unknown):StudentImportConfig{
  if(!record(input))return invalid('Choose import settings before uploading rows.');
  if(!uuid(input.branch_id))return invalid('Choose a valid branch.');
  if(typeof input.source_filename!=='string'||!input.source_filename.trim()||input.source_filename.length>300)return invalid('Choose a valid source filename.');
  if(!Number.isInteger(input.expected_rows)||Number(input.expected_rows)<1||Number(input.expected_rows)>5000)return invalid('Import files are limited to 5,000 rows per job.');
  if(typeof input.balance_convention!=='string'||!['credit_positive','debt_positive'].includes(input.balance_convention))return invalid('Choose whether positive balances mean prepaid credit or debt.');
  if(typeof input.currency!=='string'||!/^[A-Z]{3}$/.test(input.currency))return invalid('Choose a valid import currency.');
  if(typeof input.date_format!=='string'||!['iso','day_first','month_first'].includes(input.date_format))return invalid('Choose the source date format.');
  if(typeof input.create_missing_groups!=='boolean')return invalid('Choose how missing groups are handled.');
  if(typeof input.duplicate_strategy!=='string'||!['reject','skip','reuse'].includes(input.duplicate_strategy))return invalid('Choose how existing students are handled.');
  if(!record(input.column_mapping))return invalid('Map the source columns first.');
  const mapping:Record<string,string>={};
  for(const [field,heading] of Object.entries(input.column_mapping)){
    if(!fields.has(field)||typeof heading!=='string'||heading.length>180)return invalid('The column mapping contains an unsupported field.');
    if(heading.trim())mapping[field]=heading;
  }
  if((!mapping.full_name&&!mapping.first_name)||!mapping.phone)return invalid('Map student name and phone before uploading.');
  return {branch_id:input.branch_id.toLowerCase(),source_filename:input.source_filename.trim(),column_mapping:mapping,expected_rows:Number(input.expected_rows),
    balance_convention:input.balance_convention as StudentImportConfig['balance_convention'],currency:input.currency,date_format:input.date_format as StudentImportConfig['date_format'],
    create_missing_groups:input.create_missing_groups,duplicate_strategy:input.duplicate_strategy as StudentImportConfig['duplicate_strategy']};
}
export function decodeStudentImportRows(input:unknown,config:StudentImportConfig,offset:unknown){
  if(!Array.isArray(input)||input.length>200)return invalid('Upload no more than 200 rows in one batch.');
  if(!Number.isInteger(offset)||Number(offset)<0||Number(offset)+input.length>config.expected_rows)return invalid('The upload row range is invalid.');
  if(new TextEncoder().encode(JSON.stringify(input)).byteLength>2*1024*1024)return invalid('The upload batch is too large.');
  return input.map((raw,index)=>{
    if(!record(raw))return invalid('Each import row must contain source columns.');
    const source:Record<string,Scalar>={},mapped:Record<string,Scalar>={};
    for(const [field,heading] of Object.entries(config.column_mapping)){
      const value=Object.hasOwn(raw,heading)?raw[heading]:null;
      if(value!==null&&typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')return invalid('The file contains an unsupported cell value.');
      if(typeof value==='number'&&!Number.isFinite(value))return invalid('The file contains an unsupported cell value.');
      if(typeof value==='number'&&['balance','phone','parent_phone'].includes(field)&&!Number.isSafeInteger(value))return invalid('Store phone numbers and whole-unit balances as exact text or safe integers.');
      if(typeof value==='string'&&value.length>2000)return invalid('An import cell is too long.');
      Object.defineProperty(source,heading,{value:value as Scalar,enumerable:true,writable:true,configurable:true});mapped[field]=value as Scalar;
    }
    return {row_number:Number(offset)+index+1,source,mapped};
  });
}
export function studentImportAuthority(access:MembershipRow,config:StudentImportConfig){
  const permissions=buildAcademyPermissions(access);
  // The new capability is deliberately separate from staff/finance imports.
  if(access.status!=='active'||(!permissions.manageImports&&!(['receptionist','branch_manager'].includes(access.role)&&permissions.manageAdmissions)))throw new StudentImportInputError(403,'Forbidden');
  const branches=academyAccessBranchIds(access);
  if(branches!==null&&!branches.includes(config.branch_id))throw new StudentImportInputError(403,'Forbidden');
  if(config.create_missing_groups&&!permissions.manageClassrooms)throw new StudentImportInputError(403,'Creating missing groups requires classroom-management permission.');
  return {academy_id:access.tenant_id,branch_ids:branches,can_post_opening_balances:permissions.adjustFinance,can_create_groups:permissions.manageClassrooms};
}
