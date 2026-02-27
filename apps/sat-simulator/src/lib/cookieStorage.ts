const isBrowser = typeof document !== 'undefined';
const CHUNK_SIZE = 2000;

const shouldUseSecureCookie = (): boolean =>
  typeof window !== 'undefined' && window.location.protocol === 'https:';

const escapeName = (name: string) => name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const readCookieRaw = (name: string): string | null => {
  if (!isBrowser) return null;
  const match = document.cookie.match(new RegExp(`(^| )${escapeName(name)}=([^;]+)`));
  return match ? match[2] : null;
};

const writeCookieRaw = (name: string, value: string, maxAgeSeconds = 60 * 60 * 24 * 30): void => {
  if (!isBrowser) return;
  const domain = (import.meta.env.VITE_AUTH_COOKIE_DOMAIN as string | undefined)?.trim();
  const parts = [`${name}=${value}`, `path=/`, `max-age=${maxAgeSeconds}`, `samesite=lax`];
  if (domain) parts.push(`domain=${domain}`);
  if (shouldUseSecureCookie()) parts.push('secure');
  document.cookie = parts.join('; ');
};

const deleteCookie = (name: string): void => {
  if (!isBrowser) return;
  const domain = (import.meta.env.VITE_AUTH_COOKIE_DOMAIN as string | undefined)?.trim();
  const parts = [`${name}=`, `path=/`, `max-age=0`, `samesite=lax`];
  if (domain) parts.push(`domain=${domain}`);
  if (shouldUseSecureCookie()) parts.push('secure');
  document.cookie = parts.join('; ');
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

const clearChunks = (key: string): void => {
  const count = getChunkCount(key);
  if (count) {
    for (let i = 0; i < count; i += 1) deleteCookie(chunkKey(key, i));
    deleteCookie(chunkMetaKey(key));
  }
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
    deleteCookie(key);

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
    deleteCookie(key);
  },
};
