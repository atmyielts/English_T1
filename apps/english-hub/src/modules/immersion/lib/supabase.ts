import { createClient } from '@supabase/supabase-js';
import { cookieStorage } from './cookieStorage';
import { supabaseAnonKey, supabaseUrl } from './runtimeConfig';
export { platformUrl } from './runtimeConfig';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'schood-auth',
    storage: cookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
