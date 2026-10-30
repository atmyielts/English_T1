import { approvedTest, centreFixture, createCentre, equal, ESSAY, ID, invite, ok, TEST } from './testing.ts';

// C5 placement tests: library pages approved by a teacher, keys that never leave
// the function, objective scoring, AI marks with checked evidence, the teacher's
// confirmed level and report; and the website placement widget (C14).

Deno.test('C5: tests are checked before saving, approved by a teacher, taken without the key, scored and reviewed', async () => {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'teacher', ['tok-t1']);
  await invite(f, ws, 'student', ['tok-s1']);
  const broken = structuredClone(TEST);
  broken.sections[0].items![0].answer = 5;
  (broken.sections[0].items![1] as { options: string[] }).options = ['went', 'went', 'go'];
  const refused = await f.json('POST', 'centre/placement-tests', { token: 'tok-t1', workspace: ws, body: { material: broken } });
  equal([refused.status, refused.body.code, refused.body.problems.length], [422, 'test_problems', 2], 'the key is checked');
  equal((await f.json('POST', 'centre/placement-tests', { token: 'tok-s1', workspace: ws, body: { material: TEST } })).status, 403, 'students do not author tests');
  const created = await f.json('POST', 'centre/placement-tests', { token: 'tok-t1', workspace: ws, body: { material: TEST } });
  equal((await f.json('GET', 'centre/placement-test', { token: 'tok-s1', workspace: ws, query: { id: created.body.page_id } })).status, 404, 'a draft cannot be taken');
  const page = await f.memory.repository.page(created.body.page_id);
  ok(page && page.kind === 'centre.placement_test' && page.body.includes('Answer key (staff only)') && page.visibility === 'workspace', 'a shared library page');
  await f.json('PATCH', 'centre/placement-tests', { token: 'tok-t1', workspace: ws, body: { id: created.body.page_id, expected_revision: created.body.revision, status: 'approved' } });
  const listed = await f.json('GET', 'centre/placement-tests', { workspace: ws });
  equal([listed.body.tests[0].status, listed.body.tests[0].attempts], ['approved', 0]);

  const view = await f.json('GET', 'centre/placement-test', { token: 'tok-s1', workspace: ws, query: { id: created.body.page_id } });
  ok(!JSON.stringify(view.body).includes('"answer"') && !JSON.stringify(view.body).includes('had known'), 'no key reaches the student');
  const started = await f.json('POST', 'centre/placement-start', { token: 'tok-s1', workspace: ws, body: { page_id: created.body.page_id } });
  const attempt = started.body.attempt.id;
  await f.json('POST', 'centre/placement-answer', { token: 'tok-s1', workspace: ws, body: { attempt_id: attempt, answers: { q1: 1, q2: 1, q3: 0, q4: ' Had known.', writing: ESSAY, injected: 'x' } } });
  const submitted = await f.json('POST', 'centre/placement-submit', { token: 'tok-s1', workspace: ws, body: { attempt_id: attempt } });
  equal([submitted.body.attempt.status, submitted.body.attempt.level, submitted.body.attempt.objective], ['submitted', null, null], 'the student does not see the level before review');
  const staffView = await f.json('GET', 'centre/placement-attempts', { token: 'tok-t1', workspace: ws, query: { id: attempt } });
  equal([staffView.body.attempt.objective.correct, staffView.body.attempt.objective.total, staffView.body.attempt.level], [3, 4, 'b1'], '75% → B1 by the cut scores; the gap answer is normalised');
  ok(!('injected' in staffView.body.attempt.answers), 'only the test’s own answers are kept');
  equal((await f.json('POST', 'centre/placement-answer', { token: 'tok-s1', workspace: ws, body: { attempt_id: attempt, answers: { q3: 1 } } })).body.code, 'attempt_closed');
  await f.settle();
  ok(f.memory.learning.some((event) => event.kind === 'mock_finished' && event.feature === 'C5' && event.score === 75 && event.outcome === 'level_b1'), 'a verified learning event');

  f.model(/Mark placement-test answers/, { sections: [{ id: 'writing', level: 'a2', criteria: [{ name: 'Grammar', score: 2, note: 'Agreement errors.' }, { name: 'Vocabulary', score: 3, note: 'Adequate.' }], evidence: ['The old buildings is very big', 'it make me feel proud', 'invented quote not in the essay'], comment: 'Clear ideas, frequent agreement errors.', top_fixes: ['Subject-verb agreement', 'Use linking words', 'Vary adjectives'] }] });
  equal((await f.json('POST', 'centre/placement-mark', { token: 'tok-s1', workspace: ws, body: { attempt_id: attempt } })).status, 403, 'students do not mark');
  const marked = await f.json('POST', 'centre/placement-mark', { token: 'tok-t1', workspace: ws, body: { attempt_id: attempt } });
  const writing = marked.body.attempt.ai_marks.writing;
  equal([marked.body.credits, writing.level, writing.evidence.length, writing.evidence_checked], [4, 'a2', 2, false], 'evidence not in the answer is dropped');
  const reviewed = await f.json('POST', 'centre/placement-review', { token: 'tok-t1', workspace: ws, body: { attempt_id: attempt, level: 'a2', note: 'Strong grammar test, weaker writing: start in A2+.' } });
  equal([reviewed.body.attempt.status, reviewed.body.attempt.report.level_label, reviewed.body.attempt.report.objective.suggested], ['reviewed', 'A2', 'b1'], 'the teacher’s level wins; the AI and score stay visible');
  const mine = await f.json('GET', 'centre/placement-attempts', { token: 'tok-s1', workspace: ws, query: { id: attempt } });
  equal([mine.body.attempt.report.level, mine.body.key], ['a2', null], 'the student sees the report, never the key');
  const walkIn = await f.json('POST', 'centre/placement-start', { token: 'tok-t1', workspace: ws, body: { page_id: created.body.page_id, prospect: { name: 'Walk-in Sardor', phone: '+998901112244' } } });
  equal([walkIn.body.attempt.channel, walkIn.body.attempt.prospect.name], ['staff', 'Walk-in Sardor'], 'staff test a walk-in prospect');
  equal((await f.json('POST', 'centre/placement-start', { token: 'tok-s1', workspace: ws, body: { page_id: created.body.page_id, prospect: { name: 'X' } } })).status, 403);
  void ID;
});

