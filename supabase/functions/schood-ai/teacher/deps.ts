import { classifyTelegramFailure, type TelegramFailureDecision } from '../../_shared/telegram-delivery.ts';
import { SchoodAIError, type FunctionCallInit, type RequestContext } from '../types.ts';
import { createMemoryTeacherStore } from './memory-store.ts';
import { createPgTeacherStore, type TeacherDatabase } from './pg-store.ts';
import type { TeacherStore } from './store.ts';

// What the teacher area needs beyond RequestContext, behind one small adapter that
// can be deleted when core offers it (see docs/product/ai-requests/teacher.md):
//   store         the teacher tables (core has no repository hook for an area's own tables);
//   telegram      the Bot API for channel autopilot (T11), posting as the Schood bot;
//   callFunction  another Schood Edge Function with the person's own token; it adds
//                 request headers that ctx.functions.call cannot send yet (Assessment
//                 Cloud needs an Idempotency-Key on commands).
// Tests and the local dev stack replace these with setTeacherDeps().

export interface TelegramReply { ok: true; result: Record<string, unknown> }
export interface TelegramFailure { ok: false; status: number; description: string; decision: TelegramFailureDecision }
export interface TelegramApi {
  /** The bot's own username, when known, for the "add @bot as an admin" step. */
  username: string | null;
  call(method: 'getMe' | 'getChat' | 'getChatMember' | 'sendMessage' | 'sendPoll', body: Record<string, unknown>): Promise<TelegramReply | TelegramFailure>;
}
export type RemoteCall = <T = unknown>(ctx: RequestContext, name: string, path: string, init: FunctionCallInit & { headers?: Record<string, string> }) => Promise<T>;
export interface TeacherDeps {
  store: TeacherStore;
  /** Null until the owner sets a channel bot token (SCHOOD_AI_CHANNEL_BOT_TOKEN, else TELEGRAM_BOT_TOKEN). */
  telegram: TelegramApi | null;
  callFunction: RemoteCall;
  /** The public app origin, for handout links. */
  appOrigin: string;
}

let configured: Partial<TeacherDeps> | null = null;
let built: Promise<TeacherDeps> | null = null;

/** Replaces any part of the deps (tests, the local dev stack); null resets to the environment. */
export function setTeacherDeps(next: Partial<TeacherDeps> | null): void {
  configured = next;
  built = null;
}

const env = (name: string): string | undefined => {
  try { return Deno.env.get(name) ?? undefined; } catch { return undefined; }
};
const HEADER_ALLOWED = new Set(['idempotency-key', 'if-match']);
const FUNCTION_NAME = /^[a-z0-9][a-z0-9-]{1,60}$/;

/** Calls another function as the person, with allowed extra headers; otherwise the same as ctx.functions.call. */
export const remoteCall: RemoteCall = async <T>(ctx: RequestContext, name: string, path: string, init: FunctionCallInit & { headers?: Record<string, string> }): Promise<T> => {
  const headers = Object.entries(init.headers ?? {}).filter(([key]) => HEADER_ALLOWED.has(key.toLowerCase()));
  if (!headers.length) return ctx.functions.call<T>(name, path, init);
  const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY');
  if (!FUNCTION_NAME.test(name) || (path && (!path.startsWith('/') || path.includes('..')))) throw new Error('invalid function call');
  if (!ctx.user.token) throw new SchoodAIError('user_token_required', 'This needs the person to be signed in on the web.', 409);
  if (!url || !anon) throw new SchoodAIError('upstream_failed', `${name} is not reachable here.`, 502, { service: name, status: 0 });
  const target = new URL(`${url}/functions/v1/${name}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) target.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(target, {
      method: init.method ?? 'GET',
      headers: { apikey: anon, Authorization: `Bearer ${ctx.user.token}`, ...Object.fromEntries(headers), ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(init.timeoutMs ?? 8_000),
    });
  } catch {
    throw new SchoodAIError('upstream_failed', `${name} did not answer.`, 502, { service: name, status: 0 });
  }
  const text = await response.text().catch(() => '');
  if (text.length > (init.maxBytes ?? 1_000_000)) throw new SchoodAIError('upstream_failed', `${name} answered too much.`, 502, { service: name, status: response.status });
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) throw new SchoodAIError('upstream_failed', `${name} answered ${response.status}.`, 502, { service: name, status: response.status, upstream_code: typeof (data as { code?: unknown })?.code === 'string' ? (data as { code: string }).code.slice(0, 64) : null });
  return data as T;
};

/** The Telegram Bot API over fetch. Failures are classified the same way as send-telegram. */
export function botApi(token: string, fetcher: typeof fetch = fetch): TelegramApi {
  let username: string | null = null;
  const api: TelegramApi = {
    get username() { return username; },
    async call(method, body) {
      let status = 0, payload: Record<string, unknown> = {};
      try {
        const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });
        status = response.status;
        payload = await response.json().catch(() => ({}));
      } catch {
        status = 0;
      }
      if (status === 200 && payload.ok === true) {
        const result = (payload.result && typeof payload.result === 'object' ? payload.result : {}) as Record<string, unknown>;
        if (method === 'getMe' && typeof result.username === 'string') username = result.username;
        return { ok: true, result };
      }
      const description = typeof payload.description === 'string' ? payload.description.slice(0, 200) : 'Telegram did not answer.';
      return { ok: false, status, description, decision: classifyTelegramFailure({ httpStatus: status, description, parameters: payload.parameters as { retry_after?: number } }, 1) };
    },
  };
  return api;
}

async function fromEnvironment(): Promise<TeacherDeps> {
  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  let store: TeacherStore;
  if (url && key) {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.89.0');
    store = createPgTeacherStore(createClient(url, key, { auth: { persistSession: false } }) as unknown as TeacherDatabase);
  } else {
    // Only the local dev stack runs without a project; production always has both.
    console.warn(JSON.stringify({ event: 'schood_ai_teacher_memory_store' }));
    store = createMemoryTeacherStore().store;
  }
  const token = env('SCHOOD_AI_CHANNEL_BOT_TOKEN') ?? env('TELEGRAM_BOT_TOKEN');
  const origins = (env('SCHOOD_AI_ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter((origin) => /^https:\/\/[a-z0-9.-]+$/i.test(origin));
  return { store, telegram: token ? botApi(token) : null, callFunction: remoteCall, appOrigin: origins[0] ?? 'https://ai.schood.online' };
}

/** The deps in force: what setTeacherDeps gave, filled in from the environment. */
export function teacherDeps(): Promise<TeacherDeps> {
  built ??= (async () => {
    if (configured?.store && configured.callFunction && 'telegram' in configured && configured.appOrigin) return configured as TeacherDeps;
    const base = configured?.store && configured.callFunction ? { store: configured.store, telegram: null, callFunction: configured.callFunction, appOrigin: 'https://ai.schood.online' } : await fromEnvironment();
    return { ...base, ...configured } as TeacherDeps;
  })();
  built.catch(() => { built = null; });
  return built;
}
