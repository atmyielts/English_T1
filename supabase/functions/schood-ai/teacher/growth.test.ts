import { ID, equal, ok, personal } from '../fixture.test.ts';
import { inventedNumbers } from './brand.ts';
import { nextMonday, slotTime } from './channel.ts';
import { promptOf, reply, teacherFixture } from './test-kit.ts';

// T11 channel autopilot, T12 marketplace, T13 tutor brand kit.

const PRO = 'tok-beta';

Deno.test('channel autopilot: connect, write the week, one-click approval, posting within Telegram limits', async () => {
  const f = teacherFixture();
  try {
    f.setProvider(async (request) => {
      const { user } = await promptOf(request);
      if (user.includes('quiz poll')) return reply({ question: 'Choose the correct form: She ___ to school every day.', options: ['go', 'goes', 'going', 'gone'], correct: 1, explanation: 'Third person singular takes -s.' });
      return reply({ text: 'Word of the day: “thrive” — to grow well. Plants thrive in sunlight. Students thrive with feedback. How do you thrive?' });
    });
    equal((await f.json('POST', 'teacher/channels', { token: 'tok-teacher-plan', body: { chat: '@ielts_with_aziza' } })).body.code, 'plan_required', 'Teacher Pro feature');
    const ws = await personal(f, PRO);
    equal((await f.json('POST', 'teacher/channels', { token: PRO, body: { chat: 'not a channel' } })).body.code, 'invalid_request');
    const connected = await f.json('POST', 'teacher/channels', { token: PRO, body: { chat: 'https://t.me/ielts_with_aziza', voice: 'Friendly, short, a little humour.', language: 'uz', level: 'B1', schedule: { time: '09:00', days: [1, 2], kinds: ['word', 'quiz'] } } });
    equal(connected.status, 200, JSON.stringify(connected.body));
    equal([connected.body.channel.status, connected.body.channel.chat_id, connected.body.bot.username], ['verified', '-1001234567890', 'schood_teacher_bot']);
    ok(f.telegramCalls.every((call) => ['getMe', 'getChat', 'getChatMember'].includes(call.method)), 'connecting only reads');

    const week = await f.json('POST', 'teacher/channel-week', { token: PRO, body: { channel_id: connected.body.channel.id } });
    equal(week.body.batch.week_start, '2026-11-02');
    equal(week.body.batch.posts.map((post: { kind: string; scheduled_for: string }) => [post.kind, post.scheduled_for]), [['quiz', '2026-11-02T07:00:00.000Z'], ['word', '2026-11-03T04:00:00.000Z'], ['quiz', '2026-11-03T07:00:00.000Z']], 'past slots are skipped; Tashkent times');
    for (const post of week.body.batch.posts) equal((await f.json('POST', 'teacher/channel-post-write', { token: PRO, body: { post_id: post.id } })).status, 200);
    equal(f.memory.ledger.filter((row) => row.workspaceId === ws && row.kind === 'charge').map((row) => row.delta), [-3, -3, -3], '3 credits per post');
    const tooLong = await f.json('PATCH', 'teacher/channel-post', { token: PRO, body: { id: week.body.batch.posts[0].id, content: { poll: { question: 'Q?', options: ['a'], correct: 0 } } } });
    equal(tooLong.body.code, 'invalid_request', 'Telegram poll limits');

    const proposed = await f.json('POST', 'teacher/channel-approve', { token: PRO, body: { batch_id: week.body.batch.id } });
    equal([proposed.body.action.kind, proposed.body.action.status], ['post_to_channel', 'pending']);
    ok(Object.values(proposed.body.action.display).some((value) => String(value).includes('✓ goes')), 'the card shows each post as it will go out');
    // Edited after the proposal: left out of the run, so only what was shown is posted.
    await f.json('PATCH', 'teacher/channel-post', { token: PRO, body: { id: week.body.batch.posts[2].id, content: { poll: { question: 'Changed?', options: ['yes', 'no'], correct: 0 } } } });
    const run = await f.json('POST', 'core/actions', { token: PRO, body: { id: proposed.body.action.id, decision: 'approve' } });
    equal(run.body.action.result, { scheduled: 2, sent_now: 0 }, 'nothing is due yet');
    equal(f.telegramCalls.filter((call) => call.method.startsWith('send')).length, 0);

    f.advance(65 * 60_000);
    const first = await f.json('POST', 'teacher/channel-dispatch', { token: PRO });
    equal(first.body.dispatched, { sent: 1, failed: 0, deferred: 0 });
    const poll = f.telegramCalls.find((call) => call.method === 'sendPoll')!;
    equal([poll.body.chat_id, poll.body.type, poll.body.correct_option_id, poll.body.is_anonymous], ['-1001234567890', 'quiz', 1, true]);
    // Telegram asks to slow down: the post waits and goes later.
    f.advance(21 * 3_600_000);
    f.setTelegram((method) => method === 'sendMessage' ? { ok: false, status: 429, description: 'Too Many Requests', decision: { retryable: true, reason: 'rate_limited', retryAfterSeconds: 30 } } : null as never);
    equal((await f.json('POST', 'teacher/channel-dispatch', { token: PRO })).body.dispatched, { sent: 0, failed: 0, deferred: 1 });
    f.setTelegram(null);
    f.advance(31_000);
    equal((await f.json('POST', 'teacher/channel-dispatch', { token: PRO })).body.dispatched.sent, 1);
    const after = await f.json('GET', 'teacher/channels', { token: PRO });
    equal(after.body.channels[0].batches[0].posts.map((post: { status: string }) => post.status), ['sent', 'sent', 'draft']);
    // Someone else's workspace never dispatches these posts.
    equal((await f.json('POST', 'teacher/channel-dispatch', { token: 'tok-plus' })).body.dispatched.sent, 0);
  } finally {
    f.reset();
  }
});

