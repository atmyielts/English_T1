import {assertEquals,assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {readGuardianPortal,readGuardianRequests,readLegacyGuardianPortal,claimGuardianFromTelegram,writeGuardianPortal,readGuardianHistory,GuardianPortalError} from './guardian-portal.ts';
import {signTelegramInitDataForTest} from '../_shared/telegram-init-data.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),academy=id(2),guardian=id(3),relationship=id(4);
const child={academy_id:academy,guardian_id:guardian,relationship_id:relationship,details_loaded:true,student:{id:id(5),name:'Owned child'},
 permissions:Object.fromEntries(['status','attendance','grades','homework','schedule','payments','debt','messages','progress_reports','resources','announcements','message_academy'].map(key=>[key,true])),
 ...Object.fromEntries(['attendance','grades','homework','schedule','charges','balances','messages','announcements','resources','progress_reports','notifications','classrooms'].map(key=>[key,[]]))};
const page={actor_id:actor,guardians:[{id:guardian,academy_id:academy,full_name:'Owned parent'}],children:[child],selected_child:child,preferences:[],notifications:[],has_more:false,cursor:null};
const db=(data:unknown)=>({rpc:()=>Promise.resolve({data,error:null})});
Deno.test('parent read pins the verified actor and strips caller authority and legacy full-history switches',async()=>{
 let args:Record<string,unknown>|undefined;
 const result=await readGuardianPortal({rpc:(name:string,input:Record<string,unknown>)=>{assertEquals(name,'academy_guardian_portal_read');args=input;return Promise.resolve({data:page,error:null});}},actor,{relationship_id:relationship,user_id:id(99),all_details:true,limit:9999});
 assertEquals(args?.p_actor_id,actor);assertEquals(args?.p_payload,{relationship_id:relationship,limit:50,list_only:false,all_details:false});assertEquals(result.children.length,1);
});
Deno.test('foreign identities and staff/provider fields cannot become parent responses',async()=>{
 for(const candidate of [{...page,actor_id:id(99)},{...page,guardians:[{...page.guardians[0],notes:'PRIVATE'}]},
  {...page,children:[{...child,messages:[{id:id(8),metadata:{private:true}}]}]},
  {...page,selected_child:{...child,relationship_id:id(99)}},
  {...page,notifications:[{academy_id:academy,guardian_id:guardian,relationship_id:id(99),body:'PRIVATE'}]}]){
  await assertRejects(()=>readGuardianPortal(db(candidate),actor,{relationship_id:relationship}),GuardianPortalError);
 }
});
Deno.test('domain projections and debt restrictions are checked before returning data',async()=>{
 for(const bad of [{...child,permissions:{...child.permissions,payments:false},charges:[{effective_amount:'1000'}]},
  {...child,permissions:{...child.permissions,debt:false},charges:[{outstanding_amount:'1000'}]},
  {...child,permissions:{...child.permissions,debt:false},balances:[{balance:'-1000'}]},
  {...child,permissions:{...child.permissions,messages:false},messages:[{body:'PRIVATE'}]}]){
  await assertRejects(()=>readGuardianPortal(db({...page,children:[bad],selected_child:bad}),actor),GuardianPortalError);
 }
});
Deno.test('legacy route uses the same consent pages and cannot loop on a repeated cursor',async()=>{
 let calls=0;
 const result=await readLegacyGuardianPortal({rpc:(_name:string,args:Record<string,unknown>)=>{calls++;assertEquals((args.p_payload as Record<string,unknown>).all_details,true);return Promise.resolve({data:calls===1?{...page,has_more:true,cursor:{after_id:relationship}}:{...page,children:[],selected_child:null},error:null});}},actor);
 assertEquals(calls,2);assertEquals(result.children.length,1);assertEquals(result.guardians.length,1);
 await assertRejects(()=>readLegacyGuardianPortal(db({...page,has_more:true,cursor:{after_id:relationship}}),actor),GuardianPortalError);
});
Deno.test('request history pins the selected relationship and excludes another requester or event',async()=>{
 const request={id:id(8),requester_user_id:actor,requester_kind:'guardian',subject:'Owned request'};
 let args:Record<string,unknown>|undefined;
 await readGuardianRequests({rpc:(_name:string,input:Record<string,unknown>)=>{args=input;return Promise.resolve({data:{actor_id:actor,relationship_id:relationship,requests:[request],events:[],history_has_more:false},error:null});}},actor,relationship);
 assertEquals(args,{p_actor_id:actor,p_relationship_id:relationship});
 for(const data of [{actor_id:actor,relationship_id:relationship,requests:[{...request,requester_user_id:id(99)}],events:[],history_has_more:false},
  {actor_id:actor,relationship_id:relationship,requests:[request],events:[{request_id:id(99)}],history_has_more:false}])await assertRejects(()=>readGuardianRequests(db(data),actor,relationship),GuardianPortalError);
});
Deno.test('parent failures are actionable and withhold database internals',async()=>{
 for(const [code,status] of [['42501',403],['22023',400],['55P03',503],['P0001',503]] as const){
  try{await readGuardianPortal({rpc:()=>Promise.resolve({data:null,error:{code,message:'PRIVATE DATABASE DETAIL'}})},actor);throw Error('Expected refusal');}
  catch(error){if(!(error instanceof GuardianPortalError))throw error;assertEquals(error.status,status);assertEquals(error.message.includes('PRIVATE'),false);}
 }
 await assertRejects(()=>readGuardianPortal(db(page),'forged-actor'),GuardianPortalError);
});

Deno.test('legacy linking derives both Telegram IDs from signed identity and ignores typed identifiers',async()=>{
 const bot='owned-parent-test-bot',init=await signTelegramInitDataForTest({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:12345,username:'owned_parent'})},bot);
 let args:Record<string,unknown>|undefined;
 const linked={actor_id:actor,academy_id:academy,guardian:{id:guardian,academy_id:academy,status:'verified'},relationship:{id:relationship,academy_id:academy,guardian_id:guardian,status:'active',consent_status:'granted'}};
 await claimGuardianFromTelegram({rpc:(_name:string,input:Record<string,unknown>)=>{args=input;return Promise.resolve({data:linked,error:null});}},actor,
  {token:'owned-token',init_data:init,confirm_access:true,user_id:id(99),telegram_user_id:'99999',telegram_chat_id:'99999',telegram_username:'forged'},bot);
 assertEquals(args,{p_token:'owned-token',p_user_id:actor,p_telegram_user_id:'12345',p_telegram_chat_id:'12345',p_telegram_username:'owned_parent'});
});
Deno.test('unverified, expired and unconfirmed Telegram linking never reaches the database',async()=>{
 const bot='owned-parent-test-bot';let calls=0;const never={rpc:()=>{calls++;return Promise.resolve({data:{},error:null});}};
 const expired=await signTelegramInitDataForTest({auth_date:String(Math.floor(Date.now()/1000)-7200),user:JSON.stringify({id:12345})},bot);
 for(const input of [{token:'owned',telegram_user_id:'12345',telegram_chat_id:'12345',confirm_access:true},{token:'owned',init_data:expired,confirm_access:true},{token:'owned',init_data:'forged',confirm_access:false}]){
  await assertRejects(()=>claimGuardianFromTelegram(never,actor,input,bot),GuardianPortalError);
 }
 await assertRejects(()=>claimGuardianFromTelegram(never,actor,{token:'owned',init_data:'forged',confirm_access:true},''),GuardianPortalError);
 assertEquals(calls,0);
});

