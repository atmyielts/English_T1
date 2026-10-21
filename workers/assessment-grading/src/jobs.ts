import {ServiceError} from '../../../packages/assessment-worker/src/error.ts';
export interface GradeJob {schema_version:'assessment.grading.job.v1';tenant_id:string;attempt_id:string;generation:number;lease_token:string}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function gradingJob(input:unknown):GradeJob{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new ServiceError(422,'invalid_grading_job','Invalid grading job');const row=input as Record<string,unknown>;
 if(row.schema_version!=='assessment.grading.job.v1'||!uuid.test(String(row.tenant_id))||!uuid.test(String(row.attempt_id))||!uuid.test(String(row.lease_token))||typeof row.generation!=='number'||!Number.isSafeInteger(row.generation)||row.generation<1||row.generation>1000000)throw new ServiceError(422,'invalid_grading_job','Invalid grading job');
 return {schema_version:'assessment.grading.job.v1',tenant_id:String(row.tenant_id),attempt_id:String(row.attempt_id),generation:row.generation,lease_token:String(row.lease_token)};
}
export interface GradeQueue {sendBatch(rows:{body:GradeJob;contentType:'json'}[]):Promise<unknown>}
export async function dispatchGrading(claim:()=>Promise<unknown>,queue:GradeQueue,maxBatches=200,now=()=>Date.now()){
 if(!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>200)throw new ServiceError(503,'invalid_dispatch_limit','Invalid grading dispatch limit');const start=now();let count=0;
 for(let i=0;i<maxBatches&&now()-start<50000;i++){const rows=await claim();if(!Array.isArray(rows)||rows.length>100)throw new ServiceError(502,'invalid_claim_batch','Invalid grading claim batch');if(!rows.length)break;await queue.sendBatch(rows.map(row=>({body:gradingJob(row),contentType:'json'})));count+=rows.length;if(rows.length<100)break;}return count;
}
export interface GradeMessage {body:unknown;attempts:number;ack():void;retry(options:{delaySeconds:number}):void}
export async function consumeGrading(messages:readonly GradeMessage[],process:(job:GradeJob)=>Promise<void>,metric:(outcome:string,code:string)=>void=()=>{}){
 let cursor=0;await Promise.all(Array.from({length:Math.min(8,messages.length)},async()=>{while(cursor<messages.length){const message=messages[cursor++];try{await process(gradingJob(message.body));message.ack();metric('processed','ok');}catch(cause){if(cause instanceof ServiceError&&cause.code==='invalid_grading_lease'){message.ack();metric('stale','invalid_grading_lease');}else{message.retry({delaySeconds:Math.min(30*2**Math.min(message.attempts,5),900)});metric('retry',cause instanceof ServiceError?cause.code:'grading_unavailable');}}}}));
}
