import {academyAccessBranchIds,buildAcademyPermissions,type MembershipRow} from './access.ts';

type SnapshotDb={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message:string;code?:string}|null}>};
export class RoomTimetableError extends Error {
  constructor(public status:number,message:string){super(message);this.name='RoomTimetableError';}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readAcademyRoomBranches(db:SnapshotDb,access:MembershipRow):Promise<Record<string,unknown>>{
  if(!buildAcademyPermissions(access).viewRoomTimetable)throw new RoomTimetableError(403,'Forbidden');
  if(!uuid.test(access.tenant_id))throw new RoomTimetableError(403,'Forbidden');
  const allowed=academyAccessBranchIds(access);
  const ids=allowed===null?null:allowed.filter(id=>uuid.test(id)).map(id=>id.toLowerCase());
  const {data,error}=await db.rpc('academy_room_timetable_branches',{p_academy_id:access.tenant_id.toLowerCase(),p_branch_ids:ids});
  const response=data&&typeof data==='object'&&!Array.isArray(data)?data as Record<string,unknown>:null;
  if(error||!response||!Array.isArray(response.branches)||typeof response.truncated!=='boolean'
    ||response.branches.some(branch=>!branch||typeof branch!=='object'||typeof branch.id!=='string'||!uuid.test(branch.id)
      ||typeof branch.timezone!=='string'||(ids!==null&&!ids.includes(branch.id)))){
    throw new RoomTimetableError(503,'The room timetable is unavailable. Please try again.');
  }
  return response;
}

// Validate the complete original input. Do not accept a valid prefix after
// truncating a date, UUID or window supplied by the browser.
export const validRoomTimetableDate=(value:unknown):value is string=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(value+'T00:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
};
export async function readAcademyRoomTimetable(db:SnapshotDb,access:MembershipRow,raw:unknown):Promise<Record<string,unknown>>{
  if(!buildAcademyPermissions(access).viewRoomTimetable)throw new RoomTimetableError(403,'Forbidden');
  const request=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
  const branch=request.branch_id;
  const from=request.from;
  const days=request.days===undefined?7:request.days;
  const window=typeof days==='number'?days:typeof days==='string'&&/^(1|7|14)$/.test(days)?Number(days):NaN;
  if(typeof branch!=='string'||!uuid.test(branch)||!uuid.test(access.tenant_id)||!validRoomTimetableDate(from)||![1,7,14].includes(window)){
    throw new RoomTimetableError(400,'Choose a branch, a valid start date, and a 1, 7 or 14 day window.');
  }
  const branchId=branch.toLowerCase();
  const allowed=academyAccessBranchIds(access);
  if(allowed!==null&&!allowed.some(id=>id.toLowerCase()===branchId))throw new RoomTimetableError(403,'Forbidden');
  const {data,error}=await db.rpc('academy_room_timetable_snapshot',{
    p_academy_id:access.tenant_id.toLowerCase(),p_branch_id:branchId,p_from:from,p_days:window,
  });
  if(error)throw new RoomTimetableError(error.message==='Branch not found'?404:503,'The room timetable is unavailable. Please try again.');
  const snapshot=data&&typeof data==='object'&&!Array.isArray(data)?data as Record<string,unknown>:null;
  const selected=snapshot?.branch&&typeof snapshot.branch==='object'?snapshot.branch as Record<string,unknown>:null;
  const warnings=snapshot?.warnings&&typeof snapshot.warnings==='object'&&!Array.isArray(snapshot.warnings)?snapshot.warnings as Record<string,unknown>:null;
  const arrays=['rooms','sessions','planned','closures','unassigned_schedules'];
  const flags=['rooms_truncated','sessions_truncated','series_truncated','plans_truncated','closures_truncated','unassigned_truncated'];
  const counts=['series_needing_setup','invalid_occurrences','room_branch_mismatches'];
  const start=typeof snapshot?.starts_at==='string'?Date.parse(snapshot.starts_at):NaN;
  const end=typeof snapshot?.ends_at==='string'?Date.parse(snapshot.ends_at):NaN;
  let validZone=false;
  try{if(typeof selected?.timezone==='string'){new Intl.DateTimeFormat('en',{timeZone:selected.timezone});validZone=true;}}catch{/* Bad configuration must not be rendered as empty availability. */}
  if(!snapshot||snapshot.schema_version!==1||selected?.id!==branchId||snapshot.from!==from||snapshot.days!==window
    ||!validZone||!Number.isFinite(start)||!Number.isFinite(end)||end<=start
    ||!arrays.every(key=>Array.isArray(snapshot[key]))||!warnings
    ||!flags.every(key=>typeof warnings[key]==='boolean')
    ||!counts.every(key=>typeof warnings[key]==='number'&&Number.isInteger(warnings[key])&&Number(warnings[key])>=0)){
    throw new RoomTimetableError(503,'The room timetable returned an incomplete response. Please try again.');
  }
  return snapshot;
}
