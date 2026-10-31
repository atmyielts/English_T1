import { fixture, SYSTEM_SECRET, type FixtureOptions } from '../fixture.test.ts';
import { MODULES } from '../handler.ts';
import type { FeatureModule, LearningEventInput } from '../types.ts';
import { engageStore } from './binding.ts';
import type { EngageMemory } from './memory.ts';
import { ENGAGE_SYSTEM_JOBS } from './system.ts';

// Shared helpers for the engage tests: the real handler and memory repository, plus
// a stand-in "coach" route that reports learning exactly as any area does, through
// ctx.events.emit (so engage only ever sees what ai_learning_events would hold).

export const learnModule: FeatureModule = {
  area: 'coach',
  routes: {
    'test-learn': {
      POST: async (ctx) => {
        const body = await ctx.body<{ events: LearningEventInput[] }>();
        for (const event of body.events) ctx.events.emit(event);
        return { ok: true, user: ctx.user.id };
      },
      service: true,
    },
  },
};

export function engageFixture(options: FixtureOptions = {}) {
  // core/system-tick runs engage's own jobs only (not other areas' registrations).
  const f = fixture({ systemJobs: ENGAGE_SYSTEM_JOBS, ...options, modules: [...(options.modules ?? MODULES), learnModule] });
  let memory: EngageMemory | null = null;
  const store = async () => {
    if (!memory) {
      await f.json('GET', 'engage/settings', { token: 'tok-plus' });
      memory = f.stores.get(engageStore).bind(f.memory.repository).memory!;
    }
    return memory;
  };
  /**
   * Reports learning for a person through the real emit path, waits for the write, then
   * counts it as the five-minute ai-engage-ingest-v1 job would (so boards show it at once).
   */
  const learn = async (token: string, events: LearningEventInput[]) => {
    const memory = await store();
    const response = await f.json('POST', 'coach/test-learn', { token, body: { events } });
    if (response.status !== 200) throw new Error(`learn failed ${response.status} ${JSON.stringify(response.body)}`);
    await f.settle();
    await memory.ingest(response.body.user, new Date());
  };
  /** One run of core's scheduler (pg_cron's core/system-tick): engage's jobs that are due now. */
  const tick = async () => {
    const response = await f.json('POST', 'core/system-tick', { token: null, origin: null, body: {}, headers: { 'x-schood-service-secret': SYSTEM_SECRET } });
    if (response.status !== 200) throw new Error(`tick failed ${response.status} ${JSON.stringify(response.body)}`);
    await f.settle();
  };
  const scored = (feature: string, skill: string, minutes = 5, extra: Partial<LearningEventInput> = {}): LearningEventInput => ({ kind: 'turn_scored', area: 'coach', feature, skill, verified_minutes: minutes, score: 6.5, ...extra });
  const passed = (feature: string, skill: string, minutes = 5, extra: Partial<LearningEventInput> = {}): LearningEventInput => ({ kind: 'check_passed', area: 'coach', feature, skill, verified_minutes: minutes, score: 80, ...extra });
  const get = (path: string, token = 'tok-plus', query: Record<string, string> = {}) => f.json('GET', `engage/${path}`, { token, query });
  const post = (path: string, body: unknown, token = 'tok-plus', query: Record<string, string> = {}) => f.json('POST', `engage/${path}`, { token, body, query });
  /** An adult who told us their date of birth. */
  const adult = (token = 'tok-plus', date = '1995-04-12') => post('settings', { birth_date: date }, token);
  return { ...f, store, learn, tick, scored, passed, get, post, adult };
}

export const DAY = 86_400_000;
/** A few bytes that start like a WebM file, enough for the magic-byte check. */
export const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08]);
export const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
