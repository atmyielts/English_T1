type Row=Record<string,unknown>;
type Db={from:(table:string)=>{select:(columns:string)=>{eq:(column:string,value:unknown)=>{in:(column:string,values:string[])=>PromiseLike<{data:Row[]|null;error:unknown}>}}}};
type Target={table:string;column:string;ids:Set<string>};
const id=(value:unknown)=>typeof value==='string'?value.trim():'';
// These describe stored resources, not branch assertions supplied by the caller.
const direct:Record<string,[string,string]>={
 contact_id:['academy_contacts','primary_branch_id'],lead_id:['academy_leads','branch_id'],
 classroom_id:['academy_classrooms','branch_id'],subscription_id:['academy_subscriptions','branch_id'],
 charge_id:['academy_charges','branch_id'],trial_id:['academy_trial_lessons','branch_id'],
 session_id:['academy_lesson_sessions','branch_id'],original_session_id:['academy_lesson_sessions','branch_id'],
 make_up_session_id:['academy_lesson_sessions','branch_id'],cashbox_id:['academy_cashboxes','branch_id'],
 expense_id:['academy_expenses','branch_id'],debt_case_id:['academy_debt_cases','branch_id'],
 execution_id:['academy_automation_executions','branch_id'],rule_version_id:['academy_automation_rule_versions','branch_id'],
 action_id:['academy_action_items','branch_id'],action_item_id:['academy_action_items','branch_id'],
 term_id:['academy_timetable_terms','branch_id'],series_id:['academy_timetable_series','branch_id'],
 room_id:['academy_rooms','branch_id'],branch_id:['academy_branches','id'],primary_branch_id:['academy_branches','id'],
};
const via:Record<string,[string,string,string]>={
 payment_id:['academy_payments','contact_id','contact_id'],shift_id:['academy_cashier_shifts','cashbox_id','cashbox_id'],
 relationship_id:['academy_student_guardian_relationships','contact_id','contact_id'],
 guardian_relationship_id:['academy_student_guardian_relationships','contact_id','contact_id'],
 conversation_id:['academy_conversations','contact_id','contact_id'],
 source_schedule_id:['academy_classroom_schedules','classroom_id','classroom_id'],
 schedule_id:['academy_classroom_schedules','classroom_id','classroom_id'],
 assignment_id:['academy_assignments','classroom_id','classroom_id'],
 submission_id:['academy_submissions','classroom_id','classroom_id'],
};
const actionTargets:Record<string,[string,string,string[]]>={
 upsert_contact:['academy_contacts','primary_branch_id',['id']],
 upsert_timetable_term:['academy_timetable_terms','branch_id',['id','term_id']],
 upsert_timetable_series:['academy_timetable_series','branch_id',['id','series_id']],
 update_service_request:['academy_service_requests','branch_id',['id','request_id']],
 update_workforce_request:['academy_staff_requests','branch_id',['id','request_id']],
 create_sensitive_case:['academy_sensitive_cases','branch_id',['id','case_id']],
 update_sensitive_case:['academy_sensitive_cases','branch_id',['id','case_id']],
 upsert_collection_case:['academy_collection_cases','branch_id',['id','case_id']],
 record_collection_attempt:['academy_collection_cases','branch_id',['case_id']],
 update_intervention:['academy_intervention_cases','contact_id',['id','intervention_id']],
 record_intervention_activity:['academy_intervention_cases','contact_id',['case_id','intervention_id']],
 upsert_renewal_opportunity:['academy_renewal_opportunities','contact_id',['id','opportunity_id']],
 record_renewal_activity:['academy_renewal_opportunities','contact_id',['opportunity_id']],
 update_operational_action:['academy_action_items','branch_id',['id','action_id','action_item_id']],
 resolve_action_item:['academy_action_items','branch_id',['id','action_id','action_item_id']],
 resolve_alert:['academy_alerts','contact_id',['id','alert_id']],
 mark_payment_paid:['academy_payments','contact_id',['id','payment_id']],
 delete_schedule:['academy_classroom_schedules','classroom_id',['id','schedule_id']],
 upsert_schedule:['academy_classroom_schedules','classroom_id',['id','schedule_id']],
 update_assignment:['academy_assignments','classroom_id',['id','assignment_id']],
 grade_submission:['academy_submissions','classroom_id',['id','submission_id']],
};
const parentKey:Record<string,string>={contact_id:'contact_id',cashbox_id:'cashbox_id',classroom_id:'classroom_id'};

// A claimed allowed branch must never hide a forbidden stored target. Validate
// all resources (including old update targets and both sides of a payment),
// then their parents. Batch by table and require every ID to resolve in the
// chosen Academy. This check does not replace transactional DB authorization.
export async function validateAcademyMutationBranches(db:Db,academyId:string,branches:readonly string[]|null,body:Row,action:string):Promise<boolean>{
 if(branches===null)return true;
 const allowed=new Set(branches),targets=new Map<string,Target>();let evidence=false;
 const add=(table:string,column:string,value:unknown)=>{
  const valueId=id(value);if(!valueId)return;
  const key=table+':'+column;
  if(!targets.has(key))targets.set(key,{table,column,ids:new Set()});targets.get(key)!.ids.add(valueId);
 };
 const references=(row:Row)=>{
  for(const [key,[table,column]] of Object.entries(direct))add(table,column,row[key]);
  for(const [key,[table,column]] of Object.entries(via))add(table,column,row[key]);
 };
 references(body);
 const specific=actionTargets[action];
 if(specific)for(const key of specific[2])add(specific[0],specific[1],body[key]);
 // Attendance, bulk roster and enrollment inputs are validated record by record.
 for(const key of ['records','contacts']){
  const values=body[key];
  if(Array.isArray(values)){
   if(values.length>5000)return false;
   for(const value of values){if(!value||typeof value!=='object'||Array.isArray(value))return false;references(value as Row);}
  }
 }
 for(const [key,table,column] of [['contact_ids','academy_contacts','primary_branch_id'],['classroom_ids','academy_classrooms','branch_id']] as const){
  const values=body[key];if(Array.isArray(values)){if(values.length>5000)return false;for(const value of values){if(!id(value))return false;add(table,column,value);}}
 }
 const seen=new Set<string>();
 while(targets.size){
  const [key,target]=targets.entries().next().value!;targets.delete(key);
  const ids=[...target.ids].filter(value=>!seen.has(key+':'+value));if(!ids.length)continue;
  for(const value of ids)seen.add(key+':'+value);
  // PostgREST may impose a row cap; bounded pages prevent silently trusting a
  // partial result and avoid a query per student in bulk attendance.
  for(let offset=0;offset<ids.length;offset+=200){
   const batch=ids.slice(offset,offset+200);
   const {data,error}=await db.from(target.table).select('id,'+target.column).eq('academy_id',academyId).in('id',batch);
   if(error||!Array.isArray(data)||new Set(data.map(row=>id(row.id))).size!==batch.length)return false;
   for(const row of data){
    if(!batch.includes(id(row.id)))return false;
    if(target.column==='branch_id'||target.column==='primary_branch_id'||target.table==='academy_branches'){
     if(!allowed.has(id(row[target.column])))return false;evidence=true;
    }else{
     const key=parentKey[target.column],spec=key&&direct[key];
     if(!spec||!id(row[target.column]))return false;add(spec[0],spec[1],row[target.column]);
    }
   }
  }
 }
 return evidence||(action==='create_workforce_request'&&allowed.size>0);
}
