import { edgeBase, supabase, supabaseAnonKey } from './supabase';

export type EnglishRecoveryKind = 'chunk_load' | 'render_error';

const releaseSha = String(import.meta.env.VITE_RELEASE_SHA ?? 'unknown').trim().slice(0, 64) || 'unknown';

export const classifyEnglishRecovery = (error: Error): EnglishRecoveryKind => {
  const value = `${error.name} ${error.message}`.toLowerCase();
  return value.includes('chunkloaderror')
    || value.includes('loading chunk')
    || value.includes('dynamically imported module')
    || value.includes('failed to fetch dynamically imported module')
    ? 'chunk_load'
    : 'render_error';
};

const safeErrorName = (name: string): string => {
  const normalized = name.trim();
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(normalized) ? normalized : 'Error';
};

export const buildEnglishRecoveryPayload = (error: Error, pathname: string) => {
  const [pathOnly = '/'] = pathname.split(/[?#]/, 1);
  return {
    kind: classifyEnglishRecovery(error),
    path: pathname.startsWith('/') ? pathOnly.slice(0, 200) : '/',
    release: releaseSha,
    error_name: safeErrorName(error.name),
  };
};

export const reportEnglishRecovery = async (error: Error): Promise<void> => {
  if (typeof window === 'undefined') return;

  const payload = buildEnglishRecoveryPayload(error, window.location.pathname);
  const dedupeKey = `schood:english-recovery:${payload.release}:${payload.kind}:${payload.path}`;
  try {
    if (window.sessionStorage.getItem(dedupeKey)) return;
    window.sessionStorage.setItem(dedupeKey, new Date().toISOString());
  } catch {
    // Storage can be unavailable in privacy modes. Reporting remains best-effort.
  }

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    await fetch(`${edgeBase}/hub/client-events/recovery`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      keepalive: true,
      signal: AbortSignal.timeout(2_500),
    });
  } catch {
    // Telemetry must never make a recovery path fail or delay the learner.
  }
};

let globalReportingInstalled = false;

export const installEnglishGlobalRecoveryReporting = (): void => {
  if (typeof window === 'undefined' || globalReportingInstalled) return;
  globalReportingInstalled = true;

  window.addEventListener('error', (event) => {
    if (event.error instanceof Error) void reportEnglishRecovery(event.error);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error('Unhandled browser promise rejection');
    void reportEnglishRecovery(error);
  });
};
