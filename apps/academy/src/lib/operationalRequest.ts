import {captureWorkspaceBranch} from './branchScope';
import {academyActorSession,StaffRequestError} from './staffRequest';
type Pending={actor:string;academy:string;command:string;payload:Record<string,unknown>};
const grades=new Set(['grade_submission','submit_assignment']);
const actions=new Set(['create_lead','create_lesson_session','teacher_lesson_start','teacher_lesson_attendance','teacher_lesson_finish',...grades]);
const slot=(academy:string,actor:string)=>'schood.operational.pending.v1:'+JSON.stringify([actor,academy]);
export function pendingOperational(academy:string,actor:string):Pending|null{
 try{const raw=sessionStorage.getItem(slot(academy,actor));if(!raw||raw.length>65536)return null;const row=JSON.parse(raw) as Pending;
  return row.actor===actor&&row.academy===academy&&actions.has(row.command)&&row.payload&&typeof row.payload.idempotency_key==='string'?row:null;
 }catch{return null;}
}
const notify=()=>window.dispatchEvent(new Event('schood-operational-pending'));
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='idempotency_key').sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
export async function operationalRequest<T>(academy:string,command:string,payload:Record<string,unknown>,expectedActor?:string):Promise<T>{
 const first=await academyActorSession(expectedActor),actor=first.user.id;
 if(!actions.has(command))throw new StaffRequestError('Choose a valid inquiry or lesson action.',400);
 const previous=pendingOperational(academy,actor);
 payload=previous?(Object.hasOwn(previous.payload,'_scope_branch_id')?{...payload,_scope_branch_id:previous.payload._scope_branch_id}:payload):captureWorkspaceBranch(payload,academy,actor);
 if(previous&&(previous.command!==command||JSON.stringify(canonical(previous.payload))!==JSON.stringify(canonical(payload))))throw new StaffRequestError('Confirm the pending change before starting another.',409);
 const captured:Pending=previous??{actor,academy,command,payload:structuredClone({...payload,idempotency_key:payload.idempotency_key??crypto.randomUUID()})};
 const body=JSON.stringify({...Object.fromEntries(Object.entries(captured.payload).filter(([key])=>key!=='_scope_branch_id')),action:grades.has(command)?'grading_command':'operational_command',command,academy_id:academy,_expected_actor:actor});
 if(new TextEncoder().encode(body).byteLength>60000)throw new StaffRequestError('There is too much information to save at once.',413);
 try{sessionStorage.setItem(slot(academy,actor),JSON.stringify(captured));}catch{throw new StaffRequestError('Your browser could not preserve this change. Enable session storage and retry.',400);}
 notify();
 const timer=new AbortController(),timeout=setTimeout(()=>timer.abort(),30000);
 const url=String(import.meta.env.VITE_SUPABASE_URL??'').replace(/\/$/,''),anon=String(import.meta.env.VITE_SUPABASE_ANON_KEY??'');
 try{
  const send=async(refresh=false)=>{const session=await academyActorSession(actor,refresh);return fetch(url+'/functions/v1/academy'+(captured.payload._scope_branch_id?'?_scope_branch_id='+encodeURIComponent(String(captured.payload._scope_branch_id)):''),{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body,signal:timer.signal});};
  let response=await send();if(response.status===401)response=await send(true);
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw new StaffRequestError(typeof result?.error==='string'?result.error:'Unable to confirm this change. Retry the same change.',response.status,result?.retryable===true||response.status>=500||response.status===404&&result?.error==='Not found');
  if(!result||result.actor_id!==actor||result.request_key!==captured.payload.idempotency_key||result.command!==command||typeof result.replayed!=='boolean')throw new StaffRequestError('Unable to confirm this change. Retry the same change.',503,true);
  await academyActorSession(actor);
  sessionStorage.removeItem(slot(academy,actor));notify();return result as T;
 }catch(error){
  if(error instanceof StaffRequestError){if(!error.retryable&&error.message!=='Your account changed. Reopen this page.'){sessionStorage.removeItem(slot(academy,actor));notify();}throw error;}
  throw new StaffRequestError('Unable to confirm this change. Retry the same change.',503,true);
 }finally{clearTimeout(timeout);}
}
export async function retryOperational(academy:string,actor:string){const pending=pendingOperational(academy,actor);if(!pending)throw new StaffRequestError('There is no pending change. Refresh the workspace.',409);return operationalRequest<Record<string,unknown>>(academy,pending.command,pending.payload,actor);}
