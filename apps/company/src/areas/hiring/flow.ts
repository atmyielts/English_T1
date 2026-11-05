// Decisions behind the candidate and test pages, kept apart from React so
// supabase/functions/company/hiring.test.ts can check them.
import type { AttemptStatus } from './types.ts';

/** Where a saved attempt key leads. An expired attempt has no answers, so the same person may start again. */
export const resumeStep = (status: AttemptStatus): 'running' | 'done' | 'start_over' =>
  status === 'started' ? 'running' : status === 'expired' ? 'start_over' : 'done';

/** Only "no such session" forgets the saved key: it cannot be recovered, and any other failure may pass. */
export const keyIsGone = (cause: unknown): boolean => (cause as { code?: string })?.code === 'attempt_not_found';

/** The link this browser remembers, as long as it is still the test's live link. */
export const encodeLink = (link: string, linkId: string | null) => JSON.stringify({ link, link_id: linkId });
export function decodeLink(raw: string | null, liveId: string | null): string | null {
  if (!raw || !liveId) return null;
  try {
    const stored = JSON.parse(raw) as { link?: unknown; link_id?: unknown };
    return stored.link_id === liveId && typeof stored.link === 'string' ? stored.link : null;
  } catch {
    return null;
  }
}

export const TIME_UP_RETRY_MS = 15_000;
/** Time is up: submit now, and again every so often until it goes through. Never during another request. */
export const timeUpSubmitDue = (state: { remaining: number; busy: boolean; finished: boolean; lastTry: number; now: number }): boolean =>
  state.remaining <= 0 && !state.busy && !state.finished && state.now - state.lastTry >= TIME_UP_RETRY_MS;

/**
 * Keeps autosaves out of the way of Next and Submit. A save landing while one of them
 * runs would change the row under it and fail it as "updated in another window".
 */
export class SaveGate {
  private timer: ReturnType<typeof setTimeout> | null = null;
  moving = false;
  /** Runs `save` after a pause, in place of any save already waiting. */
  schedule(save: () => void, ms: number) {
    this.cancel();
    this.timer = setTimeout(save, ms);
  }
  cancel() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  /** Starts a move and drops the waiting save; false when a move is already running. */
  begin(): boolean {
    if (this.moving) return false;
    this.moving = true;
    this.cancel();
    return true;
  }
  end() {
    this.moving = false;
  }
}
