import {useEffect,useRef,useState} from 'react';
import {request} from '../../../packages/assessment-web/src/client';
import {gradingProblem,type ReleasedResult} from '../../../packages/assessment-web/src/grading';
import {CandidateAppeals} from './CandidateAppeals';
import {CandidateCertificates} from './CandidateCertificates';
import {ScoreBreakdown} from './ScoreBreakdown';
import {useI18n} from '../../../packages/service-i18n/src/i18n.tsx';
import {useAppT} from './i18n/index.ts';
export function ReleasedResults({tenant,actor,attemptId}:{tenant:string;actor:string;attemptId?:string}){
 const t=useAppT(),{date}=useI18n();
 const [rows,setRows]=useState<ReleasedResult[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');const alive=useRef(true),version=useRef(0);
 async function load(){const expected=++version.current;setLoading(true);setError('');try{const result=await request<ReleasedResult[]>('grading/candidate/results',tenant,undefined,undefined,undefined,actor);if(alive.current&&expected===version.current)setRows(attemptId?result.filter(row=>row.attempt_id===attemptId):result);}catch(cause){if(alive.current&&expected===version.current){setRows([]);setError(gradingProblem(cause,t));}}finally{if(alive.current&&expected===version.current)setLoading(false);}}
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;version.current++;};},[tenant,actor,attemptId]);
 return <><section className="results-panel" aria-labelledby="results-heading" aria-busy={loading}><h2 id="results-heading">{t('exam.results.title')}</h2>{error&&<p role="alert" className="error">{error}</p>}{loading?<p role="status">{t('exam.results.loading')}</p>:rows.length?<ul className="records">{rows.map(row=><li key={row.score_revision_id}><strong>{t('exam.results.score',{total:row.total,max:row.max_score})}</strong><span>{t('exam.results.meta',{generation:row.generation,date:date(row.released_at)})}</span><ScoreBreakdown key={row.score_revision_id} tenant={tenant} actor={actor} attempt={row.attempt_id} scoreRevision={row.score_revision_id}/></li>)}</ul>:<p>{t('exam.results.empty')}</p>}<button className="quiet" disabled={loading} onClick={()=>void load()}>{t('exam.results.refresh')}</button></section><CandidateCertificates key={`certificates:${tenant}:${actor}`} tenant={tenant} actor={actor}/><CandidateAppeals key={`${tenant}:${actor}`} tenant={tenant} actor={actor} results={loading||error?[]:rows}/></>;
}
