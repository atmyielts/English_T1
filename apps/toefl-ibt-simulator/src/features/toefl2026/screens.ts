import { TASK_TYPE_DISCUSSION } from './tasks';

type Json = Record<string, unknown>;
export type RunnerUnit = {
  id: string;
  partId: string;
  partName?: string | null;
  partOrder?: number | null;
  type: string;
  data: Json;
  displayOrder: number;
  metadata?: Json | null;
};
type ScreenKind = 'reading' | 'listening' | 'bs' | 'email' | 'discussion' | 'speaking';
export type Screen = { key: string; kind: ScreenKind; group: string; stimulus: RunnerUnit | null; questions: RunnerUnit[] };

export const buildScreens = (units: RunnerUnit[]): Screen[] => {
  const parts = new Map<string, RunnerUnit[]>();
  const order: string[] = [];
  const sorted = [...units].sort((a, b) => (a.partOrder ?? 0) - (b.partOrder ?? 0) || a.displayOrder - b.displayOrder);
  for (const u of sorted) {
    if (!parts.has(u.partId)) { parts.set(u.partId, []); order.push(u.partId); }
    parts.get(u.partId)!.push(u);
  }
  const screens: Screen[] = [];
  for (const partId of order) {
    const list = parts.get(partId)!;
    const questions = list.filter((u) => u.type.startsWith('question_'));
    const audio = list.find((u) => u.type === 'audio') ?? null;
    const passage = list.find((u) => u.type === 'reading_passage') ?? null;
    const bs = questions.filter((u) => u.type === 'question_build_sentence');
    const speaking = questions.filter((u) => u.type === 'question_speaking_repeat' || u.type === 'question_speaking_interview');
    if (bs.length) {
      bs.forEach((u) => screens.push({ key: u.id, kind: 'bs', group: `bs:${partId}`, stimulus: null, questions: [u] }));
    } else if (speaking.length) {
      speaking.forEach((u) => screens.push({ key: u.id, kind: 'speaking', group: `speaking:${partId}`, stimulus: null, questions: [u] }));
    } else if (questions.length === 1 && questions[0].type === 'question_text') {
      const taskType = String(questions[0].data.task_type ?? '');
      screens.push({ key: questions[0].id, kind: taskType === TASK_TYPE_DISCUSSION ? 'discussion' : 'email', group: `text:${partId}`, stimulus: null, questions });
    } else if (audio) {
      screens.push({ key: partId, kind: 'listening', group: `part:${partId}`, stimulus: audio, questions });
    } else if (questions.length) {
      screens.push({ key: partId, kind: 'reading', group: `part:${partId}`, stimulus: passage, questions });
    }
  }
  return screens;
};

