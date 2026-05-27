import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getAccessEffective, getMe, type AccessEffectiveResponse, type MeResponse } from './platformClient';

const authDebugEnabled =
  import.meta.env.DEV || String(import.meta.env.VITE_DEBUG_AUTH ?? '').toLowerCase() === 'true';

const authDebug = (event: string, meta: Record<string, unknown>): void => {
  if (!authDebugEnabled || typeof console === 'undefined') return;
  console.debug(`[useAccess] ${event}`, { at: new Date().toISOString(), ...meta });
};

const AUTH_HANDOFF_KEYS = ['access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type'];

const parseUrlParams = (raw: string): URLSearchParams => {
  const trimmed = raw.startsWith('#') ? raw.slice(1) : raw;
  const cleaned = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
  return new URLSearchParams(cleaned);
};

const stripPlatformAuthHandoff = (): void => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  AUTH_HANDOFF_KEYS.forEach((key) => url.searchParams.delete(key));
  const hashParams = parseUrlParams(url.hash);
  AUTH_HANDOFF_KEYS.forEach((key) => hashParams.delete(key));
  const nextHash = hashParams.toString();
  url.hash = nextHash ? `#${nextHash}` : '';
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
};

const consumePlatformAuthHandoff = async (): Promise<Session | null> => {
  if (typeof window === 'undefined') return null;
  const hashParams = parseUrlParams(window.location.hash);
  const queryParams = new URLSearchParams(window.location.search);
  const type = hashParams.get('type') ?? queryParams.get('type');
  if (type !== 'platform_handoff') return null;

  const accessToken = hashParams.get('access_token') ?? queryParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') ?? queryParams.get('refresh_token');
  stripPlatformAuthHandoff();
  if (!accessToken || !refreshToken) {
    authDebug('handoff.missing-tokens', {});
    return null;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    authDebug('handoff.set-session-error', { message: error.message });
    return null;
  }

  authDebug('handoff.set-session-ok', { userId: data.session?.user?.id ?? null });
  return data.session ?? null;
};

type AccessState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; session: Session; me: MeResponse; effective: AccessEffectiveResponse | null };

type AccessResult = {
  status: AccessState['status'];
  session: Session | null;
  me: MeResponse | null;
  effective: AccessEffectiveResponse | null;
  accessToken: string | null;
  userId: string | null;
};

export const useAccess = (opts?: { force?: boolean; includeEffective?: boolean }): AccessResult => {
  const [state, setState] = useState<AccessState>({ status: 'loading' });
  const includeEffective = opts?.includeEffective === true;

  useEffect(() => {
    let cancelled = false;

    const hydrate = async (session: Session | null, didRetry = false) => {
      if (!session) {
        authDebug('hydrate.no-session', { didRetry });
        if (!cancelled) setState({ status: 'unauthenticated' });
        return;
      }

      try {
        authDebug('hydrate.start', {
          didRetry,
          userId: session.user?.id ?? null,
          expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        });
        const me = await getMe(session.access_token, { force: opts?.force });
        const effective = includeEffective ? await getAccessEffective(session.access_token).catch(() => null) : null;
        if (!cancelled) setState({ status: 'authenticated', session, me, effective });
        authDebug('hydrate.success', { didRetry, userId: session.user?.id ?? null });
      } catch (err) {
        const status = (err as { status?: number } | null)?.status;
        const message = err instanceof Error ? err.message : String(err);
        authDebug('hydrate.failure', { didRetry, status: status ?? null, message });
        if (!didRetry && status === 401) {
          try {
            const { data } = await supabase.auth.getSession();
            if (data.session && data.session.access_token !== session.access_token) {
              authDebug('hydrate.retry-with-new-session', {
                userId: data.session.user?.id ?? null,
                expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : null,
              });
              await hydrate(data.session, true);
              return;
            }
          } catch {
            // fall through to unauthenticated
          }
        }
        if (!cancelled) setState({ status: 'unauthenticated' });
      }
    };

    (async () => {
      const handoffSession = await consumePlatformAuthHandoff();
      if (cancelled) return;
      if (handoffSession) {
        void hydrate(handoffSession);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      void hydrate(data.session);
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      void hydrate(session);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [opts?.force, includeEffective]);

  if (state.status === 'authenticated') {
    return {
      status: state.status,
      session: state.session,
      me: state.me,
      effective: state.effective,
      accessToken: state.session.access_token,
      userId: state.session.user.id,
    };
  }

  return {
    status: state.status,
    session: null,
    me: null,
    effective: null,
    accessToken: null,
    userId: null,
  };
};
