import type {BreakState} from '../../assessment-core/src/accommodations.ts';
import {GradeCommands,type GradeIntent,type IntentStore} from './grade-command';
import {english,isWebKey,LocalizedError,localizeText,type Translate} from './i18n/translate.ts';

/** What the candidate may do now. The coordinator/database remain the authority;
 * this only decides which controls to offer and how to describe them. */
export interface BreakAvailability {
  enabled:boolean;
  canBegin:boolean;
  remainingBreaks:number;
  remainingSeconds:number;
  nextBreakSeconds:number;
  clock:'stopped'|'running';
}
export function breakAvailability(state:BreakState|undefined|null):BreakAvailability{
  const policy=state?.policy;
  if(!state||!policy||policy.max_breaks<1)return {enabled:false,canBegin:false,remainingBreaks:0,remainingSeconds:0,nextBreakSeconds:0,clock:policy?.clock??'stopped'};
  const remainingBreaks=Math.max(0,policy.max_breaks-state.used_breaks);
  const remainingSeconds=Math.max(0,Math.floor(policy.total_seconds-state.used_seconds));
  const nextBreakSeconds=Math.min(policy.max_seconds,remainingSeconds);
  return {enabled:true,canBegin:!state.active&&remainingBreaks>0&&nextBreakSeconds>=1,remainingBreaks,remainingSeconds,nextBreakSeconds,clock:policy.clock};
}
/** Whole seconds left in the active break against server-corrected time. */
export function breakSecondsLeft(state:BreakState|undefined|null,serverNow:number){
  if(!state?.active)return 0;
  return Math.max(0,Math.ceil((Date.parse(state.active.ends_at)-serverNow)/1000));
}
export function formatDuration(seconds:number){
  const whole=Math.max(0,Math.floor(seconds)),hours=Math.floor(whole/3600),minutes=Math.floor((whole%3600)/60),rest=whole%60;
  return hours?`${hours}:${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')}`:`${minutes}:${String(rest).padStart(2,'0')}`;
}
/** Known break refusals are translated under `break.code.<code>`. */
export function breakProblem(cause:unknown,t:Translate=english){
  if(cause instanceof LocalizedError)return cause.render(t);
  const message=cause instanceof Error?cause.message:String(cause??''),key=`break.code.${message}`;
  return isWebKey(key)?t(key):message?localizeText(message,t):t('break.problem.unconfirmed');
}
/** One durable break intent per candidate attempt. A lost reply is retried with
 * the same key so the coordinator returns the one committed break, never a second. */
export interface BreakJournal {pending():Promise<{response:unknown;command_key:string}[]>;append(sequence:number,kind:string,value:unknown):Promise<{command_key:string}>;acknowledge(sequence:number):Promise<void>;close():void}
export function breakIntentStore(journal:BreakJournal):IntentStore{
  return {
    async pending(){const rows=await journal.pending();if(!rows.length)return null;const value=rows[0].response as {action:string;data:Record<string,unknown>};return {...value,key:rows[0].command_key};},
    async save(action,data){const row=await journal.append(1,'break-command',{action,data});return {action,data,key:row.command_key};},
    acknowledge:()=>journal.acknowledge(1),
  };
}
export type BreakTransport=(intent:GradeIntent)=>Promise<unknown>;
export function breakCommands(journal:BreakJournal,transport:BreakTransport,lock:<T>(work:()=>Promise<T>)=>Promise<T>){
  return new GradeCommands(breakIntentStore(journal),transport,lock,'break');
}
