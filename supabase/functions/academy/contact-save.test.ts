import {strict as assert} from 'node:assert';
import {resolveAcademyContactSaveTarget,academyContactSavePayload,ContactSaveTargetError} from './contact-save.ts';
const original={id:'contact-a',primary_branch_id:'branch-a',user_id:'bound-student',created_by:'original-admin',email:'a@example.invalid',phone:'123',academy_id:'academy-a'};
const second={...original,id:'contact-b',email:'b@example.invalid',phone:'456',primary_branch_id:'branch-b'};
const db=(rows=[original,second])=>({from:()=>({select:()=>{
 const filters:[string,unknown][]=[];
 const query={eq:(key:string,value:unknown)=>{filters.push([key,value]);return query;},maybeSingle:()=>Promise.resolve({data:rows.find(row=>filters.every(([key,value])=>(row as Record<string,unknown>)[key]===value))??null,error:null})};return query;
}})});
Deno.test('contact save rejects conflicting phone and email matches',async()=>{
 await assert.rejects(()=>resolveAcademyContactSaveTarget(db(),'academy-a','','a@example.invalid','456'),e=>e instanceof ContactSaveTargetError&&e.status===409);
});
Deno.test('explicit contact cannot borrow another contact identity',async()=>{
 await assert.rejects(()=>resolveAcademyContactSaveTarget(db(),'academy-a','contact-a','b@example.invalid','123'),e=>e instanceof ContactSaveTargetError&&e.status===409);
});
Deno.test('contact lookup stays inside the selected Academy',async()=>{
 assert.equal(await resolveAcademyContactSaveTarget(db(),'academy-other','','a@example.invalid','123'),null);
});
Deno.test('missing explicit contact is not silently inserted',async()=>{
 await assert.rejects(()=>resolveAcademyContactSaveTarget(db(),'academy-a','missing',null,'123'),e=>e instanceof ContactSaveTargetError&&e.status===404);
});
Deno.test('updates retain the bound student and original creation attribution',()=>{
 const patch=academyContactSavePayload({first_name:'Updated'},original,'current-admin','different-account',null);
 assert.equal(patch.user_id,'bound-student');assert.equal(Object.hasOwn(patch,'created_by'),false);assert.equal(Object.hasOwn(patch,'primary_branch_id'),false);
});
Deno.test('new contacts record their actor and selected branch',()=>{
 const patch=academyContactSavePayload({first_name:'New'},null,'current-admin','student-account','branch-a');
 assert.equal(patch.created_by,'current-admin');assert.equal(patch.user_id,'student-account');assert.equal(patch.primary_branch_id,'branch-a');
});