Deno.test('C5 AI draft: written per level in the teacher material model, broken keys left out, solved without the key, saved as a draft', async () => {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'teacher', ['tok-t1']);
  await invite(f, ws, 'student', ['tok-s1']);
  // One question set per level; one item in each has a broken key (two options are the same).
  f.model(/placement-test items in English at CEFR/, (call) => {
    const level = /at CEFR ([A-Z0-9-]+)/.exec(call.system)?.[1] ?? 'A1';
    return { sets: [{ instructions: 'Choose the best answer.', level, questions: [
      { type: 'single_choice', prompt: `${level}: She ____ to school every day.`, options: [{ id: 'A', text: 'go' }, { id: 'B', text: 'goes' }, { id: 'C', text: 'going' }, { id: 'D', text: 'gone' }], answer: ['B'] },
      { type: 'single_choice', prompt: `${level}: I have lived here ____ 2019.`, options: [{ id: 'A', text: 'for' }, { id: 'B', text: 'since' }, { id: 'C', text: 'from' }, { id: 'D', text: 'at' }], answer: ['B'] },
      { type: 'gap', prompt: `${level}: If I ____ (know), I would have told you.`, answer: ['had known'] },
      { type: 'single_choice', prompt: `${level}: Pick one.`, options: [{ id: 'A', text: 'same' }, { id: 'B', text: 'same' }, { id: 'C', text: 'other' }, { id: 'D', text: 'else' }], answer: ['A'] },
    ] }] };
  });
  f.model(/one short writing task/, { writing: { prompt: 'Write about your favourite place in your city and why you like it.', min_words: 80 } });
  // The solver agrees with every key except the A2 "since" item.
  f.model(/You are an independent checker/, (call) => {
    ok(call.system.includes('have not seen any answer key') && call.last.includes('Answer every question yourself'), 'the shared solver prompt');
    const asked = JSON.parse(/<schood_data[^>]*>([\s\S]*)<\/schood_data>/.exec(call.last)?.[1] ?? '{"questions":[]}') as { questions: { id: string; prompt: string; type: string }[] };
    return { answers: asked.questions.map((question) => ({ id: question.id, answer: question.type === 'gap' ? ['had known'] : question.prompt.includes('A2: I have lived') ? ['A'] : question.prompt.includes('lived') ? ['B'] : ['B'], ...(question.prompt.includes('A2: I have lived') ? { reason: 'Both could fit.' } : {}) })) };
  });

  equal((await f.json('POST', 'centre/placement-generate', { token: 'tok-s1', workspace: ws, body: { from_level: 'a1', to_level: 'b1' } })).status, 403, 'students cannot draft tests');
  equal((await f.json('POST', 'centre/placement-generate', { token: 'tok-t1', workspace: ws, body: { from_level: 'b2', to_level: 'a1' } })).body.field, 'to_level');
  const drafted = await f.json('POST', 'centre/placement-generate', { token: 'tok-t1', workspace: ws, body: { from_level: 'a1', to_level: 'b1', per_level: 4, writing: true } });
  equal(drafted.status, 200, JSON.stringify(drafted.body));
  const test = drafted.body.test as { sections: { id: string; kind: string; items?: { id: string; level: string }[] }[]; bands: { level: string; min_percent: number }[] };
  equal(test.sections.map((sec) => [sec.id, sec.items?.length ?? 0]), [['level-a1', 3], ['level-a2', 3], ['level-b1', 3], ['writing', 0]], 'a section per level, broken keys left out, the writing task');
  equal(test.bands, [{ level: 'a1', min_percent: 0 }, { level: 'a2', min_percent: 33 }, { level: 'b1', min_percent: 67 }], 'even cut scores for the teacher to adjust');
  equal([drafted.body.review.dropped, drafted.body.review.asked, drafted.body.review.agreed], [3, 9, 8], 'three left out; the solver answered all nine');
  equal(drafted.body.review.disagreements, [{ item: 'a2-2', key: 'B', solver: 'A', reason: 'Both could fit.' }], 'the disagreement is on the review list');
  equal(f.memory.ledger.filter((row) => row.kind === 'charge' && row.creditKey === 'placement.generate').length, 1, 'one 15-credit charge for the whole draft');
  const page = await f.memory.repository.page(drafted.body.page_id);
  ok(page && page.status === 'draft' && page.kind === 'centre.placement_test' && page.sourceGenerationId, 'saved as a draft page from a generation job');
  equal((await f.json('GET', 'centre/placement-test', { token: 'tok-s1', workspace: ws, query: { id: drafted.body.page_id } })).status, 404, 'nobody can take it before approval');
  equal((await f.json('GET', 'centre/placement-draft-review', { token: 'tok-t1', workspace: ws, query: { id: drafted.body.page_id } })).body.review.disagreements.length, 1, 'the review list stays with the draft');

  // Every model reply is broken: nothing is saved and the credits come back.
  f.model(/placement-test items in English at CEFR/, { sets: [{ instructions: 'x', questions: [{ type: 'single_choice', prompt: 'Pick.', options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'a' }], answer: ['A'] }] }] });
  const before = (await f.json('GET', 'centre/placement-tests', { token: 'tok-t1', workspace: ws })).body.tests.length;
  const failed = await f.json('POST', 'centre/placement-generate', { token: 'tok-t1', workspace: ws, body: { from_level: 'a1', to_level: 'a2' } });
  equal([failed.status, failed.body.code], [502, 'ai_failed']);
  equal((await f.json('GET', 'centre/placement-tests', { token: 'tok-t1', workspace: ws })).body.tests.length, before, 'no page for a failed draft');
  ok(f.memory.ledger.some((row) => row.kind === 'refund' && row.creditKey === 'placement.generate'), 'refunded');
});

