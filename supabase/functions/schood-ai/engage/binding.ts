import type { LearningEvent, RequestContext, SchoodAIRepository } from '../types.ts';
import { createEngageMemory, type EngageMemory } from './memory.ts';
import { createEngagePostgres, type EngageDatabase } from './repository.ts';
import { memoryStorage, s3Storage, type SampleStorage } from './storage.ts';
import type { EngageRepository } from './store.ts';

// How a route reaches the engage repository. RequestContext has no member for an
// area's own tables (requested in docs/product/ai-requests/engage.md), so this small
// adapter picks one per core repository:
//   - production (SUPABASE_URL and the service-role key are set): the Postgres
//     repository over its own service-role client, created once per isolate;
//   - tests and the dev stack: an in-memory repository bound to that core memory
//     repository. It taps core's addLearningEvents so every event that ctx.events.emit
//     writes is also visible to engage, exactly as ai_learning_events is in Postgres.

export interface EngageBinding { repo: EngageRepository; storage: SampleStorage; memory: EngageMemory | null }
const bound = new WeakMap<SchoodAIRepository, EngageBinding>();
let production: Promise<EngageBinding> | null = null;

const env = (name: string): string | undefined => {
  try { return (globalThis as { Deno?: { env: { get(name: string): string | undefined } } }).Deno?.env.get(name); } catch { return undefined; }
};

/** Binds an explicit repository to a core repository (tests that want their own store). */
export function bindEngage(core: SchoodAIRepository, binding: EngageBinding): EngageBinding {
  bound.set(core, binding);
  return binding;
}

/** The in-memory engage store for a core memory repository, created on first use and fed by its events. */
export function memoryFor(core: SchoodAIRepository, now: () => Date): EngageBinding {
  const existing = bound.get(core);
  if (existing) return existing;
  const memory = createEngageMemory({ core, now });
  const original = core.addLearningEvents.bind(core);
  core.addLearningEvents = async (events: LearningEvent[]) => {
    await original(events);
    memory.recordEvents(events);
    // Postgres counts new events every few minutes (ai-engage-ingest-v1) and on read; memory counts at once.
    for (const userId of new Set(events.map((event) => event.userId))) await memory.ingest(userId, now());
  };
  return bindEngage(core, { repo: memory, storage: memoryStorage(), memory });
}

async function productionBinding(url: string, key: string): Promise<EngageBinding> {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.89.0');
  const client = createClient(url, key, { auth: { persistSession: false } });
  return { repo: createEngagePostgres(client as unknown as EngageDatabase), storage: s3Storage(client), memory: null };
}

export function engage(ctx: Pick<RequestContext, 'repo' | 'now'>): Promise<EngageBinding> {
  const hit = bound.get(ctx.repo);
  if (hit) return Promise.resolve(hit);
  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (url && key) {
    production ??= productionBinding(url, key).catch((cause) => { production = null; throw cause; });
    return production;
  }
  if (url) throw new Error('engage: SUPABASE_SERVICE_ROLE_KEY is missing');
  return Promise.resolve(memoryFor(ctx.repo, ctx.now));
}
