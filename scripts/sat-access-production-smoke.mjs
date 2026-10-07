import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Explicitly authorized QA-only production writes; never grant a customer access.
const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
if (!args.includes('--live')) throw Error('Explicit --live is required.');
const qaId = value('--qa-user-id');
if (!/^[0-9a-f-]{36}$/i.test(qaId ?? '')) throw Error('An existing tagged QA identity is required.');
const after = args.includes('--after');
const atomic = args.includes('--atomic');
if (atomic && !after) throw Error('Atomic smoke requires --after.');
const base = 'https://bbjawctnqrufvnesdsel.supabase.co';
const product = '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010';
const lookup = spawnSync('supabase', ['projects', 'api-keys', '--project-ref', 'bbjawctnqrufvnesdsel', '--output', 'json'], { encoding: 'utf8', windowsHide: true });
if (lookup.status !== 0) throw Error('Authenticated project-key lookup failed; no keys logged.');
const keys = JSON.parse(lookup.stdout);
const anon = keys.find((key) => key.name === 'anon')?.api_key;
const service = keys.find((key) => key.name === 'service_role')?.api_key;
if (!anon || !service) throw Error('Project-key lookup incomplete.');
const adminHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
const results = [];
let qaHeaders, grantId, tenantId;
let failure;
async function request(path, headers = adminHeaders, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}
function check(name, condition, details = {}) {
  results.push({ name, passed: Boolean(condition), ...details });
  console.log(JSON.stringify(results.at(-1)));
  if (!condition) throw Error(`QA check failed: ${name}`);
}
try {
  const user = await request(`/auth/v1/admin/users/${qaId}`);
  if (user.status !== 200 || user.data?.app_metadata?.qa_readiness_audit !== true || !user.data.email?.endsWith('@example.invalid')) throw Error('Refusing to sign in a non-QA identity.');
  const link = await request('/auth/v1/admin/generate_link', adminHeaders, 'POST', { type: 'magiclink', email: user.data.email });
  const tokenHash = link.data?.properties?.hashed_token ?? link.data?.hashed_token;
  if (link.status !== 200 || !tokenHash) throw Error('QA link creation failed.');
  const session = await request('/auth/v1/verify', { apikey: anon, 'Content-Type': 'application/json' }, 'POST', { type: 'magiclink', token_hash: tokenHash });
  if (session.status !== 200 || !session.data?.access_token) throw Error('QA verification failed.');
  qaHeaders = { apikey: anon, Authorization: `Bearer ${session.data.access_token}`, 'Content-Type': 'application/json' };
  const effective = await request('/functions/v1/access-effective', qaHeaders);
  check('QA initially has no SAT Practice access', effective.status === 200 && effective.data?.user?.id === qaId && Array.isArray(effective.data?.effective_product_ids) && !effective.data.effective_product_ids.includes(product));
  tenantId = effective.data.tenant_id;
  const bank = await request('/functions/v1/sat-practice/bank?limit=1', qaHeaders);
  check(after ? 'Unentitled QA bank is forbidden' : 'Baseline reproduces unentitled bank access', bank.status === (after ? 403 : 200), { status: bank.status, exposesCorrectKey: Boolean(bank.data?.questions?.some((q) => Object.hasOwn(q, 'correct'))) });
  if (after) {
    const deniedWrite = await request('/functions/v1/sat-practice/attempts/start', qaHeaders, 'POST', { question_count: 1 });
    check('Unentitled QA cannot create an attempt', deniedWrite.status === 403, { status: deniedWrite.status });
    if (!/^[0-9a-f-]{36}$/i.test(tenantId ?? '')) throw Error('QA personal tenant unavailable.');
    const tenant = await request(`/rest/v1/tenants?id=eq.${tenantId}&select=id,type,created_by`);
    const members = await request(`/rest/v1/tenant_memberships?tenant_id=eq.${tenantId}&select=user_id,role,status`);
    const existing = await request(`/rest/v1/entitlements?tenant_id=eq.${tenantId}&resource_type=eq.product&resource_id=eq.${product}&select=id`);
    if (tenant.status !== 200 || tenant.data?.length !== 1 || tenant.data[0].type !== 'personal' || tenant.data[0].created_by !== qaId || members.status !== 200 || members.data?.length !== 1 || members.data[0].user_id !== qaId || members.data[0].role !== 'owner' || existing.status !== 200 || existing.data?.length !== 0) throw Error('Refusing to alter a non-exclusive QA tenant or existing entitlement.');
    grantId = randomUUID();
    const grant = await request('/rest/v1/entitlements', { ...adminHeaders, Prefer: 'return=representation' }, 'POST', { id: grantId, user_id: qaId, tenant_id: tenantId, resource_type: 'product', resource_id: product, source: 'qa_readiness_audit', is_active: true, starts_at: new Date(Date.now() - 5000).toISOString(), ends_at: new Date(Date.now() + 10 * 60_000).toISOString(), value: { qa_readiness_audit: true } });
    check('Temporary QA-only entitlement created', grant.status === 201 && grant.data?.[0]?.id === grantId, { status: grant.status, databaseErrorCode: grant.data?.code ?? null });
    const allowed = await request('/functions/v1/access-effective', qaHeaders);
    check('Canonical access recognizes the QA grant', allowed.status === 200 && allowed.data?.effective_product_ids?.includes(product));
    const paidBank = await request('/functions/v1/sat-practice/bank?limit=1', qaHeaders);
    check('Entitled QA can read usable questions without keys', paidBank.status === 200 && paidBank.data?.questions?.length === 1 && paidBank.data.questions.every((q) => q.id && q.data && !Object.hasOwn(q, 'correct')), { status: paidBank.status });
    const started = await request('/functions/v1/sat-practice/attempts/start', qaHeaders, 'POST', { question_count: 1, question_ids: [paidBank.data.questions[0].id] });
    check('QA attempt starts with withheld keys', started.status === 200 && started.data?.attempt?.user_id === qaId && started.data.attempt.status === 'in_progress' && started.data.questions?.length === 1 && !Object.hasOwn(started.data.questions[0], 'correct'), { status: started.status });
    const attemptId = started.data.attempt.id;
    const resumed = await request(`/functions/v1/sat-practice/attempts/${attemptId}`, qaHeaders);
    check('QA resumed attempt withholds keys', resumed.status === 200 && resumed.data?.questions?.length === 1 && !Object.hasOwn(resumed.data.questions[0], 'correct'));
    const submitted = await request('/functions/v1/sat-practice/attempts/submit', qaHeaders, 'POST', { attempt_id: attemptId, answers: {} });
    check('QA submission preserves scored feedback keys', submitted.status === 200 && submitted.data?.attempt?.status === 'scored' && submitted.data.questions?.length === 1 && Object.hasOwn(submitted.data.questions[0], 'correct'), { status: submitted.status });
    if (atomic) {
      const readEffects = async () => {
        const queries = ['sat_practice_lab_attempts','sat_practice_mastery','sat_practice_srs_queue','sat_practice_daily_activity','sat_practice_mistake_notebook','sat_practice_attempt_results'];
        const effects = {};
        for (const table of queries) {
          const rows = await request('/rest/v1/' + table + '?user_id=eq.' + qaId + '&select=*');
          if (rows.status !== 200 || !Array.isArray(rows.data)) throw Error('QA effect inspection failed: ' + table);
          effects[table] = rows.data.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        }
        const responses = await request('/rest/v1/responses?session_id=eq.' + submitted.data.attempt.session_id + '&select=*');
        if (responses.status !== 200 || !Array.isArray(responses.data)) throw Error('QA response inspection failed.');
        effects.responses = responses.data;
        return effects;
      };
      const beforeRetries = await readEffects();
      const retries = await Promise.all(Array.from({length: 3}, () => request('/functions/v1/sat-practice/attempts/submit', qaHeaders, 'POST', { attempt_id: attemptId, answers: {} })));
      for (const retry of retries) { check('Same-answer retry returns original QA receipt', retry.status === 200, {status:retry.status}); assert.deepEqual(retry.data, submitted.data); }
      const changed = await request('/functions/v1/sat-practice/attempts/submit', qaHeaders, 'POST', { attempt_id: attemptId, answers: { [paidBank.data.questions[0].id]: { text: 'qa-changed-after-completion' } } });
      check('Changed completed answers conflict', changed.status === 409, {status:changed.status});
      assert.deepEqual(await readEffects(), beforeRetries);
      check('QA retries and conflict leave all progress, receipts and responses unchanged', true);
      const privateRead = await request('/rest/v1/sat_practice_attempt_results?attempt_id=eq.' + attemptId + '&select=*', qaHeaders);
      check('Browser cannot directly read the private result table', privateRead.status === 401 || privateRead.status === 403, {status:privateRead.status});
      const forge = await request('/rest/v1/sat_practice_lab_attempts?id=eq.' + attemptId + '&user_id=eq.' + qaId, qaHeaders, 'PATCH', {score_raw:100});
      check('Browser cannot directly forge QA score', forge.status === 401 || forge.status === 403, {status:forge.status});
    }
    const scored = await request(`/functions/v1/sat-practice/attempts/${attemptId}`, qaHeaders);
    check('QA scored attempt remains reviewable', scored.status === 200 && scored.data?.attempt?.status === 'scored' && Object.hasOwn(scored.data.questions[0], 'correct'));
  }
} catch (error) { failure = error; }
finally {
  if (grantId && tenantId) {
    const removed = await request(`/rest/v1/entitlements?id=eq.${grantId}&tenant_id=eq.${tenantId}&user_id=eq.${qaId}&source=eq.qa_readiness_audit`, adminHeaders, 'DELETE');
    results.push({ name: 'Temporary QA-only entitlement removed', passed: removed.status === 204 });
    if (removed.status !== 204) failure ??= Error('QA entitlement cleanup failed; it expires automatically within ten minutes.');
    const checked = await request(`/rest/v1/entitlements?id=eq.${grantId}&tenant_id=eq.${tenantId}&select=id`);
    results.push({ name: 'QA-only entitlement cleanup confirmed', passed: checked.status === 200 && checked.data?.length === 0 });
    if (checked.status !== 200 || checked.data?.length !== 0) failure ??= Error('QA cleanup verification failed.');
  }
  if (qaHeaders) await request('/auth/v1/logout?scope=local', qaHeaders, 'POST').catch(() => {});
  const output = value('--output');
  if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify({ checkedAt: new Date().toISOString(), projectRef: 'bbjawctnqrufvnesdsel', phase: after ? 'after' : 'before', qaUserId: qaId, results, passed: !failure }, null, 2) + '\n'); }
}
if (failure) throw failure;
