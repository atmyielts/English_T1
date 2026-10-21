import {useEffect,useRef,useState} from 'react';
import {request} from '../../../packages/assessment-web/src/client';
import {gradingProblem,type ReleasedResult} from '../../../packages/assessment-web/src/grading';
import {CandidateAppeals} from './CandidateAppeals';
import {CandidateCertificates} from './CandidateCertificates';
import {ScoreBreakdown} from './ScoreBreakdown';
export function ReleasedResults({tenant,actor,attemptId}:{tenant:string;actor:string;attemptId?:string}){
 const [rows,setRows]=useState<ReleasedResult[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');const alive=useRef(true),version=useRef(0);
 async function load(){const expected=++version.current;setLoading(true);setError('');try{const result=await request<ReleasedResult[]>('grading/candidate/results',tenant,undefined,undefined,undefined,actor);if(alive.current&&expected===version.current)setRows(attemptId?result.filter(row=>row.attempt_id===attemptId):result);}catch(cause){if(alive.current&&expected===version.current){setRows([]);setError(gradingProblem(cause));}}finally{if(alive.current&&expected===version.current)setLoading(false);}}
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;version.current++;};},[tenant,actor,attemptId]);
 return <><section className="results-panel" aria-labelledby="results-heading" aria-busy={loading}><h2 id="results-heading">Released results</h2>{error&&<p role="alert" className="error">{error}</p>}{loading?<p role="status">Checking your released results…</p>:rows.length?<ul className="records">{rows.map(row=><li key={row.score_revision_id}><strong>{row.total} / {row.max_score} points</strong><span>Grading generation {row.generation} · Released {new Date(row.released_at).toLocaleString()}</span><ScoreBreakdown key={row.score_revision_id} tenant={tenant} actor={actor} attempt={row.attempt_id} scoreRevision={row.score_revision_id}/></li>)}</ul>:<p>No results have been released for you yet. Your institution may still be marking, reviewing or holding them until its release time.</p>}<button className="quiet" disabled={loading} onClick={()=>void load()}>Refresh released results</button></section><CandidateCertificates key={`certificates:${tenant}:${actor}`} tenant={tenant} actor={actor}/><CandidateAppeals key={`${tenant}:${actor}`} tenant={tenant} actor={actor} results={loading||error?[]:rows}/></>;
}