Deno.test('C14 placement widget: allowed websites only, a session per taker, an estimate and a teacher check', async () => {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'teacher', ['tok-t1']);
  const page = await approvedTest(f, ws);
  equal((await f.json('PATCH', 'centre/embed', { workspace: ws, body: { embed_domains: ['http://registan.uz'] } })).status, 400, 'https only');
  equal((await f.json('PATCH', 'centre/embed', { workspace: ws, body: { embed_domains: ['https://ai.schood.online'] } })).status, 400, 'not Schood’s own domain');
  const saved = await f.json('PATCH', 'centre/embed', { workspace: ws, body: { embed_domains: ['https://registan.uz'], widgets: { placement: true, placement_page_id: page }, white_label: { avatar_url: 'https://registan.uz/bot.png' } } });
  equal([saved.status, saved.body.embed.widgets.placement], [200, true]);
  ok(saved.body.embed.snippet.includes('https://ai.schood.online/embed/widget.js') && saved.body.embed.snippet.includes(saved.body.embed.public_key), 'a snippet for the website');
  const key = saved.body.embed.public_key;
  const call = (path: string, body: Record<string, unknown>, site = 'https://registan.uz') => f.anonymous('POST', `centre/embed-${path}`, { body: { key, site, ...body } });
  equal((await call('placement', { session: 'abcdefghijklmnop1234', step: 'start' }, 'https://evil.example')).status, 403, 'other websites are refused');
  const config = await f.anonymous('GET', `centre/embed-config?key=${key}&site=${encodeURIComponent('https://registan.uz')}&lang=ru`);
  equal([config.status, config.headers.get('access-control-allow-origin'), config.body.widgets.placement, config.body.placement.questions, config.body.avatar_url], [200, 'https://ai.schood.online', true, 4, 'https://registan.uz/bot.png'], 'config for the allowed site');
  const session = 'widget-session-0123456789';
  const started = await call('placement', { session, step: 'start', name: 'Laylo', phone: '+998 91 222 33 44' });
  ok(started.status === 200 && !JSON.stringify(started.body).includes('had known'), 'test without the key');
  equal((await call('placement', { session: 'another-session-0123456789', step: 'answer', attempt_id: started.body.attempt_id, answers: { q1: 1 } })).status, 404, 'another session cannot touch the attempt');
  await call('placement', { session, step: 'answer', attempt_id: started.body.attempt_id, answers: { q1: 1, q2: 1, q3: 1, q4: 'had known', writing: ESSAY } });
  f.model(/Mark placement-test answers/, { sections: [{ id: 'writing', level: 'b1', criteria: [{ name: 'Grammar', score: 3, note: 'ok' }], evidence: ['Registan square'], comment: 'Clear and well organised.', top_fixes: [] }] });
  const result = await call('placement', { session, step: 'submit', attempt_id: started.body.attempt_id });
  equal([result.body.level, result.body.percent, result.body.marked], ['b2', 100, true], 'an estimate, with AI marks for the teacher');
  const [attempt] = await f.store.table('attempts').list({ workspace_id: ws, channel: 'widget' });
  equal([attempt.prospect.name, attempt.status, attempt.ai_marks?.writing !== undefined], ['Laylo', 'marked', true], 'waits for a teacher to confirm');
  equal(f.memory.ledger.filter((row) => row.kind === 'charge' && row.creditKey === 'placement.mark').length, 1, 'marking is charged to the centre pool');
});
