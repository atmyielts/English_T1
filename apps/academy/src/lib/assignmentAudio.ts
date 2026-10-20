import {academyActorSession} from './staffRequest';
export class AudioRequestError extends Error{
 constructor(message:string,public status:number,public retryable=false){super(message);}
}
export type AudioRecording={id:string;academy_id:string;assignment_id:string;submission_id:string;kind:'submission'|'feedback';text_context:string;attempt_number:number;committed_at:string;mime_type:string;size_bytes:number};
export type AudioHistory={actor_id:string;assignment_id:string;recordings:AudioRecording[];has_more:boolean;cursor:{before_time:string;before_id:string}|null};
export type AudioDraft={file:File;text:string;requestKey:string;pending:boolean;revision:number};
const root=String(import.meta.env.VITE_SUPABASE_URL??'').replace(/\/$/,''),anon=String(import.meta.env.VITE_SUPABASE_ANON_KEY??'');
async function send(actor:string,action:string,input:Record<string,unknown>,file?:File){
 if(!actor)throw new AudioRequestError('Sign in again to continue.',401);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 try{
  const fields={...input,action,_expected_actor:actor};let body:FormData|string;
  if(file){body=new FormData();for(const [key,value] of Object.entries(fields))if(value!=null)body.set(key,String(value));body.set('file',file);}
  else body=JSON.stringify(fields);
  const request=async(refresh=false)=>{const session=await academyActorSession(actor,refresh);return fetch(root+'/functions/v1/academy'+(file?'?action=audio_upload':''),{
   method:'POST',headers:{apikey:anon,Authorization:'Bearer '+session.access_token,...(file?{}:{'Content-Type':'application/json'})},body,signal:controller.signal,
  });};
  let response=await request();if(response.status===401)response=await request(true);
  if(response.ok&&action==='audio_playback'){
   if(response.headers.get('X-Schood-Actor')!==actor||response.headers.get('X-Schood-Audio')!==input.audio_id||!response.headers.get('Content-Type')?.startsWith('audio/'))throw new AudioRequestError('Unable to confirm the saved recording. Try again.',503);
   const blob=await response.blob();try{await academyActorSession(actor);}catch{throw new AudioRequestError('Your account changed. Reopen this page.',409,true);}
   return {actor_id:actor,audio_id:input.audio_id,blob};
  }
  const result=await response.json().catch(()=>null);
  if(response.status===404&&result?.error==='Not found')throw new AudioRequestError('Recordings are temporarily unavailable. Try again.',503,true);
  if(!response.ok)throw new AudioRequestError(typeof result?.error==='string'?result.error:'The recording could not be confirmed. Retry the same recording.',response.status,result?.retryable===true||response.status>=500);
  if(!result||result.actor_id!==actor)throw new AudioRequestError('The recording could not be confirmed. Retry the same recording.',503,true);
  try{await academyActorSession(actor);}catch{throw new AudioRequestError('Your account changed. Reopen this page.',409,true);}
  return result;
 }catch(error){if(error instanceof AudioRequestError)throw error;throw new AudioRequestError(error instanceof Error?error.message:'The recording could not be confirmed. Retry the same recording.',503,true);}
 finally{clearTimeout(timer);}
}
export async function loadAssignmentAudio(actor:string,academy:string,assignment:string,submission?:string,cursor?:AudioHistory['cursor']):Promise<AudioHistory>{
 const result=await send(actor,'audio_list',{academy_id:academy,assignment_id:assignment,...(submission?{submission_id:submission}:{}),...cursor});
 if(result.assignment_id!==assignment||!Array.isArray(result.recordings)||typeof result.has_more!=='boolean'||result.recordings.some((row:AudioRecording)=>row.academy_id!==academy||row.assignment_id!==assignment))throw new AudioRequestError('Unable to load recording history. Try again.',503);
 return result;
}
export async function uploadAssignmentAudio(actor:string,academy:string,assignment:string,kind:'submission'|'feedback',draft:AudioDraft,submission?:string,expectedAttempt?:number){
 const result=await send(actor,'audio_upload',{academy_id:academy,assignment_id:assignment,kind,text_context:draft.text,idempotency_key:draft.requestKey,...(kind==='feedback'&&submission?{submission_id:submission,expected_attempt_number:expectedAttempt}:{})},draft.file);
 if(result.request_key!==draft.requestKey||result.audio?.academy_id!==academy||result.audio?.assignment_id!==assignment||result.audio?.kind!==kind||typeof result.replayed!=='boolean')throw new AudioRequestError('The recording could not be confirmed. Retry the same recording.',503,true);
 return result.audio as AudioRecording;
}
export async function assignmentAudioUrl(actor:string,academy:string,id:string):Promise<string>{
 const result=await send(actor,'audio_playback',{academy_id:academy,audio_id:id});
 if(result.audio_id!==id||!(result.blob instanceof Blob))throw new AudioRequestError('Unable to open this recording. Try again.',503);
 return URL.createObjectURL(result.blob);
}
