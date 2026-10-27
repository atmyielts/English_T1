import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { SAT_PRACTICE_PRODUCT_ID, SAT_PRACTICE_PRODUCT_SLUG } from '../../lib/constants';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { useAccess } from '../../lib/useAccess';
import { AccessLoading } from './AccessLoading';

const hasProductEntitlement = (
  me: NonNullable<ReturnType<typeof useAccess>['me']>,
  productId: string,
): boolean =>
  me.entitlements.some((entry) => entry.resource_type === 'product' && entry.resource_id === productId);

export const RequireProductEntitlement = () => {
  const location = useLocation();
  const { status, me, effective } = useAccess({ force: true, includeEffective: true });
  const disablePaywall = String(import.meta.env.VITE_DISABLE_PAYWALL ?? '').toLowerCase() === 'true';
  const returnTo = getReturnTo(location);

  if (status === 'loading') return <AccessLoading />;

  if (status === 'unauthenticated') {
    const url = buildPlatformUrl('/auth', returnTo, { product: SAT_PRACTICE_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  if (!me) return <AccessLoading />;

  const hasEffective = Array.isArray(effective?.effective_product_ids)
    && effective.effective_product_ids.includes(SAT_PRACTICE_PRODUCT_ID);

  if (!disablePaywall && !hasProductEntitlement(me, SAT_PRACTICE_PRODUCT_ID) && !hasEffective) {
    const url = buildPlatformUrl('/pricing', returnTo, { product: SAT_PRACTICE_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  return <Outlet />;
};
