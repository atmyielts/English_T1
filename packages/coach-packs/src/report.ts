import type { CoachPack } from './types.ts';

// Weekly reports with before/after numbers: this week against last week and against
// the learner's first week. Every number comes from a measured act (a scored
// answer, a checked set, a reviewed card); nothing is estimated for the report.

export interface SessionRecord {
  rubric: string | null;
  overall: number | null;
  criteria: Record<string, number | null>;
  minutes: number;
  at: string;
  kind: string;
  quiz?: { mode: string; correct: number; total: number } | null;
}
export interface TurnRecord {
  at: string;
  words: number;
  wpm: number | null;
  fillersPerMinute: number | null;
  fillersPer100: number | null;
  range: number | null;
  errors: string[];
}
export interface CardRecord { at: string; correct: boolean }

export interface PeriodStats {
  from: string;
  to: string;
  minutes: number;
  activeDays: number;
  sessions: number;
  /** Mean overall per rubric. */
  results: Record<string, number | null>;
  /** Mean per `rubric.criterion`. */
  criteria: Record<string, number | null>;
  wpm: number | null;
  fillersPerMinute: number | null;
  fillersPer100: number | null;
  range: number | null;
  words: number;
  errorsPer100: number | null;
  errorTags: Record<string, number>;
  quiz: Record<string, { correct: number; total: number; accuracy: number | null }>;
  cards: { reviewed: number; correct: number };
}

const mean = (values: number[]) => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null);
const nums = (values: (number | null | undefined)[]) => values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

export function summarizePeriod(from: string, to: string, data: { sessions: SessionRecord[]; turns: TurnRecord[]; cards: CardRecord[] }, dayOf: (at: string) => string): PeriodStats {
  const inRange = (at: string) => at >= from && at < to;
  const sessions = data.sessions.filter((session) => inRange(session.at));
  const turns = data.turns.filter((turn) => inRange(turn.at));
  const cards = data.cards.filter((card) => inRange(card.at));
  const days = new Set([...sessions.map((s) => dayOf(s.at)), ...turns.map((t) => dayOf(t.at)), ...cards.map((c) => dayOf(c.at))]);
  const byRubric = new Map<string, number[]>(), byCriterion = new Map<string, number[]>();
  for (const session of sessions) {
    if (!session.rubric) continue;
    if (typeof session.overall === 'number') byRubric.set(session.rubric, [...(byRubric.get(session.rubric) ?? []), session.overall]);
    for (const [id, value] of Object.entries(session.criteria)) if (typeof value === 'number') byCriterion.set(`${session.rubric}.${id}`, [...(byCriterion.get(`${session.rubric}.${id}`) ?? []), value]);
  }
  const quiz: PeriodStats['quiz'] = {};
  for (const session of sessions) {
    if (!session.quiz) continue;
    const entry = quiz[session.quiz.mode] ?? { correct: 0, total: 0, accuracy: null };
    entry.correct += session.quiz.correct; entry.total += session.quiz.total;
    entry.accuracy = entry.total ? Math.round((entry.correct / entry.total) * 100) : null;
    quiz[session.quiz.mode] = entry;
  }
  const words = turns.reduce((sum, turn) => sum + turn.words, 0);
  const errorCount = turns.reduce((sum, turn) => sum + turn.errors.length, 0);
  const errorTags: Record<string, number> = {};
  for (const turn of turns) for (const tag of turn.errors) errorTags[tag] = (errorTags[tag] ?? 0) + 1;
  return {
    from, to,
    minutes: Math.round(sessions.reduce((sum, session) => sum + session.minutes, 0)),
    activeDays: days.size,
    sessions: sessions.length,
    results: Object.fromEntries([...byRubric].map(([key, values]) => [key, mean(values)])),
    criteria: Object.fromEntries([...byCriterion].map(([key, values]) => [key, mean(values)])),
    wpm: mean(nums(turns.map((turn) => turn.wpm))),
    fillersPerMinute: mean(nums(turns.map((turn) => turn.fillersPerMinute))),
    fillersPer100: mean(nums(turns.map((turn) => turn.fillersPer100))),
    range: mean(nums(turns.map((turn) => turn.range))),
    words,
    errorsPer100: words >= 50 ? Math.round((errorCount / words) * 1000) / 10 : null,
    errorTags,
    quiz,
    cards: { reviewed: cards.length, correct: cards.filter((card) => card.correct).length },
  };
}

