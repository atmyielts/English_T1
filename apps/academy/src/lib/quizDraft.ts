import type { TeacherStudioQuizQuestion } from './client';

export type QuizDraftScope = { actorId: string; academyId: string; classroomId: string; quizId: string; attemptId: string };
const prefix = 'schood.academy.quiz-draft.v1:';
const maxLength = 512_000;
const keyFor = (scope: QuizDraftScope) => prefix + [scope.actorId, scope.academyId, scope.classroomId, scope.quizId, scope.attemptId].map(encodeURIComponent).join(':');

// Tab-local drafts belong to one authenticated actor and one server-issued attempt.
export const clearOtherQuizDrafts = (actorId: string) => {
  try {
    const keepPrefix = actorId ? `${prefix}${encodeURIComponent(actorId)}:` : '';
    const keys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index));
    for (const key of keys) if (key?.startsWith(prefix) && (!keepPrefix || !key.startsWith(keepPrefix))) sessionStorage.removeItem(key);
  } catch { /* Storage can be unavailable; no drafts can then be read or written. */ }
};

export const readQuizDraft = (scope: QuizDraftScope, questions: TeacherStudioQuizQuestion[]): Record<string, unknown> => {
  try {
    const text = sessionStorage.getItem(keyFor(scope));
    if (!text || text.length > maxLength) return {};
    const draft = JSON.parse(text);
    if (draft?.version !== 1 || !draft.scope || !draft.answers || typeof draft.answers !== 'object' || Array.isArray(draft.answers)) return {};
    if (Object.entries(scope).some(([key, value]) => draft.scope[key] !== value)) return {};
    const answers: Record<string, unknown> = {};
    for (const question of questions) {
      const value = draft.answers[question.id];
      const options = (question.options ?? []).map(String);
      if (question.question_type === 'multiple_choice') {
        if (Array.isArray(value) && value.every(item => typeof item === 'string' && options.includes(item))) answers[question.id] = [...new Set(value)];
      } else if (question.question_type === 'true_false') {
        if (typeof value === 'boolean') answers[question.id] = value;
      } else if (typeof value === 'string' && (question.question_type !== 'single_choice' || options.includes(value))) answers[question.id] = value;
    }
    return answers;
  } catch { return {}; }
};

export const writeQuizDraft = (scope: QuizDraftScope, answers: Record<string, unknown>): boolean => {
  try {
    const text = JSON.stringify({ version: 1, scope, answers });
    if (text.length > maxLength) return false;
    sessionStorage.setItem(keyFor(scope), text);
    return true;
  } catch { return false; }
};

export const removeQuizDraft = (scope: QuizDraftScope) => {
  try { sessionStorage.removeItem(keyFor(scope)); } catch { /* Do not undo a confirmed submission. */ }
};
