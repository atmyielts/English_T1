import { supabaseAnonKey, supabaseUrl } from './supabase';

export const TELEGRAM_AUTH_PROVIDER = 'custom:telegram' as const;

export type AuthProviderAvailability = {
  google: boolean | null;
  telegram: boolean | null;
  manualLinking: boolean | null;
};

type AuthSettingsPayload = {
  external?: Record<string, boolean>;
  external_google?: boolean;
  manual_linking_enabled?: boolean;
  custom_providers?: Array<{ identifier?: string; enabled?: boolean }>;
};

export const parseAuthProviderAvailability = (payload: AuthSettingsPayload): AuthProviderAvailability => {
  const customTelegram = payload.custom_providers?.find((provider) => provider.identifier === TELEGRAM_AUTH_PROVIDER);
  return {
    google: payload.external?.google ?? payload.external_google ?? null,
    telegram:
      payload.external?.[TELEGRAM_AUTH_PROVIDER]
      ?? payload.external?.telegram
      ?? (customTelegram ? customTelegram.enabled !== false : null),
    manualLinking: payload.manual_linking_enabled ?? null,
  };
};

export const fetchAuthProviderAvailability = async (signal?: AbortSignal): Promise<AuthProviderAvailability> => {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`, {
    headers: { apikey: supabaseAnonKey },
    signal,
  });
  if (!response.ok) throw new Error(`Auth settings request failed (${response.status})`);
  return parseAuthProviderAvailability((await response.json()) as AuthSettingsPayload);
};

export const normalizePhone = (value: string): string | null => {
  const compact = value.trim().replace(/[\s().-]/g, '');
  const international = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  const withPrefix = international.startsWith('+') ? international : `+${international}`;
  return /^\+[1-9]\d{7,14}$/.test(withPrefix) ? withPrefix : null;
};

export const hasProviderIdentity = (
  identities: Array<{ provider?: string } | null | undefined> | null | undefined,
  provider: string,
): boolean => Boolean(identities?.some((identity) => identity?.provider === provider));
