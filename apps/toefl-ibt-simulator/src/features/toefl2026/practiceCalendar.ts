import { buildPracticeCalendar } from '../../../../../packages/exam-playbook-web/src/practiceCalendar';

const tasks = [
  'complete_the_words', 'read_daily_life', 'read_academic_passage', 'build_sentence',
  'write_email', 'write_academic_discussion', 'take_interview',
] as const;

const weeklyPattern = [
  ['complete_the_words', 'read_academic_passage', 'write_email', 'take_interview'],
  ['complete_the_words', 'read_daily_life', 'read_academic_passage', 'read_daily_life'],
  ['complete_the_words', 'read_academic_passage', 'build_sentence', 'take_interview'],
  ['complete_the_words', 'read_daily_life', 'write_academic_discussion', 'take_interview'],
  ['read_academic_passage', 'read_daily_life', 'write_academic_discussion', 'take_interview'],
] as const;

type StudyTask = typeof tasks[number];
type StudySection = { metadata: Record<string, unknown> | null };
export type ToeflPracticeSection = StudySection & { id: string; experience_id: string; name: string; display_order: number };

export const TOEFL_REVIEW_MINUTES = 10;
const checkpointWeek = (section: StudySection) => section.metadata?.practice_checkpoint_week;

export function buildToeflPracticeCalendar<Item extends StudySection>(bank: ReadonlyMap<string, readonly Item[]>) {
  const pools = Object.fromEntries(tasks.map(task => [task, (bank.get(task) ?? []).filter(section =>
    section.metadata?.practice_short_set === true && checkpointWeek(section) == null)]));
  return buildPracticeCalendar<StudyTask, Item>(pools, weeklyPattern);
}

export function toeflPracticeCheckpoints<Item extends StudySection>(bank: ReadonlyMap<string, readonly Item[]>) {
  const checkpoints = new Map<number, Item>();
  for (const sections of bank.values()) {
    for (const section of sections) {
      const week = checkpointWeek(section);
      if ((week === 2 || week === 4 || week === 6 || week === 8) && !checkpoints.has(week)) checkpoints.set(week, section);
    }
  }
  return checkpoints;
}

export const toeflDayMinutes = (sets: readonly StudySection[]) => TOEFL_REVIEW_MINUTES
  + Math.round(sets.reduce((total, set) => total + Number(set.metadata?.duration_seconds ?? 0), 0) / 60);
