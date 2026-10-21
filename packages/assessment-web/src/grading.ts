import {request} from './client';
import {ResponseJournal} from './journal';
import {GradeCommands,type GradeIntent} from './grade-command';
import {acknowledgeCommittedDraft} from './draft-store';
import {english,isWebKey,LocalizedError,messageText,type Translate} from './i18n/translate.ts';
export interface GradeAccess {can_mark:boolean;can_moderate:boolean;can_release:boolean;can_read_banks:boolean;can_write_items:boolean;can_approve_items:boolean;can_publish:boolean;can_manage_exams:boolean;can_manage_team?:boolean;can_manage_certificates?:boolean;can_read_analytics?:boolean}
export interface Criterion {id:string;title:string;descriptor:string;max_score:number}
export interface AnswerAsset {id:string;mime:string;kind:'image'|'audio'|'video'|'file';byte_length:number;state:'uploading'|'quarantined'|'ready'|'rejected'|'cancelled'}
export interface GradeTask {id:string;run_id:string;run_status:string;status:string;can_mark:boolean;can_adjudicate:boolean;can_assign?:boolean;required_markers?:number;tolerance_percent?:number;item:{type:string;prompt:string};rubric:{title:string;criteria:Criterion[]};response:unknown;answer_asset?:AnswerAsset|null;max_score:number;own_mark:{criteria:Record<string,number>;rationale:string;score:number;revision:number}|null;marks?:{marker_id:string;score:number;criteria:Record<string,number>;revision:number}[];review_hash?:string;assignments?:{id:string;marker_id:string;slot:number}[]}
export interface GradeRun {id:string;generation:number;status:string;ready:boolean;total:number|null;max_score:number;review_hash:string;can_approve:boolean;can_release:boolean;can_regrade:boolean;scores:{item_version_id:string;score:number|null;max_score:number;status:string}[]}
export interface ReleasedResult {attempt_id:string;generation:number;total:number;max_score:number;released_at:string;score_revision_id:string}
export async function openGradeCommands(tenant:string,actor:string){
 if(!navigator.locks)throw new LocalizedError('grading.locks');
 const scope=`grading:${tenant}:${actor}`,journal=await ResponseJournal.create(scope);
 const locking=async<T>(work:()=>Promise<T>):Promise<T>=>await navigator.locks.request(`schood-grade-commands:${scope}`,work);
 const commands=new GradeCommands({async pending(){const rows=await journal.pending();if(!rows.length)return null;const value=rows[0].response as {action:string;data:Record<string,unknown>};return {...value,key:rows[0].command_key};},async save(action,data){const entry=await journal.append(1,'grading-command',{action,data});return {action,data,key:entry.command_key};},acknowledge:()=>journal.acknowledge(1)},async intent=>{const {_draft,...data}=intent.data;const result=await request<Record<string,unknown>>('grading/commands',tenant,{action:intent.action,data},undefined,intent.key,actor),cleared=await acknowledgeCommittedDraft(_draft,tenant,actor);return {...result,device_draft_preserved:!cleared};},locking);
 return {commands,close:()=>journal.close()};
}
/** Known grading refusals are translated under `grading.code.<code>`. */
export function gradingProblem(cause:unknown,t:Translate=english){if(cause instanceof Error&&cause.name==='AbortError')return t('grading.problem.timeout');const code=(cause as {code?:string})?.code,key=`grading.code.${code}`;return code&&isWebKey(key)?t(key):messageText(cause,t,'grading.problem.failed');}
export const intentDescription=(intent:GradeIntent,t:Translate=english)=>{const key=`grading.intent.${intent.action}`;return t(isWebKey(key)?key:'grading.intent.other');};
