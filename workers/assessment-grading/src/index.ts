import {boundedJson} from '../../../packages/assessment-worker/src/http.ts';
import {ServiceError} from '../../../packages/assessment-worker/src/error.ts';
import {consumeGrading,dispatchGrading,type GradeJob} from './jobs.ts';
interface Env {SUPABASE_URL:string;SUPABASE_ANON_KEY:string;ASSESSMENT_GRADING_SECRET:string;GRADING_QUEUE:Queue<GradeJob>;GRADING_BATCH_LIMIT?:string}
function configured(env:Env){let url:URL;try{url=new URL(env.SUPABASE_URL);}catch{throw new ServiceError(503,'grading_unconfigured','The grading service is not configured');}if(url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash||!env.SUPABASE_ANON_KEY||env.ASSESSMENT_GRADING_SECRET?.length<32||!env.ASSESSMENT_GRADING_SECRET)throw new ServiceError(503,'grading_unconfigured','The grading service is not configured');}
async function call(env:Env,action:string,data:unknown){const {ok,status,payload}=await boundedJson<{data:unknown;code?:string;error?:string}>(`${env.SUPABASE_URL.replace(/\/$/,'')}/functions/v1/assessment-cloud/grading/internal`,{method:'POST',headers:{'Content-Type':'application/json',apikey:env.SUPABASE_ANON_KEY,'x-assessment-grading-key':env.ASSESSMENT_GRADING_SECRET},body:JSON.stringify({action,data})});if(!ok)throw new ServiceError(status,payload.code??'grading_unavailable','Canonical grading request failed');return payload.data;}
export default {
 async fetch(){return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});},
 async scheduled(_controller:ScheduledController,env:Env){configured(env);if(!env.GRADING_QUEUE)throw new ServiceError(503,'grading_unconfigured','The grading queue is not configured');const count=await dispatchGrading(()=>call(env,'job.claim',{limit:100}),env.GRADING_QUEUE,Number(env.GRADING_BATCH_LIMIT??200));console.log({event:'assessment.grading.dispatch',count});},
 async queue(batch:MessageBatch<unknown>,env:Env){configured(env);await consumeGrading(batch.messages,async job=>{await call(env,'job.process',job);},(outcome,code)=>console.log({event:'assessment.grading.consumer',outcome,code}));}
};
