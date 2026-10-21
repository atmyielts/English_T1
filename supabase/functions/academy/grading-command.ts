import {LegacyImportCommandError} from './legacy-import-command.ts';
type Row=Record<string,unknown>;
type Db={rpc:(name:string,args:Row)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
export const gradingActions=new Set(['grade_submission','submit_assignment']);
export async function runGradingCommand(db:Db,academy:string,actor:string,command:string,input:Row){
 const key=input.idempotency_key;
 if(!gradingActions.has(command)||typeof key!=='string'||!/^[A-Za-z0-9_.:-]{1,160}$/.test(key)||!Number.isSafeInteger(input.expected_attempt_number)||Number(input.expected_attempt_number)<0)throw new LegacyImportCommandError(409,'Refresh the gradebook and review the current submission attempt.');
 if(input._expected_actor!=null&&input._expected_actor!==actor)throw new LegacyImportCommandError(409,'Your account changed. Reopen this page.');
 const payload=Object.fromEntries(['submission_id','assignment_id','contact_id','session_id','score','max_score','notes','feedback','expected_attempt_number','expected_updated_at','expected_assignment_updated_at','expected_rubric_criteria'].filter(field=>input[field]!==undefined).map(field=>[field,input[field]]));
 if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>60000)throw new LegacyImportCommandError(400,'Review a smaller grading change.');
 let response;try{response=await db.rpc('academy_grading_command',{p_academy:academy,p_actor:actor,p_command:command,p_payload:payload,p_request_key:key});}catch{throw new LegacyImportCommandError(503,'We could not confirm this grade. Retry the same grading change.',true);}
 if(response.error){const code=response.error.code??'',invalid=code.startsWith('22')||['23502','23503','23514','P0001'].includes(code);throw new LegacyImportCommandError(code==='42501'?403:code==='23505'?409:invalid?400:503,code==='42501'?'Your current access does not cover this assignment and learner.':code==='23505'?'The assignment or submission attempt changed. Refresh and review it.':invalid?'Review the current score, maximum and rubric criteria.':'We could not confirm this grade. Retry the same grading change.',code!=='42501'&&code!=='23505'&&!invalid);}
 const row=response.data as Row|null,submission=row?.submission as Row|null;
 if(!row||row.actor_id!==actor||row.request_key!==key||row.command!==command||typeof row.replayed!=='boolean'||typeof submission?.id!=='string'||submission.academy_id!==academy||input.assignment_id!=null&&submission.assignment_id!==input.assignment_id||input.contact_id!=null&&submission.contact_id!==input.contact_id)throw new LegacyImportCommandError(503,'We could not confirm this grade. Retry the same grading change.',true);
 return row;
}
