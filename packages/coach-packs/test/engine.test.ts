import { aggregate, assess, mergeRepair, needsRepair, overallOf, overallScale, type RawAssessment } from '../src/assess.ts';
import { decodeAnswers, encodeAnswers, scoreDiagnostic } from '../src/diagnostic.ts';
import { analyseFluency, analyseLexis, shadowMatch } from '../src/fluency.ts';
import { dailyPlan, planWeeks, weeksLeft, type PlannerInput } from '../src/planner.ts';
import { nodeLevel, predict, reachedMilestones, recurringErrors, updateMastery, type MasteryState } from '../src/progress.ts';
import { loadPacks } from '../src/registry.ts';
import { summarizePeriod, weeklyReport, type SessionRecord, type TurnRecord } from '../src/report.ts';
import { answerMatches, escapeHtml, fill, levelLabel, quoteFound, snap } from '../src/text.ts';

// The engine's pure parts: text matching, placement, fluency numbers, evidence-
// checked scoring, mastery and forecasts, the daily plan and the weekly report.

const assert = (value: unknown, label: string) => { if (!value) throw new Error(label); };
const equal = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const packs = loadPacks();
const ielts = packs.get('ielts')!, speaking = packs.get('speaking')!;
const band = ielts.manifest.scale;

Deno.test('text: quotes match word for word, forgiving case, curly quotes and end punctuation only', () => {
  const said = 'Well, I’d say my hometown — Karshi — is quite “quiet” in winter.';
  assert(quoteFound("i'd say my hometown - karshi", said), 'normalised quote found');
  assert(quoteFound('is quite "quiet" in winter.', said), 'final punctuation forgiven');
  assert(!quoteFound('my hometown is quiet', said), 'a paraphrase is not a quote');
  assert(!quoteFound('a', said), 'one letter is never evidence');
  assert(answerMatches('The River.', ['river']) && !answerMatches('rivers', ['river']), 'short answers forgive articles and punctuation only');
  equal([snap(band, 6.25, 'half_up'), snap(band, 6.75, 'half_up'), snap(band, 6.2), snap(band, 12)], [6.5, 7, 6, 9], 'IELTS rounding and clamping');
  equal([levelLabel(band, 6.5), levelLabel(speaking.manifest.scale, 3)], ['6.5', 'B1'], 'labels as people read them');
  equal([levelLabel(speaking.manifest.scale, 2.9), levelLabel(speaking.manifest.scale, 3.3), levelLabel(band, 6.33)], ['B1', 'B1+', '6.3'], 'an average on a named scale reads as the nearest level; numbers keep their decimals');
  equal(fill('{name} has {n} {missing}', { name: 'Ali', n: 3 }), 'Ali has 3 {missing}', 'unknown placeholders stay visible');
  equal(escapeHtml('<b>"A&B"</b>'), '&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;', 'Telegram HTML escaping');
});

Deno.test('placement: answers round-trip through button data and score per skill', () => {
  for (const pack of [ielts, speaking]) {
    const answers = pack.diagnostic.items.map((item, index) => (item.kind === 'can_do' ? index % 3 : (item.answer ?? 0)));
    const code = encodeAnswers(answers);
    assert(code.length <= 16 && /^[0-9a-z]+$/.test(code), `${pack.manifest.id}: compact base 36`);
    equal(decodeAnswers(code), answers, `${pack.manifest.id}: round trip`);
    assert(`dg:${pack.diagnostic.items.length}:0:0:${code}`.length <= 64, 'fits Telegram callback data');
  }
  equal(decodeAnswers('!!'), null, 'garbage is refused');
  const items = ielts.diagnostic.items;
  const perfect = scoreDiagnostic(ielts, items.map((item) => (item.kind === 'can_do' ? 0 : item.answer ?? 0)));
  const weak = scoreDiagnostic(ielts, items.map((item) => (item.kind === 'can_do' ? 2 : ((item.answer ?? 0) + 1) % (item.options?.length ?? 2))));
  assert(perfect.overall > weak.overall, 'more right answers place higher');
  assert(perfect.correct === perfect.questions && weak.correct === 0, 'question counts');
  assert(perfect.suggestedTarget > perfect.overall || perfect.suggestedTarget === Math.max(...ielts.plan.goal.options), 'the suggested target is above the estimate');
  assert(perfect.skills.every((skill) => skill.level === null || (skill.level >= band.min && skill.level <= band.max)), 'skill levels on the scale');
});

