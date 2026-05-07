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

    const validateSession = async (session: Session | null) => {
      if (!session) {
        if (!cancelled) setState({ status: 'unauthenticated' });
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser(session.access_token);
      if (!userError && userData?.user) {
        if (!cancelled) setState({ status: 'authenticated', session });
        return;
      }

      const refreshed = await refreshAuthSession();
      if (!refreshed?.access_token) {
        clearLocalAuthStorage();
        if (!cancelled) setState({ status: 'unauthenticated' });
        return;
      }

      if (!cancelled) setState({ status: 'authenticated', session: refreshed });
    };

    const init = async () => {
      const session = await getAuthSession();
      if (cancelled) return;
      await validateSession(session);
    };

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      void validateSession(session ?? null);
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

  return <Outlet />;
};
