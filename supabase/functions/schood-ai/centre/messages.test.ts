import { centreFixture, createCentre, equal, ID, invite, ok } from './testing.ts';

// Outbound drafts, always Approve & run: T8 parent messages, C3 lead follow-ups and
// trial bookings, C11 campaigns; and C4 marketing with verified results only.

async function setup() {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'admin', ['tok-office'], 1);
  await invite(f, ws, 'teacher', ['tok-t1']);
  return { f, ws };
}
const open = async (f: Awaited<ReturnType<typeof centreFixture>>, ws: string, token = 'tok-office') => (await f.json('GET', 'core/actions', { token, workspace: ws, query: { status: 'open' } })).body.actions;

Deno.test('T8: a teacher drafts a parent message from the Academy record; the office approves and Academy sends it', async () => {
  const { f, ws } = await setup();
  f.model(/to a parent about their child/, { message: 'Assalomu alaykum! Student 1 bu oy darslarning 82% qismida qatnashdi, o‘rtacha bahosi 71. Uy vazifalarini o‘z vaqtida topshirishga yordam bersangiz, juda yaxshi bo‘ladi. Hurmat bilan, Registan.' });
  const draft = await f.json('POST', 'centre/parent-draft', { token: 'tok-t1', workspace: ws, body: { contact_id: 'ct-1', purpose: 'progress', language: 'uz' } });
  equal([draft.status, draft.body.credits, draft.body.guardian], [200, 1, null], 'drafted; a teacher cannot see guardians in Academy');
  ok(draft.body.draft.includes('82%'), 'from the record');
  const [action] = await open(f, ws, 'tok-t1');
  equal([action.kind, action.can_approve, action.display.to], ['centre_parent_message', false, 'primary guardian (chosen when sent)'], 'the teacher waits for the office');
  equal((await f.json('POST', 'core/actions', { token: 'tok-t1', workspace: ws, body: { id: action.id, decision: 'approve' } })).body.code, 'role_required', 'teachers do not send');
  const sent = await f.json('POST', 'core/actions', { token: 'tok-office', workspace: ws, body: { id: action.id, decision: 'approve' } });
  equal([sent.body.action.status, sent.body.action.result.channel], ['done', 'academy_telegram'], 'sent through Academy');
  const queued = f.academy.calls.find((call) => call.action === 'queue_guardian_notification')!;
  equal([queued.token, queued.body.relationship_id, queued.body.event_key, String(queued.body.idempotency_key).startsWith('schood-ai:')], ['tok-office', 'rel-1', 'academy_message', true], 'as the office, to the consenting guardian, idempotent');
  equal((await f.json('POST', 'core/actions', { token: 'tok-office', workspace: ws, body: { id: action.id, decision: 'approve' } })).body.action.status, 'done', 'a second click does not send twice');
  equal(f.academy.calls.filter((call) => call.action === 'queue_guardian_notification').length, 1, 'sent once');
});

Deno.test('drafts never keep invented numbers: one correction, then refused and refunded', async () => {
  const { f, ws } = await setup();
  let turn = 0;
  f.model(/to a parent about their child/, () => ({ message: turn++ === 0 ? 'Student 1 scored 95 on the last test, the best in the group of 30.' : 'Student 1 is in the top 5% with 98 points.' }));
  const refused = await f.json('POST', 'centre/parent-draft', { token: 'tok-office', workspace: ws, body: { contact_id: 'ct-1', purpose: 'praise', language: 'en' } });
  equal([refused.status, refused.body.code], [422, 'draft_unverified'], 'refused');
  equal(f.upstream.filter((call) => /to a parent/.test(call.system)).length, 2, 'one correction turn was tried');
  ok(f.upstream.at(-1)!.user.includes('95') && f.upstream.at(-1)!.user.includes('not in the reference data'), 'told which numbers were invented');
  const charges = f.memory.ledger.filter((row) => row.creditKey === 'parent.message');
  equal(charges.map((row) => row.kind), ['charge', 'refund'], 'refunded');
  equal(await open(f, ws), [], 'nothing was proposed');
});

