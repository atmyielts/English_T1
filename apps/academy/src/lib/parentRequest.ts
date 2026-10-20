import {supabase} from './supabase';

export class ParentRequestError extends Error {
 constructor(message:string,public status:number,public retryable=false){super(message);this.name='ParentRequestError';}
}
const url=String(import.meta.env.VITE_SUPABASE_URL??'').replace(/\/$/,''),anon=String(import.meta.env.VITE_SUPABASE_ANON_KEY??'');
const reads=new Set(['guardian_dashboard','guardian_service_requests']);
async function sessionFor(actor?:string,refresh=false){
 const result=refresh?await supabase.auth.refreshSession():await supabase.auth.getSession();
 const session=result.data.session;
 if(result.error||!session)throw new ParentRequestError('Sign in again to continue.',401);
 let subject:unknown;
 try{subject=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub;}catch{throw new ParentRequestError('Sign in again to continue.',401);}
 if(subject!==session.user.id||(actor&&actor!==session.user.id))throw new ParentRequestError('Your account changed. Reopen this page.',409);
 return session;
}
export async function parentRequest<T>(academyId:string,action:string,payload:Record<string,unknown>,expectedActor?:string):Promise<T>{
 if(!reads.has(action)&&action!=='guardian_claim_link')throw new ParentRequestError('Choose a valid parent portal page.',400);
 if(expectedActor==='')throw new ParentRequestError('Sign in again to continue.',401);
 const actor=(await sessionFor(expectedActor)).user.id;
 const body=JSON.stringify({...payload,action:reads.has(action)?'guardian_portal_read_command':'guardian_link_command',command:action,academy_id:academyId});
 const failure=reads.has(action)?'We could not load your parent portal. Try again.':'We could not confirm your account link. Open the invitation again.';
 if(new TextEncoder().encode(body).byteLength>65536)throw new ParentRequestError('There is too much information to save at once. Save fewer changes.',413);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{
  const send=async(refresh=false)=>{
   const session=await sessionFor(actor,refresh);
   return fetch(`${url}/functions/v1/academy`,{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body,signal:controller.signal});
  };
  let response=await send();if(response.status===401)response=await send(true);
  const value=await response.json().catch(()=>null);
  if(!response.ok){
   if(response.status===404&&value?.error==='Not found')throw new ParentRequestError('This service is temporarily unavailable. Try again.',503,true);
   throw new ParentRequestError(typeof value?.error==='string'?value.error:failure,response.status,value?.retryable===true||response.status>=500);
  }
  if(!value||typeof value!=='object'||Array.isArray(value)||value.actor_id!==actor)throw new ParentRequestError(failure,503,true);
  const uuid=(id:unknown)=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const valid=action==='guardian_dashboard'
   ? ['guardians','children','preferences','notifications'].every(key=>Array.isArray(value[key]))&&typeof value.has_more==='boolean'
   : action==='guardian_service_requests'
   ? value.relationship_id===payload.relationship_id&&Array.isArray(value.requests)&&Array.isArray(value.events)
   : uuid(value.academy_id)&&uuid(value.guardian?.id)&&value.guardian.status==='verified'&&value.guardian.academy_id===value.academy_id
    &&uuid(value.relationship?.id)&&value.relationship.guardian_id===value.guardian.id&&value.relationship.academy_id===value.academy_id
    &&value.relationship.status==='active'&&value.relationship.consent_status==='granted';
  if(!valid)throw new ParentRequestError(failure,503,true);
  await sessionFor(actor);
  return value as T;
 }catch(error){
  if(error instanceof ParentRequestError)throw error;
  throw new ParentRequestError(failure,503,true);
 }finally{clearTimeout(timer);}
}