Deno.test('fluency: pace, long pauses, fillers in three languages and repetitions from word timestamps', () => {
  const config = speaking.fluency;
  const words = 'I I think um the hotel is ну very nice and ee the room is big'.split(' ');
  let t = 0;
  const timed = words.map((word, index) => { const start = t; t += 0.4; if (index === 7) t += 3; return { word, start, end: start + 0.3 }; });
  const metrics = analyseFluency({ text: words.join(' '), words: timed, durationSec: t }, config, 3);
  equal([metrics.timed, metrics.fillers, metrics.repetitions, metrics.longPauses], [true, 3, 1, 1], 'measured from timestamps');
  equal(metrics.words, words.length - 3, 'fillers are not words');
  assert(metrics.wpm !== null && metrics.articulationWpm !== null && metrics.articulationWpm > metrics.wpm, 'articulation rate excludes the long pause');
  assert(metrics.pace !== null && ['slow', 'comfortable', 'fast'].includes(metrics.pace.verdict), 'pace verdict for the level');
  const typed = analyseFluency({ text: 'Well I think, you know, the room is big.' }, config);
  equal([typed.timed, typed.wpm, typed.fillers], [false, null, 1], 'a typed answer has no timing but counts "you know"');
  const lexis = analyseLexis('I would like to check in please. I have a booking under the name Karimova, and I asked for a quiet room with a view.', config, ['check in', 'a quiet room']);
  equal(lexis.packTerms, ['check in', 'a quiet room'], 'pack phrases used');
  assert(lexis.range !== null && lexis.range > 50, 'vocabulary range');
  equal(shadowMatch('Could I have the bill, please?', 'could I have bill please'), { score: 83, missed: ['the'] }, 'shadowing: words in order');
});

Deno.test('scoring: only verbatim evidence counts, audio criteria are never scored, one repair is merged', () => {
  const rubric = ielts.rubricById.get('ielts.speaking')!;
  const answer = 'My hometown is Karshi. It is not very big city but people is very kind and the bazaar is famous.';
  const tags = new Set(ielts.manifest.errorTags.map((tag) => tag.id));
  const model = rubric.criteria.filter((criterion) => criterion.source === 'model');
  const raw: RawAssessment = {
    criteria: model.map((criterion, index) => ({ id: criterion.id, score: 5.2, evidence: [{ quote: index === 0 ? 'My hometown is Karshi' : 'the city is pleasant', comment: 'ok' }] })),
    errors: [{ quote: 'people is very kind', correction: 'people are very kind', tag: 'subject_verb_agreement', explanation: 'Plural.' }, { quote: 'invented phrase', correction: 'x', tag: 'articles', explanation: '' }],
    upgrades: [{ said: 'the bazaar is famous', better: 'the bazaar is well known across the region', why: 'More precise.' }],
  };
  const first = assess(rubric, raw, answer, tags);
  equal(first.criteria.find((criterion) => criterion.id === model[0].id)?.score, 5, 'scored on the scale');
  equal(first.criteria.filter((criterion) => criterion.status === 'insufficient_evidence').length, model.length - 1, 'paraphrased quotes are not evidence');
  assert(first.criteria.some((criterion) => criterion.status === 'not_scored_audio' && criterion.score === null), 'pronunciation needs the audio');
  equal(first.overall, null, 'no overall from fewer than half the criteria');
  equal([first.errors.length, first.upgrades.length, first.validQuotes, first.invalidQuotes], [1, 1, 1, model.length - 1], 'invented errors dropped');
  equal(first.errors[0].tag, tags.has('subject_verb_agreement') ? 'subject_verb_agreement' : 'other', 'unknown tags become other');
  equal(needsRepair(first), model.slice(1).map((criterion) => criterion.id), 'repair asks only for the failed criteria');
  const repair = assess(rubric, { criteria: model.map((criterion) => ({ id: criterion.id, score: 6, evidence: [{ quote: 'people is very kind', comment: 'ok' }] })) }, answer, tags);
  const merged = mergeRepair(rubric, first, repair);
  equal(merged.criteria.filter((criterion) => criterion.status === 'scored').map((criterion) => criterion.score), [5, ...model.slice(1).map(() => 6)], 'repaired criteria replace the failed ones; scored ones stay');
  equal(merged.overall, overallOf(rubric, Object.fromEntries(merged.criteria.map((criterion) => [criterion.id, criterion.score]))), 'overall recomputed');
  const set = aggregate(rubric, [{ assessment: merged, weight: 20 }, { assessment: repair, weight: 60 }]);
  assert(set.overall !== null && set.criteria.every((criterion) => criterion.score === null || Number.isInteger(criterion.score * 2)), 'a set result on the scale');
});

