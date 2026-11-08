// Where a webhook may point. A URL is checked when HR saves it, and the sending adapter
// checks it again and looks up its addresses on every attempt, because a name can change
// what it points at. Redirects are never followed: a signed request stays where HR said.
// No Deno globals: fetch and the resolver are passed in, so tests can stub both.
import type { WebhookAdapter } from './shared.ts';

const v4 = (text: string): number[] | null => {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const out = parts.map((part) => /^\d{1,3}$/.test(part) ? Number(part) : -1);
  return out.every((part) => part >= 0 && part <= 255) ? out : null;
};

/** True for an IPv4 address that is not on the public internet. */
function blockedV4([a, b, c]: number[]): boolean {
  return a === 0 || a === 10 || a === 127 || a >= 224 // this network, private, loopback, multicast and reserved
    || (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
    || (a === 169 && b === 254) // link-local, which holds cloud metadata
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) // private
    || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113); // special use and documentation
}

/** Expands an IPv6 address to its eight groups, or null when it is not one. */
function groups(address: string): number[] | null {
  let text = address.toLowerCase().replace(/%.*$/, '');
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const parts = v4(dotted[2]);
    if (!parts) return null;
    text = `${dotted[1]}${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const read = (part: string) => part ? part.split(':').map((group) => /^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : Number.NaN) : [];
  const head = read(halves[0]), tail = halves.length === 2 ? read(halves[1]) : [];
  if ([...head, ...tail].some(Number.isNaN)) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  return missing < 1 ? null : [...head, ...new Array(missing).fill(0), ...tail];
}

/** True for any IP address that must not be called. Anything that is not an address is refused too. */
export function isBlockedAddress(address: string): boolean {
  const parts = v4(address);
  if (parts) return blockedV4(parts);
  const six = groups(address);
  if (!six) return true;
  const [first] = six;
  if (six.every((group) => group === 0)) return true; // :: unspecified
  if (six.slice(0, 7).every((group) => group === 0) && six[7] === 1) return true; // ::1 loopback
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0 || (first & 0xff00) === 0xff00) return true; // unique local, link-local, site-local, multicast
  if (first === 0x2001 && six[1] === 0xdb8) return true; // documentation
  // IPv4 inside IPv6 (mapped, compatible, translated, 6to4): judged as the address inside.
  const mapped = six.slice(0, 5).every((group) => group === 0) && (six[5] === 0xffff || six[5] === 0);
  const translated = first === 0x64 && six[1] === 0xff9b;
  if (mapped || translated) return blockedV4([six[6] >> 8, six[6] & 255, six[7] >> 8, six[7] & 255]);
  if (first === 0x2002) return blockedV4([six[1] >> 8, six[1] & 255, six[2] >> 8, six[2] & 255]);
  return false;
}

const BLOCKED_NAMES = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa|in-addr\.arpa|ip6\.arpa|onion)$/;
const METADATA_NAMES = new Set(['metadata.google.internal', 'metadata', 'instance-data', 'instance-data.ec2.internal']);

export type UrlProblem = 'not_https' | 'bad_url' | 'credentials' | 'port' | 'private_address' | 'private_name';

/** What is wrong with a webhook URL on its face, or null. Names are looked up later, by the adapter. */
export function urlProblem(value: string): UrlProblem | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'bad_url';
  }
  if (url.protocol !== 'https:') return 'not_https';
  if (url.username || url.password) return 'credentials';
  if (url.port && url.port !== '443' && url.port !== '8443') return 'port';
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host) return 'bad_url';
  // The URL parser has already turned 2130706433, 0x7f.1 and the like into dotted form.
  if (v4(host) || host.includes(':')) return isBlockedAddress(host) ? 'private_address' : null;
  if (!host.includes('.') || METADATA_NAMES.has(host) || BLOCKED_NAMES.test(host)) return 'private_name';
  return null;
}

/** Sends through the given fetch and resolver. Fails closed: a name it cannot look up is not called. */
export function createWebhookTransport(deps: {
  /** Must connect to this already validated address, retaining the URL's TLS identity. */
  fetch: (url: string, init: RequestInit, address: string) => Promise<Pick<Response, 'status'> & { body?: { cancel?: () => Promise<void> } | null }>;
  resolve: (host: string) => Promise<string[]>;
  timeoutMs?: number;
}): WebhookAdapter {
  return async ({ url, body, headers }) => {
    const problem = urlProblem(url);
    if (problem) return { ok: false, error: 'blocked_address' };
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
    let address = host;
    if (!v4(host) && !host.includes(':')) {
      const addresses = await deps.resolve(host).catch(() => [] as string[]);
      if (!addresses.length) return { ok: false, error: 'dns_failed' };
      if (addresses.some(isBlockedAddress)) return { ok: false, error: 'blocked_address' };
      address = addresses[0];
    }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 10_000);
    try {
      const response = await deps.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Schood-Company-Webhooks/1', ...headers }, body, redirect: 'manual', signal: controller.signal }, address);
      await response.body?.cancel?.().catch(() => undefined);
      // redirect: 'manual' can also answer status 0 (an opaque redirect).
      if (response.status === 0 || (response.status >= 300 && response.status < 400)) return { ok: false, status: response.status || undefined, error: 'redirect_refused' };
      return response.status >= 200 && response.status < 300 ? { ok: true, status: response.status } : { ok: false, status: response.status, error: `http_${response.status}` };
    } catch (cause) {
      return { ok: false, error: (cause as Error)?.name === 'AbortError' ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  };
}
