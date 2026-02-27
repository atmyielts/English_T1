const parseAllowedHosts = (): string[] => {
  const raw = String(import.meta.env.VITE_ALLOWED_RETURN_HOSTS ?? '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const isHostAllowed = (host: string, allowed: string[]): boolean => {
  if (!allowed.length) return host === window.location.host;
  return allowed.some((entry) => {
    if (!entry) return false;
    if (entry.startsWith('.')) return host.endsWith(entry);
    return host === entry;
  });
};

export const sanitizeReturnTo = (raw: string | null): string => {
  if (!raw) return '/account';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;

  try {
    const url = new URL(raw);
    const allowed = parseAllowedHosts();
    if (isHostAllowed(url.host, allowed)) return url.toString();
  } catch {
    // ignore invalid URLs
  }

  return '/account';
};

export const isExternalUrl = (value: string): boolean => /^https?:\/\//i.test(value);
