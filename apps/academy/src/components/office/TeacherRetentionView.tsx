import {useEffect,useState,type FormEvent} from 'react';
import {translate as t,getLocaleTag} from '../../i18n';
import {readTeacherRetention,type RetentionReport} from '../../lib/teacherRetention';
import './TeacherRetentionView.css';
const localTime=(date:Date)=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,19);
const initialFrom=()=>{const date=new Date();date.setDate(1);date.setHours(0,0,0,0);return localTime(date);};
export function TeacherRetentionView({academyId,actorId}:{academyId:string;actorId:string}){
 const [from,setFrom]=useState(initialFrom),[to,setTo]=useState(()=>localTime(new Date())),[branch,setBranch]=useState('');
 const [report,setReport]=useState<RetentionReport|null>(null),[branches,setBranches]=useState<RetentionReport['branches']>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [query,setQuery]=useState(()=>({from:new Date(initialFrom()).toISOString(),to:new Date().toISOString(),branch_id:null as string|null,revision:0}));
 useEffect(()=>{let active=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  void readTeacherRetention(academyId,actorId,query,controller.signal).then(value=>{if(active){setReport(value);setBranches(value.branches);}}).catch(reason=>{if(active)setError(reason instanceof Error&&reason.name!=='AbortError'?reason.message:'Unable to load teacher retention. Try again.');}).finally(()=>{clearTimeout(timeout);if(active)setLoading(false);});
  return()=>{active=false;clearTimeout(timeout);controller.abort();};
 },[academyId,actorId,query]);
 const submit=(event:FormEvent)=>{event.preventDefault();const start=new Date(from),end=new Date(to);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end.getTime()>Date.now()||end.getTime()-start.getTime()>366*86400000){setError('Choose a recorded period of at most 366 days.');return;}setLoading(true);setError('');setReport(null);setQuery({from:start.toISOString(),to:end.toISOString(),branch_id:branch||null,revision:query.revision+1});};
 const recorded=()=>{if(!report?.covered_from)return;const start=new Date(Math.ceil(Date.parse(report.covered_from)/1000)*1000),end=new Date();if(end<=start){setError('Recording has just started. Refresh in a moment.');return;}setLoading(true);setError('');setReport(null);setFrom(localTime(start));setTo(localTime(end));setQuery({from:start.toISOString(),to:end.toISOString(),branch_id:branch||null,revision:query.revision+1});};
 const date=(value:string)=>new Intl.DateTimeFormat(getLocaleTag(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
 const percent=(value:number|null)=>value===null?t('Not available'):new Intl.NumberFormat(getLocaleTag(),{maximumFractionDigits:2}).format(value)+'%';
 return <section className="panel teacher-retention" aria-labelledby="teacher-retention-title">
  <h2 id="teacher-retention-title">{t('Teacher retention')}</h2>
  <p>{t('Compare the starting student cohort with the end of the selected period. Teacher transfers and academy departures are reported separately.')}</p>
  <form className="retention-filters" onSubmit={submit}>
   <label>{t('Period start')}<input className="input" type="datetime-local" step="1" required value={from} onChange={event=>setFrom(event.target.value)}/></label>
   <label>{t('Period end')}<input className="input" type="datetime-local" step="1" required value={to} onChange={event=>setTo(event.target.value)}/></label>
   <label>{t('Branch')}<select className="input" value={branch} onChange={event=>setBranch(event.target.value)}><option value="">{t('All permitted branches')}</option>{branches.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
   <button type="submit" className="primary-btn" disabled={loading}>{t('Load report')}</button>
  </form>
  {error&&<p role="alert">{t(error)}</p>}
  {loading&&<p role="status">{t('Loading report…')}</p>}
  {report&&<>
   <p>{date(report.from)} — {date(report.to)}</p>
   {report.covered_from&&<p>{t('Recorded history begins: {date}',{date:date(report.covered_from)})}</p>}
   {!report.history_complete?<div role="status"><p>{t('This period begins before recorded teacher history. Historical retention cannot be reconstructed from current assignments.')}</p>{report.covered_from&&<button className="small-btn" type="button" onClick={recorded}>{t('Use recorded history')}</button>}</div>:<>
    {report.rows.length===0?<p>{t('No teacher cohort in this period.')}</p>:<div className="retention-table" tabIndex={0} role="region" aria-label={t('Teacher retention report')}><table><thead><tr>{['Teacher','Starting cohort','Retained with teacher','Paused','Teacher transfers','Academy departures','Completed','Unresolved','Import corrections excluded','Teacher retention rate','Academy retention rate'].map(label=><th scope="col" key={label}>{t(label)}</th>)}</tr></thead><tbody>{report.rows.map(row=><tr key={row.staff_id}><th scope="row">{row.display_name}</th>{[row.cohort_size,row.retained_students,row.paused_students,row.teacher_transfers,row.academy_departures,row.completed_students,row.unresolved_changes,row.excluded_corrections].map((count,index)=><td key={index}>{count}</td>)}<td>{percent(row.teacher_retention_percent)}</td><td>{percent(row.academy_retention_percent)}</td></tr>)}</tbody></table></div>}
    {report.has_more&&<p role="status">{t('Showing the first 500 teachers. Select a branch for a smaller report.')}</p>}
   </>}
   <p>{t('Pauses remain retained. Completed courses and corrected imports are excluded from the rate denominator. Unresolved changes or an empty denominator show no rate. These figures describe cohorts and do not rank teachers.')}</p>
  </>}
 </section>;
}
