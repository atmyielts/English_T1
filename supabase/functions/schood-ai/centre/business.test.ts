import { ownKeyResolver } from '../registries.ts';
import type { StoreHandle } from '../stores.ts';
import { computeByokFees } from './byok.ts';
import { unitFromDraft, unitProblems } from './curriculum-content.ts';
import { centreFixture, createCentre, equal, ID, invite, ok } from './testing.ts';

// C9 resale and the wholesale ledger, C10 brief delivery rules, C13 knowledge,
// C15 own model keys and fees, C16 observations, C12 curriculum in a box.

Deno.test('C9: the centre resells at its own price; students without a resale get no credits; Schood’s wholesale ledger', async () => {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'student', ['tok-s1', 'tok-s2', 'tok-s3']);
  equal((await f.json('POST', 'centre/resell-students', { workspace: ws, body: { user_ids: [ID.s1], active: true } })).body.code, 'resell_off', 'switch reselling on first');
  const on = await f.json('PATCH', 'centre/resell', { workspace: ws, body: { enabled: true, price_uzs: 60000, gate_access: true, student_budget: 300 } });
  equal([on.body.resell.price_uzs, on.body.resell.wholesale_rate_uzs, on.body.budgets_changed], [60000, 9000, 3], 'the centre’s price; every student is gated to 0 credits');
  equal((await f.memory.repository.membership(ws, ID.s1))!.creditBudget, 0);
  await f.json('POST', 'centre/resell-students', { workspace: ws, body: { user_ids: [ID.s1, ID.s2, ID.outsider], active: true, paid_until: '2026-11-30' } });
  equal([(await f.memory.repository.membership(ws, ID.s1))!.creditBudget, (await f.memory.repository.membership(ws, ID.s3))!.creditBudget], [300, 0], 'paying students get their budget');
  const view = await f.json('GET', 'centre/resell', { workspace: ws });
  equal([view.body.month.active_students, view.body.month.estimate_uzs, view.body.billing, view.body.ledger[0].amount_uzs], [2, 18000, 'manual_invoice', 18000], '2 × 9,000 UZS, invoiced by hand');
  f.advance(10 * 86_400_000);
  await f.json('POST', 'centre/resell-students', { workspace: ws, body: { user_ids: [ID.s2], active: false } });
  equal((await f.memory.repository.membership(ws, ID.s2))!.creditBudget, 0, 'ended resale closes the budget');
  equal((await f.json('GET', 'centre/resell', { workspace: ws })).body.month.active_students, 2, 'a student active at any time in the month counts');
  const row = (await f.json('GET', 'centre/resell', { workspace: ws })).body.ledger[0];
  equal((await f.json('PATCH', 'centre/wholesale', { workspace: ws, body: { id: row.id, status: 'paid' } })).body.code, 'admin_required', 'centres cannot mark their own invoice paid');
  equal((await f.json('PATCH', 'centre/wholesale', { token: 'tok-schood-admin', body: { id: row.id, status: 'invoiced', invoice_ref: 'INV-2026-11-007' } })).body.ledger.status, 'invoiced');
  await f.json('POST', 'centre/resell-students', { workspace: ws, body: { user_ids: [ID.s3], active: true } });
  equal((await f.json('GET', 'centre/resell', { workspace: ws })).body.ledger[0].active_students, 2, 'an invoiced month is not recomputed');
});

