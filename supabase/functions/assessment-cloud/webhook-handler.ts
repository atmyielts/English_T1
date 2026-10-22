import {ContractError,object,text,uuid} from '../../../packages/assessment-core/src/mod.ts';
import {signWebhook,webhookEvents,webhookUrl,WEBHOOK_SIGNATURE_HEADER} from '../../../packages/assessment-core/src/webhooks.ts';
import {WebhookSecretBox} from './webhook-secrets.ts';
export interface WebhookRepository {
  user(token:string):Promise<string|null>;
  command(actor:string,tenant:string,key:string,action:string,data:Record<string,unknown>):Promise<Record<string,unknown>>;
  read(actor:string,tenant:string,kind:'endpoints'|'deliveries',endpoint:string|null,before:string|null,beforeId:string|null,limit:number):Promise<unknown>;
  claim(limit:number):Promise<ClaimedDelivery[]>;
  report(delivery:string,lease:string,status:number,error:string|null,retrySeconds:number):Promise<unknown>;
}
export interface ClaimedDelivery {delivery_id:string;lease_token:string;attempt:number;url:string;secret_ciphertext:string;previous_secret_ciphertext:string|null;event:{id:string;type:string;sequence:number;tenant_id:string;occurred_at:string;data:unknown}}
export interface WebhookOptions {enabled:boolean;box:WebhookSecretBox|null;dispatchSecret:string;now?:()=>number}
const constantTimeEqual=(a:string,b:string)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
/** Staff management plus the internal delivery plane used by the webhook Worker. */
export function createWebhookHandler(repository:WebhookRepository,origins:string[],options:WebhookOptions){
  const now=options.now??(()=>Date.now());
  return async(req:Request)=>{
    const origin=req.headers.get('origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin','X-Request-ID':crypto.randomUUID()};
    if(origin&&origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
    const reply=(status:number,value:unknown)=>Response.json(value,{status,headers});
    try{
      if(origin&&!origins.includes(origin))throw new ContractError('origin_denied','Origin denied',403);
      if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,idempotency-key'}});
      const url=new URL(req.url),path=url.pathname.split('/assessment-cloud/webhooks/')[1]??'';
      if(path.startsWith('internal/')){
        // Worker-only. Constant-time shared secret; disabled or unconfigured means no work.
        const supplied=req.headers.get('x-assessment-webhook-secret')??'';
        if(req.method!=='POST'||!options.dispatchSecret||!constantTimeEqual(supplied,options.dispatchSecret))throw new ContractError('forbidden','Forbidden',403);
        if(!options.enabled||!options.box)return reply(200,{data:[]});
        const body=object(await req.json());
        if(path==='internal/claim'){
          const limit=Number(body.limit??25);if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new ContractError('invalid_limit','Claim 1–100 deliveries.');
          const claimed=await repository.claim(limit),timestamp=Math.floor(now()/1000),prepared=[];
          for(const item of claimed){
            const secrets=[await options.box.open(item.secret_ciphertext),...(item.previous_secret_ciphertext?[await options.box.open(item.previous_secret_ciphertext)]:[])];
            const payload=JSON.stringify({id:item.event.id,type:item.event.type,sequence:item.event.sequence,created_at:item.event.occurred_at,tenant_id:item.event.tenant_id,data:item.event.data});
            prepared.push({delivery_id:item.delivery_id,lease_token:item.lease_token,attempt:item.attempt,url:item.url,body:payload,headers:{'Content-Type':'application/json','User-Agent':'Schood-Webhooks/1','Schood-Event-Id':item.event.id,'Schood-Event-Type':item.event.type,'Schood-Delivery-Attempt':String(item.attempt),[WEBHOOK_SIGNATURE_HEADER]:await signWebhook(secrets,timestamp,payload)}});
          }
          return reply(200,{data:prepared});
        }
        if(path==='internal/report'){
          const status=Number(body.status),retry=Number(body.retry_seconds??60);
          if(!Number.isSafeInteger(status)||status<0||status>999||!Number.isSafeInteger(retry))throw new ContractError('invalid_report','Report an HTTP status and retry delay.');
          const error=body.error===undefined||body.error===null?null:String(body.error).slice(0,500);
          return reply(200,{data:await repository.report(uuid(body.delivery_id),uuid(body.lease_token),status,error,retry)});
        }
        throw new ContractError('not_found','Webhook resource not found',404);
      }
      if(!['GET','POST'].includes(req.method))throw new ContractError('method_not_allowed','Method not allowed',405);
      const token=/^Bearer (\S+)$/.exec(req.headers.get('authorization')??'')?.[1],actor=token?await repository.user(token):null;
      if(!actor)throw new ContractError('unauthorized','Sign in to continue',401);
      const tenant=uuid(url.searchParams.get('tenant_id'));
      if(req.method==='GET'){
        if(path!=='endpoints'&&path!=='deliveries')throw new ContractError('not_found','Webhook resource not found',404);
        const limit=Number(url.searchParams.get('limit')??50),before=url.searchParams.get('before');
        if(!Number.isSafeInteger(limit)||limit<1||limit>100||(before!==null&&Number.isNaN(Date.parse(before))))throw new ContractError('invalid_webhook_page','Choose a page of 1–100 deliveries.');
        return reply(200,{data:await repository.read(actor,tenant,path,url.searchParams.has('endpoint_id')?uuid(url.searchParams.get('endpoint_id')):null,before,url.searchParams.has('before_id')?uuid(url.searchParams.get('before_id')):null,limit)});
      }
      if(path!=='commands')throw new ContractError('not_found','Webhook resource not found',404);
      if(!options.enabled||!options.box)throw new ContractError('webhooks_disabled','Webhooks are not enabled for this service yet.',503);
      const key=text(req.headers.get('idempotency-key'),'Request key',200);if(key.length<8)throw new ContractError('invalid_key','Request key is too short.');
      const body=object(await req.json()),data=object(body.data),action=String(body.action);
      let input:Record<string,unknown>,secret:string|null=null,sealed='';
      switch(action){
        case 'endpoint.create':secret=WebhookSecretBox.generate();sealed=await options.box.seal(secret);input={url:webhookUrl(data.url),events:webhookEvents(data.events),secret_ciphertext:sealed};break;
        case 'endpoint.update':input={endpoint_id:uuid(data.endpoint_id),revision:Number(data.revision),events:webhookEvents(data.events)};break;
        case 'endpoint.rotate':secret=WebhookSecretBox.generate();sealed=await options.box.seal(secret);input={endpoint_id:uuid(data.endpoint_id),revision:Number(data.revision),secret_ciphertext:sealed};break;
        case 'endpoint.disable':input={endpoint_id:uuid(data.endpoint_id),revision:Number(data.revision)};break;
        case 'delivery.replay':input={delivery_id:uuid(data.delivery_id)};break;
        default:throw new ContractError('unknown_action','Unknown webhook action');
      }
      if('revision' in input&&(!Number.isSafeInteger(input.revision)||Number(input.revision)<1))throw new ContractError('invalid_revision','Refresh the endpoint and try again.');
      const {secret_check:check,...result}=await repository.command(actor,tenant,key,action,input);
      // Reveal the secret only when the stored ciphertext is the one this request
      // sealed. A replayed key returns the original receipt; its secret was shown
      // once already and cannot be recovered, so the endpoint must be rotated.
      if(!secret)return reply(200,{data:result});
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sealed))),byte=>byte.toString(16).padStart(2,'0')).join('');
      return reply(200,{data:check===digest?{...result,signing_secret:secret}:{...result,signing_secret_unavailable:true}});
    }catch(cause){
      if(cause instanceof ContractError)return reply(cause.status,{code:cause.code,error:cause.message});
      console.error('Webhook request failed',cause instanceof Error?cause.name:'unknown');
      return reply(500,{code:'webhook_unavailable',error:'Webhook service is temporarily unavailable.'});
    }
  };
}
