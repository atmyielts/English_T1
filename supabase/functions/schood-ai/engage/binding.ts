import { defineStore, type ServiceDb } from '../stores.ts';
import type { LearningEvent, RequestContext, SchoodAIRepository } from '../types.ts';
import { createEngageMemory, type EngageMemory } from './memory.ts';
import { createEngagePostgres, type EngageDatabase } from './repository.ts';
import { memoryStorage, s3Storage, type SampleStorage } from './storage.ts';
import type { EngageRepository } from './store.ts';

// How a route reaches engage's own tables: core's area store (stores.ts), `ctx.store(engageStore)`.
//   - Deployed: the Postgres repository and S3 sample storage over core's service-role
//     client (index.ts), one instance per function instance.
//   - Tests and dev stacks: the in-memory twin. It is bound to the core memory repository
//     on first use and taps its addLearningEvents, so every event ctx.events.emit writes is
//     visible to engage at once, as ai_learning_events is in Postgres (the tap goes when core's
//     memory repository can list learning events; docs/product/ai-requests/engage.md).

export interface EngageBinding { repo: EngageRepository; storage: SampleStorage; memory: EngageMemory | null }
interface EngageSlot { bind(core: SchoodAIRepository): EngageBinding }

const tapped = new WeakMap<SchoodAIRepository, EngageBinding>();

/** The in-memory engage store for a core memory repository, created once and fed by its events. */
export function memoryFor(core: SchoodAIRepository, now: () => Date): EngageBinding {
  const existing = tapped.get(core);
  if (existing) return existing;
  const memory = createEngageMemory({ core, now });
  const original = core.addLearningEvents.bind(core);
  core.addLearningEvents = async (events: LearningEvent[]) => {
    await original(events);
    memory.recordEvents(events);
    // Postgres counts new events every few minutes (ai-engage-ingest-v1) and on read; memory counts at once.
    for (const userId of new Set(events.map((event) => event.userId))) await memory.ingest(userId, now());
  };
  const binding: EngageBinding = { repo: memory, storage: memoryStorage(), memory };
  tapped.set(core, binding);
  return binding;
}

export const engageStore = defineStore<EngageSlot>('engage', {
  postgres: (db: ServiceDb) => {
    const binding: EngageBinding = { repo: createEngagePostgres(db as unknown as EngageDatabase), storage: s3Storage(db), memory: null };
    return { bind: () => binding };
  },
  memory: ({ now }) => ({ bind: (core) => memoryFor(core, now) }),
});

export function engage(ctx: Pick<RequestContext, 'repo' | 'store'>): EngageBinding {
  return ctx.store(engageStore).bind(ctx.repo);
}
