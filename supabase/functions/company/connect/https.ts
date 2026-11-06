// The server-only sender connects to the exact address validated by ssrf.ts. A second
// ordinary fetch(hostname) would resolve it again and permit DNS rebinding between
// validation and connection. TLS still verifies the original hostname and uses its SNI.
import { isBlockedAddress } from './ssrf.ts';

// Keep this boundary independent of npm's Node declarations: the isolated Deno
// service job and Edge bundle do not install node_modules. The runtime already
// supplies node:https; only a real webhook delivery needs to load it.
export interface PinnedRequestOptions {
  protocol: 'https:'; hostname: string; port: number; path: string; method: 'POST';
  headers: Record<string, string | number>; agent: false; family: 4 | 6;
  servername: string | undefined; rejectUnauthorized: true; signal: AbortSignal | undefined;
  lookup: (host: string, options: unknown, callback: (error: null, address: string, family: number) => void) => void;
}
interface HttpsModule {
  request: (options: PinnedRequestOptions, onResponse: (response: { statusCode?: number; destroy: () => void }) => void) => {
    once: (event: 'error', onError: (error: Error) => void) => void;
    end: (body: string) => void;
  };
}
const NODE_HTTPS: string = 'node:https';

export function pinnedOptions(rawUrl: string, init: RequestInit, address: string): PinnedRequestOptions {
  const url = new URL(rawUrl), hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedAddress(address)) throw new Error('Blocked webhook address');
  const family = address.includes(':') ? 6 : 4;
  const body = typeof init.body === 'string' ? init.body : '';
  return {
    protocol: 'https:', hostname, port: url.port ? Number(url.port) : 443,
    path: `${url.pathname}${url.search}`, method: 'POST',
    headers: { ...Object.fromEntries(new Headers(init.headers)), 'Content-Length': new TextEncoder().encode(body).length },
    // A dedicated connection cannot reuse a socket to an earlier DNS answer.
    agent: false, family,
    servername: hostname.includes(':') || /^\d+(\.\d+){3}$/.test(hostname) ? undefined : hostname,
    rejectUnauthorized: true, signal: init.signal ?? undefined,
    lookup: (_host, _options, callback) => callback(null, address, family),
  };
}

/** Resolves at response headers and closes immediately; webhook response bodies are ignored. */
export async function pinnedHttps(rawUrl: string, init: RequestInit, address: string): Promise<{ status: number; body: null }> {
  const { request } = await import(NODE_HTTPS) as HttpsModule;
  return new Promise((resolve, reject) => {
    const req = request(pinnedOptions(rawUrl, init, address), (response) => {
      resolve({ status: response.statusCode ?? 0, body: null });
      response.destroy();
    });
    req.once('error', reject);
    req.end(typeof init.body === 'string' ? init.body : '');
  });
}
