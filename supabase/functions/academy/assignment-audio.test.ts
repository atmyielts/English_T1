import {audioBucket,readAudioUploadRequest,runAssignmentAudio,validateAudio} from './assignment-audio.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const academy=id(1),actor=id(2),assignment=id(3),audioId=id(4),submission=id(5),path=`academy/${academy}/private-audio/${audioId}`;
const secret=btoa(String.fromCharCode(...new Uint8Array(32).fill(7))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const assert=(value:unknown)=>{if(!value)throw Error('Audio boundary assertion failed');};
async function refuses(work:()=>Promise<unknown>,status:number){try{await work();}catch(error){assert((error as {status:number}).status===status);return;}throw Error('Expected audio refusal');}
const file=()=>new File([new Uint8Array([0x1a,0x45,0xdf,0xa3,1,2,3,4])],'owned.webm',{type:'audio/webm;codecs=opus'});
function fixture(){
 let audio:Record<string,unknown>|null=null,bytes=new Uint8Array(0),uploads=0,downloads=0,playbacks=0,denyPlayback=false;const calls:Array<Record<string,unknown>>=[];
 const db={rpc:(_name:string,args:Record<string,unknown>)=>{
  calls.push(args);assert(args.p_actor===actor&&args.p_academy===academy);
  if(args.p_command==='reserve'){
   const p=args.p_payload as Record<string,unknown>;assert(!('actor_id'in p)&&!('bucket'in p));
   audio??={id:audioId,academy_id:academy,actor_id:actor,assignment_id:assignment,object_key:path,bucket:audioBucket,kind:p.kind,submission_id:p.submission_id,previous_submission_snapshot:{metadata:{storage:'owned-private-previous-file'}},state:'reserved',mime_type:p.mime_type,size_bytes:p.size_bytes,content_hash:p.content_hash};
  }else if(args.p_command==='commit'){const replayed=audio?.state==='committed';audio={...audio,state:'committed',submission_id:submission};return Promise.resolve({data:{actor_id:actor,audio,replayed},error:null});}
  else if(args.p_command==='playback'){playbacks++;if(denyPlayback&&playbacks>1)return Promise.resolve({data:null,error:{code:'42501'}});}
  else if(args.p_command==='list')return Promise.resolve({data:{actor_id:actor,assignment_id:assignment,recordings:[audio],has_more:false,cursor:null},error:null});
  return Promise.resolve({data:{actor_id:actor,audio,replayed:false},error:null});
 }};
 const store={upload:async(key:string,upload:File,mime:string)=>{assert(key===path&&mime==='application/octet-stream');uploads++;bytes=new Uint8Array(await upload.arrayBuffer());},download:async(key:string)=>{assert(key===path);downloads++;return bytes;}};
 return {db,store,calls,uploads:()=>uploads,downloads:()=>downloads,stored:()=>bytes,revokeDuringPlayback:()=>{denyPlayback=true;}};
}
Deno.test('audio transport encrypts only server-owned paths, retries a committed receipt and strips storage coordinates',async()=>{
 const f=fixture(),input={academy_id:academy,assignment_id:assignment,kind:'submission',file:file(),text_context:'Owned written response',idempotency_key:'owned-audio',actor_id:id(99),bucket:'forged'};
 const first=await runAssignmentAudio(f.db,f.store,actor,'audio_upload',input,secret),second=await runAssignmentAudio(f.db,f.store,actor,'audio_upload',input,secret);
 assert('audio'in first&&first.audio?.id===audioId&&!('object_key'in first.audio)&&!('bucket'in first.audio)&&!('previous_submission_snapshot'in first.audio));
 assert('replayed'in second&&second.replayed===true&&f.uploads()===1);
 assert(new TextDecoder().decode(f.stored()).startsWith('SCHOODAUDIO1'));
 const history=await runAssignmentAudio(f.db,f.store,actor,'audio_list',{academy_id:academy,assignment_id:assignment},secret);
 assert('recordings'in history&&!(history.recordings as Array<Record<string,unknown>>)[0].object_key);
 const playback=await runAssignmentAudio(f.db,f.store,actor,'audio_playback',{academy_id:academy,audio_id:audioId},secret);
 assert('bytes'in playback&&playback.bytes?.length===8&&playback.bytes[0]===0x1a&&f.downloads()===1);
});
Deno.test('audio playback rechecks current authority after private bytes are downloaded',async()=>{
 const f=fixture();await runAssignmentAudio(f.db,f.store,actor,'audio_upload',{academy_id:academy,assignment_id:assignment,kind:'submission',file:file(),text_context:'Owned transcript',idempotency_key:'owned-revoke'},secret);
 f.revokeDuringPlayback();await refuses(()=>runAssignmentAudio(f.db,f.store,actor,'audio_playback',{academy_id:academy,audio_id:audioId},secret),403);assert(f.downloads()===1);
});
Deno.test('invalid account, media and missing encryption configuration cannot reserve or store an object',async()=>{
 const f=fixture(),input={academy_id:academy,assignment_id:assignment,kind:'submission',file:file(),text_context:'Owned transcript',idempotency_key:'owned-refused'};
 await refuses(()=>runAssignmentAudio(f.db,f.store,actor,'audio_upload',{...input,_expected_actor:id(9)},secret),409);
 await refuses(()=>runAssignmentAudio(f.db,f.store,actor,'audio_upload',input,''),503);
 await refuses(()=>runAssignmentAudio(f.db,f.store,actor,'audio_upload',{...input,file:new File(['<script>owned</script>'],'audio.webm',{type:'audio/webm'})},secret),400);
 assert(f.calls.length===0&&f.uploads()===0);
 await refuses(()=>validateAudio(new File([],'empty.webm',{type:'audio/webm'})),400);
});
Deno.test('multipart parsing bounds the body before form parsing and refuses duplicate fields',async()=>{
 await refuses(()=>readAudioUploadRequest(new Request('https://owned.invalid',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=owned','content-length':String(22*1024*1024)},body:'owned'})),413);
 const form=new FormData();form.append('assignment_id',assignment);form.append('assignment_id',id(7));form.set('file',file());
 await refuses(()=>readAudioUploadRequest(new Request('https://owned.invalid',{method:'POST',body:form})),400);
 const valid=new FormData();valid.set('file',file());valid.set('academy_id',academy);valid.set('assignment_id',assignment);
 const parsed=await readAudioUploadRequest(new Request('https://owned.invalid',{method:'POST',body:valid}));assert(parsed.action==='audio_upload'&&parsed.file instanceof File);
});

Deno.test('feedback uploads pin the reviewed submission attempt and omit private predecessor snapshots',async()=>{
 const f=fixture(),input={academy_id:academy,assignment_id:assignment,submission_id:submission,kind:'feedback',file:file(),text_context:'Owned teacher feedback',idempotency_key:'owned-teacher-feedback'};
 await refuses(()=>runAssignmentAudio(f.db,f.store,actor,'audio_upload',input,secret),400);assert(f.calls.length===0);
 const result=await runAssignmentAudio(f.db,f.store,actor,'audio_upload',{...input,expected_attempt_number:'3'},secret);
 assert((f.calls[0].p_payload as Record<string,unknown>).expected_attempt_number===3);
 assert('audio'in result&&result.audio?.kind==='feedback'&&!('previous_submission_snapshot'in result.audio));
});
