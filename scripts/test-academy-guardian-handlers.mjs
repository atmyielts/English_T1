import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {transformSync} from 'esbuild';
const globals={crypto:webcrypto,TextEncoder,URL,URLSearchParams};
function compile(path,dependencies={}){
 const module={exports:{}};const source=readFileSync(path,'utf8');const js=transformSync(source,{loader:'ts',format:'cjs',target:'es2022'}).code;
 runInNewContext(js,{...globals,module,exports:module.exports,require:name=>{assert.ok(Object.hasOwn(dependencies,name),'Reviewed test dependency');return dependencies[name];}});return module.exports;
}
const telegram=compile('supabase/functions/_shared/telegram-init-data.ts');
const service=compile('supabase/functions/academy/guardian-portal.ts',{'../_shared/telegram-init-data.ts':telegram});
const overrideIndex=process.argv.indexOf('--edge-source');
const source=readFileSync(overrideIndex<0?'supabase/functions/academy/index.ts':process.argv[overrideIndex+1],'utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
const decoder=slice('    const rawActionBody =',source.includes('    if(audioActions.has')?'    if(audioActions.has':'    if (requestedAction === "invitation_status")');
const reads=slice('    if (requestedAction === "guardian_claim_link"','    if (requestedAction === "guardian_update_preferences"');
const writes=slice('    if (requestedAction === "guardian_update_preferences"','    const memberships = await loadMemberships');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const actor=id(1),academy=id(2),guardian=id(3),relationship=id(4);
const code=transformSync('async function dispatch(sb,body){const userId="'+actor+'",req={method:"POST"},url=new URL("https://owned.invalid"),actionQuery="";'+decoder+reads+writes+'}',{loader:'ts',target:'es2022'}).code;
const dispatch=runInNewContext(code+';dispatch',{...globals,...service,json:(status,body)=>({status,body}),normalizeText:(v,n=300)=>String(v??'').trim().slice(0,n),getOptionalEnv:()=> 'owned-parent-handler-bot'});
let checks=0;
const page={actor_id:actor,guardians:[],children:[],selected_child:null,preferences:[],notifications:[],has_more:false,cursor:null};
for(const raw of [false,true]){
 const calls=[];const sb={from:()=>{throw Error('Parent reads must use the database consent boundary');},rpc:async(name,args)=>{calls.push({name,args});return {data:page,error:null};}};
 const response=await dispatch(sb,{action:raw?'guardian_dashboard':'guardian_portal_read_command',command:'guardian_dashboard',user_id:id(99),actor_id:id(99),all_details:true});
 assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(calls[0].args.p_actor_id,actor);assert.equal(calls[0].args.p_payload.all_details,raw);checks+=4;
}
{
 const calls=[];const sb={from:()=>{throw Error('No direct requester-table fallback');},rpc:async(name,args)=>{calls.push({name,args});return {data:{actor_id:actor,relationship_id:relationship,requests:[],events:[],history_has_more:false},error:null};}};
 assert.equal((await dispatch(sb,{action:'guardian_portal_read_command',command:'guardian_service_requests',relationship_id:relationship,user_id:id(99)})).status,200);
 assert.equal(calls[0].name,'academy_guardian_portal_requests');assert.equal(calls[0].args.p_actor_id,actor);assert.equal(calls[0].args.p_relationship_id,relationship);checks+=4;
}
{
 let calls=0;await assert.rejects(()=>dispatch({rpc:()=>{calls++;}},{action:'guardian_portal_read_command',command:'guardian_send_message'}),e=>e.status===400);assert.equal(calls,0);checks+=2;
}
{
 const init=await telegram.signTelegramInitDataForTest({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:12345,username:'owned_parent'})},'owned-parent-handler-bot');
 const calls=[];const sb={rpc:async(name,args)=>{calls.push({name,args});return {data:{actor_id:actor,academy_id:academy,guardian:{id:guardian,academy_id:academy,status:'verified'},relationship:{id:relationship,academy_id:academy,guardian_id:guardian,status:'active',consent_status:'granted'}},error:null};}};
 assert.equal((await dispatch(sb,{action:'guardian_link_command',command:'guardian_claim_link',token:'owned-token',init_data:init,confirm_access:true,telegram_user_id:'99999',telegram_chat_id:'99999',user_id:id(99)})).status,200);
 assert.equal(calls[0].args.p_user_id,actor);assert.equal(calls[0].args.p_telegram_user_id,'12345');assert.equal(calls[0].args.p_telegram_chat_id,'12345');checks+=4;
}

for(const command of ['guardian_send_message','guardian_service_request_create','guardian_update_preferences']){
 const field=command==='guardian_send_message'?'message':command==='guardian_service_request_create'?'request':'preference';
 const calls=[];const sb={from:()=>{throw Error('Parent writes must use current database consent');},rpc:async(name,args)=>{calls.push({name,args});return {data:{actor_id:actor,relationship_id:relationship,replayed:false,[field]:{id:id(20)}},error:null};}};
 assert.equal((await dispatch(sb,{action:'guardian_portal_write_command',command,relationship_id:relationship,guardian_id:guardian,body:'Owned message',idempotency_key:'owned-key',actor_id:id(99)})).status,200);
 assert.equal(calls[0].name,'academy_parent_write_command');assert.equal(calls[0].args.p_actor_id,actor);assert.equal(calls[0].args.p_request_key,'owned-key');assert.equal(calls[0].args.p_payload.actor_id,undefined);checks+=5;
}
console.log(JSON.stringify({suite:'actual-parent-gateway-dispatch',checks,productionTouched:false}));
