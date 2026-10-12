import {useEffect,useMemo,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,RefreshCw} from 'lucide-react';
import {getLocaleTag,translate} from '../../i18n';
import {teacherStudioRoomBranches,teacherStudioRoomTimetable} from '../../lib/client';
import {roomDateValid,roomDayKeys,roomLocalParts,roomSlotClashes,roomSlotKey,roomSlotOnDay,roomSlotTime,shiftRoomDate,type RoomBranch,type RoomSlot,type RoomTimetable} from '../../lib/roomTimetable';
import './room-timetable.css';

const statusLabel=(status?:string)=>{
  if(status==='completed')return translate('Completed');
  if(status==='cancelled')return translate('Cancelled');
  if(status==='rescheduled')return translate('Rescheduled');
  if(status==='missed')return translate('Missed');
  if(status==='in_progress')return translate('In progress');
  if(status==='confirmed')return translate('Confirmed');
  return translate('Scheduled lesson');
};
const roomError=(message:string)=>{
  if(message==='Choose a branch, a valid start date, and a 1, 7 or 14 day window.')return translate('Choose a branch, a valid start date, and a 1, 7 or 14 day window.');
  if(message==='The room timetable is unavailable. Please try again.')return translate('The room timetable is unavailable. Please try again.');
  if(message==='The room timetable returned an incomplete response. Please try again.')return translate('The room timetable returned an incomplete response. Please try again.');
  return translate(message);
};

