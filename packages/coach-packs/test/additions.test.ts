import { cohortPercentile, MIN_COHORT } from '../src/cohort.ts';
import { diagnosticQuestion } from '../src/bot-diagnostic.ts';
import { localizeSource, overlay, splitPack, T } from '../src/localize.ts';
import { dailyPlan, pickByMastery, topicPriority } from '../src/planner.ts';
import { updateMastery, type MasteryState } from '../src/progress.ts';
import { loadPacks, packFor, PACK_SOURCES } from '../src/registry.ts';
import type { Activity, PackSource, QuizSet, Rubric } from '../src/types.ts';
import { definePack, indexPack, validatePack } from '../src/validate.ts';

// The engine additions of the coach packs (phase 7): practice text in several
// languages for mixed packs, keyed rubrics for timed mini-mocks, topic banks and the
// topic graph, the anonymous percentile, and the script builder's pack checks.

const assert = (value: unknown, label: string) => { if (!value) throw new Error(label); };
const equal = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const has = (problems: string[], pattern: RegExp, label: string) => assert(problems.some((problem) => pattern.test(problem)), `${label}: expected ${pattern}, got ${JSON.stringify(problems.slice(0, 12))}`);

/** B2 turned into a mixed pack with Uzbek and Russian practice text on one role-play and one placement item. */
function mixedSpeaking(): PackSource {
  const base = structuredClone(PACK_SOURCES.find((source) => source.manifest.id === 'speaking')!);
  base.manifest = { ...base.manifest, id: 'mixedtest', feature: 'B6', practiceLanguage: 'mixed', contentLanguage: 'en' };
  const rp = base.activities.find((activity) => activity.kind === 'roleplay') as Extract<Activity, { kind: 'roleplay' }>;
  rp.persona = { ...rp.persona, opening: T({ en: 'Hello there!', uz: 'Assalomu alaykum!', ru: 'Здравствуйте!' }) };
  const item = base.diagnostic.items.find((entry) => entry.kind === 'question')!;
  item.prompt = T({ en: 'Pick the right word.', uz: 'To‘g‘ri so‘zni tanlang.', ru: 'Выберите правильное слово.' });
  return definePack(base);
}

Deno.test('localize: T() practice text splits into the base plus overlays, and every language validates', () => {
  const source = mixedSpeaking();
  const rp = source.activities.find((activity) => activity.kind === 'roleplay') as Extract<Activity, { kind: 'roleplay' }>;
  equal(rp.persona.opening, 'Hello there!', 'the base language string');
  equal((rp.i18n as Record<string, { persona: { opening: string } }>).uz.persona.opening, 'Assalomu alaykum!', 'the Uzbek overlay');
  const problems = validatePack(source);
  assert(!problems.length, `a mixed pack with overlays validates: ${problems.slice(0, 5).join('; ')}`);
  const ru = localizeSource(source, 'ru');
  equal((ru.activities.find((activity) => activity.id === rp.id) as typeof rp).persona.opening, 'Здравствуйте!', 'the Russian version');
  assert(!('i18n' in ru.activities.find((activity) => activity.id === rp.id)!), 'a localized activity has no overlays left');
  // The same answers and option order in every language.
  const original = source.diagnostic.items.find((entry) => entry.kind === 'question')!;
  const localized = ru.diagnostic.items.find((entry) => entry.id === original.id)!;
  equal([localized.prompt, localized.answer, localized.options], ['Выберите правильное слово.', original.answer, original.options], 'the item in Russian keeps its key');
  // The worker's placement test reads the person's language without building the whole pack.
  const pack = indexPack(source);
  const first = source.diagnostic.items.indexOf(original);
  const message = diagnosticQuestion(pack, 'uz', source.diagnostic.items.slice(0, first).map((entry) => (entry.kind === 'can_do' ? 0 : entry.answer ?? 0)));
  assert(message?.kind === 'text' && message.html.includes('To‘g‘ri so‘zni tanlang.'), 'the placement question in Uzbek');
});

