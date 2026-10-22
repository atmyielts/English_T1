import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {I18nProvider,LocaleSwitcher,useI18n} from '../../../packages/service-i18n/src/i18n.tsx';
import {catalogs,useAppT} from './i18n/index.ts';
import {errorText} from '../../../packages/assessment-web/src/i18n/errors.ts';
import { configured, request, proctorRequest, supabase, observeAccount, type Row } from '../../../packages/assessment-web/src/client';
import { ResponseJournal } from '../../../packages/assessment-web/src/journal';
import { assertCoordinatorReady,openCoordinator } from '../../../packages/assessment-web/src/coordinator';
import type { RuntimeSnapshot,RuntimeStatus } from '../../../packages/assessment-web/src/runtime';
import { ServiceHeader } from '../../../packages/service-design/src/ServiceHeader';
import {breakSecondsLeft,formatDuration} from '../../../packages/assessment-web/src/breaks';
const formatBreak=(state:import('../../../packages/assessment-core/src/accommodations.ts').BreakState|undefined,serverNow:number)=>formatDuration(breakSecondsLeft(state,serverNow));
import type { FormItem, Manifest } from '../../../packages/assessment-core/src/mod.ts';
import type { CandidateProctorState, Preflight } from '../../../packages/proctor-web/src/types';
import { PreflightScreen } from './PreflightScreen';
import { MonitoringPanel } from './MonitoringPanel';
import { useProctor } from './useProctor';
import {useCandidateCapture} from './useCandidateCapture';
import {CapturePanel} from './CapturePanel';
import {captureInteractionReady} from '../../../packages/assessment-core/src/capture-launch';
import {CaptureRecoveryPanel} from './CaptureRecoveryPanel';
import {BreakPanel} from './BreakPanel';
import {InstitutionChooser,JoinSitting,joinReturnUrl,takePendingJoin} from './JoinSitting';
import {SnapshotSetup,useSnapshots,type SnapshotCamera} from './useSnapshots';
import {IntegrityOutcomes} from './IntegrityOutcomes';
import {accountLink} from '../../../packages/assessment-web/src/account-links';
import {useBreaks} from './useBreaks';
import type {BreakState} from '../../../packages/assessment-core/src/accommodations.ts';
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
function CandidateMediaAnswer(props:React.ComponentProps<typeof CandidateMediaAnswerComponent>){const t=useAppT();return <React.Suspense fallback={<p role="status">{t('exam.loading.mediaAnswer')}</p>}><LazyAcademicAnswer {...props}/></React.Suspense>;}
function AcademicUploadRecovery(props:React.ComponentProps<typeof AcademicUploadRecoveryComponent>){const t=useAppT();return <React.Suspense fallback={<p role="status">{t('exam.loading.uploadRecovery')}</p>}><LazyAcademicRecovery {...props}/></React.Suspense>;}
function AcademicDeviceRecovery(props:React.ComponentProps<typeof AcademicDeviceRecoveryComponent>){const t=useAppT();return <React.Suspense fallback={<p role="status">{t('exam.loading.deviceRecovery')}</p>}><LazyAcademicDevices {...props}/></React.Suspense>;}
function App() {
  const t=useAppT(),{number}=useI18n();
  const tenant = new URLSearchParams(location.search).get('tenant_id') ?? '';
  const [user,setUser]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [join,setJoin]=useState(takePendingJoin);
  const [snapshotCamera,setSnapshotCamera]=useState<SnapshotCamera|null>(null);
  const [registrations,setRegistrations]=useState<Row[]>([]),[attempt,setAttempt]=useState<Attempt|null>(null),[answers,setAnswers]=useState<Record<string,unknown>>({});
  const [confirming,setConfirming]=useState<'section'|'submit'|null>(null);
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
  const snapshots=useSnapshots({tenant,user,session:proctor?.session?.id??'',interval:proctor?.session?.policy_snapshot.snapshot_interval_seconds??0,running:!!attempt&&['active','paused'].includes(attempt.state),camera:snapshotCamera,setCamera:setSnapshotCamera,emit:monitoring.emit});
  useEffect(()=>observeAccount(setUser),[]);
  useEffect(()=>{setConfirmedAnswers({});setAcademicCaptures(new Set());},[user,tenant]);
  useEffect(()=>{connection.current?.close();connection.current=null;journal.current?.close();journal.current=null;setAttempt(null);setAnswers({});setProctor(null);setPreflight(null);setPending(0);setError('');setBusy(false);setRuntimeStatus({ready:false,problem:null,expires_at:null});manifestIndex.current=-1;runtimeSnapshot.current=null;localFailure.current=false;saved.current={};sequence.current=0;},[user,tenant]);
  useEffect(()=>{let active=true;setRegistrations([]);if(user&&tenant)request<Row[]>('candidate/registrations',tenant).then(value=>{if(active)setRegistrations(value);}).catch(cause=>{if(active)setError(errorText(cause,t));});return()=>{active=false;};},[user,tenant]);
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
    }catch(cause){if(account.current===expected)setError(errorText(cause,t,'exam.error.loadSection'));}finally{loadingSection.current=false;}
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
    if(state.candidate_id!==expected)throw new Error(t('exam.error.ownership'));
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
      const active=connection.current;if(active?.id!==id)throw new Error(t('exam.error.reconnectSync'));
      await active.runtime.command('response.append',{sequence:entry.sequence,item_version_id:entry.item_version_id,response:entry.response},entry.command_key);
      await store.acknowledge(entry.sequence);
      if(account.current===expected&&connection.current?.id===id)setConfirmedAnswers(current=>({...current,[entry.item_version_id]:JSON.stringify(entry.response)}));
    }if(account.current===expected){setPending((await store.pending()).length);setError('');}}catch(cause){if(account.current===expected)setError(errorText(cause,t,'exam.error.syncLater'));}finally{sending.current=false;}
  }
  useEffect(()=>{if(!attempt?.id||attempt.state!=='active')return;const timer=setInterval(()=>void flush(attempt.id!),5000);const online=()=>void flush(attempt.id!);window.addEventListener('online',online);return()=>{clearInterval(timer);window.removeEventListener('online',online);};},[attempt?.id,attempt?.state]);
  async function run(work:()=>Promise<void>){const expected=user;setBusy(true);setError('');try{await work();}catch(cause){if(account.current===expected)setError(errorText(cause,t));}finally{if(account.current===expected)setBusy(false);}}
  function save(item:FormItem,value:unknown){
    const store=journal.current,expected=user;
    localWrite.current=localWrite.current.then(async()=>{
      if(!store||!attempt?.id||account.current!==expected)return;
      if(saved.current[item.item_version_id]===JSON.stringify(value))return;
      await store.append(sequence.current+1,item.item_version_id,value);
      if(account.current!==expected)return;sequence.current++;
      saved.current[item.item_version_id]=JSON.stringify(value);setPending((await store.pending()).length);
    }).catch(cause=>{if(account.current===expected){localFailure.current=true;setError(t('exam.error.localSave',{reason:errorText(cause,t)}));}});
    return localWrite.current;
  }
  async function selectAcademic(entry:FormItem,value:unknown){
    const expected=user,id=attempt?.id,store=journal.current;
    if(!id||!store||attempt?.state!=='active'||!leaseReady||!captureReady||remaining===0||manifestIndex.current!==Number(attempt.section_index)||account.current!==expected||localFailure.current)throw new Error(t('exam.error.selectBlocked'));
    setAnswers(current=>({...current,[entry.item_version_id]:value}));await save(entry,value);
    if(localFailure.current)throw new Error(t('exam.error.selectUnsaved'));
    await flush(id);
    if(account.current!==expected||connection.current?.id!==id||journal.current!==store)throw new Error(t('exam.error.selectChanged'));
    return !(await store.pending()).some(row=>row.item_version_id===entry.item_version_id);
  }
  async function finish(sectionOnly:boolean){
    if(academicCaptureRef.current.size)throw new Error(t('exam.error.finishRecording'));
    await localWrite.current;
    if(localFailure.current)throw new Error(t('exam.error.finishUnsaved'));
    await flush(attempt!.id!);
    if((await journal.current!.pending()).length)throw new Error(t('exam.error.finishSync'));
    const active=connection.current;if(!active||active.id!==attempt!.id)throw new Error(t('exam.error.finishReconnect'));
    const action=sectionOnly?'section.advance':'attempt.submit',key=`${attempt!.id}:${attempt!.section_index}:${action}`;
    // The command key survives a reload of this tab, so a lost reply is retried
    // with the same key and returns the same result instead of a second command.
    const stored=`schood-exam-final:${tenant}:${user}:${key}`;
    const savedKey=(()=>{try{return sessionStorage.getItem(stored);}catch{return null;}})();
    const commandKey:string=actionKeys.current[key]??savedKey??crypto.randomUUID();actionKeys.current[key]=commandKey;
    try{sessionStorage.setItem(stored,commandKey);}catch{/* storage unavailable */}
    await active.runtime.command(action,{},commandKey);delete actionKeys.current[key];
    try{sessionStorage.removeItem(stored);}catch{/* storage unavailable */}
    setConfirming(null);
    if(sectionOnly)await loadSection(attempt!.id!);
  }
  // A break starts only after every saved answer is confirmed and no academic
  // recording is open, so nothing new is admitted while questions are hidden.
  async function beforeBreak(){
    if(academicCaptureRef.current.size)throw new Error(t('exam.error.breakRecording'));
    await localWrite.current;
    if(localFailure.current)throw new Error(t('exam.error.breakUnsaved'));
    await flush(attempt!.id!);
    if((await journal.current!.pending()).length)throw new Error(t('exam.error.breakSync'));
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
    if(!registration)throw new Error(t('exam.error.unassigned'));
    if(!Array.isArray(registration.required_services)||!registration.required_services.includes('proctor')){await launch(registrationId);return;}
    const policy=await proctorRequest<Preflight>(`candidate/preflight?registration_id=${registrationId}`,tenant);
    if(account.current!==user)return;if(!policy.required){await launch(registrationId);return;}setAcknowledged(false);setPreflight({registrationId,policy});
  }
  async function acceptAndLaunch(){
    if(!preflight)return;
    if(!preflight.policy.consented){if(!acknowledged)throw new Error(t('exam.error.acknowledge'));await proctorRequest('commands',tenant,{action:'preparation.accept',data:{registration_id:preflight.registrationId,policy_id:preflight.policy.policy_id,acknowledged:true}},`consent:${preflight.registrationId}:${preflight.policy.policy_id}`);}
    const current=await proctorRequest<Preflight>(`candidate/preflight?registration_id=${preflight.registrationId}`,tenant);
    if(!current.required)throw new Error(t('exam.error.policyChanged'));setPreflight({...preflight,policy:current});
    // Webcam snapshots need the camera on and an identity photo before the test starts.
    if((current.policy.snapshot_interval_seconds??0)>0&&!snapshotCamera?.identity)throw new Error(t('exam.snapshots.required'));
    if(current.runtime_ready&&current.identity_verified){
      if(current.capture_required){
        if(!current.capture_enabled||current.capture_protocol!=='proctor.capture.v1')throw new Error(t('exam.error.captureDisabled'));
        if(capture.registration!==preflight.registrationId||capture.view?.closed||!capture.view){await capture.prepare(preflight.registrationId);return;}
        await launch(preflight.registrationId,await capture.binding());
      }else await launch(preflight.registrationId);
    }
  }
  const remaining=attempt?Math.max(0,Math.ceil((Math.min(Date.parse(attempt.deadline_at),Date.parse(attempt.section_deadline_at))-(now+offset))/1000)):0;
  const leaseReady=runtimeStatus.ready&&!!runtimeStatus.expires_at&&Date.parse(runtimeStatus.expires_at)>now+offset;
  const breakState=(attempt as {accommodations?:BreakState}|null)?.accommodations,onBreak=attempt?.state==='active'&&!!breakState?.active;
  const breaks=useBreaks(tenant,user,attempt?.id??'',()=>connection.current?.id===attempt?.id?connection.current!.runtime:null,beforeBreak);
  const autoRetried=useRef('');
  const captureReady=captureInteractionReady(captureRequired,capture.ready,String(attempt?.state??''),capture.view?.launch.auto_pause);
  useEffect(()=>{if(!captureRequired||!attempt){hadCaptureLease.current=false;return;}if(leaseReady)hadCaptureLease.current=true;const terminal=['submitted','expired'].includes(attempt.state);if(terminal||(hadCaptureLease.current&&!leaseReady&&!!runtimeStatus.expires_at&&Date.parse(runtimeStatus.expires_at)<=now+offset)){hadCaptureLease.current=false;void capture.dispose(terminal?'runtime_end':'capture_error').catch(cause=>{if(account.current===user)setError(t('exam.error.recordingStopped',{reason:errorText(cause,t)}));});}},[captureRequired,attempt?.id,attempt?.state,leaseReady,runtimeStatus.expires_at,now,offset]);
  useEffect(()=>{const key=breaks.pending?.key;if(!key||!leaseReady||breaks.busy||autoRetried.current===key)return;autoRetried.current=key;void breaks.retry();},[breaks.pending?.key,leaseReady,breaks.busy]);
  if(!configured)return <main className="configuration"><h1>Schood Exam</h1><p>{t('exam.unconfigured')}</p></main>;
  if(!user)return <main className="signin"><div className="brand">Schood <span>Exam</span></div><LocaleSwitcher label={t('locale.label')}/><h1>{t(join?'exam.join.signinTitle':'exam.signin.title')}</h1>{join&&<p>{t('exam.join.signinLead')}</p>}<form onSubmit={(event:FormEvent)=>{event.preventDefault();void run(async()=>{const {error}=await supabase!.auth.signInWithPassword({email,password});if(error)throw error;});}}><label>{t('exam.signin.email')}<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></label><label>{t('exam.signin.password')}<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label><button disabled={busy}>{t('exam.signin.submit')}</button></form><p className="account-links"><a href={accountLink('signup',join?joinReturnUrl(join):location.href)}>{t('account.create')}</a><a href={accountLink('forgot',join?joinReturnUrl(join):location.href)}>{t('account.forgot')}</a></p>{error&&<p role="alert" className="error">{error}</p>}</main>;
  if(attempt&&attempt.candidate_id!==user)return <main className="configuration"><p role="status">{t('exam.accountChanging')}</p></main>;
  const section=attempt?.manifest.sections[0];
  const recordingPanel=(registration:string,active=false)=><CapturePanel view={capture.registration===registration?capture.view:null} busy={busy||capture.busy} error={capture.error} start={capture.start} recover={capture.recover} sync={capture.sync} reconnectLive={capture.reconnectLive} reopen={active||preflight?.policy.consented&&preflight.policy.identity_verified?()=>void run(()=>capture.prepare(registration)):undefined} stop={active?()=>void run(()=>capture.dispose('user_stop')):undefined} active={active}/>;
  return <div className="exam-workspace"><ServiceHeader service="Exam" labels={{skip:t('header.skip'),home:t('header.home'),menu:t('header.menu'),workspace:t('header.workspace')}}>{attempt?.state==='active'&&(onBreak?<div className="clock" aria-label={t('exam.clock.breakLabel')}>{t('exam.clock.break',{time:formatBreak(breakState,now+offset)})}</div>:<div className="clock" aria-label={t('exam.clock.label')}>{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</div>)}<span role="status">{pending?t('exam.sync.pending',{count:pending}):t('exam.sync.done')}</span>{(!attempt||['submitted','expired'].includes(attempt.state))&&<button className="quiet" disabled={busy} onClick={()=>void run(async()=>{const {error}=await supabase!.auth.signOut();if(error)throw error;})}>{t('exam.signout')}</button>}<LocaleSwitcher label={t('locale.label')}/></ServiceHeader><main id="workspace-main" tabIndex={-1}>
    {error&&!(runtimeStatus.device?.kind==='takeover_required'||runtimeStatus.device?.kind==='superseded')&&<p role="alert" className="error">{error}</p>}
    {attempt&&['active','paused'].includes(attempt.state)&&(runtimeStatus.device?.kind==='takeover_required'||runtimeStatus.device?.kind==='superseded')&&<section className="runtime-status device-choice" role="alertdialog" aria-labelledby="device-heading" aria-describedby="device-detail">
      <h2 id="device-heading">{t(runtimeStatus.device.kind==='superseded'?'exam.device.movedHeading':'exam.device.choiceHeading')}</h2>
      <p id="device-detail">{t(runtimeStatus.device.kind==='superseded'?'exam.device.movedDetail':'exam.device.choiceDetail')}</p>
      {runtimeStatus.device.kind==='superseded'&&<p role="status">{pending>0?t('exam.device.unsent',{count:pending}):t('exam.device.allSent')}</p>}
      <button disabled={busy} onClick={()=>void run(async()=>{await connection.current!.runtime.takeover();await flush(attempt.id!);})}>{t(runtimeStatus.device.kind==='superseded'?'exam.device.takeBack':'exam.device.continueHere')}</button>
    </section>}
    {attempt&&runtimeStatus.device?.kind==='took_over'&&<p className="notice" role="status">{t('exam.device.tookOver',{count:runtimeStatus.device.saved_responses})}</p>}
    {attempt&&['active','paused'].includes(attempt.state)&&runtimeStatus.device?.kind!=='takeover_required'&&runtimeStatus.device?.kind!=='superseded'&&(!leaseReady||runtimeStatus.problem)&&<section className="runtime-status" aria-labelledby="runtime-heading"><h2 id="runtime-heading">{t(leaseReady?'exam.runtime.interrupted':'exam.runtime.attention')}</h2><p role="status">{t('exam.runtime.status',{problem:runtimeStatus.problem?errorText(new Error(runtimeStatus.problem),t):t('exam.runtime.verifying')})}</p><button disabled={busy} onClick={()=>void run(async()=>{await connection.current!.runtime.tick();await flush(attempt.id!);})}>{t('exam.runtime.reconnect')}</button></section>}
    {monitoring.enabled&&<MonitoringPanel status={monitoring.status} notices={monitoring.notices} busy={busy} acknowledge={id=>void run(()=>monitoring.acknowledge(id))} sync={()=>void run(monitoring.sync)}/>}
    {snapshots.view}
    {!preflight&&captureRequired&&attempt&&['active','paused'].includes(attempt.state)&&recordingPanel(String(attempt.registration_id),true)}
    {join&&!attempt?<JoinSitting join={join} user={user} done={()=>setJoin(null)}/>:preflight?<PreflightScreen policy={preflight.policy} acknowledged={acknowledged} setAcknowledged={setAcknowledged} busy={busy||capture.busy} capturePrepared={capture.registration===preflight.registrationId&&!!capture.view} captureReady={capture.ready} snapshotsReady={!((preflight.policy.policy.snapshot_interval_seconds??0)>0)||!!snapshotCamera?.identity} proceed={()=>void run(acceptAndLaunch)} cancel={()=>void run(async()=>{if(capture.view?.launch.attempt_id)await capture.dispose('user_stop');else await capture.cancel();setPreflight(null);})}>{(preflight.policy.policy.snapshot_interval_seconds??0)>0&&<SnapshotSetup camera={snapshotCamera} setCamera={setSnapshotCamera}/>}{preflight.policy.capture_enabled&&recordingPanel(preflight.registrationId)}</PreflightScreen>:!tenant?<InstitutionChooser user={user}/>:!attempt?<><h1>{t('exam.sittings.title')}</h1><ul className="records">{registrations.map(row=><li key={row.id}><strong>{typeof row.title==='string'&&row.title?row.title:t('exam.sittings.untitled')}</strong><span>{row.id}</span><button disabled={busy} onClick={()=>void run(()=>prepare(row.id!))}>{t('exam.sittings.start')}</button></li>)}</ul>{!registrations.length&&<p>{t('exam.sittings.empty')}</p>}{registrations.some(row=>Array.isArray(row.required_services)&&row.required_services.includes('proctor'))&&<IntegrityOutcomes tenant={tenant} user={user}/>}</>:attempt.state!=='active'?<><h1>{t(attempt.state==='paused'?'exam.state.paused':attempt.state==='expired'?'exam.state.expired':'exam.state.submitted')}</h1><p>{t(attempt.state==='paused'?'exam.state.pausedHint':'exam.state.doneHint')}</p></>:<>
      {onBreak?<BreakPanel state={breakState} serverNow={now+offset} monitored={captureRequired||monitoring.enabled} pending={breaks.pending} error={breaks.error} busy={busy||breaks.busy} blocked="" begin={()=>undefined} end={id=>void breaks.end(id)} retry={()=>void breaks.retry()}/>:<>
      <p className="eyebrow">{t('exam.section.position',{position:Number(attempt.section_index)+1,count:attempt.manifest.section_count})}</p><h1>{section?.title}</h1><p>{t('exam.section.autosave')}</p>
      <div className="questions">{section?.items.map((entry,index)=><section key={entry.item_version_id}><p className="eyebrow">{t('exam.question.position',{position:index+1,points:number(entry.item.max_score)})}</p><h2>{entry.item.prompt}</h2><QuestionMedia item={entry.item} tenant={tenant} actor={user} attempt={attempt.id} enabled={remaining>0&&leaseReady&&captureReady&&manifestIndex.current===Number(attempt.section_index)&&attempt.candidate_id===user}/><fieldset disabled={!(MEDIA_RESPONSE_TYPES as readonly string[]).includes(entry.item.type)&&(remaining===0||busy||!leaseReady||!captureReady||manifestIndex.current!==Number(attempt.section_index))}><Answer entry={entry} value={answers[entry.item_version_id]} mediaContext={{tenant,actor:user,attempt:attempt.id,enabled:remaining>0&&leaseReady&&captureReady&&manifestIndex.current===Number(attempt.section_index)&&attempt.candidate_id===user}} academicResponse={<CandidateMediaAnswer tenant={tenant} actor={user} attempt={attempt.id!} entry={entry} value={answers[entry.item_version_id]} confirmed={confirmedAnswers[entry.item_version_id]===JSON.stringify(answers[entry.item_version_id])} enabled={!busy&&remaining>0&&leaseReady&&captureReady&&manifestIndex.current===Number(attempt.section_index)&&attempt.candidate_id===user} runtime={()=>connection.current?.id===attempt.id?connection.current.runtime:null} select={value=>selectAcademic(entry,value)} onRecording={active=>{if(account.current===user)setAcademicCaptures(current=>{if(current.has(entry.item_version_id)===active)return current;const next=new Set(current);if(active)next.add(entry.item_version_id);else next.delete(entry.item_version_id);return next;});}}/>} onChange={value=>{setAnswers(current=>({...current,[entry.item_version_id]:value}));void save(entry,value);}}/></fieldset></section>)}</div>
      {!!academicCaptures.size&&<p role="status">{t('exam.recordings.open')}</p>}
      <BreakPanel state={breakState} serverNow={now+offset} monitored={captureRequired||monitoring.enabled} pending={breaks.pending} error={breaks.error} busy={busy||breaks.busy} blocked={academicCaptures.size?t('exam.break.blocked.recording'):!leaseReady?t('exam.break.blocked.reconnect'):!captureReady?t('exam.break.blocked.monitoring'):remaining===0?t('exam.break.blocked.clock'):''} begin={()=>void breaks.begin()} end={id=>void breaks.end(id)} retry={()=>void breaks.retry()}/>
      <div className="exam-actions"><button className="quiet" disabled={busy} onClick={()=>void run(()=>flush(attempt.id!))}>{t('exam.sync.button')}</button>{Number(attempt.section_index)+1<attempt.manifest.section_count?<button disabled={busy||pending>0||academicCaptures.size>0||!leaseReady||!captureReady||remaining===0} onClick={()=>setConfirming('section')}>{t('exam.section.finish')}</button>:<button disabled={busy||pending>0||academicCaptures.size>0||!leaseReady||!captureReady||remaining===0} onClick={()=>setConfirming('submit')}>{t('exam.submit')}</button>}</div>
      {confirming&&(()=>{const items=section?.items??[],answered=items.filter(entry=>{const value=answers[entry.item_version_id];return value!==undefined&&value!==null&&value!==''&&!(Array.isArray(value)&&!value.length)&&!(typeof value==='object'&&!Array.isArray(value)&&!Object.keys(value as object).length);}).length;return <section className="final-confirm" role="alertdialog" aria-labelledby="final-confirm-heading" aria-describedby="final-confirm-detail">
        <h2 id="final-confirm-heading">{t(confirming==='submit'?'exam.confirm.submitHeading':'exam.confirm.sectionHeading')}</h2>
        <p id="final-confirm-detail">{t('exam.confirm.answered',{answered,total:items.length})} {t(confirming==='submit'?'exam.confirm.submitDetail':'exam.confirm.sectionDetail')}</p>
        {answered<items.length&&<p role="status">{t('exam.confirm.unanswered',{count:items.length-answered})}</p>}
        <div className="exam-actions"><button className="quiet" disabled={busy} onClick={()=>setConfirming(null)}>{t('exam.confirm.keepWorking')}</button><button disabled={busy||pending>0||academicCaptures.size>0||!leaseReady||!captureReady||remaining===0} onClick={()=>void run(()=>finish(confirming==='section'))}>{t(confirming==='submit'?'exam.confirm.submitNow':'exam.confirm.continue')}</button></div>
      </section>;})()}
    </>}</>}
    {!attempt&&tenant&&<AcademicDeviceRecovery key={`${tenant}:${user}`} tenant={tenant} actor={user}/>}
    {attempt&&<AcademicUploadRecovery key={`${tenant}:${user}:${attempt.id}`} tenant={tenant} actor={user} attempt={attempt.id} revision={`${attempt.state}:${attempt.section_index}`}/>}
    {tenant&&(!attempt||['submitted','expired'].includes(attempt.state))&&<ReleasedResults key={`${tenant}:${user}:${attempt?.id??'history'}`} tenant={tenant} actor={user} attemptId={attempt?.id}/>}
    {tenant&&!preflight&&(!attempt||['submitted','expired'].includes(attempt.state))&&<CaptureRecoveryPanel devices={capture.devices} busy={busy||capture.busy} error={capture.error} notice={capture.recoveryNotice} recover={device=>void capture.recoverSaved(device)}/>}
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><I18nProvider catalogs={catalogs}>{new URLSearchParams(location.search).get('verify_certificate')==='1'?<CertificateVerification/>:<App/>}</I18nProvider></React.StrictMode>);
