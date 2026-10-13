import {buildAcademyPermissions,type MembershipRow,type AcademyAccessPermissions} from './access.ts';
export const legacyImportPermissions={contacts:'manageContacts',leads:'manageAdmissions',guardians:'manageGuardians',staff:'manageStaff',classrooms:'manageClassrooms',balances:'adjustFinance',enrollments:'manageRoster',attendance:'markAttendance'} as const satisfies Record<string,keyof AcademyAccessPermissions>;
export function canUseLegacyImport(access:MembershipRow,type:unknown){
 const permission=legacyImportPermissions[String(type) as keyof typeof legacyImportPermissions],permissions=buildAcademyPermissions(access);
 return access.status==='active'&&permissions.manageImports&&Boolean(permission)&&permissions[permission]===true;
}
export const allowedLegacyImportTypes=(access:MembershipRow)=>Object.keys(legacyImportPermissions).filter(type=>canUseLegacyImport(access,type));
export function permittedLegacyImportHistory(access:MembershipRow,jobs:Record<string,unknown>[],rows:Record<string,unknown>[],effects:Record<string,unknown>[]){
 const permitted=jobs.filter(job=>canUseLegacyImport(access,job.import_type)),ids=new Set(permitted.map(job=>String(job.id)));
 const stripParent=(item:Record<string,unknown>)=>Object.fromEntries(Object.entries(item).filter(([key])=>key!=='academy_import_jobs'));
 return {jobs:permitted,rows:rows.filter(row=>ids.has(String(row.import_job_id))).map(stripParent),effects:effects.filter(effect=>ids.has(String(effect.import_job_id))).map(stripParent)};
}
export class LegacyImportInputError extends Error{}
const invalid=(message:string):never=>{throw new LegacyImportInputError(message);};
export function legacyImportRowNumber(value:unknown):number{
 if(typeof value!=='number'&&(typeof value!=='string'||!/^\d+$/.test(value)))return invalid('Import row number must be an integer from 1 to 5,000.');
 const number=Number(value);if(!Number.isSafeInteger(number)||number<1||number>5000)return invalid('Import row number must be an integer from 1 to 5,000.');
 return number;
}
export function legacyImportBoolean(value:unknown,defaultValue=true){
 if(value==null||value==='')return defaultValue;if(typeof value==='boolean')return value;
 const text=String(value).trim().toLowerCase().replace(/[‘’']/g,'_');
 if(['true','yes','ha','да','1','on'].includes(text))return true;
 if(['false','no','yo_q','нет','0','off'].includes(text))return false;
 return invalid('Active status must be yes or no.');
}
export function legacyImportAmount(value:unknown):string{
 if(typeof value==='number'&&!Number.isSafeInteger(value))return invalid('Use exact integer text for an opening balance.');
 if(typeof value!=='string'&&typeof value!=='number')return invalid('Opening balances must be non-zero whole units.');
 const text=String(value).trim();if(!/^[+-]?\d{1,19}$/.test(text))return invalid('Opening balances must be non-zero whole units.');
 const amount=BigInt(text);if(amount===0n||amount>9223372036854775807n||amount< -9223372036854775807n)return invalid('Opening balance is outside the supported range.');
 return amount.toString();
}
export function normalizedLegacyImportMapped(type:string,raw:unknown):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return invalid('Mapped import columns are required.');
 const mapped=Object.fromEntries(Object.entries(raw));
 if(type==='staff'||type==='classrooms')mapped.is_active=legacyImportBoolean(mapped.is_active);
 if(type==='classrooms'&&mapped.student_capacity!=null&&String(mapped.student_capacity).trim()!==''){
  if(!/^[0-9]+$/.test(String(mapped.student_capacity))||!Number.isSafeInteger(Number(mapped.student_capacity))||Number(mapped.student_capacity)>2147483647)return invalid('Group capacity must be a non-negative integer.');
  mapped.student_capacity=Number(mapped.student_capacity);
 }else if(type==='classrooms')mapped.student_capacity=null;
 if(type==='balances')mapped.amount=legacyImportAmount(mapped.amount);
 // A spreadsheet is not proof of a parent's identity or Telegram ownership.
 if(type==='guardians')mapped.status='invited';
 return mapped;
}
