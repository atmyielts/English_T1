import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ANSWER_SAVE_ERROR, AnswerSaveQueue, saveAnswersOrThrow, transitionAfterSaving } from '../src/submission.ts';

Deno.test('failed final answer insert never completes or navigates away from an exam', async () => {
  let completed = false;
  await assertRejects(() => transitionAfterSaving(
    () => saveAnswersOrThrow(() => Promise.resolve({ error: { message: 'network failure' } })),
    async () => { completed = true; },
  ), Error, ANSWER_SAVE_ERROR);
  assertEquals(completed, false);
});

Deno.test('disconnected answer save leaves the attempt open and can be retried', async () => {
  let attempts = 0;
  let completed = 0;
  const save = () => saveAnswersOrThrow(async () => {
    attempts++;
    if (attempts === 1) throw new TypeError('Failed to fetch');
    return { error: null };
  });
  await assertRejects(() => transitionAfterSaving(save, async () => { completed++; }));
  assertEquals(completed, 0);
  await transitionAfterSaving(save, async () => { completed++; });
  assertEquals(completed, 1);
});

Deno.test('submission waits for a slow save before advancing', async () => {
  const events: string[] = [];
  let release!: () => void;
  const saved = new Promise<void>((resolve) => { release = resolve; });
  const submission = transitionAfterSaving(async () => { await saved; events.push('saved'); }, async () => { events.push('advanced'); });
  await Promise.resolve();
  assertEquals(events, []);
  release();
  await submission;
  assertEquals(events, ['saved', 'advanced']);
});

Deno.test('failed session finalization propagates without reporting completion', async () => {
  await assertRejects(() => transitionAfterSaving(async () => {}, async () => { throw new Error('finalization failed'); }), Error, 'finalization failed');
});

Deno.test('a slow earlier autosave cannot overwrite a newer final snapshot', async () => {
  const queue = new AnswerSaveQueue();
  const events: string[] = [];
  let release!: () => void;
  const slow = new Promise<void>((resolve) => { release = resolve; });
  const oldSave = queue.run(async () => { events.push('old-start'); await slow; events.push('old-saved'); return { error: null }; });
  const finalSave = queue.run(async () => { events.push('new-saved'); return { error: null }; });
  await Promise.resolve();
  assertEquals(events, ['old-start']);
  release();
  await Promise.all([oldSave, finalSave]);
  assertEquals(events, ['old-start', 'old-saved', 'new-saved']);
});

Deno.test('a rejected autosave does not block the final retry', async () => {
  const queue = new AnswerSaveQueue();
  await assertRejects(() => queue.run(async () => ({ error: 'offline' })), Error, ANSWER_SAVE_ERROR);
  let saved = false;
  await queue.run(async () => { saved = true; return { error: null }; });
  assertEquals(saved, true);
});

Deno.test('an absent write acknowledgement cannot be treated as a successful save', async () => {
  for (const response of [null, {}, { status: 201 }]) {
    await assertRejects(() => saveAnswersOrThrow(() => Promise.resolve(response as { error: unknown })), Error, ANSWER_SAVE_ERROR);
  }
});
