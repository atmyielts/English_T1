import { equal, ID, ok } from '../fixture.test.ts';
import { coachStack } from './harness.ts';

// B2 English Speaking Partner, end to end in Uzbek: placement at a beginner level,
// a goal, voice role-plays with a persona's hidden state and spoken replies,
// explanations in Uzbek for a beginner, strict correction, shadowing, the phrase
// bank as quiz polls, a drill and the weekly fluency report. Then the same coach
// with no speech provider (text everywhere), people without a plan and people who
// have not linked their account yet.

const CHAT = '700100';
const LINES = [
  'Hello I want to check in please my name is Dilnoza and I have a booking for two nights',
  'Yes I booked online last week but the room is very noisy because it is near the lift',
  'Could I change to a quieter room please I have important exam tomorrow morning',
  'Thank you so much that is perfect I really appreciate your help',
];

/** Takes the placement test as a beginner (wrong answers, "Not yet") or a stronger learner (right answers, "Yes"). */
async function onboard(s: Awaited<ReturnType<typeof coachStack>>, chat: string, language: string, level: 'beginner' | 'strong') {
  await s.user.text('speaking', chat, '/start', language);
  await s.user.tap('speaking', chat, 'm:test');
  const items = s.runtime.packs.get('speaking')!.diagnostic.items;
  let out = s.fresh(), tap = s.data(out, /^dg:/), guard = 0;
  while (tap && guard++ < 40) {
    const index = Number(tap.split(':')[2]), item = items[index];
    const choice = item.kind === 'can_do' ? (level === 'beginner' ? 2 : 0) : level === 'beginner' ? ((item.answer ?? 0) + 1) % (item.options?.length ?? 2) : item.answer ?? 0;
    await s.user.tap('speaking', chat, tap.replace(/^(dg:[ure]:\d+:)\d/, `$1${choice}`));
    out = s.fresh();
    tap = s.data(out, /^dg:/);
  }
  return out;
}

