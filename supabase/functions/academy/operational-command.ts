import {finishAcademyTeacherLesson,recordAcademyTeacherAttendance,startAcademyTeacherLesson} from '../_shared/academy-teacher-flow.ts';
import {LegacyImportCommandError} from './legacy-import-command.ts';
import {runBookingCommand} from './booking-command.ts';

type Row=Record<string,unknown>;
type Db={rpc:(name:string,args:Row)=>PromiseLike<{data:unknown;error:{code?:string}|null}>;from:(name:string)=>any};
export const operationalActions=new Set(['create_lead','create_lesson_session','teacher_lesson_start','teacher_lesson_attendance','teacher_lesson_finish']);
const fail=(code='')=>new LegacyImportCommandError(code==='42501'?403:code==='23505'?409:code.startsWith('22')||['23502','23503','23514','P0001'].includes(code)?400:503,
 code==='42501'?'Your current access does not cover this inquiry or assigned lesson.':code==='23505'?'This request belongs to a different change. Refresh and review it.':code.startsWith('22')||['23502','23503','23514','P0001'].includes(code)?'Review the inquiry, current lesson and attendance values.':'We could not confirm this change. Retry the same change.',!['42501','23505','23502','23503','23514','P0001'].includes(code)&&!code.startsWith('22'));
const text=(value:unknown,max:number)=>String(value??'').trim().slice(0,max)||null;
const integer=(value:unknown)=>value==null||value===''?null:Number.isSafeInteger(Number(value))?Number(value):null;

export async function runOperationalCommand(db:Db,academy:string,actor:string,command:string,input:Row){
 if(command==='create_lesson_session')return await runBookingCommand(db,academy,actor,input);
 const key=input.idempotency_key;
 if(!operationalActions.has(command)||typeof key!=='string'||!/^[A-Za-z0-9_.:-]{1,160}$/.test(key)||new TextEncoder().encode(JSON.stringify(input)).byteLength>60000)throw new LegacyImportCommandError(400,'Review this change and its retry key.');
 if(input._expected_actor!=null&&input._expected_actor!==actor)throw new LegacyImportCommandError(409,'Your account changed. Reopen this page.');
 let intent:Row;
 if(command==='create_lead'){
  intent={};
  for(const [field,max] of Object.entries({full_name:180,phone:80,telegram:100,email:240,parent_name:180,parent_phone:80,interested_course:180,branch_id:64,preferred_branch_id:64,preferred_schedule:240,preferred_lesson_time:20,currency:10,source_id:64,source_key:80,campaign:180,referral_source:180,notes:3000,assigned_user_id:64,responsible_user_id:64,next_follow_up_at:80}))intent[field]=text(input[field],max);
  intent.email=String(intent.email??'').toLowerCase()||null;intent.source_key=String(intent.source_key??'').toLowerCase()||null;intent.currency=String(intent.currency??'UZS').toUpperCase();
  for(const field of ['age','expected_price','estimated_probability'])intent[field]=integer(input[field]);
  intent.tags=Array.isArray(input.tags)?input.tags.slice(0,50).map(value=>text(value,100)).filter(Boolean):[];
 }else{
  intent={session_id:input.session_id};
  if(command==='teacher_lesson_attendance'){
   if(!Array.isArray(input.records)||input.records.length<1||input.records.length>500)throw new LegacyImportCommandError(400,'Choose between one and 500 attendance rows.');
   intent.records=input.records;
  }
  if(command==='teacher_lesson_finish'){
   if(!Array.isArray(input.coverage)||input.coverage.length>100)throw new LegacyImportCommandError(400,'Review at most 100 lesson objectives.');
   Object.assign(intent,{coverage:input.coverage,teacher_notes:input.teacher_notes??null,homework:input.homework,assign_homework:input.assign_homework!==false});
  }
 }
 let receipt:Row|null=null;
 const commit=async(args:Row={})=>{
  let response;try{response=await db.rpc('academy_operational_command',{p_academy:academy,p_actor:actor,p_command:command,p_payload:{intent,server_args:args},p_request_key:key});}catch{throw fail();}
  if(response.error)throw fail(response.error.code);
  const row=response.data as Row|null;
  if(!row||row.actor_id!==actor||row.request_key!==key||row.command!==command||typeof row.replayed!=='boolean')throw fail();
  receipt=row;return row;
 };
 if(command==='create_lead')return await commit();
 let response;try{response=await db.rpc('academy_teacher_session_context',{p_academy:academy,p_actor:actor,p_session:input.session_id});}catch{throw fail();}
 if(response.error)throw fail(response.error.code);
 const context=response.data as Row|null;
 if(!context||context.actor_id!==actor||context.academy_id!==academy||typeof context.staff_id!=='string'||typeof context.classroom_id!=='string')throw fail();
 const access={tenant_id:academy,role:'teacher',staff_id:context.staff_id,classroom_ids:[context.classroom_id],branch_ids:typeof context.branch_id==='string'?[context.branch_id]:[],permissions:context.permissions as Record<string,boolean>};
 const expected=command==='teacher_lesson_start'?'academy_start_teacher_lesson':command==='teacher_lesson_attendance'?'academy_record_teacher_attendance_batch':'academy_finish_teacher_lesson';
 const scopedDb={from:db.from.bind(db),rpc:async(name:string,args:Row)=>{
  if(name!==expected)throw new Error('Unexpected lesson operation');
  const row=await commit(args);return {data:command==='teacher_lesson_start'?row.run:row,error:null};
 }};
 const task=command==='teacher_lesson_start'?startAcademyTeacherLesson:command==='teacher_lesson_attendance'?recordAcademyTeacherAttendance:finishAcademyTeacherLesson;
 try{await task(scopedDb,access,actor,{...intent,idempotency_key:key});}catch(error){
  if(error instanceof LegacyImportCommandError)throw error;
  const message=error instanceof Error?error.message:'';
  if(message==='Forbidden')throw fail('42501');
  if(['session_id and idempotency_key are required','session_id, attendance records, and idempotency_key are required','Every attendance row needs a student and valid status','Homework needs a title and valid due date'].includes(message))throw new LegacyImportCommandError(400,message);
  // A retry may follow an already committed action. A failed planning lookup
  // must retain that request key rather than release it as a rejected change.
  throw fail();
 }
 if(!receipt)throw fail();return receipt;
}
