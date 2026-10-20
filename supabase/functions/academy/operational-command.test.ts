import {runOperationalCommand} from './operational-command.ts';
import {LegacyImportCommandError} from './legacy-import-command.ts';
const actor='00000000-0000-4000-8000-000000000001',academy='00000000-0000-4000-8000-000000000002';
const assert=(value:unknown)=>{if(!value)throw Error('Operational command boundary failed');};
const from=()=>{throw Error('Forbidden legacy lookup');};
Deno.test('lead command binds verified identities and ignores caller server args and metadata',async()=>{
 let captured:Record<string,unknown>={};const data={actor_id:actor,request_key:'owned-key',command:'create_lead',replayed:false,lead:{id:'saved'}};
 const result=await runOperationalCommand({from,rpc:(_name,args)=>{captured=args;return Promise.resolve({data,error:null});}},academy,actor,'create_lead',{full_name:' Owned learner ',phone:'12025550101',idempotency_key:'owned-key',actor_id:'forged',server_args:{p_actor:'forged'},metadata:{forged:true}});
 const payload=captured.p_payload as {intent:Record<string,unknown>;server_args:Record<string,unknown>};
 assert(result===data&&captured.p_actor===actor&&captured.p_academy===academy&&payload.intent.full_name==='Owned learner'&&!('metadata' in payload.intent)&&!('server_args' in payload.intent)&&Object.keys(payload.server_args).length===0);
});
Deno.test('command rejects stale expected actor before any private lookup',async()=>{
 try{await runOperationalCommand({from,rpc:()=>{throw Error('Unexpected RPC');}},academy,actor,'create_lead',{_expected_actor:'foreign',idempotency_key:'owned'});throw Error('Stale actor accepted');}
 catch(error){assert(error instanceof LegacyImportCommandError&&error.status===409);}
});
Deno.test('current operational refusal, conflicting intent and uncertain failure preserve typed statuses',async()=>{
 for(const [code,status,retryable] of [['42501',403,false],['23505',409,false],['22023',400,false],['57014',503,true]] as const){
  try{await runOperationalCommand({from,rpc:()=>Promise.resolve({data:null,error:{code}})},academy,actor,'create_lead',{full_name:'Owned',phone:'12025550101',idempotency_key:'owned'});throw Error('Failed change returned');}
  catch(error){assert(error instanceof LegacyImportCommandError&&error.status===status&&error.retryable===retryable);}
 }
});
Deno.test('incomplete or foreign operational receipts remain uncertain and retryable',async()=>{
 for(const data of [null,{}, {actor_id:'foreign',command:'create_lead',request_key:'owned',replayed:false}]){
  try{await runOperationalCommand({from,rpc:()=>Promise.resolve({data,error:null})},academy,actor,'create_lead',{full_name:'Owned',phone:'12025550101',idempotency_key:'owned'});throw Error('Untrusted receipt returned');}
  catch(error){assert(error instanceof LegacyImportCommandError&&error.status===503&&error.retryable);}
 }
});
Deno.test('teacher action refuses revoked current context before legacy session or roster reads',async()=>{
 let calls=0;try{await runOperationalCommand({from,rpc:(name)=>{calls++;assert(name==='academy_teacher_session_context');return Promise.resolve({data:null,error:{code:'42501'}});}},academy,actor,'teacher_lesson_attendance',{session_id:'owned-session',records:[{contact_id:'owned-student',status:'present'}],idempotency_key:'owned'});throw Error('Revoked teacher accepted');}
 catch(error){assert(error instanceof LegacyImportCommandError&&error.status===403&&calls===1);}
});
Deno.test('a failed teacher planning lookup retains an earlier uncertain request key',async()=>{
 try{await runOperationalCommand({from,rpc:()=>Promise.resolve({data:{actor_id:actor,academy_id:academy,staff_id:'owned-staff',classroom_id:'owned-class',permissions:{viewEducationOS:true,markAttendance:true}},error:null})},academy,actor,'teacher_lesson_attendance',{session_id:'owned-session',records:[{contact_id:'owned-student',status:'present'}],idempotency_key:'owned'});throw Error('Planning failure returned');}
 catch(error){assert(error instanceof LegacyImportCommandError&&error.status===503&&error.retryable&&!error.message.includes('Forbidden legacy'));}
});
