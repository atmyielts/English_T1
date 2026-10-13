import {assertEquals} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {academyGrantAuthorityEntry,resolveAcademyCapabilityScope, type AcademyAuthorityEntry} from './capability-scope.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const academy=id(1),branch=id(2),classroom=id(3),student=id(4),now=new Date('2026-10-13T14:00:00Z');
const grant=(role:string,scope_type:string,scope_ids:unknown,extra:Partial<AcademyAuthorityEntry>={}):AcademyAuthorityEntry=>({tenant_id:academy,role,status:'active',source:'grant',scope_type,scope_ids,...extra});

Deno.test('declared classroom and student scopes remain narrow even for an administrative role',()=>{
 const rows=[grant('admin','classrooms',[classroom]),grant('manager','students',[student])];
 const staff=resolveAcademyCapabilityScope(academy,rows,'manageStaff',now);
 assertEquals(staff.academyWide,false);assertEquals(staff.classroomIds,[classroom]);assertEquals(staff.studentIds,[]);
 const contacts=resolveAcademyCapabilityScope(academy,rows,'manageContacts',now);
 assertEquals(contacts.academyWide,false);assertEquals(contacts.classroomIds,[classroom]);assertEquals(contacts.studentIds,[student]);
});
Deno.test('a lower-role branch assignment never acquires a higher-role capability',()=>{
 const rows=[grant('admin','classrooms',[classroom]),grant('receptionist','branches',[branch])];
 const staff=resolveAcademyCapabilityScope(academy,rows,'manageStaff',now);
 assertEquals(staff.branchIds,[]);assertEquals(staff.classroomIds,[classroom]);
 const contacts=resolveAcademyCapabilityScope(academy,rows,'manageContacts',now);
 assertEquals(contacts.branchIds,[branch]);assertEquals(contacts.classroomIds,[classroom]);
});
Deno.test('multiple legitimate grants retain their independent capabilities and resource sets',()=>{
 const rows=[grant('accountant','branches',[branch]),grant('teacher','classrooms',[classroom])];
 assertEquals(resolveAcademyCapabilityScope(academy,rows,'adjustFinance',now).branchIds,[branch]);
 assertEquals(resolveAcademyCapabilityScope(academy,rows,'gradeSubmissions',now).classroomIds,[classroom]);
 assertEquals(resolveAcademyCapabilityScope(academy,rows,'gradeSubmissions',now).branchIds,[]);
});
Deno.test('inactive, pending, expired, malformed and foreign grants grant no resources',()=>{
 const rows=[grant('admin','academy',[],{status:'invited'}),grant('admin','academy',[],{status:'revoked'}),grant('admin','academy',[],{expires_at:now.toISOString()}),grant('admin','academy',[],{starts_at:'invalid'}),grant('admin','unknown',[]),grant('admin','academy',[branch]),grant('admin','branches',['bad-id']),grant('admin','branches',[branch],{tenant_id:id(9)})];
 const result=resolveAcademyCapabilityScope(academy,rows,'manageStaff',now);
 assertEquals(result,{academyWide:false,branchIds:[],classroomIds:[],studentIds:[],sources:[]});
});
Deno.test('tenant, center and staff authority coexist without losing valid lower-role assignments',()=>{
 const rows:AcademyAuthorityEntry[]=[{tenant_id:academy,role:'manager',status:'active',source:'tenant'},{tenant_id:academy,role:'center_admin',status:'active',source:'center',center_tenant_id:id(8)},{tenant_id:academy,role:'teacher',status:'active',source:'staff',staff_id:id(7),classroom_ids:[classroom]}];
 const teaching=resolveAcademyCapabilityScope(academy,rows,'gradeSubmissions',now);
 assertEquals(teaching.academyWide,false);assertEquals(teaching.classroomIds,[classroom]);
 const staff=resolveAcademyCapabilityScope(academy,rows,'manageStaff',now);
 assertEquals(staff.academyWide,true);assertEquals(staff.sources.length,1);
});

Deno.test('email-based access requires confirmed Auth identity and cannot steal a bound grant',()=>{
 const principal={userId:id(5),email:'owned@example.invalid',emailVerified:true};
 const raw={id:id(6),academy_id:academy,role:'manager',status:'active',scope_type:'students',scope_ids:[student],email:'owned@example.invalid'};
 const entry=academyGrantAuthorityEntry(raw,principal);
 assertEquals(resolveAcademyCapabilityScope(academy,entry?[entry]:[],'manageContacts',now).studentIds,[student]);
 assertEquals(academyGrantAuthorityEntry(raw,{...principal,emailVerified:false}),null);
 assertEquals(academyGrantAuthorityEntry({...raw,user_id:id(9)},principal),null);
 assertEquals(academyGrantAuthorityEntry({...raw,user_id:''},principal),null);
 assertEquals(academyGrantAuthorityEntry({...raw,status:'invited'},principal),null);
 assertEquals(academyGrantAuthorityEntry({...raw,user_id:principal.userId},{...principal,emailVerified:false})?.grant_id,raw.id);
});