Deno.test('channel times and weeks', () => {
  equal(nextMonday(new Date('2026-11-04T10:00:00Z')), '2026-11-09');
  equal(nextMonday(new Date('2026-11-01T20:00:00Z')), '2026-11-02', 'Sunday 20:00 UTC is already Monday in Tashkent');
  equal(slotTime('2026-11-09', 3, '09:30', 1), '2026-11-11T07:30:00.000Z');
});

const QUIZ_MATERIAL = {
  schema: 'schood.material.v1', kind: 'quiz', title: 'Present simple quiz', level: 'A2', topic: 'Daily routines', instruction_language: 'uz',
  blocks: [{ id: 'b1', type: 'questions', instructions: 'Choose the correct answer.', questions: [
    { id: 'q1', type: 'single_choice', prompt: 'She ___ coffee every morning.', options: [{ id: 'A', text: 'drink' }, { id: 'B', text: 'drinks' }, { id: 'C', text: 'drinking' }, { id: 'D', text: 'drunk' }], answer: ['B'] },
    { id: 'q2', type: 'single_choice', prompt: 'They ___ to work by bus.', options: [{ id: 'A', text: 'go' }, { id: 'B', text: 'goes' }, { id: 'C', text: 'going' }, { id: 'D', text: 'gone' }], answer: ['A'] },
  ] }],
};

