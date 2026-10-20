import {runOperationalRead} from './operational-read.ts';
import {LegacyImportCommandError} from './legacy-import-command.ts';
const actor='00000000-0000-4000-8000-000000000001',academy='00000000-0000-4000-8000-000000000002';
const assert=(value:unknown)=>{if(!value)throw Error('Operational read boundary failed');};
Deno.test('operational read binds the verified actor and never trusts payload identities',async()=>{
 let args:Record<string,unknown>|undefined;
 const data={actor_id:actor,schema_version:1,authority_hash:'a'.repeat(64),branches:[],truncated:false};
 const db={rpc:(_name:string,input:Record<string,unknown>)=>{args=input;return Promise.resolve({data,error:null});}};
 const result=await runOperationalRead(db,academy,actor,'room_timetable_branches',{actor_id:'forged',academy_id:'foreign'});
 assert(result===data&&args?.p_actor===actor&&args?.p_academy===academy&&args?.p_action==='room_timetable_branches');
});
Deno.test('foreign, incomplete and malformed operational read identities fail closed',async()=>{
 for(const data of[null,[],{actor_id:'foreign',schema_version:1,authority_hash:'a'.repeat(64)},{actor_id:actor,schema_version:2,authority_hash:'a'.repeat(64)},{actor_id:actor,schema_version:1,authority_hash:'invalid'}]){
  try{await runOperationalRead({rpc:()=>Promise.resolve({data,error:null})},academy,actor,'gradebook',{});throw Error('Untrusted read returned');}
  catch(error){assert(error instanceof LegacyImportCommandError&&error.status===503);}
 }
});
Deno.test('current-authority refusal and provider errors stay private and retain actionable statuses',async()=>{
 for(const [code,status]of[['42501',403],['22P02',400],['57014',503]] as const){
  try{await runOperationalRead({rpc:()=>Promise.resolve({data:null,error:{code,message:'private SQL details'}})},academy,actor,'gradebook',{});throw Error('Failed read returned');}
  catch(error){assert(error instanceof LegacyImportCommandError&&error.status===status&&!error.message.includes('private SQL'));}
 }
});
Deno.test('operational read transport failure is retryable and cannot expose database diagnostics',async()=>{
 try{await runOperationalRead({rpc:()=>{throw Error('private host diagnostics');}},academy,actor,'gradebook',{});throw Error('Network failure returned');}
 catch(error){assert(error instanceof LegacyImportCommandError&&error.status===503&&error.retryable&&!error.message.includes('private host'));}
});
