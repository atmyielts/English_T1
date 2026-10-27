// Per-tab cache of public page payloads so revisiting a module renders
// instantly. Only anonymous public pages are cached; premium content is never
// written to storage. Storage can be unavailable (private mode, blocked
// cookies), so every access is guarded and the app works without it.

const PREFIX = 'ielts-playbook:page:v1:';
const MAX_AGE_MS = 30 * 60 * 1000;

type Entry<T> = { savedAt: number; data: T };

export const readCachedPage = <T>(slug: string): T | null => {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + slug);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (!entry || typeof entry.savedAt !== 'number' || Date.now() - entry.savedAt > MAX_AGE_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
};

export const writeCachedPage = <T>(slug: string, data: T): void => {
  try {
    window.sessionStorage.setItem(PREFIX + slug, JSON.stringify({ savedAt: Date.now(), data } satisfies Entry<T>));
  } catch {
    // Quota or privacy mode: the page still works, just without the cache.
  }
};
