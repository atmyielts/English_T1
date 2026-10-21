import {boundedJson} from '../../../packages/assessment-worker/src/http.ts';
import {ServiceError} from '../../../packages/assessment-worker/src/error.ts';
import type {LiveDescription} from '../../../packages/assessment-core/src/live-proctor.ts';
export interface ProviderTrack{mid?:string;trackName?:string;sessionId?:string;location?:string;status?:string;errorCode?:string}
export interface ProviderReply{sessionId?:string;sessionDescription?:LiveDescription;requiresImmediateRenegotiation?:boolean;tracks?:ProviderTrack[];errorCode?:string}
export interface LiveProvider{readonly appId:string;create():Promise<string>;publish(session:string,trackName:string,mid:string,description:LiveDescription):Promise<ProviderReply>;subscribe(session:string,publisher:string,trackName:string):Promise<ProviderReply>;answer(session:string,description:LiveDescription):Promise<ProviderReply>;inspect(session:string):Promise<ProviderReply>;close(session:string,mids:string[]):Promise<ProviderReply>}
export class ProviderError extends ServiceError{constructor(readonly uncertain:boolean,code='live_provider_unavailable'){super(503,code,'The live media provider could not confirm this operation.');}}
const identifier=(value:string)=>{if(!/^[-a-zA-Z0-9_]{1,200}$/.test(value))throw new ProviderError(false,'invalid_provider_identifier');return encodeURIComponent(value);};
export class CloudflareSFU implements LiveProvider{
 constructor(readonly appId:string,private secret:string,private fetcher:typeof fetch=fetch){identifier(appId);if(secret.length<32)throw new ProviderError(false,'live_provider_unconfigured');}
 private async call(path:string,method:string,body?:unknown):Promise<ProviderReply>{
  let response;try{response=await boundedJson<ProviderReply>(`https://rtc.live.cloudflare.com/v1/apps/${identifier(this.appId)}/${path}`,{method,redirect:'manual',headers:{authorization:`Bearer ${this.secret}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})},this.fetcher,8000,100000);}catch{throw new ProviderError(method!=='GET');}
  if(!response.ok)throw new ProviderError(method!=='GET'&&response.status>=500,'live_provider_rejected');
  if(!response.payload||typeof response.payload!=='object'||Array.isArray(response.payload))throw new ProviderError(method!=='GET');
  return response.payload;
 }
 async create(){const result=await this.call('sessions/new','POST');if(result.errorCode||typeof result.sessionId!=='string')throw new ProviderError(true);identifier(result.sessionId);return result.sessionId;}
 publish(session:string,trackName:string,mid:string,description:LiveDescription){return this.call(`sessions/${identifier(session)}/tracks/new`,'POST',{sessionDescription:description,tracks:[{location:'local',mid,trackName}]});}
 subscribe(session:string,publisher:string,trackName:string){return this.call(`sessions/${identifier(session)}/tracks/new`,'POST',{tracks:[{location:'remote',sessionId:publisher,trackName}]});}
 answer(session:string,description:LiveDescription){return this.call(`sessions/${identifier(session)}/renegotiate`,'PUT',{sessionDescription:description});}
 inspect(session:string){return this.call(`sessions/${identifier(session)}`,'GET');}
 close(session:string,mids:string[]){return this.call(`sessions/${identifier(session)}/tracks/close`,'PUT',{force:true,tracks:mids.map(mid=>({mid}))});}
}
