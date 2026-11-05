import { equal, fixture, ok } from '../fixture.test.ts';
import { MODULES } from '../handler.ts';
import { memoryFor } from '../engage/binding.ts';
import { engageFixture } from '../engage/test-helpers.ts';
import { learnerFixture } from '../learner/testkit.ts';
import type { FeatureModule } from '../types.ts';
import { isoWeek, recordEssay, recordWeeklyVoice } from './samples.ts';

// Learner ↔ engage seams wired at integration: then-vs-now samples from learner work,
// engage's usage in the P1 parent brief, and learner duels in engage's squad feed.

const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new Array(64).fill(2)]);
const ESSAY = 'Some people think that students should study abroad, while others prefer local universities. In my opinion both have benefits.';
const probe: FeatureModule = {
  area: 'learner',
  routes: {
    'zz-samples': {
      async POST(ctx) {
        const body = await ctx.body<{ essay?: string }>();
        recordWeeklyVoice(ctx, { key: 'learner:L4', feature: 'L4', audio: WEBM, mime: 'audio/webm', transcript: 'I would like to talk about my favourite place in Tashkent.', durationSec: 21 });
        recordEssay(ctx, { id: body.essay ?? 'essay-1', feature: 'L3', text: ESSAY, scores: { overall: 6, task: 6, coherence: null }, promptKey: 'ielts' });
        return { ok: true };
      },
    },
  },
};

Deno.test('learner recordings and essays become then-vs-now samples (voice once a week, each essay once)', async () => {
  const f = fixture({ modules: [...MODULES.filter((module) => module.area !== 'learner'), probe] });
  const user = '00000000-0000-4000-8000-000000000002';
  for (const essay of ['essay-1', 'essay-1', 'essay-2']) { await f.call('POST', 'learner/zz-samples', { body: { essay } }); await f.settle(); }
  const samples = await memoryFor(f.memory.repository, f.now).repo.samples(user);
  equal(samples.map((sample) => [sample.kind, sample.source, sample.feature]).sort(), [['voice', 'learner', 'L4'], ['writing', 'learner', 'L3'], ['writing', 'learner', 'L3']]);
  ok(samples.find((sample) => sample.kind === 'voice')!.sourceRef === `learner:L4:${isoWeek(f.now())}`, 'one recording for the week');
  equal(samples.find((sample) => sample.sourceRef === 'learner:essay:essay-1')!.scores, { overall: 6, task: 6 }, 'scores as numbers only');
});

Deno.test('the P1 parent brief carries engage\'s time summary for a child under 18, not for an adult', async () => {
  const f = learnerFixture();
  const invite = await f.json('POST', 'learner/family-invite', { token: 'tok-family', body: { child_label: 'Aziza', consent: true } });
  await f.json('POST', 'learner/family-accept', { token: 'tok-child', body: { code: invite.body.invite.code } });
  await f.json('POST', 'learner/consent', { token: 'tok-child', body: { age_band: '13_17', accept: true } });
  f.reply({ title: 'Parks', text: 'Tashkent has many green parks and gardens. '.repeat(8), questions: [1, 2, 3].map(() => ({ prompt: 'Which is right?', options: ['a', 'b', 'c'], answer_index: 0, explanation: '' })), words: [] });
  const reading = await f.json('POST', 'learner/reading', { token: 'tok-child', body: { topic: 'parks', level: 'A2' } });
  await f.json('POST', 'learner/reading-check', { token: 'tok-child', body: { id: reading.body.reading.id, answers: [0, 0, 0] } });
  await f.settle();
  f.reply({ effort: 'Practised reading.', progress: 'Reading is improving.', praise: 'All three right.', watch: 'Keep it regular.', suggestion: 'Read together once.' });
  const brief = (await f.json('POST', 'learner/parent-brief', { token: 'tok-family', body: {} })).body.briefs[0];
  ok(typeof brief.stats.practice_minutes_7d === 'number' && brief.stats.practice_days_7d >= 1 && typeof brief.stats.streak === 'number', `engage summary: ${JSON.stringify(brief.stats)}`);
  equal(brief.stats.daily_limit_minutes, null, 'no limit set');
  ok(!JSON.stringify(brief).includes('Tashkent has many green parks'), 'never the child\'s content');

  const adult = learnerFixture();
  const second = await adult.json('POST', 'learner/family-invite', { token: 'tok-family', body: { child_label: 'Grown', consent: true } });
  await adult.json('POST', 'learner/family-accept', { token: 'tok-child', body: { code: second.body.invite.code } });
  await adult.json('POST', 'learner/consent', { token: 'tok-child', body: { age_band: 'adult', accept: true } });
  adult.reply({ effort: 'x', progress: 'x', praise: 'x', watch: 'x', suggestion: 'x' });
  const grown = (await adult.json('POST', 'learner/parent-brief', { token: 'tok-family', body: {} })).body.briefs[0];
  ok(!('practice_minutes_7d' in grown.stats), 'an adult\'s time stays private');
});

Deno.test('learner duels (drill_finished, feature L17, with an outcome) show in the engage squad feed', async () => {
  const f = engageFixture();
  const created = (await f.post('squad-create', { name: 'Duelists', weekly_goal_minutes: 30 })).body.squad;
  await f.post('squad-join', { code: created.invite_code }, 'tok-beta');
  // The event the learner area emits when a duel ends (learner/duel.ts).
  await f.learn('tok-beta', [{ kind: 'drill_finished', area: 'learner', feature: 'L17', skill: 'duel.vocabulary', verified_minutes: 1, score: 60, outcome: 'loss' }]);
  const squad = (await f.get('squad')).body.squad;
  equal(squad.duels.map((duel: { outcome: string; me: boolean }) => [duel.outcome, duel.me]), [['loss', false]]);
});
