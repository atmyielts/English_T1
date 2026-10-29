import type { RequestContext } from '../types.ts';
import { defineStore, type ServiceDb, type StoreEnv } from '../stores.ts';
import { SecretBox } from './crypto.ts';
import type { CentreStore } from './store.ts';

// What the centre area needs besides the core RequestContext: its own store, a
// Telegram client, the secret box and the media store, as one area store
// (core's defineStore). The deployed function builds it over core's service-role
// client on first use; tests and the dev stack put a memory twin bound to their
// memory repository in its place with stores.use(centreStore, centreRuntime(deps)).

export interface TelegramResult { ok: boolean; result?: Record<string, unknown> & { message_id?: number }; description?: string; error_code?: number }
export interface TelegramApi {
  /** Calls the Bot API with a bot token. Never throws; network trouble is ok: false. */
  call(token: string, method: string, body: Record<string, unknown>): Promise<TelegramResult>;
}
export interface MediaStore {
  /** Stores a file and returns its reference ({provider, bucket, path}); null when no media store is configured. */
  put(key: string, bytes: Uint8Array, mime: string): Promise<Record<string, string> | null>;
}
export interface CentreConfig {
  /** The app's origin, for invite links and messages (https://ai.schood.online). */
  appUrl: string;
  /** Where the public centre routes are mounted (Telegram webhooks); null until set. */
  publicUrl: string | null;
  /** The Schood student bot, for briefs to staff who have not linked the centre's own bot. */
  schoodBotToken: string | null;
}
export interface CentreDeps {
  store: CentreStore;
  telegram: TelegramApi;
  /** Null when SCHOOD_AI_CENTRE_KEYS is not configured: features that store secrets refuse. */
  secrets: SecretBox | null;
  media: MediaStore | null;
  config: CentreConfig;
}

/** The area store: the centre's dependencies, built once per function instance. */
export interface CentreRuntime { deps(): Promise<CentreDeps> }
/** A runtime over fixed dependencies (tests and the dev stack). */
export const centreRuntime = (deps: CentreDeps): CentreRuntime => ({ deps: () => Promise.resolve(deps) });

export const centreStore = defineStore<CentreRuntime>('centre', {
  postgres: (db, env) => {
    // Built on first use; a failure (for example a malformed key list) is retried on the next request.
    let built: Promise<CentreDeps> | null = null;
    return { deps: () => (built ??= productionDeps(db, env).catch((cause) => { built = null; throw cause; })) };
  },
  // The memory centre store keeps its rows next to the memory repository's, so it
  // cannot be built from nothing; centreFixture() and the dev stack bind one.
  memory: () => ({ deps: () => Promise.reject(new Error('Bind the centre memory store: stores.use(centreStore, centreRuntime(deps)).')) }),
});

export function centreDeps(ctx: Pick<RequestContext, 'store'>): Promise<CentreDeps> {
  return ctx.store(centreStore).deps();
}

export const fetchTelegram = (fetcher: typeof fetch = fetch): TelegramApi => ({
  async call(token, method, body) {
    if (!/^\d{5,16}:[A-Za-z0-9_-]{30,80}$/.test(token)) return { ok: false, description: 'invalid_token' };
    try {
      const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
      });
      const payload = await response.json().catch(() => ({ ok: false, description: `HTTP ${response.status}` }));
      return payload as TelegramResult;
    } catch (cause) {
      return { ok: false, description: cause instanceof Error ? cause.name : 'network' };
    }
  },
});

async function productionDeps(db: ServiceDb, env: StoreEnv): Promise<CentreDeps> {
  const read = (name: string) => env.env(name)?.trim() || undefined;
  const { createPostgresCentreStore } = await import('./store-postgres.ts');
  // Knowledge files go to the repo's media store (S3). It reads its own settings and
  // loads the S3 client, so it is imported only when a file is stored.
  const media: MediaStore = {
    async put(path, bytes, mime) {
      const storage = await import('../../_shared/media-storage.ts');
      if (!storage.getS3Config()) return null;
      const stored = await storage.uploadFileToS3(path, new File([new Uint8Array(bytes)], path.split('/').pop() ?? 'file', { type: mime }), mime, { route: 'schood-ai/centre' });
      return { provider: 's3', bucket: stored.bucket, path: stored.path };
    },
  };
  const publicUrl = read('SCHOOD_AI_CENTRE_PUBLIC_URL');
  return {
    store: createPostgresCentreStore(db),
    telegram: fetchTelegram(),
    secrets: await SecretBox.fromEnv(read),
    media,
    config: {
      appUrl: (read('SCHOOD_AI_APP_URL') ?? 'https://ai.schood.online').replace(/\/+$/, ''),
      publicUrl: publicUrl && /^https:\/\/[^\s]+$/.test(publicUrl) ? publicUrl.replace(/\/+$/, '') : null,
      // Optional (owner decision): the Schood student bot's token, for briefs to managers who have not linked the centre's own bot.
      schoodBotToken: read('SCHOOD_AI_TELEGRAM_BOT_TOKEN') ?? null,
    },
  };
}