Deno.test('C10: brief delivery respects quiet hours and the daily limit, retries later, and needs Centre Pro', async () => {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'admin', ['tok-office'], 1);
  equal((await f.json('PATCH', 'centre/brief', { workspace: ws, body: { enabled: true, recipients: [ID.t1] } })).status, 400, 'briefs go to owners and admins');
  await f.json('PATCH', 'centre/brief', { workspace: ws, body: { enabled: true, recipients: [ID.owner, ID.office], hour: 8 } });
  f.model(/Monday business brief/, { headline: 'This week at Registan', text: 'New leads 14, conversions 4, attendance 87%. Data from Academy as shown.', suggestions: [
    { title: 'Follow up leads', why: '14 new leads.', area: 'leads' }, { title: 'Check attendance', why: 'Attendance 87%.', area: 'parents' }, { title: 'Review conversions', why: '4 conversions.', area: 'leads' },
  ] });
  // A live brief on request: built from Academy now, with the person's token.
  const live = await f.json('POST', 'centre/brief', { workspace: ws, body: {} });
  equal([live.status, live.body.brief.source, live.body.brief.status], [200, 'live', 'ready'], 'live preview');
  // Monday 23:30 in Tashkent: the scheduler builds this week's brief but quiet hours defer delivery.
  f.setClock(new Date('2026-11-02T18:30:00Z'));
  await f.tick();
  const deferred = (await f.store.table('briefs').get({ workspace_id: ws, week: '2026-W45' }))!;
  equal((deferred.deliveries as { status: string }[]).map((entry) => entry.status), ['deferred', 'no_chat'], 'quiet hours for the owner; the admin has no Telegram linked');
  equal(f.notifySends.length, 0, 'nothing reached the Schood bot in quiet hours');
  f.setClock(new Date('2026-11-03T04:00:00Z')); // Tuesday 09:00
  await f.tick();
  const retried = (await f.store.table('briefs').get({ workspace_id: ws, week: '2026-W45' }))!;
  equal((retried.deliveries as { user_id: string; status: string; channel: string }[]).map((entry) => [entry.user_id, entry.status, entry.channel]), [[ID.owner, 'sent', 'schood_bot'], [ID.office, 'no_chat', null]], 'the owner gets it through core’s Schood bot delivery');
  equal(retried.status, 'partial');
  const [send] = f.notifySends;
  equal([f.notifySends.length, send.userId, send.kind, send.buttons[0].path, send.dedupeKey], [1, ID.owner, 'centre.brief', '/centre/brief', `centre-brief:${retried.id}:${ID.owner}`], 'one message, kind centre.brief, a button to the brief, sent once');
  // Muted in Settings → Notifications: dropped, not retried.
  await f.memory.repository.saveNotifyPrefs(ID.owner, { ...(await f.memory.repository.notifyPrefs(ID.owner)), muted: ['centre.brief'] });
  f.setClock(new Date('2026-11-09T04:00:00Z')); // next Monday 09:00
  await f.tick();
  const muted = (await f.store.table('briefs').get({ workspace_id: ws, week: '2026-W46' }))!;
  equal((muted.deliveries as { user_id: string; status: string }[]).find((entry) => entry.user_id === ID.owner)?.status, 'muted', 'the owner muted the brief');
  equal(f.notifySends.length, 1, 'nothing more reached the bot');
  const basic = await centreFixture();
  const basicWs = (await basic.json('POST', 'centre/create', { token: 'tok-schood-admin', body: { name: 'Basic', owner_user_id: ID.basicOwner } })).body.workspace.id;
  equal((await basic.json('PATCH', 'centre/brief', { token: 'tok-basic-owner', workspace: basicWs, body: { enabled: true } })).body.code, 'plan_required', 'Centre Pro feature');
});

