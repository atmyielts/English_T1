import { SSEParser, type SSEEvent } from '../../../../packages/ai-core/src/mod.ts';
import { boundedJson } from '../../_shared/ai-response.ts';
import { ProviderError, type ProviderTarget } from './types.ts';

// Shared transport for the adapters: one fetch path that maps network failures,
// aborts and HTTP statuses to ProviderError codes, bounded body reads, and an SSE
// event iterator over a streaming response.

export const joinUrl = (base: string, path: string) => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

export function statusError(status: number): ProviderError {
  if (status === 429) return new ProviderError('rate_limited', status);
  if (status === 401 || status === 403) return new ProviderError('auth', status);
  if (status === 404) return new ProviderError('not_found', status);
  if (status >= 400 && status < 500) return new ProviderError('bad_request', status);
  return new ProviderError('server_error', status);
}

/** Sends a request with the provider's non-secret headers; the adapter adds authentication. */
export async function send(target: ProviderTarget, url: string, init: RequestInit & { headers: Record<string, string> }, signal: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await target.fetch(url, { ...init, headers: { ...target.provider.headers, ...init.headers }, signal });
  } catch (cause) {
    if (signal.aborted) throw new ProviderError(signal.reason instanceof ProviderError ? signal.reason.code : 'aborted');
    throw new ProviderError(cause instanceof DOMException && cause.name === 'TimeoutError' ? 'timeout' : 'network');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw statusError(response.status);
  }
  return response;
}

export async function readJson(response: Response, maxBytes = 4_000_000): Promise<Record<string, unknown>> {
  try {
    const value = await boundedJson(response, maxBytes);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
    return value as Record<string, unknown>;
  } catch {
    throw new ProviderError('invalid_response');
  }
}

export async function readBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new ProviderError('invalid_response');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new ProviderError('invalid_response'); }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

/** Server-sent events from a streaming provider response. */
export async function* sseEvents(response: Response, signal: AbortSignal): AsyncGenerator<SSEEvent> {
  if (!response.body) throw new ProviderError('invalid_response');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new SSEParser();
  try {
    while (true) {
      let chunk: ReadableStreamReadResult<string>;
      try {
        chunk = await reader.read();
      } catch {
        throw new ProviderError(signal.aborted ? (signal.reason instanceof ProviderError ? signal.reason.code : 'aborted') : 'network');
      }
      if (chunk.done) break;
      let events: SSEEvent[];
      try { events = parser.push(chunk.value); } catch { throw new ProviderError('invalid_response'); }
      for (const event of events) yield event;
    }
    for (const event of parser.flush()) yield event;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export function parseEventJson(data: string): Record<string, unknown> {
  try {
    const value = JSON.parse(data);
    if (value && typeof value === 'object') return value as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new ProviderError('invalid_response');
}

/** `data:<mime>;base64,<data>` or null. */
export function dataUrl(url: string): { mime: string; data: string } | null {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(url);
  return match ? { mime: match[1].toLowerCase(), data: match[2] } : null;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const tokens = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null);
export const seconds = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) / 1000 : 0);
export const AUDIO_MIME: Record<'mp3' | 'opus' | 'wav', string> = { mp3: 'audio/mpeg', opus: 'audio/ogg', wav: 'audio/wav' };
