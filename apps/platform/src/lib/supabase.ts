import { createClient } from '@supabase/supabase-js';
import { cookieStorage } from './cookieStorage';

export const AUTH_STORAGE_KEY = 'schood-auth';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly during development. This app depends on Supabase auth + Edge Functions.
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY for platform app');
}

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
