const isLoopback = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

export const sanitizeReturnTarget = (
  raw: string | null,
  currentOrigin: string,
  allowedHosts: readonly string[],
): string => {
  if (!raw || raw.includes('\\') || Array.from(raw).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })) return '/account';

  try {
    const current = new URL(currentOrigin);
    const internal = raw.startsWith('/') && !raw.startsWith('//');
    const target = internal ? new URL(raw, current.origin) : new URL(raw);
    if (target.username || target.password) return '/account';

    const localPreview = target.protocol === 'http:' &&
      target.origin === current.origin && isLoopback(current.hostname);
    if (target.protocol !== 'https:' && !localPreview) return '/account';

    if (internal) {
      if (target.origin !== current.origin) return '/account';
      return target.pathname + target.search + target.hash;
    }

    const allowed = allowedHosts.length ? allowedHosts : [current.host];
    const host = target.host.toLowerCase();
    const accepted = allowed.some((entry) => {
      const normalized = entry.trim().toLowerCase();
      return normalized.startsWith('.') ? host.endsWith(normalized) : host === normalized;
    });
    return accepted ? target.toString() : '/account';
  } catch {
    return '/account';
  }
};
