// Native PostgreSQL permission tests. Disposable isolated container, no production credentials.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const name = 'schood-score-cache-' + randomUUID().slice(0, 8);
const image = 'postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa';
const migration = readFileSync('supabase/migrations/20261008183000_score_prediction_cache_privacy.sql', 'utf8');
const schema = readFileSync('supabase/migrations/20260608130000_monetization_features.sql', 'utf8');
const checks = []; let created = false;
function run(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    const timeout = setTimeout(() => { child.kill(); reject(Error('Local Docker operation timed out')); }, 30000);
    child.on('error', e => { clearTimeout(timeout); reject(e); });
    child.on('close', code => { clearTimeout(timeout); code === 0 ? resolve(stdout.trim()) : reject(Error(stderr.trim() || 'Docker operation failed')); });
    child.stdin.end(input);
  });
}
const sql = statement => run(['exec','-i',name,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'], statement);
const pause = () => new Promise(resolve => setTimeout(resolve, 100));
const check = async (name, action) => { await action(); checks.push({name,passed:true}); console.log('PASS: ' + name); };
try {
  await run(['run','--detach','--name',name,'--network','none','--label','schood.qa=score-cache','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]); created = true;
  let ready = false;
  // The image briefly exposes an initialization server that stops again.
  // Require the final server as PID1 and a successful SQL query before testing.
  for (let n=0; n<120; n++) {
    try { if (await run(['exec',name,'cat','/proc/1/comm']) === 'postgres') { await sql('select 1'); ready = true; break; } }
    catch { /* Final socket may still be opening. */ }
    await pause();
  }
  assert.ok(ready,'Local PostgreSQL did not become ready');
  await sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create table users(id uuid primary key); create table products(id uuid primary key);
    insert into users values('11111111-1111-4111-8111-111111111111');`);
  await sql(schema.slice(schema.indexOf('create table if not exists public.score_predictions'), schema.indexOf('create table if not exists public.writing_tutor_sessions')));
  await sql(`grant all on score_predictions to anon,authenticated,service_role;
    grant select(predicted_band),update(predicted_band) on score_predictions to anon,authenticated;
    insert into score_predictions(user_id,exam_type,predicted_band) values('11111111-1111-4111-8111-111111111111','ielts',6);`);
  await check('legacy public policy exposes and mutates synthetic other-learner cache', async () => {
    assert.equal(await sql('set role anon; select predicted_band from score_predictions;'),'6');
    await sql('set role authenticated; update score_predictions set predicted_band=9;');
    assert.equal(await sql('select predicted_band from score_predictions;'),'9');
  });
  await check('busy-table migration fails within bounded lock deadline and rolls back', async () => {
    const blocker = sql('begin; lock score_predictions in access exclusive mode; select pg_sleep(4); rollback;');
    let held = false;
    for (let n=0;n<30;n++) { if (await sql("select count(*) from pg_locks where relation='score_predictions'::regclass and mode='AccessExclusiveLock' and granted;") === '1') { held = true; break; } await pause(); }
    assert.ok(held,'Independent lock was not acquired');
    await assert.rejects(sql(migration), /lock timeout/);
    await blocker;
    assert.equal(await sql('set role anon; select count(*) from score_predictions;'),'1');
  });
  await sql(migration);
  for (const role of ['anon','authenticated']) {
    for (const [operation,statement] of [
      ['select-all','select * from score_predictions;'],
      ['select-column','select predicted_band from score_predictions;'],
      ['insert',"insert into score_predictions(user_id,exam_type) values('11111111-1111-4111-8111-111111111111','sat');"],
      ['update-column','update score_predictions set predicted_band=8;'],
      ['delete','delete from score_predictions;'],
    ]) await check(role + ' cannot ' + operation, () => assert.rejects(sql('set role ' + role + '; ' + statement), /permission denied/));
  }
  await check('existing service-role reads and all cache writes remain compatible', async () => {
    assert.equal(await sql('set role service_role; select predicted_band from score_predictions;'),'9');
    await sql("set role service_role; update score_predictions set predicted_band=6; insert into score_predictions(user_id,exam_type) values('11111111-1111-4111-8111-111111111111','sat'); delete from score_predictions where exam_type='sat';");
    assert.equal(await sql('select count(*),min(predicted_band) from score_predictions;'),'1|6');
  });
  await check('migration is repeatable and retains existing private records', async () => {
    await sql(migration);
    assert.equal(await sql('select count(*),min(predicted_band) from score_predictions;'),'1|6');
    await assert.rejects(sql('set role anon; select predicted_band from score_predictions;'),/permission denied/);
  });
  const output = process.argv.find(v=>v.startsWith('--output='))?.slice(9);
  if (output) writeFileSync(output,JSON.stringify({checkedAt:new Date().toISOString(),productionContacted:false,nativePostgres:true,image,checks},null,2)+'\n');
} finally {
  if (created) { await run(['rm','--force',name]); console.log('Owned isolated PostgreSQL container removed.'); }
}
