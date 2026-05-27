import { createClient } from '@supabase/supabase-js';
import { cookieStorage } from './cookieStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const authStorageKey = (import.meta.env.VITE_AUTH_STORAGE_KEY as string | undefined)?.trim() || 'schood-auth';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in apps/toefl-playbook/.env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: authStorageKey,
    storage: cookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
