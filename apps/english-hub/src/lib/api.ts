import { edgeBase, supabase, supabaseAnonKey } from './supabase';

/** A failed edge-function call. `status` is the HTTP status (0 = network). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const currentToken = async (): Promise<string | null> => {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
};

const refreshedToken = async (): Promise<string | null> => {
  try {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
};

const readBody = async (res: Response): Promise<unknown> => {
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return res.json().catch(() => null);
  return res.text().catch(() => '');
};

const errorFrom = (status: number, body: unknown): ApiError => {
  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message = typeof rec.error === 'string'
    ? rec.error
    : typeof rec.message === 'string'
      ? rec.message
      : typeof body === 'string' && body
        ? body.slice(0, 200)
        : `Request failed (${status})`;
  const code = typeof rec.code === 'string' ? rec.code : null;
  return new ApiError(message, status, code);
};

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
};

/**
 * Calls a Supabase edge function as the signed-in learner. Retries once with a
 * refreshed token on 401 so a long-open tab keeps working.
 */
export const edge = async <T>(fn: string, path = '', options: Options = {}): Promise<T> => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  const url = `${edgeBase}/${fn}${path}${qs ? `?${qs}` : ''}`;

  const send = (token: string | null) => fetch(url, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers: {
      apikey: supabaseAnonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  let res: Response;
  try {
    const token = await currentToken();
    res = await send(token);
    if (res.status === 401) {
      const next = await refreshedToken();
      if (next && next !== token) res = await send(next);
    }
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('Network unavailable', 0, 'network');
  }

  const body = await readBody(res);
  if (!res.ok) throw errorFrom(res.status, body);
  return body as T;
};
