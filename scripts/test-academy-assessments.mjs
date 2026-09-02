import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

// Actual PostgreSQL/PLpgSQL execution, in memory only. Fixtures provide the
// existing Academy FK surface; this is not a full Supabase integration test.
const db = new PGlite();
let checks = 0;
const check = (actual, expected) => {
  assert.deepEqual(actual, expected);
  checks++;
};
const reject = async (fn, message) => {
  await assert.rejects(fn, message);
  checks++;
};
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const academy = id(1),
  other = id(2),
  actor = id(3),
  contact = id(4),
  outsider = id(5),
  paper = id(6),
  run = id(7),
  lead = id(8);
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.tenants(id uuid primary key);
    create table public.users(id uuid primary key);
    create table public.academy_classrooms(id uuid primary key,academy_id uuid,unique(academy_id,id));
    create table public.academy_contacts(id uuid primary key default gen_random_uuid(),academy_id uuid,first_name text,last_name text,email text,phone text,status text,metadata jsonb,created_by uuid,primary_branch_id uuid,unique(academy_id,id));
    create unique index contacts_email on academy_contacts(academy_id,lower(email)) where email is not null;
    create unique index contacts_phone on academy_contacts(academy_id,phone) where phone is not null;
    create table public.academy_leads(id uuid primary key,academy_id uuid,full_name text,email text,phone text,status text,preferred_branch_id uuid,branch_id uuid,unique(academy_id,id));
  `);
  await db.exec(
    readFileSync(
      new URL(
        '../supabase/migrations/20260902100000_academy_assessment_services.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await query('insert into tenants values ($1),($2)', [academy, other]);
  await query('insert into users values ($1)', [actor]);
  await query(
    "insert into academy_contacts(id,academy_id,first_name,email) values ($1,$2,'Learner','learner@example.test'),($3,$4,'Other','other@example.test')",
    [contact, academy, outsider, other],
  );
  const items = [{
    id: 'g',
    kind: 'choice',
    skill: 'grammar',
    correct: 1,
    points: 2,
    options: ['a', 'b'],
    prompt: 'Choose',
  }, { id: 'w', kind: 'written', skill: 'writing', points: 8, prompt: 'Write' }];
  await query(
    'insert into academy_assessment_papers(id,academy_id,title,duration_minutes,items,created_by) values ($1,$2,$3,5,$4,$5)',
    [paper, academy, 'Paper', JSON.stringify(items), actor],
  );
  await reject(
    () => query("update academy_assessment_papers set title='Changed' where id=$1", [paper]),
    /cannot be changed/,
  );
  await query(
    "insert into academy_assessment_runs(id,academy_id,paper_id,title,kind,starts_at,ends_at,capacity,created_by) values ($1,$2,$3,'Intake','placement',now()-interval '1 minute',now()+interval '1 hour',2,$4)",
    [run, academy, paper, actor],
  );
  const register = async (ids) =>
    query('select academy_register_assessment_candidates($1,$2,$3::uuid[]) as added', [
      academy,
      run,
      ids,
    ]);
  check((await register([contact]))[0].added, 1);
  check((await register([contact]))[0].added, 0);
  await reject(() => register([outsider]), /not found/);
  const candidate =
    (await query('select id from academy_assessment_candidates where contact_id=$1', [contact]))[0]
      .id;
  const command = async (action, payload = {}) =>
    (await query('select academy_assessment_candidate_command($1,$2,$3,$4,$5) as result', [
      academy,
      candidate,
      action,
      actor,
      JSON.stringify(payload),
    ]))[0].result;
  await reject(() => command('start'), /not open/);
  await query("update academy_assessment_runs set status='open' where id=$1", [run]);
  const started = await command('start');
  check(started.status, 'in_progress');
  check((await command('start')).expires_at, started.expires_at);
  await reject(() => command('collect'), /Wait until/);
  await command('save', { answers: { g: 1, w: 'My writing' } });
  await reject(() => command('save', { answers: { unknown: 1 } }), /Unknown question/);
  await query(
    "update academy_assessment_candidates set expires_at=now()-interval '1 second' where id=$1",
    [candidate],
  );
  await reject(() => command('save', { answers: { g: 0 } }), /Time has ended/);
  const submitted = await command('submit', { answers: { g: 0, w: 'Late replacement' } });
  check(submitted.answers, { g: 1, w: 'My writing' });
  check(submitted.marks, { g: 2 });
  check((await command('submit', { answers: { g: 0 } })).marks, { g: 2 });
  await reject(() => command('release'), /teacher must approve/);
  await reject(
    () =>
      command('review', {
        review_notes: 'Detailed interview observations',
        report: { basis: 'Writing checked; oral language not yet assessed.' },
        marks: {},
      }),
    /valid mark/,
  );
  const reviewed = await command('review', {
    review_notes: 'Detailed writing observations',
    report: { basis: 'Writing checked; oral language not assessed.', level: 'B1' },
    marks: { g: 0, w: 6 },
  });
  check(reviewed.marks, { g: 2, w: 6 });
  check(reviewed.status, 'reviewed');
  check((await command('release')).status, 'released');
  await reject(() => command('review', { marks: { w: 8 } }), /unreleased/);
  await query(
    "insert into academy_leads(id,academy_id,full_name,email,status) values($1,$2,'New Learner','new@example.test','open')",
    [lead, academy],
  );
  const intake = async () =>
    query('select academy_register_assessment_lead($1,$2,$3,$4) as contact', [
      academy,
      run,
      lead,
      actor,
    ]);
  const intakeContact = (await intake())[0].contact;
  check((await intake())[0].contact, intakeContact);
  check((await query('select status from academy_leads where id=$1', [lead]))[0].status, 'open');
  check(
    (await query('select status from academy_contacts where id=$1', [intakeContact]))[0].status,
    'trial',
  );
  check(
    (await query('select count(*)::int as n from academy_assessment_candidates where run_id=$1', [
      run,
    ]))[0].n,
    2,
  );
  const third = id(9);
  await query(
    "insert into academy_contacts(id,academy_id,email) values($1,$2,'third@example.test')",
    [third, academy],
  );
  await reject(() => register([third]), /remaining seats/);
  const secondCandidate = (await query(
    'select id from academy_assessment_candidates where contact_id=$1',
    [intakeContact],
  ))[0].id;
  const secondCommand = async (action, payload = {}) =>
    (await query(
      'select academy_assessment_candidate_command($1,$2,$3,$4,$5) as result',
      [academy, secondCandidate, action, actor, JSON.stringify(payload)],
    ))[0].result;
  await secondCommand('start');
  await secondCommand('save', { answers: { g: 1, w: 'Saved before closure' } });
  await query("update academy_assessment_runs set status='closed' where id=$1", [run]);
  const collected = await secondCommand('collect');
  check(collected.status, 'submitted');
  check(collected.answers.w, 'Saved before closure');
  check(collected.marks, { g: 2 });
  await reject(() => register([third]), /Registration is closed/);
  // RLS + grants fail closed even for a logged-in browser.
  const grants = await query(
    "select has_table_privilege('authenticated','academy_assessment_candidates','select') as can_read,has_function_privilege('authenticated','academy_assessment_candidate_command(uuid,uuid,text,uuid,jsonb)','execute') as can_execute",
  );
  check(grants[0], { can_read: false, can_execute: false });
  await db.exec('set role authenticated');
  await reject(() => query('select * from academy_assessment_candidates'), /permission denied/);
  await db.exec('reset role');
  const crossRun = id(10);
  await reject(
    () =>
      query(
        "insert into academy_assessment_runs(id,academy_id,paper_id,title,kind,starts_at,ends_at,capacity,created_by) values($1,$2,$3,'Cross','exam',now(),now()+interval '1 hour',2,$4)",
        [crossRun, other, paper, actor],
      ),
    /foreign key/,
  );
  // The operational extension executes against PostgreSQL as well, including real
  // constraints, transaction rollback, moderation gates and ledger idempotency.
  await db.exec(`
    create table academy_branches(id uuid primary key,academy_id uuid,unique(academy_id,id));
    create table academy_subscriptions(id uuid primary key,academy_id uuid,contact_id uuid,status text,starts_on date,ends_on date,unique(academy_id,contact_id,id));
    create table academy_charges(id uuid primary key default gen_random_uuid(),academy_id uuid,contact_id uuid,charge_number text,charge_type text,due_on date,original_amount bigint,discount_amount bigint,net_amount bigint,currency text,description text,idempotency_key text,created_by uuid,metadata jsonb,status text default 'open',unique(academy_id,contact_id,id),unique(academy_id,idempotency_key));
    create table academy_account_ledger_entries(id uuid primary key default gen_random_uuid(),academy_id uuid,contact_id uuid,charge_id uuid,entry_type text,amount bigint,currency text,reason text,idempotency_key text,created_by uuid,unique(academy_id,idempotency_key));
  `);
  await db.exec(readFileSync(new URL('../supabase/migrations/20260902120000_academy_assessment_operations.sql',import.meta.url),'utf8'));
  const moderator=id(20), exam=id(21);
  await query('insert into users values ($1)',[moderator]);
  await query("insert into academy_assessment_runs(id,academy_id,paper_id,title,kind,starts_at,ends_at,capacity,created_by,require_check_in,require_moderation) values($1,$2,$3,'Exam day','exam',now()-interval '1 minute',now()+interval '2 hours',10,$4,true,true)",[exam,academy,paper,actor]);
  await reject(()=>query("update academy_assessment_runs set status='open' where id=$1",[exam]),/review this paper/);
  await query("insert into academy_assessment_paper_reviews(academy_id,paper_id,decision,evidence,reviewed_by) values($1,$2,'pilot_ready','All answers and marking guidance reviewed for supervised pilot use; no CEFR claim.',$3)",[academy,paper,actor]);
  await query("update academy_assessment_runs set status='open' where id=$1",[exam]);
  await query('select academy_register_assessment_candidates($1,$2,$3::uuid[])',[academy,exam,[contact,third]]);
  const examCandidate=(await query('select id from academy_assessment_candidates where run_id=$1 and contact_id=$2',[exam,contact]))[0].id;
  const spare=(await query('select id from academy_assessment_candidates where run_id=$1 and contact_id=$2',[exam,third]))[0].id;
  const examCmd=async(action,payload={},user=actor,candidateId=examCandidate)=>(await query('select academy_assessment_candidate_command($1,$2,$3,$4,$5) as result',[academy,candidateId,action,user,JSON.stringify(payload)]))[0].result;
  const opsCmd=async(action,payload={},user=actor,candidateId=examCandidate)=>(await query('select academy_assessment_ops_command($1,$2,$3,$4,$5) as result',[academy,candidateId,action,user,JSON.stringify(payload)]))[0].result;
  await reject(()=>examCmd('start'),/check in/);
  await reject(()=>opsCmd('check_in',{seat:'A1',extra_minutes:10}),/accommodation/);
  await opsCmd('check_in',{seat:'A1',extra_minutes:10,note:'Additional reading time agreed with the learner.'});
  await reject(()=>opsCmd('check_in',{seat:'a1',extra_minutes:0},actor,spare),/unique constraint/);
  const examStarted=await examCmd('start');
  check(Math.round((Date.parse(examStarted.expires_at)-Date.parse(examStarted.started_at))/60000),15);
  check((await examCmd('start')).expires_at,examStarted.expires_at);
  await reject(()=>opsCmd('check_in',{seat:'A2',extra_minutes:20,note:'Cannot extend after start.'}),/before the student starts/);
  await examCmd('submit',{answers:{g:1,w:'My response for exam review.'}});
  await opsCmd('assign_grader',{grader_id:actor,grading_due_at:new Date(Date.now()+86400000).toISOString()});
  const reviewPayload={marks:{w:6},review_notes:'Detailed writing evidence checked.',report:{basis:'Writing and grammar reviewed; no global level inferred.'}};
  await reject(()=>examCmd('review',reviewPayload,moderator),/assigned to another teacher/);
  await examCmd('review',reviewPayload);
  await reject(()=>examCmd('release'),/second teacher/);
  await reject(()=>opsCmd('moderate',{note:'Checked all responses and the report.'}),/different teacher/);
  await opsCmd('moderate',{note:'Independent check of responses, marks and limitations.'},moderator);
  await examCmd('review',reviewPayload);
  await reject(()=>examCmd('release'),/second teacher/);
  await opsCmd('moderate',{note:'Independent check after the latest grading change.'},moderator);
  const concern=await opsCmd('incident',{kind:'integrity',note:'Observed possible outside help; needs investigation.'});
  await reject(()=>examCmd('release'),/open review/);
  await opsCmd('resolve_incident',{incident_id:concern.id,note:'Reviewed the observation; no outside assistance was found.'},moderator);
  check((await examCmd('release')).status,'released');
  const certificate=await opsCmd('certificate',{snapshot:{name:'Learner',classification:'Schood mock assessment'}});
  check(certificate.public_consent,false);
  check((await opsCmd('certificate',{snapshot:{name:'Replacement'}})).id,certificate.id);
  await opsCmd('certificate_consent',{consent:true});
  check((await query('select public_consent from academy_assessment_certificates where id=$1',[certificate.id]))[0].public_consent,true);
  await opsCmd('incident',{kind:'appeal',note:'Please review the writing mark against the rubric.'});
  check(Boolean((await query('select revoked_at from academy_assessment_certificates where id=$1',[certificate.id]))[0].revoked_at),true);
  await opsCmd('reopen',{note:'Reopen the published report to check the writing evidence.'});
  check((await query('select report_version,status from academy_assessment_candidates where id=$1',[examCandidate]))[0],{report_version:2,status:'submitted'});
  check((await query('select version from academy_assessment_report_history where candidate_id=$1',[examCandidate]))[0].version,1);
  const pack=id(22), subscription=id(23);
  await query("insert into academy_assessment_packages(id,academy_id,name,assessments,price,valid_days,created_by) values($1,$2,'Two assessments',2,150000,30,$3)",[pack,academy,actor]);
  const grant=async(key,contactId=contact,subscriptionId=null)=>(await query('select academy_assessment_grant_package($1,$2,$3,$4,$5,$6) as result',[academy,contactId,pack,subscriptionId,actor,key]))[0].result;
  const allowance=await grant('package-request-1');
  check((await grant('package-request-1')).id,allowance.id);
  check((await query('select count(*)::int as n from academy_charges'))[0].n,1);
  check((await query('select sum(amount)::int as amount from academy_account_ledger_entries'))[0].amount,150000);
  await reject(()=>grant('package-request-1',third),/different package grant/);
  const use=async(candidateId=examCandidate,allowanceId=allowance.id)=>query('select academy_assessment_use_allowance($1,$2,$3)',[academy,candidateId,allowanceId]);
  await use();await use();
  check((await query('select used from academy_assessment_allowances where id=$1',[allowance.id]))[0].used,1);
  await reject(()=>use(spare),/for this learner/);
  await query("insert into academy_subscriptions values($1,$2,$3,'active',current_date-1,current_date+30)",[subscription,academy,contact]);
  const included=await grant('package-included-1',contact,subscription);
  check(included.charge_id,null);
  check((await query('select count(*)::int as n from academy_charges'))[0].n,1);
  await query("update academy_subscriptions set status='cancelled' where id=$1",[subscription]);
  await reject(()=>grant('package-included-2',contact,subscription),/current active subscription/);
  await query("update academy_assessment_allowances set expires_at=now()-interval '1 day' where id=$1",[included.id]);
  await reject(()=>use(candidate,included.id),/unexpired/);
  const transactionCount=(await query('select count(*)::int as n from academy_assessment_allowances'))[0].n;
  await reject(()=>grant('package-cross-tenant',outsider),/Student not found/);
  check((await query('select count(*)::int as n from academy_assessment_allowances'))[0].n,transactionCount);
  for (const table of ['academy_assessment_certificates','academy_assessment_incidents','academy_assessment_allowances','academy_assessment_report_history']) {
    check((await query("select has_table_privilege('authenticated',$1,'select') as allowed",[table]))[0].allowed,false);
  }
  console.log(
    `Academy assessment SQL: ${checks} assertions passed (in-memory PostgreSQL; no hosted writes).`,
  );
} finally {
  await db.close();
}
