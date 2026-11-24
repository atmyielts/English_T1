import { assertEquals } from 'jsr:@std/assert';
import { checkLibraryReading, practiceLibraryRequest } from './library.ts';

Deno.test('IELTS Library grades complete reading answers and includes evidence in feedback', () => {
  const keys = [{ key: 2, explanation: 'The lease covers summer only.', evidence: 'Paragraph B' }];
  const questions = [{ options: ['Winter', 'All year', 'Summer', 'Autumn'] }];
  assertEquals(checkLibraryReading(keys, [2], questions), { score: 1, total: 1, items: [{ correct: true, key: 2, explanation: 'The lease covers summer only.', evidence: 'Paragraph B' }] });
  assertEquals(checkLibraryReading(keys, [1], questions)?.score, 0);
  for (const invalid of [[], [null], [5], ['2']]) assertEquals(checkLibraryReading(keys, invalid, questions), null);
});

Deno.test('IELTS Library checks mixed choices and typed responses without accepting unlisted forms', () => {
  const keys = [{ key: 2 }, { key: ['pilot’s', 'operator'] }];
  const questions = [{ options: ['True', 'False', 'Not Given'] }, { options: null }];
  assertEquals(checkLibraryReading(keys, [2, " PILOT'S  "], questions)?.score, 2);
  assertEquals(checkLibraryReading(keys, [2, 'operator'], questions)?.score, 2);
  assertEquals(checkLibraryReading(keys, [2, 'workers'], questions)?.score, 1);
  assertEquals(checkLibraryReading(keys, [3, 'operator'], questions), null);
  assertEquals(checkLibraryReading(keys, [2, 3], questions), null);
  assertEquals(checkLibraryReading(keys, [2, ' '], questions), null);
});

Deno.test('IELTS Library selects only learner content before submission', async () => {
  const db = { from(table: string) {
    assertEquals(table, 'ielts_practice_library_sets');
    return { select(fields: string) {
      assertEquals(fields.includes('review_content'), false);
      const query = { eq(key: string, value: unknown) {
        assertEquals(value, key === 'is_published' ? true : 'reading-demo');
        return query;
      }, lte(key: string, value: number) {
        assertEquals([key, value], ['response_format_version', 1]);
        return query;
      }, maybeSingle() {
        return { data: { slug: 'reading-demo', learner_content: { questions: [{ prompt: 'What changed?' }] } }, error: null };
      } };
      return query;
    } };
  } };
  const response = await practiceLibraryRequest(db, 'reader-1', 'GET', '/library/reading-demo');
  assertEquals(response.status, 200);
  assertEquals(response.body, { set: { slug: 'reading-demo', learner_content: { questions: [{ prompt: 'What changed?' }] } } });
});

Deno.test('IELTS Library records a valid Reading review for the authenticated learner only', async () => {
  const calls: unknown[] = [];
  const db = {
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        lte(key: string, value: number) { assertEquals([key, value], ['response_format_version', 2]); return query; },
        maybeSingle() {
          return { data: {
            skill: 'reading',
            learner_content: { questions: [{ options: null }] },
            review_content: { questions: [{ key: ['noon'], explanation: 'The notice gives the time.', evidence: 'Notice A' }] },
          }, error: null };
        },
      };
      return query;
    },
    rpc(...args: unknown[]) { calls.push(args); return { error: null }; },
  };
  const path = '/library/reading-demo/review';
  assertEquals((await practiceLibraryRequest(db, 'reader-1', 'POST', path, { answers: [0] }, 2)).status, 422);
  assertEquals(calls.length, 0);
  const result = await practiceLibraryRequest(db, 'reader-1', 'POST', path, { answers: [' noon '], user_id: 'other-user' }, 2);
  assertEquals(result.status, 200);
  assertEquals(calls, [['record_ielts_practice_library_review', {
    p_user_id: 'reader-1', p_set_slug: 'reading-demo', p_correct: 1, p_total: 1,
  }]]);
});
