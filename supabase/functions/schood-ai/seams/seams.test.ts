import { equal, fixture, ok } from '../fixture.test.ts';
import { MODULES } from '../handler.ts';
import { coachStore } from '../coach/runtime.ts';
import { memoryFor } from '../engage/binding.ts';
import { passportSourceEntries } from '../engage/seams.ts';
import type { FeatureModule } from '../types.ts';
import { isoWeek, recordCoachVoice } from './coach-engage.ts';

// The seams wired at integration: coach certificates in engage's Skill Passport, and a
// coach's scored voice answer as a then-vs-now sample, once per coach a week.

const OGG = new Uint8Array([0x4f, 0x67, 0x67, 0x53, ...new Array(64).fill(1)]);
const probe: FeatureModule = {
  area: 'coach',
  routes: {
    'zz-voice': {
      service: true,
      async POST(ctx) {
        const body = await ctx.body<{ audio?: 'ogg' | 'text' }>();
        recordCoachVoice(ctx, { pack: 'ielts', feature: 'B1', audio: body.audio === 'text' ? new TextEncoder().encode('not audio at all, only text') : OGG, mime: 'audio/ogg', transcript: 'I live in a flat in Chilonzor with my family.', durationSec: 14, scores: { overall: 6.5, fluency: 6, pronunciation: null } });
        return { ok: true };
      },
    },
    'zz-passport': { async GET(ctx) { const [, source] = passportSourceEntries().find(([name]) => name === 'coach')!; return { items: await source(ctx, ctx.user.id) }; } },
  },
};

Deno.test('isoWeek follows ISO 8601', () => {
  equal([isoWeek(new Date('2026-11-02T06:00:00Z')), isoWeek(new Date('2027-01-01T00:00:00Z')), isoWeek(new Date('2026-12-31T00:00:00Z'))], ['2026-W45', '2026-W53', '2026-W53']);
});

Deno.test('coach voice answers become then-vs-now samples, one per coach a week', async () => {
  const f = fixture({ modules: [...MODULES.filter((module) => module.area !== 'coach'), probe] });
  const voice = (audio: 'ogg' | 'text' = 'ogg') => f.worker('coach/zz-voice', 'POST', '00000000-0000-4000-8000-000000000002', '700100', { audio });
  equal((await voice()).status, 200);
  await f.settle();
  const engage = memoryFor(f.memory.repository, f.now);
  let samples = await engage.repo.samples('00000000-0000-4000-8000-000000000002');
  equal(samples.map((sample) => [sample.kind, sample.source, sample.feature, sample.scores]), [['voice', 'coach', 'B1', { overall: 6.5, fluency: 6 }]]);
  ok(samples[0].storage !== null && samples[0].sourceRef === `coach:ielts:${isoWeek(f.now())}`, 'stored once, under the week');
  await voice();
  await f.settle();
  equal((await engage.repo.samples('00000000-0000-4000-8000-000000000002')).length, 1, 'the same week keeps one');
  f.advance(7 * 86_400_000);
  await voice('text');
  await f.settle();
  equal((await engage.repo.samples('00000000-0000-4000-8000-000000000002')).length, 1, 'something that is not audio is skipped quietly');
  await voice();
  await f.settle();
  samples = await engage.repo.samples('00000000-0000-4000-8000-000000000002');
  equal(samples.length, 2, 'a new week, a new sample');
});

Deno.test('coach certificates appear in the Skill Passport, never revoked ones', async () => {
  const f = fixture({ modules: [...MODULES.filter((module) => module.area !== 'coach'), probe] });
  const store = f.stores.get(coachStore);
  const base = { userId: '00000000-0000-4000-8000-000000000002', pack: 'ielts', packVersion: '1', rubric: 'ielts.speaking', level: 6, levelLabel: 'Band 6', displayName: 'Dilnoza', evidence: [] };
  const kept = await store.issueCertificate({ ...base, code: 'SCH-AAAA-BBBB', milestone: 'band_6' });
  const revoked = await store.issueCertificate({ ...base, code: 'SCH-CCCC-DDDD', milestone: 'band_5', level: 5, levelLabel: 'Band 5' });
  await store.revokeCertificate(revoked.id, base.userId);
  const items = (await f.json('GET', 'coach/zz-passport', { token: 'tok-plus' })).body.items;
  equal(items.map((item: { kind: string; ref: string; verified: boolean }) => [item.kind, item.ref, item.verified]), [['certificate', kept.id, true]]);
  ok(String(items[0].verifyUrl).endsWith('/coach/verify/SCH-AAAA-BBBB') && String(items[0].title).includes('Band 6'), 'title and verify link');
});
