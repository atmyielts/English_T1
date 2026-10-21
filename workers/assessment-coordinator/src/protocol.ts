export interface Snapshot {
 attempt_id:string;state:string;deadline_at:string;section_deadline_at:string;closes_at:string;
 section_index:number;last_sequence:number;lease_epoch:number|null;lease_expires_at:string|null;server_time:string;next_deadline_at:string|null;
}
export interface Binding {tenant:string;attempt:string;actor:string}
export interface Invocation extends Binding {action:string;data:Record<string,unknown>;key:string;bearer:string}
export interface Result {result?:unknown;snapshot:Snapshot}
export interface RecoveryTicket {schema_version:'assessment.recovery.v1';tenant_id:string;attempt_id:string;revision:number;lease_token:string}
export interface RecoveryResult {accepted:boolean;binding?:Binding;snapshot?:Snapshot}
export interface Backend {invoke(input:Invocation):Promise<Result>;expire(binding:Binding):Promise<Result>;recover?(ticket:RecoveryTicket):Promise<RecoveryResult>}
export interface Storage {
 get<T>(key:string):Promise<T|undefined>;put(key:string,value:unknown):Promise<void>;
 setAlarm(timestamp:number):Promise<void>;deleteAlarm():Promise<void>;
}
export {ServiceError as RuntimeError} from '../../../packages/assessment-worker/src/error.ts';
function canonical(value:unknown):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;return `{${Object.entries(value).filter(([,entry])=>entry!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,entry])=>`${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;}
export async function digest(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
