import {useEffect,useMemo,useState} from 'react';
import {translate as t,getLocaleTag} from '../../i18n';
import {homeworkRequest} from '../../lib/homework';
import '../office/HomeworkView.css';

type StudentMistake={id:string;assignment_id:string;assignment_title:string|null;tag:string;excerpt:string|null;correction:string|null;explanation:string|null;status:'open'|'corrected'|'mastered';created_at:string};

const tagLabel=(tag:string)=>tag.replace(/[._:-]+/g,' ').replace(/^\w/,c=>c.toUpperCase());

/** The learner's own mistake bank from homework their teachers reviewed. */
export function StudentMistakesView({academyId,actorId}:{academyId:string;actorId:string}){
 const [rows,setRows]=useState<StudentMistake[]|null>(null),[error,setError]=useState(''),[showFixed,setShowFixed]=useState(false);
 useEffect(()=>{let active=true;homeworkRequest<{mistakes:StudentMistake[]}>(academyId,actorId,'student_mistakes').then(value=>{if(active)setRows(value.mistakes);})
  .catch(reason=>{if(active){setRows([]);setError(reason instanceof Error?reason.message:'Your mistakes could not load. Try again.');}});return()=>{active=false;};},[academyId,actorId]);
 const groups=useMemo(()=>{const map=new Map<string,StudentMistake[]>();for(const row of rows??[]){if(!showFixed&&row.status!=='open')continue;map.set(row.tag,[...(map.get(row.tag)??[]),row]);}
  return [...map.entries()].sort((a,b)=>b[1].length-a[1].length);},[rows,showFixed]);
 const open=(rows??[]).filter(row=>row.status==='open').length,fixed=(rows??[]).length-open;
 return <section className="panel homework-os" aria-labelledby="student-mistakes-title">
  <div className="section-heading"><div><h2 id="student-mistakes-title">{t('My mistakes')}</h2>
   <p className="muted">{t('Mistakes your teachers marked in your homework. Fix the open ones and they will not come back.')}</p></div></div>
  {error&&<p className="form-error" role="alert">{t(error)}</p>}
  {!rows&&<p role="status">{t('Loading…')}</p>}
  {rows&&<>
   <div className="homework-kpis"><div><strong>{open}</strong><span>{t('Still to fix')}</span></div><div><strong>{fixed}</strong><span>{t('Fixed')}</span></div></div>
   <label className="homework-toggle"><input type="checkbox" checked={showFixed} onChange={event=>setShowFixed(event.target.checked)}/>{t('Show fixed mistakes too')}</label>
   {groups.length===0?<p className="empty-state">{open===0&&fixed>0?t('Everything is fixed. Well done!'):t('No mistakes yet. They appear here after your teacher checks your homework.')}</p>:
    groups.map(([tag,list])=><article key={tag} className="homework-card">
     <header><h3>{tagLabel(tag)}</h3><p className="muted">{t('{n} times',{n:list.length})}</p></header>
     <ul className="homework-mistake-list">{list.map(m=><li key={m.id}>
      <span>{m.excerpt?<s>{m.excerpt}</s>:null}{m.correction?<> → <strong>{m.correction}</strong></>:null}</span>
      {m.explanation&&<small className="muted"> {m.explanation}</small>}
      <small className="muted"> · {m.assignment_title??t('Homework')} · {new Intl.DateTimeFormat(getLocaleTag(),{dateStyle:'medium'}).format(new Date(m.created_at))}{m.status!=='open'?' · '+t('Fixed'):''}</small>
     </li>)}</ul>
    </article>)}
  </>}
 </section>;
}
