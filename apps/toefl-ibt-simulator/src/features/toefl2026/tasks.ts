import {
  PLAYBOOK_MODULE_FOR_TASK,
  TASK_SECTION,
  TOEFL_2026_FORMAT,
  TOEFL_2026_TASKS,
  type Toefl2026Section,
  type Toefl2026Task,
} from '../../../../../supabase/functions/_shared/toefl-2026.ts';

export * from '../../../../../supabase/functions/_shared/toefl-2026.ts';

type Json = Record<string, unknown>;

export const isRecord = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);

export const is2026Metadata = (metadata: unknown): boolean =>
  isRecord(metadata) && String(metadata.format ?? '').toLowerCase() === TOEFL_2026_FORMAT;

/**
 * `/practice?task=<id>` accepts the scorer task ids and the short ids other
 * Schood services use (e.g. the TOEFL Playbook): `academic_passage`,
 * `conversation`, `announcement`, `academic_talk`, `academic_discussion`.
 */
const TASK_ALIASES: Record<string, Toefl2026Task> = {
  academic_passage: 'read_academic_passage',
  read_academic: 'read_academic_passage',
  daily_life: 'read_daily_life',
  conversation: 'listen_conversation',
  announcement: 'listen_announcement',
  academic_talk: 'listen_academic_talk',
  choose_response: 'listen_choose_response',
  academic_discussion: 'write_academic_discussion',
  discussion: 'write_academic_discussion',
  email: 'write_email',
  interview: 'take_interview',
  repeat: 'listen_repeat',
};

export const resolveTaskParam = (value: string | null | undefined): Toefl2026Task | null => {
  const v = String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (!v) return null;
  if ((TOEFL_2026_TASKS as readonly string[]).includes(v)) return v as Toefl2026Task;
  return TASK_ALIASES[v] ?? null;
};

export const sectionOfTask = (task: Toefl2026Task): Toefl2026Section => TASK_SECTION[task];
export const playbookSlugForTask = (task: Toefl2026Task): string => PLAYBOOK_MODULE_FOR_TASK[task];

export const TASKS_BY_SECTION: Array<{ section: Toefl2026Section; tasks: Toefl2026Task[] }> = (
  ['reading', 'listening', 'writing', 'speaking'] as Toefl2026Section[]
).map((section) => ({ section, tasks: TOEFL_2026_TASKS.filter((t) => TASK_SECTION[t] === section) }));
