import { SAT_DOMAINS } from '../_shared/sat-practice-core.ts';
import { AttemptError } from './completion.ts';

export type BankFilters = {
  section_type?: 'math' | 'reading_writing';
  domain?: typeof SAT_DOMAINS[number];
  difficulty?: 'easy' | 'medium' | 'hard';
  mistake_history?: 'previously_missed' | 'mastered' | 'unseen';
  question_ids?: string[];
  limit: number;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Invalid filters must never silently become a different subject or an unrestricted drill.
export function bankFilters(input: Record<string, unknown>, defaultLimit = 30): BankFilters {
  const result: BankFilters = { limit: defaultLimit };
  const choices = {
    section_type: ['math', 'reading_writing'], domain: SAT_DOMAINS,
    difficulty: ['easy', 'medium', 'hard'],
    mistake_history: ['previously_missed', 'mastered', 'unseen'],
  };
  for (const [name, allowed] of Object.entries(choices)) {
    const value = input[name];
    if (value == null || value === '') continue;
    if (typeof value !== 'string' || !allowed.includes(value as never)) {
      throw new AttemptError(400, `Invalid ${name.replaceAll('_', ' ')} filter.`);
    }
    Object.assign(result, { [name]: value });
  }
  if (input.limit != null && input.limit !== '') {
    const limit = Number(input.limit);
    if (!['string', 'number'].includes(typeof input.limit) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AttemptError(400, 'Choose between 1 and 100 questions.');
    }
    result.limit = limit;
  }
  if (input.question_ids !== undefined) {
    const ids = input.question_ids;
    if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !uuid.test(id))) {
      throw new AttemptError(400, 'Invalid question selection.');
    }
    // [] means no questions, not all questions. Deduplicate without changing order.
    result.question_ids = [...new Set(ids.map(id => id.toLowerCase()))];
  }
  return result;
}

export async function loadBankQuestions(
  sb: any, userId: string, filters: BankFilters,
  options: { includeRetired?: boolean } = {},
): Promise<any[]> {
  if (filters.question_ids?.length === 0) return [];
  const { data, error } = await sb.rpc('select_sat_practice_questions', {
    p_user_id: userId,
    p_section: filters.section_type ?? null,
    p_domain: filters.domain ?? null,
    p_difficulty: filters.difficulty ?? null,
    p_history: filters.mistake_history ?? null,
    p_question_ids: filters.question_ids ?? null,
    p_limit: filters.limit,
    // Only the owned attempt paths may request retired questions for old work.
    p_include_retired: options.includeRetired === true && filters.question_ids != null,
  });
  if (error || !Array.isArray(data)) {
    throw new AttemptError(503, 'The question bank is temporarily unavailable. Please retry.');
  }
  return data;
}
