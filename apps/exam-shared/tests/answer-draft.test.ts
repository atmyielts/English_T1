import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { AnswerDraftStore } from '../src/answer-draft.ts';
const scope = { app: 'sat', actor: 'qa-actor', session: 'session', section: 'section' };
const storage = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};
Deno.test('reload preserves unacknowledged edits and isolates actor/session/section/app', () => {
  const port = storage();
  new AnswerDraftStore(port, scope).put('q', { text: 'private draft' }, { text: 'saved' });
  assertEquals(new AnswerDraftStore(port, scope).pending({ q: { text: 'saved' } }, new Set(['q'])), { answers: { q: { text: 'private draft' } }, conflicts: 0 });
  for (const changed of [{ actor: 'other' }, { session: 'other' }, { section: 'other' }, { app: 'ielts' }]) {
    assertEquals(new AnswerDraftStore(port, { ...scope, ...changed }).pending({}, new Set(['q'])).answers, {});
  }
});
Deno.test('older acknowledgement cannot delete the latest draft and matching success removes it', () => {
  const port = storage(), store = new AnswerDraftStore(port, scope);
  store.put('q', 'old', null); store.put('q', 'new', null); store.acknowledge('q', 'old');
  assertEquals(store.pending({}, new Set(['q'])).answers, { q: 'new' });
  store.acknowledge('q', 'new'); assertEquals(port.values.size, 0);
});
Deno.test('server acknowledgement removes reply-lost drafts; foreign units cannot restore', () => {
  const port = storage(), store = new AnswerDraftStore(port, scope);
  store.put('q', '', 'old'); store.put('foreign', 'private', null);
  assertEquals(store.pending({ q: '' }, new Set(['q'])), { answers: {}, conflicts: 0 });
  assertEquals(port.values.size, 0);
});
Deno.test('changed server answers are flagged as conflicts without replacing them', () => {
  const port = storage(), store = new AnswerDraftStore(port, scope);
  store.put('q', 'local', 'base');
  assertEquals(store.pending({ q: 'other-tab' }, new Set(['q'])), { answers: { q: 'local' }, conflicts: 1 });
});

Deno.test('a new unanswered question does not falsely conflict on reload', () => {
  const port = storage();
  new AnswerDraftStore(port, scope).put('q', { text: 'new essay' }, undefined);
  assertEquals(new AnswerDraftStore(port, scope).pending({}, new Set(['q'])), { answers: { q: { text: 'new essay' } }, conflicts: 0 });
});
Deno.test('expired, malformed and future drafts are discarded without crashing', () => {
  for (const raw of ['{', JSON.stringify({ version: 1, updatedAt: -100000000, entries: {} }), JSON.stringify({ version: 1, updatedAt: 1000000000, entries: {} })]) {
    const port = storage(); port.setItem('schood:exam-draft:v1:sat:qa-actor:session:section', raw);
    assertEquals(new AnswerDraftStore(port, scope, () => 100).pending({}, new Set(['q'])).answers, {});
    assertEquals(port.values.size, 0);
  }
});
Deno.test('blocked or full tab storage is reported while retaining in-memory edits', () => {
  const port = { getItem: () => null, setItem: () => { throw Error('quota'); }, removeItem: () => {} };
  const store = new AnswerDraftStore(port, scope);
  assertEquals(store.put('q', 'local', null), false);
  assertEquals(store.pending({}, new Set(['q'])).answers, { q: 'local' });
  assertEquals(new AnswerDraftStore(null, scope).put('q', 'local', null), false);
});

Deno.test('draft capacity and reserved properties cannot silently claim reload protection', () => {
  const port = storage(), store = new AnswerDraftStore(port, scope);
  assertEquals(store.put('__proto__', 'unsafe', null), false);
  assertEquals(store.put('constructor', 'unsafe', null), false);
  assertEquals(store.put('q', 'x'.repeat(512 * 1024), null), false);
  assertEquals(port.values.size, 0);
  assertEquals(store.available, false);
});
