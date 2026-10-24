// Client for the academy-learning edge function (Homework OS and Courses).
import {academyActorSession,StaffRequestError} from './staffRequest';

const root=String(import.meta.env.VITE_SUPABASE_URL??'').replace(/\/$/,''),anon=String(import.meta.env.VITE_SUPABASE_ANON_KEY??'');

export type HomeworkPlan={billing_enforced:boolean;audience:'center'|'independent';center_tier:string|null;teacher_tier:string|null;teacher_plan_ends_at:string|null;
 paid:{homework:boolean;courses:boolean;homework_ai:boolean};allowed:{homework:boolean;courses:boolean;homework_ai:boolean}};
export type HomeworkSettings={premark_enabled:boolean;digest_enabled:boolean;telegram_handin_enabled:boolean};
export type TeachingPlan={id:string;name:string;amount:number;currency:string;duration_days:number|null;is_active:boolean;metadata:{features?:string[];placeholder_price?:boolean;billing_period?:'monthly'|'annual'}|null};
export type HomeworkOverview={plan:HomeworkPlan;settings:HomeworkSettings;flags:{telegram_handin:boolean;premark:boolean;digest:boolean};
 can:{review:boolean;reports:boolean;manage:boolean};waiting:number;teaching_plans:TeachingPlan[]};
export type HomeworkFile={filename:string|null;mime_type:string|null;size_bytes?:number|null;url:string|null};
export type Mistake={tag:string;excerpt:string|null;correction:string|null;explanation:string|null;source?:'ai'|'teacher'};
export type AiMark={id:string;status:string;suggested_score:number|null;max_score:number|null;rubric_scores:Record<string,number>;summary:string|null;
 strengths:string[];improvements:string[];mistakes:Mistake[];confidence:number|null;skip_reason:string|null;model:string|null};
export type RubricCriterion={id:string;title:string;max:number};
export type QueueSubmission={kind:'submission';submission:{id:string;attempt_number:number;status:string;submitted_at:string|null;submission_content:string|null;submission_url:string|null;max_score:number|null;source:string;files:HomeworkFile[]};
 assignment:{id?:string;title?:string;description?:string|null;due_at?:string|null;max_score?:number|null;rubric_id?:string|null};
 rubric:{id:string;title:string;parsed:RubricCriterion[]|null}|null;student:{id:string;name:string};classroom:{id:string;name:string};ai:AiMark|null;
 signals:{signal:string;severity:'info'|'review';detail:Record<string,unknown>}[]};
export type QueueCorrection={kind:'correction';correction:{id:string;content:string|null;media:HomeworkFile[];created_at:string};
 assignment:{title?:string};student:{id:string;name:string};classroom:{id:string;name:string};mistakes:(Mistake&{id:string;status:string})[]};
export type QueueItem=QueueSubmission|QueueCorrection;
export type FunnelRow={classroom_id:string;classroom_name:string;assigned:number;opened:number;submitted:number;on_time:number;reviewed:number;returned:number;corrected:number;mastered:number;median_review_hours:number|null};
export type Funnel={from:string;to:string;assignments:number;classrooms:FunnelRow[];reviewers:{user_id:string;name:string;reviewed:number;median_review_hours:number|null}[]};
export type CourseModules={courses?:{id:string;title:string;status:string}[];modules:{id:string;title:string;position:number;status:string;unlock_rule:{type?:string;quiz_id?:string;min_percent?:number}}[];
 quizzes:{id:string;title:string;status:string}[]};

export async function homeworkRequest<T>(academy:string,actor:string,action:string,body:Record<string,unknown>={}):Promise<T>{
 if(!actor)throw new StaffRequestError('Sign in again to continue.',401);
 const send=async(refresh=false)=>{const session=await academyActorSession(actor,refresh);return fetch(root+'/functions/v1/academy-learning',{method:'POST',
  headers:{apikey:anon,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action,academy_id:academy,_expected_actor:actor,...body})});};
 let response=await send();if(response.status===401)response=await send(true);
 const value=await response.json().catch(()=>null);
 if(!response.ok)throw new StaffRequestError(typeof value?.error==='string'?value.error:'Homework could not load. Try again.',response.status);
 return value as T;
}
