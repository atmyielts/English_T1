import { nodeLevel, type MasteryState } from './progress.ts';
import type { Activity, CoachPack, PlanPhase, PlanSlot } from './types.ts';

// The daily plan: from the goal (target, exam date, minutes a day), the phase of
// the plan, the learner's gaps (target minus measured level per skill), recurring
// errors and what they did recently. Deterministic for a given day and person, so
// the bot, the reminder and the Mini App show the same plan.

export interface Goal { target: number; examDate: string | null; dailyMinutes: number; startedAt: string }
export interface PlannerInput {
  pack: CoachPack;
  goal: Goal;
  mastery: ReadonlyMap<string, MasteryState>;
  /** Recent finished sessions, newest first. */
  recent: { activityId: string; slot: string; at: string; part?: string | null }[];
  dueCards: number;
  recurring: { tag: string; weight: number }[];
  /** The learner's local date (YYYY-MM-DD) and weekday (0 = Sunday). */
  today: string;
  weekday: number;
  mockDoneThisWeek: boolean;
  /** Stable per person, so two people get different but repeatable picks. */
  seed: string;
}
export type TaskReason = 'weekly_mock' | 'gap' | 'recurring_error' | 'due_cards' | 'new_cards' | 'balance';
export interface PlanTask {
  slot: PlanSlot | 'mock';
  activityId: string;
  minutes: number;
  reason: TaskReason;
  node: string;
  errorTag?: string;
  cards?: number;
  /** Speaking: which part to practise. */
  part?: string;
}
export interface DayPlan { phase: PlanPhase; weeksLeft: number; daysLeft: number | null; tasks: PlanTask[]; minutes: number }

