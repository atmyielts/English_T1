import { createClient } from '@supabase/supabase-js';
import { cookieStorage } from './cookieStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const authStorageKey =
  (import.meta.env.VITE_AUTH_STORAGE_KEY as string | undefined)?.trim() || 'schood-auth';

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly during development. This app depends on Supabase auth + Edge Functions.
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in apps/sat-simulator/.env.local. Copy apps/sat-simulator/.env.local.example and fill both values.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Keep default shared with platform app so /auth redirect can establish session for this app.
    // Override via VITE_AUTH_STORAGE_KEY only if you manage auth handoff yourself.
    storageKey: authStorageKey,
    storage: cookieStorage,
    persistSession: true,
    // Platform app is the primary auth owner; avoid background cross-origin
    // refresh races here and refresh only on explicit auth checks / retries.
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
