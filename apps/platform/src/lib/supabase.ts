import { createClient } from '@supabase/supabase-js';
import { cookieStorage } from './cookieStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly during development. This app depends on Supabase auth + Edge Functions.
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY for platform app');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'schood-auth',
    storage: cookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
