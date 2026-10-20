import {LegacyImportCommandError} from './legacy-import-command.ts';
type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
export const financeActions=new Set(['set_wallet_policy','create_pricing_plan','create_subscription','manage_subscription','create_charge','allocate_payment','post_account_adjustment',
 'record_payment_reconciliation','record_payment_promise','create_cashbox','open_cashier_shift','accept_cashier_handover','record_cash_movement','close_cashier_shift',
 'record_expense','upsert_expense_category','upsert_budget','upsert_compensation_rule','record_lesson_delivery','create_payroll_period','calculate_payroll','post_payroll_adjustment','transition_payroll']);
export async function runFinanceRead(db:Db,academyId:string,actorId:string,action:string,payload:Record<string,unknown>){
 if(!['commercial_core','operations_finance'].includes(action))throw new LegacyImportCommandError(400,'Choose a valid financial workspace.');
 const {data,error}=await db.rpc('academy_finance_read',{p_academy_id:academyId,p_actor_id:actorId,p_action:action,p_payload:payload});
 if(error)throw new LegacyImportCommandError(error.code==='42501'?403:error.code?.startsWith('22')?400:503,error.code==='42501'?'Your current access does not cover these financial records.':'Unable to load financial records. Try again.');
 const result=data as Record<string,unknown>|null;
 if(!result||result.actor_id!==actorId||result.schema_version!==1||!result.totals||!result.has_more)throw new LegacyImportCommandError(503,'Unable to confirm current financial records. Try again.');
 return result;
}
export async function runFinanceCommand(db:Db,academyId:string,actorId:string,command:string,input:Record<string,unknown>){
 const {action:_,command:__,academy_id:___,actor_id:____,_expected_actor:_____,idempotency_key:provided,...payload}=input;
 if(!financeActions.has(command)||new TextEncoder().encode(JSON.stringify(payload)).byteLength>60000)throw new LegacyImportCommandError(400,'Review the financial change.');
 // Older open pages did not send retry keys for master-record creation.
 // A stable legacy identity makes their identical resubmission safe.
 const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
 const key=provided??'legacy-'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([actorId,academyId,command,canonical(payload)]))))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
 if(typeof key!=='string'||!/^[A-Za-z0-9_.:-]{1,160}$/.test(key))throw new LegacyImportCommandError(400,'Review the financial retry key.');
 let response;
 try{response=await db.rpc('academy_finance_command',{p_academy_id:academyId,p_actor_id:actorId,p_command:command,p_payload:payload,p_request_key:key});}
 catch{throw new LegacyImportCommandError(503,'We could not confirm this financial change. Retry the same change.',true);}
 if(response.error){
  const code=response.error.code??'',invalid=code.startsWith('22')||['23502','23503','23514','P0001'].includes(code);
  throw new LegacyImportCommandError(code==='42501'?403:code==='23505'?409:invalid?400:503,
   code==='42501'?'Your current access does not cover these financial records.':code==='23505'?'The financial record or retry request changed. Refresh and review it.':invalid?'Review the financial values, available balance and current status.':'We could not confirm this financial change. Retry the same change.',!['42501','23505'].includes(code)&&!invalid);
 }
 const result=response.data as Record<string,unknown>|null;
 if(!result||result.actor_id!==actorId||result.request_key!==key||typeof result.replayed!=='boolean')throw new LegacyImportCommandError(503,'The financial change returned an incomplete receipt. Retry the same change.',true);
 return result;
}