Deno.test('marketplace: list after Approve & run, Schood moderation, search, free copies, verified use, ratings; paid stays off', async () => {
  const f = teacherFixture();
  try {
    const seller = await personal(f, PRO);
    const original = await f.memory.repository.createGeneration({ workspaceId: seller, userId: ID.beta, feature: 'material.generate', status: 'approved', output: QUIZ_MATERIAL, input: { brief: { kind: 'quiz' }, plan: [] }, progress: { revision: 0 } });
    equal((await f.json('POST', 'teacher/market-list', { token: 'tok-teacher-plan', body: { id: original.id } })).body.code, 'plan_required', 'selling needs Teacher Pro or Centre');
    equal((await f.json('POST', 'teacher/market-list', { token: PRO, body: { id: original.id, price_uzs: 15000 } })).body.code, 'paid_listings_off', 'paid listings ship off');
    const proposed = await f.json('POST', 'teacher/market-list', { token: PRO, body: { id: original.id, description: 'Ten minutes of present simple.', tags: ['grammar', 'A2'] } });
    equal([proposed.body.action.kind, proposed.body.action.display.price], ['publish_listing', 'free']);
    const run = await f.json('POST', 'core/actions', { token: PRO, body: { id: proposed.body.action.id, decision: 'approve' } });
    equal(run.body.action.result.status, 'pending');
    const listingId = run.body.action.result.listing_id as string;
    equal((await f.json('GET', 'teacher/market', { token: 'tok-teacher-plan' })).body.listings, [], 'nothing shows before moderation');
    equal((await f.json('GET', 'teacher/market-moderation', { token: 'tok-teacher-plan' })).status, 404, 'Schood admins only');
    const queue = await f.json('GET', 'teacher/market-moderation', { token: 'tok-admin' });
    equal([queue.body.queue.length, queue.body.queue[0].checks.errors], [1, 0]);
    equal((await f.json('POST', 'teacher/market-moderation', { token: 'tok-admin', body: { id: listingId, decision: 'reject' } })).body.code, 'invalid_request', 'a rejection says why');
    equal((await f.json('POST', 'teacher/market-moderation', { token: 'tok-admin', body: { id: listingId, decision: 'publish' } })).body.listing.status, 'published');

    const found = await f.json('GET', 'teacher/market', { token: 'tok-teacher-plan', query: { q: 'present', price: 'free' } });
    equal(found.body.listings.map((listing: { id: string }) => listing.id), [listingId]);
    equal(found.body.paid_enabled, false);
    const page = await f.json('GET', 'teacher/market-listing', { token: 'tok-teacher-plan', query: { id: listingId } });
    ok(!JSON.stringify(page.body).includes('"answer"'), 'the listing page never shows the key');
    equal(page.body.listing.preview.questions, 2);

    equal((await f.json('POST', 'teacher/market-rate', { token: 'tok-teacher-plan', body: { id: listingId, stars: 5 } })).body.code, 'copy_required', 'only people with a copy rate it');
    const copy = await f.json('POST', 'teacher/market-acquire', { token: 'tok-teacher-plan', body: { id: listingId } });
    equal(copy.body.copy.created, true);
    equal((await f.json('POST', 'teacher/market-acquire', { token: 'tok-teacher-plan', body: { id: listingId } })).body.copy, { material_id: copy.body.copy.material_id, created: false });
    const library = await f.json('GET', 'teacher/materials', { token: 'tok-teacher-plan' });
    equal(library.body.materials.map((material: { source: string; status: string }) => [material.source, material.status]), [['marketplace', 'approved']]);
    // Verified use: the buyer plays it in class.
    equal((await f.json('POST', 'teacher/quiz', { token: 'tok-teacher-plan', body: { id: copy.body.copy.material_id } })).status, 200);
    await f.json('POST', 'teacher/export', { token: 'tok-teacher-plan', body: { id: copy.body.copy.material_id, to: 'print' } });
    equal((await f.json('POST', 'teacher/market-rate', { token: 'tok-teacher-plan', body: { id: listingId, stars: 4, comment: 'Works well with 9th grade.' } })).body.listing.rating, 4);
    const card = (await f.json('GET', 'teacher/market', { token: PRO })).body.listings[0];
    equal([card.verified_uses, card.copies, card.ratings], [1, 1, 1], 'one workspace used it: counted once');
    equal((await f.json('POST', 'teacher/market-acquire', { token: PRO, body: { id: listingId } })).body.code, 'own_listing');

    // Paid listings, once the owner switches them on: priced in UZS, but checkout is still the owner's decision.
    await f.memory.repository.updateSettings({ features: { marketplace_paid: true } }, ID.admin);
    const paid = await f.json('POST', 'teacher/market-list', { token: PRO, body: { id: original.id, price_uzs: 15000, title: 'Present simple quiz (pack)' } });
    equal(paid.body.action.display.price, '15000 UZS');
    const paidId = (await f.json('POST', 'core/actions', { token: PRO, body: { id: paid.body.action.id, decision: 'approve' } })).body.action.result.listing_id;
    await f.json('POST', 'teacher/market-moderation', { token: 'tok-admin', body: { id: paidId, decision: 'publish' } });
    equal((await f.json('POST', 'teacher/market-acquire', { token: 'tok-teacher-plan', body: { id: paidId } })).body.code, 'checkout_unavailable');
    const mine = await f.json('GET', 'teacher/market-mine', { token: PRO });
    equal([mine.body.listings.length, mine.body.ledger, mine.body.totals.commission_rate], [2, [], null], 'no sales without checkout; the commission is not decided');
    // A copy cannot be resold by whoever took it.
    const copied = await f.memory.repository.createGeneration({ workspaceId: seller, userId: ID.beta, feature: 'material.generate', status: 'approved', output: QUIZ_MATERIAL, input: { brief: { kind: 'quiz' }, plan: [], source: 'marketplace', listing_id: listingId }, progress: { revision: 0 } });
    equal((await f.json('POST', 'teacher/market-list', { token: PRO, body: { id: copied.id } })).body.code, 'not_original');
  } finally {
    f.reset();
  }
});

