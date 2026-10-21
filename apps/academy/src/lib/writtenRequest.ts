import{academyActorSession,StaffRequestError}from'./staffRequest';
export type WrittenDraft={submission_content?:string|null;submission_url?:string|null;notes?:string|null};
type FileIntent={name:string;type:string;size:number;sha256:string};
type Pending={actor:string;academy:string;assignment:string;key:string;draft:WrittenDraft;file:FileIntent|null};
const slot=(academy:string,actor:string,assignment:string)=>'schood.written.pending.v1:'+JSON.stringify([actor,academy,assignment]);
export function pendingWritten(academy:string,actor:string,assignment:string):Pending|null{
 try{const raw=sessionStorage.getItem(slot(academy,actor,assignment));if(!raw||raw.length>50000)return null;const p=JSON.parse(raw) as Pending;return p.actor===actor&&p.academy===academy&&p.assignment===assignment&&typeof p.key==='string'&&p.draft?p:null;}catch{return null;}
}
const canonical=(draft:WrittenDraft):WrittenDraft=>({submission_content:draft.submission_content?.trim()||null,submission_url:draft.submission_url?.trim()||null,notes:draft.notes?.trim()||null});
export async function writtenRequest<T>(academy:string,assignment:string,draft:WrittenDraft,file?:File):Promise<T>{
 const initial=await academyActorSession(),actor=initial.user.id;
 const capabilitySession=await academyActorSession(actor);
 const capabilities=await fetch(String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/,'')+'/functions/v1/academy?action=written_submission_capabilities',{headers:{apikey:String(import.meta.env.VITE_SUPABASE_ANON_KEY),Authorization:'Bearer '+capabilitySession.access_token},signal:AbortSignal.timeout(30000)});
 const available=await capabilities.json().catch(()=>null);if(!capabilities.ok||available?.written_receipts!==1||available.actor_id!==actor)throw new StaffRequestError('Written submissions are updating. Refresh shortly.',503,true);
 let pending=pendingWritten(academy,actor,assignment);
 let fileIntent:FileIntent|null=null;
 if(file){if(file.size>50*1024*1024)throw new StaffRequestError('The file must be no larger than 50 MB.',400);fileIntent={name:file.name,type:file.type,size:file.size,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('')};}
 if(pending){if(JSON.stringify(canonical(draft))!==JSON.stringify(canonical(pending.draft))||fileIntent&&JSON.stringify(fileIntent)!==JSON.stringify(pending.file))throw new StaffRequestError('Retry the original saved response before changing it.',409);}
 else{pending={actor,academy,assignment,key:crypto.randomUUID(),draft:canonical(draft),file:fileIntent};try{sessionStorage.setItem(slot(academy,actor,assignment),JSON.stringify(pending));}catch{throw new StaffRequestError('Enable browser session storage to preserve this response before submitting.',400);}}
 const captured=pending;await academyActorSession(actor);
 const form=new FormData();form.append('action','submit_assignment');form.append('academy_id',academy);form.append('assignment_id',assignment);form.append('_expected_actor',actor);form.append('idempotency_key',captured.key);form.append('file_intent',JSON.stringify(captured.file));
 for(const[key,value]of Object.entries(captured.draft))if(value)form.append(key,value);
 if(file)form.append('file',file);else if(captured.file)form.append('lookup_only','true');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),120000);
 try{
  const send=async(refresh=false)=>{const session=await academyActorSession(actor,refresh);return fetch(String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/,'')+'/functions/v1/academy',{method:'POST',headers:{apikey:String(import.meta.env.VITE_SUPABASE_ANON_KEY),Authorization:'Bearer '+session.access_token},body:form,signal:abort.signal});};
  let response=await send();if(response.status===401)response=await send(true);const result=await response.json().catch(()=>null);
  if(!response.ok)throw new StaffRequestError(result?.error??'Unable to confirm your response. Retry the saved response.',response.status,response.status>=500);
  if(!result?.submission?.id||result.actor_id!==actor||result.request_key!==captured.key)throw new StaffRequestError('Unable to confirm your response. Retry the saved response.',503,true);
  await academyActorSession(actor);sessionStorage.removeItem(slot(academy,actor,assignment));return result.submission as T;
 }catch(error){if(error instanceof StaffRequestError)throw error;throw new StaffRequestError('Unable to confirm your response. Retry the saved response.',503,true);}finally{clearTimeout(timer);}
}
