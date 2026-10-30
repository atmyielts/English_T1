import { equal, ID, ok } from '../fixture.test.ts';
import { examByKey } from './content/certificates.ts';
import { registerSittingSource, resetSittingSource } from './seams.ts';
import { engageFixture } from './test-helpers.ts';

// Skill Certificates on Proctor Lite (E12) and the talent pool (E13).

const STREAM = '6f0e6c38-7b7e-4bd2-9f53-2f3d0a1c9b11';
const correct = (key: string) => Object.fromEntries(examByKey(key)!.items.map((item) => [item.id, item.answer]));
const REPLY = 'I understand, price matters. May I ask what a slow queue costs you at lunchtime? Many owners find that serving faster pays for the app in a week. Could we try it free for fourteen days in your café, and look at the numbers together on Friday at four? If it does not help, you pay nothing and I will remove it myself.';

Deno.test('E12: a sitting needs a purchase or beta access; consent first', async () => {
  const f = engageFixture();
  const list = (await f.get('certificates')).body;
  equal(list.exams.map((exam: { key: string }) => exam.key), ['speaking_b1', 'speaking_b2', 'sales_l1', 'sales_l2']);
  equal([list.available.sittings, list.available.for_sale], [0, false], 'no product until the pricing phase registers one');
  equal((await f.post('sitting-start', { exam: 'sales_l1', consent: false, display_name: 'Dilnoza Karimova' })).body.code, 'consent_required');
  const refused = await f.post('sitting-start', { exam: 'sales_l1', consent: true, display_name: 'Dilnoza Karimova' });
  equal([refused.status, refused.body.code, refused.body.product], [402, 'sitting_required', 'certificate_exam']);
});

Deno.test('E12: one purchased sitting is one sitting', async () => {
  resetSittingSource();
  registerSittingSource((_ctx, userId) => Promise.resolve(userId === ID.plus ? [{ ref: 'order-0001', examKey: 'sales_l1', expiresAt: null }] : []));
  try {
    const f = engageFixture();
    equal((await f.get('certificates')).body.available.sittings, 1);
    const started = await f.post('sitting-start', { exam: 'sales_l1', consent: true, display_name: 'Dilnoza Karimova' });
    equal(started.status, 200);
    await f.post('sitting-submit', { sitting: started.body.sitting.id });
    equal((await f.post('sitting-start', { exam: 'sales_l1', consent: true, display_name: 'Dilnoza Karimova' })).body.code, 'sitting_required', 'the purchase is used');
  } finally {
    resetSittingSource();
  }
});

