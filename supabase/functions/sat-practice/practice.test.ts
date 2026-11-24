import { assertEquals, assertRejects } from 'jsr:@std/assert';
import { bankPage, bankSelection, loadCatalog } from './practice.ts';
import { normalizeCatalog } from '../_shared/sat-practice-selection.ts';

function fixture(total: number, failSecondPage = false) {
  const rows = Array.from({ length: total }, (_, index) => ({
    id: `question-${index + 1}`,
    type: 'question_single_choice',
    section_type: 'math',
    domain: 'algebra',
    official_domain: 'algebra',
    skill: 'linear_functions',
    difficulty: 'medium',
    bank_order: index + 1,
  }));
  const calls: Array<[number, number, boolean]> = [];
  return {
    calls,
    rpc(name: string, args: { p_user_id: string }, options?: { count: string }) {
      assertEquals(name, 'select_sat_practice_catalog');
      assertEquals(args.p_user_id, 'learner');
      return {
        range(from: number, to: number) {
          calls.push([from, to, options?.count === 'exact']);
          if (failSecondPage && from > 0) return Promise.resolve({ data: null, error: 'Unavailable' });
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null, count: options ? total : null });
        },
      };
    },
  };
}

Deno.test('SAT Practice catalog keeps every question above the PostgREST row limit', async () => {
  const sb = fixture(1104);
  const catalog = await loadCatalog(sb, 'learner');
  assertEquals(catalog.length, 1104);
  assertEquals(catalog[999]?.id, 'question-1000');
  assertEquals(catalog[1000]?.id, 'question-1001');
  assertEquals(catalog.at(-1)?.id, 'question-1104');
  assertEquals(sb.calls, [[0, 999, true], [1000, 1999, false]]);
});

Deno.test('SAT Practice does not request an empty page at the row limit', async () => {
  const sb = fixture(1000);
  assertEquals((await loadCatalog(sb, 'learner')).length, 1000);
  assertEquals(sb.calls, [[0, 999, true]]);
});

Deno.test('SAT Practice does not serve a silently truncated catalog after a page error', async () => {
  const sb = fixture(1104, true);
  await assertRejects(() => loadCatalog(sb, 'learner'), Error, 'question bank is temporarily unavailable');
});

Deno.test('SAT Practice reports the review pool when a skill has no unseen matches', () => {
  const source = (id: string, skill: string, seen: number, correct: boolean, difficulty = 'hard') => ({ id, section_type: 'math', domain: 'algebra', official_domain: 'algebra', skill, seen, last_correct: correct, difficulty });
  const catalog = normalizeCatalog([
    source('missed', 'linear_functions', 1, false), source('correct', 'linear_functions', 1, true),
    source('wrong-skill', 'linear_inequalities', 0, false), source('wrong-level', 'linear_functions', 0, false, 'easy'),
  ]);
  const filters = { skill: 'linear_functions', difficulty: 'hard', limit: 24, offset: 0 } as const;
  const exhausted = bankPage(catalog, { ...filters, status: 'unseen' });
  assertEquals(exhausted.total, 0);
  assertEquals(exhausted.matchingHistory, { unseen: 0, missed: 1, correct: 1 });
  assertEquals(bankSelection(catalog, { ...filters, status: 'missed' }, 5).ids, ['missed']);
});
