import {useEffect,useMemo,useState} from 'react';
import {translate as t,getLocaleTag} from '../../i18n';
import {homeworkRequest} from '../../lib/homework';
import '../office/HomeworkView.css';

export type MistakeFeed={academy_id:string;center_name:string;status:'off'|'granted'|'revoked';granted_at:string|null;granted_by_role:'learner'|'guardian'|null;revoked_at:string|null;copied:number};
type StudentMistake={id:string;assignment_id:string;assignment_title:string|null;tag:string;excerpt:string|null;correction:string|null;explanation:string|null;status:'open'|'corrected'|'mastered';created_at:string};

const day=(value:string)=>new Intl.DateTimeFormat(getLocaleTag(),{dateStyle:'medium'}).format(new Date(value));

/** D4: the learner chooses whether this centre's homework mistakes join their Schood English Today plan and Review. */
function MistakeFeedConsent({academyId,actorId}:{academyId:string;actorId:string}){
 const [feed,setFeed]=useState<MistakeFeed|null>(null),[url,setUrl]=useState('https://english.schood.online/review'),[adult,setAdult]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;homeworkRequest<{consents:MistakeFeed[];practice_url:string}>(academyId,actorId,'student_mistake_feed').then(value=>{if(!active)return;setFeed(value.consents[0]??null);setUrl(value.practice_url);})
  .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Your practice setting could not load. Try again.');});return()=>{active=false;};},[academyId,actorId]);
 const save=async(enabled:boolean)=>{setBusy(true);setError('');try{const value=await homeworkRequest<{consent:MistakeFeed}>(academyId,actorId,'student_mistake_feed_set',{enabled,confirmed_adult:enabled&&adult,source:'academy_web'});setFeed(value.consent);setAdult(false);}
  catch(reason){setError(reason instanceof Error?reason.message:'Your practice setting was not saved. Try again.');}finally{setBusy(false);}};
 if(!feed&&!error)return null;
 const on=feed?.status==='granted';
 return <article className="homework-plan-card" aria-labelledby="mistake-feed-title">
  <h3 id="mistake-feed-title">{t('Practise these in Schood English')}</h3>
  {on?<p>{t(feed?.granted_by_role==='guardian'?'On since {date}, turned on by your parent or guardian.':'On since {date}.',{date:day(String(feed?.granted_at))})} {t('Mistakes in your practice: {n}.',{n:feed?.copied??0})}</p>
   :<p>{t('Off. Turn this on to add your open homework mistakes from this centre to your Schood English Today plan and Review.')}</p>}
  <p className="muted">{t('Only the mistake, its correction, the explanation and the centre name are copied. Your homework, scores and teachers stay here. Turn it off any time and the copies are deleted.')}</p>
  {!on&&<><label className="homework-toggle"><input type="checkbox" checked={adult} onChange={event=>setAdult(event.target.checked)}/>{t('I am 18 or older')}</label>
   <p className="muted">{t('Under 18? Ask your parent or guardian to turn this on from their parent page.')}</p></>}
  {error&&<p className="form-error" role="alert">{t(error)}</p>}
  <div className="homework-actions">
   {on?<><a className="primary-btn" href={url} target="_blank" rel="noreferrer">{t('Open Schood English Review')}</a><button type="button" className="ghost-btn" disabled={busy} onClick={()=>void save(false)}>{busy?t('Saving…'):t('Turn off')}</button></>
    :feed&&<button type="button" className="primary-btn" disabled={busy||!adult} onClick={()=>void save(true)}>{busy?t('Saving…'):t('Turn on')}</button>}
  </div>
 </article>;
}

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
  <MistakeFeedConsent academyId={academyId} actorId={actorId}/>
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
      <small className="muted"> · {m.assignment_title??t('Homework')} · {day(m.created_at)}{m.status!=='open'?' · '+t('Fixed'):''}</small>
     </li>)}</ul>
    </article>)}
  </>}
 </section>;
}
