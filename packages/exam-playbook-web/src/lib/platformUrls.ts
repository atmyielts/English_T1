import { PLATFORM_URL } from '../config';

const rawBase = String(import.meta.env.VITE_PLATFORM_URL ?? '').trim();
export const platformBase = (rawBase || PLATFORM_URL).replace(/\/$/, '');

export const currentUrl = (): string => (typeof window !== 'undefined' ? window.location.href : '/');

export const buildPlatformUrl = (path: string, params?: Record<string, string | undefined | null>, returnTo = currentUrl()): string => {
  const qs = new URLSearchParams();
  qs.set('returnTo', returnTo);
  for (const [key, value] of Object.entries(params ?? {})) if (value) qs.set(key, value);
  return `${platformBase}${path}?${qs.toString()}`;
};

export const signInUrl = (productSlug: string) => buildPlatformUrl('/auth', { product: productSlug });
export const pricingUrl = (productSlug: string) => buildPlatformUrl('/pricing', { product: productSlug });
export const accountUrl = () => `${platformBase}/account`;
export const homeUrl = () => platformBase;
