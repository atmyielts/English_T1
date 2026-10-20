import {validateTelegramInitData} from '../_shared/telegram-init-data.ts';
type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const isId=(v:unknown):v is string=>typeof v==='string'&&uuid.test(v);
const privateFields=['metadata','token','token_hash','target','error','telegram_chat_id','telegram_user_id','provider_message_id'];
const sections=['attendance','grades','homework','schedule','charges','balances','messages','announcements','resources','progress_reports','notifications','classrooms'];
export class GuardianPortalError extends Error{constructor(public status:number,message:string,public retryable=false){super(message);this.name='GuardianPortalError';}}
const incomplete=()=>new GuardianPortalError(503,'We could not load your parent portal. Try again.',true);
async function rpc(db:Db,name:string,args:Record<string,unknown>){
 let response:Awaited<ReturnType<Db['rpc']>>;
 try{response=await db.rpc(name,args);}catch{throw incomplete();}
 if(response.error){
  if(response.error.code==='42501')throw new GuardianPortalError(403,'Parent access changed or expired. Ask the academy to review it.');
  if(response.error.code==='P0010')throw new GuardianPortalError(410,'Invitation has expired. Ask the academy for a new link.');
  if(response.error.code==='P0002')throw new GuardianPortalError(404,'Invitation or student record is no longer available.');
  if(response.error.code?.startsWith('22'))throw new GuardianPortalError(400,'Choose a student from your parent portal.');
  throw incomplete();
 }
 if(!object(response.data))throw incomplete();return response.data;
}

export async function claimGuardianFromTelegram(db:Db,actor:string,input:Record<string,unknown>,botToken:string){
 if(!isId(actor))throw new GuardianPortalError(403,'Sign in again to continue.');
 if(!botToken.trim())throw new GuardianPortalError(503,'Telegram linking is temporarily unavailable. Ask the academy for a parent invitation.',true);
 if(typeof input.token!=='string'||!input.token.trim()||input.token.length>200||input.confirm_access!==true)throw new GuardianPortalError(400,'Review and confirm the parent invitation.');
 const init=input.init_data??input.initData;
 if(typeof init!=='string'||init.length>10000)throw new GuardianPortalError(400,'Open the parent invitation inside Telegram.');
 let identity:Awaited<ReturnType<typeof validateTelegramInitData>>;
 try{identity=await validateTelegramInitData(init,botToken,{maxAgeSeconds:3600,futureToleranceSeconds:60});}catch{throw new GuardianPortalError(403,'Open the parent invitation inside Telegram.');}
 const result=await rpc(db,'academy_claim_guardian_link',{p_token:input.token.trim(),p_user_id:actor,p_telegram_user_id:identity.telegram_user_id,p_telegram_chat_id:identity.telegram_user_id,p_telegram_username:identity.username});
 if(result.actor_id!==actor||!object(result.guardian)||!isId(result.guardian.id)||result.guardian.status!=='verified'||!isId(result.academy_id)||result.guardian.academy_id!==result.academy_id
  ||!object(result.relationship)||result.relationship.guardian_id!==result.guardian.id||result.relationship.academy_id!==result.academy_id||result.relationship.status!=='active'||result.relationship.consent_status!=='granted')throw incomplete();
 publicRecord(result.guardian);publicRecord(result.relationship);return result;
}
function publicRecord(v:unknown){
 if(!object(v)||privateFields.some(key=>Object.hasOwn(v,key)))throw incomplete();return v;
}
function child(v:unknown){
 const row=publicRecord(v);
 if(!isId(row.relationship_id)||!isId(row.academy_id)||!isId(row.guardian_id)||!object(row.student)||!isId(row.student.id)||typeof row.student.name!=='string'
  ||!object(row.permissions)||typeof row.details_loaded!=='boolean')throw incomplete();
 for(const key of ['status','attendance','grades','homework','schedule','payments','debt','messages','progress_reports','resources','announcements','message_academy'])if(typeof row.permissions[key]!=='boolean')throw incomplete();
 for(const key of sections){
  if(!Array.isArray(row[key])||(row[key] as unknown[]).length>(key==='classrooms'?5000:200))throw incomplete();
  for(const record of row[key] as unknown[])publicRecord(record);
 }
 for(const [section,permission] of Object.entries({attendance:'attendance',grades:'grades',homework:'homework',schedule:'schedule',charges:'payments',messages:'messages',announcements:'announcements',resources:'resources',progress_reports:'progress_reports'})){
  if(!row.permissions[permission]&&(row[section] as unknown[]).length)throw incomplete();
 }
 if(!row.permissions.debt&&((row.balances as unknown[]).length||(row.charges as Record<string,unknown>[]).some(r=>['outstanding_amount','calculated_status','days_overdue','aging_bucket'].some(field=>Object.hasOwn(r,field)))))throw incomplete();
 for(const grade of row.grades as Record<string,unknown>[])if(grade.feedback!=null&&typeof grade.feedback!=='string')throw incomplete();
 for(const n of row.notifications as Record<string,unknown>[])if(n.relationship_id!==row.relationship_id||n.guardian_id!==row.guardian_id||n.academy_id!==row.academy_id)throw incomplete();
 return row;
}
export async function readGuardianPortal(db:Db,actor:string,input:Record<string,unknown>={},legacyFull=false){
 if(!isId(actor))throw new GuardianPortalError(403,'Sign in again to continue.');
 for(const field of ['relationship_id','after_id'])if(input[field]!=null&&!isId(input[field]))throw new GuardianPortalError(400,'Choose a student from your parent portal.');
 const payload={...(input.relationship_id?{relationship_id:input.relationship_id}:{}),...(input.after_id?{after_id:input.after_id}:{}),limit:50,list_only:input.list_only===true,all_details:legacyFull};
 const result=await rpc(db,'academy_guardian_portal_read',{p_actor_id:actor,p_payload:payload});
 if(result.actor_id!==actor||!Array.isArray(result.children)||!Array.isArray(result.guardians)||!Array.isArray(result.preferences)||!Array.isArray(result.notifications)||typeof result.has_more!=='boolean')throw incomplete();
 const children=result.children.map(child),selected=result.selected_child==null?null:child(result.selected_child);
 if(input.relationship_id&&selected?.relationship_id!==input.relationship_id)throw incomplete();
 const guardians=result.guardians.map(publicRecord),preferences=result.preferences.map(publicRecord),notifications=result.notifications.map(publicRecord);
 for(const g of guardians)if(!isId(g.id)||!isId(g.academy_id)||Object.hasOwn(g,'notes'))throw incomplete();
 for(const c of [...children,...(selected?[selected]:[])])if(!guardians.some(g=>g.id===c.guardian_id&&g.academy_id===c.academy_id))throw incomplete();
 for(const p of preferences)if(!guardians.some(g=>g.id===p.guardian_id&&g.academy_id===p.academy_id))throw incomplete();
 for(const n of notifications)if(![...children,...(selected?[selected]:[])].some(c=>c.relationship_id===n.relationship_id&&c.academy_id===n.academy_id&&c.guardian_id===n.guardian_id))throw incomplete();
 if(result.has_more&&(!object(result.cursor)||!isId(result.cursor.after_id)))throw incomplete();
 return {actor_id:actor,guardians,children,selected_child:selected,preferences,notifications,has_more:result.has_more,cursor:result.has_more?result.cursor:null};
}
export async function readGuardianRequests(db:Db,actor:string,relationship:unknown){
 if(!isId(actor)||!isId(relationship))throw new GuardianPortalError(400,'Choose a student from your parent portal.');
 const result=await rpc(db,'academy_guardian_portal_requests',{p_actor_id:actor,p_relationship_id:relationship});
 if(result.actor_id!==actor||result.relationship_id!==relationship||!Array.isArray(result.requests)||!Array.isArray(result.events)||typeof result.history_has_more!=='boolean')throw incomplete();
 const requests=result.requests.map(publicRecord),events=result.events.map(publicRecord);
 for(const r of requests)if(r.requester_user_id!==actor||r.requester_kind!=='guardian'||!isId(r.id))throw incomplete();
 for(const e of events)if(!requests.some(r=>r.id===e.request_id))throw incomplete();
 return {actor_id:actor,relationship_id:relationship,requests,events,guardians:[],history_has_more:result.history_has_more};
}