export function RoomTimetableView({academyId,onManage}:{academyId:string;onManage?:()=>void}){
  const [branchState,setBranchState]=useState<{academyId:string;revision:number;branches:RoomBranch[];truncated:boolean;error?:string}|null>(null);
  const [branchId,setBranchId]=useState('');
  const [from,setFrom]=useState('');
  const [days,setDays]=useState(()=>window.matchMedia('(max-width:640px)').matches?1:7);
  const [data,setData]=useState<{scope:string;snapshot:RoomTimetable|null;error?:string}|null>(null);
  const [revision,setRevision]=useState(0);
  const [branchRevision,setBranchRevision]=useState(0);
  const [roomFilter,setRoomFilter]=useState('');
  const [page,setPage]=useState(0);
  const [selected,setSelection]=useState<{scope:string;slot:RoomSlot}|null>(null);
  const branchReady=branchState?.academyId===academyId&&branchState.revision===branchRevision;
  const branches=branchReady?branchState.branches:[];
  const branch=branches.find(b=>b.id===branchId);
  const scope=`${academyId}:${branchId}:${from}:${days}:${revision}`;
  useEffect(()=>{
    let active=true;
    void teacherStudioRoomBranches(academyId).then(next=>{
      if(!active)return;
      setBranchState({academyId,revision:branchRevision,...next});
      const first=next.branches.find(b=>b.is_active)??next.branches[0];
      setBranchId(first?.id??'');
      setFrom(first?roomLocalParts(new Date().toISOString(),first.timezone).date:'');
      setRoomFilter('');setPage(0);setSelection(null);
    }).catch(e=>{if(active)setBranchState({academyId,revision:branchRevision,branches:[],truncated:false,error:e instanceof Error?e.message:translate('Unable to load the room timetable.')});});
    return()=>{active=false;};
  },[academyId,branchRevision]);
  useEffect(()=>{
    if(!branch||!roomDateValid(from))return;
    let active=true;
    void teacherStudioRoomTimetable(academyId,branch.id,from,days).then(snapshot=>{
      if(active)setData({scope,snapshot});
    }).catch(e=>{if(active)setData({scope,snapshot:null,error:e instanceof Error?e.message:translate('Unable to load the room timetable.')});});
    return()=>{active=false;};
  },[academyId,branch,from,days,scope]);
  const snapshot=data?.scope===scope?data.snapshot:null;
  const error=(branchReady?branchState.error:'')||(data?.scope===scope?data.error:'');
  const loading=!branchReady||Boolean(branch&&roomDateValid(from)&&data?.scope!==scope);
  const selection=selected?.scope===scope?selected.slot:null;
  const dates=useMemo(()=>roomDateValid(from)?roomDayKeys(from,days):[],[from,days]);
  const slots=useMemo(()=>snapshot?[...snapshot.sessions,...snapshot.planned]:[],[snapshot]);
  const conflicts=useMemo(()=>roomSlotClashes(slots),[slots]);
  const cells=useMemo(()=>{
    const result=new Map<string,RoomSlot[]>();
    if(!snapshot)return result;
    for(const slot of slots){
      if(!slot.room_id)continue;
      const start=roomLocalParts(slot.starts_at,snapshot.branch.timezone),end=roomLocalParts(slot.ends_at,snapshot.branch.timezone);
      for(const day of dates){
        if(start.date>day||end.date<day||(end.date===day&&end.time==='00:00'))continue;
        const key=slot.room_id+':'+day,list=result.get(key)??[];list.push(slot);result.set(key,list);
      }
    }
    for(const list of result.values())list.sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
    return result;
  },[snapshot,slots,dates]);
  const rooms=snapshot?.rooms.filter(r=>!roomFilter||r.id===roomFilter)??[];
  const visibleRooms=rooms.slice(page*10,page*10+10);
  const warning=snapshot?.warnings;
  const partial=Boolean(branchState?.truncated||(warning&&Object.entries(warning).some(([key,value])=>key.endsWith('_truncated')&&value)));
  const setup=Boolean(snapshot&&(snapshot.unassigned_schedules.length||warning?.series_needing_setup||warning?.invalid_occurrences||warning?.room_branch_mismatches));
  const dayLabel=(day:string)=>new Intl.DateTimeFormat(getLocaleTag(),{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(new Date(day+'T12:00:00Z'));
  const reload=()=>{if(branch)setRevision(v=>v+1);else setBranchRevision(v=>v+1);};
  return <section className="room-timetable" aria-busy={loading}>
    <div className="room-timetable__intro"><div><p>{translate('See lessons across rooms and spot scheduling conflicts.')}</p></div>{onManage?<button className="primary-btn" onClick={onManage}><CalendarDays size={16}/>{translate('Manage lessons')}</button>:null}</div>
    <div className="panel room-timetable__toolbar">
      <label>{translate('Branch')}<select className="input" value={branchId} disabled={!branches.length} onChange={e=>{setBranchId(e.target.value);setRoomFilter('');setPage(0);setSelection(null);}}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>{translate('Start date')}<input className="input" type="date" value={from} onChange={e=>{setFrom(e.target.value);setPage(0);}}/></label>
      <label>{translate('View')}<select className="input" value={days} onChange={e=>{setDays(Number(e.target.value));setPage(0);}}><option value={1}>{translate('Day')}</option><option value={7}>{translate('Week')}</option><option value={14}>{translate('Two weeks')}</option></select></label>
      <label>{translate('Room')}<select className="input" value={roomFilter} onChange={e=>{setRoomFilter(e.target.value);setPage(0);}}><option value="">{translate('All rooms')}</option>{snapshot?.rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <div className="room-timetable__date-actions"><button className="small-btn" aria-label={translate('Previous period')} disabled={!roomDateValid(from)} onClick={()=>setFrom(shiftRoomDate(from,-days))}><ChevronLeft size={18}/></button><button className="small-btn" disabled={!branch} onClick={()=>branch&&setFrom(roomLocalParts(new Date().toISOString(),branch.timezone).date)}>{translate('Today')}</button><button className="small-btn" aria-label={translate('Next period')} disabled={!roomDateValid(from)} onClick={()=>setFrom(shiftRoomDate(from,days))}><ChevronRight size={18}/></button><button className="small-btn" aria-label={translate('Refresh timetable')} onClick={reload}><RefreshCw size={16}/></button></div>
    </div>
    {error?<div className="error-box" role="alert">{roomError(error)} <button className="small-btn" onClick={reload}>{translate('Try again')}</button></div>:null}
    {loading&&!snapshot?<div className="panel room-timetable__empty" role="status">{translate('Loading room timetable...')}</div>:null}
    {!loading&&!error&&!branches.length?<div className="panel room-timetable__empty"><h3>{translate('No branches available')}</h3><p>{translate('Ask your Academy administrator to assign a branch or set one up.')}</p></div>:null}
    {snapshot?<>
      <div className="room-timetable__legend"><span><i className="is-booked"/>{translate('Scheduled lesson')}</span><span><i className="is-plan"/>{translate('Recurring plan · not booked')}</span><span><i className="is-conflict"/>{translate('Scheduling conflict')}</span><span>{snapshot.branch.timezone}</span></div>
      {partial?<p className="room-timetable__warning" role="alert">{translate('Some records are not loaded. This view cannot confirm availability.')}</p>:null}
      {setup?<div className="room-timetable__warning"><strong>{translate('Timetable setup needs attention')}</strong><p>{translate('Some weekly lessons need a room or teacher, or have invalid times. Empty cells do not confirm availability.')}</p>{onManage?<button className="small-btn" onClick={onManage}>{translate('Review timetable setup')}</button>:null}</div>:null}
      <p className="room-timetable__note">{translate('Recurring plans are shown separately from booked lessons.')}</p>
      {rooms.length?<div className="panel room-timetable__grid-wrap" tabIndex={0} aria-label={translate('Room timetable')}><table className="room-timetable__grid"><caption className="sr-only">{translate('Room timetable')}</caption><thead><tr><th scope="col">{translate('Room')}</th>{dates.map(day=><th scope="col" key={day}>{dayLabel(day)}{snapshot.closures.filter(c=>roomSlotOnDay(c,day,snapshot.branch.timezone)).map(c=><span className="room-timetable__closure" key={c.id}>{c.name} · {roomSlotTime(c,day,snapshot.branch.timezone)}</span>)}</th>)}</tr></thead><tbody>{visibleRooms.map(room=><tr key={room.id}><th scope="row"><strong>{room.name}</strong><small>{translate('Capacity')} {room.capacity}</small>{!room.is_active?<small>{translate('Inactive')}</small>:null}</th>{dates.map(day=>{
        const entries=cells.get(room.id+':'+day)??[];
        return <td key={day}>{entries.map(slot=>{const key=roomSlotKey(slot),planned=!slot.id,clash=conflicts.has(key);return <button key={key} className={`room-timetable__lesson ${planned?'is-plan':'is-booked'} ${clash?'is-conflict':''} ${slot.status&&['cancelled','rescheduled','missed'].includes(slot.status)?'is-inactive':''}`} onClick={()=>setSelection({scope,slot})}><strong>{roomSlotTime(slot,day,snapshot.branch.timezone)}</strong><span>{slot.classroom_name??slot.title}</span><small>{slot.teacher_name??translate('Teacher not assigned')}</small><small>{clash?translate('Scheduling conflict'):planned?translate('Not booked'):statusLabel(slot.status)}</small></button>;})}{!entries.length?<span className="room-timetable__no-lessons">{translate('No recorded lessons')}</span>:null}</td>;
      })}</tr>)}</tbody></table></div>:<div className="panel room-timetable__empty"><h3>{translate('No rooms in this branch')}</h3><p>{translate('Add physical rooms to see their timetable.')}</p></div>}
      {rooms.length>10?<div className="room-timetable__pagination"><span>{page*10+1}–{Math.min(page*10+10,rooms.length)} / {rooms.length}</span><button className="small-btn" disabled={page===0} onClick={()=>setPage(p=>p-1)}>{translate('Previous')}</button><button className="small-btn" disabled={(page+1)*10>=rooms.length} onClick={()=>setPage(p=>p+1)}>{translate('Next')}</button></div>:null}
      {selection?<section className="panel room-timetable__details" aria-live="polite"><div><h3>{selection.title}</h3><p>{selection.classroom_name} · {selection.teacher_name??translate('Teacher not assigned')}</p><p>{new Intl.DateTimeFormat(getLocaleTag(),{timeZone:snapshot.branch.timezone,dateStyle:'medium',timeStyle:'short'}).formatRange(new Date(selection.starts_at),new Date(selection.ends_at))}</p>{!selection.id?<p>{translate('This recurring lesson is a plan. It has not been booked yet.')}</p>:null}</div><button className="small-btn" onClick={()=>setSelection(null)}>{translate('Close')}</button></section>:null}
    </>:null}
  </section>;
}
