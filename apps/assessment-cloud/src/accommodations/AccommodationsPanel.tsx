import {useEffect,useRef,useState} from 'react';
import type {Row} from '../client';
import {accommodationInput,accommodationProblem,describePolicy,draftFrom,openAccommodationCommands,type AccommodationDraft,type RegistrationAccommodation} from '../../../../packages/assessment-web/src/accommodations';
import type {GradeIntent} from '../../../../packages/assessment-web/src/grade-command';
import {useAppT,useErrorText} from '../i18n/index.ts';

interface Props {tenant:string;actor:string;windows:Row[];registrations:Row[];reload:()=>Promise<void>}
/** Institution approval of extra time and timed breaks before a candidate starts.
 * The approval basis stays in the institution-only command/audit trail. */
export function AccommodationsPanel({tenant,actor,windows,registrations,reload}:Props){
  const t=useAppT(),problem=useErrorText();
  const [sitting,setSitting]=useState(''),[editing,setEditing]=useState<RegistrationAccommodation|null>(null),[draft,setDraft]=useState<AccommodationDraft|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState<GradeIntent|null>(null);
  const engine=useRef<Awaited<ReturnType<typeof openAccommodationCommands>>|null>(null),scope=`${tenant}:${actor}`,live=useRef(scope);live.current=scope;
  useEffect(()=>{let active=true;engine.current=null;setPending(null);setEditing(null);setDraft(null);setError('');setNotice('');
    openAccommodationCommands(tenant,actor).then(async opened=>{if(!active){opened.close();return;}engine.current=opened;const saved=await opened.commands.pending();if(active)setPending(saved);}).catch(cause=>{if(active)setError(cause instanceof Error?problem(cause):String(cause));});
    return()=>{active=false;engine.current?.close();engine.current=null;};},[scope]);
  const rows=(registrations as unknown as RegistrationAccommodation[]).filter(row=>row.window_id===sitting);
  async function perform(work:()=>Promise<unknown>,done:string){
    const expected=scope,current=engine.current;if(!current)return;
    setBusy(true);setError('');setNotice('');
    try{await work();if(live.current!==expected)return;setNotice(done);setEditing(null);setDraft(null);await reload();}
    catch(cause){if(live.current===expected)setError(accommodationProblem(cause,t));}
    finally{if(live.current===expected){setPending(await current.commands.pending().catch(()=>null));setBusy(false);}}
  }
  function approve(){
    if(!editing||!draft||!engine.current)return;
    let input;try{input=accommodationInput(editing,draft);}catch(cause){setError(problem(cause));return;}
    void perform(()=>engine.current!.commands.execute('registration.accommodate',input),t('accommodations.approved'));
  }
  const set=<K extends keyof AccommodationDraft>(key:K,value:AccommodationDraft[K])=>setDraft(current=>current?{...current,[key]:value}:current);
  return <section className="accommodations" aria-labelledby="accommodations-heading">
    <h2 id="accommodations-heading">{t('accommodations.title')}</h2>
    <p className="hint">{t('accommodations.hint')}</p>
    {pending&&<div role="status" className="notice"><p>{t('accommodations.pending')}</p><button disabled={busy} onClick={()=>void perform(()=>engine.current!.commands.retry(),t('accommodations.retried'))}>{t('accommodations.retry')}</button></div>}
    {error&&<p role="alert" className="error">{error}</p>}
    {notice&&<p role="status" className="notice">{notice}</p>}
    <label>{t('accommodations.sitting')}<select value={sitting} onChange={event=>{setSitting(event.target.value);setEditing(null);setDraft(null);}}><option value="">{t('windows.chooseSitting')}</option>{windows.map(row=><option key={row.id} value={row.id}>{String(row.title)}</option>)}</select></label>
    {sitting&&!rows.length&&<p>{t('accommodations.noCandidates')}</p>}
    <ul className="records">{rows.map(row=><li key={row.id}>
      <strong>{row.candidate_id}</strong>
      <span>{t('accommodations.rowSummary',{policy:describePolicy(row,t),revision:String(row.accommodation_revision??0)})}</span>
      <button className="quiet" disabled={busy||!!pending} onClick={()=>{setEditing(row);setDraft(draftFrom(row));setError('');setNotice('');}}>{t('accommodations.review')}</button>
    </li>)}</ul>
    {editing&&draft&&<form className="editor" aria-label={t('accommodations.approve')} onSubmit={event=>{event.preventDefault();approve();}}>
      <h3>{t('accommodations.candidate',{candidate:editing.candidate_id})}</h3>
      <label>{t('accommodations.extraMinutes')}<input type="number" min={0} max={1440} step={1} required value={draft.extraMinutes} onChange={event=>set('extraMinutes',Number(event.target.value))}/></label>
      <label className="check"><input type="checkbox" checked={draft.breaks} onChange={event=>set('breaks',event.target.checked)}/> {t('accommodations.allowBreaks')}</label>
      {draft.breaks&&<fieldset><legend>{t('accommodations.breakRules')}</legend>
        <label className="check"><input type="radio" name="clock" checked={draft.clock==='stopped'} onChange={()=>set('clock','stopped')}/> {t('accommodations.clockStopped')}</label>
        <label className="check"><input type="radio" name="clock" checked={draft.clock==='running'} onChange={()=>set('clock','running')}/> {t('accommodations.clockRunning')}</label>
        <label>{t('accommodations.maxBreaks')}<input type="number" min={1} max={20} step={1} required value={draft.maxBreaks} onChange={event=>set('maxBreaks',Number(event.target.value))}/></label>
        <label>{t('accommodations.breakMinutes')}<input type="number" min={1} max={60} step={1} required value={draft.breakMinutes} onChange={event=>set('breakMinutes',Number(event.target.value))}/></label>
        <label>{t('accommodations.totalMinutes')}<input type="number" min={1} max={240} step={1} required value={draft.totalMinutes} onChange={event=>set('totalMinutes',Number(event.target.value))}/></label>
      </fieldset>}
      <label>{t('accommodations.basis')}<textarea required maxLength={2000} value={draft.reason} onChange={event=>set('reason',event.target.value)} placeholder={t('accommodations.basisPlaceholder')}/></label>
      <p className="hint">{t('accommodations.basisHint')}</p>
      <div className="actions"><button disabled={busy}>{t('accommodations.approve')}</button><button type="button" className="quiet" disabled={busy} onClick={()=>{setEditing(null);setDraft(null);}}>{t('common.cancel')}</button></div>
    </form>}
  </section>;
}
