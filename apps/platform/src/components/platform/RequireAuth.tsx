import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { clearLocalAuthStorage, getAuthSession, refreshAuthSession, supabase } from '../../lib/supabase';
import { useI18n } from '../../i18n';

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; session: Session };

const returnToFromLocation = (pathname: string, search: string, hash: string): string =>
  `${pathname}${search ?? ''}${hash ?? ''}`;

export const RequireAuth: React.FC = () => {
  const location = useLocation();
  const { t } = useI18n();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const returnTo = useMemo(
    () => returnToFromLocation(location.pathname, location.search, location.hash),
    [location.pathname, location.search, location.hash],
  );

  useEffect(() => {
    let cancelled = false;
    let revision = 0;
    let actor: string | null = null;

    const validateSession = async (session: Session | null, version: number) => {
      const current = () => !cancelled && version === revision;
      if (!current()) return;
      if (!session) {
        actor = null;
        setState({ status: 'unauthenticated' });
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser(session.access_token);
      if (!current()) return;
      if (!userError && userData?.user?.id === session.user.id) {
        actor = session.user.id;
        setState({ status: 'authenticated', session });
        return;
      }

      const refreshed = await refreshAuthSession();
      if (!current()) return;
      if (!refreshed?.access_token || refreshed.user.id !== session.user.id) {
        clearLocalAuthStorage();
        actor = null;
        setState({ status: 'unauthenticated' });
        return;
      }

      actor = refreshed.user.id;
      setState({ status: 'authenticated', session: refreshed });
    };

    const init = async () => {
      const version = ++revision;
      const session = await getAuthSession();
      await validateSession(session, version);
    };

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const version = ++revision;
      if (session?.user.id !== actor) setState({ status: 'loading' });
      void validateSession(session ?? null, version);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (state.status === 'loading') {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">{t('requireAuth.loading')}</div>;
  }

  if (state.status === 'unauthenticated') {
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return <Outlet key={state.session.user.id} />;
};
