type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type DraftScope = { app: string; actor: string; session: string; section: string };
type Entry = { answer: unknown; base: unknown };
type Envelope = { version: 1; updatedAt: number; entries: Record<string, Entry> };
const PREFIX = 'schood:exam-draft:v1:';
const MAX_CHARACTERS = 512 * 1024;
const MAX_ENTRIES = 200;
const MAX_AGE = 24 * 60 * 60 * 1000;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const validId = (id: string): boolean => /^[a-zA-Z0-9_-]{1,80}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);

// This is a private, per-tab draft, never proof that the server stored an answer.
// Trusted owned exam-state loading must happen before asking this store to restore.
export class AnswerDraftStore {
  private key: string;
  private entries: Record<string, Entry> = {};
  private storage: StoragePort | null;
  private now: () => number;
  available = true;

  constructor(storage: StoragePort | null, scope: DraftScope, now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
    if (![scope.app, scope.actor, scope.session, scope.section].every(v => /^[a-zA-Z0-9_-]{1,80}$/.test(v))) {
      throw new Error('Invalid draft scope.');
    }
    this.key = PREFIX + [scope.app, scope.actor, scope.session, scope.section].join(':');
    if (!storage) { this.available = false; return; }
    try {
      const raw = storage.getItem(this.key);
      if (!raw) return;
      if (raw.length > MAX_CHARACTERS) throw new Error('Oversized draft.');
      const value: unknown = JSON.parse(raw);
      if (!object(value) || value.version !== 1 || typeof value.updatedAt !== 'number' ||
          !Number.isFinite(value.updatedAt) || value.updatedAt > this.now() + 60_000 ||
          value.updatedAt < this.now() - MAX_AGE || !object(value.entries) ||
          Object.keys(value.entries).length > MAX_ENTRIES) throw new Error('Invalid draft.');
      for (const [id, entry] of Object.entries(value.entries)) {
        if (!validId(id) || !object(entry) || !Object.hasOwn(entry, 'answer')) throw new Error('Invalid draft answer.');
        this.entries[id] = { answer: entry.answer, base: entry.base };
      }
    } catch {
      this.entries = {};
      try { storage.removeItem(this.key); } catch { this.available = false; }
    }
  }

  pending(server: Record<string, unknown>, allowedIds: Set<string>): { answers: Record<string, unknown>; conflicts: number } {
    const answers: Record<string, unknown> = {};
    let conflicts = 0;
    for (const [id, entry] of Object.entries(this.entries)) {
      if (!allowedIds.has(id) || same(server[id], entry.answer)) { delete this.entries[id]; continue; }
      answers[id] = entry.answer;
      if (!same(server[id], entry.base)) conflicts++;
    }
    this.persist();
    return { answers, conflicts };
  }

  put(id: string, answer: unknown, base: unknown): boolean {
    if (!validId(id)) return false;
    this.entries[id] = { answer, base: this.entries[id] ? this.entries[id].base : base };
    return this.persist();
  }

  acknowledge(id: string, answer: unknown): void {
    // An older acknowledgement cannot discard a newer edit.
    if (this.entries[id] && same(this.entries[id].answer, answer)) delete this.entries[id];
    this.persist();
  }

  clear(): void { this.entries = {}; this.persist(); }

  private persist(): boolean {
    if (!this.storage) return this.available = false;
    try {
      if (Object.keys(this.entries).length === 0) this.storage.removeItem(this.key);
      else {
        const value: Envelope = { version: 1, updatedAt: this.now(), entries: this.entries };
        const raw = JSON.stringify(value);
        if (raw.length > MAX_CHARACTERS || Object.keys(this.entries).length > MAX_ENTRIES) throw new Error('Draft capacity exceeded.');
        this.storage.setItem(this.key, raw);
      }
      return this.available = true;
    } catch { return this.available = false; }
  }
}

export const tabDraftStorage = (): StoragePort | null => {
  try { return window.sessionStorage; } catch { return null; }
};
