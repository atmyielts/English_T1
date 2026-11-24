import { SHORT_SETS, shortSetQuestionIds } from '../_shared/sat-practice-short-sets.ts';
import { loadBankQuestions } from './bank.ts';
import { AttemptError } from './completion.ts';
import { startSelected } from './start.ts';

export async function listShortSets(sb: Parameters<typeof loadBankQuestions>[0], userId: string) {
  const ids = SHORT_SETS.flatMap(set => shortSetQuestionIds(set.slug));
  const questions = await loadBankQuestions(sb, userId, { question_ids: ids, limit: ids.length });
  const available = new Set(questions.map(question => question.id));
  return SHORT_SETS.flatMap(set => {
    const setIds = shortSetQuestionIds(set.slug);
    return setIds.every(id => available.has(id)) ? [{ ...set, question_count: setIds.length }] : [];
  });
}

export async function startShortSet(sb: Parameters<typeof loadBankQuestions>[0], userId: string, body: Record<string, unknown>) {
  const set = SHORT_SETS.find(set => set.slug === body.slug);
  if (!set) throw new AttemptError(404, 'Short set not found.', 'not_found');
  const ids = shortSetQuestionIds(set.slug);
  const meta = { mode: 'drill', requested_count: ids.length,
    ...(set.time_limit_seconds ? { time_limit_seconds: set.time_limit_seconds } : {}) };
  const result = await startSelected(sb, userId, body, async () => {
    const questions = await loadBankQuestions(sb, userId, { question_ids: ids, limit: ids.length });
    const available = new Set(questions.map(question => question.id));
    if (!ids.every(id => available.has(id))) throw new AttemptError(404, 'Short set not found.', 'not_found');
    return { ids, meta };
  }, 'start_sat_practice_short_set_attempt');
  if (result.attempt.question_ids.length !== ids.length || result.attempt.question_ids.some((id: string, index: number) => id !== ids[index])) {
    throw new AttemptError(409, 'This start request was already used for another drill.', 'start_reused');
  }
  return result;
}
