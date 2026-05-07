import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { cookieStorage } from './cookieStorage';

export const AUTH_STORAGE_KEY = 'schood-auth';

const localPreviewFallback =
  import.meta.env.DEV && typeof window !== 'undefined' && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? {
        supabaseUrl: 'http://127.0.0.1:54321',
        supabaseAnonKey: 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjIwOTIwNTQ3NzR9.GZYs8QKq_FsQm_AllohwnLlp42YYWXfXqL8aR3lIJDjjdrEjZ2j8bb1u8X0v8rXYaVE-vac1-OvJoW1hxGrS2g',
      }
    : null;

const cleanEnvValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const unquoted = trimmed.replace(/^(['"])(.*)\1$/, '$2').trim();
  return unquoted || undefined;
};

const envSupabaseUrl = cleanEnvValue(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const envSupabaseAnonKey = cleanEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
const envPointsToLocalSupabase = /^https?:\/\/(?:127\.0\.0\.1|localhost):54321\b/i.test(envSupabaseUrl ?? '');

const resolvedSupabaseUrl = !import.meta.env.DEV && envPointsToLocalSupabase ? undefined : envSupabaseUrl || localPreviewFallback?.supabaseUrl;
const resolvedSupabaseAnonKey = !import.meta.env.DEV && envPointsToLocalSupabase ? undefined : envSupabaseAnonKey || localPreviewFallback?.supabaseAnonKey;

if (!resolvedSupabaseUrl || !resolvedSupabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY for platform app');
}

export const supabaseUrl: string = resolvedSupabaseUrl;
export const supabaseAnonKey: string = resolvedSupabaseAnonKey;
export const edgeBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    storage: cookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const clearLocalAuthStorage = (): void => {
  try {
    cookieStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // no-op
  }
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(`${AUTH_STORAGE_KEY}-`)) toRemove.push(key);
    }
    toRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // no-op
  }
};

let sessionRefreshInFlight: Promise<Session | null> | null = null;
let sessionReadInFlight: Promise<Session | null> | null = null;
let lastRefreshAt = 0;
let lastRefreshSession: Session | null = null;

export const refreshAuthSession = async (): Promise<Session | null> => {
  const now = Date.now();
  if (sessionRefreshInFlight) return sessionRefreshInFlight;
  if (lastRefreshSession && now - lastRefreshAt < 15_000) return lastRefreshSession;

  sessionRefreshInFlight = supabase.auth
    .refreshSession()
    .then(({ data, error }) => {
      lastRefreshAt = Date.now();
      if (error) {
        lastRefreshSession = null;
        return null;
      }
      lastRefreshSession = data.session ?? null;
      return lastRefreshSession;
    })
    .finally(() => {
      sessionRefreshInFlight = null;
    });

  return sessionRefreshInFlight;
};

export const getAuthSession = async (): Promise<Session | null> => {
  if (sessionReadInFlight) return sessionReadInFlight;

  sessionReadInFlight = supabase.auth
    .getSession()
    .then(({ data }) => {
      if (data.session?.access_token) return data.session;
      return refreshAuthSession();
    })
    .finally(() => {
      sessionReadInFlight = null;
    });

  return sessionReadInFlight;
};
