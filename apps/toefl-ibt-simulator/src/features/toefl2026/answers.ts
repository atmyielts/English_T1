import { isRecord } from './tasks';

type Json = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

export const completeWordsAnswered = (data: Json, value: unknown): { done: number; total: number } => {
  const blanks = Array.isArray(data.blanks) ? (data.blanks as unknown[]).filter(isRecord) : [];
  const answers = isRecord(value) && isRecord(value.blanks) ? value.blanks : {};
  return { done: blanks.filter((b) => str(answers[str(b.id)]).length > 0).length, total: blanks.length };
};

export const buildSentenceAnswered = (value: unknown): boolean =>
  isRecord(value) && Array.isArray(value.order) && (value.order as unknown[]).length > 0 && (value.order as unknown[]).every(Boolean);

export const choiceAnswered = (value: unknown): boolean =>
  (isRecord(value) && str(value.selected_option).length > 0) || (typeof value === 'string' && value.length > 0);
