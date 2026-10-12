import {academyAccessBranchIds,academyAccessClassroomIds,academyAccessScope,buildAcademyPermissions,type MembershipRow} from './access.ts';
type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message:string}|null}>};
export class TimetableGenerationError extends Error{
  constructor(public status:number,message:string,public run?:Record<string,unknown>){super(message);this.name='TimetableGenerationError';}
}
const safeFailures=new Set([
  'An active account is required','Timetable term not found','Only draft or active terms can generate lessons',
  'Term cannot exceed 370 days','Forbidden timetable branch','Generation key already used for another command',
  'Add at least one eligible timetable series before generating','A generation request supports at most 500 series',
  'Generation exceeds 50000 occurrences; split the term','Resolve timetable conflicts before committing',
  'Room conflict','Teacher is unavailable for this session','Room is unavailable for this session',
  'Room, teacher or classroom conflicts with another lesson',
  'Room belongs to another branch or is inactive','Physical and hybrid lessons require a room',
  'Session conflicts with an academic calendar closure','Academic calendar belongs to another branch',
  'Session room/classroom capacity is below active enrollment','Series, term or recurring slot configuration is invalid',
  'A lesson creation key is already in use without its occurrence identity',
]);
const retryMessage='The timetable could not be created. Refresh the preview and try again.';
const safeFailure=(message:unknown)=>typeof message==='string'&&safeFailures.has(message)?message:retryMessage;
export function publicTimetableRun(run:Record<string,unknown>){
  const evidence=run.evidence&&typeof run.evidence==='object'&&!Array.isArray(run.evidence)?run.evidence as Record<string,unknown>:null;
  return {...run,error:typeof run.error==='string'?safeFailure(run.error):null,
    ...(evidence?{evidence:{...evidence,conflicts:Array.isArray(evidence.conflicts)?evidence.conflicts.map(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item))return {reason:retryMessage};
      const conflict=item as Record<string,unknown>;return {...conflict,reason:safeFailure(conflict.reason)};
    }):[]}}:{}),
  };
}
export async function generateAcademyTimetable(db:Db,access:MembershipRow,actorId:string,body:Record<string,unknown>){
  if(!buildAcademyPermissions(access).manageAcademicOperations)throw new TimetableGenerationError(403,'Forbidden');
  if(typeof body.term_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.term_id))throw new TimetableGenerationError(400,'A valid term_id is required');
  const termId=body.term_id.toLowerCase();
  const preview=body.dry_run!==false;
  if(body.dry_run!==undefined&&typeof body.dry_run!=='boolean')throw new TimetableGenerationError(400,'Preview or commit mode must be a boolean');
  const rawKey=body.idempotency_key;
  if(rawKey!==undefined&&(typeof rawKey!=='string'||!rawKey.trim()||rawKey.length>180))throw new TimetableGenerationError(400,'A valid generation key is required');
  const branches=academyAccessBranchIds(access);
  if(branches!==null&&!branches.length)throw new TimetableGenerationError(403,'Forbidden');
  const {data,error}=await db.rpc('academy_generate_timetable',{
    p_academy_id:access.tenant_id,p_term_id:termId,p_actor_id:actorId,p_dry_run:preview,
    p_key:typeof rawKey==='string'?rawKey.trim():null,p_branch_ids:branches,
    p_classroom_ids:academyAccessScope(access)==='assigned_classrooms'?academyAccessClassroomIds(access):null,
  });
  if(error){
    // Provider SQL errors can contain schema names, query context and values.
    // Unknown failures also cannot prove that the command did not commit.
    const known=safeFailures.has(error.message);
    throw new TimetableGenerationError(error.message==='Forbidden timetable branch'?403:known?400:503,safeFailure(error.message));
  }
  const result=data&&typeof data==='object'&&!Array.isArray(data)?data as Record<string,unknown>:null;
  const run=result?.run&&typeof result.run==='object'?result.run as Record<string,unknown>:null;
  if(!run||run.academy_id!==access.tenant_id||run.term_id!==termId||run.dry_run!==preview||typeof run.status!=='string')throw new TimetableGenerationError(503,'Timetable generation returned an incomplete response');
  if(run.status==='failed'){
    const message=safeFailure(run.error);
    throw new TimetableGenerationError(409,message,publicTimetableRun(run));
  }
  if(run.status!==(preview?'preview_ready':'completed'))throw new TimetableGenerationError(503,'Timetable generation has not finished');
  return {...result,run:publicTimetableRun(run)};
}
