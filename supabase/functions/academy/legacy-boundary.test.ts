import {currentAcademyAccessProfile} from './legacy-scope-profile.ts';
import { openLegacyBoundary, scopeLegacySelection } from './legacy-boundary.ts';
const academy='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002';
const assert=(value:unknown)=>{if(!value)throw Error('Legacy table boundary assertion failed');};
Deno.test('scoped embeddings preserve explicit and implicit relationship aliases',()=>{
 assert(scopeLegacySelection('id,academy_contacts(id,first_name),teacher:users!staff_user_fkey(id)')==='id,academy_contacts:academy_scope_academy_contacts(id,first_name),teacher:academy_scope_users!staff_user_fkey(id)');
});
Deno.test('legacy reads use private scope views while writes retain base-table triggers',async()=>{
 const calls:unknown[]=[],context={academy_id:academy,actor_id:actor,action:'business_intelligence',mode:'read',authorities:[],entries:[{role:'admin',source:'grant',scope_type:'branches',scope_ids:[academy]}]};
 const b=await openLegacyBoundary(headers=>({from:(name:string)=>({select:(columns:string)=>{calls.push([name,columns]);return{};},insert:(_data:unknown)=>{throw Error('Unexpected base write');}}),rpc:(name:string)=>{calls.push([name,headers]);return Promise.resolve({data:context,error:null});}}),{academy,actor,action:'business_intelligence',mode:'read'});
 b.db.from('academy_contacts').select('id');assert(JSON.stringify(calls).includes('academy_scope_academy_contacts'));
 let denied=false;try{b.db.from('academy_contacts').insert({});}catch{denied=true;}assert(denied);
 denied=false;try{b.db.from('internal_runtime_secrets').select('*');}catch{denied=true;}assert(denied);
 await b.verifyCurrent();
});
Deno.test('a legacy response cannot survive authority changes or an incoherent actor receipt',async()=>{
 let count=0;const b=await openLegacyBoundary(()=>({from:()=>({}),rpc:()=>Promise.resolve({data:{academy_id:academy,actor_id:actor,action:'summary',mode:'read',authorities:++count===1?[]:[{role:'cashier'}],entries:[{role:'admin'}]},error:null})}),{academy,actor,action:'summary',mode:'read'});
 let denied=false;try{await b.verifyCurrent();}catch{denied=true;}assert(denied);
});
Deno.test('a topology change refuses a read without turning a successful topology write into a false failure',async()=>{
 for(const mode of ['read','write'] as const){let count=0;const action=mode==='read'?'summary':'upsert_room';const b=await openLegacyBoundary(()=>({from:()=>({}),rpc:()=>Promise.resolve({data:{academy_id:academy,actor_id:actor,action,mode,authorities:[],entries:[{role:'admin'}],generation:++count},error:null})}),{academy,actor,action,mode});let denied=false;try{await b.verifyCurrent();}catch{denied=true;}assert(denied===(mode==='read'));}
});

Deno.test('nested legacy joins choose the reviewed composite tenant FK without replacing explicit hints',()=>{
 const hints={academy_classroom_memberships:{academy_contacts:'academy_memberships_contact_tenant_fk'},academy_contacts:{users:'academy_contacts_user_id_fkey'}};
 const selected=scopeLegacySelection('id,academy_contacts(id,users(id)),academy_classrooms!custom_fk!inner(id)','academy_classroom_memberships',hints);
 assert(selected==='id,academy_contacts:academy_scope_academy_contacts!academy_memberships_contact_tenant_fk(id,users:academy_scope_users!academy_contacts_user_id_fkey(id)),academy_classrooms:academy_scope_academy_classrooms!custom_fk!inner(id)');
});

Deno.test('selected-branch summaries use the current cashier binding instead of a cached owner role',async()=>{
 const entry={role:'cashier',source:'grant',scope_type:'branches',scope_ids:[academy]};
 const boundary=await openLegacyBoundary(()=>({from:()=>({}),rpc:()=>Promise.resolve({data:{academy_id:academy,actor_id:actor,action:'summary',mode:'read',authorities:[entry],entries:[entry]},error:null})}),{academy,actor,action:'summary',mode:'read'});
 const profile=currentAcademyAccessProfile(boundary.membership({tenant_id:academy,role:'owner',status:'active',source:'tenant'}));
 assert(profile.role==='cashier'&&profile.scope==='assigned_branches');
 assert((profile.permissions as Record<string,boolean>).manageAcademy===false);
});

Deno.test('actual database capability refusals remain 403 through chained reads and writes',async()=>{
 const entry={role:'admin',source:'grant',scope_type:'branches',scope_ids:[academy]},context={academy_id:academy,actor_id:actor,action:'upsert_room',mode:'write',authorities:[entry],entries:[entry]};
 const denied={then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:null,error:{code:'42501'}}).then(resolve),eq(..._args:unknown[]){return this;},select(..._args:unknown[]){return this;}};
 const boundary=await openLegacyBoundary(()=>({from:(..._args:unknown[])=>({select:(..._args:unknown[])=>denied,update:(..._args:unknown[])=>denied}),rpc:()=>Promise.resolve({data:context,error:null})}),{academy,actor,action:'upsert_room',mode:'write'});
 for(const query of [()=>boundary.db.from('academy_rooms').update({name:'denied'}).eq('id',academy).select('id'),()=>boundary.db.from('academy_rooms').select('id').eq('id',academy)]){
  let status=0;try{await query();}catch(error){status=(error as {status:number}).status;}assert(status===403);
 }
});