// One-deploy compatibility for older pages: all returned records still pass
// the same per-child commands; the old route cannot bypass expiry or flags.
export async function readLegacyGuardianPortal(db:Db,actor:string){
 const first=await readGuardianPortal(db,actor,{},true);let page=first;const seen=new Set<string>();
 while(page.has_more){
  const cursor=page.cursor as {after_id:string};if(seen.has(cursor.after_id))throw incomplete();seen.add(cursor.after_id);
  page=await readGuardianPortal(db,actor,{after_id:cursor.after_id},true);
  first.children.push(...page.children);first.guardians.push(...page.guardians);first.preferences.push(...page.preferences);first.notifications.push(...page.notifications);
 }
 first.has_more=false;first.cursor=null;
 first.guardians=[...new Map(first.guardians.map(row=>[String(row.id),row])).values()];
 first.preferences=[...new Map(first.preferences.map(row=>[String(row.id),row])).values()];
 return first;
}
export async function readLegacyGuardianRequests(db:Db,actor:string,academy?:string){
 if(academy&&!isId(academy))throw new GuardianPortalError(400,'Choose a student from your parent portal.');
 let page=await readGuardianPortal(db,actor,{list_only:true});const requests:Record<string,unknown>[]=[],events:Record<string,unknown>[]=[],guardians:Record<string,unknown>[]=[];const seen=new Set<string>();
 while(true){
  for(const c of page.children){if(academy&&c.academy_id!==academy)continue;const result=await readGuardianRequests(db,actor,c.relationship_id);requests.push(...result.requests);events.push(...result.events);}
  guardians.push(...page.guardians.filter(g=>!academy||g.academy_id===academy));
  if(!page.has_more)break;const cursor=page.cursor as {after_id:string};if(seen.has(cursor.after_id))throw incomplete();seen.add(cursor.after_id);
  page=await readGuardianPortal(db,actor,{list_only:true,after_id:cursor.after_id});
 }
 return {actor_id:actor,requests,events,guardians:[...new Map(guardians.map(row=>[String(row.id),row])).values()]};
}
