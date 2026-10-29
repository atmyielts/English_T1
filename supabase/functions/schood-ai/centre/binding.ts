import type { RequestContext, SchoodAIRepository } from '../types.ts';
import { SecretBox } from './crypto.ts';
import type { CentreStore } from './store.ts';

// What the centre area needs besides the core RequestContext: its own store, a
// Telegram client, the secret box and the media store. Core has no `ctx` member for
// an area's own tables yet (see docs/product/ai-requests/centre.md), so this is the
// small adapter: tests and the dev stack bind a memory store to their repository;
// the deployed function builds the Postgres store from its own environment on first
// use. Delete it when core passes area stores through the context.

export interface TelegramResult { ok: boolean; result?: Record<string, unknown> & { message_id?: number }; description?: string; error_code?: number }
export interface TelegramApi {
  /** Calls the Bot API with a bot token. Never throws; network trouble is ok: false. */
  call(token: string, method: string, body: Record<string, unknown>): Promise<TelegramResult>;
}
export interface MediaStore {
  /** Stores a file and returns its reference ({provider, bucket, path}). */
  put(key: string, bytes: Uint8Array, mime: string): Promise<Record<string, string>>;
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

const bound = new WeakMap<SchoodAIRepository, CentreDeps>();
let production: Promise<CentreDeps> | null = null;

/** Tests and the dev stack: use these dependencies for requests on this repository. */
export function bindCentre(repo: SchoodAIRepository, deps: CentreDeps): void {
  bound.set(repo, deps);
}

export function centreDeps(ctx: Pick<RequestContext, 'repo'>): Promise<CentreDeps> {
  const hit = bound.get(ctx.repo);
  if (hit) return Promise.resolve(hit);
  production ??= createProductionDeps().catch((cause) => { production = null; throw cause; });
  return production;
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

async function createProductionDeps(): Promise<CentreDeps> {
  const env = (name: string) => Deno.env.get(name)?.trim() || undefined;
  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const [{ createClient }, { createPostgresCentreStore }] = await Promise.all([
    import('https://esm.sh/@supabase/supabase-js@2.89.0'),
    import('./store-postgres.ts'),
  ]);
  const db = createClient(url, key, { auth: { persistSession: false } });
  let media: MediaStore | null = null;
  if (env('S3_BUCKET') && env('S3_REGION') && env('AWS_ACCESS_KEY_ID') && env('AWS_SECRET_ACCESS_KEY')) {
    media = {
      async put(path, bytes, mime) {
        const { uploadFileToS3 } = await import('../../_shared/media-storage.ts');
        const stored = await uploadFileToS3(path, new File([new Uint8Array(bytes)], path.split('/').pop() ?? 'file', { type: mime }), mime, { route: 'schood-ai/centre' });
        return { provider: 's3', bucket: stored.bucket, path: stored.path };
      },
    };
  }
  const publicUrl = env('SCHOOD_AI_CENTRE_PUBLIC_URL');
  return {
    store: createPostgresCentreStore(db as unknown as Parameters<typeof createPostgresCentreStore>[0]),
    telegram: fetchTelegram(),
    secrets: await SecretBox.fromEnv(env),
    media,
    config: {
      appUrl: (env('SCHOOD_AI_APP_URL') ?? 'https://ai.schood.online').replace(/\/+$/, ''),
      publicUrl: publicUrl && /^https:\/\/[^\s]+$/.test(publicUrl) ? publicUrl.replace(/\/+$/, '') : null,
      schoodBotToken: env('TELEGRAM_BOT_TOKEN') ?? null,
    },
  };
}
