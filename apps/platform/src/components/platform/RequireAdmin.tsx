import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getAuthSession, supabase } from '../../lib/supabase';
import { getMe } from '../../lib/platformClient';
import { AdminAccessContext, type AdminAccessInfo, hasAdminPermission } from './adminAccess';

type AdminState =
  | { status: 'loading' }
  | { status: 'unauthenticated'; reason?: 'idle_timeout' | 'missing_session' }
  | { status: 'forbidden' }
  | { status: 'authorized'; access: AdminAccessInfo };

const returnToFromLocation = (pathname: string, search: string, hash: string): string =>
  `${pathname}${search ?? ''}${hash ?? ''}`;

export const RequireAdmin: React.FC = () => {
  const location = useLocation();
  const [state, setState] = useState<AdminState>({ status: 'loading' });

  const returnTo = useMemo(
    () => returnToFromLocation(location.pathname, location.search, location.hash),
    [location.pathname, location.search, location.hash],
  );

  useEffect(() => {
    let cancelled = false;

    const check = async (session: { access_token: string } | null) => {
      if (!session) {
        if (!cancelled) setState({ status: 'unauthenticated', reason: 'missing_session' });
        return;
      }

      try {
        const me = await getMe(session.access_token);
        const role = String(me.user.role ?? '').toLowerCase();
        const admin = me.admin ?? null;
        if (!admin?.is_admin || !Array.isArray(admin.permissions)) {
          if (!cancelled) setState({ status: 'forbidden' });
          return;
        }

        if (!hasAdminPermission(admin.permissions, 'admin.portal.access')) {
          if (!cancelled) setState({ status: 'forbidden' });
          return;
        }

        if (!cancelled) {
          setState({
            status: 'authorized',
            access: {
              userId: me.user.id,
              email: me.user.email,
              role,
              permissions: admin.permissions,
              sessionAal: admin.session_aal,
              securityPolicy: admin.security_policy ?? null,
            },
          });
        }
      } catch (err) {
        const status = typeof err === 'object' && err && 'status' in err ? Number((err as { status?: number }).status) : null;
        if (!cancelled) setState(status === 401 ? { status: 'unauthenticated', reason: 'missing_session' } : { status: 'forbidden' });
      }
    };

    getAuthSession().then((session) => {
      if (cancelled) return;
      void check(session ? { access_token: session.access_token } : null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      void check(session ? { access_token: session.access_token } : null);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state.status !== 'authorized') return;
    const timeoutMinutes = Number(state.access.securityPolicy?.session_timeout_minutes ?? 0);
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) return;
    const timeoutMs = Math.max(60_000, Math.floor(timeoutMinutes * 60_000));

    let timeoutId = window.setTimeout(async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        setState({ status: 'unauthenticated', reason: 'idle_timeout' });
      }
    }, timeoutMs);

    const resetTimeout = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(async () => {
        try {
          await supabase.auth.signOut();
        } finally {
          setState({ status: 'unauthenticated', reason: 'idle_timeout' });
        }
      }, timeoutMs);
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimeout, { passive: true }));
    document.addEventListener('visibilitychange', resetTimeout);

    return () => {
      window.clearTimeout(timeoutId);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimeout));
      document.removeEventListener('visibilitychange', resetTimeout);
    };
  }, [state]);

  if (state.status === 'loading') {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">Checking admin access...</div>;
  }

  if (state.status === 'unauthenticated') {
    const reason = state.reason === 'idle_timeout' ? '&reason=admin_timeout' : '';
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}${reason}`} replace />;
  }

  if (state.status === 'forbidden') {
    return <Navigate to={`/account?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return (
    <AdminAccessContext.Provider value={state.access}>
      <Outlet />
    </AdminAccessContext.Provider>
  );
};
