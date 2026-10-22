import { findSection, type ExamFormat } from './format.ts';
import { initialMastery, masteryLevel, targetDifficulty, type Difficulty, type MasteryState } from './mastery.ts';
import { blockShares, type Taxonomy } from './topics.ts';

// The daily plan: the next best minutes, ordered by exam weight × weakness × time left.

export interface PlanTask {
  topic_code: string;
  reason: 'weak' | 'review' | 'prerequisite';
  questions: number;
  difficulty: Difficulty;
  /** Points in the learner's section still to gain on this topic. */
  points_recoverable: number;
}

export interface TopicPriority {
  topic_code: string;
  mastery: number;
  points_at_stake: number;
  points_recoverable: number;
  priority: number;
  reason: PlanTask['reason'];
}

export interface PlanInput {
  taxonomy: Taxonomy;
  format: ExamFormat;
  sectionId: string;
  mastery: ReadonlyMap<string, MasteryState>;
  now: Date;
  examDate: Date | null;
  minutes: number;
  /** Topics that have practice questions. Others are left out of the plan. */
  available?: ReadonlySet<string>;
}

const DAY = 86_400_000;
const round1 = (value: number) => Math.round(value * 10) / 10;

export function daysLeft(now: Date, examDate: Date | null): number | null {
  return examDate ? Math.max(0, Math.ceil((examDate.getTime() - now.getTime()) / DAY)) : null;
}

export function topicPriorities(input: PlanInput): TopicPriority[] {
  const section = findSection(input.format, input.sectionId);
  const shares = blockShares(input.taxonomy, section.block);
  const sectionPoints = section.questions * section.points_per_question;
  const remaining = daysLeft(input.now, input.examDate);
  const levelOf = (code: string) => masteryLevel(input.mastery.get(code) ?? initialMastery(), input.now);
  const priorities = new Map<string, TopicPriority>();
  for (const topic of input.taxonomy.topics) {
    const share = shares.get(topic.code);
    if (share === undefined) continue;
    const state = input.mastery.get(topic.code) ?? initialMastery();
    const mastery = levelOf(topic.code);
    const atStake = share * sectionPoints;
    const recoverable = atStake * (1 - mastery);
    // A topic whose prerequisites are still weak is practised later; its prerequisites carry the work.
    const blocked = topic.prerequisites.some((code) => levelOf(code) < 0.5);
    // Close to the exam, partly known topics give the fastest gains; brand-new ones the slowest.
    const urgency = remaining !== null && remaining <= 14 ? (mastery >= 0.3 ? 1.3 : 0.6) : 1;
    const due = state.next_review_at !== null && Date.parse(state.next_review_at) <= input.now.getTime();
    const priority = recoverable * (blocked ? 0.5 : 1) * urgency + (due ? 0.3 * atStake * mastery : 0);
    priorities.set(topic.code, {
      topic_code: topic.code,
      mastery,
      points_at_stake: atStake,
      points_recoverable: recoverable,
      priority,
      reason: due && mastery >= 0.6 ? 'review' : 'weak',
    });
  }
  // Weak prerequisites inherit half the urgency of the topics they unlock, even across blocks.
  for (const topic of input.taxonomy.topics) {
    const dependent = priorities.get(topic.code);
    if (!dependent) continue;
    for (const code of topic.prerequisites) {
      if (levelOf(code) >= 0.5) continue;
      const current = priorities.get(code);
      const inherited = 0.5 * dependent.points_recoverable;
      if (current) {
        current.priority += inherited;
        if (current.reason === 'weak' && inherited > current.points_recoverable) current.reason = 'prerequisite';
      } else {
        priorities.set(code, { topic_code: code, mastery: levelOf(code), points_at_stake: 0, points_recoverable: 0, priority: inherited, reason: 'prerequisite' });
      }
    }
  }
  return [...priorities.values()]
    .filter((row) => !input.available || input.available.has(row.topic_code))
    .sort((a, b) => b.priority - a.priority || a.topic_code.localeCompare(b.topic_code));
}

export function buildDailyPlan(input: PlanInput): PlanTask[] {
  const section = findSection(input.format, input.sectionId);
  const minutesPerQuestion = section.block === 'compulsory' ? 1.5 : 3;
  let budget = Math.max(0, Math.floor(input.minutes / minutesPerQuestion));
  const tasks: PlanTask[] = [];
  for (const row of topicPriorities(input)) {
    if (budget <= 0 || tasks.length >= 4) break;
    const questions = Math.min(budget, row.reason === 'review' ? 3 : 5);
    tasks.push({
      topic_code: row.topic_code,
      reason: row.reason,
      questions,
      difficulty: targetDifficulty(input.mastery.get(row.topic_code) ?? initialMastery()),
      points_recoverable: round1(row.points_recoverable),
    });
    budget -= questions;
  }
  return tasks;
}
