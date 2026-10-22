import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {GradeRun} from '../../../../packages/assessment-web/src/grading';
import {FeedbackReleaseReview} from '../feedback/FeedbackReleaseReview';
import {useAppT} from '../i18n/index.ts';
export function RunReview({tenant,actor,run,busy,locked,submit}:{tenant:string;actor:string;run:GradeRun;busy:boolean;locked:boolean;submit:(action:string,data:Record<string,unknown>)=>Promise<boolean>}){
 const t=useAppT();
 const [reviewed,setReviewed]=useState(false),[reason,setReason]=useState('');const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus();setReviewed(false);},[run.id,run.review_hash]);
 const form=(work:()=>Promise<unknown>)=>(event:FormEvent)=>{event.preventDefault();void work();};
 return <section className="grading-detail" aria-labelledby="grade-review-heading"><h2 id="grade-review-heading" ref={heading} tabIndex={-1}>{t('review.title')}</h2><p className="eyebrow">{t('review.eyebrow',{generation:String(run.generation),status:run.status.replaceAll('_',' ')})}</p><p className="grade-total">{run.total===null?t('review.incomplete'):t('review.points',{score:String(run.total),max:String(run.max_score)})}</p><div className="grade-table-wrap"><table><caption>{t('review.caption')}</caption><thead><tr><th scope="col">{t('review.item')}</th><th scope="col">{t('review.score')}</th><th scope="col">{t('review.status')}</th></tr></thead><tbody>{run.scores.map((row,index)=><tr key={row.item_version_id}><th scope="row">{t('review.itemRow',{number:index+1})}</th><td>{row.score===null?t('review.pending'):t('review.fraction',{score:String(row.score),max:String(row.max_score)})}</td><td>{row.status.replaceAll('_',' ')}</td></tr>)}</tbody></table></div>
 {run.can_approve?<form onSubmit={form(()=>submit('grade.approve',{run_id:run.id,review_hash:run.review_hash}))}><label className="check"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)} disabled={busy||locked}/>{t('review.confirm')}</label><button disabled={busy||locked||!reviewed}>{t('review.approve')}</button></form>:run.status==='ready'&&<p>{t('review.needsApprover')}</p>}
 {run.can_release&&<FeedbackReleaseReview tenant={tenant} actor={actor} runId={run.id} locked={busy||locked} submit={submit}/>}
 {run.status==='released'&&<p>{t('review.released')}</p>}
 {run.can_regrade&&<form onSubmit={form(()=>submit('grade.regrade',{run_id:run.id,reason}))}><h3>{t('review.regradeTitle')}</h3><label>{t('review.regradeReason')}<textarea required maxLength={5000} rows={3} value={reason} onChange={event=>setReason(event.target.value)} disabled={busy||locked}/></label><p className="hint">{t('review.regradeHint')}</p><button className="quiet" disabled={busy||locked}>{t('review.regrade')}</button></form>}
 </section>;
}
