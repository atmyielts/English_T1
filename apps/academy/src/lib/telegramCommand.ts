type Row=Record<string,unknown>;
type Pending={actor:string;academy:string;action:string;payload:Row};
const commands=new Set(['teacher_lesson_start','teacher_lesson_attendance','teacher_lesson_finish','record_attendance']);
export const isTelegramCommand=(action:string)=>commands.has(action);
const slot=(actor:string,academy:string)=>'schood.telegram.pending.v1:'+JSON.stringify([actor,academy]);
export function pendingTelegramCommand(actor:string,academy:string):Pending|null{
 if(!actor||!academy)return null;
 try{const raw=sessionStorage.getItem(slot(actor,academy));if(!raw||raw.length>60000)return null;const value=JSON.parse(raw) as Pending;return value.actor===actor&&value.academy===academy&&commands.has(value.action)&&value.payload&&value.payload.academy_id===academy&&value.payload._expected_actor===actor&&typeof value.payload.idempotency_key==='string'?value:null;}catch{return null;}
}
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['idempotency_key','_expected_actor','initData','init_data'].includes(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
export async function telegramCommand<T>(actor:string,academy:string,action:string,payload:Row,send:(action:string,payload:Row)=>Promise<T>):Promise<T>{
 if(!actor||!academy||!commands.has(action))throw Error('Refresh the workspace before saving this lesson.');
 const previous=pendingTelegramCommand(actor,academy);
 if(previous&&(previous.action!==action||JSON.stringify(canonical(previous.payload))!==JSON.stringify(canonical(payload))))throw Error('Confirm the pending change before starting another.');
 const business=Object.fromEntries(Object.entries(payload).filter(([key])=>!['initData','init_data'].includes(key)));
 const captured=previous??{actor,academy,action,payload:structuredClone({...business,academy_id:academy,idempotency_key:payload.idempotency_key??crypto.randomUUID(),_expected_actor:actor})};
 const encoded=JSON.stringify(captured);if(encoded.length>60000)throw Error('There is too much information to save at once.');
 try{sessionStorage.setItem(slot(actor,academy),encoded);}catch{throw Error('Your browser could not preserve this change. Enable session storage and retry.');}
 try{const result=await send(action,captured.payload),row=result as Row;
  if(!row||row.actor_id!==actor||row.academy_id!==academy||row.request_key!==captured.payload.idempotency_key||row.command!==action||typeof row.replayed!=='boolean')throw Object.assign(Error('Unable to confirm this change. Retry the same change.'),{retryable:true});
  sessionStorage.removeItem(slot(actor,academy));return result;
 }catch(error){const e=error as{status?:number;retryable?:boolean;message?:string};if(e.status&&e.status>=400&&e.status<500&&e.retryable!==true&&e.message!=='Your account changed. Reopen this page.')sessionStorage.removeItem(slot(actor,academy));throw error;}
}
