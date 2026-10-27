import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { useAccess } from '../../lib/useAccess';
import { useAppT } from '../../i18n';
import { PracticeTopNav } from '../PracticeTopNav';
import { AccessLoading } from './AccessLoading';

const ALLOWED = ['admin.*', 'admin.products.manage'];

/** UI gate only; admin-sat-practice re-checks admin.products.manage on every request. */
export const RequireAdmin = () => {
  const t = useAppT();
  const location = useLocation();
  const { status, me } = useAccess();
  if (status === 'loading') return <AccessLoading label={t('access.checkingAdmin')} />;
  if (status === 'unauthenticated') {
    const url = buildPlatformUrl('/auth', getReturnTo(location));
    if (hasPlatformBase) { window.location.assign(url); return null; }
    return <Navigate to={url} replace />;
  }
  const permissions = Array.isArray(me?.admin?.permissions) ? me!.admin!.permissions! : [];
  const allowed = String(me?.user.role ?? '').toLowerCase() === 'admin' || permissions.some(p => ALLOWED.includes(p));
  if (!allowed) {
    return <div className="app-shell"><PracticeTopNav /><main className="workspace narrow"><div className="alert" role="alert">{t('admin.denied')}</div></main></div>;
  }
  return <Outlet />;
};
