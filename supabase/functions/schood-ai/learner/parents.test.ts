import { equal, ID, KID, learnerFixture, ok } from './testkit.ts';

// Plus Family (link, accept, unlink, Plus for children), P1 and P2, the L14 daily
// brief with the notification budget, and Schood AI in the student bot.

const BRIEF = {
  based_on: 'Present simple and travel words.',
  questions: [0, 1, 2].map((n) => ({ prompt: `She ___ to work every day (${n}).`, options: ['go', 'goes', 'going'], answer_index: 1, explanation: 'He/she/it + -s.' })),
  word: { word: 'itinerary', meaning_en: 'a travel plan', meaning_uz: 'sayohat rejasi', meaning_ru: 'маршрут', example: 'Our itinerary includes Bukhara.' },
  tip: 'Read your answers aloud once.',
};

Deno.test('Plus Family: invite, accept, up to 3 children with Plus, unlink removes it', async () => {
  const f = learnerFixture();
  equal((await f.json('POST', 'learner/family-invite', { token: 'tok-plus', body: { child_label: 'Kid', consent: true } })).body.code, 'plan_required', 'Plus alone is not Family');
  equal((await f.json('POST', 'learner/family-invite', { token: 'tok-family', body: { child_label: 'Aziza' } })).body.code, 'consent_required');
  const invite = await f.json('POST', 'learner/family-invite', { token: 'tok-family', body: { child_label: 'Aziza', consent: true } });
  ok(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/.test(invite.body.invite.code), 'a one-time code');
  ok(![...f.learner.links.values()].some((link) => JSON.stringify(link).includes(invite.body.invite.code.replace('-', ''))), 'only its hash is stored');
  equal((await f.json('GET', 'core/me', { token: 'tok-child' })).body.plan.plans, []);
  equal((await f.json('POST', 'learner/family-accept', { token: 'tok-family', body: { code: invite.body.invite.code } })).body.code, 'invite_own_invite');
  const accepted = await f.json('POST', 'learner/family-accept', { token: 'tok-child', body: { code: invite.body.invite.code.toLowerCase() } });
  equal([accepted.status, accepted.body.linked.parent], [200, 'Nodira']);
  equal((await f.json('POST', 'learner/family-accept', { token: 'tok-child2', body: { code: invite.body.invite.code } })).body.code, 'invite_not_found', 'used once');
  const child = await f.json('GET', 'core/me', { token: 'tok-child' });
  equal([child.body.plan.plans, child.body.credits.total], [['plus'], 1500], 'the child has Plus with its own credits');
  // Under 13 with a linked parent passes the consent step.
  equal((await f.json('POST', 'learner/consent', { token: 'tok-child', body: { age_band: 'under_13', accept: true } })).body.consent.state, 'ok');
  for (const token of ['tok-child2', 'tok-child3']) {
    const next = await f.json('POST', 'learner/family-invite', { token: 'tok-family', body: { child_label: token, consent: true } });
    equal((await f.json('POST', 'learner/family-accept', { token, body: { code: next.body.invite.code } })).status, 200);
  }
  equal((await f.json('POST', 'learner/family-invite', { token: 'tok-family', body: { child_label: 'Fourth', consent: true } })).body.code, 'family_limit');
  const family = await f.json('GET', 'learner/family', { token: 'tok-family' });
  equal(family.body.children.map((c: { name: string; status: string }) => [c.name, c.status]), [['Aziza', 'active'], ['Bobur', 'active'], [null, 'active']]);
  equal((await f.json('GET', 'learner/family', { token: 'tok-child' })).body.parents.map((p: { name: string }) => p.name), ['Nodira'], 'the child sees who sees their progress');
  const linkId = family.body.children[0].id;
  equal((await f.json('DELETE', 'learner/family-link', { token: 'tok-child4', body: { id: linkId } })).status, 404, 'strangers cannot unlink');
  equal((await f.json('DELETE', 'learner/family-link', { token: 'tok-child', body: { id: linkId } })).body.unlinked, true, 'the child can unlink');
  equal((await f.json('GET', 'core/me', { token: 'tok-child' })).body.plan.plans, []);
  equal((await f.json('GET', 'learner/consent', { token: 'tok-child' })).body.consent.state, 'parent_link_required', 'the guardian link went with it');
});

