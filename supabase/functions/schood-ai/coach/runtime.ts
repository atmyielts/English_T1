import { COACH_PASS_PRODUCT_IDS } from '../../../../packages/ai-core/src/catalog.ts';
import type { CoachPack } from '../../../../packages/coach-packs/src/mod.ts';
import { loadPacks } from '../../../../packages/coach-packs/src/registry.ts';
import { defineStore, type StoreHandle } from '../stores.ts';
import { createMemoryCoachStore } from './store-memory.ts';
import { createPostgresCoachStore, type CoachDatabase } from './store-postgres.ts';
import type { CoachStore } from './store.ts';

// What the coach area runs on, through core's area stores (stores.ts):
//   - `coachStore`: the coach_* tables (Postgres when deployed, the memory twin in
//     tests and dev stacks);
//   - `coachServices`: the coach settings (SCHOOD_AI_COACH_*);
//   - the validated packs, loaded once per function instance.

export interface CoachBot { id: string | null; username: string | null }
export interface CoachConfig {
  /** The Schood AI app (Mini App screens, certificate pages). */
  appUrl: string;
  /** Per pack: the bot's numeric id (for Mini App signatures) and username (for t.me links). Not secret. */
  bots: Record<string, CoachBot>;
  /** Coach feature (B1–B6) → Schood product ids of its single-coach pass. */
  passProducts: Record<string, string[]>;
  /** Credits a coach pass or team seat brings per coach per 30 days (core grants them). [ASSUMPTION] */
  fairUseCredits: number;
  /** Telegram's Ed25519 public key for Mini App data (hex). */
  telegramPublicKey: string;
}
export interface CoachServices {
  config: CoachConfig;
}
export interface CoachRuntime extends CoachServices {
  store: CoachStore;
  packs: ReadonlyMap<string, CoachPack>;
}

/** Telegram's production key for validating Mini App data without the bot token (core.telegram.org/bots/webapps). */
export const TELEGRAM_PRODUCTION_KEY = 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d';
export const FAIR_USE_CREDITS = 1200;

/** `ielts:123456789:SchoodIeltsCoachBot,speaking:987654321:SchoodSpeakingBot` (SCHOOD_AI_COACH_BOTS). */
export function parseBots(value: string | undefined): Record<string, CoachBot> {
  const out: Record<string, CoachBot> = {};
  for (const entry of (value ?? '').split(',').map((part) => part.trim()).filter(Boolean)) {
    const [pack, id, username] = entry.split(':').map((part) => part.trim());
    if (!/^[a-z][a-z0-9-]{1,15}$/.test(pack ?? '')) continue;
    out[pack] = { id: /^\d{5,20}$/.test(id ?? '') ? id : null, username: /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(username ?? '') ? username : null };
  }
  return out;
}
/**
 * The single-coach pass products: the pricing migration's deterministic ids
 * (packages/ai-core/src/catalog.ts), plus any in `B1:<product uuid>,B2:<product uuid>`
 * (SCHOOD_AI_COACH_PASS_PRODUCT_IDS, optional, for a product made by hand).
 */
export function parsePasses(value: string | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = Object.fromEntries(Object.entries(COACH_PASS_PRODUCT_IDS).map(([feature, id]) => [feature, [id]]));
  for (const entry of (value ?? '').split(',').map((part) => part.trim()).filter(Boolean)) {
    const [feature, id] = entry.split(':').map((part) => part.trim());
    if (!/^B[1-6]$/.test(feature ?? '') || !/^[0-9a-f-]{36}$/i.test(id ?? '')) continue;
    if (!(out[feature] ??= []).includes(id.toLowerCase())) out[feature].push(id.toLowerCase());
  }
  return out;
}

export function configFromEnv(read: (name: string) => string | undefined): CoachConfig {
  const appUrl = (read('SCHOOD_AI_COACH_APP_URL') ?? 'https://ai.schood.online').replace(/\/+$/, '');
  const fairUse = Number(read('SCHOOD_AI_COACH_FAIR_USE_CREDITS') ?? '');
  return {
    appUrl: /^https:\/\/[a-z0-9.-]+$/i.test(appUrl) || /^http:\/\/localhost(:\d+)?$/.test(appUrl) ? appUrl : 'https://ai.schood.online',
    bots: parseBots(read('SCHOOD_AI_COACH_BOTS')),
    passProducts: parsePasses(read('SCHOOD_AI_COACH_PASS_PRODUCT_IDS')),
    fairUseCredits: Number.isInteger(fairUse) && fairUse > 0 && fairUse <= 100000 ? fairUse : FAIR_USE_CREDITS,
    telegramPublicKey: TELEGRAM_PRODUCTION_KEY,
  };
}

export const coachStore = defineStore<CoachStore>('coach', {
  postgres: (db) => createPostgresCoachStore(db as unknown as CoachDatabase),
  memory: ({ now }) => createMemoryCoachStore({ now }).store,
});

export const coachServices = defineStore<CoachServices>('coach.services', {
  postgres: (_db, env) => ({ config: configFromEnv((name) => env.env(name)) }),
  memory: (env) => ({ config: configFromEnv((name) => env.env(name)) }),
});

/** The coach runtime of a request, a plan source or a context provider. */
export function runtimeOf(store: <T>(handle: StoreHandle<T>) => T): CoachRuntime {
  return { ...store(coachServices), store: store(coachStore), packs: loadPacks() };
}
