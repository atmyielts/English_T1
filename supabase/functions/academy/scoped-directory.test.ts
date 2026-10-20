import {strict as assert} from 'node:assert';
import {readAcademyScopedDirectory,ScopedDirectoryError} from './scoped-directory.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,actor=id(1),academy=id(2);
Deno.test('directory passes the verified actor and only bounded query fields',async()=>{
 let args:Record<string,unknown>|undefined;
 const db={rpc:async(name:string,input:Record<string,unknown>)=>{assert.equal(name,'academy_scoped_directory');args=input;return {data:{contacts:[{id:id(3),academy_id:academy}],has_more:false,cursor:null},error:null};}};
 await readAcademyScopedDirectory(db,actor,academy,'contacts',{actor_id:id(9),query:' Aziz ',limit:'20',branch_ids:[id(8)]});
 assert.deepEqual(args,{p_actor_id:actor,p_academy_id:academy,p_action:'contacts',p_payload:{query:'Aziz',limit:20}});
});
Deno.test('invalid pages and scope identities never reach the database',async()=>{
 let calls=0;const db={rpc:async()=>{calls++;return {data:{},error:null};}};
 for(const input of [{limit:true},{limit:301},{query:'x'.repeat(121)},{before_id:id(3)},{classroom_id:'bad'}])await assert.rejects(()=>readAcademyScopedDirectory(db,actor,academy,'contacts',input),e=>e instanceof ScopedDirectoryError&&e.status===400);
 await assert.rejects(()=>readAcademyScopedDirectory(db,'bad',academy,'contacts'),e=>e instanceof ScopedDirectoryError&&e.status===403);assert.equal(calls,0);
});
Deno.test('roster pages preserve the previous thousand-record limit',async()=>{
 const db={rpc:async(_name:string,args:Record<string,unknown>)=>{assert.deepEqual(args.p_payload,{limit:1000,classroom_id:id(3)});return {data:{classroom_memberships:[],has_more:false,cursor:null},error:null};}};
 await readAcademyScopedDirectory(db,actor,academy,'classroom-memberships',{classroom_id:id(3)});
});
Deno.test('permission denial and unavailable schema produce separate safe errors',async()=>{
 for(const [code,status] of [['42501',403],['PGRST202',503],['57014',503],['22007',400]] as const){
  const db={rpc:async()=>({data:null,error:{code}})};
  await assert.rejects(()=>readAcademyScopedDirectory(db,actor,academy,'contacts'),e=>e instanceof ScopedDirectoryError&&e.status===status);
 }
});
Deno.test('a foreign row or incomplete cursor cannot be accepted as a directory page',async()=>{
 for(const result of [{contacts:[{id:id(3),academy_id:id(9)}],has_more:false,cursor:null},{contacts:[{id:id(3),academy_id:academy}],has_more:true,cursor:null}]){
  const db={rpc:async()=>({data:result,error:null})};await assert.rejects(()=>readAcademyScopedDirectory(db,actor,academy,'contacts'),e=>e instanceof ScopedDirectoryError&&e.status===503);
 }
});
Deno.test('limited class access retains hidden count rather than publishing a false zero',async()=>{
 const row={id:id(3),academy_id:academy,roster_visible:false,member_count:null};
 const db={rpc:async()=>({data:{classrooms:[row],has_more:false,cursor:null},error:null})};
 const result=await readAcademyScopedDirectory(db,actor,academy,'classrooms');assert.equal((result.classrooms as typeof row[])[0].member_count,null);
 const wrong={rpc:async()=>({data:{classrooms:[{...row,member_count:0}],has_more:false,cursor:null},error:null})};await assert.rejects(()=>readAcademyScopedDirectory(wrong,actor,academy,'classrooms'));
});