Deno.test('B2 Speaking Partner: beginner role-plays in Uzbek, shadowing, phrases and the fluency report', async () => {
  const s = await coachStack();
  const { user, fresh, texts, data } = s;
  // A beginner: every can-do answered "Not yet", every question answered with the first option.
  let out = await onboard(s, CHAT, 'uz', 'beginner');
  ok(texts(out).some((text) => text.includes('Daraja testi natijasi')), `placement in Uzbek: ${texts(out).join(' | ').slice(0, 300)}`);
  const placement = (await s.coach.store.enrollment(ID.plus, 'speaking'))!.placement!;
  ok(placement.overall < 3, `a beginner level: ${placement.overall}`);
  await user.tap('speaking', CHAT, data(out, /^g:t:3$/) ?? data(out, /^g:t:/)!);
  out = fresh();
  ok(data(out, /^g:m:15$/), 'no exam date for this coach: straight to minutes');
  await user.tap('speaking', CHAT, 'g:m:15');
  await user.tap('speaking', CHAT, 'g:r:1800');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Rejangiz tayyor')), 'plan ready, in Uzbek');

  // A role-play: the persona opens (also as voice), reacts to each spoken line, and the review follows.
  await user.tap('speaking', CHAT, 'm:roleplay');
  out = fresh();
  await user.tap('speaking', CHAT, data(out, /^o:0$/)!);
  out = fresh();
  ok(texts(out).some((text) => text.includes('🎭')), 'scenario brief');
  ok(out.some((call) => call.method === 'sendVoice'), 'the opening line as voice');
  const active = (await s.coach.store.enrollment(ID.plus, 'speaking'))!.state.current as { flow: string; activityId: string; hidden: Record<string, unknown> };
  equal(active.flow, 'roleplay', 'in a role-play');
  const before = JSON.stringify(active.hidden);
  for (const line of LINES.slice(0, 3)) await user.voice('speaking', CHAT, line, 9);
  out = fresh();
  ok(texts(out).filter((text) => text.includes('Could you tell me a little more')).length === 3, 'the persona answers each line');
  ok(out.filter((call) => call.method === 'sendVoice').length >= 3, 'replies come back as voice');
  const persona = s.knobs.prompts.filter((prompt) => prompt.includes('You play ')).at(-1)!;
  ok(persona.includes('Write correction explanations in Uzbek'), 'a beginner gets explanations in Uzbek');
  const moved = (await s.coach.store.enrollment(ID.plus, 'speaking'))!.state.current as { hidden: Record<string, unknown> };
  ok(JSON.stringify(moved.hidden) !== before, 'the hidden state moved with what was said');
  await user.tap('speaking', CHAT, 'rp:end');
  out = fresh();
  const review = texts(out).join('\n');
  ok(review.includes('tahlil') && review.includes('✅'), `review with goals: ${review.slice(0, 500)}`);
  ok(review.includes('So‘zlarning') && review.includes('%'), 'scorecard (talk ratio)');
  ok(review.includes('nimani o‘ylagan'), 'the hidden state revealed');

  // Strict correction mode: every turn may carry corrections, quoted from what was said.
  await user.tap('speaking', CHAT, 's:cor');
  await user.tap('speaking', CHAT, 'c:strict');
  await user.tap('speaking', CHAT, 'm:roleplay');
  await user.tap('speaking', CHAT, data(fresh(), /^o:1$/)!);
  fresh();
  await user.text('speaking', CHAT, LINES[1]);
  out = fresh();
  ok(texts(out).some((text) => text.includes('💡') && text.includes('Yes I booked')), `strict correction: ${texts(out).join(' | ')}`);
  await user.tap('speaking', CHAT, 'm:menu');
  fresh();

  // Shadowing: listen, repeat by voice, see how much came through.
  await user.tap('speaking', CHAT, 'm:shadowing');
  for (let i = 0; i < 6; i++) {
    out = fresh();
    const current = (await s.coach.store.enrollment(ID.plus, 'speaking'))!.state.current as { flow: string; sentences?: string[]; index?: number; activityId?: string };
    if (current.flow !== 'shadow') break;
    const set = s.runtime.packs.get('speaking')!.byId.get(current.activityId!) as { sentences: { id: string; text: string }[] };
    const sentence = set.sentences.find((entry) => entry.id === current.sentences![current.index!])!;
    await user.voice('speaking', CHAT, sentence.text, 4);
  }
  out = [...out, ...fresh()];
  ok(texts(out).some((text) => text.includes('100%')), `shadowing match: ${texts(out).join(' | ').slice(-300)}`);
  ok(s.f.memory.learning.some((event) => event.kind === 'drill_finished' && event.skill === 'speaking.conversation.pronunciation'), 'shadowing set finished');

  // The phrase bank as quiz polls.
  await user.tap('speaking', CHAT, 'm:phrases');
  for (let i = 0; i < 12; i++) {
    out = fresh();
    const poll = out.find((call) => call.method === 'sendPoll');
    if (!poll) break;
    const number = s.calls.filter((call) => call.method === 'sendPoll').length;
    await user.poll('speaking', CHAT, `poll-${number}`, i % 3 === 0 ? (Number(poll.body.correct_option_id) + 1) % 4 : Number(poll.body.correct_option_id));
  }
  out = [...out, ...fresh()];
  ok(texts(out).some((text) => text.includes('Keyingi takrorlash')), 'phrase review done');
  ok(s.f.memory.learning.some((event) => event.kind === 'check_failed' && event.feature === 'B2'), 'missed cards are counted, not verified');

  // A drill for a typical Uzbek-speaker error.
  await user.tap('speaking', CHAT, 'dr:pronouns_gender');
  for (let i = 0; i < 10; i++) {
    out = fresh();
    const current = (await s.coach.store.enrollment(ID.plus, 'speaking'))!.state.current as { flow: string };
    if (current.flow !== 'drill') break;
    const choice = data(out, /^a:\d+:\d$/);
    if (choice) await user.tap('speaking', CHAT, choice); else await user.text('speaking', CHAT, 'she');
  }

  // The weekly fluency report in Uzbek: pace, fillers, range, errors, minutes.
  await user.tap('speaking', CHAT, 'm:report');
  out = fresh();
  const report = texts(out).join('\n');
  ok(report.includes('Haftangiz') && report.includes('Daqiqadagi so‘zlar') && report.includes('Faol kunlar'), `fluency report: ${report}`);
  const events = s.f.memory.learning.filter((event) => event.feature === 'B2');
  ok(events.some((event) => event.kind === 'turn_scored' && event.verified && event.verifiedMinutes > 0), 'the role-play counts as verified practice');
});

