export const ANSWER_SAVE_ERROR = 'Your answers could not be saved. Keep this page open, check your connection, and retry.';

export const saveAnswersOrThrow = async (
  save: () => PromiseLike<{ error: unknown }>,
): Promise<void> => {
  let result: { error: unknown };
  try { result = await save(); }
  catch { throw new Error(ANSWER_SAVE_ERROR); }
  if (!result || !Object.hasOwn(result, 'error') || result.error !== null) throw new Error(ANSWER_SAVE_ERROR);
};

// Never close a section or complete an exam until its final answers are stored.
export const transitionAfterSaving = async (
  save: () => Promise<void>,
  transition: () => Promise<void>,
): Promise<void> => {
  await save();
  await transition();
};

// Failed writes do not poison later retries. A slow earlier save must settle
// before a newer answer snapshot can be sent.
export class AnswerSaveQueue {
  private tail: Promise<void> = Promise.resolve();

  run(save: () => PromiseLike<{ error: unknown }>): Promise<void> {
    const next = this.tail.then(() => saveAnswersOrThrow(save));
    this.tail = next.catch(() => {});
    return next;
  }
}
