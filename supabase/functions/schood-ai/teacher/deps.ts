import { classifyTelegramFailure, type TelegramFailureDecision } from '../../_shared/telegram-delivery.ts';
import type { FunctionCallInit, RequestContext } from '../types.ts';
import { defineStore } from '../stores.ts';
import { createMemoryTeacherStore } from './memory-store.ts';
import { createPgTeacherStore, type TeacherDatabase } from './pg-store.ts';
import type { TeacherStore } from './store.ts';

/** The teacher tables (ai_teacher_*): Postgres when deployed, the memory twin in tests and dev stacks. Use ctx.store(teacherStore). */
export const teacherStore = defineStore<TeacherStore>('teacher', {
  postgres: (db) => createPgTeacherStore(db as unknown as TeacherDatabase),
  memory: ({ now }) => createMemoryTeacherStore({ now }).store,
});

// What the teacher area needs beyond RequestContext:
//   telegram      the Bot API for channel autopilot (T11), posting as the Schood bot;
//   callFunction  another Schood Edge Function as the person (core's ctx.functions.call);
//   appOrigin     the public app origin, for handout links.
// Tests and the local dev stack replace these with setTeacherDeps().

export interface TelegramReply { ok: true; result: Record<string, unknown> }
export interface TelegramFailure { ok: false; status: number; description: string; decision: TelegramFailureDecision }
export interface TelegramApi {
  /** The bot's own username, when known, for the "add @bot as an admin" step. */
  username: string | null;
  call(method: 'getMe' | 'getChat' | 'getChatMember' | 'sendMessage' | 'sendPoll', body: Record<string, unknown>): Promise<TelegramReply | TelegramFailure>;
}
export type RemoteCall = <T = unknown>(ctx: RequestContext, name: string, path: string, init: FunctionCallInit) => Promise<T>;
export interface TeacherDeps {
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
/** Another Schood function as the person: core's ctx.functions.call, which carries Idempotency-Key and If-Match (Assessment Cloud commands). Tests replace it. */
export const remoteCall: RemoteCall = <T>(ctx: RequestContext, name: string, path: string, init: FunctionCallInit) => ctx.functions.call<T>(name, path, init);

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

function fromEnvironment(): TeacherDeps {
  const token = env('SCHOOD_AI_CHANNEL_BOT_TOKEN') ?? env('TELEGRAM_BOT_TOKEN');
  const origins = (env('SCHOOD_AI_ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter((origin) => /^https:\/\/[a-z0-9.-]+$/i.test(origin));
  return { telegram: token ? botApi(token) : null, callFunction: remoteCall, appOrigin: origins[0] ?? 'https://ai.schood.online' };
}

/** The deps in force: what setTeacherDeps gave, filled in from the environment. */
export function teacherDeps(): Promise<TeacherDeps> {
  built ??= Promise.resolve({ ...fromEnvironment(), ...configured } as TeacherDeps);
  return built;
}
