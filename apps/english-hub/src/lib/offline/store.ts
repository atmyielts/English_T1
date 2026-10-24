// IndexedDB for the offline session: today's saved activities ("packs", one
// per learner) and answers waiting to be sent ("queue"). Every call can fail
// (private browsing, storage full, blocked site data); callers get an
// OfflineStoreError with a kind they can explain to the learner.

import type { OfflinePack, QueueEntry } from './model';

const DB_NAME = 'schood-english-offline';
const DB_VERSION = 1;
const PACKS = 'packs';
const QUEUE = 'queue';

export type OfflineStoreErrorKind = 'unavailable' | 'quota' | 'failed';

export class OfflineStoreError extends Error {
  readonly kind: OfflineStoreErrorKind;
  constructor(kind: OfflineStoreErrorKind, message: string) {
    super(message);
    this.name = 'OfflineStoreError';
    this.kind = kind;
  }
}

const wrap = (error: unknown): OfflineStoreError => {
  if (error instanceof OfflineStoreError) return error;
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'QuotaExceededError') return new OfflineStoreError('quota', 'Storage is full');
  if (name === 'SecurityError' || name === 'InvalidStateError') return new OfflineStoreError('unavailable', 'Storage is blocked');
  return new OfflineStoreError('failed', error instanceof Error ? error.message : 'Storage failed');
};

export const offlineSupported = (): boolean => {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
};

let opening: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (!offlineSupported()) return Promise.reject(new OfflineStoreError('unavailable', 'IndexedDB is not available'));
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(wrap(error));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PACKS)) db.createObjectStore(PACKS, { keyPath: 'user_id' });
      if (!db.objectStoreNames.contains(QUEUE)) {
        const queue = db.createObjectStore(QUEUE, { keyPath: 'id' });
        queue.createIndex('user_id', 'user_id', { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the schema: let it, and reopen next time.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(wrap(request.error));
    request.onblocked = () => reject(new OfflineStoreError('failed', 'Storage upgrade blocked by another tab'));
  }).catch((error) => {
    opening = null;
    throw wrap(error);
  });
  return opening;
};

const run = async <T>(store: string, mode: IDBTransactionMode, work: (objects: IDBObjectStore) => IDBRequest<T> | null): Promise<T | undefined> => {
  const db = await openDb();
  return await new Promise<T | undefined>((resolve, reject) => {
    let result: T | undefined;
    let tx: IDBTransaction;
    try {
      tx = db.transaction(store, mode);
      const request = work(tx.objectStore(store));
      if (request) request.onsuccess = () => { result = request.result; };
    } catch (error) {
      reject(wrap(error));
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(wrap(tx.error));
    tx.onabort = () => reject(wrap(tx.error));
  });
};

// Tell open pages (Today card, offline page, banner) that something changed.
const listeners = new Set<() => void>();
export const onOfflineChange = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const changed = () => listeners.forEach((listener) => listener());

export const savePack = async (pack: OfflinePack): Promise<void> => {
  await run(PACKS, 'readwrite', (objects) => objects.put(pack));
  changed();
};

/** The learner's pack; with no learner (signed out while offline), the most recently saved one. */
export const loadPack = async (userId: string | null): Promise<OfflinePack | null> => {
  if (userId) return (await run<OfflinePack>(PACKS, 'readonly', (objects) => objects.get(userId) as IDBRequest<OfflinePack>)) ?? null;
  const all = (await run<OfflinePack[]>(PACKS, 'readonly', (objects) => objects.getAll() as IDBRequest<OfflinePack[]>)) ?? [];
  return all.sort((a, b) => b.saved_at.localeCompare(a.saved_at))[0] ?? null;
};

export const deletePack = async (userId: string): Promise<void> => {
  await run(PACKS, 'readwrite', (objects) => objects.delete(userId));
  changed();
};

export const putEntry = async (entry: QueueEntry): Promise<void> => {
  await run(QUEUE, 'readwrite', (objects) => objects.put(entry));
  changed();
};

export const listEntries = async (userId: string | null): Promise<QueueEntry[]> => {
  const rows = userId
    ? await run<QueueEntry[]>(QUEUE, 'readonly', (objects) => objects.index('user_id').getAll(userId) as IDBRequest<QueueEntry[]>)
    : await run<QueueEntry[]>(QUEUE, 'readonly', (objects) => objects.getAll() as IDBRequest<QueueEntry[]>);
  return rows ?? [];
};

export const deleteEntries = async (ids: string[]): Promise<void> => {
  if (!ids.length) return;
  await run(QUEUE, 'readwrite', (objects) => {
    for (const id of ids) objects.delete(id);
    return null;
  });
  changed();
};
