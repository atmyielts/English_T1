import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { configured, request, proctorRequest, supabase, observeAccount, type Row } from '../../../packages/assessment-web/src/client';
import { ResponseJournal } from '../../../packages/assessment-web/src/journal';
import { assertCoordinatorReady,openCoordinator } from '../../../packages/assessment-web/src/coordinator';
import type { RuntimeSnapshot,RuntimeStatus } from '../../../packages/assessment-web/src/runtime';
import { ServiceHeader } from '../../../packages/service-design/src/ServiceHeader';
import type { FormItem, Manifest } from '../../../packages/assessment-core/src/mod.ts';
import type { CandidateProctorState, Preflight } from '../../../packages/proctor-web/src/types';
import { PreflightScreen } from './PreflightScreen';
import { MonitoringPanel } from './MonitoringPanel';
import { useProctor } from './useProctor';
import {useCandidateCapture} from './useCandidateCapture';
import {CapturePanel} from './CapturePanel';
import {captureInteractionReady} from '../../../packages/assessment-core/src/capture-launch';
import {CaptureRecoveryPanel} from './CaptureRecoveryPanel';
import {ReleasedResults} from './ReleasedResults';
import {CertificateVerification} from './CertificateVerification';
import {QuestionResponse as Answer} from '../../../packages/assessment-web/src/QuestionResponse';
import {QuestionMedia} from '../../../packages/assessment-web/src/QuestionMedia';
import {IMAGE_RESPONSE_PROTOCOL} from '../../../packages/assessment-core/src/image-response';
import {MEDIA_ANSWER_DELIVERY_PROTOCOL,MEDIA_RESPONSE_TYPES} from '../../../packages/assessment-core/src/media-answer';
import type {CandidateMediaAnswer as CandidateMediaAnswerComponent} from '../../../packages/assessment-web/src/CandidateMediaAnswer';
import type {AcademicUploadRecovery as AcademicUploadRecoveryComponent} from './AcademicUploadRecovery';
import type {AcademicDeviceRecovery as AcademicDeviceRecoveryComponent} from './AcademicDeviceRecovery';
import {assertDeliveryReady,PROMPT_MEDIA_PROTOCOL} from '../../../packages/assessment-web/src/delivery';
import '../../../packages/service-design/src/platform.css';
import './style.css';
import './monitoring.css';
type Attempt = Row & { id:string; manifest: Manifest & {section_count:number}; responses: Row[]; last_sequence: number; deadline_at: string; section_deadline_at: string; server_time: string; state: string; candidate_id:string };
const LazyAcademicAnswer=React.lazy(()=>import('../../../packages/assessment-web/src/CandidateMediaAnswer').then(module=>({default:module.CandidateMediaAnswer})));
const LazyAcademicRecovery=React.lazy(()=>import('./AcademicUploadRecovery').then(module=>({default:module.AcademicUploadRecovery})));
const LazyAcademicDevices=React.lazy(()=>import('./AcademicDeviceRecovery').then(module=>({default:module.AcademicDeviceRecovery})));
function CandidateMediaAnswer(props:React.ComponentProps<typeof CandidateMediaAnswerComponent>){return <React.Suspense fallback={<p role="status">Opening the academic answer controls…</p>}><LazyAcademicAnswer {...props}/></React.Suspense>;}
function AcademicUploadRecovery(props:React.ComponentProps<typeof AcademicUploadRecoveryComponent>){return <React.Suspense fallback={<p role="status">Checking academic upload recovery…</p>}><LazyAcademicRecovery {...props}/></React.Suspense>;}
function AcademicDeviceRecovery(props:React.ComponentProps<typeof AcademicDeviceRecoveryComponent>){return <React.Suspense fallback={<p role="status">Checking saved academic workspaces…</p>}><LazyAcademicDevices {...props}/></React.Suspense>;}
function App() {
  const tenant = new URLSearchParams(location.search).get('tenant_id') ?? '';
  const [user,setUser]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [registrations,setRegistrations]=useState<Row[]>([]),[attempt,setAttempt]=useState<Attempt|null>(null),[answers,setAnswers]=useState<Record<string,unknown>>({});
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(0),[now,setNow]=useState(Date.now()),[offset,setOffset]=useState(0);
  const [preflight,setPreflight]=useState<{registrationId:string;policy:Extract<Preflight,{required:true}>}|null>(null),[acknowledged,setAcknowledged]=useState(false),[proctor,setProctor]=useState<CandidateProctorState|null>(null);
  const journal=useRef<ResponseJournal|null>(null), sequence=useRef(0), sending=useRef(false), actionKeys=useRef<Record<string,string>>({}), localWrite=useRef<Promise<void>>(Promise.resolve());
  const saved=useRef<Record<string,string>>({});
  const [confirmedAnswers,setConfirmedAnswers]=useState<Record<string,string>>({}),[academicCaptures,publishAcademicCaptures]=useState<Set<string>>(new Set());
  const academicCaptureRef=useRef<Set<string>>(new Set());
  function setAcademicCaptures(value:Set<string>|((current:Set<string>)=>Set<string>)){const next=typeof value==='function'?value(academicCaptureRef.current):value;if(next===academicCaptureRef.current)return;academicCaptureRef.current=next;publishAcademicCaptures(next);}
  const localFailure=useRef(false);
  const connection=useRef<{id:string;runtime:Awaited<ReturnType<typeof openCoordinator>>['runtime'];close:()=>void}|null>(null);
  const [runtimeStatus,setRuntimeStatus]=useState<RuntimeStatus>({ready:false,problem:null,expires_at:null});
  const manifestIndex=useRef(-1),loadingSection=useRef(false),runtimeSnapshot=useRef<RuntimeSnapshot|null>(null);
  const account=useRef(user);account.current=user;
  const capture=useCandidateCapture(tenant,user),hadCaptureLease=useRef(false);
  const captureRequired=Boolean(proctor?.session&&(proctor.session.policy_snapshot.camera||proctor.session.policy_snapshot.microphone||proctor.session.policy_snapshot.screen));
  const monitoring=useProctor(tenant,user,attempt?.id??'',proctor,state=>{setOffset(Date.parse(state.server_time)-Date.now());setAttempt(current=>current?{...current,...state.attempt}:current);});
  useEffect(()=>observeAccount(setUser),[]);
  useEffect(()=>{setConfirmedAnswers({});setAcademicCaptures(new Set());},[user,tenant]);
  useEffect(()=>{connection.current?.close();connection.current=null;journal.current?.close();journal.current=null;setAttempt(null);setAnswers({});setProctor(null);setPreflight(null);setPending(0);setError('');setBusy(false);setRuntimeStatus({ready:false,problem:null,expires_at:null});manifestIndex.current=-1;runtimeSnapshot.current=null;localFailure.current=false;saved.current={};sequence.current=0;},[user,tenant]);
  useEffect(()=>{let active=true;setRegistrations([]);if(user&&tenant)request<Row[]>('candidate/registrations',tenant).then(value=>{if(active)setRegistrations(value);}).catch(cause=>{if(active)setError(cause.message);});return()=>{active=false;};},[user,tenant]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>()=>{connection.current?.close();journal.current?.close();},[]);
  async function loadSection(id:string){
    if(loadingSection.current)return;loadingSection.current=true;const expected=user;
    try{
      await localWrite.current;const state=await request<Attempt>(`candidate/attempts/${id}`,tenant);
      if(account.current!==expected||connection.current?.id!==id||state.candidate_id!==expected)return;
      if(runtimeSnapshot.current&&Number(state.section_index)!==runtimeSnapshot.current.section_index)return;
      const restored:Record<string,unknown>={};for(const row of state.responses)restored[String(row.item_version_id)]=row.response;
      for(const entry of await journal.current!.pending())restored[entry.item_version_id]=entry.response;
      sequence.current=Math.max(sequence.current,state.last_sequence);manifestIndex.current=Number(state.section_index);
      setAnswers(current=>({...current,...restored}));setConfirmedAnswers(current=>({...current,...Object.fromEntries(state.responses.map(row=>[String(row.item_version_id),JSON.stringify(row.response)]))}));setAttempt(current=>current?{...current,manifest:state.manifest,section_index:state.section_index}:current);
    }catch(cause){if(account.current===expected)setError(cause instanceof Error?cause.message:'Could not load the current section.');}finally{loadingSection.current=false;}
  }
  function coordinated(snapshot:RuntimeSnapshot){
    if(connection.current?.id!==snapshot.attempt_id||account.current!==user)return;
    runtimeSnapshot.current=snapshot;setOffset(Date.parse(snapshot.server_time)-Date.now());
    setAttempt(current=>current?.id===snapshot.attempt_id?{...current,...snapshot}:current);
    if(snapshot.state==='active'&&manifestIndex.current!==snapshot.section_index)void loadSection(snapshot.attempt_id);
  }
  useEffect(()=>{if(!attempt?.id||!['active','paused'].includes(attempt.state))return;const id=attempt.id;const tick=()=>{const active=connection.current;if(active?.id===id)void active.runtime.tick().catch(()=>{});};const timer=setInterval(tick,5000);window.addEventListener('online',tick);return()=>{clearInterval(timer);window.removeEventListener('online',tick);};},[attempt?.id,attempt?.state]);
  async function refresh(id:string){
    const expected=user;
    const state=await request<Attempt>(`candidate/attempts/${id}`,tenant);
    const monitoringState=Array.isArray(state.required_services)&&state.required_services.includes('proctor')?await proctorRequest<CandidateProctorState>(`candidate/session?attempt_id=${id}`,tenant):null;
    if(account.current!==expected)return;
    if(state.candidate_id!==expected)throw new Error('Assessment ownership changed. Sign in again.');
    if(connection.current?.id!==id){
      connection.current?.close();connection.current=null;setRuntimeStatus({ready:false,problem:null,expires_at:null});
      const openedConnection=await openCoordinator(tenant,expected,id,coordinated,status=>{if(account.current===expected&&connection.current?.id===id)setRuntimeStatus(status);});
      if(account.current!==expected){openedConnection.close();return;}connection.current={id,...openedConnection};
    }
    let restoredSequence=state.last_sequence;
    const restored:Record<string,unknown>={};for(const row of state.responses)restored[String(row.item_version_id)]=row.response;
    const opened=await ResponseJournal.create(`${tenant}:${expected}:${id}`);
    let entries;
    try{entries=await opened.pending();}catch(cause){opened.close();throw cause;}
    for(const entry of entries){restored[entry.item_version_id]=entry.response;restoredSequence=Math.max(restoredSequence,entry.sequence);}
    if(account.current!==expected){opened.close();return;}
    journal.current?.close();journal.current=opened;sequence.current=restoredSequence;
    saved.current=Object.fromEntries(Object.entries(restored).map(([id,value])=>[id,JSON.stringify(value)]));
    manifestIndex.current=Number(state.section_index);setAttempt(state);setProctor(monitoringState);setOffset(Date.parse(state.server_time)-Date.now());setAnswers(restored);setConfirmedAnswers(Object.fromEntries(state.responses.map(row=>[String(row.item_version_id),JSON.stringify(row.response)])));setPending(entries.length);
    await connection.current!.runtime.tick();
  }
  async function flush(id:string){
    const store=journal.current,expected=user;
    if(sending.current||!store||account.current!==expected)return;sending.current=true;
    try{for(const entry of await store.pending()){
      if(account.current!==expected)return;
      const active=connection.current;if(active?.id!==id)throw new Error('Reconnect to this assessment before syncing saved responses.');
      await active.runtime.command('response.append',{sequence:entry.sequence,item_version_id:entry.item_version_id,response:entry.response},entry.command_key);
      await store.acknowledge(entry.sequence);
      if(account.current===expected&&connection.current?.id===id)setConfirmedAnswers(current=>({...current,[entry.item_version_id]:JSON.stringify(entry.response)}));
    }if(account.current===expected){setPending((await store.pending()).length);setError('');}}catch(cause){if(account.current===expected)setError(cause instanceof Error?cause.message:'Answers remain saved on this device. Reconnect to sync.');}finally{sending.current=false;}
  }
  useEffect(()=>{if(!attempt?.id||attempt.state!=='active')return;const timer=setInterval(()=>void flush(attempt.id!),5000);const online=()=>void flush(attempt.id!);window.addEventListener('online',online);return()=>{clearInterval(timer);window.removeEventListener('online',online);};},[attempt?.id,attempt?.state]);
  async function run(work:()=>Promise<void>){const expected=user;setBusy(true);setError('');try{await work();}catch(cause){if(account.current===expected)setError(cause instanceof Error?cause.message:'Could not complete this action.');}finally{if(account.current===expected)setBusy(false);}}
  function save(item:FormItem,value:unknown){
    const store=journal.current,expected=user;
    localWrite.current=localWrite.current.then(async()=>{
      if(!store||!attempt?.id||account.current!==expected)return;
      if(saved.current[item.item_version_id]===JSON.stringify(value))return;
      await store.append(sequence.current+1,item.item_version_id,value);
      if(account.current!==expected)return;sequence.current++;
      saved.current[item.item_version_id]=JSON.stringify(value);setPending((await store.pending()).length);
    }).catch(cause=>{if(account.current===expected){localFailure.current=true;setError(`Response could not be saved on this device: ${cause.message}`);}});
    return localWrite.current;
  }
  async function selectAcademic(entry:FormItem,value:unknown){
    const expected=user,id=attempt?.id,store=journal.current;
    if(!id||!store||attempt?.state!=='active'||!leaseReady||!captureReady||remaining===0||manifestIndex.current!==Number(attempt.section_index)||account.current!==expected||localFailure.current)throw new Error('Reconnect the active question and resolve any local save failure before selecting an academic answer.');
    setAnswers(current=>({...current,[entry.item_version_id]:value}));await save(entry,value);
    if(localFailure.current)throw new Error('This answer selection could not be saved on this device. Contact the institution before continuing.');
    await flush(id);
    if(account.current!==expected||connection.current?.id!==id||journal.current!==store)throw new Error('The candidate or attempt changed during answer confirmation. Reopen the original workspace to recover its saved request.');
    return !(await store.pending()).some(row=>row.item_version_id===entry.item_version_id);
  }
  async function finish(sectionOnly:boolean){
    if(academicCaptureRef.current.size)throw new Error('Stop and seal each active academic answer recording before finishing this section. A device recording is not automatically selected.');
    await localWrite.current;
    if(localFailure.current)throw new Error('A response could not be saved on this device. Contact your institution before submitting.');
    await flush(attempt!.id!);
    if((await journal.current!.pending()).length)throw new Error('Sync all saved responses before continuing.');
    const active=connection.current;if(!active||active.id!==attempt!.id)throw new Error('Reconnect before submitting.');
    const action=sectionOnly?'section.advance':'attempt.submit',key=`${attempt!.id}:${attempt!.section_index}:${action}`;
    actionKeys.current[key]??=crypto.randomUUID();await active.runtime.command(action,{},actionKeys.current[key]);delete actionKeys.current[key];
    if(sectionOnly)await loadSection(attempt!.id!);
  }
  async function launch(registrationId:string,captureBinding?:{session_id:string;device_id:string;token_hash:string}){
    assertCoordinatorReady();
    const requirements=await request('candidate/preparation?registration_id='+encodeURIComponent(registrationId),tenant,undefined,undefined,undefined,user);
    if(account.current!==user)return;
    assertDeliveryReady(requirements,{mediaUrl:import.meta.env.VITE_ASSESSMENT_MEDIA_URL,pageUrl:location.href,sharedCookie:import.meta.env.VITE_AUTH_SHARED_COOKIE==='true',cookieDomain:import.meta.env.VITE_AUTH_COOKIE_DOMAIN,recordingSupported:mime=>!!navigator.mediaDevices?.getUserMedia&&typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(mime)});
    actionKeys.current[registrationId]??=crypto.randomUUID();
    const result=await request<Row>('commands',tenant,{action:'attempt.start',data:{registration_id:registrationId,delivery_client:PROMPT_MEDIA_PROTOCOL,image_response_client:IMAGE_RESPONSE_PROTOCOL,media_answer_client:MEDIA_ANSWER_DELIVERY_PROTOCOL,...(captureBinding?{capture_binding:captureBinding}:{})}},undefined,actionKeys.current[registrationId],user);
    delete actionKeys.current[registrationId];if(account.current!==user)return;await refresh(result.id!);if(account.current===user)setPreflight(null);
  }
  async function prepare(registrationId:string){
    assertCoordinatorReady();
    const assignments=await request<Row[]>('candidate/registrations',tenant);if(account.current!==user)return;setRegistrations(assignments);
    const registration=assignments.find(row=>row.id===registrationId);
    if(!registration)throw new Error('Assessment registration is no longer assigned to this account.');
    if(!Array.isArray(registration.required_services)||!registration.required_services.includes('proctor')){await launch(registrationId);return;}
    const policy=await proctorRequest<Preflight>(`candidate/preflight?registration_id=${registrationId}`,tenant);
    if(account.current!==user)return;if(!policy.required){await launch(registrationId);return;}setAcknowledged(false);setPreflight({registrationId,policy});
  }
  async function acceptAndLaunch(){
    if(!preflight)return;
    if(!preflight.policy.consented){if(!acknowledged)throw new Error('Read and acknowledge the monitoring policy before continuing.');await proctorRequest('commands',tenant,{action:'preparation.accept',data:{registration_id:preflight.registrationId,policy_id:preflight.policy.policy_id,acknowledged:true}},`consent:${preflight.registrationId}:${preflight.policy.policy_id}`);}
    const current=await proctorRequest<Preflight>(`candidate/preflight?registration_id=${preflight.registrationId}`,tenant);
    if(!current.required)throw new Error('The monitoring policy changed. Contact your institution.');setPreflight({...preflight,policy:current});
    if(current.runtime_ready&&current.identity_verified){
      if(current.capture_required){
        if(!current.capture_enabled||current.capture_protocol!=='proctor.capture.v1')throw new Error('Required capture is not enabled for this Exam client.');
        if(capture.registration!==preflight.registrationId||capture.view?.closed||!capture.view){await capture.prepare(preflight.registrationId);return;}
        await launch(preflight.registrationId,await capture.binding());
      }else await launch(preflight.registrationId);
    }
  }
  const remaining=attempt?Math.max(0,Math.ceil((Math.min(Date.parse(attempt.deadline_at),Date.parse(attempt.section_deadline_at))-(now+offset))/1000)):0;
  const leaseReady=runtimeStatus.ready&&!!runtimeStatus.expires_at&&Date.parse(runtimeStatus.expires_at)>now+offset;
  const captureReady=captureInteractionReady(captureRequired,capture.ready,String(attempt?.state??''),capture.view?.launch.auto_pause);
  useEffect(()=>{if(!captureRequired||!attempt){hadCaptureLease.current=false;return;}if(leaseReady)hadCaptureLease.current=true;const terminal=['submitted','expired'].includes(attempt.state);if(terminal||(hadCaptureLease.current&&!leaseReady&&!!runtimeStatus.expires_at&&Date.parse(runtimeStatus.expires_at)<=now+offset)){hadCaptureLease.current=false;void capture.dispose(terminal?'runtime_end':'capture_error').catch(cause=>{if(account.current===user)setError('Recording stopped; saved footage needs recovery: '+cause.message);});}},[captureRequired,attempt?.id,attempt?.state,leaseReady,runtimeStatus.expires_at,now,offset]);
  if(!configured)return <main className="configuration"><h1>Schood Exam</h1><p>The exam service has not been configured.</p></main>;
  if(!user)return <main className="signin"><div className="brand">Schood <span>Exam</span></div><h1>Sign in for your assessment</h1><form onSubmit={(event:FormEvent)=>{event.preventDefault();void run(async()=>{const {error}=await supabase!.auth.signInWithPassword({email,password});if(error)throw error;});}}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label><button disabled={busy}>Sign in</button></form>{error&&<p role="alert" className="error">{error}</p>}</main>;
  if(attempt&&attempt.candidate_id!==user)return <main className="configuration"><p role="status">Changing signed-in account…</p></main>;
  const section=attempt?.manifest.sections[0];
  const recordingPanel=(registration:string,active=false)=><CapturePanel view={capture.registration===registration?capture.view:null} busy={busy||capture.busy} error={capture.error} start={capture.start} recover={capture.recover} sync={capture.sync} reconnectLive={capture.reconnectLive} reopen={active||preflight?.policy.consented&&preflight.policy.identity_verified?()=>void run(()=>capture.prepare(registration)):undefined} stop={active?()=>void run(()=>capture.dispose('user_stop')):undefined} active={active}/>;
  return <div className="exam-workspace"><ServiceHeader service="Exam">{attempt?.state==='active'&&<div className="clock" aria-label="Time remaining">{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</div>}<span role="status">{pending?`${pending} response${pending===1?'':'s'} awaiting sync`:'All saved responses synced'}</span>{(!attempt||['submitted','expired'].includes(attempt.state))&&<button className="quiet" disabled={busy} onClick={()=>void run(async()=>{const {error}=await supabase!.auth.signOut();if(error)throw error;})}>Sign out</button>}</ServiceHeader><main id="workspace-main" tabIndex={-1}>
    {error&&<p role="alert" className="error">{error}</p>}
    {attempt&&['active','paused'].includes(attempt.state)&&(!leaseReady||runtimeStatus.problem)&&<section className="runtime-status" aria-labelledby="runtime-heading"><h2 id="runtime-heading">{leaseReady?'Exam connection interrupted':'Exam connection needs attention'}</h2><p role="status">{runtimeStatus.problem??'Verifying this device with the exam service.'} Your saved responses remain on this device. The institution’s exam clock still applies.</p><button disabled={busy} onClick={()=>void run(async()=>{await connection.current!.runtime.tick();await flush(attempt.id!);})}>Reconnect to exam</button></section>}
    {monitoring.enabled&&<MonitoringPanel status={monitoring.status} notices={monitoring.notices} busy={busy} acknowledge={id=>void run(()=>monitoring.acknowledge(id))} sync={()=>void run(monitoring.sync)}/>}
    {!preflight&&captureRequired&&attempt&&['active','paused'].includes(attempt.state)&&recordingPanel(String(attempt.registration_id),true)}
    {preflight?<PreflightScreen policy={preflight.policy} acknowledged={acknowledged} setAcknowledged={setAcknowledged} busy={busy||capture.busy} capturePrepared={capture.registration===preflight.registrationId&&!!capture.view} captureReady={capture.ready} proceed={()=>void run(acceptAndLaunch)} cancel={()=>void run(async()=>{if(capture.view?.launch.attempt_id)await capture.dispose('user_stop');else await capture.cancel();setPreflight(null);})}>{preflight.policy.capture_enabled&&recordingPanel(preflight.registrationId)}</PreflightScreen>:!tenant?<p>Open the assessment link provided by your institution.</p>:!attempt?<><h1>Your exam sittings</h1><ul className="records">{registrations.map(row=><li key={row.id}><strong>{typeof row.title==='string'&&row.title?row.title:'Assessment registration'}</strong><span>{row.id}</span><button disabled={busy} onClick={()=>void run(()=>prepare(row.id!))}>Start or resume</button></li>)}</ul>{!registrations.length&&<p>No assessments are assigned to this account.</p>}</>:attempt.state!=='active'?<><h1>{attempt.state==='paused'?'Assessment paused':attempt.state==='expired'?'Assessment time ended':'Assessment submitted'}</h1><p>{attempt.state==='paused'?'Contact your institution’s proctor to resume.':'Your institution will review and release your results.'}</p></>:<>
      <p className="eyebrow">Section {Number(attempt.section_index)+1} of {attempt.manifest.section_count}</p><h1>{section?.title}</h1><p>Your responses save automatically on this device and sync when the connection is available.</p>
      <div className="questions">{section?.items.map((entry,index)=><section key={entry.item_version_id}><p className="eyebrow">Question {index+1} · {entry.item.max_score} points</p><h2>{entry.item.prompt}</h2><QuestionMedia item={entry.item} tenant={tenant} actor={user} attempt={attempt.id} enabled={remaining>0&&leaseReady&&captureReady&&manifestIndex.current===Number(attempt.section_index)&&attempt.candidate_id===user}/><fieldset disabled={!(MEDIA_RESPONSE_TYPES as readonly string[]).includes(entry.item.type)&&(remaining===0||busy||!leaseReady||!captureReady||manifestIndex.current!==Number(attempt.section_index))}><Answer entry={entry} value={answers[entry.item_version_id]} mediaContext={{tenant,actor:user,attempt:attempt.id,enabled:remaining>0&&leaseReady&&captureReady&&manifestIndex.current===Number(attempt.section_index)&&attempt.candidate_id===user}} academicResponse={<CandidateMediaAnswer tenant={tenant} actor={user} attempt={attempt.id!} entry={entry} value={answers[entry.item_version_id]} confirmed={confirmedAnswers[entry.item_version_id]===JSON.stringify(answers[entry.item_version_id])} enabled={!busy&&remaining>0&&leaseReady&&captureReady&&manifestIndex.current===Number(attempt.section_index)&&attempt.candidate_id===user} runtime={()=>connection.current?.id===attempt.id?connection.current.runtime:null} select={value=>selectAcademic(entry,value)} onRecording={active=>{if(account.current===user)setAcademicCaptures(current=>{if(current.has(entry.item_version_id)===active)return current;const next=new Set(current);if(active)next.add(entry.item_version_id);else next.delete(entry.item_version_id);return next;});}}/>} onChange={value=>{setAnswers(current=>({...current,[entry.item_version_id]:value}));void save(entry,value);}}/></fieldset></section>)}</div>
      {!!academicCaptures.size&&<p role="status">Stop and seal active answer recordings before finishing this section. Recordings are not automatically selected.</p>}
      <div className="exam-actions"><button className="quiet" disabled={busy} onClick={()=>void run(()=>flush(attempt.id!))}>Sync saved responses</button>{Number(attempt.section_index)+1<attempt.manifest.section_count?<button disabled={busy||pending>0||academicCaptures.size>0||!leaseReady||!captureReady||remaining===0} onClick={()=>void run(()=>finish(true))}>Finish section & continue</button>:<button disabled={busy||pending>0||academicCaptures.size>0||!leaseReady||!captureReady||remaining===0} onClick={()=>void run(()=>finish(false))}>Submit assessment</button>}</div>
    </>}
    {!attempt&&tenant&&<AcademicDeviceRecovery key={`${tenant}:${user}`} tenant={tenant} actor={user}/>}
    {attempt&&<AcademicUploadRecovery key={`${tenant}:${user}:${attempt.id}`} tenant={tenant} actor={user} attempt={attempt.id} revision={`${attempt.state}:${attempt.section_index}`}/>}
    {tenant&&(!attempt||['submitted','expired'].includes(attempt.state))&&<ReleasedResults key={`${tenant}:${user}:${attempt?.id??'history'}`} tenant={tenant} actor={user} attemptId={attempt?.id}/>}
    {tenant&&!preflight&&(!attempt||['submitted','expired'].includes(attempt.state))&&<CaptureRecoveryPanel devices={capture.devices} busy={busy||capture.busy} error={capture.error} notice={capture.recoveryNotice} recover={device=>void capture.recoverSaved(device)}/>}
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode>{new URLSearchParams(location.search).get('verify_certificate')==='1'?<CertificateVerification/>:<App/>}</React.StrictMode>);