Deno.test('C13: policies are chunked per page; answers cite checked pages; no match means no AI call', async () => {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'teacher', ['tok-t1']);
  equal((await f.json('POST', 'centre/knowledge', { token: 'tok-t1', workspace: ws, body: { title: 'x', pages: [{ page: 1, text: 'x' }] } })).status, 403, 'the office uploads');
  const upload = await f.json('POST', 'centre/knowledge', { workspace: ws, body: {
    title: 'Staff handbook', filename: 'handbook.pdf', mime: 'application/pdf', file_base64: btoa('%PDF-1.4 fake'),
    pages: [{ page: 1, text: 'Welcome to Registan.' }, { page: 2, text: 'Leave. Teachers take up to 14 days of paid leave each year. Leave requests go to the office manager two weeks ahead.' }, { page: 3, text: 'Lateness. Arriving more than 10 minutes late is recorded in the journal.' }],
  } });
  equal([upload.status, upload.body.doc.pages, upload.body.doc.stored_file], [200, 3, true], 'stored with the original file');
  equal(f.media.length, 1, 'the file went to the media store');
  const none = await f.json('POST', 'centre/knowledge-ask', { token: 'tok-t1', workspace: ws, body: { question: 'What is the wifi password?' } });
  equal([none.body.found, none.body.credits, f.upstream.length], [false, 0, 0], 'nothing found: no AI, no credits');
  let attempt = 0;
  f.model(/using only the centre’s own documents/, () => (attempt++ === 0 ? { answer: 'Up to 14 days a year [7].', citations: [7], found: true } : { answer: 'Teachers take up to 14 days of paid leave a year, requested two weeks ahead from the office manager [1].', citations: [1], found: true }));
  const answer = await f.json('POST', 'centre/knowledge-ask', { token: 'tok-t1', workspace: ws, body: { question: 'How many days of leave do teachers get?' } });
  equal([answer.body.found, answer.body.sources[0].page, answer.body.sources[0].title, answer.body.credits], [true, 2, 'Staff handbook', 1], 'cites page 2 after correcting an invalid citation');
  equal(f.upstream.length, 2, 'one correction turn');
  await f.json('DELETE', 'centre/knowledge', { workspace: ws, body: { id: upload.body.doc.id } });
  equal((await f.store.table('knowledge_chunks').list({ workspace_id: ws })).length, 0, 'deleting removes the chunks');
});

Deno.test('C15: own model keys for Enterprise owners, sealed, used by core\u2019s gateway, with a platform fee set by Schood', async () => {
  const f = await centreFixture();
  const pro = await createCentre(f);
  equal((await f.json('POST', 'centre/byok', { workspace: pro, body: { label: 'main', provider: 'openrouter', api_key: 'sk-test-0123456789abcdef' } })).body.code, 'plan_required', 'Enterprise only');
  const ent = (await f.json('POST', 'centre/create', { token: 'tok-schood-admin', body: { name: 'Enterprise Centre', owner_user_id: ID.t2, contract_until: '2027-12-31T00:00:00Z' } })).body.workspace.id;
  const body = { label: 'main', provider: 'openrouter', api_key: 'sk-centre-own-key-0123456789' };
  equal((await f.json('POST', 'centre/byok', { token: 'tok-t2', workspace: ent, body: { ...body, provider: 'my-own-endpoint' } })).body.field, 'provider', 'only providers in Schood\u2019s registry');
  const view0 = await f.json('GET', 'centre/byok', { token: 'tok-t2', workspace: ent });
  equal(view0.body.providers.map((entry: { key: string }) => entry.key), ['openrouter'], 'the registry\u2019s providers to choose from');
  const saved = await f.json('POST', 'centre/byok', { token: 'tok-t2', workspace: ent, body });
  equal([saved.status, saved.body.key.hint, saved.body.key.provider], [200, '6789', 'openrouter'], 'saved');
  ok(!JSON.stringify(saved.body).includes('sk-centre-own-key') && !JSON.stringify(await f.store.table('secrets').list({ workspace_id: ent })).includes('sk-centre-own-key'), 'never stored or returned in plain text');
  const opened = await f.deps.secrets!.open((await f.store.table('secrets').get({ workspace_id: ent, purpose: 'byok' }))!.sealed, `${ent}:byok:main`);
  equal(opened, body.api_key, 'only the function can open it, bound to the centre');
  let moved = false;
  try { await f.deps.secrets!.open((await f.store.table('secrets').get({ workspace_id: ent, purpose: 'byok' }))!.sealed, `${pro}:byok:main`); } catch { moved = true; }
  ok(moved, 'a sealed key copied to another centre cannot be opened');
  // Core's gateway asks the area's resolver: the key for this centre and provider only.
  const resolve = ownKeyResolver()!;
  const store = <T,>(handle: StoreHandle<T>) => f.stores.get(handle);
  equal(await resolve({ workspaceId: ent, providerKey: 'openrouter', store }), { label: 'main', apiKey: body.api_key, feeCredits: 0 }, 'the centre\u2019s key, no credits per call');
  equal([await resolve({ workspaceId: pro, providerKey: 'openrouter', store }), await resolve({ workspaceId: ent, providerKey: 'anthropic', store })], [null, null], 'no key for another centre or provider');
  // A real call in the centre goes out with its own key: logged as byok, no credits charged.
  await f.json('POST', 'centre/knowledge', { token: 'tok-t2', workspace: ent, body: { title: 'Handbook', pages: [{ page: 1, text: 'Teachers take up to 14 days of paid leave each year.' }] } });
  f.model(/using only the centre\u2019s own documents/, { answer: 'Up to 14 days of paid leave a year [1].', citations: [1], found: true });
  const asked = await f.json('POST', 'centre/knowledge-ask', { token: 'tok-t2', workspace: ent, body: { question: 'How many days of leave do teachers get?' } });
  equal([asked.status, asked.body.found, asked.body.credits], [200, true, 0], 'answered with no credits');
  ok(f.memory.calls.some((row) => row.workspaceId === ent && row.providerKey === 'byok:main' && row.status === 'ok'), 'the call went out with the centre\u2019s key');
  // Schood's fee per 1,000 calls, from the calls logged with the centre's key.
  await f.json('PATCH', 'centre/grants', { token: 'tok-schood-admin', body: { workspace_id: ent, byok_uzs_per_1000_calls: 5000 } });
  const fee = await computeByokFees(f.store, ent, '2026-11');
  equal([fee!.calls, fee!.rate_uzs_per_1000], [1, 5000], 'the month\u2019s calls and the contract rate');
  const view = await f.json('GET', 'centre/byok', { token: 'tok-t2', workspace: ent });
  equal([view.body.allowed, view.body.keys.length], [true, 1]);
  equal((await f.json('DELETE', 'centre/byok', { token: 'tok-t2', workspace: ent, body: { label: 'main' } })).status, 200, 'revoked');
  equal(await resolve({ workspaceId: ent, providerKey: 'openrouter', store }), null, 'a revoked key is not used');
});

