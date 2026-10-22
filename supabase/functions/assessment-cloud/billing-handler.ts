import {ContractError,object,text,uuid} from '../../../packages/assessment-core/src/mod.ts';
/** Institution plan and usage, plus Schood-support adjustments. The database
 * owns entitlement, quota, metering and authority; this only validates input. */
export interface BillingRepository {
  user(token:string):Promise<string|null>;
  summary(actor:string,tenant:string,before:string|null,beforeId:string|null,limit:number):Promise<unknown>;
  adjust(actor:string,tenant:string,key:string,data:Record<string,unknown>):Promise<unknown>;
  configure(actor:string,key:string,enforced:boolean,reason:string):Promise<unknown>;
}
export function createBillingHandler(repository:BillingRepository,origins:string[]){
  return async(req:Request)=>{
    const origin=req.headers.get('origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin','X-Request-ID':crypto.randomUUID()};
    if(origin&&origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
    const reply=(status:number,value:unknown)=>Response.json(value,{status,headers});
    try{
      if(origin&&!origins.includes(origin))throw new ContractError('origin_denied','Origin denied',403);
      if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,idempotency-key'}});
      if(!['GET','POST'].includes(req.method))throw new ContractError('method_not_allowed','Method not allowed',405);
      const token=/^Bearer (\S+)$/.exec(req.headers.get('authorization')??'')?.[1],actor=token?await repository.user(token):null;
      if(!actor)throw new ContractError('unauthorized','Sign in to continue',401);
      const url=new URL(req.url),path=url.pathname.split('/assessment-cloud/billing/')[1]??'';
      if(req.method==='GET'){
        if(path!=='summary')throw new ContractError('not_found','Billing resource not found',404);
        const limit=Number(url.searchParams.get('limit')??50);
        if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw new ContractError('invalid_billing_page','Choose a page of 1–200 usage records.');
        const before=url.searchParams.get('before');
        if(before!==null&&Number.isNaN(Date.parse(before)))throw new ContractError('invalid_billing_page','Use the cursor from the previous page.');
        return reply(200,{data:await repository.summary(actor,uuid(url.searchParams.get('tenant_id')),before,url.searchParams.has('before_id')?uuid(url.searchParams.get('before_id')):null,limit)});
      }
      const key=text(req.headers.get('idempotency-key'),'Request key',200);
      if(key.length<8)throw new ContractError('invalid_key','Request key is too short.');
      const raw=await req.text();
      if(new TextEncoder().encode(raw).length>8192)throw new ContractError('payload_too_large','Billing request exceeds 8 KB.',413);
      let body:Record<string,unknown>;
      try{body=object(JSON.parse(raw));}catch{throw new ContractError('invalid_json','Send a JSON billing request.');}
      const data=object(body.data),reason=text(data.reason,'Reason',2000);
      if(!reason.trim())throw new ContractError('invalid_adjustment','Record the reason for this change.');
      if(path==='adjustments'){
        if(!['release','restore'].includes(String(data.action)))throw new ContractError('invalid_adjustment','Choose release or restore.');
        return reply(200,{data:await repository.adjust(actor,uuid(url.searchParams.get('tenant_id')),key,{action:data.action,ledger_id:uuid(data.ledger_id),reason})});
      }
      if(path==='enforcement'){
        if(typeof data.enforced!=='boolean')throw new ContractError('invalid_configuration','Choose whether plan limits are enforced.');
        return reply(200,{data:await repository.configure(actor,key,data.enforced,reason)});
      }
      throw new ContractError('not_found','Billing resource not found',404);
    }catch(cause){
      if(cause instanceof ContractError)return reply(cause.status,{code:cause.code,error:cause.message});
      console.error('Billing request failed',cause instanceof Error?cause.name:'unknown');
      return reply(500,{code:'billing_unavailable',error:'Billing information is temporarily unavailable.'});
    }
  };
}
