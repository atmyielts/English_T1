import {useEffect,useRef,useState} from 'react';
import type {Row} from '../client';
import {accommodationInput,accommodationProblem,describePolicy,draftFrom,openAccommodationCommands,type AccommodationDraft,type RegistrationAccommodation} from '../../../../packages/assessment-web/src/accommodations';
import type {GradeIntent} from '../../../../packages/assessment-web/src/grade-command';

interface Props {tenant:string;actor:string;windows:Row[];registrations:Row[];reload:()=>Promise<void>}
/** Institution approval of extra time and timed breaks before a candidate starts.
 * The approval basis stays in the institution-only command/audit trail. */
export function AccommodationsPanel({tenant,actor,windows,registrations,reload}:Props){
  const [sitting,setSitting]=useState(''),[editing,setEditing]=useState<RegistrationAccommodation|null>(null),[draft,setDraft]=useState<AccommodationDraft|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState<GradeIntent|null>(null);
  const engine=useRef<Awaited<ReturnType<typeof openAccommodationCommands>>|null>(null),scope=`${tenant}:${actor}`,live=useRef(scope);live.current=scope;
  useEffect(()=>{let active=true;engine.current=null;setPending(null);setEditing(null);setDraft(null);setError('');setNotice('');
    openAccommodationCommands(tenant,actor).then(async opened=>{if(!active){opened.close();return;}engine.current=opened;const saved=await opened.commands.pending();if(active)setPending(saved);}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:String(cause));});
    return()=>{active=false;engine.current?.close();engine.current=null;};},[scope]);
  const rows=(registrations as unknown as RegistrationAccommodation[]).filter(row=>row.window_id===sitting);
  async function perform(work:()=>Promise<unknown>,done:string){
    const expected=scope,current=engine.current;if(!current)return;
    setBusy(true);setError('');setNotice('');
    try{await work();if(live.current!==expected)return;setNotice(done);setEditing(null);setDraft(null);await reload();}
    catch(cause){if(live.current===expected)setError(accommodationProblem(cause));}
    finally{if(live.current===expected){setPending(await current.commands.pending().catch(()=>null));setBusy(false);}}
  }
  function approve(){
    if(!editing||!draft||!engine.current)return;
    let input;try{input=accommodationInput(editing,draft);}catch(cause){setError((cause as Error).message);return;}
    void perform(()=>engine.current!.commands.execute('registration.accommodate',input),'Accommodations approved. They will be fixed when the candidate starts.');
  }
  const set=<K extends keyof AccommodationDraft>(key:K,value:AccommodationDraft[K])=>setDraft(current=>current?{...current,[key]:value}:current);
  return <section className="accommodations" aria-labelledby="accommodations-heading">
    <h2 id="accommodations-heading">Accommodations</h2>
    <p className="hint">Approve extra time and timed breaks before the candidate starts. Record only the approval basis — never diagnoses or medical evidence.</p>
    {pending&&<div role="status" className="notice"><p>An approval is saved on this device and waiting for confirmation.</p><button disabled={busy} onClick={()=>void perform(()=>engine.current!.commands.retry(),'Saved approval confirmed.')}>Retry saved approval</button></div>}
    {error&&<p role="alert" className="error">{error}</p>}
    {notice&&<p role="status" className="notice">{notice}</p>}
    <label>Sitting<select value={sitting} onChange={event=>{setSitting(event.target.value);setEditing(null);setDraft(null);}}><option value="">Choose a sitting</option>{windows.map(row=><option key={row.id} value={row.id}>{String(row.title)}</option>)}</select></label>
    {sitting&&!rows.length&&<p>No candidates are registered for this sitting yet.</p>}
    <ul className="records">{rows.map(row=><li key={row.id}>
      <strong>{row.candidate_id}</strong>
      <span>{describePolicy(row)} · approval revision {row.accommodation_revision??0}</span>
      <button className="quiet" disabled={busy||!!pending} onClick={()=>{setEditing(row);setDraft(draftFrom(row));setError('');setNotice('');}}>Review accommodations</button>
    </li>)}</ul>
    {editing&&draft&&<form className="editor" aria-label="Approve accommodations" onSubmit={event=>{event.preventDefault();approve();}}>
      <h3>Candidate {editing.candidate_id}</h3>
      <label>Extra time (minutes)<input type="number" min={0} max={1440} step={1} required value={draft.extraMinutes} onChange={event=>set('extraMinutes',Number(event.target.value))}/></label>
      <label className="check"><input type="checkbox" checked={draft.breaks} onChange={event=>set('breaks',event.target.checked)}/> Allow timed breaks</label>
      {draft.breaks&&<fieldset><legend>Break rules</legend>
        <label className="check"><input type="radio" name="clock" checked={draft.clock==='stopped'} onChange={()=>set('clock','stopped')}/> Stop the exam clock during breaks</label>
        <label className="check"><input type="radio" name="clock" checked={draft.clock==='running'} onChange={()=>set('clock','running')}/> Keep the exam clock running</label>
        <label>Number of breaks<input type="number" min={1} max={20} step={1} required value={draft.maxBreaks} onChange={event=>set('maxBreaks',Number(event.target.value))}/></label>
        <label>Minutes per break<input type="number" min={1} max={60} step={1} required value={draft.breakMinutes} onChange={event=>set('breakMinutes',Number(event.target.value))}/></label>
        <label>Total break minutes<input type="number" min={1} max={240} step={1} required value={draft.totalMinutes} onChange={event=>set('totalMinutes',Number(event.target.value))}/></label>
      </fieldset>}
      <label>Approval basis (institution only)<textarea required maxLength={2000} value={draft.reason} onChange={event=>set('reason',event.target.value)} placeholder="For example: approved under the institution’s access arrangements policy, reference AA-2026-14"/></label>
      <p className="hint">This record is visible to authorized staff only. Do not enter diagnoses or medical details.</p>
      <div className="actions"><button disabled={busy}>Approve accommodations</button><button type="button" className="quiet" disabled={busy} onClick={()=>{setEditing(null);setDraft(null);}}>Cancel</button></div>
    </form>}
  </section>;
}
