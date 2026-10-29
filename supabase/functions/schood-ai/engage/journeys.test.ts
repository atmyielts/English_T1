import { completion, equal, ID, ok } from '../fixture.test.ts';
import type { LearningEventInput } from '../types.ts';
import { journeyByKey } from './content/journeys.ts';
import { b64, DAY, engageFixture, WEBM } from './test-helpers.ts';

// Journeys (E1), the lifetime path (E2), the Skill Passport (E3), then vs now (E7)
// and story mode (E8), end to end over the memory repository and a fake model.

/** Verified events that satisfy every tracked task of a journey chapter. */
function eventsFor(journeyKey: string, chapter: number): { events: LearningEventInput[]; voice: number; writing: number } {
  const journey = journeyByKey(journeyKey)!;
  const events: LearningEventInput[] = [];
  let voice = 0, writing = 0;
  for (const task of journey.chapters[chapter - 1].tasks) {
    if (!task.match) continue;
    if (task.match.sample === 'voice') { voice += task.count; continue; }
    if (task.match.sample === 'writing') { writing += task.count; continue; }
    for (let i = 0; i < task.count; i++) {
      if (task.match.arc) events.push({ kind: 'check_passed', area: 'engage', feature: 'E8', skill: 'english.reading.story', verified_minutes: 5, ref: `story:${task.match.arc}:x${chapter}${i}` });
      else events.push({ kind: (task.match.kinds ?? ['turn_scored'])[0], area: 'coach', feature: task.match.features[0], skill: `${task.match.skill ?? 'x.y'}.node`, verified_minutes: 1, score: 7 });
    }
  }
  return { events, voice, writing };
}

Deno.test('E1 + E2: a journey advances chapter by chapter on verified learning, graduates, and the next goal is ready', async () => {
  const f = engageFixture();
  equal((await f.post('journey-start', { journey: 'speaking_60' })).status, 200);
  let view = (await f.get('journey', 'tok-plus', { key: 'speaking_60' })).body;
  equal([view.mine.chapter, view.mine.completed], [1, 0]);
  // Opening the chapter again and again does nothing.
  for (let i = 0; i < 3; i++) await f.get('journey', 'tok-plus', { key: 'speaking_60' });
  equal((await f.get('journey', 'tok-plus', { key: 'speaking_60' })).body.mine.chapter, 1);

  for (let chapter = 1; chapter <= 9; chapter++) {
    f.advance(60_000);
    const { events, voice, writing } = eventsFor('speaking_60', chapter);
    if (events.length) await f.learn('tok-plus', events);
    for (let i = 0; i < voice; i++) equal((await f.post('sample-voice', { audio_base64: b64(WEBM), mime: 'audio/webm', duration_ms: 20_000, transcript: 'I like my city because it is green and calm', prompt_key: 'day' })).status, 200);
    for (let i = 0; i < writing; i++) await f.post('sample-writing', { text: 'My first essay is about the city where I was born and why I love it so much.' });
    view = (await f.get('journey', 'tok-plus', { key: 'speaking_60' })).body;
    if (chapter < 9) equal(view.mine.completed, chapter, `chapter ${chapter} closes`);
  }
  equal(view.mine.graduated, true);
  equal(view.mine.status, 'graduated');
  const path = (await f.get('path')).body;
  const goal = (key: string) => path.goals.find((entry: { key: string }) => entry.key === key);
  equal([goal('speaking_confidence').status, goal('speaking_confidence').verified], ['done', true], 'closed by the graduation, so verified');
  equal(goal('ielts').status, 'ready', 'the next goal on the path is ready');
  equal(path.next, 'ielts');
  equal(path.offer, null, 'no pricing source, no offer: engage never invents a price');
  const passport = (await f.get('passport')).body;
  ok(passport.items.some((item: { kind: string; verified: boolean; shown: boolean }) => item.kind === 'journey' && item.verified && !item.shown), 'the graduation is in the Passport, hidden until chosen');
});

Deno.test('E2: a verified outcome closes its goal; the person’s own word closes it unverified', async () => {
  const f = engageFixture();
  await f.post('path-goal', { goal: 'ielts', action: 'start' });
  await f.learn('tok-plus', [{ kind: 'outcome_recorded', area: 'coach', feature: 'B1', skill: 'ielts.overall', score: 7, outcome: 'band_7_0' }]);
  let path = (await f.get('path')).body;
  const goal = (key: string) => path.goals.find((entry: { key: string }) => entry.key === key);
  equal([goal('ielts').status, goal('ielts').done_by], ['done', 'outcome']);
  equal(goal('uni_essays').status, 'ready');
  path = (await f.post('path-goal', { goal: 'uni_essays', action: 'done', result: 'Admitted' })).body;
  equal([goal('uni_essays').status, goal('uni_essays').verified], ['done', false], 'self-reported is never shown as verified');
  equal(goal('visa_interview').status, 'ready');
});