export type ReportRowKey = 'result' | 'criterion' | 'wpm' | 'fillers_per_minute' | 'fillers_per_100' | 'range' | 'errors_per_100' | 'quiz' | 'minutes' | 'active_days' | 'cards';
export interface ReportRow {
  key: ReportRowKey;
  /** Rubric id, `rubric.criterion` or quiz mode. */
  ref: string | null;
  start: number | null;
  before: number | null;
  after: number | null;
  /** After minus before (or minus start when there is no last week). */
  delta: number | null;
  lowerIsBetter: boolean;
  verdict: 'better' | 'worse' | 'same' | null;
}
export interface WeeklyReport {
  rows: ReportRow[];
  /** The clearest improvement this week, for the headline. */
  headline: ReportRow | null;
  /** Error types this week, most frequent first. */
  focus: { tag: string; count: number }[];
  current: PeriodStats;
}

export function weeklyReport(pack: CoachPack, current: PeriodStats, previous: PeriodStats | null, baseline: PeriodStats | null): WeeklyReport {
  const rows: ReportRow[] = [];
  const add = (key: ReportRowKey, ref: string | null, pick: (stats: PeriodStats) => number | null, lowerIsBetter = false) => {
    const after = pick(current), before = previous ? pick(previous) : null, start = baseline ? pick(baseline) : null;
    if (after === null && before === null) return;
    const base = before ?? start;
    const delta = after !== null && base !== null ? Math.round((after - base) * 100) / 100 : null;
    const verdict = delta === null ? null : Math.abs(delta) < 1e-9 ? 'same' : (lowerIsBetter ? delta < 0 : delta > 0) ? 'better' : 'worse';
    rows.push({ key, ref, start, before, after, delta, lowerIsBetter, verdict });
  };
  for (const rubric of pack.rubrics) {
    add('result', rubric.id, (stats) => stats.results[rubric.id] ?? null);
    for (const criterion of rubric.criteria.filter((entry) => entry.source === 'model')) add('criterion', `${rubric.id}.${criterion.id}`, (stats) => stats.criteria[`${rubric.id}.${criterion.id}`] ?? null);
  }
  add('wpm', null, (stats) => stats.wpm);
  add('fillers_per_minute', null, (stats) => stats.fillersPerMinute, true);
  add('fillers_per_100', null, (stats) => (stats.fillersPerMinute === null ? stats.fillersPer100 : null), true);
  add('range', null, (stats) => stats.range);
  add('errors_per_100', null, (stats) => stats.errorsPer100, true);
  for (const mode of ['reading', 'listening', 'practice']) add('quiz', mode, (stats) => stats.quiz[mode]?.accuracy ?? null);
  add('cards', null, (stats) => (stats.cards.reviewed ? Math.round((stats.cards.correct / stats.cards.reviewed) * 100) : null));
  add('minutes', null, (stats) => stats.minutes);
  add('active_days', null, (stats) => stats.activeDays);
  // The headline: the biggest gain among learning results, then measured habits.
  const gains = rows.filter((row) => row.verdict === 'better' && row.key !== 'minutes' && row.key !== 'active_days');
  const headline = gains.sort((a, b) => Number(b.key === 'result') - Number(a.key === 'result') || Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))[0] ?? null;
  const focus = Object.entries(current.errorTags).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 3);
  return { rows, headline, focus, current };
}