Deno.test('localize: overlays change only text, and the validator catches bad overlays and unsplit text', () => {
  equal(overlay({ a: 'x', n: 3, list: ['p', 'q'], answer: 1 }, { a: 'y', n: 'nope', list: [null, 'Q', 'extra'], answer: 'two' }), { a: 'y', n: 3, list: ['p', 'Q'], answer: 1 }, 'strings only, by key and index');
  const missing = structuredClone(mixedSpeaking());
  const rp = missing.activities.find((activity) => activity.i18n)!;
  delete (rp.i18n as Record<string, unknown>).ru;
  has(validatePack(missing), /\.i18n: missing ru$/, 'a language left out');
  const wrongPath = structuredClone(mixedSpeaking());
  (wrongPath.activities.find((activity) => activity.i18n)!.i18n as Record<string, unknown>).uz = { persona: { opening: 'ok' }, nothere: 'x' };
  has(validatePack(wrongPath), /no text here in the base/, 'an overlay on nothing');
  const unsplit = structuredClone(PACK_SOURCES.find((source) => source.manifest.id === 'speaking')!);
  unsplit.manifest = { ...unsplit.manifest, practiceLanguage: 'mixed', contentLanguage: 'en' };
  (unsplit.activities[0] as { title: unknown }).title = { en: 'A', uz: 'B', ru: 'C' };
  (unsplit.activities.find((activity) => activity.kind === 'roleplay') as Extract<Activity, { kind: 'roleplay' }>).persona.opening = T({ en: 'Hi', uz: 'Salom', ru: 'Привет' });
  has(validatePack(unsplit), /practice text was not split/, 'T() outside definePack');
  const english = structuredClone(PACK_SOURCES[0]);
  (english.activities[0] as { i18n?: unknown }).i18n = { uz: { title: 'x' } };
  has(validatePack(english), /only mixed packs have overlays/, 'overlays in a single-language pack');
  // packFor: one built version per language; non-mixed packs come back as they are.
  const loaded = loadPacks().get('speaking')!;
  assert(packFor(loaded, 'uz') === loaded, 'a single-language pack is not copied');
  const mixed = indexPack(mixedSpeaking());
  assert(packFor(mixed, 'uz') === packFor(mixed, 'uz') && packFor(mixed, 'uz') !== mixed && packFor(mixed, 'en') === mixed, 'built once per language; the base language is the pack itself');
  assert(splitPack(PACK_SOURCES[0]) === PACK_SOURCES[0], 'packs that are not mixed pass through definePack unchanged');
});

