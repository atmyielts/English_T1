// SAT Practice engine v2 migration on isolated PostgreSQL (no production contact).
// CI: a disposable Docker container, like the other SAT database contracts.
// Local without Docker: SAT_PG_PSQL=/path/to/psql SAT_PG_PORT=55104 node scripts/test-sat-practice-engine-db.mjs
// (uses a throwaway database on a local trust-auth cluster and drops it afterwards).
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const emitWarning = process.emitWarning;
process.emitWarning = (w, ...rest) => String(w?.message ?? w).includes('Module type of file') ? undefined : emitWarning.call(process, w, ...rest);
const { toContentRows, OFFICIAL_DOMAINS } = await import('../supabase/functions/_shared/sat-practice-content.ts');

const image = 'postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa';
const localPsql = process.env.SAT_PG_PSQL, localPort = process.env.SAT_PG_PORT ?? '5432';
const container = `schood-sat-engine-${randomUUID().slice(0, 8)}`, database = `sat_engine_${randomUUID().slice(0, 8)}`;
let containerId, created = false;
const checks = [];
function run(cmd, args, input = '', timeout = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    const timer = setTimeout(() => { child.kill(); reject(Error('Local database operation timed out')); }, timeout);
    child.stdout.on('data', d => output += d); child.stderr.on('data', d => error += d);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(Error(error.trim() || `exit ${code}`)); });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
const psqlArgs = db => ['-h', '127.0.0.1', '-p', localPort, '-U', 'postgres', '-d', db, '-Atq', '-v', 'ON_ERROR_STOP=1'];
const sql = q => localPsql ? run(localPsql, psqlArgs(database), q) : run('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1'], q);
const actor = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222', admin = '33333333-3333-4333-8333-333333333333';
const product = '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010', legacy = '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef';
const quote = v => v == null ? 'null' : `'${String(v).replaceAll("'", "''")}'`;
const json = v => quote(JSON.stringify(v)) + '::jsonb';
const svc = q => sql('set role service_role;' + q);
const catalog = async (user = actor) => JSON.parse(await svc(`select coalesce(jsonb_agg(c),'[]') from select_sat_practice_catalog('${user}') c;`));
const start = async (filters, user = actor, id = randomUUID()) => JSON.parse(await svc(`select start_sat_practice_attempt('${user}','${id}',${json({ limit: filters.question_ids?.length ?? 1, ...filters })});`));
const complete = async (r, correct = () => true, user = actor) => {
  const answers = Object.fromEntries(r.questions.map(q => [q.id, q.correct.option_id ? { selected_option: q.correct.option_id } : { text: q.correct.accepted[0] }]));
  const items = r.questions.map(q => ({ question_id: q.id, correct: correct(q), answer: answers[q.id], expected: q.correct }));
  return JSON.parse(await svc(`select complete_sat_practice_attempt('${user}','${r.attempt.id}',${json(answers)},${json(r.questions)},${json(items)});`));
};
async function check(name, test) { await test(); checks.push(name); console.log('PASS: ' + name); }
const item = (slug, patch = {}) => ({
  slug, section: 'math', official_domain: 'algebra', skill: 'linear_functions', sat_domain: 'algebra', difficulty: 'medium', format: 'mcq',
  prompt: `Fixture ${slug}: what is $f(2)$ if $f(x)=3x+1$?`, options: ['A', 'B', 'C', 'D'].map((id, i) => ({ id, label: `$${5 + i}$` })), answer: 'C',
  explanation: 'Substitute 2 for x: 3(2)+1 = 7. Choice A forgets the constant, Choice B adds wrongly, Choice D doubles.', ...patch,
});
const importRows = (items, status = 'published') => svc(`select admin_upsert_sat_practice_items('${admin}',${json(items.map(i => ({ ...toContentRows(i, status), part_name: OFFICIAL_DOMAINS[i.official_domain].label })))},'${status}');`);

