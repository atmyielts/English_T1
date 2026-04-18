import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { useAccess } from '../../lib/useAccess';
import { AdminAccessContext, hasAdminPermission } from './adminAccess';
import { LoadingScreen } from './LoadingScreen';

export const RequireAdmin: React.FC = () => {
  const location = useLocation();
  const { status, me } = useAccess();
  const [timedOut, setTimedOut] = useState(false);

  const returnTo = getReturnTo(location as Location);
  const admin = me?.admin ?? null;
  const role = String(me?.user.role ?? '').toLowerCase();
  const adminMfaUrl = useMemo(() => buildPlatformUrl('/admin-mfa', returnTo), [returnTo]);

  useEffect(() => {
    if (status === 'authenticated') {
      setTimedOut(false);
    }
  }, [me?.user.id, status]);

  useEffect(() => {
    if (status !== 'authenticated' || !admin?.is_admin || !hasAdminPermission(admin.permissions, 'admin.portal.access')) {
      return;
    }

    const timeoutMinutes = Number(admin.security_policy?.session_timeout_minutes ?? 0);
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) return;
    const timeoutMs = Math.max(60_000, Math.floor(timeoutMinutes * 60_000));

    let timeoutId = window.setTimeout(async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        setTimedOut(true);
      }
    }, timeoutMs);

    const resetTimeout = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(async () => {
        try {
          await supabase.auth.signOut();
        } finally {
          setTimedOut(true);
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
  }, [admin, status]);

  if (status === 'loading') {
    return <LoadingScreen label="Checking admin access..." />;
  }

  if (status === 'unauthenticated') {
    const url = buildPlatformUrl('/auth', returnTo, timedOut ? { reason: 'admin_timeout' } : undefined);
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  if (!me || !admin?.is_admin || !Array.isArray(admin.permissions) || !hasAdminPermission(admin.permissions, 'admin.portal.access')) {
    const url = buildPlatformUrl('/account', returnTo);
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  if (admin.security_policy?.require_mfa && admin.session_aal !== 'aal2') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
          <h1 className="text-xl font-bold text-gray-900">Admin access requires MFA</h1>
          <p className="text-sm text-gray-600">
            Your admin session needs multi-factor authentication (AAL2). Open the admin MFA page, verify with your
            authenticator app, then return to SAT admin.
          </p>
          <a href={adminMfaUrl} className="inline-flex px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold">
            Open admin MFA
          </a>
        </div>
      </div>
    );
  }

  return (
    <AdminAccessContext.Provider
      value={{
        userId: me.user.id,
        email: me.user.email,
        role,
        permissions: admin.permissions,
        sessionAal: admin.session_aal,
        securityPolicy: admin.security_policy ?? null,
      }}
    >
      <Outlet />
    </AdminAccessContext.Provider>
  );
};
