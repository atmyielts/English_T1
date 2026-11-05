import { equal, ID, ok } from '../fixture.test.ts';
import { examByKey } from './content/certificates.ts';
import { passportSourceEntries, registerOfferSource, registerPassportSource, resetOfferSource } from './seams.ts';
import { coachStore } from '../coach/runtime.ts';
import { b64, DAY, engageFixture, WEBM } from './test-helpers.ts';

// docs/product/44_SCHOOD_AI.md, "Done when", the engagement line:
//   "A learner who finishes a goal is offered the next one on their lifetime path.
//    Their Skill Passport shows every certificate and verified result. They can play
//    their day-1 voice next to today's, and they are in a weekly league and a squad."

let coachRegistered = false;

Deno.test('done: next goal after an outcome, a complete Passport, day 1 next to today, a league and a squad', async () => {
  // The coach engine's real passport source is registered at load (seams/coach-engage.ts); only stand in when it is not.
  if (!coachRegistered && !passportSourceEntries().some(([name]) => name === 'coach')) {
    coachRegistered = true;
    registerPassportSource('coach', (_ctx, userId) => Promise.resolve(userId === ID.beta ? [{ kind: 'certificate', ref: 'coach-cert-1', title: 'IELTS Coach: Speaking level 3', data: { pack: 'b1', level: 3 }, verifyUrl: 'https://ai.schood.online/coach/b1/certificate/ABCD', verified: true, issuedAt: '2026-11-01T10:00:00Z' }] : []));
  }
  resetOfferSource();
  registerOfferSource((_ctx, input) => Promise.resolve(input.moment === 'goal_done' ? { key: 'plus_annual', plan: 'plus', title: 'Plus Annual', terms: 'Shown with the price from the plans page', path: '/plans' } : null));
  try {
    const f = engageFixture();
    // A coach certificate for the learner, through the coach engine's own store.
    await f.stores.get(coachStore).issueCertificate({ userId: ID.beta, pack: 'ielts', packVersion: '1', milestone: 'speaking_3', rubric: 'ielts.speaking', level: 3, levelLabel: 'Speaking level 3', displayName: 'Learner', code: 'SCH-ABCD-EFGH', evidence: [] });
    const learner = 'tok-beta';
    // Day 1: the first voice sample.
    const day1 = (await f.post('sample-voice', { audio_base64: b64(WEBM), mime: 'audio/webm', duration_ms: 30_000, transcript: 'um hello I am uh a student' }, learner)).body;
    equal(day1.voice.first.id, day1.id);

    // A goal on the lifetime path, closed by a verified outcome.
    await f.post('path-goal', { goal: 'ielts', action: 'start' }, learner);
    await f.learn(learner, [
      f.scored('B1', 'ielts.speaking', 10),
      { kind: 'mock_finished', area: 'coach', feature: 'B1', skill: 'ielts.mock', verified_minutes: 40, score: 6.5 },
      { kind: 'outcome_recorded', area: 'coach', feature: 'B1', skill: 'ielts.overall', score: 7, outcome: 'band_7_0' },
    ]);
    const path = (await f.get('path', learner)).body;
    equal(path.goals.find((goal: { key: string }) => goal.key === 'ielts').status, 'done');
    equal(path.next, 'uni_essays', 'the next goal on the lifetime path is ready');
    equal(path.offer.key, 'plus_annual', 'and the honest offer from pricing comes with it');
    await f.post('offer-dismiss', { offer: 'plus_annual' }, learner);
    equal((await f.get('path', learner)).body.offer, null, 'dismissed in one tap');

    // A Skill Certificate, sat and reviewed.
    const sitting = (await f.post('sitting-start', { exam: 'sales_l1', consent: true, display_name: 'Beta Learner' }, learner)).body.sitting;
    await f.post('sitting-answers', { sitting: sitting.id, answers: Object.fromEntries(examByKey('sales_l1')!.items.map((item) => [item.id, item.answer])), writing: { t1: 'A reply long enough to mark. '.repeat(10) } }, learner);
    await f.post('sitting-submit', { sitting: sitting.id }, learner);
    equal((await f.post('review-decide', { sitting: sitting.id, rubric: { listening: 3, discovery: 3, value: 3, objection: 3, next_step: 3 }, integrity: 'clear' }, 'tok-admin')).body.status, 'passed');

    // The Passport shows every certificate (engage and coach) and every verified result.
    const passport = (await f.get('passport', learner)).body;
    const kinds = passport.items.map((item: { kind: string; source: string }) => `${item.kind}:${item.source}`).sort();
    equal(kinds, ['certificate:coach', 'certificate:engage', 'result:events', 'result:events']);
    ok(passport.items.every((item: { verified: boolean }) => item.verified), 'all verified');

    // Today's voice next to day 1.
    f.advance(30 * DAY);
    const today = (await f.post('sample-voice', { audio_base64: b64(WEBM), mime: 'audio/webm', duration_ms: 30_000, transcript: 'Hello, I am a second-year student of economics in Tashkent' }, learner)).body;
    equal([today.voice.first.id, today.voice.latest.id, today.voice.days_between], [day1.id, today.id, 30]);
    ok(today.voice.first.url && today.voice.latest.url, 'both play');

    // In this week's league and in a squad.
    await f.learn(learner, [f.scored('B2', 'speaking.roleplay', 5)]);
    const squad = (await f.post('squad-create', { name: 'Study Friends' }, learner)).body.squad;
    await f.post('squad-join', { code: squad.invite_code }, 'tok-plus');
    const state = (await f.get('state', learner)).body;
    equal([state.league.joined, state.squad.name], [true, 'Study Friends']);
    equal((await f.get('squad', learner)).body.squad.members.length, 2);
  } finally {
    resetOfferSource();
  }
});
