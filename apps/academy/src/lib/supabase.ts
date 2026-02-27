import { createClient } from '@supabase/supabase-js';
import { cookieStorage } from './cookieStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
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

const platformUrlEnv = (import.meta.env.VITE_PLATFORM_URL as string | undefined)?.trim();
if (import.meta.env.PROD && !platformUrlEnv) {
  throw new Error('Missing VITE_PLATFORM_URL in apps/academy/.env.local');
}
export const platformUrl = platformUrlEnv || (typeof window !== 'undefined' ? window.location.origin : '');
