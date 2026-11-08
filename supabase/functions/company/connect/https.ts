// The server-only sender connects to the exact address validated by ssrf.ts. A second
// ordinary fetch(hostname) would resolve it again and permit DNS rebinding between
// validation and connection. TLS still verifies the original hostname and uses its SNI.
// Only wire.deno.ts imports this file: it uses Deno.connect and Deno.startTls, because
// Deno's node:https refuses the `lookup` option a pinned node request would need.
import { isBlockedAddress } from './ssrf.ts';

/** Where the socket goes and what TLS checks: the validated address, the URL's own name. */
export interface PinnedTarget {
  /** The address the TCP connection is opened to. Never the name, so it is not resolved again. */
  address: string; port: number;
  /** The name TLS sends as SNI and checks the certificate against. */
  tlsName: string;
  /** The HTTP/1.1 request, written as is after the handshake. */
  request: Uint8Array;
}

/** Response bytes read before giving up on finding the status line. */
const MAX_HEAD = 16 * 1024;

export function pinnedTarget(rawUrl: string, init: RequestInit, address: string): PinnedTarget {
  const url = new URL(rawUrl), hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:') throw new Error('Webhooks are sent over https only');
  if (isBlockedAddress(address)) throw new Error('Blocked webhook address');
  const body = new TextEncoder().encode(typeof init.body === 'string' ? init.body : '');
  // Headers refuses CR and LF in names and values, so nothing can be smuggled into the request.
  const headers = new Headers(init.headers);
  for (const name of ['host', 'content-length', 'connection', 'transfer-encoding']) headers.delete(name);
  const lines = [`POST ${url.pathname || '/'}${url.search} HTTP/1.1`, `Host: ${url.host}`];
  headers.forEach((value, name) => lines.push(`${name}: ${value}`));
  // A dedicated connection, closed after the answer: no socket is reused for an earlier DNS answer.
  lines.push(`Content-Length: ${body.length}`, 'Connection: close', '', '');
  const head = new TextEncoder().encode(lines.join('\r\n'));
  const request = new Uint8Array(head.length + body.length);
  request.set(head);
  request.set(body, head.length);
  return { address, port: url.port ? Number(url.port) : 443, tlsName: hostname, request };
}

/** The status from an HTTP/1.x status line, or null while the line is not complete. */
export function statusLine(bytes: Uint8Array): number | null {
  const text = new TextDecoder().decode(bytes);
  const end = text.indexOf('\r\n');
  if (end < 0) return null;
  const match = text.slice(0, end).match(/^HTTP\/1\.[01] (\d{3})(?: |$)/);
  if (!match) throw new Error('Not an HTTP/1.1 answer');
  return Number(match[1]);
}

const abortError = () => new DOMException('The webhook request was aborted.', 'AbortError');

export interface PinnedDeps {
  /** Opens the TCP connection. Tests pass one that records where it was asked to go. */
  connect?: (options: { hostname: string; port: number }) => Promise<Deno.TcpConn>;
  /** Extra trusted roots, for tests against a local server. Production uses the runtime's roots. */
  caCerts?: string[];
  timeoutMs?: number;
}

/** Resolves at the response's status line and closes immediately; webhook response bodies are ignored. */
export async function pinnedHttps(rawUrl: string, init: RequestInit, address: string, deps: PinnedDeps = {}): Promise<{ status: number; body: null }> {
  const target = pinnedTarget(rawUrl, init, address);
  const signal = init.signal ?? undefined;
  if (signal?.aborted) throw abortError();
  let socket: Deno.Conn | null = null, aborted = false;
  const stop = () => {
    aborted = true;
    try { socket?.close(); } catch { /* already closed */ }
  };
  signal?.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(stop, deps.timeoutMs ?? 10_000);
  try {
    const tcp = await (deps.connect ?? ((options) => Deno.connect({ ...options, transport: 'tcp' })))({ hostname: target.address, port: target.port });
    socket = tcp;
    if (aborted) throw abortError();
    // The certificate is checked against the URL's name, not the address dialled.
    const tls = await Deno.startTls(tcp, { hostname: target.tlsName, caCerts: deps.caCerts, alpnProtocols: ['http/1.1'] });
    socket = tls;
    if (aborted) throw abortError();
    for (let written = 0; written < target.request.length;) written += await tls.write(target.request.subarray(written));
    const head = new Uint8Array(MAX_HEAD);
    let filled = 0;
    while (filled < MAX_HEAD) {
      const read = await tls.read(head.subarray(filled));
      if (read === null) break;
      filled += read;
      const status = statusLine(head.subarray(0, filled));
      if (status !== null) return { status, body: null };
    }
    throw new Error(filled >= MAX_HEAD ? 'Webhook answer too long' : 'Webhook connection closed early');
  } catch (cause) {
    throw aborted ? abortError() : cause;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
    try { socket?.close(); } catch { /* already closed */ }
  }
}
