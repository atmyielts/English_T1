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
  console.log(
    `Academy assessment SQL: ${checks} assertions passed (in-memory PostgreSQL; no hosted writes).`,
  );
} finally {
  await db.close();
}
