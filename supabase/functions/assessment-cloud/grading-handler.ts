import {ContractError,hash,object,text,uuid} from '../../../packages/assessment-core/src/mod.ts';
import {gradeBundle,scoreUnits} from '../../../packages/assessment-core/src/grading.ts';
export interface GradingRepository {
 user(token:string):Promise<string|null>;
 read(actor:string,tenant:string,kind:string,id:string|null,after:string|null,limit:number):Promise<unknown>;
 command(actor:string,tenant:string,key:string,action:string,data:Record<string,unknown>):Promise<unknown>;
 claim(limit:number):Promise<unknown>;bundle(tenant:string,attempt:string,generation:number,lease:string):Promise<unknown>;
 receipt(tenant:string,attempt:string,generation:number):Promise<unknown>;
 commit(tenant:string,attempt:string,generation:number,lease:string,report:unknown):Promise<unknown>;
}
function integer(value:unknown,min:number,max:number){if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw new ContractError('invalid_number',`Expected an integer from ${min} to ${max}`);return value;}
function digest(value:unknown){const string=text(value,'Review hash',64);if(!/^[a-f0-9]{64}$/.test(string))throw new ContractError('invalid_review_hash','Use the current review hash');return string;}
export function createGradingHandler(repository:GradingRepository,allowedOrigins:string[],workerSecret:string){
 return async(req:Request):Promise<Response>=>{
  const requestId=crypto.randomUUID(),origin=req.headers.get('origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','X-Request-ID':requestId,'Vary':'Origin'};
  if(origin&&allowedOrigins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify({...data,request_id:requestId}),{status,headers});
  try{
   if(origin&&!allowedOrigins.includes(origin))throw new ContractError('origin_denied','Origin denied',403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,idempotency-key'}});
   const url=new URL(req.url),path=url.pathname.slice(url.pathname.indexOf('/assessment-cloud/grading')+'/assessment-cloud/grading'.length).replace(/^\//,'');
   if(!['GET','POST'].includes(req.method))throw new ContractError('method_not_allowed','Method not allowed',405);
   async function body(){const content=await req.text();if(new TextEncoder().encode(content).length>200000)throw new ContractError('payload_too_large','Grading request exceeds 200 KB',413);try{return object(JSON.parse(content));}catch{throw new ContractError('invalid_json','Expected a JSON object',400);}}
   if(path==='internal'&&req.method==='POST'){
    if(workerSecret.length<32)throw new ContractError('grading_unconfigured','The grading worker is not configured',503);
    const left=await hash(req.headers.get('x-assessment-grading-key')??''),right=await hash(workerSecret);let difference=0;for(let i=0;i<left.length;i++)difference|=left.charCodeAt(i)^right.charCodeAt(i);if(difference)throw new ContractError('worker_required','A trusted grading worker is required',403);
    const payload=await body(),data=object(payload.data);
    if(payload.action==='job.claim')return reply(200,{data:await repository.claim(integer(data.limit,1,100))});
    if(payload.action!=='job.process')throw new ContractError('unknown_action','Unknown grading worker action');
    const tenant=uuid(data.tenant_id),attempt=uuid(data.attempt_id),generation=integer(data.generation,1,1000000),lease=uuid(data.lease_token);
    const prior=await repository.receipt(tenant,attempt,generation);if(prior)return reply(200,{data:prior});
    const input=await repository.bundle(tenant,attempt,generation,lease),report=gradeBundle(input);
    // Private scoring keys stay inside the Edge/database boundary; the queue receives only metadata receipts.
    return reply(200,{data:await repository.commit(tenant,attempt,generation,lease,report)});
   }
   const token=/^Bearer (\S+)$/.exec(req.headers.get('authorization')??''),actor=token?await repository.user(token[1]):null;if(!actor)throw new ContractError('unauthorized','Sign in to continue',401);
   const tenant=uuid(url.searchParams.get('tenant_id'));
   if(req.method==='GET'){
    const routes:Record<string,string>={access:'access',worklist:'worklist',runs:'runs','candidate/results':'results'};
    const match=/^(tasks|runs|markers)\/([^/]+)$/.exec(path),kind=match?(match[1]==='tasks'?'task':match[1]==='runs'?'run':'markers'):routes[path];if(!kind)throw new ContractError('not_found','Grading resource not found',404);
    const limit=integer(Number(url.searchParams.get('limit')??100),1,100),after=url.searchParams.get('after');
    return reply(200,{data:await repository.read(actor,tenant,kind,match?uuid(match[2]):null,after?uuid(after):null,limit)});
   }
   if(path!=='commands')throw new ContractError('not_found','Grading route not found',404);
   const key=text(req.headers.get('idempotency-key'),'Command key',200);if(key.length<8)throw new ContractError('invalid_key','Use a command key of at least eight characters');
   const payload=await body(),action=text(payload.action,'Action',80),data=object(payload.data);let input:Record<string,unknown>;
   switch(action){
    case 'policy.configure':{const tolerance=scoreUnits(data.tolerance_percent)/1e6;if(tolerance>100)throw new ContractError('invalid_policy','Tolerance cannot exceed 100 percent');input={window_id:uuid(data.window_id),marker_count:integer(data.marker_count,1,2),tolerance_percent:tolerance};break;}
    case 'marker.assign':input={task_id:uuid(data.task_id),marker_id:uuid(data.marker_id),slot:integer(data.slot,1,2)};break;
    case 'marker.revoke':input={task_id:uuid(data.task_id),assignment_id:uuid(data.assignment_id),reason:text(data.reason,'Reason',5000)};break;
    case 'mark.submit':{const raw=object(data.criteria);if(!Object.keys(raw).length||Object.keys(raw).length>30)throw new ContractError('invalid_mark','Mark 1–30 rubric criteria');const criteria=Object.fromEntries(Object.entries(raw).map(([id,value])=>[text(id,'Criterion ID',80),scoreUnits(value)/1e6]));input={task_id:uuid(data.task_id),criteria,rationale:text(data.rationale,'Rationale',5000)};break;}
    case 'mark.adjudicate':input={task_id:uuid(data.task_id),score:scoreUnits(data.score)/1e6,review_hash:digest(data.review_hash),rationale:text(data.rationale,'Rationale',5000)};break;
    case 'grade.approve':input={run_id:uuid(data.run_id),review_hash:digest(data.review_hash)};break;
    case 'grade.release':{input={run_id:uuid(data.run_id)};if(data.feedback_review_hash!==undefined)input.feedback_review_hash=digest(data.feedback_review_hash);if(data.release_at!==undefined){const timestamp=text(data.release_at,'Release time',80);if(!/(Z|[+-]\d{2}:\d{2})$/.test(timestamp)||!Number.isFinite(Date.parse(timestamp)))throw new ContractError('invalid_timestamp','Use a release time with timezone');input.release_at=new Date(timestamp).toISOString();}break;}
    case 'grade.regrade':input={run_id:uuid(data.run_id),reason:text(data.reason,'Reason',5000)};break;
    default:throw new ContractError('unknown_action','Unknown grading action');
   }
   return reply(200,{data:await repository.command(actor,tenant,key,action,input)});
  }catch(cause){if(cause instanceof ContractError)return reply(cause.status,{code:cause.code,error:cause.message});console.error('assessment grading request failed',{request_id:requestId});return reply(500,{code:'internal_error',error:'The grading service could not complete this request'});}
 };
}