Deno.test('C16: observation feedback against the centre’s standards, checked evidence, shared then acknowledged, tracked over the term', async () => {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'teacher', ['tok-t1', 'tok-t2']);
  const standards = await f.json('PUT', 'centre/observation-standards', { workspace: ws, body: { standards: [{ key: 'aims', title: 'Clear aims', description: 'Aims are clear.' }, { key: 'talk', title: 'Student talk', description: 'Students speak most.' }] } });
  equal(standards.body.standards.length, 2, 'the centre’s own standards');
  const notes = 'The teacher wrote the aim on the board at the start. Students worked in pairs for most of the lesson, but the teacher talked for the first twenty minutes.';
  const feedback = (rating: number) => ({ summary: 'A clear lesson with good pair work after a long start.', ratings: [{ key: 'aims', rating, evidence: ['wrote the aim on the board', 'quote that is not there'], comment: 'Aims shared early.' }, { key: 'talk', rating: 2, evidence: ['the teacher talked for the first twenty minutes'], comment: 'Shorten the lead-in.' }, { key: 'unknown', rating: 4, evidence: [], comment: 'Should be dropped.' }], strengths: ['Shared aims'], next_steps: ['Cut the lead-in to five minutes'] });
  f.model(/structured, supportive feedback/, feedback(3));
  equal((await f.json('POST', 'centre/observations', { token: 'tok-t1', workspace: ws, body: { teacher_id: ID.t1, lesson_date: '2026-10-28', source: 'notes', input: notes } })).status, 400, 'a teacher does not observe their own lesson from notes');
  const created = await f.json('POST', 'centre/observations', { workspace: ws, body: { teacher_id: ID.t1, lesson_date: '2026-10-28', source: 'notes', input: notes } });
  const aims = created.body.observation.feedback.ratings.find((row: { key: string }) => row.key === 'aims');
  equal([created.body.credits, created.body.observation.status, created.body.observation.term, aims.evidence, created.body.observation.feedback.ratings.length], [5, 'draft', '2026-T1', ['wrote the aim on the board'], 2], 'unknown standards and unquoted evidence are dropped');
  equal((await f.json('GET', 'centre/observations', { token: 'tok-t1', workspace: ws })).body.observations.length, 0, 'a draft is not shown to the teacher');
  await f.json('PATCH', 'centre/observations', { workspace: ws, body: { id: created.body.observation.id, share: true } });
  equal((await f.json('PATCH', 'centre/observations', { token: 'tok-t2', workspace: ws, body: { id: created.body.observation.id, acknowledge: true } })).status, 403, 'only the observed teacher acknowledges');
  const ack = await f.json('PATCH', 'centre/observations', { token: 'tok-t1', workspace: ws, body: { id: created.body.observation.id, acknowledge: true, comment: 'Thanks, will shorten the lead-in.' } });
  equal(ack.body.observation.status, 'acknowledged');
  f.model(/structured, supportive feedback/, feedback(4));
  const second = await f.json('POST', 'centre/observations', { workspace: ws, body: { teacher_id: ID.t1, lesson_date: '2026-11-15', source: 'notes', input: notes } });
  await f.json('PATCH', 'centre/observations', { workspace: ws, body: { id: second.body.observation.id, share: true } });
  const progress = await f.json('GET', 'centre/observation-progress', { token: 'tok-t1', workspace: ws, query: { term: '2026-T1' } });
  const trend = progress.body.standards.find((row: { key: string }) => row.key === 'aims');
  equal([progress.body.observations, trend.first, trend.last, trend.average], [2, 3, 4, 3.5], 'progress over the term');
  equal((await f.json('GET', 'centre/observation-progress', { token: 'tok-t2', workspace: ws, query: { teacher_id: ID.t1 } })).status, 403, 'teachers see only their own');
});