Deno.test('P1 and P2 answer only about the parent\'s own linked child, only from that child\'s data', async () => {
  const f = learnerFixture({ seed: { outcomes: { [KID.child]: [{ name: 'IELTS Simulator', band: '6.0', score: 6, date: '2026-10-28' }] } } });
  const invite = await f.json('POST', 'learner/family-invite', { token: 'tok-family', body: { child_label: 'Aziza', consent: true } });
  await f.json('POST', 'learner/family-accept', { token: 'tok-child', body: { code: invite.body.invite.code } });
  f.reply({ effort: 'No practice in Schood AI this week.', progress: 'Her last IELTS mock was 6.0.', praise: 'She finished a full mock.', watch: 'Regular practice.', suggestion: 'Ask her to try the daily brief.' });
  const first = await f.json('POST', 'learner/parent-brief', { token: 'tok-family', body: {} });
  const brief = first.body.briefs[0];
  equal([brief.credits, brief.stats.minutes_7d, brief.exams[0].band], [1, 0, '6.0'], 'numbers are counted, not written by the model');
  await f.json('POST', 'learner/consent', { token: 'tok-child', body: { age_band: '13_17', accept: true } });
  f.reply({ title: 'Parks', text: 'Tashkent has many green parks and gardens. '.repeat(8), questions: [1, 2, 3].map(() => ({ prompt: 'Which is right?', options: ['a', 'b', 'c'], answer_index: 0, explanation: '' })), words: [] });
  const reading = await f.json('POST', 'learner/reading', { token: 'tok-child', body: { topic: 'parks', level: 'A2' } });
  await f.json('POST', 'learner/reading-check', { token: 'tok-child', body: { id: reading.body.reading.id, answers: [0, 0, 1] } });
  await f.settle();
  const data = f.learner.allActivity.filter((row) => row.userId === KID.child).length;
  ok(data >= 2, 'the child practised');
  const before = await f.balance('tok-family');
  equal((await f.json('POST', 'learner/parent-brief', { token: 'tok-family', body: {} })).body.briefs[0].credits, 0, 'one brief per child per week, reused');
  ok(f.upstream.length === 2, 'the brief and the reading called the model, the reuse did not');
  f.reply('Aziza practised reading on 1 day this week and scored 2 of 3. Her last IELTS mock was 6.0. More results would show if she is ready.');
  const ask = await f.json('POST', 'learner/parent-ask', { token: 'tok-family', body: { child_id: KID.child, question: 'Is she ready for the March exam?' } });
  equal([ask.status, ask.body.credits, before - await f.balance('tok-family')], [200, 1, 1]);
  const prompt = await f.prompt();
  ok(prompt.includes('IELTS Simulator') && prompt.includes('Answer only about this child'), 'the child\'s data and the rule');
  ok(!prompt.includes('Tashkent has many green parks'), 'never the child\'s texts');
  equal((await f.json('POST', 'learner/parent-ask', { token: 'tok-family', body: { child_id: KID.child2, question: 'And Bobur?' } })).status, 404, 'not my child');
  equal((await f.json('POST', 'learner/parent-ask', { token: 'tok-plus', body: { child_id: KID.child, question: 'x' } })).body.code, 'plan_required');
  // A centre parent needs the centre to switch parent features on.
  const centre = f.memory.seed.centre({ name: 'Registan', ownerId: ID.owner });
  f.memory.seed.member(centre.id, ID.parent, 'parent');
  equal((await f.json('POST', 'learner/family-invite', { token: 'tok-parent', query: { workspace_id: centre.id }, body: { child_label: 'Son', consent: true } })).body.code, 'centre_parent_off');
});

