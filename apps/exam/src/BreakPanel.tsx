import type {BreakState} from '../../../packages/assessment-core/src/accommodations.ts';
import {breakAvailability,breakSecondsLeft,formatDuration} from '../../../packages/assessment-web/src/breaks';
import type {GradeIntent} from '../../../packages/assessment-web/src/grade-command';

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
  const availability=breakAvailability(state);
  const saved=pending&&<div className="break-pending" role="status"><p>Your {pending.action==='break.begin'?'break':'return to the exam'} request is saved on this device and waiting for confirmation.</p><button disabled={busy} onClick={retry}>Retry confirmation</button></div>;
  if(state?.active){
    const left=breakSecondsLeft(state,serverNow),stopped=state.active.clock==='stopped';
    return <section className="break-active" aria-labelledby="break-heading">
      <p className="eyebrow">Approved break</p>
      <h1 id="break-heading">You are on a break</h1>
      <p className="break-countdown" aria-live="polite" aria-label={`Break time remaining ${formatDuration(left)}`}>{formatDuration(left)}</p>
      <p>{stopped?'Your exam clock is stopped for this break. If you return early, the unused break time is not added to your exam.':'Your exam clock keeps running during this break.'} Questions are hidden until you return.</p>
      {monitored&&<p>Required monitoring continues during your break. Do not leave the monitored area unless your institution’s rules allow it.</p>}
      <p className="hint">When the break time ends, the exam continues automatically on the next connection.</p>
      {saved}
      {error&&<p role="alert" className="error">{error}</p>}
      <button disabled={busy||!!pending} onClick={()=>end(state.active!.id)}>Return to the exam</button>
    </section>;
  }
  if(!availability.enabled)return saved||error?<section className="break-card">{saved}{error&&<p role="alert" className="error">{error}</p>}</section>:null;
  return <section className="break-card" aria-labelledby="break-card-heading">
    <h2 id="break-card-heading">Approved breaks</h2>
    <p>{availability.remainingBreaks} of {state!.policy.max_breaks} breaks left · {formatDuration(availability.remainingSeconds)} break time left{availability.canBegin?` · next break up to ${formatDuration(availability.nextBreakSeconds)}`:''}</p>
    <p className="hint">{availability.clock==='stopped'?'The exam clock stops during a break.':'The exam clock keeps running during a break.'} Saved answers sync before the break starts.</p>
    {saved}
    {blocked&&<p role="status">{blocked}</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    <button className="quiet" disabled={busy||!!pending||!availability.canBegin||!!blocked} onClick={begin}>Take a break</button>
  </section>;
}
