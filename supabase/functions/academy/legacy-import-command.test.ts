import {assertEquals,assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {legacyImportCommand} from './legacy-import-command.ts';
import {staffGuardianCommand} from './staff-guardian-command.ts';
import {buildAcademyPermissions} from './access.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
Deno.test('legacy command binds the authenticated actor and rejects incomplete receipts',async()=>{
 const result={import_job_id:id(3),committed_rows:25,failed_rows:0,pending_rows:1,recovery_pending:25,completed:0,manual_required:0,failed:0};
 let args:Record<string,unknown>={};
 const db={rpc:(name:string,input:Record<string,unknown>)=>{assertEquals(name,'academy_legacy_import_command');args=input;return Promise.resolve({data:result,error:null});}};
 await legacyImportCommand(db,id(1),id(2),'commit',id(3),{confirm_commit:true});
 assertEquals(args,{p_actor_id:id(1),p_academy_id:id(2),p_action:'commit',p_job_id:id(3),p_payload:{confirm_commit:true}});
 await assertRejects(()=>legacyImportCommand({rpc:()=>Promise.resolve({data:{...result,import_job_id:id(4)},error:null})},id(1),id(2),'commit',id(3),{}));
});
Deno.test('legacy refusal, conflict and ambiguity keep distinct retry semantics',async()=>{
 for(const [code,status,retryable] of [['42501',403,false],['23505',409,false],['22023',400,false],['57014',503,true]] as const){
  try{await legacyImportCommand({rpc:()=>Promise.resolve({data:null,error:{code}})},id(1),id(2),'recover',id(3),{});throw Error('Expected refusal');}
  catch(error){assertEquals((error as {status:number}).status,status);assertEquals((error as {retryable:boolean}).retryable,retryable);}
 }
});
Deno.test('staff parent transport excludes browser authority and pins actor in SQL arguments',async()=>{
 let args:Record<string,unknown>={};
 const db={rpc:(_name:string,input:Record<string,unknown>)=>{args=input;return Promise.resolve({data:{actor_id:id(1)},error:null});}};
 await staffGuardianCommand(db,id(2),id(1),'send_guardian_message',{action:'staff_guardian_command',command:'send_guardian_message',academy_id:id(7),idempotency_key:'owned-key',relationship_id:id(3),body:'Owned message'});
 assertEquals(args,{p_academy_id:id(2),p_actor_id:id(1),p_command:'send_guardian_message',p_request_key:'owned-key',p_payload:{relationship_id:id(3),body:'Owned message'}});
});
Deno.test('database command capability matrix matches every canonical Edge role',()=>{
 const sql=Deno.readTextFileSync(new URL('../../migrations/20261020160000_academy_command_capabilities.sql',import.meta.url));
 const matrix=JSON.parse(sql.match(/\$roles\$([\s\S]*?)\$roles\$/)![1]);
 const roles=['owner','admin','center_admin','manager','counselor','branch_manager','receptionist','salesperson','cashier','accountant','payroll_officer','parent_liaison','teacher','assistant'];
 for(const role of roles){const permissions=buildAcademyPermissions({tenant_id:id(2),role,status:'active'});
  for(const [capability,allowed] of Object.entries(permissions))assertEquals(matrix[capability]?.includes(role),allowed,role+': '+capability);
 }
});