const DAY = 86_400_000;
const hash = (text: string) => { let h = 2166136261; for (const char of text) { h ^= char.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; };
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export function weeksLeft(goal: Goal, today: string, defaultWeeks: number): { weeks: number; days: number | null } {
  if (goal.examDate) {
    const days = Math.max(0, daysBetween(today, goal.examDate));
    return { weeks: Math.ceil(days / 7), days };
  }
  const end = new Date(Date.parse(goal.startedAt) + defaultWeeks * 7 * DAY).toISOString().slice(0, 10);
  const days = Math.max(0, daysBetween(today, end));
  return { weeks: Math.ceil(days / 7), days };
}

export function phaseFor(pack: CoachPack, weeks: number): PlanPhase {
  return pack.plan.phases.find((phase) => weeks >= phase.minWeeksLeft) ?? pack.plan.phases.at(-1)!;
}

/** Activities that fill a slot. */
export function slotActivities(pack: CoachPack, slot: PlanSlot): Activity[] {
  switch (slot) {
    case 'speaking': return pack.ofKind('speaking_exam');
    case 'roleplay': return pack.ofKind('roleplay');
    case 'writing': return pack.ofKind('writing');
    case 'reading': case 'listening': case 'practice': return pack.ofKind('quiz_set').filter((set) => set.mode === slot);
    case 'vocab': return pack.ofKind('deck');
    case 'drill': return pack.ofKind('drill');
    case 'shadowing': return pack.ofKind('shadowing');
    case 'lesson': return pack.ofKind('lesson');
    case 'photo': return [];
  }
}

const rootOf = (pack: CoachPack, node: string) => { let at = node; for (let i = 0; i < 20; i++) { const parent = pack.skillById.get(at)?.parent; if (!parent) return at; at = parent; } return at; };
const fits = (activity: Activity, level: number | null) => level === null || (level >= activity.levels[0] - 0.5 && level <= activity.levels[1] + 0.5);

/** The least recently done activity that suits the level; ties broken by the seed. */
function pickActivity(candidates: Activity[], recent: PlannerInput['recent'], level: number | null, seed: number): Activity | null {
  const suited = candidates.filter((activity) => fits(activity, level));
  const pool = suited.length ? suited : candidates;
  if (!pool.length) return null;
  const last = new Map<string, number>();
  for (const entry of recent) if (!last.has(entry.activityId)) last.set(entry.activityId, Date.parse(entry.at));
  return [...pool].sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0) || (hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`)))[0];
}

export function dailyPlan(input: PlannerInput): DayPlan {
  const { pack, goal } = input;
  const { weeks, days } = weeksLeft(goal, input.today, pack.plan.goal.defaultWeeks);
  const phase = phaseFor(pack, weeks);
  const seed = hash(`${input.seed}:${input.today}`);
  const scale = pack.manifest.scale;
  const tasks: PlanTask[] = [];
  let minutes = 0;
  const budget = Math.max(5, goal.dailyMinutes);

  const mock = pack.plan.weeklyMock ? pack.byId.get(pack.plan.weeklyMock.activity) : undefined;
  if (mock && pack.plan.weeklyMock!.weekday === input.weekday && !input.mockDoneThisWeek) {
    tasks.push({ slot: 'mock', activityId: mock.id, minutes: mock.minutes, reason: 'weekly_mock', node: mock.node });
    minutes += mock.minutes;
  }

  const doneOn = (slot: string, offsetDays: number) => input.recent.some((entry) => entry.slot === slot && daysBetween(entry.at.slice(0, 10), input.today) === offsetDays);
  const weighted = (Object.entries(phase.mix) as [PlanSlot, number][]).map(([slot, base]) => {
    const candidates = slotActivities(pack, slot);
    if (!candidates.length) return { slot, weight: 0 };
    let weight = base;
    const root = rootOf(pack, candidates[0].node);
    const level = nodeLevel(pack, input.mastery, root);
    if (level !== null) weight *= 1 + Math.min(1.5, (Math.max(0, goal.target - level) / (scale.max - scale.min)) * 6);
    if (slot === 'drill') weight *= input.recurring.some((error) => pack.errorById.get(error.tag)?.drill) ? 1.5 : 0;
    if (slot === 'vocab') weight *= input.dueCards > 0 ? 1.3 : 0.8;
    if (doneOn(slot, 0)) weight *= 0.3; else if (doneOn(slot, 1)) weight *= 0.7;
    return { slot, weight };
  }).filter((entry) => entry.weight > 0).sort((a, b) => b.weight - a.weight || hash(`${seed}:${a.slot}`) - hash(`${seed}:${b.slot}`));

  const used = new Set<string>();
  for (const { slot } of weighted) {
    if (minutes >= budget * 0.9 || tasks.length >= 4) break;
    if (slot === 'drill') {
      const error = input.recurring.find((entry) => pack.errorById.get(entry.tag)?.drill);
      const drill = error ? pack.byId.get(pack.errorById.get(error.tag)!.drill!) : undefined;
      if (!drill || used.has(drill.id)) continue;
      tasks.push({ slot, activityId: drill.id, minutes: drill.minutes, reason: 'recurring_error', node: drill.node, errorTag: error!.tag });
      used.add(drill.id); minutes += drill.minutes;
      continue;
    }
    if (slot === 'vocab') {
      const deck = pickActivity(slotActivities(pack, 'vocab'), input.recent, null, seed);
      if (!deck) continue;
      tasks.push({ slot, activityId: deck.id, minutes: 5, reason: input.dueCards > 0 ? 'due_cards' : 'new_cards', node: deck.node, cards: input.dueCards > 0 ? Math.min(input.dueCards, 15) : 8 });
      used.add(deck.id); minutes += 5;
      continue;
    }
    const candidates = slotActivities(pack, slot).filter((activity) => !used.has(activity.id));
    const root = candidates[0] ? rootOf(pack, candidates[0].node) : null;
    const level = root ? nodeLevel(pack, input.mastery, root) : null;
    const activity = pickActivity(candidates, input.recent, level, seed);
    if (!activity) continue;
    if (activity.minutes > budget - minutes + 10 && tasks.length) continue;
    const task: PlanTask = { slot, activityId: activity.id, minutes: activity.minutes, reason: level !== null && goal.target - level >= scale.step ? 'gap' : 'balance', node: activity.node };
    if (activity.kind === 'speaking_exam') {
      // Rotate the parts: the one practised least recently.
      const parts = activity.parts.map((part) => part.id);
      const lastPart = new Map<string, number>();
      for (const entry of input.recent) if (entry.part && !lastPart.has(entry.part)) lastPart.set(entry.part, Date.parse(entry.at));
      task.part = [...parts].sort((a, b) => (lastPart.get(a) ?? 0) - (lastPart.get(b) ?? 0))[0];
      const part = activity.parts.find((entry) => entry.id === task.part)!;
      task.minutes = part.kind === 'long_turn' ? 5 : 4;
    }
    tasks.push(task);
    used.add(activity.id); minutes += task.minutes;
  }
  return { phase, weeksLeft: weeks, daysLeft: goal.examDate ? days : null, tasks, minutes };
}

/** The plan to the exam date, week by week: phase, focus slots and the mock day. */
export function planWeeks(pack: CoachPack, goal: Goal, today: string, max = 16): { week: number; phase: PlanPhase; focus: PlanSlot[]; mock: boolean }[] {
  const { weeks } = weeksLeft(goal, today, pack.plan.goal.defaultWeeks);
  const out: { week: number; phase: PlanPhase; focus: PlanSlot[]; mock: boolean }[] = [];
  for (let i = 0; i < Math.min(Math.max(weeks, 1), max); i++) {
    const phase = phaseFor(pack, Math.max(0, weeks - i));
    const focus = (Object.entries(phase.mix) as [PlanSlot, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([slot]) => slot);
    out.push({ week: i + 1, phase, focus, mock: !!pack.plan.weeklyMock });
  }
  return out;
}
