import { bankFilters, loadBankQuestions } from './bank.ts';
import { AttemptError } from './completion.ts';
const assert = (value: unknown, message = 'Assertion failed') => { if (!value) throw new Error(message); };
const equal = (a: unknown, b: unknown) => assert(JSON.stringify(a) === JSON.stringify(b));
const id = '11111111-1111-4111-8111-111111111111';

Deno.test('Empty explicit IDs never query or select an unrestricted bank', async () => {
  equal(await loadBankQuestions({ rpc: () => { throw new Error('Unexpected query'); } }, id, bankFilters({ question_ids: [] })), []);
});
Deno.test('All requested filters and the authenticated actor reach the bank query', async () => {
  let received: unknown;
  const filters = bankFilters({ section_type: 'math', domain: 'geometry_trig', difficulty: 'hard', mistake_history: 'unseen', limit: '24' });
  await loadBankQuestions({ rpc: async (name: string, args: unknown) => { received = { name, args }; return { data: [], error: null }; } }, id, filters);
  equal(received, { name: 'select_sat_practice_questions', args: { p_user_id: id, p_section: 'math', p_domain: 'geometry_trig', p_difficulty: 'hard', p_history: 'unseen', p_question_ids: null, p_limit: 24, p_include_retired: false } });
});
Deno.test('Malformed filters and IDs are rejected rather than converted to a different subject', () => {
  for (const input of [{ domain: 'unknown' }, { section_type: 'science' }, { difficulty: 'expert' }, { mistake_history: 'everyone' }, { question_ids: ['bad'] }, { question_ids: null }, { question_ids: Array(101).fill(id) }, { limit: 0 }, { limit: 101 }, { limit: 2.2 }, { limit: 'no' }, { limit: true }, { limit: [10] }]) {
    let rejected = false;
    try { bankFilters(input); } catch (error) { rejected = error instanceof AttemptError && error.status === 400; }
    assert(rejected, 'Invalid filter accepted: ' + JSON.stringify(input));
  }
  equal(bankFilters({ limit: null }), { limit: 30 });
  equal(bankFilters({}, 10), { limit: 10 });
  equal(bankFilters({ question_ids: [id.toUpperCase(), id] }).question_ids, [id]);
});
Deno.test('Retired questions require explicit IDs and an internal owned-attempt option', async () => {
  const received: any[] = [];
  const sb = { rpc: async (_: unknown, args: unknown) => { received.push(args); return { data: [], error: null }; } };
  await loadBankQuestions(sb, id, bankFilters({}), { includeRetired: true });
  await loadBankQuestions(sb, id, bankFilters({ question_ids: [id] }));
  await loadBankQuestions(sb, id, bankFilters({ question_ids: [id] }), { includeRetired: true });
  equal(received.map(row => row.p_include_retired), [false, false, true]);
});
Deno.test('Bank outages produce a retryable private error, never unrelated fallback questions', async () => {
  for (const result of [{ data: null, error: { message: 'private SQL details' } }, { data: {}, error: null }]) {
    let rejected = false;
    try { await loadBankQuestions({ rpc: async () => result }, id, bankFilters({})); }
    catch (error) { rejected = error instanceof AttemptError && error.status === 503 && !error.message.includes('private SQL'); }
    assert(rejected);
  }
});
