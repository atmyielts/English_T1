import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { practiceAccess, questionForLearner, SAT_PRACTICE_PRODUCT_ID } from './access.ts';

Deno.test('SAT backend requires the exact effective product, including sponsored or bundled access', async () => {
  for (const ids of [[], ['another-product'], [SAT_PRACTICE_PRODUCT_ID]]) {
    const fetcher: typeof fetch = async (_url, options) => {
      assertEquals(new Headers(options?.headers).get('Authorization'), 'Bearer learner-token');
      return Response.json({ effective_product_ids: ids });
    };
    assertEquals(await practiceAccess('https://example.invalid', 'public-key', 'learner-token', fetcher), ids.includes(SAT_PRACTICE_PRODUCT_ID) ? 'allowed' : 'denied');
  }
});

Deno.test('entitlement outage or malformed payload does not permit practice or mislabel it as unpaid', async () => {
  for (const response of [new Response('', { status: 503 }), Response.json({}), new Response('invalid json')]) {
    assertEquals(await practiceAccess('https://example.invalid', '', '', async () => response), 'unavailable');
  }
  assertEquals(await practiceAccess('https://example.invalid', '', '', async () => { throw new TypeError('offline'); }), 'unavailable');
});

Deno.test('questions retain usable content while withholding keys before submission', () => {
  const serverQuestion = { id: 'question', type: 'question_mcq', data: { prompt: 'Choose', options: ['a', 'b'] }, correct: ['b'] };
  assertEquals(questionForLearner(serverQuestion), { id: 'question', type: 'question_mcq', data: serverQuestion.data });
  assertEquals(serverQuestion.correct, ['b']);
});
