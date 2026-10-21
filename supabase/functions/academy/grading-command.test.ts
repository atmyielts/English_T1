import {runGradingCommand} from './grading-command.ts';
import {LegacyImportCommandError} from './legacy-import-command.ts';
const actor='00000000-0000-4000-8000-000000000001',academy='00000000-0000-4000-8000-000000000002';
const assert=(value:unknown)=>{if(!value)throw Error('Current grading boundary failed');};
const input={assignment_id:'owned-assignment',contact_id:'owned-learner',score:75,expected_attempt_number:2,expected_updated_at:'2026-10-21T01:00:00Z',expected_assignment_updated_at:'2026-10-20T01:00:00Z',idempotency_key:'owned-grade'};
Deno.test('grading binds the verified actor and reviewed attempt while discarding caller authority and metadata',async()=>{
 let captured:Record<string,unknown>={};const data={actor_id:actor,request_key:'owned-grade',command:'submit_assignment',replayed:false,submission:{id:'owned-submission',academy_id:academy,assignment_id:input.assignment_id,contact_id:input.contact_id}};
 const result=await runGradingCommand({rpc:(_name,args)=>{captured=args;return Promise.resolve({data,error:null});}},academy,actor,'submit_assignment',{...input,actor_id:'forged',academy_id:'foreign',metadata:{forged:true}});
 const payload=captured.p_payload as Record<string,unknown>;assert(result===data&&captured.p_actor===actor&&captured.p_academy===academy&&payload.expected_attempt_number===2&&!('actor_id' in payload)&&!('metadata' in payload));
});
Deno.test('old grading pages without an observed attempt are refused before any write',async()=>{
 try{await runGradingCommand({rpc:()=>{throw Error('Unexpected RPC');}},academy,actor,'submit_assignment',{...input,expected_attempt_number:undefined});throw Error('Blind grade accepted');}
 catch(error){assert(error instanceof LegacyImportCommandError&&error.status===409&&!error.retryable);}
});
Deno.test('grading refuses stale actor identity before privileged transport',async()=>{
 try{await runGradingCommand({rpc:()=>{throw Error('Unexpected RPC');}},academy,actor,'submit_assignment',{...input,_expected_actor:'foreign'});throw Error('Actor switch accepted');}
 catch(error){assert(error instanceof LegacyImportCommandError&&error.status===409);}
});
Deno.test('current grading refusal and stale revision remain definitive; failed transport remains uncertain',async()=>{
 for(const [code,status,retryable]of[['42501',403,false],['23505',409,false],['22023',400,false],['57014',503,true]]as const){
  try{await runGradingCommand({rpc:()=>Promise.resolve({data:null,error:{code}})},academy,actor,'submit_assignment',input);throw Error('Failed grade returned');}
  catch(error){assert(error instanceof LegacyImportCommandError&&error.status===status&&error.retryable===retryable);}
 }
 try{await runGradingCommand({rpc:()=>{throw Error('Private SQL diagnostics');}},academy,actor,'submit_assignment',input);throw Error('Network failure returned');}
 catch(error){assert(error instanceof LegacyImportCommandError&&error.status===503&&error.retryable&&!error.message.includes('Private SQL'));}
});
Deno.test('foreign, wrong-learner and incomplete grading receipts are never confirmed',async()=>{
 for(const submission of [null,{id:'wrong',academy_id:'foreign'},{id:'wrong',academy_id:academy,assignment_id:input.assignment_id,contact_id:'other-learner'}]){
  try{await runGradingCommand({rpc:()=>Promise.resolve({data:{actor_id:actor,command:'submit_assignment',request_key:'owned-grade',replayed:false,submission},error:null})},academy,actor,'submit_assignment',input);throw Error('Wrong grade returned');}
  catch(error){assert(error instanceof LegacyImportCommandError&&error.status===503&&error.retryable);}
 }
});
