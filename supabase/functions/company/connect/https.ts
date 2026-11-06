// The server-only sender connects to the exact address validated by ssrf.ts. A second
// ordinary fetch(hostname) would resolve it again and permit DNS rebinding between
// validation and connection. TLS still verifies the original hostname and uses its SNI.
import { request, type RequestOptions } from 'node:https';
import { isIP } from 'node:net';
import { isBlockedAddress } from './ssrf.ts';

export function pinnedOptions(rawUrl: string, init: RequestInit, address: string): RequestOptions {
  const url = new URL(rawUrl), hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(address);
  if (!family || isBlockedAddress(address)) throw new Error('Blocked webhook address');
  const body = typeof init.body === 'string' ? init.body : '';
  return {
    protocol: 'https:', hostname, port: url.port ? Number(url.port) : 443,
    path: `${url.pathname}${url.search}`, method: 'POST',
    headers: { ...Object.fromEntries(new Headers(init.headers)), 'Content-Length': new TextEncoder().encode(body).length },
    // A dedicated connection cannot reuse a socket to an earlier DNS answer.
    agent: false, family,
    servername: isIP(hostname) ? undefined : hostname,
    rejectUnauthorized: true, signal: init.signal ?? undefined,
    lookup: (_host, _options, callback) => callback(null, address, family),
  };
}

/** Resolves at response headers and closes immediately; webhook response bodies are ignored. */
export function pinnedHttps(rawUrl: string, init: RequestInit, address: string): Promise<{ status: number; body: null }> {
  return new Promise((resolve, reject) => {
    const req = request(pinnedOptions(rawUrl, init, address), (response) => {
      resolve({ status: response.statusCode ?? 0, body: null });
      response.destroy();
    });
    req.once('error', reject);
    req.end(typeof init.body === 'string' ? init.body : '');
  });
}
