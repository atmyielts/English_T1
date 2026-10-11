import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { acknowledgeTutorReceipt, prepareTutorReceipt, readTutorReceipt, tutorStorageKey, isTutorFeedback, isTutorQuota } from "../src/lib/tutor-requests.ts";
const actor = "11111111-1111-4111-8111-111111111111", attempt = "22222222-2222-4222-8222-222222222222", question = "33333333-3333-4333-8333-333333333333", id = "44444444-4444-4444-8444-444444444444", other = "55555555-5555-4555-8555-555555555555";
function store() {
  const rows = new Map<string, string>();
  return { rows, getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); }, removeItem: (key: string) => { rows.delete(key); } };
}
Deno.test("tutor receipt survives reload and prevents a changed mode from creating a new request", () => {
  const storage = store(), key = tutorStorageKey(actor, attempt, question);
  const first = prepareTutorReceipt(storage, key, "explain", () => id);
  assertEquals(readTutorReceipt(storage, key), first);
  assertEquals(prepareTutorReceipt(storage, key, "similar", () => other), first);
  assertEquals(JSON.parse(storage.getItem(key)!), { requestId: id, mode: "explain" });
});
Deno.test("receipt keys separate accounts, drills and questions; acknowledgements match exactly", () => {
  const storage = store(), key = tutorStorageKey(actor, attempt, question);
  prepareTutorReceipt(storage, key, "why-wrong", () => id);
  for (const separate of [tutorStorageKey(other, attempt, question), tutorStorageKey(actor, other, question), tutorStorageKey(actor, attempt, other)]) assertEquals(readTutorReceipt(storage, separate), null);
  acknowledgeTutorReceipt(storage, key, other);
  assertEquals(readTutorReceipt(storage, key)?.requestId, id);
  acknowledgeTutorReceipt(storage, key, id);
  assertEquals(readTutorReceipt(storage, key), null);
});
Deno.test("unavailable storage and corrupt receipts fail before new dispatch identity", () => {
  const key = tutorStorageKey(actor, attempt, question), storage = store();
  storage.setItem(key, '{"requestId":"corrupt","mode":"explain"}');
  assertThrows(() => prepareTutorReceipt(storage, key, "explain", () => id));
  const blocked = { ...store(), setItem() { throw new Error("denied"); } };
  assertThrows(() => prepareTutorReceipt(blocked, key, "explain", () => id));
  assertThrows(() => tutorStorageKey("invalid", attempt, question));
});
Deno.test("browser rejects malformed allowance and feedback before rendering", () => {
  const quota = { api_version: 2, enabled: true, limit: 2, used: 1, remaining: 1, attempts_remaining: 5 };
  assertEquals(isTutorQuota(quota), true);
  for (const row of [{ ...quota, api_version: 1 }, { ...quota, remaining: -1 }, { ...quota, remaining: 3 }, { ...quota, enabled: "true" }, { ...quota, limit: 999 }, { ...quota, attempts_remaining: 7 }]) assertEquals(isTutorQuota(row), false);
  const feedback = { steps: ["Use the original solution"], key_concept: "Algebra", why_distractors_wrong: { B: "Wrong sign" } };
  assertEquals(isTutorFeedback(feedback), true);
  for (const row of [null, { ...feedback, steps: [] }, { ...feedback, steps: [{}] }, { ...feedback, why_distractors_wrong: null }, { ...feedback, similar_question: { choices: null } }]) assertEquals(isTutorFeedback(row), false);
});
