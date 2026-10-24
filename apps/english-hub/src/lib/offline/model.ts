// The offline session's rules, with no browser APIs so they can be tested:
// which of today's tasks can be done without a connection, where a queued
// answer is sent, how a failed send is treated, and the sync loop itself
// (storage and network are passed in).
//
// Answers are sent later through the same submit routes as online, each with a
// client attempt id; the server records an id once and replays the stored
// response for a repeat (supabase/functions/_shared/english-client-attempt.ts),
// so a sync cut off half-way can simply be run again.

export const OFFLINE_SKILLS = ['reading', 'listening', 'grammar', 'vocabulary'] as const;
export type OfflineSkill = (typeof OFFLINE_SKILLS)[number];

export const isOfflineSkill = (skill: unknown): skill is OfflineSkill =>
  typeof skill === 'string' && (OFFLINE_SKILLS as readonly string[]).includes(skill);

/** The parts of a Today task the offline plan needs. */
export type PlanTask = {
  kind: 'review' | 'activity';
  skill: string;
  slug: string | null;
  title: string;
  level: string | null;
  minutes: number;
  done: boolean;
};

export type OfflinePlan = {
  /** Activities whose content can be saved and done offline (AI-free). */
  download: PlanTask[];
  /** Unfinished tasks that need a connection (AI feedback, review cards). */
  online: PlanTask[];
};

