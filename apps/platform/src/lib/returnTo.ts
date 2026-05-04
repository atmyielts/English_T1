const parseAllowedHosts = (): string[] => {
  const raw = String(import.meta.env.VITE_ALLOWED_RETURN_HOSTS ?? '').trim();
  const configured = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const currentHost = typeof window !== 'undefined' ? window.location.host : '';
  return Array.from(new Set([...configured, currentHost, 'schood.online', '.schood.online'].filter(Boolean)));
};

const isHostAllowed = (host: string, allowed: string[]): boolean => {
  const normalizedHost = host.toLowerCase();
  if (!allowed.length) return normalizedHost === window.location.host.toLowerCase();
  return allowed.some((entry) => {
    if (!entry) return false;
    const normalizedEntry = entry.toLowerCase();
    if (normalizedEntry.startsWith('.')) {
      return normalizedHost === normalizedEntry.slice(1) || normalizedHost.endsWith(normalizedEntry);
    }
    return normalizedHost === normalizedEntry;
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