Deno.test('C3: lead follow-ups are logged in Academy; trial invitations book the trial after approval', async () => {
  const { f, ws } = await setup();
  const leads = await f.json('GET', 'centre/leads', { token: 'tok-office', workspace: ws });
  equal([leads.body.leads[0].name, leads.body.leads[0].stage.label, leads.body.leads[0].overdue, leads.body.leads[0].bot_thread_id], ['Aziza Yusupova', 'New', true, null], 'open leads from Academy');
  equal((await f.json('GET', 'centre/leads', { token: 'tok-t1', workspace: ws })).status, 403, 'office only');
  f.model(/follow-up message from the centre/, { message: 'Assalomu alaykum, Aziza! IELTS kursimiz haqida so‘ragan edingiz. Bepul sinov darsiga taklif qilamiz — qachon qulay?' });
  const follow = await f.json('POST', 'centre/lead-draft', { token: 'tok-office', workspace: ws, body: { lead_id: 'lead-1', kind: 'follow_up', language: 'uz' } });
  equal([follow.status, follow.body.reaches], [200, 'manual'], 'no bot chat: the office sends it, approving logs it');
  await f.json('POST', 'core/actions', { token: 'tok-office', workspace: ws, body: { id: follow.body.action_id, decision: 'approve' } });
  const logged = f.academy.calls.find((call) => call.action === 'record_lead_activity')!;
  equal([logged.body.lead_id, logged.body.status, logged.body.method], ['lead-1', 'completed', 'other'], 'logged in Academy');

  equal((await f.json('POST', 'centre/lead-draft', { token: 'tok-office', workspace: ws, body: { lead_id: 'lead-1', kind: 'trial_invite', language: 'uz', starts_at: '2026-10-01T10:00:00Z', ends_at: '2026-10-01T11:00:00Z' } })).status, 400, 'a past time is refused');
  f.model(/inviting a prospective student to a trial lesson/, (call) => ({ message: `Aziza, sinov darsi: ${/"trial_time":"([^"]+)"/.exec(call.system)?.[1] ?? ''}. Tasdiqlaysizmi?` }));
  const trial = await f.json('POST', 'centre/lead-draft', { token: 'tok-office', workspace: ws, body: { lead_id: 'lead-1', kind: 'trial_invite', language: 'uz', starts_at: '2026-11-03T10:00:00Z', ends_at: '2026-11-03T11:00:00Z' } });
  equal(trial.status, 200, 'drafted with the exact time');
  const booked = await f.json('POST', 'core/actions', { token: 'tok-office', workspace: ws, body: { id: trial.body.action_id, decision: 'approve' } });
  equal(booked.body.action.status, 'done');
  const calls = f.academy.calls.filter((call) => ['create_lead', 'schedule_trial'].includes(call.action));
  equal(calls.map((call) => [call.action, call.body.lead_id]), [['schedule_trial', 'lead-1']], 'an existing lead gets the trial, no duplicate lead');
  const [booking] = await f.store.table('bookings').list({ workspace_id: ws });
  equal([booking.status, booking.mode], ['synced', 'staff'], 'the booking is in Academy');
});

