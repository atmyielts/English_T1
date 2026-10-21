import {LegacyImportCommandError} from './legacy-import-command.ts';
type Row=Record<string,unknown>;
type Db={rpc:(name:string,args:Row)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const timestamp=(value:unknown)=>typeof value==='string'&&value.length<=40&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value));
export async function runTeacherRetentionRead(db:Db,academy:string,actor:string,input:Row){
 if(input._expected_actor!==actor)throw new LegacyImportCommandError(409,'Your account changed. Reopen this page.');
 if(!timestamp(input.from)||!timestamp(input.to)||Date.parse(String(input.to))<=Date.parse(String(input.from))||Date.parse(String(input.to))-Date.parse(String(input.from))>366*86400000||input.branch_id!=null&&!uuid.test(String(input.branch_id)))throw new LegacyImportCommandError(400,'Choose a recorded period of at most 366 days.');
 let response;try{response=await db.rpc('academy_teacher_retention_read',{p_academy:academy,p_actor:actor,p_from:new Date(String(input.from)).toISOString(),p_to:new Date(String(input.to)).toISOString(),p_branch:input.branch_id??null});}
 catch{throw new LegacyImportCommandError(503,'Unable to load teacher retention. Try again.',true);}
 if(response.error){const code=response.error.code??'';throw new LegacyImportCommandError(code==='42501'?403:code.startsWith('22')?400:503,code==='42501'?'Your current access does not cover this retention report.':code.startsWith('22')?'Choose a recorded period of at most 366 days.':'Unable to load teacher retention. Try again.',code!=='42501'&&!code.startsWith('22'));}
 const value=response.data as Row|null;
 const counts=['cohort_size','retained_students','paused_students','teacher_transfers','academy_departures','completed_students','retention_denominator','unresolved_changes','excluded_corrections'];
 if(!value||value.schema_version!==1||value.actor_id!==actor||value.academy_id!==academy||value.branch_id!==(input.branch_id??null)||!timestamp(value.from)||!timestamp(value.to)||Date.parse(String(value.from))!==Date.parse(String(input.from))||Date.parse(String(value.to))!==Date.parse(String(input.to))||typeof value.history_complete!=='boolean'||typeof value.has_more!=='boolean'||!Array.isArray(value.branches)||!Array.isArray(value.rows)||value.rows.length>500||value.covered_from!==null&&!timestamp(value.covered_from)||value.rows.some((row:Row)=>!row||typeof row.display_name!=='string'||!counts.every(key=>Number.isSafeInteger(row[key])&&Number(row[key])>=0)||!['teacher_retention_percent','academy_retention_percent'].every(key=>row[key]===null||typeof row[key]==='number'&&Number.isFinite(row[key])&&Number(row[key])>=0&&Number(row[key])<=100)))throw new LegacyImportCommandError(503,'Unable to confirm this retention report. Try again.',true);
 return value;
}
