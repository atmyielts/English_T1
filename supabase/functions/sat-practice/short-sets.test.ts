import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { shortSetQuestionIds } from '../_shared/sat-practice-short-sets.ts';
import { questionForLearner } from './access.ts';
import { AttemptError } from './completion.ts';
import { listShortSets, startShortSet } from './short-sets.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const timed = shortSetQuestionIds('timed-02');
const bankQuestions = (ids: string[]) => ids.map(id => ({
  id, data: { prompt: 'Unscored prompt' }, correct: { option_id: 'C', feedback: { explanation: 'Saved key' } },
}));

Deno.test('short-set listing only returns complete sets and excludes question data and keys', async () => {
  const sb = { rpc: (name: string, args: Record<string, unknown>) => {
    assertEquals(name, 'select_sat_practice_questions');
    assertEquals(args.p_user_id, userId);
    assertEquals((args.p_question_ids as string[]).length, 48);
    return Promise.resolve({ data: bankQuestions([...timed, ...shortSetQuestionIds('paired-01').slice(0, -1)]) });
  } };
  assertEquals(await listShortSets(sb, userId), [{
    slug: 'timed-02', title: 'Words, evidence and quantities', category: 'timed',
    time_limit_seconds: 360, checkpoint_week: 6, question_count: 4,
  }]);
});

Deno.test('short-set start freezes its authored order and timer without client-supplied questions', async () => {
  const query = {
    select: () => query, eq: () => query,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  const sb = {
    from: () => query,
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'select_sat_practice_questions') {
        assertEquals(args.p_question_ids, timed);
        return Promise.resolve({ data: bankQuestions([...timed].reverse()) });
      }
      assertEquals(name, 'start_sat_practice_short_set_attempt');
      assertEquals(args, { p_user_id: userId, p_request_id: requestId, p_filters: {
        mode: 'drill', time_limit_seconds: 360, requested_count: 4, question_ids: timed, limit: 4,
      } });
      return Promise.resolve({ data: { attempt: { id: requestId, question_ids: timed }, questions: bankQuestions(timed) } });
    },
  };
  const result = await startShortSet(sb, userId, { slug: 'timed-02', request_id: requestId, question_ids: ['other'] });
  assertEquals(result.questions.map(questionForLearner).map((question: object) => Object.hasOwn(question, 'correct')), [false, false, false, false]);
});

Deno.test('short-set start rejects unknown and incomplete sets before creating an attempt', async () => {
  const query = {
    select: () => query, eq: () => query,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  const sb = { from: () => query, rpc: (name: string) => {
    assertEquals(name, 'select_sat_practice_questions');
    return Promise.resolve({ data: bankQuestions(timed.slice(1)) });
  } };
  await assertRejects(() => startShortSet(sb, userId, { slug: 'missing', request_id: requestId }), AttemptError, 'not found');
  await assertRejects(() => startShortSet(sb, userId, { slug: 'timed-02', request_id: requestId }), AttemptError, 'not found');
});