Deno.test('C11: campaigns find their audience in Academy signals and draft one approved message per person', async () => {
  const { f, ws } = await setup();
  const created = await f.json('POST', 'centre/campaigns', { token: 'tok-office', workspace: ws, body: { kind: 'winback' } });
  const audience = created.body.campaign.audience;
  equal(audience.map((entry: { contact_id: string; reason: string }) => [entry.contact_id, entry.reason]), [['ct-1', 'at_risk'], ['ct-6', 'lapsed']], 'at-risk and lapsed students');
  ok(!JSON.stringify(created.body).includes('message'), 'no message is written yet');
  f.model(/at risk of dropping out/, (call) => ({ message: call.system.includes('lapsed') ? 'We miss Student 6 at the centre. Would you like to talk with the teacher about coming back?' : 'Student 1 has missed 3 homeworks and attendance is 64%. Shall we talk with the teacher this week?' }));
  const drafted = await f.json('POST', 'centre/campaign-draft', { token: 'tok-office', workspace: ws, body: { campaign_id: created.body.campaign.id, contact_ids: ['ct-1', 'ct-6'], language: 'en' } });
  equal([drafted.body.drafted.length, drafted.body.stopped], [2, null], 'two drafts');
  const actions = await open(f, ws);
  equal(actions.map((action: { display: { to: string } }) => action.display.to).sort(), ['Student 6', 'primary guardian (chosen when sent)'].sort(), 'parents of at-risk students, lapsed students themselves');
  equal(f.memory.ledger.filter((row) => row.kind === 'charge' && row.creditKey === 'winback.message').length, 2, 'one credit each');
  const renewal = await f.json('POST', 'centre/campaigns', { token: 'tok-office', workspace: ws, body: { kind: 'renewal' } });
  equal(renewal.body.campaign.audience.map((entry: { reason: string }) => entry.reason), ['renewal_due'], 'renewals due in three weeks');
  equal((await f.json('POST', 'centre/campaigns', { token: 'tok-basic-owner', workspace: ws, body: { kind: 'winback' } })).status, 404, 'other people never see it');
});

Deno.test('C4: results posts use only verified results of students who agreed; no invented scores or quotes', async () => {
  const { f, ws } = await setup();
  const entered = await f.json('POST', 'centre/results', { token: 'tok-t1', workspace: ws, body: { student_name: 'Madina R.', exam: 'IELTS', score: '7.5', result_date: '2026-10-12', consent: true, evidence_note: 'TRF number on file' } });
  equal([entered.status, entered.body.result.verified], [200, false], 'teachers enter results, unverified');
  f.model(/Give up to three variants/, { variants: [{ text: 'Congratulations to Madina R. on IELTS 7.5! Hard work pays off. Join our next IELTS group.', hashtags: ['#IELTS'] }] });
  const unverified = await f.json('POST', 'centre/marketing', { workspace: ws, body: { kind: 'results', language: 'en', brief: 'Celebrate our IELTS result', result_ids: [entered.body.result.id] } });
  equal(unverified.body.code, 'results_unverified', 'not before verification');
  equal((await f.json('PATCH', 'centre/results', { token: 'tok-t1', workspace: ws, body: { id: entered.body.result.id, verified: true } })).status, 403, 'teachers do not verify');
  await f.json('PATCH', 'centre/results', { token: 'tok-office', workspace: ws, body: { id: entered.body.result.id, verified: true } });
  const post = await f.json('POST', 'centre/marketing', { workspace: ws, body: { kind: 'results', language: 'en', brief: 'Celebrate our IELTS result', result_ids: [entered.body.result.id] } });
  equal([post.status, post.body.variants.length, post.body.credits], [200, 1, 3], 'three credits, a post with the real score');
  f.model(/Give up to three variants/, { variants: [{ text: 'Our students average band 8.0 and 100% pass! “Best centre ever” says a parent.', hashtags: [] }] });
  const invented = await f.json('POST', 'centre/marketing', { workspace: ws, body: { kind: 'instagram', language: 'en', brief: 'Promote our IELTS course' } });
  equal([invented.status, invented.body.code], [422, 'draft_unverified'], 'invented averages and quotes are refused');
  ok(f.upstream.at(-1)!.user.includes('Do not quote anyone'), 'the correction asked to drop the testimonial');
  equal(f.memory.ledger.filter((row) => row.creditKey === 'marketing.post').map((row) => row.kind), ['charge', 'charge', 'refund'], 'the refused post was refunded');
  equal((await f.json('POST', 'centre/marketing', { token: 'tok-t1', workspace: ws, body: { kind: 'telegram', language: 'uz', brief: 'x x x' } })).status, 403, 'marketing is for the office');
});
