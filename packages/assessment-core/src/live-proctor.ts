import {ContractError,object,text,uuid} from './mod.ts';
import {captureBinding} from './capture-launch.ts';
export const LIVE_SOURCES=['camera','microphone','screen'] as const;
export type LiveSource=typeof LIVE_SOURCES[number];
export type LiveRole='publisher'|'viewer';
export interface LiveConnection{id:string;tenant_id:string;session_id:string;source:LiveSource;role:LiveRole;state:string;expires_at:string;server_time:string;revision:number}
export function liveSource(value:unknown):LiveSource{if(!LIVE_SOURCES.includes(value as LiveSource))throw new ContractError('invalid_live_source','Choose a camera, microphone or screen feed.');return value as LiveSource;}
export function liveCommand(action:string,value:unknown):Record<string,unknown>{
 const data=object(value),id=uuid(data.id);
 if(action==='connection.close')return{id};
 if(action!=='connection.open'||!['publisher','viewer'].includes(String(data.role)))throw new ContractError('invalid_live_command','Choose a supported live connection action.');
 return{id,session_id:uuid(data.session_id),role:data.role,source:liveSource(data.source),...(data.role==='publisher'?captureBinding(data):{publisher_id:uuid(data.publisher_id)})};
}
export interface LiveDescription{type:'offer'|'answer';sdp:string}
export function liveDescription(value:unknown,type:'offer'|'answer'):LiveDescription{
 const data=object(value),sdp=text(data.sdp,'Connection description',65000);
 if(data.type!==type||!sdp.startsWith('v=0')||!sdp.includes('\nm='))throw new ContractError('invalid_live_description','A valid WebRTC description is required.');
 return{type,sdp:data.sdp as string};
}
export function liveOperation(action:string,value:unknown):Record<string,unknown>{
 const data=object(value);
 if(['subscribe','heartbeat','close','connected','ice'].includes(action))return{};
 if(action==='publish'){const mid=text(data.mid,'Media section',32);if(!/^[a-zA-Z0-9_-]+$/.test(mid))throw new ContractError('invalid_live_mid','Invalid media section.');return{mid,sessionDescription:liveDescription(data.sessionDescription,'offer')};}
 if(action==='answer')return{sessionDescription:liveDescription(data.sessionDescription,'answer')};
 throw new ContractError('invalid_live_operation','Unsupported live media operation.');
}
export interface LiveIceServer{urls:string[];username?:string;credential?:string}
export interface LiveIceBundle{iceServers:LiveIceServer[];server_time:string;expires_at:string}
/** Fixed provider origin and endpoints. No arbitrary upstream ICE URLs or
 * blocked browser port 53 are relayed to a candidate's browser. */
export function liveIceServers(value:unknown):LiveIceServer[]{
 if(!Array.isArray(value)||value.length<1||value.length>8)throw new ContractError('invalid_live_ice','Invalid relay configuration.');
 const servers=value.map(raw=>{const row=object(raw);if(!Array.isArray(row.urls)||row.urls.length<1||row.urls.length>12)throw new ContractError('invalid_live_ice','Invalid relay endpoints.');
  const urls=row.urls.filter(url=>typeof url==='string'&&!/^turns?:turn\.cloudflare\.com:53(?:\?|$)/.test(url));
  if(urls.some(url=>!/^stun:stun\.cloudflare\.com:3478$/.test(url)&&!/^turn:turn\.cloudflare\.com:(3478|443)\?transport=udp$/.test(url)&&!/^turn:turn\.cloudflare\.com:(3478|80)\?transport=tcp$/.test(url)&&!/^turns:turn\.cloudflare\.com:(5349|443)\?transport=tcp$/.test(url)))throw new ContractError('invalid_live_ice','Untrusted relay endpoint.');
  const relay=urls.some(url=>!url.startsWith('stun:'));return{urls,...(relay?{username:text(row.username,'Relay username',1024),credential:text(row.credential,'Relay credential',1024)}:{})};
 }).filter(row=>row.urls.length);
 if(!servers.some(row=>row.credential&&row.urls.some(url=>url.startsWith('turns:')))||new Set(servers.filter(row=>row.credential).map(row=>JSON.stringify([row.username,row.credential]))).size!==1)throw new ContractError('invalid_live_ice','One secure relay credential is required.');return servers;
}
