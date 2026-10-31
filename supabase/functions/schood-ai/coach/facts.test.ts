import { buildPack, validatePack, type CoachPack, type FactDataset, type PackSource, type Roleplay } from '../../../../packages/coach-packs/src/mod.ts';
import { PACK_SOURCES } from '../../../../packages/coach-packs/src/registry.ts';
import { equal, ok } from '../fixture.test.ts';
import type { ChargedSession, ChatMessage } from '../types.ts';
import { assessInSession, personaPrompt, practiceLocale } from './ai.ts';
import { activityFacts, factsNotice, factsSummary, FACTS_RULE, isStale } from './facts.ts';

// Engine support the next packs need: curated, dated facts (B5 Career and
// Interview) and role-plays in the learner's own language (B4 Sales, B6 Public
// Speaking). The dataset below is a test fixture, not a real rule.

const DATASET: FactDataset = {
  id: 'test-visa', title: { en: 'Test visa rules', uz: 'Sinov viza qoidalari', ru: 'Тестовые визовые правила' }, topic: 'test visa interview',
  checkedAt: '2026-10-01', maxAgeDays: 90, source: { name: 'Example ministry', url: 'https://example.org/rules' },
  entries: [{ id: 'fee', statement: { en: 'FIXTURE: the test fee is 10 units.', uz: 'FIXTURE: sinov to‘lovi 10 birlik.', ru: 'FIXTURE: тестовый сбор 10 единиц.' } }],
};

function packWithFacts(): CoachPack {
  const source: PackSource = structuredClone(PACK_SOURCES.find((entry) => entry.manifest.id === 'speaking')!);
  source.facts = [DATASET];
  const roleplay = source.activities.find((activity) => activity.kind === 'roleplay')!;
  roleplay.facts = ['test-visa'];
  return buildPack(source);
}

Deno.test('facts: activities name their datasets, and an unknown dataset is a pack error', () => {
  const pack = packWithFacts();
  const roleplay = pack.activities.find((activity) => activity.kind === 'roleplay')!;
  equal(activityFacts(pack, roleplay).map((dataset) => dataset.id), ['test-visa'], 'the activity\'s facts');
  equal(activityFacts(pack, pack.activities.find((activity) => activity.kind === 'deck')), [], 'none for the rest');
  const broken = structuredClone(PACK_SOURCES[1]);
  broken.activities.find((activity) => activity.kind === 'roleplay')!.facts = ['missing'];
  ok(validatePack(broken).some((problem) => problem.includes('unknown fact dataset missing')), 'unknown dataset reported');
  const undated = structuredClone(PACK_SOURCES[1]);
  undated.facts = [{ ...DATASET, checkedAt: 'soon' }];
  ok(validatePack(undated).some((problem) => problem.includes('checkedAt')), 'facts must be dated');
});

Deno.test('facts: the model gets only the curated facts, with their date, under the facts-only rule', async () => {
  const pack = packWithFacts();
  const roleplay = pack.activities.find((activity) => activity.kind === 'roleplay') as Roleplay;
  const now = new Date('2026-11-02T06:00:00Z');
  const prompt = personaPrompt(pack, roleplay, { level: 3, mode: 'gentle', explain: 'uz', state: roleplay.hiddenState.initial, facts: activityFacts(pack, roleplay), now });
  ok(prompt.includes(FACTS_RULE) && prompt.includes('kind="facts"') && prompt.includes('FIXTURE: the test fee is 10 units.') && prompt.includes('"checked_on":"2026-10-01"'), 'persona prompt carries the dated facts');
  ok(!personaPrompt(pack, roleplay, { level: 3, mode: 'gentle', explain: 'uz', state: {} }).includes('kind="facts"'), 'no facts block without facts');

  const seen: ChatMessage[][] = [];
  const session = { json: (input: { messages: ChatMessage[] }) => { seen.push(input.messages); return Promise.resolve({ criteria: [], summary: '' }); } } as unknown as ChargedSession;
  const rubric = pack.rubricById.get(roleplay.rubric)!;
  await assessInSession(session, { pack, rubric, task: { scenario: 'x' }, answer: 'I paid ten units for the fee.', fluency: null, explain: 'en', facts: activityFacts(pack, roleplay), now });
  const [system, user] = seen[0];
  ok(String(system.content).includes(FACTS_RULE) && String(system.content).includes('never correct them from memory'), 'assessor told to judge facts only against the data');
  ok(String(user.content).includes('kind="facts"') && String(user.content).indexOf('kind="facts"') < String(user.content).indexOf('<user_message>'), 'facts arrive as data before the answer');
});

Deno.test('facts: the learner sees the check date and the official site, and a warning once they are old', () => {
  const datasets = [DATASET];
  const fresh = factsNotice(datasets, 'ru', new Date('2026-11-02T06:00:00Z'))!;
  ok(fresh.includes('2026-10-01') && fresh.includes('https://example.org/rules') && fresh.includes('Тестовые визовые правила') && !fresh.startsWith('⚠️'), 'dated note with the source');
  const old = factsNotice(datasets, 'uz', new Date('2027-03-01T06:00:00Z'))!;
  ok(old.startsWith('⚠️') && old.includes('eskirgan'), 'stale warning');
  equal([isStale(DATASET, new Date('2026-12-29T00:00:00Z')), isStale(DATASET, new Date('2027-01-01T00:00:00Z'))], [false, true], '90 days');
  equal(factsNotice([], 'en', new Date()), null, 'nothing without facts');
  equal(factsSummary(datasets, 'en', new Date('2027-03-01T06:00:00Z'))[0], { id: 'test-visa', title: 'Test visa rules', checked_at: '2026-10-01', stale: true, source: { name: 'Example ministry', url: 'https://example.org/rules' } }, 'for the Mini App');
});

Deno.test('practice language: a multilingual pack role-plays in the learner\'s language', () => {
  const pack = packWithFacts();
  const roleplay = pack.activities.find((activity) => activity.kind === 'roleplay') as Roleplay;
  const mixed = { ...pack, manifest: { ...pack.manifest, practiceLanguage: 'mixed' as const } } as CoachPack;
  equal([practiceLocale(pack, 'uz'), practiceLocale(mixed, 'uz'), practiceLocale(mixed, 'ru')], ['en', 'uz', 'ru'], 'the pack\'s language, or the learner\'s');
  const prompt = personaPrompt(mixed, roleplay, { level: 3, mode: 'strict', explain: 'ru', state: {}, practice: 'ru' });
  ok(prompt.includes('role-play in Russian. Speak Russian only.') && prompt.includes('better versions stay in Russian'), 'persona speaks and corrects in Russian');
  ok(personaPrompt(pack, roleplay, { level: 3, mode: 'gentle', explain: 'uz', state: {} }).includes('role-play in English'), 'English for the Speaking Partner');
});
