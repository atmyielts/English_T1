const isLocalPreview =
  typeof window !== 'undefined' && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');

const localPreviewFallback = isLocalPreview
  ? {
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey:
        'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjIwOTIwNTQ3NzR9.GZYs8QKq_FsQm_AllohwnLlp42YYWXfXqL8aR3lIJDjjdrEjZ2j8bb1u8X0v8rXYaVE-vac1-OvJoW1hxGrS2g',
      platformUrl: 'http://127.0.0.1:4100',
    }
  : null;

const readEnv = (key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY' | 'VITE_PLATFORM_URL'): string =>
  ((import.meta.env[key] as string | undefined) ?? '').trim();

export const supabaseUrl = readEnv('VITE_SUPABASE_URL') || localPreviewFallback?.supabaseUrl || '';
export const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY') || localPreviewFallback?.supabaseAnonKey || '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const edgeBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;

const platformUrlEnv = readEnv('VITE_PLATFORM_URL');
if (import.meta.env.PROD && !platformUrlEnv && !localPreviewFallback) {
  throw new Error('Missing VITE_PLATFORM_URL in apps/english-hub/.env.local');
}

export const platformUrl =
  platformUrlEnv || localPreviewFallback?.platformUrl || (typeof window !== 'undefined' ? window.location.origin : '');