Deno.test('L14 daily brief: Telegram linked, sent within the notification budget, charged once a day, answered in the chat', async () => {
  const f = learnerFixture();
  await f.adult();
  equal((await f.json('PUT', 'learner/brief', { token: 'tok-beta', body: { enabled: true, time: '08:30' } })).body.code, 'consent_required');
  await f.adult('tok-beta');
  equal((await f.json('PUT', 'learner/brief', { token: 'tok-beta', body: { enabled: true, time: '08:30' } })).body.code, 'telegram_not_linked');
  equal((await f.json('PUT', 'learner/brief', { body: { enabled: true, time: '23:00' } })).body.code, 'quiet_hours');
  const on = await f.json('PUT', 'learner/brief', { body: { enabled: true, time: '08:30' } });
  equal(on.body.schedule.next_at, '2026-11-03T03:30:00.000Z', 'tomorrow 08:30 in Tashkent');
  equal(f.learner.allRecords.size, 0);
  // Yesterday's mistakes feed the brief.
  f.reply({ correct_answer: 'goes', why_wrong: 'Third person.', rule: 'he/she/it + -s', tip: 't', similar: [] });
  await f.json('POST', 'learner/explain', { body: { question: 'She ___ every day.', my_answer: 'go' } });
  await f.settle();
  f.reply(BRIEF);
  const due = await f.worker('learner/telegram-brief', ID.plus, '700100', { kind: 'daily' });
  equal([due.status, due.body.status, due.body.messages.length], [200, 'ready', 2]);
  ok((await f.prompt()).includes('he/she/it + -s'), 'built from yesterday\'s mistakes');
  ok(due.body.messages[1].buttons[1][0].callback_data.startsWith(`aib:${due.body.ids[0]}:0:1`), 'answer buttons');
  const again = await f.worker('learner/telegram-brief', ID.plus, '700100', { kind: 'daily' });
  equal([again.body.status, again.body.ids, f.upstream.length], ['ready', due.body.ids, 2], 'the same brief, not a second charge');
  await f.worker('learner/brief-sent', ID.plus, '700100', { kind: 'daily', ids: due.body.ids });
  equal((await f.json('GET', 'learner/brief')).body.schedule.next_at, '2026-11-03T03:30:00.000Z');
  const tap = await f.worker('learner/telegram', ID.plus, '700100', { kind: 'callback', data: `aib:${due.body.ids[0]}:0:1`, update_id: 9 });
  equal([tap.body.handled, tap.body.toast, tap.body.messages[0].text.includes('Question 2/3')], [true, 'Correct!', true]);
  const repeat = await f.worker('learner/telegram', ID.plus, '700100', { kind: 'callback', data: `aib:${due.body.ids[0]}:0:0`, update_id: 10 });
  equal([repeat.body.edit, repeat.body.messages], [null, []], 'the first answer stands');
  await f.settle();
  ok(f.events().some((event) => event.kind === 'check_passed' && event.source === 'telegram'), 'a verified event from Telegram');
  // Quiet hours: nothing generated, nothing charged, retried in the morning.
  f.setClock('2026-11-03T18:30:00Z');
  const credits = await f.balance();
  const night = await f.worker('learner/telegram-brief', ID.plus, '700100', { kind: 'daily' });
  equal([night.body.status, await f.balance()], ['later', credits]);
  const schedule = await f.learner.schedule(ID.plus, 'daily');
  equal(schedule!.nextDueAt, '2026-11-04T03:30:00.000Z');
});

