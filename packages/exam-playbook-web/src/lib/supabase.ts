import { createClient } from '@supabase/supabase-js';
import { cookieStorage } from './cookieStorage';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
const authStorageKey = (import.meta.env.VITE_AUTH_STORAGE_KEY as string | undefined)?.trim() || 'schood-auth';

export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const edgeBase = `${supabaseUrl}/functions/v1`;
export const anonKey = supabaseAnonKey;

// Shared .schood.online cookie session, same as every other Schood service.
export const supabase = createClient(supabaseUrl || 'http://127.0.0.1:54321', supabaseAnonKey || 'missing-anon-key', {
  auth: {
    storageKey: authStorageKey,
    storage: cookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
