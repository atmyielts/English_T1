import { createClient } from '@supabase/supabase-js';
import { cookieStorage } from './cookieStorage';

const localPreviewFallback =
  typeof window !== 'undefined' && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? {
        supabaseUrl: 'http://127.0.0.1:54321',
        supabaseAnonKey: 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjIwOTIwNTQ3NzR9.GZYs8QKq_FsQm_AllohwnLlp42YYWXfXqL8aR3lIJDjjdrEjZ2j8bb1u8X0v8rXYaVE-vac1-OvJoW1hxGrS2g',
        platformUrl: 'http://127.0.0.1:4100',
      }
    : null;

const resolvedSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || localPreviewFallback?.supabaseUrl;
const resolvedSupabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || localPreviewFallback?.supabaseAnonKey;
const resolvedPlatformUrl =
  (import.meta.env.VITE_PLATFORM_URL as string | undefined)?.trim()
  || localPreviewFallback?.platformUrl
  || 'https://schood.online';

if (!resolvedSupabaseUrl || !resolvedSupabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabaseUrl: string = resolvedSupabaseUrl;
export const supabaseAnonKey: string = resolvedSupabaseAnonKey;
export const edgeBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
export const platformUrl: string = resolvedPlatformUrl;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'schood-auth',
    storage: cookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
