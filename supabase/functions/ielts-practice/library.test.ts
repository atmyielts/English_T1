import { assertEquals } from 'jsr:@std/assert';
import { checkLibraryReading, practiceLibraryRequest } from './library.ts';

Deno.test('IELTS Library grades complete reading answers and includes evidence in feedback', () => {
  const keys = [{ key: 2, explanation: 'The lease covers summer only.', evidence: 'Paragraph B' }];
  assertEquals(checkLibraryReading(keys, [2]), { score: 1, total: 1, items: [{ correct: true, key: 2, explanation: 'The lease covers summer only.', evidence: 'Paragraph B' }] });
  assertEquals(checkLibraryReading(keys, [1])?.score, 0);
  for (const invalid of [[], [null], [5], ['2']]) assertEquals(checkLibraryReading(keys, invalid), null);
});

Deno.test('IELTS Library selects only learner content before submission', async () => {
  const db = { from(table: string) {
    assertEquals(table, 'ielts_practice_library_sets');
    return { select(fields: string) {
      assertEquals(fields.includes('review_content'), false);
      const query = { eq(key: string, value: unknown) {
        assertEquals(value, key === 'is_published' ? true : 'reading-demo');
        return query;
      }, maybeSingle() {
        return { data: { slug: 'reading-demo', learner_content: { questions: [{ prompt: 'What changed?' }] } }, error: null };
      } };
      return query;
    } };
  } };
  const response = await practiceLibraryRequest(db, 'GET', '/library/reading-demo');
  assertEquals(response.status, 200);
  assertEquals(response.body, { set: { slug: 'reading-demo', learner_content: { questions: [{ prompt: 'What changed?' }] } } });
});
