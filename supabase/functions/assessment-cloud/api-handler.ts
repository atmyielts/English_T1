import {ContractError,object,text,uuid} from '../../../packages/assessment-core/src/mod.ts';
/** Institution integration API: client-credentials tokens, scoped v1 reads and
 * registration writes, and staff management of API clients. The database owns
 * scopes, creator authority, revocation and idempotency. */
export const API_VERSION='2026-10-22';
export const API_SCOPES=['events:read','registrations:read','registrations:write','results:read'] as const;
export interface ApiRepository {
  user(token:string):Promise<string|null>;
  clientCommand(actor:string,tenant:string,key:string,action:string,data:Record<string,unknown>):Promise<Record<string,unknown>>;
  clientList(actor:string,tenant:string):Promise<unknown>;
  issue(client:string,secretHash:string,tokenHash:string):Promise<{expires_at:string;scopes:string[];tenant_id:string}>;
  read(tokenHash:string,kind:string,filter:string|null,after:string|null,limit:number):Promise<{data:unknown[];next_after:string|null}>;
  command(tokenHash:string,key:string,action:string,data:Record<string,unknown>):Promise<unknown>;
}
export const sha256=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
const random=(prefix:string)=>prefix+btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function scopes(value:unknown){
  if(!Array.isArray(value)||!value.length||new Set(value).size!==value.length||value.some(scope=>!(API_SCOPES as readonly unknown[]).includes(scope)))throw new ContractError('invalid_scopes','Choose one or more supported scopes.');
  return [...value].sort();
}
export function createApiHandler(repository:ApiRepository,origins:string[],options:{enabled:boolean}){
  return async(req:Request)=>{
    const origin=req.headers.get('origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin','X-Request-ID':crypto.randomUUID(),'Schood-Api-Version':API_VERSION};
    if(origin&&origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
    const reply=(status:number,value:unknown)=>Response.json(value,{status,headers});
    try{
      if(origin&&!origins.includes(origin))throw new ContractError('origin_denied','Origin denied',403);
      if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,idempotency-key'}});
      if(!options.enabled)throw new ContractError('api_disabled','The integration API is not enabled for this service yet.',503);
      const url=new URL(req.url),path=url.pathname.split('/assessment-cloud/')[1]??'';
      // Client credentials (RFC 6749 §4.4) with HTTP Basic or form fields.
      if(path==='oauth/token'){
        if(req.method!=='POST')throw new ContractError('method_not_allowed','Method not allowed',405);
        const form=new URLSearchParams(await req.text()),basic=/^Basic (\S+)$/.exec(req.headers.get('authorization')??'')?.[1];
        let id=form.get('client_id')??'',secret=form.get('client_secret')??'';
        if(basic){try{const [user,pass]=atob(basic).split(':');id=decodeURIComponent(user);secret=decodeURIComponent(pass??'');}catch{throw new ContractError('invalid_client','Client authentication failed.',401);}}
        if(form.get('grant_type')!=='client_credentials')throw new ContractError('unsupported_grant_type','Use grant_type=client_credentials.',400);
        if(!/^sk_[A-Za-z0-9_-]{43}$/.test(secret))throw new ContractError('invalid_client','Client authentication failed.',401);
        const token=random('at_');
        try{
          const issued=await repository.issue(uuid(id),await sha256(secret),await sha256(token));
          return reply(200,{access_token:token,token_type:'Bearer',expires_in:Math.max(0,Math.round((Date.parse(issued.expires_at)-Date.now())/1000)),scope:issued.scopes.join(' ')});
        }catch(cause){if(cause instanceof ContractError&&cause.status<500)throw new ContractError('invalid_client','Client authentication failed.',401);throw cause;}
      }
      if(path.startsWith('v1/')){
        const bearer=/^Bearer (at_[A-Za-z0-9_-]{43})$/.exec(req.headers.get('authorization')??'')?.[1];
        if(!bearer)throw new ContractError('invalid_token','Send a valid bearer access token.',401);
        const tokenHash=await sha256(bearer),resource=path.slice(3);
        if(req.method==='GET'&&['registrations','results','events'].includes(resource)){
          const limit=Number(url.searchParams.get('limit')??100),after=url.searchParams.get('after');
          if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw new ContractError('invalid_page','Choose a page of 1–500 records.');
          if(after!==null&&!(resource==='events'?/^\d{1,18}$/.test(after):/^[0-9a-f-]{36}$/i.test(after)))throw new ContractError('invalid_page','Use next_after from the previous page.');
          const page=await repository.read(tokenHash,resource,url.searchParams.has('window_id')?uuid(url.searchParams.get('window_id')):null,after,limit);
          return reply(200,page);
        }
        if(req.method==='POST'&&resource==='registrations'){
          const key=text(req.headers.get('idempotency-key'),'Idempotency-Key',200);if(key.length<8)throw new ContractError('invalid_key','Idempotency-Key is too short.');
          const body=object(await req.json());
          return reply(201,{data:await repository.command(tokenHash,key,'registration.create',{window_id:uuid(body.window_id),candidate_id:uuid(body.candidate_id)})});
        }
        throw new ContractError('not_found','API resource not found',404);
      }
      // Staff management of clients.
      if(!path.startsWith('api-clients'))throw new ContractError('not_found','API resource not found',404);
      const token=/^Bearer (\S+)$/.exec(req.headers.get('authorization')??'')?.[1],actor=token?await repository.user(token):null;
      if(!actor)throw new ContractError('unauthorized','Sign in to continue',401);
      const tenant=uuid(url.searchParams.get('tenant_id'));
      if(req.method==='GET'&&path==='api-clients')return reply(200,{data:await repository.clientList(actor,tenant)});
      if(req.method!=='POST'||path!=='api-clients/commands')throw new ContractError('not_found','API resource not found',404);
      const key=text(req.headers.get('idempotency-key'),'Request key',200);if(key.length<8)throw new ContractError('invalid_key','Request key is too short.');
      const body=object(await req.json()),data=object(body.data),action=String(body.action);
      let input:Record<string,unknown>,secret:string|null=null;
      const revision=()=>{const value=Number(data.revision);if(!Number.isSafeInteger(value)||value<1)throw new ContractError('invalid_revision','Refresh the client and try again.');return value;};
      switch(action){
        case 'client.create':{const name=text(data.name,'Client name',120).trim();if(!name)throw new ContractError('invalid_name','Name the integration.');secret=random('sk_');input={name,scopes:scopes(data.scopes),secret_hash:await sha256(secret),hint:secret.slice(-4)};break;}
        case 'client.rotate':secret=random('sk_');input={client_id:uuid(data.client_id),revision:revision(),secret_hash:await sha256(secret),hint:secret.slice(-4)};break;
        case 'client.update':input={client_id:uuid(data.client_id),revision:revision(),scopes:scopes(data.scopes)};break;
        case 'client.revoke':input={client_id:uuid(data.client_id),revision:revision()};break;
        default:throw new ContractError('unknown_action','Unknown API client action');
      }
      const {secret_check:check,...result}=await repository.clientCommand(actor,tenant,key,action,input);
      if(!secret)return reply(200,{data:result});
      return reply(200,{data:check===input.secret_hash?{...result,client_secret:secret}:{...result,client_secret_unavailable:true}});
    }catch(cause){
      if(cause instanceof ContractError)return reply(cause.status,{code:cause.code,error:cause.message});
      console.error('Integration API request failed',cause instanceof Error?cause.name:'unknown');
      return reply(500,{code:'api_unavailable',error:'The integration API is temporarily unavailable.'});
    }
  };
}