Deno.test('parent writes pin actor, permit only command fields and validate receipt identity',async()=>{
 let called:Record<string,unknown>={};
 const result={actor_id:actor,relationship_id:relationship,replayed:false,message:{id:id(20),body:'Owned message'}};
 const service={rpc:(name:string,args:Record<string,unknown>)=>{called={name,...args};return Promise.resolve({data:result,error:null});}};
 await writeGuardianPortal(service,actor,'guardian_send_message',{relationship_id:relationship,body:'Owned message',idempotency_key:'owned-key',actor_id:id(99),guardian_id:id(99)});
 assertEquals(called,{name:'academy_parent_write_command',p_actor_id:actor,p_command:'guardian_send_message',p_payload:{relationship_id:relationship,body:'Owned message'},p_request_key:'owned-key'});
 await assertRejects(()=>writeGuardianPortal(db({...result,actor_id:id(99)}),actor,'guardian_send_message',{idempotency_key:'owned-key'}),GuardianPortalError);
 await assertRejects(()=>writeGuardianPortal(service,actor,'guardian_send_message',{}),GuardianPortalError);
});
Deno.test('history adapter preserves child and section cursors and rejects private/provider fields',async()=>{
 const after={relationship_id:relationship,section:'messages',key:'2026-01-01',id:id(21)};
 const result={actor_id:actor,relationship_id:relationship,section:'messages',records:[{id:id(20),body:'Owned message'}],has_more:true,cursor:after};
 let called:Record<string,unknown>={};
 await readGuardianHistory({rpc:(name:string,args:Record<string,unknown>)=>{called={name,...args};return Promise.resolve({data:result,error:null});}},actor,{relationship_id:relationship,section:'messages',after,user_id:id(99)});
 assertEquals(called,{name:'academy_guardian_history_read',p_actor_id:actor,p_relationship_id:relationship,p_section:'messages',p_after:after});
 for(const bad of [{...result,relationship_id:id(99)},{...result,cursor:{...after,section:'charges'}},{...result,records:[{id:id(20),target:'PRIVATE'}]}])await assertRejects(()=>readGuardianHistory(db(bad),actor,{relationship_id:relationship,section:'messages'}),GuardianPortalError);
});