Deno.test('C12: outline, one unit per job, methodologist review, library publish, Academy Courses after Approve & run', async () => {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'teacher', ['tok-t1']);
  f.model(/English course for an education centre/, { levels: [{ level: 'a1', units: [{ title: 'Hello and introductions', can_do: ['I can greet people.'] }, { title: 'My family', can_do: ['I can describe my family.'] }] }, { level: 'a2', units: [{ title: 'Daily routines', can_do: ['I can talk about my day.'] }, { title: 'Food and shopping', can_do: ['I can buy food.'] }] }] });
  // Units come back in the teacher material model: a stages block per lesson, the unit test as a question set.
  const lesson = (minutes: [number, number, number]) => ({ type: 'stages', title: 'Lesson one', homework: 'Write five greetings.', stages: [
    { name: 'Warm-up', minutes: minutes[0], aim: 'Learn names', steps: ['Name chain around the class.'] },
    { name: 'Presentation', minutes: minutes[1], aim: 'Meet greetings', steps: ['Greetings dialogue with gaps.'] },
    { name: 'Practice', minutes: minutes[2], aim: 'Use greetings', steps: ['Pairs role-play introductions.'] },
  ] });
  const unitTest = (key: string) => ({ type: 'questions', title: 'Unit test', instructions: 'Choose the answer.', questions: [1, 2, 3, 4].map((n) => ({ type: 'single_choice', prompt: `Item ${n}: Hello, ____ are you${'?'.repeat(n)}`, options: [{ id: 'A', text: 'how' }, { id: 'B', text: 'what' }, { id: 'C', text: 'who' }], answer: [n === 1 ? key : 'A'] })) });
  const unit = (title: string, broken: boolean) => ({ title, aims: ['I can greet people.'], blocks: [lesson(broken ? [10, 30, 20] : [10, 30, 50]), unitTest(broken ? 'E' : 'A')] });
  // The first draft of each unit has a lesson 30 minutes short and a key outside the options; the correction turn fixes both.
  f.model(/Write one unit of a/, (call) => unit(/"title":"([^"]+)"/.exec(call.system)?.[1] ?? 'Unit', !call.last.startsWith('Fix these problems')));
  const empty = unitFromDraft({ title: 'Probe', aims: ['I can greet people.'], blocks: [] }, { course: 'x', level: 'a1', language: 'en', lessons: 1, minutes: 90, fallbackTitle: 'Probe' });
  ok(unitProblems(empty, 1, 90).some((line) => line.includes('0 lessons')), 'a unit without lessons is caught');
  const created = await f.json('POST', 'centre/curricula', { workspace: ws, body: { title: 'General English', levels: ['a2', 'a1'], units_per_level: 2, lessons_per_unit: 1, track: 'general', language: 'en' } });
  equal([created.status, created.body.curriculum.units.map((u: { level: string }) => u.level), created.body.credits, created.body.curriculum.cost.per_unit], [200, ['a1', 'a1', 'a2', 'a2'], 10, 20], 'outline in level order, 10 credits; 20 per unit');
  const run = () => f.json('POST', 'centre/curriculum-run', { workspace: ws, body: { id: created.body.curriculum.id } });
  const first = await run();
  equal([first.body.curriculum.progress.ready, first.body.done], [1, false], 'one unit per call');
  // A unit whose job stopped beating is retried.
  const [stuck] = await f.store.table('units').list({ curriculum_id: created.body.curriculum.id, position: 2 });
  await f.store.table('units').update({ id: stuck.id }, { status: 'generating' });
  f.advance(10 * 60_000);
  for (let i = 0; i < 4; i++) await run();
  const done = await run();
  equal([done.body.done, done.body.curriculum.status, done.body.curriculum.progress.ready], [true, 'review', 4], 'all units ready for review');
  const view = done.body.curriculum.units[0].content as { lessons: { minutes: number; stages: { aim: string }[]; homework: string }[]; test: { answer: number }[]; problems: string[] };
  equal([view.lessons.length, view.lessons[0].minutes, view.lessons[0].stages[0].aim, view.test.length, view.test[0].answer, view.problems], [1, 90, 'Learn names', 4, 0, []], 'fixed by the correction turn: 90 minutes, the key in the options');
  ok(f.upstream.some((call) => call.last.startsWith('Fix these problems') && call.last.includes('Lesson 1: the stages add up to 60 minutes, not 90.') && call.last.includes('Test item 1: the key is not one of the options.')), 'the teacher key check and the timing check asked for the fix');
  equal(f.memory.ledger.filter((row) => row.kind === 'charge' && row.creditKey === 'curriculum.unit').length, 4, '20 credits per unit, interrupted one retried');
  equal((await f.json('POST', 'centre/curriculum-publish', { workspace: ws, body: { id: created.body.curriculum.id } })).body.code, 'not_approved', 'nothing is published before review');
  const units = done.body.curriculum.units;
  equal((await f.json('POST', 'centre/curriculum-review', { token: 'tok-t1', workspace: ws, body: { unit_id: units[0].id, decision: 'changes' } })).status, 400, 'changes need notes');
  await f.json('POST', 'centre/curriculum-review', { token: 'tok-t1', workspace: ws, body: { unit_id: units[0].id, decision: 'changes', notes: 'Add more speaking practice.' } });
  const redo = await run();
  ok(f.upstream.at(-1)!.system.includes('Add more speaking practice.'), 'regenerated with the methodologist’s notes');
  for (const entry of redo.body.curriculum.units) await f.json('POST', 'centre/curriculum-review', { token: 'tok-t1', workspace: ws, body: { unit_id: entry.id, decision: 'approve' } });
  const published = await f.json('POST', 'centre/curriculum-publish', { workspace: ws, body: { id: created.body.curriculum.id, to_academy: true } });
  equal([published.body.curriculum.status, published.body.curriculum.units.every((u: { page_ids: string[] }) => u.page_ids.length === 1)], ['published', true], 'one approved library page per unit');
  const page = await f.memory.repository.page(published.body.curriculum.units[0].page_ids[0]);
  ok(page && page.status === 'approved' && page.folder === 'Curricula/General English/A1' && page.body.includes('Answer key (staff only)'), 'in the shared library');
  const approved = await f.json('POST', 'core/actions', { workspace: ws, body: { id: published.body.action_id, decision: 'approve' } });
  equal([approved.body.action.status, approved.body.action.result.courses, approved.body.action.result.lessons], ['done', 2, 4], 'A1 and A2 courses with their lessons');
  equal(f.academy.calls.filter((call) => call.action === 'publish_course').length, 2, 'both published in Academy');
  const kept = (await f.store.table('curricula').get({ id: created.body.curriculum.id }))!.outline as { academy: { lessons: Record<string, string> } };
  equal(Object.keys(kept.academy.lessons).length, 4, 'Academy ids are kept, so a retry continues instead of duplicating');
});
