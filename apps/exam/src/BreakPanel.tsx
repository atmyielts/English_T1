import type {BreakState} from '../../../packages/assessment-core/src/accommodations.ts';
import {breakAvailability,breakSecondsLeft,formatDuration} from '../../../packages/assessment-web/src/breaks';
import type {GradeIntent} from '../../../packages/assessment-web/src/grade-command';
import {useAppT} from './i18n/index.ts';

interface Props {
  state:BreakState|undefined;
  serverNow:number;
  monitored:boolean;
  pending:GradeIntent|null;
  error:string;
  busy:boolean;
  blocked:string;
  begin:()=>void;
  end:(id:string)=>void;
  retry:()=>void;
}
/** Shown in place of the questions during an approved break, and as a compact
 * allowance card otherwise. Monitoring panels stay mounted outside this view. */
export function BreakPanel({state,serverNow,monitored,pending,error,busy,blocked,begin,end,retry}:Props){
  const t=useAppT(),availability=breakAvailability(state);
  const saved=pending&&<div className="break-pending" role="status"><p>{t(pending.action==='break.begin'?'exam.break.pendingBegin':'exam.break.pendingEnd')}</p><button disabled={busy} onClick={retry}>{t('exam.break.retry')}</button></div>;
  if(state?.active){
    const left=breakSecondsLeft(state,serverNow),stopped=state.active.clock==='stopped';
    return <section className="break-active" aria-labelledby="break-heading">
      <p className="eyebrow">{t('exam.break.eyebrow')}</p>
      <h1 id="break-heading">{t('exam.break.heading')}</h1>
      <p className="break-countdown" aria-live="polite" aria-label={t('exam.break.remainingLabel',{time:formatDuration(left)})}>{formatDuration(left)}</p>
      <p>{t(stopped?'exam.break.clockStopped':'exam.break.clockRunning')}</p>
      {monitored&&<p>{t('exam.break.monitored')}</p>}
      <p className="hint">{t('exam.break.autoReturn')}</p>
      {saved}
      {error&&<p role="alert" className="error">{error}</p>}
      <button disabled={busy||!!pending} onClick={()=>end(state.active!.id)}>{t('exam.break.return')}</button>
    </section>;
  }
  if(!availability.enabled)return saved||error?<section className="break-card">{saved}{error&&<p role="alert" className="error">{error}</p>}</section>:null;
  return <section className="break-card" aria-labelledby="break-card-heading">
    <h2 id="break-card-heading">{t('exam.break.cardTitle')}</h2>
    <p>{t('exam.break.allowance',{remaining:availability.remainingBreaks,max:state!.policy.max_breaks,time:formatDuration(availability.remainingSeconds)})}{availability.canBegin?t('exam.break.next',{time:formatDuration(availability.nextBreakSeconds)}):''}</p>
    <p className="hint">{t(availability.clock==='stopped'?'exam.break.cardStopped':'exam.break.cardRunning')}</p>
    {saved}
    {blocked&&<p role="status">{blocked}</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    <button className="quiet" disabled={busy||!!pending||!availability.canBegin||!!blocked} onClick={begin}>{t('exam.break.take')}</button>
  </section>;
}