/** A small accuracy-scale pack (like B3): topic banks with prerequisites, a keyed mock rubric and a mini-mock. */
function topicPack(): PackSource {
  const base = structuredClone(PACK_SOURCES.find((source) => source.manifest.id === 'speaking')!);
  const scale = { id: 'percent', min: 0, max: 100, step: 5, fromAccuracy: true as const };
  const question = (id: string, difficulty: 1 | 2 | 3) => ({ id, type: 'numeric', prompt: `${id}: 2 + 2 = ?`, answer: { numeric: 4 }, explanation: { en: 'Four.', uz: 'To‘rt.', ru: 'Четыре.' }, difficulty });
  const bank = (id: string, node: string): QuizSet => ({
    id, kind: 'quiz_set', mode: 'practice', node, levels: [0, 100], minutes: 8, timeLimitSeconds: 600, draw: 4,
    title: { en: id, uz: id, ru: id }, questions: [1, 2, 3, 4, 5, 6].map((n) => question(`${id}-q${n}`, ((n % 3) + 1) as 1 | 2 | 3)),
  });
  const mock: Rubric = { id: 'topic.mock', keyed: true, name: { en: 'Mock', uz: 'Sinov', ru: 'Пробник' }, scale: { id: 'percent', min: 0, max: 100, step: 1 }, criteria: [], overall: { round: 'step' }, evidence: { min: 1, max: 1 }, assessorNotes: '', calibration: { thresholds: { exact: 0, adjacent: 0, maxMae: 0, maxSpread: 0, evidenceValid: 0 }, samples: [], runs: {} }, projections: [{ name: { en: 'Block', uz: 'Blok', ru: 'Блок' }, questions: 10 }] };
  base.manifest = {
    ...base.manifest, id: 'topictest', feature: 'B3', scale,
    skills: [
      { id: 'numbers', name: { en: 'Numbers', uz: 'Sonlar', ru: 'Числа' } },
      { id: 'numbers.fractions', parent: 'numbers', name: { en: 'Fractions', uz: 'Kasrlar', ru: 'Дроби' }, weight: 1 },
      { id: 'numbers.percent', parent: 'numbers', requires: ['numbers.fractions'], name: { en: 'Percent', uz: 'Foiz', ru: 'Проценты' }, weight: 2 },
    ],
    errorTags: [], audience: { ...base.manifest.audience, levels: [0, 100] },
    menu: [{ action: 'today', label: { en: 'Today', uz: 'Bugun', ru: 'Сегодня' } }, { action: 'practice', label: { en: 'Practice', uz: 'Mashq', ru: 'Практика' } }, { action: 'mock', label: { en: 'Mock', uz: 'Sinov', ru: 'Пробник' } }, { action: 'mistakes', label: { en: 'Mistakes', uz: 'Xatolar', ru: 'Ошибки' } }, { action: 'progress', label: { en: 'Progress', uz: 'Natija', ru: 'Прогресс' } }, { action: 'settings', label: { en: 'Settings', uz: 'Sozlamalar', ru: 'Настройки' } }],
    explainInUiLanguageBelow: undefined,
  };
  base.questionTypes = [{ id: 'numeric', name: { en: 'Numeric', uz: 'Son', ru: 'Число' }, strategy: { en: 'Check units.', uz: 'Birlikni tekshiring.', ru: 'Проверьте единицы.' }, node: 'numbers' }];
  base.rubrics = [mock];
  base.activities = [bank('bank.fractions', 'numbers.fractions'), bank('bank.fractions2', 'numbers.fractions'), bank('bank.percent', 'numbers.percent'), bank('bank.percent2', 'numbers.percent'),
    { id: 'mock.mini', kind: 'quiz_set', mode: 'practice', node: 'numbers', levels: [0, 100], minutes: 20, timeLimitSeconds: 1200, title: { en: 'Mini-mock', uz: 'Mini sinov', ru: 'Мини-пробник' }, questions: [], mock: { questions: 10 }, rubric: 'topic.mock' }];
  base.diagnostic = { ...base.diagnostic, items: base.diagnostic.items.map((item) => ({ ...item, skill: 'numbers', level: [20, 40, 60, 80][item.level % 4] ?? 40 })) };
  base.plan = { goal: { options: [50, 70, 90], default: 70, examDate: 'optional', defaultWeeks: 12 }, dailyMinutes: { options: [20, 30], default: 30 }, selection: 'mastery', phases: [{ id: 'all', minWeeksLeft: 0, title: { en: 'All', uz: 'Hammasi', ru: 'Всё' }, mix: { practice: 3 } }], weeklyMock: { activity: 'mock.mini', weekday: 6, title: { en: 'Mock', uz: 'Sinov', ru: 'Пробник' } }, links: [] };
  base.milestones = [50, 70, 85].map((min) => ({ id: `mock-${min}`, name: { en: `${min}%`, uz: `${min}%`, ru: `${min}%` }, level: min, rule: { rubric: 'topic.mock', metric: 'overall', min, count: 2, withinDays: 30 }, certificate: true }));
  base.percentile = { rubric: 'topic.mock', windowDays: 30 };
  base.samples = base.samples.slice(0, 2);
  base.fluency = { ...base.fluency, pace: [[0, 60, 140]] };
  return base;
}

Deno.test('keyed rubrics and topic banks: what the validator accepts and refuses', () => {
  const ok = topicPack();
  const problems = validatePack(ok);
  assert(!problems.length, `an accuracy-scale topic pack validates: ${problems.slice(0, 6).join('; ')}`);
  const keyedWithCriteria = topicPack();
  keyedWithCriteria.rubrics[0].criteria = structuredClone(PACK_SOURCES[1].rubrics[0].criteria.slice(0, 1));
  has(validatePack(keyedWithCriteria), /a keyed rubric has no criteria/, 'keyed rubric with criteria');
  const notKeyed = topicPack();
  (notKeyed.activities.at(-1) as QuizSet).rubric = 'speaking.conversation';
  has(validatePack(notKeyed), /is not a keyed rubric/, 'a mock on a model rubric');
  const thinBank = topicPack();
  (thinBank.activities.at(-1) as QuizSet).mock = { questions: 20 };
  has(validatePack(thinBank), /fewer than twice the mock/, 'a mock bigger than its banks');
  const cycle = topicPack();
  cycle.manifest.skills[1].requires = ['numbers.percent'];
  has(validatePack(cycle), /prerequisite cycle/, 'prerequisite cycle');
  const draw = topicPack();
  (draw.activities[0] as QuizSet).draw = 40;
  has(validatePack(draw), /draw: must be 3 to the number of questions/, 'drawing more than the bank holds');
  const percentile = topicPack();
  percentile.percentile = { rubric: 'nope', windowDays: 3 };
  has(validatePack(percentile), /percentile\.rubric/, 'percentile on an unknown rubric');
  has(validatePack(percentile), /percentile\.windowDays/, 'a window too short to be anonymous');
  const noBuilder = topicPack();
  noBuilder.manifest.menu.push({ action: 'script', label: { en: 'Script', uz: 'Skript', ru: 'Скрипт' } });
  has(validatePack(noBuilder), /manifest\.menu\.script: the pack has no content for it/, 'a script menu with no builder');
});

