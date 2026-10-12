import {assertEquals,assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {readAcademyRoomTimetable,readAcademyRoomBranches,RoomTimetableError,validRoomTimetableDate} from './room-timetable.ts';
import type {MembershipRow} from './access.ts';
const academy='00000000-0000-4000-8000-000000000001',branch='00000000-0000-4000-8000-000000000002';
const request={branch_id:branch,from:'2026-10-12',days:7};
const access=(role:string,branch_ids:string[]=[]):MembershipRow=>({tenant_id:academy,role,status:'active',source:'grant',branch_ids});
const fixture=(override:Record<string,unknown>={})=>{
  const calls:Array<{name:string;args:Record<string,unknown>}>=[];
  return {calls,db:{rpc:(name:string,args:Record<string,unknown>)=>{
    calls.push({name,args});return Promise.resolve({data:{schema_version:1,branch:{id:branch,timezone:'Asia/Tashkent'},from:args.p_from,days:args.p_days,
      starts_at:'2026-10-11T19:00:00Z',ends_at:'2026-10-18T19:00:00Z',rooms:[],sessions:[],planned:[],closures:[],unassigned_schedules:[],
      warnings:{rooms_truncated:false,sessions_truncated:false,series_truncated:false,plans_truncated:false,closures_truncated:false,unassigned_truncated:false,series_needing_setup:0,invalid_occurrences:0,room_branch_mismatches:0},...override},error:null});
  }}};
};
Deno.test('room calendar gives reception read access without giving teaching or finance roles a branch-wide view',async()=>{
  for(const role of ['owner','admin','center_admin','manager','counselor','branch_manager','receptionist']){
    const f=fixture();await readAcademyRoomTimetable(f.db,access(role,[branch]),request);assertEquals(f.calls.length,1);
  }
  for(const role of ['teacher','assistant','cashier','accountant','payroll_officer','parent_liaison','salesperson','student','member']){
    const f=fixture();await assertRejects(()=>readAcademyRoomTimetable(f.db,access(role,[branch]),request),RoomTimetableError,'Forbidden');assertEquals(f.calls.length,0);
  }
});
Deno.test('room calendar scope and bounds reach the database in one call, with no unscoped read first',async()=>{
  const f=fixture();await readAcademyRoomTimetable(f.db,access('receptionist',[branch]),request);
  assertEquals(f.calls,[{name:'academy_room_timetable_snapshot',args:{p_academy_id:academy,p_branch_id:branch,p_from:'2026-10-12',p_days:7}}]);
  for(const branches of [[],['00000000-0000-4000-8000-000000000099']]){
    const denied=fixture();await assertRejects(()=>readAcademyRoomTimetable(denied.db,access('receptionist',branches),request),RoomTimetableError,'Forbidden');assertEquals(denied.calls.length,0);
  }
});
Deno.test('branch dropdown sends server-owned branch scope to SQL before any result limit',async()=>{
  const calls:Array<Record<string,unknown>>=[];
  const db={rpc:(_name:string,args:Record<string,unknown>)=>{calls.push(args);return Promise.resolve({data:{branches:[],truncated:false},error:null});}};
  await readAcademyRoomBranches(db,access('receptionist',[branch]));
  await readAcademyRoomBranches(db,access('receptionist',[]));
  await readAcademyRoomBranches(db,access('owner'));
  assertEquals(calls,[{p_academy_id:academy,p_branch_ids:[branch]},{p_academy_id:academy,p_branch_ids:[]},{p_academy_id:academy,p_branch_ids:null}]);
  await assertRejects(()=>readAcademyRoomBranches(db,access('teacher',[branch])),RoomTimetableError,'Forbidden');assertEquals(calls.length,3);
  const foreign={rpc:()=>Promise.resolve({data:{branches:[{id:'00000000-0000-4000-8000-000000000099',timezone:'UTC'}],truncated:false},error:null})};
  await assertRejects(()=>readAcademyRoomBranches(foreign,access('receptionist',[branch])),RoomTimetableError,'unavailable');
});
Deno.test('full dates, branch identities and allowed windows are validated without truncation',async()=>{
  assertEquals(validRoomTimetableDate('2028-02-29'),true);
  for(const days of [1,7,14,'1','7','14']){
    const f=fixture();await readAcademyRoomTimetable(f.db,access('owner'),{...request,days});assertEquals(f.calls[0].args.p_days,Number(days));
  }
  for(const from of ['2026-02-29','2026-04-31','2026-00-10','2026-10-12junk',' 2026-10-12',null,20261012]){
    assertEquals(validRoomTimetableDate(from),false);
    const f=fixture();await assertRejects(()=>readAcademyRoomTimetable(f.db,access('owner'),{...request,from}),RoomTimetableError);assertEquals(f.calls.length,0);
  }
  for(const patch of [{branch_id:branch+'junk'},{days:'7junk'},{days:30},{days:NaN},{days:null},{days:[]},{branch_id:null}]){
    const f=fixture();await assertRejects(()=>readAcademyRoomTimetable(f.db,access('owner'),{...request,...patch}),RoomTimetableError);assertEquals(f.calls.length,0);
  }
});
Deno.test('missing or mismatched snapshots fail closed instead of showing empty available rooms',async()=>{
  for(const patch of [{schema_version:undefined},{branch:{id:'foreign'}},{from:'2026-10-13'},{days:14},{sessions:null},{warnings:{}},{ends_at:'bad'},{branch:{id:branch,timezone:'bad/zone'}}]){
    const f=fixture(patch);await assertRejects(()=>readAcademyRoomTimetable(f.db,access('owner'),request),RoomTimetableError,'incomplete response');
  }
  const db={rpc:()=>Promise.resolve({data:null,error:{message:'Internal schema detail',code:'PGRST202'}})};
  await assertRejects(()=>readAcademyRoomTimetable(db,access('owner'),request),RoomTimetableError,'unavailable');
});