Deno.test('scoring: IELTS overall rounds a quarter band up, as the band descriptors do', () => {
  const rubric = ielts.rubricById.get('ielts.writing_task2')!;
  const ids = rubric.criteria.map((criterion) => criterion.id);
  equal(overallScale(rubric).step, 0.5, 'half-band overall');
  equal([levelLabel(overallScale(rubric), 6.5), levelLabel(overallScale(rubric), 7), levelLabel(rubric.scale, 6)], ['6.5', '7.0', '6'], 'a half band reads as 6.5, never rounded to 7');
  equal(overallOf(rubric, Object.fromEntries(ids.map((id, index) => [id, index === 0 ? 7 : 6]))), 6.5, '6.25 → 6.5');
  equal(overallOf(rubric, Object.fromEntries(ids.map((id, index) => [id, index < 3 ? 7 : 6]))), 7, '6.75 → 7');
  equal(overallOf(rubric, { [ids[0]]: 7 }), null, 'one criterion is not an overall');
});

Deno.test('progress: mastery, recurring errors that fade, forecasts from own results and one milestone at a time', () => {
  const start = new Date('2026-10-01T09:00:00Z');
  let state: MasteryState | null = null;
  for (const [day, score] of [[0, 5], [2, 6], [4, 6]] as const) state = updateMastery(state, 'speaking.fluency_coherence', { score, scale: band, at: new Date(start.getTime() + day * 86_400_000), errors: ['articles'] });
  assert(state!.level! > 5 && state!.level! < 6 && state!.evidence === 3, 'moving average');
  equal(recurringErrors([state!], new Date(start.getTime() + 5 * 86_400_000)).map((error) => error.tag), ['articles'], 'an error three times this week recurs');
  equal(recurringErrors([state!], new Date(start.getTime() + 40 * 86_400_000)).length, 0, 'and fades after weeks without it');
  assert(nodeLevel(ielts, new Map([['speaking.fluency_coherence', state!]]), 'speaking') !== null, 'a parent skill takes its children\'s level');

  const points = [5, 5.5, 5.5, 6, 6].map((value, index) => ({ at: new Date(start.getTime() + index * 4 * 86_400_000).toISOString(), value }));
  const forecast = predict(overallScale(ielts.rubricById.get('ielts.speaking')!), points, 20, 'half_up');
  assert(forecast.reason === 'ok' && forecast.predicted! <= forecast.current! + 1, 'capped at one band above now');
  equal(predict(band, points.slice(0, 2), 10).reason, 'need_more_results', 'no forecast from two results');

  const results = [6, 6.5, 6, 6.5, 7, 7].map((overall, index) => ({ sessionId: `s${index}`, rubric: 'ielts.speaking', at: new Date(start.getTime() + index * 2 * 86_400_000).toISOString(), overall, criteria: {} }));
  const reached = reachedMilestones(ielts, results, new Set(), new Date(start.getTime() + 11 * 86_400_000));
  equal(reached.map((entry) => entry.milestone.id), ['speaking-6-5'], 'the highest new milestone per rubric (four results at 6.5+, two at 7)');
  equal(reached[0].results.length, 3, 'its evidence: the qualifying sessions');
  equal(reachedMilestones(ielts, results, new Set(['speaking-6-5']), new Date(start.getTime() + 11 * 86_400_000)).length, 0, 'never twice, and never a lower one after a higher one');
});

