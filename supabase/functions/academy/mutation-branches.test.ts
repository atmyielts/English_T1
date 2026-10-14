import {strict as assert} from 'node:assert';
import {validateAcademyMutationBranches} from './mutation-branches.ts';
const academy='academy',other='other-academy',branch='owned-branch',foreign='foreign-branch';
function database(patch:Record<string,Record<string,unknown>[]>={}){
 const tables:Record<string,Record<string,unknown>[]>= {
  academy_branches:[{id:branch,academy_id:academy},{id:foreign,academy_id:academy}],
  academy_contacts:[{id:'own-contact',academy_id:academy,primary_branch_id:branch},{id:'foreign-contact',academy_id:academy,primary_branch_id:foreign},{id:'cross-tenant',academy_id:other,primary_branch_id:branch}],
  academy_classrooms:[{id:'own-class',academy_id:academy,branch_id:branch},{id:'foreign-class',academy_id:academy,branch_id:foreign}],
  academy_charges:[{id:'own-charge',academy_id:academy,branch_id:branch},{id:'foreign-charge',academy_id:academy,branch_id:foreign}],
  academy_payments:[{id:'own-payment',academy_id:academy,contact_id:'own-contact'},{id:'foreign-payment',academy_id:academy,contact_id:'foreign-contact'}],
  academy_cashier_shifts:[{id:'foreign-shift',academy_id:academy,cashbox_id:'foreign-cashbox'}],
  academy_cashboxes:[{id:'foreign-cashbox',academy_id:academy,branch_id:foreign}],
  academy_collection_cases:[{id:'foreign-case',academy_id:academy,branch_id:foreign}],
  academy_intervention_cases:[{id:'foreign-intervention',academy_id:academy,contact_id:'foreign-contact'}],
  academy_classroom_schedules:[{id:'foreign-schedule',academy_id:academy,classroom_id:'foreign-class'}],
  ...patch,
 };
 const calls:{table:string;ids:string[]}[]=[];
 const db={from:(table:string)=>({select:()=>({eq:(_key:string,tenant:unknown)=>({in:(_key:string,ids:string[])=>{calls.push({table,ids});return Promise.resolve({data:(tables[table]??[]).filter(row=>row.academy_id===tenant&&ids.includes(String(row.id))),error:null});}})})})};
 return {db,calls};
}
for(const [name,action,body] of [
 ['claimed branch cannot hide a foreign contact','upsert_contact',{branch_id:branch,id:'foreign-contact'}],
 ['claimed branch cannot hide a foreign collection case','record_collection_attempt',{branch_id:branch,case_id:'foreign-case'}],
 ['an allowed contact cannot hide a foreign charge','allocate_payment',{contact_id:'own-contact',charge_id:'foreign-charge'}],
 ['an allowed charge cannot hide a foreign payment','allocate_payment',{charge_id:'own-charge',payment_id:'foreign-payment'}],
 ['an allowed branch cannot hide a foreign shift','record_cash_movement',{branch_id:branch,shift_id:'foreign-shift'}],
 ['the old schedule must be authorized before moving it','upsert_schedule',{branch_id:branch,classroom_id:'own-class',id:'foreign-schedule'}],
 ['both branch fields are verified','upsert_contact',{branch_id:branch,primary_branch_id:foreign}],
 ['every nested attendance student is verified','record_session_attendance',{classroom_id:'own-class',records:[{contact_id:'own-contact'},{contact_id:'foreign-contact'}]}],
 ['foreign tenant records cannot borrow an allowed branch','upsert_contact',{branch_id:branch,id:'cross-tenant'}],
 ['unknown records are rejected','update_service_request',{branch_id:branch,id:'missing-request'}],
 ['an intervention is resolved through its stored student','update_intervention',{branch_id:branch,id:'foreign-intervention'}],
 ] as const) Deno.test(name,async()=>{const {db}=database();assert.equal(await validateAcademyMutationBranches(db,academy,[branch],body,action),false);});
Deno.test('same-branch financial references remain usable',async()=>{
 const {db}=database();assert.equal(await validateAcademyMutationBranches(db,academy,[branch],{branch_id:branch,contact_id:'own-contact',payment_id:'own-payment',charge_id:'own-charge'},'allocate_payment'),true);
});
Deno.test('empty assignment cannot create a resource',async()=>{
 const {db}=database();assert.equal(await validateAcademyMutationBranches(db,academy,[],{branch_id:branch},'create_cashbox'),false);
});
Deno.test('lookup errors cannot authorize a write',async()=>{
 const db={from:()=>({select:()=>({eq:()=>({in:()=>Promise.resolve({data:null,error:{message:'owned fixture'}})})})})};
 assert.equal(await validateAcademyMutationBranches(db,academy,[branch],{contact_id:'own-contact'},'upsert_contact'),false);
});
Deno.test('bulk IDs are deduplicated and verified in bounded pages',async()=>{
 const contacts=Array.from({length:450},(_,i)=>({id:'contact-'+i,academy_id:academy,primary_branch_id:branch}));
 const {db,calls}=database({academy_contacts:contacts});
 assert.equal(await validateAcademyMutationBranches(db,academy,[branch],{contact_ids:[...contacts.map(c=>c.id),contacts[0].id]},'bulk_invite'),true);
 assert.deepEqual(calls.map(call=>call.ids.length),[200,200,50]);
});
Deno.test('unscoped ownership leaves this branch boundary to ordinary tenant validation',async()=>{
 const {db,calls}=database();assert.equal(await validateAcademyMutationBranches(db,academy,null,{contact_id:'own-contact'},'upsert_contact'),true);assert.equal(calls.length,0);
});
