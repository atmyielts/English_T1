import {request} from './client';
import {ResponseJournal} from './journal';
import {GradeCommands} from './grade-command';
import {breakPolicy,NO_BREAKS,type BreakPolicy} from '../../assessment-core/src/accommodations.ts';

/** Editable staff form, in minutes. Converted to the strict whole-second contract
 * before any request; the server re-validates and remains the authority. */
export interface AccommodationDraft {extraMinutes:number;breaks:boolean;clock:BreakPolicy['clock'];maxBreaks:number;breakMinutes:number;totalMinutes:number;reason:string}
export interface RegistrationAccommodation {id:string;window_id:string;candidate_id:string;extra_seconds:number;break_policy:BreakPolicy;accommodation_revision:number}
export function draftFrom(row:RegistrationAccommodation):AccommodationDraft{
  const policy=row.break_policy??NO_BREAKS;
  return {extraMinutes:Math.round((row.extra_seconds??0)/60),breaks:policy.max_breaks>0,clock:policy.clock,maxBreaks:policy.max_breaks||1,breakMinutes:Math.max(1,Math.round(policy.max_seconds/60)||5),totalMinutes:Math.max(1,Math.round(policy.total_seconds/60)||10),reason:''};
}
export function accommodationInput(row:RegistrationAccommodation,draft:AccommodationDraft){
  const whole=(value:number,label:string,min:number,max:number)=>{if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${label} must be a whole number from ${min} to ${max}.`);return value;};
  const extra=whole(draft.extraMinutes,'Extra time (minutes)',0,1440)*60;
  const policy=draft.breaks?breakPolicy({schema_version:'assessment.break-policy.v1',clock:draft.clock,max_breaks:whole(draft.maxBreaks,'Number of breaks',1,20),max_seconds:whole(draft.breakMinutes,'Minutes per break',1,60)*60,total_seconds:whole(draft.totalMinutes,'Total break minutes',1,240)*60}):NO_BREAKS;
  const reason=draft.reason.trim();
  if(!reason)throw new Error('Record the approval basis. Do not include diagnoses or medical details.');
  if(reason.length>2000)throw new Error('Keep the approval basis under 2,000 characters.');
  return {registration_id:row.id,revision:row.accommodation_revision??0,extra_seconds:extra,break_policy:policy,reason};
}
export function describePolicy(row:Pick<RegistrationAccommodation,'extra_seconds'|'break_policy'>){
  const policy=row.break_policy??NO_BREAKS,extra=Math.round((row.extra_seconds??0)/60);
  const time=extra?`+${extra} min`:'Standard time';
  if(!policy.max_breaks)return `${time} · no breaks`;
  return `${time} · ${policy.max_breaks} break${policy.max_breaks===1?'':'s'}, up to ${Math.round(policy.max_seconds/60)} min each, ${Math.round(policy.total_seconds/60)} min total, clock ${policy.clock}`;
}
const messages:Record<string,string>={
  revision_conflict:'These accommodations changed since you opened them. Refresh and review the current values before approving.',
  accommodations_locked_after_start:'The candidate has already started. Accommodations are fixed for that attempt.',
  invalid_break_policy:'Use whole minutes: up to 20 breaks, 60 minutes per break and 240 minutes in total, with the total at least one break long.',
  invalid_accommodation:'Check the extra time and approval basis.',
  forbidden:'Your role does not allow approving accommodations.',
  not_found:'This registration is no longer available.',
  idempotency_conflict:'A different saved approval is still pending. Retry it before making another change.',
};
export function accommodationProblem(cause:unknown){const message=cause instanceof Error?cause.message:String(cause??'');return messages[message]??(message||'The approval could not be confirmed. It is saved on this device; retry when connected.');}
export async function openAccommodationCommands(tenant:string,actor:string){
  if(!navigator.locks)throw new Error('Use a browser with secure workspace locking to approve accommodations.');
  const scope=`accommodations:${tenant}:${actor}`,journal=await ResponseJournal.create(scope);
  const commands=new GradeCommands({
    async pending(){const rows=await journal.pending();if(!rows.length)return null;const value=rows[0].response as {action:string;data:Record<string,unknown>};return {...value,key:rows[0].command_key};},
    async save(action,data){const row=await journal.append(1,'accommodation-command',{action,data});return {action,data,key:row.command_key};},
    acknowledge:()=>journal.acknowledge(1),
  },intent=>request<Record<string,unknown>>('commands',tenant,{action:intent.action,data:intent.data},undefined,intent.key,actor),
  async <T,>(work:()=>Promise<T>):Promise<T>=>await navigator.locks.request(`schood-accommodation-commands:${scope}`,work),'accommodation');
  return {commands,close:()=>journal.close()};
}
