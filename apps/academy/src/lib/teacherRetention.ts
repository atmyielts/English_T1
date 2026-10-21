import {academyActorSession,StaffRequestError} from './staffRequest';
export type RetentionRow={staff_id:string;display_name:string;cohort_size:number;retained_students:number;paused_students:number;teacher_transfers:number;academy_departures:number;completed_students:number;retention_denominator:number;unresolved_changes:number;excluded_corrections:number;teacher_retention_percent:number|null;academy_retention_percent:number|null};
export type RetentionReport={schema_version:1;actor_id:string;academy_id:string;from:string;to:string;branch_id:string|null;covered_from:string|null;history_complete:boolean;has_more:boolean;rows:RetentionRow[];branches:{id:string;name:string}[]};
const root=String(import.meta.env.VITE_SUPABASE_URL??'').replace(/\/$/,''),anon=String(import.meta.env.VITE_SUPABASE_ANON_KEY??'');
export async function readTeacherRetention(academy:string,actor:string,period:{from:string;to:string;branch_id:string|null},signal:AbortSignal):Promise<RetentionReport>{
 if(!actor)throw new StaffRequestError('Sign in again to continue.',401);
 const send=async(refresh=false)=>{const session=await academyActorSession(actor,refresh);return fetch(root+'/functions/v1/academy',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'teacher_retention',academy_id:academy,_expected_actor:actor,...period}),signal});};
 let response=await send();if(response.status===401)response=await send(true);
 const value=await response.json().catch(()=>null);await academyActorSession(actor);
 if(!response.ok)throw new StaffRequestError(typeof value?.error==='string'?value.error:'Unable to load teacher retention. Try again.',response.status);
 if(!value||value.actor_id!==actor||value.academy_id!==academy||value.schema_version!==1||!Array.isArray(value.rows)||!Array.isArray(value.branches))throw new StaffRequestError('Unable to confirm this retention report. Try again.',503);
 return value;
}
