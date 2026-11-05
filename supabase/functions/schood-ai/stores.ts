import type { SchoodAIDatabase } from './repository.ts';

// Area tables. Core's own tables go through ctx.repo; an area defines one store
// for its tables with defineStore: a Postgres implementation over the
// service-role client for the deployed function, and an in-memory twin for
// tests and dev stacks. Routes, context providers, plan sources and actions get
// it with ctx.store(handle) (plan sources: input.store(handle)). One instance per
// function instance, built on first use, so nothing is loaded until it is needed.
//
//   // supabase/functions/schood-ai/learner/store.ts
//   export const learnerStore = defineStore<LearnerStore>('learner', {
//     postgres: (db) => createPostgresLearnerStore(db),
//     memory: ({ now }) => createMemoryLearnerStore({}, now),
//   });
//   // in a route
//   const store = ctx.store(learnerStore);
//
// RLS stays on for area tables with no browser policies: only this service-role
// client reads them, always behind the route's own role and workspace checks.

/** The service-role client's query surface (supabase-js `from` and `rpc`). */
export type ServiceDb = SchoodAIDatabase;
export interface StoreEnv {
  now(): Date;
  /** Only SCHOOD_AI_* settings; secrets of other services are not readable here. */
  env(name: string): string | undefined;
}
export interface StoreDefinition<T> {
  /** The deployed store over the service-role client. */
  postgres(db: ServiceDb, env: StoreEnv): T;
  /** The in-memory twin: same behaviour, no network. Tests and dev stacks use it. */
  memory(env: StoreEnv): T;
}
export interface StoreHandle<T> {
  readonly name: string;
  /** Carries the store's type; never set. */
  readonly __store?: T;
}

const definitions = new Map<string, StoreDefinition<unknown>>();
const NAME = /^[a-z][a-z0-9_.-]{1,60}$/;

/** Defines an area's store. Names are unique (use your area, for example `learner`); define at module load. */
export function defineStore<T>(name: string, definition: StoreDefinition<T>): StoreHandle<T> {
  if (!NAME.test(name)) throw new Error(`store name ${name} is invalid`);
  if (definitions.has(name)) throw new Error(`store ${name} is already defined`);
  definitions.set(name, definition as StoreDefinition<unknown>);
  return { name };
}

export interface Stores {
  get<T>(handle: StoreHandle<T>): T;
  /** Tests and dev stacks: replace the instance (for example a seeded memory twin). */
  use<T>(handle: StoreHandle<T>, instance: T): void;
  readonly kind: 'postgres' | 'memory';
}
export type StoreBackend = { kind: 'postgres'; db: ServiceDb } | { kind: 'memory' };

export function createStores(backend: StoreBackend, options: { now(): Date; env?(name: string): string | undefined }): Stores {
  const instances = new Map<string, unknown>();
  const env: StoreEnv = {
    now: options.now,
    env: (name) => (/^SCHOOD_AI_[A-Z0-9_]{1,60}$/.test(name) ? options.env?.(name) : undefined),
  };
  return {
    kind: backend.kind,
    get<T>(handle: StoreHandle<T>): T {
      if (instances.has(handle.name)) return instances.get(handle.name) as T;
      const definition = definitions.get(handle.name);
      if (!definition) throw new Error(`store ${handle.name} is not defined`);
      const instance = backend.kind === 'postgres' ? definition.postgres(backend.db, env) : definition.memory(env);
      instances.set(handle.name, instance);
      return instance as T;
    },
    use<T>(handle: StoreHandle<T>, instance: T): void {
      if (!definitions.has(handle.name)) throw new Error(`store ${handle.name} is not defined`);
      instances.set(handle.name, instance);
    },
  };
}
