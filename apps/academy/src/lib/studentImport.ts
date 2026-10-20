import {supabase} from './supabase';

export type StudentImportConfig = {
 branch_id:string;source_filename:string;column_mapping:Record<string,string>;expected_rows:number;
 balance_convention:'credit_positive'|'debt_positive';currency:string;date_format:'iso'|'day_first'|'month_first';
 create_missing_groups:boolean;duplicate_strategy:'reject'|'skip'|'reuse';
};
export type StudentImportJob = {
 id:string;academy_id:string;branch_id:string;created_by:string;idempotency_key:string;
 settings:StudentImportConfig;expected_rows:number;staged_rows:number;created_at:string;
 status:'uploading'|'sealed'|'validated'|'committing'|'completed'|'failed'|'cancelled'|'reversing'|'reversed'|'recovery_review';
 validation?:{
  total_rows:number;invalid_rows:number;create_rows:number;reuse_rows:number;skipped_rows:number;new_groups:number;
  balance_rows:number|null;opening_debt:string|null;opening_credit:string|null;currency:string;
  preview_hash:string;ready:boolean;requires_finance_approval:boolean;
 }|null;
 receipt?:{applied_rows:number;skipped_rows:number;contacts:number;groups:number;memberships:number;guardians:number;
  parent_links:number;opening_balance_entries:number;opening_debt?:string|null;opening_credit?:string|null;messages_sent:number;payment_collected:boolean}|null;
 recovery_receipt?:{corrected_effects:number;manual_review_effects:number;missing_effects:number;reversal_entries:number}|null;
};
export type StudentImportRow = {
 row_number:number;source:Record<string,string|number|boolean|null>;mapped:Record<string,string|number|boolean|null>;
 normalized:Record<string,unknown>|null;errors:string[];finance_approved:boolean;
};
export type StudentImportResult = {
 job:StudentImportJob;permissions?:{can_commit:boolean;can_recover:boolean;scope_valid:boolean;finance_approved:boolean};
 rows?:StudentImportRow[];has_more?:boolean;preview_changed?:boolean;replayed?:boolean;
};
export type StudentImportOptions = {
 branches:{id:string;name:string;timezone:string;currency:string;can_create_groups:boolean}[];
 groups:{id:string;branch_id:string;name:string}[];
 limits:{rows:number;batch_rows:number;batch_bytes:number};
};
export type StudentImportHistory = {jobs:StudentImportJob[];has_more:boolean;cursor:{before_time:string;before_id:string}|null};
export class StudentImportRequestError extends Error {
 constructor(message:string,public status:number,public retryable:boolean){super(message);this.name='StudentImportRequestError';}
}
const url=import.meta.env.VITE_SUPABASE_URL as string,key=import.meta.env.VITE_SUPABASE_ANON_KEY as string;
type Action='options'|'stage'|'preview'|'commit'|'recover'|'job'|'rows'|'list'|'lookup'|'cancel';

// Pin every request and refresh to the account which owns the visible wizard.
// A shared-cookie account switch must never submit another person's file.
async function tokenFor(actorId:string,refresh=false):Promise<string>{
 const result=refresh?await supabase.auth.refreshSession():await supabase.auth.getSession();
 const session=result.data.session;
 if(result.error||!session)throw new StudentImportRequestError('Sign in again to continue this import.',401,false);
 if(session.user.id!==actorId)throw new StudentImportRequestError('Your account changed. Reopen the import workspace.',409,false);
 let subject:string|undefined;
 try{const segment=session.access_token.split('.')[1];subject=JSON.parse(atob(segment.replace(/-/g,'+').replace(/_/g,'/'))).sub;}catch{throw new StudentImportRequestError('Sign in again to continue this import.',401,false);}
 if(subject!==actorId)throw new StudentImportRequestError('Your account changed. Reopen the import workspace.',409,false);
 return session.access_token;
}
export async function studentImportRequest<T>(academyId:string,actorId:string,action:Action,payload:Record<string,unknown>={},signal?:AbortSignal):Promise<T>{
 const body=JSON.stringify({...payload,action:'student_import_'+action,academy_id:academyId});
 if(new TextEncoder().encode(body).byteLength>2*1024*1024)throw new StudentImportRequestError('This upload batch is too large. Use fewer rows in one batch.',413,false);
 const controller=new AbortController(),abort=()=>controller.abort();
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,60000);
 try{
  const send=async(refresh=false)=>fetch(`${url}/functions/v1/academy?action=student_import_${action}`,{
   method:'POST',headers:{apikey:key,Authorization:'Bearer '+await tokenFor(actorId,refresh),'Content-Type':'application/json'},body,signal:controller.signal,
  });
  let response=await send();if(response.status===401)response=await send(true);
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw new StudentImportRequestError(typeof value?.error==='string'?value.error:'The import request could not be completed.',response.status,value?.retryable===true||response.status>=500);
  if(!value||typeof value!=='object')throw new StudentImportRequestError('We could not confirm this import result. Check its status before trying again.',503,true);
  return value as T;
 }catch(error){
  if(error instanceof StudentImportRequestError)throw error;
  throw new StudentImportRequestError('We could not confirm this import result. Check its status before trying again.',503,true);
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
