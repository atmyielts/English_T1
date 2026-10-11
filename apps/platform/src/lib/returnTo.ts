import { sanitizeReturnTarget } from './returnToPolicy';

const parseAllowedHosts = (): string[] => {
  const raw = String(import.meta.env.VITE_ALLOWED_RETURN_HOSTS ?? '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

export const sanitizeReturnTo = (raw: string | null): string =>
  sanitizeReturnTarget(raw, window.location.origin, parseAllowedHosts());

export const isExternalUrl = (value: string): boolean => /^https?:\/\//i.test(value);
