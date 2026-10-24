// Browser side of the offline session: download today's AI-free activities,
// send queued answers when back online. Rules live in ./model.ts.

import { ApiError, edge } from '../api';
import { getToday, localDate } from '../hub';
import { warmAppShell } from '../pwa';
import { getArticle } from '../../skills/reading/api';
import { getItem } from '../../skills/listening/api';
import { getUnit } from '../../skills/grammar/api';
import { getDeck } from '../../skills/vocabulary/api';
import {
  expiredEntries,
  type OfflineActivity,
  type OfflinePack,
  type OfflineSkill,
  planOffline,
  type QueueEntry,
  type SendOutcome,
  submitTarget,
  syncQueue,
  type SyncReport,
} from './model';
import { deleteEntries, listEntries, OfflineStoreError, putEntry, savePack } from './store';

const fetchContent = async (skill: OfflineSkill, slug: string): Promise<Record<string, unknown>> => {
  switch (skill) {
    case 'reading':
      return await getArticle(slug);
    case 'listening':
      return await getItem(slug);
    case 'grammar':
      return await getUnit(slug);
    case 'vocabulary':
      return await getDeck(slug);
  }
};

export type DownloadResult = { saved: number; skipped: number; online: number };

/**
 * Saves today's unfinished reading, listening, grammar and vocabulary
 * activities for this learner, replacing any earlier download. Throws
 * ApiError (no connection) or OfflineStoreError (storage).
 */
export const downloadToday = async (userId: string, onProgress?: (done: number, total: number) => void): Promise<DownloadResult> => {
  const today = await getToday();
  const plan = planOffline(today.tasks);
  const activities: OfflineActivity[] = [];
  let skipped = 0;
  onProgress?.(0, plan.download.length);
  for (const [index, task] of plan.download.entries()) {
    try {
      const content = await fetchContent(task.skill as OfflineSkill, task.slug!);
      activities.push({ skill: task.skill as OfflineSkill, slug: task.slug!, title: task.title, level: task.level, minutes: task.minutes, content });
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) throw error;
      skipped += 1;
    }
    onProgress?.(index + 1, plan.download.length);
  }
  if (!activities.length) return { saved: 0, skipped, online: plan.online.length };

  const pack: OfflinePack = {
    version: 1,
    user_id: userId,
    date: today.date || localDate(),
    saved_at: new Date().toISOString(),
    activities,
    needs_connection: plan.online.map((task) => ({ kind: task.kind, skill: task.skill, title: task.title })),
  };
  // Ask the browser not to clear this storage under pressure (it may say no).
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
  await savePack(pack);
  // The offline page and everything it needs must be in the app cache before the connection goes.
  try {
    await import('../../pages/OfflineSessionPage');
    await warmAppShell();
  } catch {
    // The download is still saved; the page may need one more online visit to cache.
  }
  return { saved: activities.length, skipped, online: plan.online.length };
};

/** Sends one queued answer through the activity's normal submit route, with its client attempt id. */
export const sendEntry = async (entry: QueueEntry): Promise<SendOutcome> => {
  const target = submitTarget(entry.skill, entry.slug);
  try {
    const body = await edge<unknown>(target.fn, target.path, {
      query: { language_code: 'en' },
      body: { ...entry.body, client_attempt_id: entry.id },
    });
    return { ok: true, body };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, status: error.status, code: error.code };
    return { ok: false, status: 0, code: null };
  }
};

let syncing: Promise<SyncReport | null> | null = null;

const runSync = async (userId: string): Promise<SyncReport | null> => {
  const entries = await listEntries(userId);
  const expired = expiredEntries(entries, Date.now());
  if (expired.length) await deleteEntries(expired).catch(() => undefined);
  if (!entries.some((entry) => entry.status === 'queued')) return null;
  return await syncQueue(entries, { userId, now: Date.now, send: sendEntry, save: putEntry });
};

/**
 * Sends this learner's queued answers once (one sync at a time per tab, and
 * across tabs where the browser supports Web Locks). Safe to call often.
 */
export const syncNow = (userId: string): Promise<SyncReport | null> => {
  if (syncing) return syncing;
  const locks = (navigator as Navigator & { locks?: { request: (name: string, options: { ifAvailable: boolean }, task: (lock: unknown) => Promise<unknown>) => Promise<unknown> } }).locks;
  syncing = (async () => {
    try {
      if (locks) {
        let report: SyncReport | null = null;
        await locks.request('schood-english-offline-sync', { ifAvailable: true }, async (lock) => {
          if (lock) report = await runSync(userId);
        });
        return report;
      }
      return await runSync(userId);
    } catch (error) {
      if (error instanceof OfflineStoreError) return null;
      throw error;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
};
