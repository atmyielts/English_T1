export type TutorMode = 'explain' | 'simpler' | 'similar' | 'why-wrong';
export type TutorReceipt = { requestId: string; mode: TutorMode };
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function tutorStorageKey(actor: string, attempt: string, question: string) {
  if (![actor, attempt, question].every(id => uuid.test(id))) throw new Error('Reopen the tutor from your completed results.');
  return `schood.sat-tutor.pending.${actor}.${attempt}.${question}`;
}
export function readTutorReceipt(storage: Store, key: string): TutorReceipt | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || typeof value.requestId !== 'string' || !uuid.test(value.requestId) || !['explain', 'simpler', 'similar', 'why-wrong'].includes(value.mode)) {
    throw new Error('The saved tutor request could not be recovered. Please contact support.');
  }
  return { requestId: value.requestId, mode: value.mode };
}
export function prepareTutorReceipt(storage: Store, key: string, mode: TutorMode, createId: () => string = () => crypto.randomUUID()): TutorReceipt {
  const existing = readTutorReceipt(storage, key);
  if (existing) return existing;
  const receipt = { requestId: createId(), mode };
  if (!uuid.test(receipt.requestId)) throw new Error('The tutor request could not be prepared. Please retry.');
  storage.setItem(key, JSON.stringify(receipt));
  return receipt;
}
export function acknowledgeTutorReceipt(storage: Store, key: string, requestId: string) {
  if (readTutorReceipt(storage, key)?.requestId === requestId) storage.removeItem(key);
}
export function isTutorQuota(value: unknown): value is { api_version: number; used: number; limit: number; remaining: number; enabled: boolean; attempts_remaining: number } {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.api_version === 2 && typeof row.enabled === 'boolean'
    && typeof row.limit === 'number' && [2, 20].includes(row.limit)
    && typeof row.used === 'number' && Number.isInteger(row.used) && row.used >= 0
    && typeof row.remaining === 'number' && Number.isInteger(row.remaining) && row.remaining >= 0 && row.remaining <= row.limit
    && typeof row.attempts_remaining === 'number' && Number.isInteger(row.attempts_remaining) && row.attempts_remaining >= 0 && row.attempts_remaining <= row.limit * 3;
}
export function isTutorFeedback(value: unknown): value is { steps: string[]; key_concept: string; why_distractors_wrong: Record<string, string>; similar_question?: { prompt: string; choices: { id: string; text: string }[]; correct_choice: string; explanation: string } } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !v.includes('\0');
  if (!Array.isArray(row.steps) || row.steps.length < 1 || row.steps.length > 8 || !row.steps.every(v => text(v, 1200)) || !text(row.key_concept, 500)) return false;
  if (!row.why_distractors_wrong || typeof row.why_distractors_wrong !== 'object' || Array.isArray(row.why_distractors_wrong)) return false;
  const distractors = Object.entries(row.why_distractors_wrong);
  if (distractors.length > 8 || distractors.some(([key, v]) => !/^[A-Za-z0-9_-]{1,32}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key) || !text(v, 1000))) return false;
  if (row.similar_question !== undefined) {
    const similar = row.similar_question as Record<string, unknown> | null;
    if (!similar || typeof similar !== 'object' || !text(similar.prompt, 4000) || !text(similar.explanation, 3000) || !Array.isArray(similar.choices) || similar.choices.length !== 4) return false;
    const ids: string[] = [];
    for (const choice of similar.choices) {
      if (!choice || typeof choice !== 'object' || typeof choice.id !== 'string' || !/^[A-D]$/.test(choice.id) || !text(choice.text, 1000)) return false;
      ids.push(choice.id);
    }
    if (new Set(ids).size !== 4 || typeof similar.correct_choice !== 'string' || !ids.includes(similar.correct_choice)) return false;
  }
  return true;
}
