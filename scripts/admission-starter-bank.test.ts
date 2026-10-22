import { prepareBankImport } from '../packages/assessment-core/src/bank-import.ts';
import { scoreResponse } from '../packages/assessment-core/src/mod.ts';
import { UZ_MATH_TOPICS } from '../packages/subject-core/src/mod.ts';
import { splitMath } from '../packages/assessment-web/src/math-text.ts';
import { starterBank } from './admission-starter-bank.ts';

const ok = (value: unknown, label: string) => {
  if (!value) throw new Error(label);
};

Deno.test('the starter bank imports cleanly into Assessment Cloud, per language', async () => {
  const bank = starterBank(4);
  for (const locale of ['uz', 'ru'] as const) {
    const rows = bank.rows.filter((row) => row.item.locale === locale);
    const plan = await prepareBankImport('json', JSON.stringify({ ...bank, rows }));
    ok(plan.errors.length === 0, `${locale}: ${JSON.stringify(plan.errors.slice(0, 3))}`);
    ok(plan.rows.every((row) => row.warnings.length === 0), `${locale}: duplicate questions`);
    ok(plan.rows.length === UZ_MATH_TOPICS.topics.length * 4, `${locale}: ${plan.rows.length} rows`);
  }
});

Deno.test('every topic is covered at every difficulty band, with a solution and a key that scores', () => {
  const bank = starterBank(4);
  for (const topic of UZ_MATH_TOPICS.topics) {
    const rows = bank.rows.filter((row) => row.item.classification?.topics.includes(topic.code));
    ok(rows.length === 8, `${topic.code}: ${rows.length}`);
    ok(new Set(rows.map((row) => row.item.classification?.estimated_difficulty)).size >= 2, `${topic.code}: one difficulty only`);
  }
  for (const { item, key } of bank.rows) {
    ok(key.solution && key.solution.length > 10, `no solution: ${item.prompt}`);
    // The key's own answer scores full marks; formulas are balanced.
    const answer = item.type === 'numeric' ? String(key.numeric!.value) : key.correct;
    ok(scoreResponse(item, key, answer).score === 1, `key does not score: ${item.prompt}`);
    for (const text of [item.prompt, key.solution!, ...(item.options ?? []).map((option) => option.text)]) {
      ok(!splitMath(text).some((part) => part.kind === 'text' && /\\[()[\]]/.test(part.value)), `unbalanced formula: ${text}`);
      ok(!/\+0x|x\+0\b|\+-|--/.test(text), `awkward sign: ${text}`);
    }
    if (item.type === 'single_choice') {
      ok(new Set(item.options!.map((option) => option.text)).size === 4, `duplicate options: ${item.prompt}`);
      ok(item.options!.filter((option) => option.id === key.correct).length === 1, 'one correct option');
    }
  }
  // The correct option is not always in the same place.
  const positions = new Set(bank.rows.filter((row) => row.item.type === 'single_choice').map((row) => row.key.correct));
  ok(positions.size >= 3, 'correct option position varies');
});