/** Splits today's unfinished tasks into what can be downloaded and what waits for a connection. */
export const planOffline = (tasks: PlanTask[]): OfflinePlan => {
  const open = tasks.filter((task) => !task.done);
  const seen = new Set<string>();
  const download: PlanTask[] = [];
  const online: PlanTask[] = [];
  for (const task of open) {
    if (task.kind === 'activity' && isOfflineSkill(task.skill) && task.slug) {
      const key = `${task.skill}/${task.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      download.push(task);
    } else {
      online.push(task);
    }
  }
  return { download, online };
};

/** Where an activity's answers are submitted: the same routes as online. */
export const submitTarget = (skill: OfflineSkill, slug: string): { fn: string; path: string } => {
  const id = encodeURIComponent(slug);
  switch (skill) {
    case 'reading':
      return { fn: 'reading-articles', path: `/articles/${id}/submit` };
    case 'listening':
      return { fn: 'listening-content', path: `/items/${id}/submit` };
    case 'grammar':
      return { fn: 'grammar-remediation', path: `/units/${id}/submit` };
    case 'vocabulary':
      return { fn: 'vocabulary-notebook', path: `/decks/${id}/submit` };
  }
};

export type OfflineActivity = {
  skill: OfflineSkill;
  slug: string;
  title: string;
  level: string | null;
  minutes: number;
  /** The same JSON the skill's GET route returns (article / item + dictation / unit + drills / deck + words). */
  content: Record<string, unknown>;
};

export type OfflinePack = {
  version: 1;
  user_id: string;
  /** The learner's calendar date the plan is for (YYYY-MM-DD). */
  date: string;
  saved_at: string;
  activities: OfflineActivity[];
  needs_connection: Array<{ kind: 'review' | 'activity'; skill: string; title: string }>;
};

export type QueueStatus = 'queued' | 'synced' | 'failed';
export type QueueReason = 'free_used' | 'not_found' | 'invalid' | 'no_access' | 'server' | 'busy' | 'paused';

export type QueueResult = { score: number | null; correct: number | null; total: number | null; recorded: boolean };

export type QueueEntry = {
  /** The client attempt id; also the IndexedDB key. */
  id: string;
  user_id: string;
  skill: OfflineSkill;
  slug: string;
  title: string;
  /** The submit body, exactly as the online page would send it (without the id). */
  body: Record<string, unknown>;
  created_at: string;
  status: QueueStatus;
  tries: number;
  next_try_at: string | null;
  reason: QueueReason | null;
  result: QueueResult | null;
  synced_at: string | null;
};

export const MAX_TRIES = 8;
export const PAUSED_WAIT_MS = 30 * 60_000;
/** Synced and failed entries are kept this long so the learner can see what happened. */
export const KEEP_DONE_MS = 7 * 86_400_000;

/** A new client attempt id: "off_" plus a random UUID (fits the server's 8–64 safe characters). */
export const newClientAttemptId = (random: () => string = () => crypto.randomUUID()): string =>
  `off_${random().replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64);

export const newEntry = (input: {
  userId: string;
  skill: OfflineSkill;
  slug: string;
  title: string;
  body: Record<string, unknown>;
  now?: Date;
  id?: string;
}): QueueEntry => ({
  id: input.id ?? newClientAttemptId(),
  user_id: input.userId,
  skill: input.skill,
  slug: input.slug,
  title: input.title,
  body: input.body,
  created_at: (input.now ?? new Date()).toISOString(),
  status: 'queued',
  tries: 0,
  next_try_at: null,
  reason: null,
  result: null,
  synced_at: null,
});

export type SendOutcome =
  | { ok: true; body: unknown }
  | { ok: false; status: number; code: string | null };

export type FailureAction =
  | { action: 'stop_offline' }
  | { action: 'stop_auth' }
  | { action: 'retry'; reason: QueueReason }
  | { action: 'fail'; reason: QueueReason };

/** What to do after a failed send. Status 0 means the network is down. */
export const classifyFailure = (status: number, code: string | null = null): FailureAction => {
  if (status === 0) return { action: 'stop_offline' };
  if (status === 401) return { action: 'stop_auth' };
  if (status === 402 || code === 'english_free_limit_reached') return { action: 'fail', reason: 'free_used' };
  if (status === 403) return { action: 'fail', reason: 'no_access' };
  if (status === 404) return { action: 'fail', reason: 'not_found' };
  if (status === 409) return { action: 'retry', reason: 'busy' };
  if (status === 503 && code === 'service_paused') return { action: 'retry', reason: 'paused' };
  if (status === 400 || status === 422) return { action: 'fail', reason: 'invalid' };
  return { action: 'retry', reason: 'server' };
};

/** Wait before the next try: 30 s, 1, 2, 4… minutes, at most 30 minutes. */
export const backoffMs = (tries: number): number => Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, tries - 1));

const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The headline of a submit response, whatever the skill. */
export const summariseResponse = (body: unknown): QueueResult => {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const questions = record.questions && typeof record.questions === 'object' ? record.questions as Record<string, unknown> : null;
  return {
    score: numberOrNull(record.score),
    correct: numberOrNull(record.correct) ?? numberOrNull(questions?.correct),
    total: numberOrNull(record.total) ?? numberOrNull(questions?.total),
    recorded: record.recorded === false ? false : true,
  };
};

export type SyncReport = { synced: number; failed: number; waiting: number; stopped: 'offline' | 'auth' | null };

/**
 * Sends the signed-in learner's queued answers, oldest first. Each entry is
 * saved after its send, so an interrupted sync loses nothing; resending is
 * safe because the server dedupes on the client attempt id.
 */
export const syncQueue = async (
  entries: QueueEntry[],
  deps: {
    userId: string;
    now: () => number;
    send: (entry: QueueEntry) => Promise<SendOutcome>;
    save: (entry: QueueEntry) => Promise<void>;
  },
): Promise<SyncReport> => {
  const report: SyncReport = { synced: 0, failed: 0, waiting: 0, stopped: null };
  const due = entries
    .filter((entry) => entry.status === 'queued' && entry.user_id === deps.userId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const entry of due) {
    if (entry.next_try_at && Date.parse(entry.next_try_at) > deps.now()) {
      report.waiting += 1;
      continue;
    }
    const outcome = await deps.send(entry);
    if (outcome.ok) {
      await deps.save({
        ...entry,
        status: 'synced',
        result: summariseResponse(outcome.body),
        synced_at: new Date(deps.now()).toISOString(),
        reason: null,
        next_try_at: null,
      });
      report.synced += 1;
      continue;
    }
    const decision = classifyFailure(outcome.status, outcome.code);
    if (decision.action === 'stop_offline' || decision.action === 'stop_auth') {
      report.stopped = decision.action === 'stop_offline' ? 'offline' : 'auth';
      report.waiting += due.length - report.synced - report.failed - report.waiting;
      return report;
    }
    if (decision.action === 'fail') {
      await deps.save({ ...entry, status: 'failed', reason: decision.reason, next_try_at: null });
      report.failed += 1;
      continue;
    }
    if (decision.reason === 'paused') {
      // The owner paused the skill for a while: wait, without using up tries.
      await deps.save({ ...entry, reason: 'paused', next_try_at: new Date(deps.now() + PAUSED_WAIT_MS).toISOString() });
      report.waiting += 1;
      continue;
    }
    const tries = entry.tries + 1;
    if (tries >= MAX_TRIES) {
      await deps.save({ ...entry, tries, status: 'failed', reason: 'server', next_try_at: null });
      report.failed += 1;
      continue;
    }
    await deps.save({ ...entry, tries, reason: decision.reason, next_try_at: new Date(deps.now() + backoffMs(tries)).toISOString() });
    report.waiting += 1;
  }
  return report;
};

/** Ids of finished entries (synced or failed) older than KEEP_DONE_MS. */
export const expiredEntries = (entries: QueueEntry[], nowMs: number): string[] =>
  entries
    .filter((entry) => entry.status !== 'queued' && nowMs - Date.parse(entry.synced_at ?? entry.created_at) > KEEP_DONE_MS)
    .map((entry) => entry.id);

/** The latest queue entry for an activity in this pack (answers saved after the pack was downloaded). */
export const entryForActivity = (entries: QueueEntry[], pack: Pick<OfflinePack, 'saved_at' | 'user_id'>, activity: Pick<OfflineActivity, 'skill' | 'slug'>): QueueEntry | null =>
  entries
    .filter((entry) => entry.user_id === pack.user_id && entry.skill === activity.skill && entry.slug === activity.slug && entry.created_at >= pack.saved_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
