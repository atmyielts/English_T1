import { defineStore, type ServiceDb } from '../stores.ts';
import type { RequestContext, SchoodAIRepository } from '../types.ts';
import { createEngageMemory, type EngageMemory } from './memory.ts';
import { createEngagePostgres, type EngageDatabase } from './repository.ts';
import { memoryStorage, s3Storage, type SampleStorage } from './storage.ts';
import type { EngageRepository } from './store.ts';

// How a route reaches engage's own tables: core's area store (stores.ts), `ctx.store(engageStore)`.
//   - Deployed: the Postgres repository and S3 sample storage over core's service-role
//     client (index.ts), one instance per function instance.
//   - Tests and dev stacks: the in-memory twin, bound to core's memory repository, from
//     which it reads learning events and notification preferences as Postgres does.

export interface EngageBinding { repo: EngageRepository; storage: SampleStorage; memory: EngageMemory | null }
interface EngageSlot {
  bind(core: SchoodAIRepository): EngageBinding;
  /** The binding already in use (rate keys run before a route has a ctx); null in memory before first use. */
  current(): EngageBinding | null;
}

const twins = new WeakMap<SchoodAIRepository, EngageBinding>();

/** The in-memory engage store for a core memory repository, created once. */
export function memoryFor(core: SchoodAIRepository, now: () => Date): EngageBinding {
  const existing = twins.get(core);
  if (existing) return existing;
  const memory = createEngageMemory({ core, now });
  const binding: EngageBinding = { repo: memory, storage: memoryStorage(), memory };
  twins.set(core, binding);
  return binding;
}

export const engageStore = defineStore<EngageSlot>('engage', {
  postgres: (db: ServiceDb) => {
    const binding: EngageBinding = { repo: createEngagePostgres(db as unknown as EngageDatabase), storage: s3Storage(db), memory: null };
    return { bind: () => binding, current: () => binding };
  },
  memory: ({ now }) => {
    let last: EngageBinding | null = null;
    return { bind: (core) => (last = memoryFor(core, now)), current: () => last };
  },
});

export function engage(ctx: Pick<RequestContext, 'repo' | 'store'>): EngageBinding {
  return ctx.store(engageStore).bind(ctx.repo);
}
