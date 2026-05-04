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

const cookieDomainVariants = (): Array<string | null> => {
  const variants: Array<string | null> = [null];
  const explicit = resolveExplicitCookieDomain();
  if (explicit) variants.push(explicit);
  return variants;
};

const escapeName = (name: string) => name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const readCookieRaw = (name: string): string | null => {
  if (!isBrowser) return null;
  const pattern = new RegExp(`(?:^|;\\s*)${escapeName(name)}=([^;]*)`, 'g');
  let value: string | null = null;
  for (const match of document.cookie.matchAll(pattern)) value = match[1] ?? null;
  return value;
};

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

const getChunkCount = (key: string): number | null => {
  const raw = readCookieRaw(chunkMetaKey(key));
  if (!raw) return null;
  const count = Number(raw);
  return Number.isFinite(count) && count > 0 ? count : null;
};

const getChunkCounts = (key: string): number[] =>
  readCookieRawAll(chunkMetaKey(key))
    .map((raw) => Number(raw))
    .filter((count) => Number.isFinite(count) && count > 0);

const clearChunks = (key: string): void => {
  const count = getChunkCount(key);
  if (count) {
    for (let i = 0; i < count; i += 1) deleteCookieEverywhere(chunkKey(key, i));
    deleteCookieEverywhere(chunkMetaKey(key));
  }
};

const clearHostChunks = (key: string): void => {
  const count = Math.max(0, ...getChunkCounts(key));
  for (let i = 0; i < count; i += 1) deleteCookieRaw(chunkKey(key, i), null);
  deleteCookieRaw(chunkMetaKey(key), null);
};

export const cookieStorage = {
  getItem: (key: string): string | null => {
    const count = getChunkCount(key);
    if (count) {
      let encoded = '';
      for (let i = 0; i < count; i += 1) {
        const part = readCookieRaw(chunkKey(key, i));
        if (!part) return null;
        encoded += part;
      }
      return decodeValue(encoded);
    }

    const raw = readCookieRaw(key);
    if (!raw) return null;
    return decodeValue(raw);
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
  removeHostItem: (key: string): void => {
    clearHostChunks(key);
    deleteCookieRaw(key, null);
  },
  hasItem: (key: string): boolean => readCookieRaw(key) != null || readCookieRaw(chunkMetaKey(key)) != null,
};
