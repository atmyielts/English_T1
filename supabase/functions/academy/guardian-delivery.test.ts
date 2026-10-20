import {assertEquals,assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {dispatchGuardianNotification,sendParentTelegram,sendParentSms} from './guardian-delivery.ts';
const claim={outcome:'send',notification_id:'owned-notice',claim_token:'owned-claim',channel:'telegram',target:'12345',title:'Owned title',body:'Owned body'};
Deno.test('consent refusal and a competing claim never call a provider',async()=>{
 for(const outcome of ['skipped','deferred','unchanged']){
  let sends=0;const db={rpc:()=>Promise.resolve({data:{...claim,outcome},error:null})};
  assertEquals(await dispatchGuardianNotification(db,'owned-notice',async()=>{sends++;return {outcome:'sent'};}),outcome);assertEquals(sends,0);
 }
});
Deno.test('provider outcome is persisted against the exact claim and parent destination',async()=>{
 const calls:Record<string,unknown>[]=[];
 const db={rpc:(name:string,args:Record<string,unknown>)=>{calls.push({name,...args});return Promise.resolve({data:claim,error:null});}};
 await dispatchGuardianNotification(db,'owned-notice',async input=>{assertEquals(input.target,'12345');return {outcome:'sent',providerId:'42'};});
 assertEquals(calls[1],{name:'academy_guardian_delivery_complete',p_notification_id:'owned-notice',p_claim_token:'owned-claim',p_outcome:'sent',p_provider_id:'42'});
});
Deno.test('transport ambiguity is retained for review without a second provider call',async()=>{
 const outcomes:unknown[]=[];let sends=0;
 const db={rpc:(_name:string,args:Record<string,unknown>)=>{if(args.p_outcome)outcomes.push(args.p_outcome);return Promise.resolve({data:claim,error:null});}};
 assertEquals(await dispatchGuardianNotification(db,'owned-notice',()=>{sends++;throw Error('Timeout after submission');}),'unknown');
 assertEquals(sends,1);assertEquals(outcomes,['unknown']);
});
Deno.test('failed consent storage and mismatched claims fail before sending',async()=>{
 for(const response of [{data:null,error:{code:'42501'}},{data:{...claim,notification_id:'another-notice'},error:null}]){
  await assertRejects(()=>dispatchGuardianNotification({rpc:()=>Promise.resolve(response)},'owned-notice',()=>{throw Error('Provider must never run');}));
 }
});
Deno.test('Telegram unconfigured, explicit refusal and ambiguous responses remain distinct',async()=>{
 const transport=(data:unknown)=>Promise.resolve(new Response(JSON.stringify(data)));
 assertEquals(await sendParentTelegram('',claim,()=>{throw Error('No configured token');}),{outcome:'unconfigured'});
 assertEquals(await sendParentTelegram('owned-token',claim,()=>transport({ok:false,error_code:429})),{outcome:'failed'});
 assertEquals(await sendParentTelegram('owned-token',claim,()=>transport({ok:true,result:{message_id:42}})),{outcome:'sent',providerId:'42'});
 assertEquals(await sendParentTelegram('owned-token',claim,()=>transport({unexpected:true})),{outcome:'unknown'});
});

Deno.test('SMS config, provider refusal, acceptance and ambiguity never trigger an automatic resend',async()=>{
 const sms={...claim,target:'998900000000'};let calls=0;
 const transport:typeof fetch=(_url,init)=>{calls++;assertEquals(JSON.parse(String(init?.body)).phone,sms.target);return Promise.resolve(new Response('{"id":"owned-provider-id"}',{status:202}));};
 assertEquals(await sendParentSms('','',sms,transport),{outcome:'unconfigured'});assertEquals(calls,0);
 assertEquals(await sendParentSms('http://example.invalid','owned-token',sms,transport),{outcome:'unconfigured'});assertEquals(calls,0);
 assertEquals(await sendParentSms('https://sms.example.invalid','owned-token',sms,transport),{outcome:'sent',providerId:'owned-provider-id'});assertEquals(calls,1);
 assertEquals(await sendParentSms('https://sms.example.invalid','owned-token',sms,()=>Promise.resolve(new Response('',{status:400}))),{outcome:'failed'});
 assertEquals(await sendParentSms('https://sms.example.invalid','owned-token',sms,()=>Promise.resolve(new Response('',{status:503}))),{outcome:'unknown'});
});