Deno.test('E3: the Passport is private by default; a link shows only chosen items and can be revoked', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', [{ kind: 'mock_finished', area: 'coach', feature: 'B1', skill: 'ielts.mock', verified_minutes: 30, score: 6.5 }, { kind: 'outcome_recorded', area: 'coach', feature: 'B4', skill: 'sales.level', score: 80, outcome: 'passed' }]);
  let own = (await f.get('passport')).body;
  equal(own.items.length, 2);
  ok(own.items.every((item: { shown: boolean }) => !item.shown), 'nothing is shown until the person chooses');
  equal((await f.post('passport-link', { label: 'Employer', item_ids: own.items.map((item: { id: string }) => item.id) })).body.code, 'nothing_to_share', 'hidden items cannot be shared');
  const [first, second] = own.items;
  await f.post('passport-item', { id: first.id, shown: true });
  await f.post('passport-item', { id: second.id, shown: true });
  const created = (await f.post('passport-link', { label: 'Employer', item_ids: [first.id], expires_in_days: 30 })).body;
  ok(/^[A-Za-z0-9_-]{43}$/.test(created.token) && created.url.endsWith(`/p/${created.token}`), 'a long random token, shown once');
  const memory = await f.store();
  ok(!(await memory.passportLinks(ID.plus)).some((link) => link.tokenHash === created.token), 'only the hash is stored');

  const viewed = await f.get('passport-view', 'tok-outsider', { token: created.token });
  equal(viewed.status, 200);
  equal(viewed.body.items.length, 1, 'only the item the link was made with');
  ok(!JSON.stringify(viewed.body).includes(ID.plus) && !JSON.stringify(viewed.body).includes('@'), 'no id and no email');
  equal(viewed.body.passport.display_name, 'Dilnoza', 'first name only when no name was chosen');
  equal((await f.post('passport-link-revoke', { id: created.link.id })).status, 200);
  const revoked = await f.get('passport-view', 'tok-outsider', { token: created.token });
  equal([revoked.status, revoked.body.code], [410, 'link_revoked']);
  equal((await f.get('passport-view', 'tok-outsider', { token: 'x'.repeat(43) })).status, 404);
  own = (await f.get('passport')).body;
  equal(own.links[0].revoked, true);
});

Deno.test('E7: day-1 voice next to today’s, private to the owner or a Passport link that includes it', async () => {
  const f = engageFixture();
  equal((await f.post('sample-voice', { audio_base64: b64(new TextEncoder().encode('not audio at all, plain text')), mime: 'audio/webm', duration_ms: 20_000 })).body.code, 'invalid_request', 'only real audio');
  const first = (await f.post('sample-voice', { audio_base64: b64(WEBM), mime: 'audio/webm', duration_ms: 30_000, transcript: 'um my name is Dilnoza and uh I live in Tashkent' })).body;
  f.advance(60 * DAY);
  const latest = (await f.post('sample-voice', { audio_base64: b64(WEBM), mime: 'audio/webm', duration_ms: 30_000, transcript: 'My name is Dilnoza, I live in Tashkent and I study international relations at university' })).body;
  equal(latest.voice.days_between, 60);
  ok(latest.voice.first.url.startsWith('data:audio/webm;base64,') && latest.voice.latest.url, 'both play for the owner');
  ok(latest.voice.latest.metrics.words_per_minute > latest.voice.first.metrics.words_per_minute, 'measured numbers show the change');
  ok(latest.voice.first.metrics.filler_per_100 > latest.voice.latest.metrics.filler_per_100, 'fewer fillers');
  equal((await f.get('sample-audio', 'tok-outsider', { id: first.id })).status, 404, 'nobody else can play it');
  // Shared through the owner's own Passport link only.
  await f.post('passport-item', { sample_id: first.id, shown: true });
  const own = (await f.get('passport')).body;
  const item = own.samples.find((sample: { id: string }) => sample.id === first.id).item_id;
  const link = (await f.post('passport-link', { label: 'Tutor', item_ids: [item] })).body;
  equal((await f.get('sample-audio', 'tok-outsider', { id: first.id, link: link.token })).status, 200);
  equal((await f.get('sample-audio', 'tok-outsider', { id: latest.id, link: link.token })).status, 404, 'not a sample the link includes');
  await f.post('sample-delete', { id: first.id });
  equal((await f.get('sample-audio', 'tok-outsider', { id: first.id, link: link.token })).status, 404, 'a deleted sample leaves every link');
});

