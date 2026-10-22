import {request} from './client';
import {ResponseJournal} from './journal';
import {GradeCommands} from './grade-command';
import {breakPolicy,NO_BREAKS,type BreakPolicy} from '../../assessment-core/src/accommodations.ts';
import {english,isWebKey,LocalizedError,localizeText,type Translate} from './i18n/translate.ts';
import type {WebKey} from './i18n/catalog.ts';

/** Editable staff form, in minutes. Converted to the strict whole-second contract
 * before any request; the server re-validates and remains the authority. */
export interface AccommodationDraft {extraMinutes:number;breaks:boolean;clock:BreakPolicy['clock'];maxBreaks:number;breakMinutes:number;totalMinutes:number;reason:string}
export interface RegistrationAccommodation {id:string;window_id:string;candidate_id:string;extra_seconds:number;break_policy:BreakPolicy;accommodation_revision:number}
export function draftFrom(row:RegistrationAccommodation):AccommodationDraft{
  const policy=row.break_policy??NO_BREAKS;
  return {extraMinutes:Math.round((row.extra_seconds??0)/60),breaks:policy.max_breaks>0,clock:policy.clock,maxBreaks:policy.max_breaks||1,breakMinutes:Math.max(1,Math.round(policy.max_seconds/60)||5),totalMinutes:Math.max(1,Math.round(policy.total_seconds/60)||10),reason:''};
}
export function accommodationInput(row:RegistrationAccommodation,draft:AccommodationDraft){
  const whole=(value:number,label:WebKey,min:number,max:number)=>{if(!Number.isInteger(value)||value<min||value>max)throw new LocalizedError(label,{min:String(min),max:String(max)});return value;};
  const extra=whole(draft.extraMinutes,'accommodation.whole.extra',0,1440)*60;
  const policy=draft.breaks?breakPolicy({schema_version:'assessment.break-policy.v1',clock:draft.clock,max_breaks:whole(draft.maxBreaks,'accommodation.whole.breaks',1,20),max_seconds:whole(draft.breakMinutes,'accommodation.whole.breakMinutes',1,60)*60,total_seconds:whole(draft.totalMinutes,'accommodation.whole.totalMinutes',1,240)*60}):NO_BREAKS;
  const reason=draft.reason.trim();
  if(!reason)throw new LocalizedError('accommodation.input.reasonRequired');
  if(reason.length>2000)throw new LocalizedError('accommodation.input.reasonTooLong');
  return {registration_id:row.id,revision:row.accommodation_revision??0,extra_seconds:extra,break_policy:policy,reason};
}
export function describePolicy(row:Pick<RegistrationAccommodation,'extra_seconds'|'break_policy'>,t:Translate=english){
  const policy=row.break_policy??NO_BREAKS,extra=Math.round((row.extra_seconds??0)/60);
  const time=extra?t('accommodation.policy.extra',{minutes:String(extra)}):t('accommodation.policy.standard');
  if(!policy.max_breaks)return t('accommodation.policy.noBreaks',{time});
  return t('accommodation.policy.breaks',{time,count:policy.max_breaks,each:String(Math.round(policy.max_seconds/60)),total:String(Math.round(policy.total_seconds/60)),clock:t(policy.clock==='running'?'accommodation.clock.running':'accommodation.clock.stopped')});
}
/** Known approval refusals are translated under `accommodation.code.<code>`. */
export function accommodationProblem(cause:unknown,t:Translate=english){
  if(cause instanceof LocalizedError)return cause.render(t);
  const message=cause instanceof Error?cause.message:String(cause??''),key=`accommodation.code.${message}`;
  return isWebKey(key)?t(key):message?localizeText(message,t):t('accommodation.problem.unconfirmed');
}
export async function openAccommodationCommands(tenant:string,actor:string){
  if(!navigator.locks)throw new LocalizedError('accommodation.locks');
  const scope=`accommodations:${tenant}:${actor}`,journal=await ResponseJournal.create(scope);
  const commands=new GradeCommands({
    async pending(){const rows=await journal.pending();if(!rows.length)return null;const value=rows[0].response as {action:string;data:Record<string,unknown>};return {...value,key:rows[0].command_key};},
    async save(action,data){const row=await journal.append(1,'accommodation-command',{action,data});return {action,data,key:row.command_key};},
    acknowledge:()=>journal.acknowledge(1),
  },intent=>request<Record<string,unknown>>('commands',tenant,{action:intent.action,data:intent.data},undefined,intent.key,actor),
  async <T,>(work:()=>Promise<T>):Promise<T>=>await navigator.locks.request(`schood-accommodation-commands:${scope}`,work),'accommodation');
  return {commands,close:()=>journal.close()};
}