Deno.test('topic graph: accuracy moves the level, and the weakest topic waits for its weak prerequisite', () => {
  const pack = indexPack(topicPack());
  const scale = pack.manifest.scale, at = new Date('2026-11-02T08:00:00Z');
  const fractions = updateMastery(null, 'numbers.fractions', { accuracy: 0.3, scale, at });
  equal([fractions.mastery, fractions.level], [0.3, 30], 'on an accuracy scale the level is the share right');
  const mastery = new Map<string, MasteryState>([['numbers.fractions', fractions]]);
  // Percent weighs twice as much but needs fractions, which are measured weak: fractions first.
  assert(topicPriority(pack, 'numbers.fractions', mastery, 70, null) > topicPriority(pack, 'numbers.percent', mastery, 70, null), 'the prerequisite comes first');
  const strong = new Map<string, MasteryState>([['numbers.fractions', updateMastery(null, 'numbers.fractions', { accuracy: 0.9, scale, at })]]);
  assert(topicPriority(pack, 'numbers.percent', strong, 70, null) > topicPriority(pack, 'numbers.fractions', strong, 70, null), 'once fractions are strong, percent (weight 2) leads');
  const banks = pack.ofKind('quiz_set').filter((set) => !set.mock);
  const today = '2026-11-02';
  const first = pickByMastery(pack, banks, { mastery, target: 70, fallback: null, recent: [], today, seed: 1 })!;
  equal(first.node, 'numbers.fractions', 'today\'s set is on the weak prerequisite');
  const after = pickByMastery(pack, banks, { mastery, target: 70, fallback: null, recent: [{ activityId: first.id, at: `${today}T07:00:00Z` }], today, seed: 1 })!;
  assert(after.id !== first.id, 'a set done today is not offered again first');
  const plan = dailyPlan({ pack, goal: { target: 70, examDate: null, dailyMinutes: 30, startedAt: '2026-10-01T00:00:00Z' }, mastery, recent: [], dueCards: 0, recurring: [], today, weekday: 1, mockDoneThisWeek: false, seed: 'x' });
  assert(plan.tasks.length >= 2 && plan.tasks.every((task) => task.slot === 'practice') && new Set(plan.tasks.map((task) => task.activityId)).size === plan.tasks.length, `a day of distinct topic sets: ${JSON.stringify(plan.tasks)}`);
  assert(!plan.tasks.some((task) => task.activityId === 'mock.mini'), 'the mini-mock is not daily practice');
  const saturday = dailyPlan({ pack, goal: { target: 70, examDate: null, dailyMinutes: 30, startedAt: '2026-10-01T00:00:00Z' }, mastery, recent: [], dueCards: 0, recurring: [], today: '2026-11-07', weekday: 6, mockDoneThisWeek: false, seed: 'x' });
  equal(saturday.tasks[0].slot, 'mock', 'the weekly mini-mock on its day');
});

Deno.test('cohort: an anonymous percentile from counts only, shown from 30 people', () => {
  const histogram = [{ score: 40, people: 10 }, { score: 60, people: 10 }, { score: 80, people: 10 }];
  equal(cohortPercentile(histogram, 60), { percentile: 50, people: 30 }, 'ties count half; the learner is taken out of their own bucket');
  equal(cohortPercentile(histogram, 90, false), { percentile: 100, people: 30 }, 'above everyone');
  equal(cohortPercentile([{ score: 50, people: MIN_COHORT - 1 }], 50), null, 'below the minimum nothing is shown');
  equal(cohortPercentile([{ score: 50, people: 20 }, { score: 70, people: 20 }, { score: Number.NaN, people: 5 }], 70)?.people, 40, 'bad buckets are ignored');
});
