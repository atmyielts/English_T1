export const REFERRAL_CODE_STORAGE_KEY = 'schood:referral_code';
export const REFERRAL_CONTEXT_STORAGE_KEY = 'schood:referral_context';

const CONTEXT_PARAM_KEYS = [
  'audience',
  'service',
  'source',
  'target',
  'channel',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
];

export type ReferralContext = Record<string, string>;

export const normalizeReferralCode = (value?: string | null): string => String(value ?? '').trim().toUpperCase();

const safeString = (value: string | null): string | null => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, 240) : null;
};

export const buildReferralContext = (pathname: string, search: string, code: string): ReferralContext => {
  const params = new URLSearchParams(search);
  const context: ReferralContext = {
    referral_code: code,
    landing_path: pathname || '/',
    captured_at: new Date().toISOString(),
  };

  CONTEXT_PARAM_KEYS.forEach((key) => {
    const value = safeString(params.get(key));
    if (value) context[key] = value;
  });

  const rawSearch = safeString(search.startsWith('?') ? search.slice(1) : search);
  if (rawSearch) context.landing_search = rawSearch;
  return context;
};

export const storeReferral = (code: string, context?: ReferralContext | null): void => {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return;
  window.localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, normalized);
  if (context) window.localStorage.setItem(REFERRAL_CONTEXT_STORAGE_KEY, JSON.stringify(context));
};

export const readStoredReferralContext = (): ReferralContext | null => {
  const raw = window.localStorage.getItem(REFERRAL_CONTEXT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ReferralContext) : null;
  } catch {
    return null;
  }
};

export const clearStoredReferral = (): void => {
  window.localStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
  window.localStorage.removeItem(REFERRAL_CONTEXT_STORAGE_KEY);
};
