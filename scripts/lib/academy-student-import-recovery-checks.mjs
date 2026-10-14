import assert from 'node:assert/strict';
import {bindSql} from './academy-session-test-db.mjs';
export async function qualifyStudentImportRecovery({db,native,academy,branch,actor,reviewer,other,stage,preview,commit,student}){
 let checks=0,ordinal=0;
 const eq=(x,y)=>{assert.deepEqual(x,y);checks++;};
 const reject=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
 const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const fresh=async()=>{
  ordinal++;
  const job=await preview(await stage([student({phone:String(950000000+ordinal),parent_phone:String(960000000+ordinal),group_name:'Recovery group '+ordinal})],{create_missing_groups:true}),true);
  const result=await commit(job,{groups:true});return result.job;
 };
 const sql='select academy_recover_student_import($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid[],$7::boolean,$8::boolean) as data';
 const args=(job,patch={})=>[academy,patch.actor??actor,job.id,patch.key??'recover-'+job.id,patch.reason??'Owned import correction',patch.scope??[branch],patch.reviewAll??false,patch.finance??true];
 const recover=async(job,patch={})=>(await query(sql,args(job,patch)))[0].data;
 const effects=async(job)=>(await query('select target_table,target_id from academy_student_import_effects where academy_id=$1 and job_id=$2',[academy,job.id]));
 const targets=async(job)=>Object.fromEntries((await effects(job)).map(item=>[item.target_table,item.target_id]));
 await db.exec(`alter table academy_student_lifecycle_events add foreign key(academy_id,contact_id) references academy_contacts(academy_id,id);
  alter table academy_student_lifecycle_events add foreign key(academy_id,classroom_id) references academy_classrooms(academy_id,id);
  alter table academy_student_lifecycle_events add foreign key(academy_id,guardian_relationship_id) references academy_student_guardian_relationships(academy_id,id);
  create table academy_recovery_future_usage(id uuid primary key default gen_random_uuid(),academy_id uuid not null,student_ref uuid not null,evidence text,
   foreign key(academy_id,student_ref) references academy_contacts(academy_id,id));
  create index on academy_recovery_future_usage(academy_id,student_ref);`);
 let job=await fresh(),ids=await targets(job);
 const before=(await query('select count(*)::int n from domain_event_outbox'))[0].n;
 await reject(()=>recover(job,{finance:false}),/finance approval/);
 await reject(()=>recover(job,{actor:reviewer}),/Forbidden import job/);
 await reject(()=>recover(job,{scope:[other]}),/Forbidden import job/);
 const clean=await recover(job);eq(clean.job.status,'reversed');eq(clean.receipt.reversal_entries,1);eq(clean.receipt.manual_review_effects,0);eq(clean.receipt.corrected_effects,6);eq(clean.receipt.records_deleted,0);
 eq((await query('select status from academy_contacts where id=$1',[ids.academy_contacts]))[0].status,'inactive');
 eq((await query('select status from academy_classroom_memberships where id=$1',[ids.academy_classroom_memberships]))[0].status,'withdrawn');
 eq((await query('select status,consent_status from academy_student_guardian_relationships where id=$1',[ids.academy_student_guardian_relationships]))[0],{status:'revoked',consent_status:'revoked'});
 eq((await query('select status from academy_guardians where id=$1',[ids.academy_guardians]))[0].status,'revoked');
 eq((await query('select is_active from academy_classrooms where id=$1',[ids.academy_classrooms]))[0].is_active,false);
 eq((await query('select sum(amount)::text balance from academy_account_ledger_entries where contact_id=$1',[ids.academy_contacts]))[0].balance,'0');
 eq((await query('select count(*)::int n from domain_event_outbox'))[0].n,before);
 const correctedEvent=(await query("select actor_user_id,evidence from academy_student_lifecycle_events where source_id=$1 and event_key='import.enrollment_recovered'",[ids.academy_classroom_memberships]))[0];
 eq(correctedEvent.actor_user_id,actor);eq(correctedEvent.evidence.operation,'recovery');
 eq((await recover(job)).receipt,clean.receipt);eq((await recover(job)).replayed,true);
 await reject(()=>recover(job,{key:'another-recovery'}),/already exists/);
 await reject(()=>recover(job,{reason:'Different reason'}),/already exists/);
 await reject(()=>query("update academy_student_import_recovery_effects set outcome='missing'"),/append-only/);
 await reject(()=>query("update academy_student_import_recovery_runs set receipt='{}'"),/immutable/);
 console.log('PASS: clean logical recovery, retained records/history and exact receipt replay');
 // A real later payment survives; correcting the imported opening credit
 // preserves its remaining prepaid credit and keeps the used student active.
 job=await fresh();ids=await targets(job);
 await query("insert into academy_account_ledger_entries(academy_id,contact_id,entry_type,amount,currency,idempotency_key,metadata) values($1,$2,'payment_received',-200000,'UZS',$3,'{}')",[academy,ids.academy_contacts,'later-payment-'+job.id]);
 const paid=await recover(job);eq(paid.job.status,'recovery_review');eq(paid.receipt.reversal_entries,1);
 eq((await query('select sum(amount)::text balance from academy_account_ledger_entries where contact_id=$1',[ids.academy_contacts]))[0].balance,'-200000');
 eq((await query('select status from academy_contacts where id=$1',[ids.academy_contacts]))[0].status,'active');
 eq((await query('select status from academy_classroom_memberships where id=$1',[ids.academy_classroom_memberships]))[0].status,'active');
 eq((await query('select is_active from academy_classrooms where id=$1',[ids.academy_classrooms]))[0].is_active,true);
 eq((await query("select count(*)::int n from academy_account_ledger_entries where contact_id=$1 and entry_type='payment_received'",[ids.academy_contacts]))[0].n,1);
 // Importing a membership for an existing student does not make the student's
 // older payments the import's property. Keep the new group/membership active.
 const reusedPreview=await preview(await stage([student({phone:'901234567',parent_phone:null,balance:'0',group_name:'Reused student recovery group'})],{create_missing_groups:true,duplicate_strategy:'reuse'}),true);
 const reused=await commit(reusedPreview,{groups:true}),reusedIds=await targets(reused.job);
 const reusedResult=await recover(reused.job);eq(reusedResult.job.status,'recovery_review');
 eq((await query('select status from academy_classroom_memberships where id=$1',[reusedIds.academy_classroom_memberships]))[0].status,'active');
 eq((await query('select is_active from academy_classrooms where id=$1',[reusedIds.academy_classrooms]))[0].is_active,true);
 // A new referencing table unknown when import was written still blocks
 // deactivation. No hardcoded attendance/grade-table list is sufficient.
 job=await fresh();ids=await targets(job);
 await query("insert into academy_recovery_future_usage(academy_id,student_ref,evidence) values($1,$2,'Later customer activity')",[academy,ids.academy_contacts]);
 const used=await recover(job);eq(used.job.status,'recovery_review');eq((await query('select status from academy_contacts where id=$1',[ids.academy_contacts]))[0].status,'active');
 eq((await query('select count(*)::int n from academy_recovery_future_usage where student_ref=$1',[ids.academy_contacts]))[0].n,1);
 // Consent activated after import is never revoked by an unchanged file.
 job=await fresh();ids=await targets(job);
 await query("update academy_student_guardian_relationships set status='active',consent_status='granted' where id=$1",[ids.academy_student_guardian_relationships]);
 const consent=await recover(job);eq(consent.job.status,'recovery_review');eq((await query('select status,consent_status from academy_student_guardian_relationships where id=$1',[ids.academy_student_guardian_relationships]))[0],{status:'active',consent_status:'granted'});
 job=await fresh();ids=await targets(job);
 const approved=await recover(job,{actor:reviewer,reviewAll:true});eq(approved.receipt.actor_id,reviewer);
 eq((await query("select actor_user_id from academy_student_lifecycle_events where source_id=$1 and event_key='import.enrollment_recovered'",[ids.academy_classroom_memberships]))[0].actor_user_id,reviewer);
 // Failure at the final audit rolls back compensation, status changes and all
 // recovery evidence. A retry subsequently applies one correction.
 job=await fresh();ids=await targets(job);
 await db.exec("create function fail_recovery_audit() returns trigger language plpgsql as $$begin if new.action='student_import.recovered' then raise exception 'Injected recovery audit failure';end if;return new;end;$$;create trigger injected_recovery_failure before insert on academy_audit_events for each row execute function fail_recovery_audit();");
 await reject(()=>recover(job),/Injected recovery audit failure/);
 eq((await query('select count(*)::int n from academy_student_import_recovery_runs where job_id=$1',[job.id]))[0].n,0);
 eq((await query('select status from academy_student_import_jobs where id=$1',[job.id]))[0].status,'completed');
 eq((await query('select sum(amount)::text balance from academy_account_ledger_entries where contact_id=$1',[ids.academy_contacts]))[0].balance,'-800000');
 await db.exec('drop trigger injected_recovery_failure on academy_audit_events;');eq((await recover(job)).receipt.reversal_entries,1);
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role};`);try{await reject(()=>recover(job),/permission denied/);await reject(()=>query('select * from academy_student_import_recovery_effects'),/permission denied/);}finally{await db.exec('reset role;');}
 }
 if(native){
  job=await fresh();
  const parameters=args(job),held=await db.holdTransaction(bindSql(sql,parameters),'recovery-holder');
  const pending=db.independent(bindSql(sql,parameters),'recovery-contender');pending.catch(()=>{});
  try{await db.waitForLock('recovery-contender');checks++;await held.commit();assert.ok((await pending).includes('"replayed": true'));checks++;}
  catch(error){await held.rollback().catch(()=>{});await pending.catch(()=>{});throw error;}
  eq((await query('select count(*)::int n from academy_student_import_recovery_runs where job_id=$1',[job.id]))[0].n,1);
 }
 console.log(JSON.stringify({suite:'student-import-recovery',native,checks,productionTouched:false}));
 return {recover,args,checks};
}
