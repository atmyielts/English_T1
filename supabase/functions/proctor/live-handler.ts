import {ContractError,hash,object,text,uuid} from '../../../packages/assessment-core/src/mod.ts';
import {liveCommand} from '../../../packages/assessment-core/src/live-proctor.ts';
export interface LiveRepository{
 user(token:string):Promise<string|null>;read(actor:string,tenant:string,session:string):Promise<unknown>;
 command(actor:string,tenant:string,key:string,action:string,data:Record<string,unknown>):Promise<unknown>;
 context(actor:string|null,tenant:string,id:string,touch:boolean):Promise<unknown>;
 report(tenant:string,id:string,action:string,data:Record<string,unknown>):Promise<unknown>;
}
async function input(req:Request){const reader=req.body?.getReader();if(!reader)throw new ContractError('invalid_live_request','Expected a live request.');const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8000){await reader.cancel();throw new ContractError('payload_too_large','Live authority request exceeds 8 KB.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}try{return object(JSON.parse(new TextDecoder().decode(bytes)));}catch{throw new ContractError('invalid_json','Expected a JSON object.');}}
export function createLiveHandler(repository:LiveRepository,origins:string[],config:{enabled:boolean;brokerSecret:string}){return async(req:Request)=>{
 const origin=req.headers.get('origin'),headers:Record<string,string>={'content-type':'application/json','cache-control':'no-store','vary':'Origin','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,apikey,content-type,idempotency-key'};if(origin&&origins.includes(origin))headers['access-control-allow-origin']=origin;
 const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers});
 try{
  if(origin&&!origins.includes(origin))throw new ContractError('origin_denied','Origin denied.',403);if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!config.enabled||config.brokerSecret.length<32)throw new ContractError('live_monitoring_unavailable','Live monitoring is not enabled in this environment.',503);
  const url=new URL(req.url),route=url.pathname.split('/proctor/live/')[1]??'',bearer=/^Bearer (\S+)$/.exec(req.headers.get('authorization')??'');
  if(route==='internal'&&req.method==='POST'){
   const left=await hash(req.headers.get('x-proctor-live-key')??''),right=await hash(config.brokerSecret);let different=0;for(let i=0;i<left.length;i++)different|=left.charCodeAt(i)^right.charCodeAt(i);if(different)throw new ContractError('live_broker_required','A trusted live broker is required.',403);
   const body=await input(req),tenant=uuid(body.tenant_id),id=uuid(body.id),data=object(body.data);
   if(body.action==='context'){const actor=bearer?await repository.user(bearer[1]):null;if(!actor)throw new ContractError('unauthorized','Sign in to continue.',401);return reply(200,{data:await repository.context(actor,tenant,id,data.touch===true)});}
   if(body.action==='system.context')return reply(200,{data:await repository.context(null,tenant,id,false)});
   if(body.action!=='report')throw new ContractError('invalid_live_action','Unsupported broker authority action.');
   const action=text(data.action,'Report action',40),source=object(data.data);let report:Record<string,unknown>;
   if(action==='allocated')report={provider_session_id:text(source.provider_session_id,'Provider session',200),provider_app_id:text(source.provider_app_id,'Provider application',200)};
   else if(action==='negotiated')report={mid:text(source.mid,'Media section',32),track_name:text(source.track_name,'Track name',100)};
   else if(action==='faulted')report={code:text(source.code,'Outcome code',80)};
   else if(['connected','closed'].includes(action))report={};
   else throw new ContractError('invalid_live_report','Unsupported provider report.');
   return reply(200,{data:await repository.report(tenant,id,action,report)});
  }
  const actor=bearer?await repository.user(bearer[1]):null;if(!actor)throw new ContractError('unauthorized','Sign in to continue.',401);const tenant=uuid(url.searchParams.get('tenant_id'));
  if(req.method==='GET'&&route==='sources')return reply(200,{data:await repository.read(actor,tenant,uuid(url.searchParams.get('session_id')))});
  if(req.method!=='POST'||route!=='commands')throw new ContractError('not_found','Live resource not found.',404);
  const body=await input(req),action=text(body.action,'Action',60),key=text(req.headers.get('idempotency-key'),'Request key',200);if(key.length<8)throw new ContractError('invalid_live_key','Use a stable connection request key.');
  return reply(200,{data:await repository.command(actor,tenant,key,action,liveCommand(action,body.data))});
 }catch(cause){return cause instanceof ContractError?reply(cause.status,{code:cause.code,error:cause.message}):reply(500,{code:'internal_error',error:'The live authority request could not be completed.'});}
};}