Deno.test('Speaking Partner without a speech provider: voice is declined kindly and every feature works in text', async () => {
  const s = await coachStack({ speech: false });
  let out = await onboard(s, CHAT, 'en', 'strong');
  await s.user.tap('speaking', CHAT, s.data(out, /^g:t:/)!);
  await s.user.tap('speaking', CHAT, 'g:m:15');
  await s.user.tap('speaking', CHAT, 'g:r:off');
  await s.user.tap('speaking', CHAT, 'm:roleplay');
  await s.user.tap('speaking', CHAT, s.data(s.fresh(), /^o:0$/)!);
  out = s.fresh();
  ok(!out.some((call) => call.method === 'sendVoice'), 'no voice without text-to-speech');
  await s.user.voice('speaking', CHAT, LINES[0], 8);
  out = s.fresh();
  ok(s.texts(out).some((text) => text.includes('Voice answers are not switched on yet')), 'asked to type instead');
  equal(s.f.memory.ledger.filter((row) => row.kind === 'charge').length, 0, 'nothing charged for the voice that could not be heard');
  for (const line of LINES) await s.user.text('speaking', CHAT, line);
  await s.user.tap('speaking', CHAT, 'rp:end');
  out = s.fresh();
  ok(s.texts(out).some((text) => text.includes('review')), `typed role-play reviewed: ${JSON.stringify(s.f.memory.calls.slice(-4).map((c) => [c.feature, c.status, c.errorCode]))}`);
  await s.user.tap('speaking', CHAT, 'm:shadowing');
  out = s.fresh();
  ok(s.buttons(out).some((button) => button.web_app?.url.includes('/coach/speaking/shadow/')), 'shadowing offers the in-app voice');
});

Deno.test('Coaches for people without a plan or a linked account: the placement test and examples only', async () => {
  const s = await coachStack();
  // A linked person without a plan (tok-student).
  await s.user.text('speaking', '700200', '/start');
  s.fresh();
  await s.user.tap('speaking', '700200', 'm:roleplay');
  let out = s.fresh();
  ok(s.texts(out).some((text) => text.includes('Schood AI Plus')), 'paywall for practice');
  out = await onboard(s, '700200', 'en', 'strong');
  ok(s.texts(out).some((text) => text.includes('placement result')) && s.texts(out).some((text) => text.includes('Schood AI Plus')), 'free placement, then the paywall');
  await s.user.tap('speaking', '700200', 'm:samples');
  out = s.fresh();
  ok(s.texts(out).some((text) => text.includes('Example report')), 'examples');
  equal(s.f.memory.calls.length, 0, 'no model call for a person without a plan');

  // Someone who has not linked: the worker runs the test alone, then links and saves the result.
  await s.user.text('ielts', '555000', '/start', 'ru');
  out = s.fresh();
  ok(s.texts(out).some((text) => text.includes('привяжите аккаунт')), 'link step in Russian');
  await s.user.tap('ielts', '555000', 'ul:test:ru');
  out = s.fresh();
  let tap = s.data(out, /^dg:r:/), guard = 0;
  while (tap && guard++ < 40) { await s.user.tap('ielts', '555000', tap.replace(/^(dg:r:\d+:)\d/, '$11')); out = s.fresh(); tap = s.data(out, /^dg:/); }
  ok(s.texts(out).some((text) => text.includes('Результат теста уровня')), 'result for someone not linked');
  const save = s.data(out, /^dgs:/)!;
  ok(save && s.buttons(out).some((button) => button.url?.includes('/coach/ielts/link')), 'link and save buttons');
  equal(s.f.memory.learning.length, 0, 'nothing stored for an unlinked person');
  await s.user.text('ielts', '555000', `/start ${'a'.repeat(64)}`);
  out = s.fresh();
  try {
    ok(s.texts(out).some((text) => text.includes('Linked!')), `linked: ${s.texts(out).join(' | ')}`);
    ok(s.texts(out).some((text) => text.includes('IELTS Coach')), 'and welcomed by the coach');
    // The result taken before linking is saved now.
    await s.user.tap('ielts', '555000', save);
    out = s.fresh();
    ok((await s.coach.store.enrollment(ID.outsider, 'ielts'))?.placement, `placement saved after linking: ${s.texts(out).join(' | ').slice(0, 200)}`);
  } finally {
    s.restore();
  }
});