Deno.test('plan: the same plan for the same day, the weekly mock on its day, speaking parts in rotation', () => {
  const base: PlannerInput = {
    pack: ielts, goal: { target: 7, examDate: '2027-01-30', dailyMinutes: 30, startedAt: '2026-10-01' }, mastery: new Map(), recent: [], dueCards: 0, recurring: [],
    today: '2026-11-02', weekday: 1, mockDoneThisWeek: false, seed: 'user-1',
  };
  const plan = dailyPlan(base);
  equal(dailyPlan(base), plan, 'deterministic');
  assert(plan.tasks.length >= 1 && plan.tasks.length <= 4 && plan.minutes <= 30 * 1.5, 'fits the daily minutes');
  equal(plan.weeksLeft, weeksLeft(base.goal, base.today, ielts.plan.goal.defaultWeeks).weeks, 'weeks to the exam');
  const saturday = dailyPlan({ ...base, today: '2026-11-07', weekday: 6 });
  equal(saturday.tasks[0]?.slot, 'mock', 'the weekly mock on its day');
  equal(dailyPlan({ ...base, today: '2026-11-07', weekday: 6, mockDoneThisWeek: true }).tasks.some((task) => task.slot === 'mock'), false, 'not twice a week');
  const speakingTask = (input: PlannerInput) => dailyPlan(input).tasks.find((task) => task.slot === 'speaking');
  const first = speakingTask({ ...base, mastery: new Map([['speaking', { node: 'speaking', level: 5, mastery: 0.4, evidence: 3, lastScore: 5, lastAt: null, errors: {} }]]) });
  if (first?.part) {
    const next = speakingTask({ ...base, today: '2026-11-03', weekday: 2, recent: [{ activityId: first.activityId, slot: 'speaking', at: '2026-11-02T10:00:00Z', part: first.part }], mastery: new Map([['speaking', { node: 'speaking', level: 5, mastery: 0.4, evidence: 3, lastScore: 5, lastAt: null, errors: {} }]]) });
    assert(!next || next.part !== first.part, 'the part practised yesterday is not first again');
  }
  const drill = dailyPlan({ ...base, recurring: [{ tag: 'articles', weight: 3 }] }).tasks.find((task) => task.reason === 'recurring_error');
  if (ielts.errorById.get('articles')?.drill) assert(drill?.errorTag === 'articles', 'a recurring error brings its drill');
  const weeks = planWeeks(ielts, base.goal, base.today);
  assert(weeks.length >= 10 && weeks[0].phase.id !== weeks.at(-1)!.phase.id, 'phases change towards the exam');
});

Deno.test('report: the weekly report compares with last week and picks an honest headline', () => {
  const day = (at: string) => at.slice(0, 10);
  const session = (at: string, overall: number): SessionRecord => ({ rubric: 'speaking.conversation', overall, criteria: {}, minutes: 12, at, kind: 'roleplay' });
  const turn = (at: string, wpm: number, fillersPerMinute: number): TurnRecord => ({ at, words: 60, wpm, fillersPerMinute, fillersPer100: 4, range: 55, errors: ['articles'] } as TurnRecord);
  const last = summarizePeriod('2026-10-19', '2026-10-26', { sessions: [session('2026-10-20T10:00:00Z', 3)], turns: [turn('2026-10-20T10:00:00Z', 90, 8)], cards: [] }, day);
  const now = summarizePeriod('2026-10-26', '2026-11-02', { sessions: [session('2026-10-27T10:00:00Z', 3.5), session('2026-10-29T10:00:00Z', 3.5)], turns: [turn('2026-10-27T10:00:00Z', 104, 5), turn('2026-10-29T10:00:00Z', 110, 4)], cards: [{ at: '2026-10-28T08:00:00Z', correct: true }] }, day);
  equal([now.sessions, now.activeDays, now.minutes, now.cards], [2, 3, 24, { reviewed: 1, correct: 1 }], 'this week in numbers');
  const report = weeklyReport(speaking, now, last, null);
  const wpm = report.rows.find((row) => row.key === 'wpm')!;
  const fillers = report.rows.find((row) => row.key === 'fillers_per_minute')!;
  equal([wpm.before, wpm.after, wpm.verdict], [90, 107, 'better'], 'pace up');
  equal([fillers.delta, fillers.verdict, fillers.lowerIsBetter], [-3.5, 'better', true], 'fewer fillers is better');
  equal(report.headline?.key, 'result', 'a better result leads the headline');
  equal(report.focus, [{ tag: 'articles', count: 2 }], 'what to work on');
  const empty = weeklyReport(speaking, summarizePeriod('2026-11-02', '2026-11-09', { sessions: [], turns: [], cards: [] }, day), now, null);
  equal(empty.headline, null, 'no invented improvement in an empty week');
});
