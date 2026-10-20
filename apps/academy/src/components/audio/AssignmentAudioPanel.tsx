import {useCallback,useEffect,useRef,useState} from 'react';
import {translate as t} from '../../i18n';
import {assignmentAudioUrl,AudioRequestError,loadAssignmentAudio,uploadAssignmentAudio,type AudioDraft,type AudioHistory,type AudioRecording} from '../../lib/assignmentAudio';
import {audioDraftKey,readAudioDraft,removeAudioDraft,saveAudioDraft} from '../../lib/audioDrafts';
import {useAudioRecorder} from './useAudioRecorder';
import './assignment-audio.css';

type Props={actorId:string;academyId:string;assignmentId:string;submissionId?:string;expectedAttempt?:number;kind:'submission'|'feedback';canRecord?:boolean;onSaved?:()=>void;title?:string};
export function AssignmentAudioPanel(props:Props){return <AudioPanel key={audioDraftKey(props.actorId,props.academyId,props.assignmentId,props.kind,props.submissionId,props.expectedAttempt)} {...props}/>;}
function AudioPanel({actorId,academyId,assignmentId,submissionId,expectedAttempt,kind,canRecord=true,onSaved,title}:Props){
 const key=audioDraftKey(actorId,academyId,assignmentId,kind,submissionId,expectedAttempt),[draft,setDraft]=useState<AudioDraft|null>(null),[text,setText]=useState(''),[preview,setPreview]=useState('');
 const [history,setHistory]=useState<AudioHistory|null>(null),[urls,setUrls]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const alive=useRef(true),url=useRef(''),playback=useRef<Record<string,string>>({}),inFlight=useRef(false),draftWrites=useRef<Promise<unknown>>(Promise.resolve());
 const persist=(value:AudioDraft,expectedPendingRevision?:number)=>{const write=draftWrites.current.catch(()=>{}).then(()=>saveAudioDraft(key,value,expectedPendingRevision));draftWrites.current=write;return write;};
 const showDraft=useCallback((value:AudioDraft|null)=>{if(url.current)URL.revokeObjectURL(url.current);url.current=value?URL.createObjectURL(value.file):'';setPreview(url.current);setDraft(value);setText(value?.text??'');},[]);
 const refresh=useCallback(async()=>{const result=await loadAssignmentAudio(actorId,academyId,assignmentId,submissionId);if(alive.current)setHistory(result);},[actorId,academyId,assignmentId,submissionId]);
 useEffect(()=>{
  alive.current=true;
  void readAudioDraft(key).then(value=>{if(alive.current){showDraft(value);setReady(true);}}).catch(()=>{if(alive.current){setReady(true);setError(t('Your saved recording could not be read. Check browser storage and retry.'));}});
  void refresh().catch(next=>{if(alive.current)setError(next instanceof Error?t(next.message):t('Unable to load recording history. Try again.'));});
  return()=>{alive.current=false;if(url.current)URL.revokeObjectURL(url.current);Object.values(playback.current).forEach(value=>URL.revokeObjectURL(value));playback.current={};};
 },[key,refresh,showDraft]);
 const receiveFile=(file:File,revision=Date.now())=>{
  if(file.size>20*1024*1024){setError(t('Choose a non-empty audio file under 20 MB.'));return;}
  const value={file,text,requestKey:crypto.randomUUID(),pending:false,revision};if(alive.current){showDraft(value);setError('');setNotice('');}
  void persist(value).catch(()=>{if(alive.current)setError(t('Your browser could not preserve this recording. Enable browser storage and retry.'));});
 };
 const recorder=useAudioRecorder(receiveFile);
 const locked=busy||draft?.pending===true||recorder.status!=='idle';
 const upload=async()=>{
  if(!draft||inFlight.current||!text.trim())return;inFlight.current=true;setBusy(true);setError('');setNotice('');
  const captured={...draft,text:draft.pending?draft.text:text.trim(),pending:true,revision:Date.now()};setDraft(captured);
  try{
   if(!await persist(captured))throw new AudioRequestError('The saved recording changed. Reopen the recording panel.',409,true);
   await uploadAssignmentAudio(actorId,academyId,assignmentId,kind,captured,submissionId,expectedAttempt);
   await draftWrites.current.catch(()=>{});const removed=await removeAudioDraft(key,captured.requestKey,captured.revision).catch(()=>false);const newer=removed?null:await readAudioDraft(key);
   if(alive.current){showDraft(newer);setNotice(t('Recording saved.'));await refresh();onSaved?.();}
  }catch(next){if(alive.current){setError(next instanceof Error?t(next.message):t('The recording could not be confirmed. Retry the same recording.'));
   if(next instanceof AudioRequestError&&!next.retryable){const corrected={...captured,pending:false,revision:Date.now()};await persist(corrected,captured.revision).then(saved=>{if(saved&&alive.current)setDraft(corrected);}).catch(()=>{});}
  }}finally{inFlight.current=false;if(alive.current)setBusy(false);}
 };
 const discard=async()=>{if(draft?.pending||inFlight.current)return;await draftWrites.current.catch(()=>{});if(draft&&!await removeAudioDraft(key,draft.requestKey,draft.revision))throw Error('The saved recording changed. Reopen the recording panel.');showDraft(null);setNotice(t('Recording draft discarded.'));};
 const play=async(recording:AudioRecording)=>{try{const local=await assignmentAudioUrl(actorId,academyId,recording.id);if(alive.current){if(playback.current[recording.id])URL.revokeObjectURL(playback.current[recording.id]);playback.current[recording.id]=local;setUrls({...playback.current});}else URL.revokeObjectURL(local);}catch(next){if(alive.current)setError(next instanceof Error?t(next.message):t('Unable to open this recording. Try again.'));}};
 const more=async()=>{if(!history?.cursor)return;setBusy(true);try{const next=await loadAssignmentAudio(actorId,academyId,assignmentId,submissionId,history.cursor);if(alive.current)setHistory(previous=>({...next,recordings:[...(previous?.recordings??[]),...next.recordings]}));}catch(next){if(alive.current)setError(next instanceof Error?t(next.message):t('Unable to load recording history. Try again.'));}finally{if(alive.current)setBusy(false);}};
 return <section className="panel grid assignment-audio" aria-label={title??t('Recordings and feedback')}>
  <h3>{title??t(kind==='feedback'?'Audio feedback':'Recorded response')}</h3>
  {error||recorder.error?<p className="form-error" role="alert">{error||t(recorder.error)}</p>:null}
  {notice?<p className="form-success" role="status">{notice}</p>:null}
  {!ready?<p role="status">{t('Loading saved recording…')}</p>:null}
  {(canRecord||draft||recorder.status!=='idle')&&ready?<>
   <p className="small muted">{t('Record up to 3 minutes or choose an audio file under 20 MB. Include a transcript or equivalent written response.')}</p>
   {recorder.status==='idle'?<div className="row wrap"><button type="button" className="small-btn" disabled={locked||!!draft||!canRecord} onClick={()=>void recorder.start()}>{t('Start recording')}</button><label>{t('Choose audio file')}<input type="file" accept="audio/webm,audio/ogg,audio/mp4,audio/wav,audio/mpeg,.m4a" disabled={locked||!!draft||!canRecord} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)receiveFile(file);}}/></label></div>
    :<div className="row wrap"><p role="status">{t(recorder.status==='requesting'?'Waiting for microphone permission…':'Recording in progress')} <output aria-live="off">{t('{seconds} seconds',{seconds:recorder.seconds})}</output></p><button type="button" className="small-btn" disabled={recorder.status!=='recording'} onClick={recorder.stop}>{t('Stop recording')}</button><button type="button" className="ghost-btn" onClick={recorder.cancel}>{t('Cancel recording')}</button></div>}
   {preview?<><audio controls preload="metadata" src={preview} style={{width:'100%',maxWidth:'100%'}} aria-label={t('Recording preview')}/><a className="small-btn" href={preview} download={draft?.file.name??'recording.webm'}>{t('Download recording draft')}</a></>:null}
   <label>{t('Transcript or equivalent written response')}<textarea aria-label={t('Transcript or equivalent written response')} className="input" maxLength={10000} value={text} disabled={locked||!canRecord} onChange={event=>{const value=event.target.value;setText(value);if(draft){const next={...draft,text:value,revision:Date.now()};setDraft(next);void persist(next).catch(()=>{if(alive.current)setError(t('Your browser could not preserve this recording. Enable browser storage and retry.'));});}}}/></label>
   {!canRecord&&draft&&!draft.pending?<p role="status">{t('This response changed. Download or discard this draft, then reopen the current attempt.')}</p>:null}
   {draft?.pending?<p role="status">{t('This recording is awaiting confirmation. Retry its saved contents before starting another.')}</p>:null}
   <div className="row wrap"><button type="button" className="primary-btn" disabled={busy||!draft||!text.trim()||recorder.status!=='idle'||(!canRecord&&!draft.pending)} onClick={()=>void upload()}>{t(draft?.pending?'Retry saved recording':kind==='feedback'?'Send audio feedback':'Submit recording')}</button><button type="button" className="ghost-btn" disabled={locked||!draft} onClick={()=>void discard().catch(()=>setError(t('The recording draft could not be discarded. Try again.')))}>{t('Discard recording draft')}</button></div>
  </>:null}
  <div className="row between wrap"><h4>{t('Saved recordings')}</h4><button type="button" className="small-btn" disabled={busy} onClick={()=>void refresh().catch(next=>setError(next instanceof Error?t(next.message):t('Unable to load recording history. Try again.')))}>{t('Refresh recordings')}</button></div>
  {history?.recordings.length===0?<p>{t('No saved recordings yet.')}</p>:null}
  {history?.recordings.map(recording=><article key={recording.id} className="panel grid"><strong>{t(recording.kind==='feedback'?'Teacher audio feedback':'Student recording')} · {t('Attempt')} {recording.attempt_number}</strong><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{recording.text_context}</p>
   {urls[recording.id]?<audio controls preload="none" src={urls[recording.id]} style={{width:'100%',maxWidth:'100%'}} aria-label={t(recording.kind==='feedback'?'Teacher audio feedback':'Student recording')} onError={()=>setError(t('This recording could not play. Open it again or read its written response.'))}/>:null}
   <button type="button" className="small-btn" onClick={()=>void play(recording)}>{t(urls[recording.id]?'Reload recording':'Open saved recording')}</button>
  </article>)}
  {history?.has_more?<button type="button" className="small-btn" disabled={busy} onClick={()=>void more()}>{t('Load more recordings')}</button>:null}
 </section>;
}