Deno.test('brand kit: only entered facts, consent before naming, invented numbers flagged', async () => {
  const f = teacherFixture();
  try {
    let data = '';
    f.setProvider(async (request) => {
      data = (await promptOf(request)).user;
      return reply({ text: 'Congratulations to Dilnoza on IELTS 7.5! Another student reached 6.5. 98% of my students pass. Join my course!', hashtags: ['ielts'] });
    });
    await personal(f, PRO);
    equal((await f.json('POST', 'teacher/brand-write', { token: PRO, body: { kind: 'results' } })).body.code, 'profile_required');
    await f.json('PUT', 'teacher/brand', { token: PRO, body: { display_name: 'Aziza Karimova', subjects: 'IELTS, General English', city: 'Tashkent', experience_years: 6 } });
    equal((await f.json('POST', 'teacher/brand-write', { token: PRO, body: { kind: 'results' } })).body.code, 'results_required', 'no results, no results post');
    equal((await f.json('POST', 'teacher/brand-results', { token: PRO, body: { student_label: 'X', exam: 'IELTS', score: '9', achieved_on: '2030-01-01' } })).body.code, 'invalid_request', 'no future results');
    await f.json('POST', 'teacher/brand-results', { token: PRO, body: { student_label: 'Dilnoza', consent: true, exam: 'IELTS Academic', score: '7.5', previous_score: '6.0', achieved_on: '2026-10-12' } });
    await f.json('POST', 'teacher/brand-results', { token: PRO, body: { student_label: 'Bekzod', consent: false, exam: 'IELTS Academic', score: '6.5', achieved_on: '2026-09-28' } });
    const out = await f.json('POST', 'teacher/brand-write', { token: PRO, body: { kind: 'results', language: 'uz' } });
    equal(out.status, 200, JSON.stringify(out.body));
    ok(data.includes('Dilnoza') && !data.includes('Bekzod') && data.includes('a student'), 'without consent a student is never named');
    equal(out.body.flags, { invented_numbers: ['98'] }, 'a number the tutor never entered is flagged');
    equal(out.body.credits, 3);
    equal((await f.json('POST', 'teacher/brand-write', { token: 'tok-teacher-plan', body: { kind: 'instagram' } })).body.code, 'plan_required', 'Teacher Pro');
  } finally {
    f.reset();
  }
  equal(inventedNumbers('Lessons cost 150 000 UZS for 12 lessons', { price: '150 000 UZS', lessons: 12 }), []);
  equal(inventedNumbers('Rated 4.9 by 300 families', { rating: null }), ['4.9', '300']);
});
