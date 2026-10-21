import {request} from './client';
import {ResponseJournal} from './journal';
import {GradeCommands} from './grade-command';
import type {StaffCapability} from '../../assessment-core/src/staff';
import {LocalizedError,english,isWebKey,messageText,type Translate} from './i18n/translate.ts';
export interface StaffAccess{can_manage:boolean;bootstrap:boolean;delegable:StaffCapability[];authority_ends_at:Record<string,string|null>}
export interface StaffMember{id:string;name:string;status:string;org_role:string;inherited:boolean;membership_revision?:number;membership_scope?:'organization'|'assessment';assessment_status?:'active'|'suspended'|null}
export interface StaffRole{id:string;role_id:string;title:string;version:number;capabilities:StaffCapability[]}
export interface StaffDetail{user_id:string;grants:{capability:StaffCapability;revision:number;expires_at:string|null;revoked_at:string|null;effective:boolean}[];roles:(StaffRole&{role_version_id:string;revision:number;expires_at:string|null;revoked_at:string|null})[]}
export async function openStaffCommands(tenant:string,actor:string){if(!navigator.locks)throw new LocalizedError("staff.locks");const scope=`staff:${tenant}:${actor}`,journal=await ResponseJournal.create(scope),lock=async<T>(work:()=>Promise<T>):Promise<T>=>await navigator.locks.request(`schood-staff-commands:${scope}`,work);
 const commands=new GradeCommands({async pending(){const rows=await journal.pending();if(!rows.length)return null;const value=rows[0].response as {action:string;data:Record<string,unknown>};return {...value,key:rows[0].command_key};},async save(action,data){const row=await journal.append(1,'staff-command',{action,data});return {action,data,key:row.command_key};},acknowledge:()=>journal.acknowledge(1)},intent=>request('staff/commands',tenant,{action:intent.action,data:intent.data},undefined,intent.key,actor),lock,'staff permission');return {commands,close:()=>journal.close()};}
/** Known staff refusals are translated under `staff.code.<code>`. */
export function staffProblem(cause:unknown,t:Translate=english){const code=(cause as {code?:string})?.code,key=`staff.code.${code}`;return code&&isWebKey(key)?t(key):messageText(cause,t,'staff.problem.failed');}