Deno.test('E12: Proctor Lite signals, human review, a certificate with a QR code, revocation', async () => {
  const f = engageFixture();
  const start = await f.post('sitting-start', { exam: 'sales_l1', consent: true, display_name: 'Beta Tester' }, 'tok-beta');
  equal(start.status, 200, JSON.stringify(start.body));
  const sitting = start.body.sitting;
  ok(sitting.items.every((item: Record<string, unknown>) => !('answer' in item)), 'no keys are sent');
  equal([sitting.policy.schema_version, sitting.policy.mode, sitting.policy.camera], ['proctor.policy.v1', 'browser', false]);
  equal((await f.post('sitting-start', { exam: 'sales_l2', consent: true, display_name: 'Beta Tester' }, 'tok-beta')).body.code, 'sitting_in_progress');

  // The Proctor Lite runtime's protocol: candidate state, heartbeat, events.append, notice.acknowledge.
  const state = (await f.get('sitting-proctor', 'tok-beta', { id: sitting.id })).body;
  equal([state.session.id, state.session.state, state.notices.length], [sitting.id, 'active', 0]);
  equal((await f.post('sitting-command', { action: 'session.heartbeat', data: { session_id: sitting.id } }, 'tok-beta')).body.ok, true);
  const events = [1, 2, 3, 4].map((sequence) => ({ sequence, kind: sequence % 2 ? 'focus_loss' : 'tab_hidden', occurred_at: '2026-11-02T06:05:00.000Z' }));
  equal((await f.post('sitting-command', { action: 'events.append', data: { session_id: sitting.id, stream_id: STREAM, events } }, 'tok-beta')).body.accepted, 4);
  equal((await f.post('sitting-command', { action: 'events.append', data: { session_id: sitting.id, stream_id: STREAM, events } }, 'tok-beta')).body.accepted, 0, 'stored once per stream and sequence');
  equal((await f.post('sitting-command', { action: 'events.append', data: { session_id: sitting.id, stream_id: STREAM, events: [{ sequence: 9, kind: 'teleport', occurred_at: '2026-11-02T06:05:00Z' }] } }, 'tok-beta')).body.accepted, 0, 'only Proctor Lite’s signal kinds');
  const warned = (await f.get('sitting-proctor', 'tok-beta', { id: sitting.id })).body;
  equal([warned.notices.length, warned.notices[0].acknowledged], [1, false]);
  await f.post('sitting-command', { action: 'notice.acknowledge', data: { session_id: sitting.id, notice_ids: ['away-1'] } }, 'tok-beta');
  equal((await f.get('sitting-proctor', 'tok-beta', { id: sitting.id })).body.notices[0].acknowledged, true);
  equal((await f.get('sitting-proctor', 'tok-plus', { id: sitting.id })).status, 404, 'nobody else can read it');

  await f.post('sitting-answers', { sitting: sitting.id, answers: correct('sales_l1'), writing: { t1: REPLY } }, 'tok-beta');
  const submitted = (await f.post('sitting-submit', { sitting: sitting.id }, 'tok-beta')).body.sitting;
  equal([submitted.status, submitted.auto_score, submitted.auto_total], ['submitted', 10, 10]);

  equal((await f.get('review-queue', 'tok-beta')).body.code, 'admin_required');
  const queue = (await f.get('review-queue', 'tok-admin')).body.queue;
  equal(queue.length, 1);
  equal([queue[0].integrity.focus_loss, queue[0].integrity.tab_hidden, queue[0].tasks[0].text], [2, 2, REPLY]);
  ok(!JSON.stringify(queue).includes(ID.beta), 'the reviewer sees the name to print, not the account');
  const rubric = { listening: 3, discovery: 3, value: 3, objection: 3, next_step: 3 };
  const decided = (await f.post('review-decide', { sitting: sitting.id, rubric, integrity: 'clear' }, 'tok-admin')).body;
  equal(decided.status, 'passed');
  ok(/^https:\/\/ai\.schood\.online\/verify\/[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(decided.certificate.verify_url), decided.certificate.verify_url);
  equal((await f.post('review-decide', { sitting: sitting.id, rubric, integrity: 'clear' }, 'tok-admin')).body.code, 'already_decided');

  const verified = (await f.get('verify', 'tok-outsider', { code: decided.certificate.code.toLowerCase() })).body.certificate;
  equal([verified.status, verified.display_name, verified.level, verified.proctored], ['valid', 'Beta Tester', 'Level 1', true]);
  ok(!JSON.stringify(verified).includes(ID.beta), 'the check shows only what the certificate states');
  const scanned = await f.json('GET', 'engage/verify', { token: null, query: { code: decided.certificate.code } });
  equal([scanned.status, scanned.body.certificate.status], [200, 'valid'], 'the QR check works without signing in');
  equal((await f.json('GET', 'engage/verify', { token: null, query: { code: 'ZZZZ-ZZZZ-ZZZZ' } })).status, 404);
  const mine = (await f.get('certificates', 'tok-beta')).body.certificates[0];
  equal([mine.test, mine.code], [true, decided.certificate.code], 'a beta sitting is marked as a test certificate');
  const memory = await f.store();
  const message = memory.outboxRows.find((row) => row.userId === ID.beta && row.kind === 'certificate_ready');
  ok(message, 'the result is announced, inside the person’s budget');
  const passport = (await f.get('passport', 'tok-beta')).body;
  ok(passport.items.some((item: { kind: string; verified: boolean }) => item.kind === 'certificate' && item.verified), 'the Passport shows the certificate');

  await f.post('certificate-revoke', { code: decided.certificate.code, reason: 'Duplicate identity found' }, 'tok-admin');
  equal((await f.get('verify', 'tok-outsider', { code: decided.certificate.code })).body.certificate.status, 'revoked');
});

Deno.test('E12: a confirmed integrity finding voids the sitting; reviewers never mark their own; time runs out on its own', async () => {
  const f = engageFixture();
  const own = (await f.post('sitting-start', { exam: 'sales_l2', consent: true, display_name: 'Admin Person' }, 'tok-admin')).body.sitting;
  await f.post('sitting-submit', { sitting: own.id }, 'tok-admin');
  equal((await f.post('review-decide', { sitting: own.id, rubric: { listening: 4, discovery: 4, value: 4, objection: 4, next_step: 4 }, integrity: 'clear' }, 'tok-admin')).body.code, 'reviewer_conflict');

  const other = (await f.post('sitting-start', { exam: 'sales_l1', consent: true, display_name: 'Beta Tester' }, 'tok-beta')).body.sitting;
  await f.post('sitting-answers', { sitting: other.id, answers: correct('sales_l1') }, 'tok-beta');
  f.advance(40 * 60_000);
  const late = (await f.get('sitting', 'tok-beta', { id: other.id })).body.sitting;
  equal(late.status, 'submitted', 'after the deadline what was saved is submitted');
  const voided = (await f.post('review-decide', { sitting: other.id, rubric: { listening: 4, discovery: 4, value: 4, objection: 4, next_step: 4 }, integrity: 'confirmed', note: 'Second person answering' }, 'tok-admin')).body;
  equal([voided.status, voided.certificate], ['voided', null]);
});

Deno.test('E13: the talent pool ships off; adults only; explicit consent; every search audited; withdraw at any time', async () => {
  const f = engageFixture();
  equal((await f.get('talent')).body.enabled, false);
  equal((await f.post('talent-consent', { consent: true, version: 'talent-2026-10' })).body.code, 'feature_off');
  // The owner turns it on in the admin console (core switches; this one is off unless set).
  const toggle = (on: boolean) => f.json('PATCH', 'admin/settings', { token: 'tok-admin', body: { features: { 'engage.talent_pool': on } } });
  equal((await toggle(true)).status, 200);
  equal((await f.get('talent')).body.enabled, true);

  equal((await f.post('talent-consent', { consent: true, version: 'talent-2026-10' })).body.code, 'adults_only', 'unknown age is never in the pool');
  await f.adult();
  equal((await f.post('talent-consent', { consent: true, version: 'old' })).body.code, 'consent_required', 'the current text only');
  const joined = (await f.post('talent-consent', { consent: true, version: 'talent-2026-10' })).body;
  equal(joined.profile.opted_in, true);
  await f.post('talent-profile', { headline: 'Sales trainee, IELTS 7.0', skills: ['sales', 'ielts'], open_to: ['job'], regions: ['tashkent_city'] });

  // A minor with a consent row somehow on file is still never returned.
  const memory = await f.store();
  await memory.saveTalentProfile(ID.beta, { candidateKey: 'abcdef0123456789abcdef01', consentVersion: 'talent-2026-10', consentedAt: new Date().toISOString(), skills: ['sales'] });

  equal((await f.get('talent-search', 'tok-outsider', { skill: 'sales' })).body.code, 'employer_required');
  await f.post('talent-employer', { user_id: ID.outsider, organisation: 'Navro Tech', kind: 'employer' }, 'tok-admin');
  const results = (await f.get('talent-search', 'tok-outsider', { skill: 'sales' })).body.results;
  equal(results.length, 1, 'adults who consented only');
  equal(results[0].headline, 'Sales trainee, IELTS 7.0');
  ok(!JSON.stringify(results).includes(ID.plus) && !JSON.stringify(results).includes('@'), 'no ids, no emails');
  equal((await f.get('talent-candidate', 'tok-outsider', { candidate: results[0].candidate })).status, 200);
  const seen = (await f.get('talent')).body.seen_by;
  equal(seen.map((row: { organisation: string; action: string }) => [row.organisation, row.action]), [['Navro Tech', 'view']], 'the learner sees who looked');
  equal((await f.get('talent-audit', 'tok-outsider')).body.audit.map((row: { action: string }) => row.action), ['view', 'search']);

  await toggle(false);
  equal((await f.post('talent-withdraw', {})).body.profile.opted_in, false, 'withdrawal works even while the pool is off');
  await toggle(true);
  equal((await f.get('talent-search', 'tok-outsider', { skill: 'sales' })).body.results.length, 0, 'gone from every search at once');
});