Deno.test('E8: one episode a day; a passed check is one verified event; the cliffhanger comes after passing', async () => {
  const f = engageFixture();
  const opened = (await f.get('story', 'tok-plus', { arc: 'tashkent_lights' })).body.episode;
  equal([opened.key, opened.cliffhanger, opened.passed], ['e01', null, false]);
  ok(opened.questions.every((question: Record<string, unknown>) => !('answer' in question)), 'no answer key is sent');
  equal((await f.get('state')).body.xp.total, 0, 'reading earns nothing');
  const wrong = (await f.post('story-answer', { arc: 'tashkent_lights', episode: 'e01', answers: { q1: 'a', q2: 'a', q3: 'a' } })).body;
  equal([wrong.passed, wrong.xp, wrong.cliffhanger], [false, 0, null]);
  const right = (await f.post('story-answer', { arc: 'tashkent_lights', episode: 'e01', answers: { q1: 'b', q2: 'b', q3: 'b' }, choice: 'walk' })).body;
  equal([right.passed, right.first_pass, right.next_unlocks], [true, true, 'tomorrow']);
  ok(right.cliffhanger.includes('nobody is there'), 'the cliffhanger after passing');
  await f.settle();
  const xp = (await f.get('state')).body.xp.total;
  ok(xp >= 15, `5 + 2×5 minutes for the episode, got ${xp}`);
  await f.post('story-answer', { arc: 'tashkent_lights', episode: 'e01', answers: { q1: 'b', q2: 'b', q3: 'b' } });
  await f.settle();
  equal((await f.get('state')).body.xp.total, xp, 'passing again earns nothing more');
  equal((await f.get('story', 'tok-plus', { arc: 'tashkent_lights', episode: 'e02' })).body.code, 'episode_locked', 'the next one opens tomorrow');
  f.advance(DAY);
  const next = (await f.get('story', 'tok-plus', { arc: 'tashkent_lights', episode: 'e02' })).body.episode;
  equal(next.opening, 'Madina’s feet hurt. The walk is long.', 'the earlier choice shapes the next episode');
});

Deno.test('E8: AI writes an episode only inside the arc, charged once, refunded when its checks fail', async () => {
  const f = engageFixture();
  const memory = await f.store();
  for (const key of ['e01', 'e02']) await memory.addStoryResult({ userId: ID.plus, arcKey: 'tashkent_lights', episodeKey: key, correct: 3, total: 3, passed: true, choice: null });
  await memory.saveStoryProgress({ userId: ID.plus, arcKey: 'tashkent_lights', unlocked: 3, lastUnlockedOn: '2026-11-02', flags: {}, updatedAt: new Date().toISOString() });
  const beat = (await f.get('story', 'tok-plus', { arc: 'tashkent_lights', episode: 'e03' })).body.episode;
  equal([beat.written, beat.credit_key], [false, 'story.episode']);
  const episode = {
    title: 'Coffee and Sophie',
    scene: 'Madina learns to make coffee. ' + Array.from({ length: 30 }, () => 'Sophie comes in every morning and orders the same tea.').join(' ').slice(0, 600),
    listen: [{ speaker: 'Sophie', line: 'Good morning! Black tea, please.' }, { speaker: 'Madina', line: 'With milk?' }, { speaker: 'Sophie', line: 'No milk, thank you.' }],
    questions: [
      { id: 'q1', mode: 'reading', prompt: 'What does Madina learn?', options: [{ id: 'a', text: 'To make coffee' }, { id: 'b', text: 'To drive' }, { id: 'c', text: 'To sing' }], answer: 'a' },
      { id: 'q2', mode: 'reading', prompt: 'When does Sophie come?', options: [{ id: 'a', text: 'Every evening' }, { id: 'b', text: 'Every morning' }, { id: 'c', text: 'On Sundays' }], answer: 'b' },
      { id: 'q3', mode: 'listening', prompt: 'Does Sophie want milk?', options: [{ id: 'a', text: 'Yes' }, { id: 'b', text: 'No' }, { id: 'c', text: 'Only sugar' }], answer: 'b' },
    ],
    choice: { prompt: 'What does Madina do with the envelope?', options: [{ id: 'keep', label: 'Keep it in the drawer' }, { id: 'ask', label: 'Ask Rustam aka' }] },
    cliffhanger: 'That evening, the drawer is open.',
  };
  const before = (await f.json('GET', 'core/me')).body.credits.total;
  f.setProvider(() => completion(JSON.stringify({ ...episode, questions: episode.questions.map((question) => ({ ...question, answer: 'z' })) })));
  const failed = await f.post('story-fill', { arc: 'tashkent_lights', episode: 'e03' });
  equal([failed.status, failed.body.code, failed.body.refunded], [502, 'ai_failed', true]);
  equal((await f.json('GET', 'core/me')).body.credits.total, before, 'a failed check is refunded');
  f.setProvider(() => completion(JSON.stringify(episode)));
  const filled = await f.post('story-fill', { arc: 'tashkent_lights', episode: 'e03' });
  equal(filled.status, 200, JSON.stringify(filled.body));
  equal([filled.body.episode.written, filled.body.episode.authored], [true, false]);
  equal((await f.json('GET', 'core/me')).body.credits.total, before - 3, 'three credits, the price in ai-core');
  equal((await f.post('story-fill', { arc: 'tashkent_lights', episode: 'e03' })).status, 200);
  equal((await f.json('GET', 'core/me')).body.credits.total, before - 3, 'stored once; reopening is free');
  equal((await f.post('story-fill', { arc: 'tashkent_lights', episode: 'e01' })).body.code, 'already_written');
  equal((await f.post('story-fill', { arc: 'tashkent_lights', episode: 'e03' }, 'tok-free')).body.code, 'plan_required', 'no AI for free users');
});
