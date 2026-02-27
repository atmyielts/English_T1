import type { Location } from 'react-router-dom';

const rawBase = String(import.meta.env.VITE_PLATFORM_URL ?? '').trim();
export const platformBase = rawBase ? rawBase.replace(/\/$/, '') : '';
export const hasPlatformBase = platformBase.length > 0;

export const getReturnTo = (location?: Location): string => {
  if (typeof window !== 'undefined' && window.location?.href) return window.location.href;
  if (!location) return '/';
  return `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`;
};

export const buildPlatformUrl = (
  path: string,
  returnTo?: string,
  params?: Record<string, string | undefined | null>,
): string => {
  const qs = new URLSearchParams();
  const rt = returnTo ?? (typeof window !== 'undefined' ? window.location.href : '/');
  qs.set('returnTo', rt);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (!value) continue;
      qs.set(key, value);
    }
  }

  const suffix = qs.toString();
  if (!platformBase) return `${path}?${suffix}`;
  return `${platformBase}${path}?${suffix}`;
};