Deno.test('the student bot: /ai tutor with consent, threads, refusals as messages, parents and duels', async () => {
  const f = learnerFixture();
  const noConsent = await f.worker('learner/telegram', ID.plus, '700100', { kind: 'command', command: '/ai', args: 'What is a gerund?', update_id: 1 });
  ok(noConsent.body.messages[0].text.includes('confirm your age'), 'the consent step points to the web');
  await f.adult();
  const ask = await f.worker('learner/telegram', ID.plus, '700100', { kind: 'command', command: '/ai', args: '', update_id: 2 });
  equal([ask.body.messages[0].force_reply, ask.body.messages[0].text.startsWith('<b>Schood AI</b>')], [true, true]);
  f.reply('A **gerund** is a verb + -ing used as a noun: *Swimming* is fun.');
  const answer = await f.worker('learner/telegram', ID.plus, '700100', { kind: 'command', command: '/ai', args: 'What is a gerund?', update_id: 3 });
  ok(answer.body.messages[0].text.includes('<b>gerund</b>') && answer.body.messages[0].text.startsWith('<b>Schood AI</b>'), 'Telegram HTML with the mark');
  f.reply('Yes: "I enjoy reading."');
  await f.worker('learner/telegram', ID.plus, '700100', { kind: 'reply', text: 'Give me an example', update_id: 4 });
  const threads = [...f.memory.threads.values()].filter((thread) => thread.userId === ID.plus);
  equal([threads.length, threads[0].specialistKey, [...f.memory.messages.values()].filter((m) => m.threadId === threads[0].id).length], [1, 'tutor', 4], 'one tutor thread, shared with the web');
  ok((await f.prompt()).includes('What is a gerund?'), 'the reply continues the conversation');
  equal((await f.worker('learner/explain', ID.plus, '700100', { question: 'x' })).body.code, 'service_not_allowed', 'only service routes take the worker');
  equal((await f.worker('learner/telegram', ID.plus, '999', { kind: 'command', command: '/ai', args: 'x', update_id: 5 })).body.code, 'user_not_linked');
  equal((await f.json('POST', 'learner/telegram', { body: { kind: 'command', command: '/ai', update_id: 1 } })).body.code, 'service_only');
  const free = await f.worker('learner/telegram', ID.student, '700200', { kind: 'command', command: '/ai', args: 'Hi', update_id: 6 });
  ok(free.body.messages[0].text.includes('needs a Schood AI plan') && free.body.messages[0].buttons[0][0].url.endsWith('/plans'), 'the paywall as a message');
  // Parents.
  const invite = await f.json('POST', 'learner/family-invite', { token: 'tok-family', body: { child_label: 'Aziza', consent: true } });
  equal((await f.worker('learner/telegram', KID.family, '700300', { kind: 'command', command: '/child', args: '', update_id: 7 })).body.messages[0].text.includes('No linked children'), true);
  await f.json('POST', 'learner/family-accept', { token: 'tok-child', body: { code: invite.body.invite.code } });
  f.reply('Aziza has no Schood activity yet, so I cannot say how ready she is. A mock test would tell you more.');
  const p2 = await f.worker('learner/telegram', KID.family, '700300', { kind: 'command', command: '/child', args: 'Is she ready?', update_id: 8 }, 'ru');
  ok(p2.body.messages[0].text.includes('<b>Aziza</b>'), 'one child: no number needed');
  ok((await f.prompt()).includes('Russian'), 'the parent\'s language');
  // Duels by link.
  const q = (n: number) => ({ prompt: `Choose the opposite of word number ${n}`, options: [`a${n}`, `b${n}`, `c${n}`, `d${n}`], answer_index: 2 });
  f.reply({ questions: Array.from({ length: 10 }, (_, n) => q(n)) });
  const duel = await f.worker('learner/telegram', ID.plus, '700100', { kind: 'command', command: '/aiduel', args: 'opposites', update_id: 11 });
  ok(duel.body.messages[0].buttons[1][0].url.includes('start=duel_') && duel.body.messages[0].text.includes('ai.schood.online/duel/'), 'a share link and the bot link');
});
