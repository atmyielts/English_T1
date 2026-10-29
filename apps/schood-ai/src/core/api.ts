import { SSEParser } from '../../../../packages/ai-core/src/mod.ts';
import { activeSource } from './auth.tsx';

// The client for /functions/v1/schood-ai/<area>/<action>. Every call sends the
// person's own Supabase token; the function checks it and their workspace role.
// Errors come back as ApiError with the function's stable `code` (plan_required,
// capped, insufficient_credits…) so screens can show the right state.

const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
export const apiConfigured = Boolean(base && anon);

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** The workspace to act in; null means the personal workspace. */
  workspaceId?: string | null;
  /** Makes a retried request idempotent (charges once). */
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function prepare(path: string, options: ApiOptions) {
  if (!apiConfigured) throw new ApiError(0, 'unconfigured', 'Schood AI is not configured.');
  const token = await activeSource()?.token();
  if (!token) throw new ApiError(401, 'unauthorized', 'Sign in to continue.');
  const url = new URL(`${base}/functions/v1/schood-ai/${path}`);
  if (options.workspaceId) url.searchParams.set('workspace_id', options.workspaceId);
  for (const [key, value] of Object.entries(options.query ?? {})) if (value !== undefined) url.searchParams.set(key, value);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json',
    'x-schood-locale': document.documentElement.lang || 'en',
    ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
  };
  return { url, headers };
}

async function failure(response: Response): Promise<ApiError> {
  const payload = await response.json().catch(() => ({}));
  const { code, error, request_id: _id, ...details } = payload ?? {};
  return new ApiError(response.status, typeof code === 'string' ? code : 'request_failed', typeof error === 'string' ? error : 'Request failed', details);
}

/** A JSON call. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { url, headers } = await prepare(path, options);
  const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? 30_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
  try {
    const response = await fetch(url, { method: options.method ?? (options.body === undefined ? 'GET' : 'POST'), headers, signal, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
    if (!response.ok) throw await failure(response);
    return await response.json() as T;
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    if (timeout.signal.aborted) throw new ApiError(0, 'timeout', 'Timed out.');
    if (options.signal?.aborted) throw cause;
    throw new ApiError(0, 'network', 'Network error.');
  } finally {
    clearTimeout(timer);
  }
}

export interface StreamEvent { event: string; data: Record<string, unknown> }

/**
 * A server-sent events call (core/chat). A refusal before the stream (plan, caps,
 * credits) throws ApiError like `api`; once streaming, events arrive through onEvent.
 * Aborting `signal` stops the answer; what arrived so far stays.
 */
export async function stream(path: string, options: ApiOptions & { onEvent: (event: StreamEvent) => void }): Promise<void> {
  const { url, headers } = await prepare(path, options);
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers: { ...headers, Accept: 'text/event-stream' }, signal: options.signal, body: JSON.stringify(options.body ?? {}) });
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new ApiError(0, 'network', 'Network error.');
  }
  if (!response.ok) throw await failure(response);
  if (!response.body) throw new ApiError(0, 'network', 'Network error.');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new SSEParser();
  const emit = (events: { event: string; data: string }[]) => {
    for (const event of events) {
      try { options.onEvent({ event: event.event, data: JSON.parse(event.data) }); } catch { /* a malformed event is skipped */ }
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      emit(parser.push(value));
    }
    emit(parser.flush());
  } finally {
    reader.releaseLock();
  }
}
