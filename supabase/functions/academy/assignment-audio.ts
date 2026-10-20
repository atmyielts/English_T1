import {LegacyImportCommandError} from './legacy-import-command.ts';
import {openAudio,protectAudio} from './audio-crypto.ts';

export const audioBucket='academy-assignment-audio-private-v1';
export const audioActions=new Set(['audio_upload','audio_list','audio_playback']);
type Payload=Record<string,unknown>;
type AudioDb={rpc:(name:string,args:Payload)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
type AudioStore={upload:(key:string,file:File,mime:string)=>Promise<void>;download:(key:string)=>Promise<Uint8Array<ArrayBuffer>>};
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail=(status:number,message:string,retryable=false):never=>{throw new LegacyImportCommandError(status,message,retryable);};
export async function readAudioUploadRequest(req:Request):Promise<Payload>{
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data'))return fail(415,'Choose a recorded audio file.');
 const max=21*1024*1024;if(Number(req.headers.get('content-length'))>max)return fail(413,'The recording is too large. Use an audio file under 20 MB.');
 const reader=req.body?.getReader();if(!reader)return fail(400,'Choose a recorded audio file.');
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();return fail(413,'The recording is too large. Use an audio file under 20 MB.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 let form:FormData;try{form=await new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')!}}).formData();}catch{return fail(400,'The recording upload is incomplete. Choose the file again.');}
 const allowed=new Set(['action','academy_id','assignment_id','submission_id','expected_attempt_number','kind','text_context','file','idempotency_key','_expected_actor']);
 for(const key of form.keys())if(!allowed.has(key)||form.getAll(key).length!==1)return fail(400,'Review the recording upload fields.');
 return {...Object.fromEntries(form.entries()),action:'audio_upload'};
}
export async function validateAudio(file:File){
 const mime=file.type.toLowerCase().split(';')[0].trim();
 if(file.size<4||file.size>20*1024*1024)return fail(400,'Choose a non-empty audio file under 20 MB.');
 const h=new Uint8Array(await file.slice(0,16).arrayBuffer()),text=(a:number,b:number)=>new TextDecoder().decode(h.slice(a,b));
 const valid=mime==='audio/webm'?h[0]===0x1a&&h[1]===0x45&&h[2]===0xdf&&h[3]===0xa3
  :mime==='audio/ogg'?text(0,4)==='OggS':mime==='audio/mp4'?text(4,8)==='ftyp'
  :mime==='audio/wav'?text(0,4)==='RIFF'&&text(8,12)==='WAVE':mime==='audio/mpeg'?text(0,3)==='ID3'||(h[0]===0xff&&(h[1]&0xe0)===0xe0):false;
 if(!valid)return fail(400,'Use a WebM, Ogg, MP4, WAV or MP3 audio recording.');
 return mime;
}
async function command(db:AudioDb,academy:string,actor:string,name:string,payload:Payload,key?:string){
 const {data,error}=await db.rpc('academy_audio_command',{p_academy:academy,p_actor:actor,p_command:name,p_payload:payload,p_request_key:key??null});
 if(error){const invalid=error.code?.startsWith('22')||['23502','23503','23514','P0001'].includes(error.code??'');return fail(error.code==='42501'?403:error.code==='23505'?409:invalid?400:503,
  error.code==='42501'?'Your current access does not cover this recording.':error.code==='23505'?'The assignment or recording changed. Review its current status.':invalid?'Review the recording and its written response.':'This recording is not confirmed. Retry the same recording.',!invalid&&!['42501','23505'].includes(error.code??''));}
 const value=data as Payload|null;if(!value||value.actor_id!==actor)return fail(503,'This recording is not confirmed. Retry the same recording.',true);return value;
}
const safeAudio=(value:Payload)=>{const {object_key:_,bucket:__,payload:___,content_hash:____,previous_submission_snapshot:_____,...safe}=value;return safe;};
export async function runAssignmentAudio(db:AudioDb,store:AudioStore,actor:string,action:string,input:Payload,encryptionSecret:string){
 const academy=input.academy_id;if(!uuid(academy)||!audioActions.has(action))return fail(400,'Choose a valid assignment recording.');
 if(input._expected_actor!=null&&input._expected_actor!==actor)return fail(409,'Your account changed. Reopen this page.');
 if(action==='audio_list'){
  if(!uuid(input.assignment_id)||(input.submission_id!=null&&!uuid(input.submission_id)))return fail(400,'Choose an assignment or student submission.');
  const result=await command(db,academy as string,actor,'list',{assignment_id:input.assignment_id,kind:'submission',...(input.submission_id?{submission_id:input.submission_id}:{}),
   ...(input.before_time?{before_time:input.before_time}:{}),...(input.before_id?{before_id:input.before_id}:{})});
  if(!Array.isArray(result.recordings)||result.assignment_id!==input.assignment_id||typeof result.has_more!=='boolean')return fail(503,'Unable to load recording history. Try again.');
  return {...result,recordings:(result.recordings as Payload[]).map(safeAudio)};
 }
 if(action==='audio_playback'){
  if(!uuid(input.audio_id))return fail(400,'Choose a saved recording.');
  const payload={audio_id:input.audio_id},found=await command(db,academy as string,actor,'playback',payload),audio=found.audio as Payload;
  if(!audio||audio.id!==input.audio_id||audio.bucket!==audioBucket||!String(audio.object_key).startsWith('academy/'+academy+'/private-audio/'))return fail(503,'Unable to open this recording. Try again.');
  let bytes:Uint8Array<ArrayBuffer>;
  try{bytes=await openAudio(encryptionSecret,await store.download(String(audio.object_key)),audioBucket+':'+audio.object_key);}catch{return fail(503,'Unable to open this recording. Try again.');}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  if(bytes.length!==Number(audio.size_bytes)||digest!==audio.content_hash)return fail(503,'Unable to confirm the saved recording. Try again.');
  await command(db,academy as string,actor,'playback',payload); // Recheck after download and decryption.
  return {actor_id:actor,audio_id:audio.id,bytes,mime:String(audio.mime_type)};
 }
 if(!(input.file instanceof File)||!uuid(input.assignment_id)||!['submission','feedback'].includes(String(input.kind))||(input.submission_id!=null&&!uuid(input.submission_id)))return fail(400,'Choose a valid assignment and audio file.');
 if(typeof input.idempotency_key!=='string'||!/^[A-Za-z0-9_.:-]{1,160}$/.test(input.idempotency_key))return fail(400,'Choose a valid recording retry key.');
 if(!/^[A-Za-z0-9_-]{43}$/.test(encryptionSecret))return fail(503,'Recordings are temporarily unavailable. Try again.',true);
 const text=String(input.text_context??'').trim();if(!text||text.length>10000)return fail(400,'Add a transcript or equivalent written response.');
 const mime=await validateAudio(input.file),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await input.file.arrayBuffer()))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
 if(input.kind==='feedback'&&(!Number.isSafeInteger(Number(input.expected_attempt_number))||Number(input.expected_attempt_number)<1))return fail(400,'Choose a valid assignment and audio file.');
 const payload={assignment_id:input.assignment_id,kind:input.kind,...(input.submission_id?{submission_id:input.submission_id}:{}),...(input.kind==='feedback'?{expected_attempt_number:Number(input.expected_attempt_number)}:{}),content_hash:hash,mime_type:mime,size_bytes:input.file.size,text_context:text};
 const prepared=await command(db,academy as string,actor,'reserve',payload,input.idempotency_key),audio=prepared.audio as Payload;
 if(!audio||!uuid(audio.id)||audio.academy_id!==academy||audio.actor_id!==actor||audio.assignment_id!==input.assignment_id||audio.kind!==input.kind||(input.kind==='feedback'&&audio.submission_id!==input.submission_id)||!['reserved','committed'].includes(String(audio.state))||audio.object_key!=='academy/'+academy+'/private-audio/'+audio.id)return fail(503,'This recording is not confirmed. Retry the same recording.',true);
 if(audio.state!=='committed'){
  try{const protectedBytes=await protectAudio(encryptionSecret,await input.file.arrayBuffer(),audioBucket+':'+audio.object_key);
   await store.upload(String(audio.object_key),new File([protectedBytes],'private-recording.bin',{type:'application/octet-stream'}),'application/octet-stream');
  }catch{return fail(503,'The recording upload is not confirmed. Retry the same recording.',true);}
 }
 const result=await command(db,academy as string,actor,'commit',{audio_id:audio.id,object_key:audio.object_key,bucket:audioBucket},input.idempotency_key),saved=result.audio as Payload;
 if(!saved||saved.id!==audio.id||saved.state!=='committed'||typeof result.replayed!=='boolean')return fail(503,'This recording is not confirmed. Retry the same recording.',true);
 return {actor_id:actor,request_key:input.idempotency_key,replayed:result.replayed,audio:safeAudio(saved)};
}
