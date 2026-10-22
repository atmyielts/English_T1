import {boundedJson} from '../../../packages/assessment-worker/src/http.ts';
import {ServiceError} from '../../../packages/assessment-worker/src/error.ts';
import {deliverBatch,type PreparedDelivery} from './deliver.ts';
interface Env {SUPABASE_URL:string;SUPABASE_ANON_KEY:string;ASSESSMENT_WEBHOOK_DISPATCH_SECRET:string;WEBHOOK_BATCH_LIMIT?:string}
function configured(env:Env){
  let url:URL;try{url=new URL(env.SUPABASE_URL);}catch{throw new ServiceError(503,'webhooks_unconfigured','The webhook service is not configured');}
  if(url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash||!env.SUPABASE_ANON_KEY||!env.ASSESSMENT_WEBHOOK_DISPATCH_SECRET||env.ASSESSMENT_WEBHOOK_DISPATCH_SECRET.length<32)throw new ServiceError(503,'webhooks_unconfigured','The webhook service is not configured');
}
async function call<T>(env:Env,path:string,data:unknown):Promise<T>{
  const {ok,status,payload}=await boundedJson<{data:T;code?:string}>(`${env.SUPABASE_URL.replace(/\/$/,'')}/functions/v1/assessment-cloud/webhooks/internal/${path}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:env.SUPABASE_ANON_KEY,'x-assessment-webhook-secret':env.ASSESSMENT_WEBHOOK_DISPATCH_SECRET},body:JSON.stringify(data)});
  if(!ok)throw new ServiceError(status,payload.code??'webhooks_unavailable','Canonical webhook request failed');
  return payload.data;
}
/** Cron-driven delivery: claim signed deliveries, POST them, report outcomes.
 * A crash between claim and report is safe: the lease expires and the
 * delivery is claimed again with the next attempt number. */
export default {
  async fetch(){return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});},
  async scheduled(_controller:ScheduledController,env:Env){
    configured(env);
    const limit=Math.min(100,Math.max(1,Number(env.WEBHOOK_BATCH_LIMIT??25)));
    const batch=await call<PreparedDelivery[]>(env,'claim',{limit});
    const outcomes=await deliverBatch(batch,fetch);
    let delivered=0,failed=0;
    for(const outcome of outcomes){
      try{await call(env,'report',outcome);if(outcome.error===null)delivered++;else failed++;}
      catch(cause){failed++;console.log({event:'assessment.webhooks.report_failed',code:cause instanceof ServiceError?cause.code:'unknown'});}
    }
    console.log({event:'assessment.webhooks.dispatch',claimed:batch.length,delivered,failed});
  },
};
