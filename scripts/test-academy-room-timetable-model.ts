import {assertEquals} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {roomDateValid,roomDayKeys,roomLocalParts,roomSlotClashes,roomSlotOnDay,roomSlotTime,type RoomSlot} from '../apps/academy/src/lib/roomTimetable.ts';
const slot=(id:string,start:string,end:string,patch:Partial<RoomSlot>={}):RoomSlot=>({id,classroom_id:'class-'+id,classroom_name:id,room_id:'room-'+id,primary_staff_id:'teacher-'+id,teacher_name:id,title:id,delivery_mode:'physical',starts_at:start,ends_at:end,status:'scheduled',...patch});
Deno.test('room grid dates stay calendar dates across leap days, zones and midnight boundaries',()=>{
  assertEquals(roomDateValid('2026-02-29'),false);assertEquals(roomDateValid('2028-02-29'),true);
  assertEquals(roomDayKeys('2028-02-28',3),['2028-02-28','2028-02-29','2028-03-01']);
  assertEquals(roomLocalParts('2026-10-11T19:00:00Z','Asia/Tashkent'),{date:'2026-10-12',time:'00:00',atMidnight:true});
  const midnight=slot('midnight','2026-10-11T18:30:00Z','2026-10-11T19:00:00Z');
  assertEquals(roomSlotOnDay(midnight,'2026-10-12','Asia/Tashkent'),false);
  assertEquals(roomSlotOnDay({...midnight,ends_at:'2026-10-11T19:00:30Z'},'2026-10-12','Asia/Tashkent'),true);
  assertEquals(roomSlotOnDay({...midnight,ends_at:'2026-10-11T19:00:00.001Z'},'2026-10-12','Asia/Tashkent'),true);
  const crosses=slot('crosses','2026-10-11T18:30:00Z','2026-10-11T19:30:00Z');
  assertEquals(roomSlotTime(crosses,'2026-10-11','Asia/Tashkent'),'23:30–24:00');
  assertEquals(roomSlotTime(crosses,'2026-10-12','Asia/Tashkent'),'00:00–00:30');
});
Deno.test('room grid detects teacher and class overlaps across separate rooms and respects adjacent slots',()=>{
  const a=slot('a','2026-10-12T09:00Z','2026-10-12T10:00Z');
  const adjacent=slot('adjacent','2026-10-12T10:00Z','2026-10-12T11:00Z',{room_id:a.room_id});
  assertEquals([...roomSlotClashes([a,adjacent])],[]);
  const teacher=slot('teacher','2026-10-12T09:30Z','2026-10-12T10:30Z',{primary_staff_id:a.primary_staff_id});
  assertEquals([...roomSlotClashes([a,teacher])].sort(),['a','teacher']);
  const classroom=slot('classroom','2026-10-12T09:30Z','2026-10-12T10:30Z',{classroom_id:a.classroom_id});
  assertEquals([...roomSlotClashes([a,classroom])].sort(),['a','classroom']);
  assertEquals([...roomSlotClashes([a,{...teacher,status:'cancelled'}])],[]);
  assertEquals([...roomSlotClashes([{...a,has_recorded_conflict:true}])],['a']);
});
Deno.test('room grid detects nested overlaps without missing shorter bookings',()=>{
  const long=slot('long','2026-10-12T09:00Z','2026-10-12T12:00Z',{room_id:'shared'});
  const early=slot('early','2026-10-12T09:30Z','2026-10-12T10:00Z',{room_id:'shared'});
  const later=slot('later','2026-10-12T11:00Z','2026-10-12T11:30Z',{room_id:'shared'});
  assertEquals([...roomSlotClashes([later,early,long])].sort(),['early','later','long']);
});
