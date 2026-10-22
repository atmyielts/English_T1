export interface AccountSource {
  current(): Promise<string>;
  subscribe(changed: (actor: string) => void): () => void;
}
/** Cookie-backed cross-service sessions cannot rely on same-origin broadcast
 * events. Fresh reads are fenced against newer explicit authentication events. */
export function watchAccount(
  source: AccountSource,
  changed: (actor: string) => void,
) {
  let active = true,
    generation = 0,
    reading = false,
    last: string | null = null;
  const publish = (actor: string) => {
    if (active && last !== actor) {
      last = actor;
      changed(actor);
    }
  };
  const unsubscribe = source.subscribe((actor) => {
    generation++;
    publish(actor);
  });
  async function check() {
    if (!active || reading) return;
    reading = true;
    const version = generation;
    try {
      const actor = await source.current();
      if (active && version === generation) publish(actor);
    } catch {
      if (active && version === generation) publish("");
    } finally {
      reading = false;
    }
  }
  return {
    check,
    close() {
      active = false;
      unsubscribe();
    },
  };
}