try {
  if (localPsql) {
    await run(localPsql, psqlArgs('postgres'), `create database ${database};`); created = true;
    await sql(`do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end $$;`);
  } else {
    containerId = await run('docker', ['run', '--detach', '--name', container, '--label', 'schood.qa=sat-engine', '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
    assert.match(containerId, /^[0-9a-f]{64}$/);
    let ready = false;
    for (let i = 0; i < 120; i++) {
      try { if (await run('docker', ['exec', container, 'cat', '/proc/1/comm']) === 'postgres') { await sql('select 1'); ready = true; break; } } catch { /* starting */ }
      await new Promise(done => setTimeout(done, 250));
    }
    assert.ok(ready, 'Final local PostgreSQL server did not become ready');
    await sql('create role anon;create role authenticated;create role service_role bypassrls;');
  }
  await sql(`grant usage on schema public to anon,authenticated,service_role;
    create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select coalesce(current_setting('request.jwt.claim.role',true),'')$$;
    create table users(id uuid primary key,role text default 'student');insert into users(id) values('${actor}'),('${other}'),('${admin}');
    create table products(id uuid primary key);insert into products values('${legacy}'),('${product}');`);
  const spine = readFileSync('supabase/migrations/20260202170000_platform_spine.sql', 'utf8');
  const ddl = name => { const a = spine.indexOf('create table if not exists public.' + name + ' ('); assert.ok(a >= 0); return spine.slice(a, spine.indexOf('\n);', a) + 4); };
  for (const name of ['experiences', 'sections', 'parts', 'content_units', 'sessions', 'responses']) await sql(ddl(name));
  const keys = readFileSync('supabase/migrations/20260207122000_answer_keys_and_evaluations.sql', 'utf8'); await sql(keys.slice(0, keys.indexOf('create table if not exists public.evaluations')));
  await sql('alter table sessions add column token_id uuid,add column registration_id uuid;');
  for (const name of ['20260217193000_sessions_integrity_guard.sql', '20260303234000_fix_sessions_integrity_guard_service_role.sql', '20260514121000_sat_practice_mistake_notebook.sql', '20260514122000_sat_practice_mastery_and_plan.sql', '20260514123000_sat_practice_lab_attempts_and_srs.sql', '20260514124000_sat_practice_activity_and_ai_questions.sql']) await sql(readFileSync('supabase/migrations/' + name, 'utf8'));
  await sql('grant all on all tables in schema public to service_role;grant select on all tables in schema public to anon,authenticated;alter default privileges in schema public grant all on tables to service_role;');
  for (const name of ['20261007100000_sat_attempt_atomic_completion.sql', '20261008100000_sat_bank_filtered_selection.sql', '20261008110000_sat_attempt_atomic_start.sql', '20261020183010_sat_original_foundations.sql']) await sql(readFileSync('supabase/migrations/' + name, 'utf8'));
  // An attempt started on the old engine must complete on the new one.
  const before = await start({ section_type: 'math', limit: 2 });
  const engine = readFileSync('supabase/migrations/20261026130000_sat_practice_engine_v2.sql', 'utf8');
  await sql(engine);
  await check('Migration is re-runnable', async () => { await sql(engine); });

  const all = await catalog();
  await check('Catalog lists every published question with taxonomy and no prompt or answer key', async () => {
    assert.equal(all.length, 27);
    assert.ok(all.every(q => !('correct' in q) && !('data' in q) && ['math', 'reading_writing'].includes(q.section_type) && q.seen === 0 && q.last_correct === null));
    assert.deepEqual(all.map(q => q.bank_order), all.map((_, i) => i + 1));
  });
  await check('Old-engine attempts still complete; real minutes, not a 5-minute floor', async () => {
    const r = await complete(before, q => q.id !== before.questions[0].id);
    assert.equal(r.timing.study_minutes, 0);
    assert.equal(await svc(`select minutes_studied from sat_practice_daily_activity where user_id='${actor}'`), '0');
  });
  await check('Elapsed time is counted from the server start and capped at 4 minutes per question', async () => {
    const ids = all.filter(q => q.section_type === 'reading_writing').slice(0, 2).map(q => q.id);
    const r = await start({ question_ids: ids });
    await svc(`update sat_practice_lab_attempts set started_at=now()-interval '6 minutes 40 seconds' where id='${r.attempt.id}'`);
    assert.equal((await complete(r)).timing.study_minutes, 7);
    const idle = await start({ question_ids: ids });
    await svc(`update sat_practice_lab_attempts set started_at=now()-interval '9 hours' where id='${idle.attempt.id}'`);
    const done = await complete(idle);
    assert.equal(done.timing.counted_seconds, 480); assert.equal(done.timing.study_minutes, 8);
    assert.equal(await svc(`select minutes_studied from sat_practice_daily_activity where user_id='${actor}'`), '15');
  });
  await check('Timed modules cap counted time at the limit plus two minutes', async () => {
    const ids = all.filter(q => q.section_type === 'math').slice(0, 10).map(q => q.id);
    const r = await start({ question_ids: ids, mode: 'module', module_section: 'math', time_limit_seconds: 300 });
    await svc(`update sat_practice_lab_attempts set started_at=now()-interval '1 hour' where id='${r.attempt.id}'`);
    assert.equal((await complete(r, () => false)).timing.counted_seconds, 420);
  });
  await check('Explicit question lists keep their requested order', async () => {
    const ids = [all[20].id, all[3].id, all[11].id];
    const r = await start({ question_ids: ids });
    assert.deepEqual(r.attempt.question_ids, ids);
    assert.deepEqual(r.questions.map(q => q.id), ids);
  });
  await check('Catalog history reports the learner’s own last result only', async () => {
    const mine = await catalog(), theirs = await catalog(other);
    const seen = mine.filter(q => q.seen > 0);
    assert.ok(seen.length >= 4);
    assert.ok(seen.some(q => q.last_correct === false) && seen.some(q => q.last_correct === true));
    assert.ok(seen.every(q => q.last_seen_at));
    assert.ok(theirs.every(q => q.seen === 0));
  });
  await check('Plan items move to in progress at start and complete with the drill', async () => {
    const plan = await svc(`insert into sat_practice_plan_items(user_id,scheduled_for,task_type,payload) values('${actor}',current_date,'module','{"section_type":"math"}') returning id`);
    const r = await start({ question_ids: [all[0].id], mode: 'plan', plan_item_id: plan });
    assert.equal(await svc(`select status||':'||(payload->>'attempt_id') from sat_practice_plan_items where id='${plan}'`), 'in_progress:' + r.attempt.id);
    await complete(r);
    const row = JSON.parse(await svc(`select to_jsonb(p) from sat_practice_plan_items p where id='${plan}'`));
    assert.equal(row.status, 'completed'); assert.equal(row.payload.score_raw, 1); assert.equal(row.payload.question_count, 1); assert.ok(row.completed_at);
    const foreign = await svc(`insert into sat_practice_plan_items(user_id,scheduled_for,task_type) values('${other}',current_date,'drill') returning id`);
    await assert.rejects(start({ question_ids: [all[0].id], plan_item_id: foreign }), /Plan item not found/);
  });
  await check('Unknown or malformed start metadata is rejected', async () => {
    for (const bad of [{ mode: 'exam' }, { module_section: 'science' }, { time_limit_seconds: 5 }, { time_limit_seconds: '60' }, { plan_item_id: 'x' }, { requested_count: 0 }, { skill: 'Robert; drop' }, { surprise: 1 }]) {
      await assert.rejects(start({ question_ids: [all[0].id], ...bad }), /Invalid drill/);
    }
  });
  await check('Admin import creates domain parts, inserts drafts invisible to learners, then publishes', async () => {
    const spr = item('alg-fixture-spr', { format: 'spr', answer: ['7', '7.0'], options: undefined, skill: 'linear_equations_one_variable',
      table: { headers: ['x', 'y'], rows: [['1', '4']] }, figure_svg: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>' });
    delete spr.options;
    const rw = { ...item('ii-fixture-1'), section: 'reading_writing', official_domain: 'information_and_ideas', skill: 'inferences', sat_domain: 'command_of_evidence', passage: 'A <u>short</u> fixture passage.' };
    const result = JSON.parse(await importRows([item('alg-fixture-1'), spr, rw], 'draft'));
    assert.deepEqual(result, { inserted: 3, updated: 0, status: 'draft' });
    assert.equal(await sql(`select display_order||':'||name from parts where id=md5('schood-sat-part:algebra')::uuid`), '10:Algebra');
    assert.equal(await sql(`select display_order from parts where id=md5('schood-sat-part:information_and_ideas')::uuid`), '10');
    assert.equal((await catalog()).length, 27);
    const draftId = await sql(`select md5('schood-sat-q:alg-fixture-spr')::uuid`);
    await assert.rejects(start({ question_ids: [draftId] }), /No matching practice questions/);
    assert.equal(await svc(`select admin_set_sat_practice_item_status('${admin}',array[md5('schood-sat-q:alg-fixture-1')::uuid,'${draftId}'::uuid],'published')`), '2');
    const now = await catalog();
    assert.equal(now.length, 29);
    const sprRow = now.find(q => q.id === draftId);
    assert.equal(sprRow.official_domain, 'algebra'); assert.equal(sprRow.skill, 'linear_equations_one_variable'); assert.equal(sprRow.answer_format, 'spr');
    assert.equal(sprRow.has_table, true); assert.equal(sprRow.has_figure, true); assert.equal(sprRow.type, 'question_spr');
    const r = await start({ question_ids: [draftId] });
    assert.deepEqual(r.questions[0].correct.accepted, ['7', '7.0']);
    assert.ok(r.questions[0].correct.feedback.explanation.includes('Substitute'));
    await complete(r);
  });
  await check('Re-import updates content and keys in place without duplicating or moving rows', async () => {
    const result = JSON.parse(await importRows([item('alg-fixture-1', { answer: 'D', prompt: 'Edited fixture: what is $f(2)$?' })]));
    assert.deepEqual(result, { inserted: 0, updated: 1, status: 'published' });
    assert.equal(await sql(`select correct->>'option_id' from answer_keys where content_unit_id=md5('schood-sat-q:alg-fixture-1')::uuid`), 'D');
    assert.equal(await sql(`select count(*) from content_units where metadata->>'original_slug' like '%fixture%'`), '3');
    const listed = JSON.parse(await svc(`select admin_list_sat_practice_items('published','algebra','fixture',10,0)`));
    assert.equal(listed.total, 2); assert.ok(listed.items.every(i => i.correct && i.explanation));
  });
  await check('Import refuses foreign content, bad rows and browser callers', async () => {
    await sql(`insert into experiences(id,product_id,name,metadata) values('${legacy}','${legacy}','Other','{}');insert into sections(id,experience_id,name,display_order) values('${legacy}','${legacy}','Other',1);insert into parts(id,section_id,name,display_order) values('${legacy}','${legacy}','Other',1);insert into content_units(id,part_id,type,data,display_order) values(md5('schood-sat-q:foreign-unit')::uuid,'${legacy}','question_single_choice','{}',1);`);
    await assert.rejects(importRows([item('foreign-unit')]), /belongs to other content/);
    await assert.rejects(svc(`select admin_upsert_sat_practice_items('${admin}','[{"slug":"Bad Slug"}]','published')`), /Invalid import item/);
    await assert.rejects(svc(`select admin_upsert_sat_practice_items('${admin}','[]','published')`), /Invalid import/);
    await assert.rejects(svc(`select admin_upsert_sat_practice_items('${admin}','[{}]','live')`), /Invalid import/);
    for (const role of ['anon', 'authenticated']) {
      for (const fn of [`admin_upsert_sat_practice_items('${admin}','[]','draft')`, `admin_set_sat_practice_item_status('${admin}',array['${actor}'::uuid],'draft')`, `admin_list_sat_practice_items(null,null,null,1,0)`, `select_sat_practice_catalog('${actor}')`]) {
        await assert.rejects(sql(`set role ${role};select ${fn};`), /permission denied/);
      }
    }
  });
  await check('Unpublishing a question removes it from new drills but keeps finished results', async () => {
    const id = await sql(`select md5('schood-sat-q:alg-fixture-1')::uuid`);
    const r = await start({ question_ids: [id] });
    assert.equal(await svc(`select admin_set_sat_practice_item_status('${admin}',array['${id}'::uuid],'draft')`), '1');
    await assert.rejects(start({ question_ids: [id] }), /No matching/);
    assert.equal((await complete(r)).attempt.score_raw, 1);
  });
  console.log(`${checks.length} SAT Practice engine database checks passed`);
} finally {
  if (localPsql && created) await run(localPsql, psqlArgs('postgres'), `drop database ${database} with (force);`).catch(() => {});
  if (containerId) await run('docker', ['rm', '--force', '--volumes', container]).catch(() => {});
}
