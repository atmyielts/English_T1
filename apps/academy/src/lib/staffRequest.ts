import {supabase} from './supabase';

export class StaffRequestError extends Error {
 constructor(message:string,public status:number,public retryable=false){super(message);this.name='StaffRequestError';}
}
const url=String(import.meta.env.VITE_SUPABASE_URL??'').replace(/\/$/,''),anon=String(import.meta.env.VITE_SUPABASE_ANON_KEY??'');
const pending=new Map<string,string>();
async function sessionFor(actor?:string,refresh=false){
 const result=refresh?await supabase.auth.refreshSession():await supabase.auth.getSession();
 const session=result.data.session;
 if(result.error||!session)throw new StaffRequestError('Sign in again to manage staff.',401);
 let subject:unknown;
 try{subject=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub;}catch{throw new StaffRequestError('Sign in again to manage staff.',401);}
 if(subject!==session.user.id||(actor&&actor!==session.user.id))throw new StaffRequestError('Your account changed. Reopen the staff workspace.',409);
 return session;
}
export async function staffRequest<T>(academyId:string,action:string,payload:Record<string,unknown>,expectedActor?:string):Promise<T>{
 const initial=await sessionFor(expectedActor),actor=initial.user.id;
 const identity=JSON.stringify([actor,academyId,action,payload]);
 const requestKey=typeof payload.idempotency_key==='string'?payload.idempotency_key:pending.get(identity)??crypto.randomUUID();
 pending.set(identity,requestKey);
 const body=JSON.stringify({...payload,action,academy_id:academyId,idempotency_key:requestKey});
 if(new TextEncoder().encode(body).byteLength>65536)throw new StaffRequestError('This staff change is too large.',413);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{
  const send=async(refresh=false)=>{
   const session=await sessionFor(actor,refresh);
   return fetch(`${url}/functions/v1/academy`,{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body,signal:controller.signal});
  };
  let response=await send();if(response.status===401)response=await send(true);
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw new StaffRequestError(typeof value?.error==='string'?value.error:'The staff change could not be completed.',response.status,value?.retryable===true||response.status>=500);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new StaffRequestError('We could not confirm this staff change. Retry the same change.',503,true);
  const row=action==='upsert_staff'?value.staff:action==='upsert_staff_branch_assignment'?value.assignment:null;
  if(action==='remove_staff'?value.ok!==true:(!row||row.academy_id!==academyId||typeof row.id!=='string'
    ||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)))
   throw new StaffRequestError('We could not confirm this staff change. Retry the same change.',503,true);
  await sessionFor(actor); // Do not publish the previous account's result after a switch.
  pending.delete(identity);
  return value as T;
 }catch(error){
  if(error instanceof StaffRequestError)throw error;
  throw new StaffRequestError('We could not confirm this staff change. Retry the same change.',503,true);
 }finally{clearTimeout(timer);}
}
