// Real authority/database/Worker ports for local live-exam acceptance. Only
// hosted identity, TURN replies and SFU media transport are explicit adapters.
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions,Response as RuntimeResponse} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
export async function connectedLive({root,directory,base,auth,database}){
 const secret='synthetic-live-'+randomUUID(),providerSecret='synthetic-provider-'+randomUUID(),edgeFile=path.join(directory,'connected-live-edge.mjs'),workerFile=path.join(directory,'connected-live-worker.mjs');
 await Promise.all([build({stdin:{contents:"export {createLiveHandler} from './supabase/functions/proctor/live-handler.ts';export {createLiveRepository} from './supabase/functions/proctor/live-repository.ts';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:edgeFile}),build({entryPoints:[path.join(root,'workers/proctor-live/src/index.ts')],bundle:true,platform:'browser',format:'esm',target:'es2022',external:['cloudflare:workers'],outfile:workerFile})]);
 const modules=await import(pathToFileURL(edgeFile).href),user=async token=>{const result=await auth.auth.getUser(token);return result.error?null:result.data.user?.id??null;},authority=modules.createLiveHandler(modules.createLiveRepository(user,database),[base],{enabled:true,brokerSecret:secret});
 const sessions=new Map(),queue=[],pending=new Map(),calls={allocations:0,publish:0,subscribe:0,answer:0,close:0,relayIssue:0,relayRevoke:0};let stopped=false;
 function signal(action,data){
  if(stopped)return Promise.reject(Error('Local native SFU adapter stopped'));if(pending.size>=40)return Promise.reject(Error('Local native SFU adapter queue full'));
  const id=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Local native SFU adapter reply timed out'));},15000);pending.set(id,{resolve,reject,timer});queue.push({id,action,data});});
 }
 const nativeResponse=async response=>new RuntimeResponse(response.status===204?null:await response.arrayBuffer(),{status:response.status,headers:Object.fromEntries(response.headers)});
 const outboundService=async req=>{
  const url=new URL(req.url);
  if(url.origin==='https://canonical-live.invalid'){assert.equal(url.pathname,'/functions/v1/proctor/live/internal');return nativeResponse(await authority(req));}
  assert.equal(url.origin,'https://rtc.live.cloudflare.com');assert.equal(req.headers.get('authorization'),'Bearer '+providerSecret);
  const raw=req.method==='GET'?'':await req.text(),body=raw?JSON.parse(raw):{};
  if(url.pathname.includes('/turn/keys/')){
   if(url.pathname.endsWith('/generate-ice-servers')){calls.relayIssue++;assert.equal(body.ttl,600);return RuntimeResponse.json({iceServers:[{urls:['turns:turn.cloudflare.com:443?transport=tcp'],username:'local-relay-'+calls.relayIssue,credential:'synthetic-short-lived-password'}]},{status:201});}
   if(url.pathname.endsWith('/revoke')){calls.relayRevoke++;return new RuntimeResponse(null,{status:204});}
   throw Error('Unknown local TURN fixture request');
  }
  if(url.pathname.endsWith('/sessions/new')){calls.allocations++;const sessionId='native-sfu-'+randomUUID();sessions.set(sessionId,{tracks:[]});return RuntimeResponse.json({sessionId});}
  const id=/\/sessions\/([^/]+)/.exec(url.pathname)?.[1],current=sessions.get(id);assert.ok(current,'Unknown local SFU session');
  if(url.pathname.endsWith('/tracks/new')){
   assert.equal(body.tracks.length,1);const track=body.tracks[0];let result;
   if(track.location==='local'){calls.publish++;result=await signal('publish',{id,track,sessionDescription:body.sessionDescription});current.tracks=[{...track,status:'active'}];return RuntimeResponse.json({sessionDescription:result.sessionDescription,requiresImmediateRenegotiation:false,tracks:[track]});}
   calls.subscribe++;assert.ok(sessions.get(track.sessionId)?.tracks.some(row=>row.trackName===track.trackName&&row.status==='active'));result=await signal('subscribe',{id,track});const returned={...track,mid:result.mid};current.tracks=[{...returned,status:'active'}];return RuntimeResponse.json({sessionDescription:result.sessionDescription,requiresImmediateRenegotiation:true,tracks:[returned]});
  }
  if(url.pathname.endsWith('/renegotiate')){calls.answer++;await signal('answer',{id,sessionDescription:body.sessionDescription});return RuntimeResponse.json({});}
  if(url.pathname.endsWith('/tracks/close')){calls.close++;assert.equal(body.force,true);await signal('close',{id});for(const track of current.tracks)track.status='inactive';return RuntimeResponse.json({tracks:body.tracks.map(track=>({mid:track.mid}))});}
  if(req.method==='GET')return RuntimeResponse.json({tracks:current.tracks});throw Error('Unknown local SFU operation');
 };
 const worker=new Miniflare({...convertV4MiniflareOptions({name:'connected-proctor-live',modules:true,script:await readFile(workerFile,'utf8'),compatibilityDate:'2026-10-20',durableObjects:{CONNECTIONS:{className:'LiveConnectionBroker',useSQLite:true}},bindings:{PROCTOR_LIVE_ENABLED:'true',PROCTOR_LIVE_BROKER_SECRET:secret,PROCTOR_SFU_APP_ID:'local-sfu-app',PROCTOR_SFU_APP_SECRET:providerSecret,PROCTOR_TURN_KEY_ID:'local-turn-key',PROCTOR_TURN_KEY_SECRET:providerSecret,SUPABASE_URL:'https://canonical-live.invalid',SUPABASE_ANON_KEY:'synthetic-anon',ALLOWED_ORIGINS:base},outboundService}),resourcePersistencePath:path.join(directory,'connected-live-state')});
 return{
  authority,
  async dispatch(req){return worker.dispatchFetch(req.url,{method:req.method,headers:req.headers,body:await req.arrayBuffer()});},
  async control(req){if(req.method==='GET')return Response.json({jobs:queue.splice(0).filter(job=>pending.has(job.id))});const body=await req.json(),entry=pending.get(body.id);if(!entry)return Response.json({accepted:false});clearTimeout(entry.timer);pending.delete(body.id);if(body.error)entry.reject(Error('Local native SFU adapter failed'));else entry.resolve(body.result??{});return Response.json({accepted:true});},
  proof(){return{...calls,pending:pending.size};},
  async dispose(){stopped=true;for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error('Local live fixture disposed'));}pending.clear();queue.length=0;await worker.dispose();},
 };
}
