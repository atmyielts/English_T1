const isBrowser = typeof document !== 'undefined';
const CHUNK_SIZE = 2000;

const shouldUseSecureCookie = (): boolean =>
  typeof window !== 'undefined' && window.location.protocol === 'https:';

const resolveExplicitCookieDomain = (): string | null => {
  const value = (import.meta.env.VITE_AUTH_COOKIE_DOMAIN as string | undefined)?.trim();
  return value || null;
};

const shouldShareCookie = (): boolean => {
  const shared = String(import.meta.env.VITE_AUTH_SHARED_COOKIE ?? '')
    .trim()
    .toLowerCase();
  if (!shared) return resolveExplicitCookieDomain() != null;
  if (shared === '0' || shared === 'false' || shared === 'no') return false;
  return shared === '1' || shared === 'true' || shared === 'yes';
};

const resolveCookieDomain = (): string | null => {
  const explicit = resolveExplicitCookieDomain();
  if (!explicit) return null;
  return shouldShareCookie() ? explicit : null;
};

const currentHostnameDomains = (): string[] => {
  if (typeof window === 'undefined') return [];
  const hostname = window.location.hostname.trim().toLowerCase();
  if (!hostname || hostname === 'localhost' || /^[\d.]+$/.test(hostname)) return [];

  const parts = hostname.split('.').filter(Boolean);
  const domains = new Set<string>();
  for (let i = 0; i <= Math.max(0, parts.length - 2); i += 1) {
    const domain = parts.slice(i).join('.');
    domains.add(domain);
    domains.add(`.${domain}`);
  }
  return Array.from(domains);
};

const cookieDomainVariants = (): Array<string | null> => {
  const variants = new Set<string | null>([null]);
  const explicit = resolveExplicitCookieDomain();
  if (explicit) variants.add(explicit);
  currentHostnameDomains().forEach((domain) => variants.add(domain));
  return Array.from(variants);
};

const escapeName = (name: string) => name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const readCookieRawAll = (name: string): string[] => {
  if (!isBrowser) return [];
  const pattern = new RegExp(`(?:^|;\\s*)${escapeName(name)}=([^;]*)`, 'g');
  return Array.from(document.cookie.matchAll(pattern), (match) => match[1] ?? '');
};

const writeCookieRaw = (name: string, value: string, maxAgeSeconds = 60 * 60 * 24 * 30): void => {
  if (!isBrowser) return;
  const domain = resolveCookieDomain();
  const parts = [`${name}=${value}`, `path=/`, `max-age=${maxAgeSeconds}`, `samesite=lax`];
  if (domain) parts.push(`domain=${domain}`);
  if (shouldUseSecureCookie()) parts.push('secure');
  document.cookie = parts.join('; ');
};

const deleteCookieRaw = (name: string, domain: string | null): void => {
  if (!isBrowser) return;
  const parts = [`${name}=`, `path=/`, `max-age=0`, `samesite=lax`];
  if (domain) parts.push(`domain=${domain}`);
  if (shouldUseSecureCookie()) parts.push('secure');
  document.cookie = parts.join('; ');
};

const deleteCookieEverywhere = (name: string): void => {
  cookieDomainVariants().forEach((domain) => deleteCookieRaw(name, domain));
};

const chunkMetaKey = (key: string) => `${key}.__chunks`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

const decodeValue = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const jwtExpiresAt = (token: string): number | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(normalized)) as Record<string, unknown>;
    const exp = Number(decoded.exp);
    return Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
};

const scoreStoredAuthValue = (value: string): number => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return -1;
    const session = isRecord(parsed.currentSession) ? parsed.currentSession : parsed;
    const accessToken = typeof session.access_token === 'string' ? session.access_token : '';
    if (!accessToken) return -1;

    const refreshToken = typeof session.refresh_token === 'string' ? session.refresh_token : '';
    const explicitExpiresAt = Number(session.expires_at ?? parsed.expiresAt);
    const expiresAt = Number.isFinite(explicitExpiresAt) ? explicitExpiresAt : jwtExpiresAt(accessToken) ?? 0;
    return expiresAt * 10 + (refreshToken ? 1 : 0);
  } catch {
    return -1;
  }
};

const selectDecodedValue = (encodedValues: string[]): string | null => {
  const decoded = encodedValues
    .map((value) => decodeValue(value))
    .filter((value): value is string => value != null);
  if (decoded.length === 0) return null;

  const scored = decoded
    .map((value, index) => ({ value, index, score: scoreStoredAuthValue(value) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index);

  return scored.at(-1)?.value ?? decoded.at(-1) ?? null;
};

const getChunkCounts = (key: string): number[] =>
  readCookieRawAll(chunkMetaKey(key))
    .map((raw) => Number(raw))
    .filter((count) => Number.isFinite(count) && count > 0);

const buildChunkCandidates = (key: string): string[] => {
  const counts = Array.from(new Set(getChunkCounts(key)));
  const candidates = new Set<string>();

  for (const count of counts) {
    const groups: string[][] = [];
    for (let i = 0; i < count; i += 1) {
      const values = readCookieRawAll(chunkKey(key, i));
      if (values.length === 0) {
        groups.length = 0;
        break;
      }
      groups.push(values);
    }
    if (groups.length !== count) continue;

    const maxGroupLength = Math.max(...groups.map((group) => group.length));
    for (let ordinal = 0; ordinal < maxGroupLength; ordinal += 1) {
      candidates.add(groups.map((group) => group[Math.min(ordinal, group.length - 1)]).join(''));
    }

    const appendCombinations = (index: number, parts: string[]): void => {
      if (candidates.size >= 32) return;
      if (index >= groups.length) {
        candidates.add(parts.join(''));
        return;
      }
      const group = groups[index];
      if (!group) return;
      for (const value of group) {
        appendCombinations(index + 1, [...parts, value]);
      }
    };
    appendCombinations(0, []);
  }

  return Array.from(candidates);
};

const clearChunks = (key: string): void => {
  const count = Math.max(0, ...getChunkCounts(key));
  if (count) {
    for (let i = 0; i < count; i += 1) deleteCookieEverywhere(chunkKey(key, i));
    deleteCookieEverywhere(chunkMetaKey(key));
  }
};

export const cookieStorage = {
  getItem: (key: string): string | null => {
    const chunkCandidates = buildChunkCandidates(key);
    const chunkValue = selectDecodedValue(chunkCandidates);
    if (chunkValue) return chunkValue;

    return selectDecodedValue(readCookieRawAll(key));
  },
  setItem: (key: string, value: string): void => {
    clearChunks(key);
    deleteCookieEverywhere(key);

    const encoded = encodeURIComponent(value);
    if (encoded.length <= CHUNK_SIZE) {
      writeCookieRaw(key, encoded);
      return;
    }

    const count = Math.ceil(encoded.length / CHUNK_SIZE);
    writeCookieRaw(chunkMetaKey(key), String(count));
    for (let i = 0; i < count; i += 1) {
      const part = encoded.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      writeCookieRaw(chunkKey(key, i), part);
    }
  },
  removeItem: (key: string): void => {
    clearChunks(key);
    deleteCookieEverywhere(key);
  },
};
