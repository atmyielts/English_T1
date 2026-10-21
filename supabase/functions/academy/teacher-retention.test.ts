import {runTeacherRetentionRead} from './teacher-retention.ts';
import {LegacyImportCommandError} from './legacy-import-command.ts';
const academy='00000000-0000-4000-8000-000000000001',actor='owned-actor';
const input={from:'2026-10-01T00:00:00.000Z',to:'2026-10-20T00:00:00.000Z',branch_id:null,_expected_actor:actor};
const result={schema_version:1,actor_id:actor,academy_id:academy,from:input.from,to:input.to,branch_id:null,history_complete:false,covered_from:null,has_more:false,rows:[],branches:[]};
const assert=(value:unknown)=>{if(!value)throw Error('Assertion failed');};
Deno.test('retention uses verified identity and curated read arguments',async()=>{
 let args:Record<string,unknown>={};const data=await runTeacherRetentionRead({rpc:(name,value)=>{assert(name==='academy_teacher_retention_read');args=value;return Promise.resolve({data:result,error:null});}},academy,actor,{...input,actor_id:'forged',academy_id:'foreign',extra:'ignored'});
 assert(data===result&&args.p_actor===actor&&args.p_academy===academy&&Object.keys(args).length===5&&!('extra' in args));
});
Deno.test('retention refuses actor switch, malformed dates, overlong periods and foreign branch syntax before transport',async()=>{
 for(const patch of [{_expected_actor:undefined},{_expected_actor:'foreign'},{from:'invalid'},{to:input.from},{from:'2024-01-01T00:00:00Z'},{branch_id:'not-a-uuid'}]){
  let called=false;try{await runTeacherRetentionRead({rpc:()=>{called=true;throw Error('Unexpected RPC');}},academy,actor,{...input,...patch});throw Error('Accepted invalid input');}catch(error){assert(!called&&error instanceof LegacyImportCommandError&&[400,409].includes(error.status));}
 }
});
Deno.test('retention sanitizes current-access refusal, input refusal and SQL/transport failure',async()=>{
 for(const [code,status]of [['42501',403],['22023',400],['57014',503]]as const){try{await runTeacherRetentionRead({rpc:()=>Promise.resolve({data:null,error:{code}})},academy,actor,input);throw Error('Accepted SQL failure');}catch(error){assert(error instanceof LegacyImportCommandError&&error.status===status);}}
 try{await runTeacherRetentionRead({rpc:()=>{throw Error('private diagnostics');}},academy,actor,input);throw Error('Accepted failure');}catch(error){assert(error instanceof LegacyImportCommandError&&error.status===503&&!error.message.includes('private'));}
});
Deno.test('retention rejects foreign actor, academy, period and invalid counts instead of rendering them',async()=>{
 for(const patch of [{actor_id:'foreign'},{academy_id:'foreign'},{from:input.to},{history_complete:null},{rows:[{display_name:'Teacher',cohort_size:-1}]},{covered_from:'invalid'}]){
  try{await runTeacherRetentionRead({rpc:()=>Promise.resolve({data:{...result,...patch},error:null})},academy,actor,input);throw Error('Accepted wrong report');}catch(error){assert(error instanceof LegacyImportCommandError&&error.status===503);}
 }
});
