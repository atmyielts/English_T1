import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { clearHostAuthStorage, hasAuthStorage, supabase } from './supabase';
import { getAccessEffective, getMe, type AccessEffectiveResponse, type MeResponse } from './api';

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

export const useAccess = (opts?: { force?: boolean; includeEffective?: boolean; productId?: string | null }): AccessResult => {
  const [state, setState] = useState<AccessState>({ status: 'loading' });
  const includeEffective = opts?.includeEffective === true;
  const productId = opts?.productId ?? null;

  useEffect(() => {
    let cancelled = false;
    const recoveryKey =
      typeof window !== 'undefined'
        ? `__schood_practice_auth_recovery__:${window.location.pathname}${window.location.search}`
        : '';

    const reloadAfterClearingHostCookie = (): boolean => {
      if (typeof window === 'undefined' || !recoveryKey) return false;
      if (window.sessionStorage.getItem(recoveryKey) === '1') return false;

      clearHostAuthStorage();
      if (!hasAuthStorage()) return false;

      window.sessionStorage.setItem(recoveryKey, '1');
      window.location.replace(window.location.href);
      return true;
    };

    const loadAccount = async (session: Session): Promise<{ me: MeResponse; effective: AccessEffectiveResponse | null }> => {
      const [me, effective] = await Promise.all([
        getMe(session.access_token, { force: opts?.force }),
        includeEffective ? getAccessEffective(session.access_token, { productId }).catch(() => null) : Promise.resolve(null),
      ]);
      return { me, effective };
    };

    const hydrate = async (session: Session | null) => {
      if (!session) {
        if (reloadAfterClearingHostCookie()) return;
        if (!cancelled) setState({ status: 'unauthenticated' });
        return;
      }

      try {
        const { me, effective } = await loadAccount(session);
        if (!cancelled) {
          if (recoveryKey) window.sessionStorage.removeItem(recoveryKey);
          setState({ status: 'authenticated', session, me, effective });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message.toLowerCase() : '';
        if (message.includes('unauthorized')) {
          const { data } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
          if (data.session) {
            try {
              const { me, effective } = await loadAccount(data.session);
              if (!cancelled) {
                if (recoveryKey) window.sessionStorage.removeItem(recoveryKey);
                setState({ status: 'authenticated', session: data.session, me, effective });
              }
              return;
            } catch {
              // Fall through to stale-cookie recovery/unauthenticated handling.
            }
          }

          if (reloadAfterClearingHostCookie()) return;
          if (!cancelled) setState({ status: 'unauthenticated' });
          return;
        }

        const fallbackMe: MeResponse = {
          user: {
            id: session.user.id,
            email: session.user.email ?? null,
            role: null,
          },
          entitlements: [],
        };
        if (!cancelled) setState({ status: 'authenticated', session, me: fallbackMe, effective: null });
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) void hydrate(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) void hydrate(session);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [opts?.force, includeEffective, productId]);

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

