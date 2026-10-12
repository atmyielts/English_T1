export type RoomBranch={id:string;name:string;timezone:string;is_active:boolean};
export type RoomSlot={id?:string;series_id?:string;occurrence_date?:string;classroom_id:string;classroom_name:string|null;room_id:string|null;primary_staff_id:string;teacher_name:string|null;title:string;delivery_mode:string;starts_at:string;ends_at:string;status?:string;room_branch_mismatch?:boolean;has_recorded_conflict?:boolean};
export type RoomTimetable={schema_version:1;branch:RoomBranch;from:string;days:number;starts_at:string;ends_at:string;generated_at:string;rooms:Array<{id:string;name:string;capacity:number;is_active:boolean}>;sessions:RoomSlot[];planned:RoomSlot[];closures:Array<{id:string;name:string;starts_at:string;ends_at:string}>;unassigned_schedules:Array<{id:string;classroom_id:string;classroom_name:string;day_of_week:number;start_time:string;end_time:string|null;timezone:string}>;warnings:{series_needing_setup:number;invalid_occurrences:number;room_branch_mismatches:number;rooms_truncated:boolean;sessions_truncated:boolean;series_truncated:boolean;plans_truncated:boolean;closures_truncated:boolean;unassigned_truncated:boolean}};
export const roomDateValid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export const shiftRoomDate=(day:string,offset:number)=>new Date(Date.parse(day+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
export const roomDayKeys=(from:string,days:number)=>Array.from({length:days},(_,i)=>shiftRoomDate(from,i));
const formatters=new Map<string,Intl.DateTimeFormat>();
export function roomLocalParts(instant:string,zone:string){
  let formatter=formatters.get(zone);
  if(!formatter){
    if(formatters.size>=16)formatters.clear();
    formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});formatters.set(zone,formatter);
  }
  const parts=formatter.formatToParts(new Date(instant));
  const value=(kind:string)=>parts.find(p=>p.type===kind)?.value??'';
  return {date:`${value('year')}-${value('month')}-${value('day')}`,time:`${value('hour')}:${value('minute')}`,atMidnight:value('hour')==='00'&&value('minute')==='00'&&value('second')==='00'&&new Date(instant).getMilliseconds()===0};
}
export const roomSlotKey=(slot:RoomSlot)=>slot.id??`${slot.series_id}:${slot.occurrence_date}`;
export function roomSlotOnDay(slot:Pick<RoomSlot,'starts_at'|'ends_at'>,day:string,zone:string){
  const start=roomLocalParts(slot.starts_at,zone),end=roomLocalParts(slot.ends_at,zone);
  return start.date<=day&&(end.date>day||(end.date===day&&!end.atMidnight));
}
export function roomSlotTime(slot:Pick<RoomSlot,'starts_at'|'ends_at'>,day:string,zone:string){
  const start=roomLocalParts(slot.starts_at,zone),end=roomLocalParts(slot.ends_at,zone);
  return `${start.date<day?'00:00':start.time}–${end.date>day?'24:00':end.time}`;
}
// Linear after sorting, rather than comparing every pair in a busy calendar.
export function roomSlotClashes(slots:RoomSlot[]){
  const conflicts=new Set<string>();
  const groups=new Map<string,RoomSlot[]>();
  for(const slot of slots){
    if(slot.status&&!['scheduled','confirmed','in_progress'].includes(slot.status))continue;
    if(slot.has_recorded_conflict)conflicts.add(roomSlotKey(slot));
    for(const resource of [slot.room_id?'room:'+slot.room_id:null,slot.primary_staff_id?'teacher:'+slot.primary_staff_id:null,slot.classroom_id?'classroom:'+slot.classroom_id:null]){
      if(!resource)continue;
      const group=groups.get(resource)??[];group.push(slot);groups.set(resource,group);
    }
  }
  for(const group of groups.values()){
    group.sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
    let longest:RoomSlot|null=null;
    for(const slot of group){
      if(longest&&Date.parse(slot.starts_at)<Date.parse(longest.ends_at)){conflicts.add(roomSlotKey(longest));conflicts.add(roomSlotKey(slot));}
      if(!longest||Date.parse(slot.ends_at)>Date.parse(longest.ends_at))longest=slot;
    }
  }
  return conflicts;
}
