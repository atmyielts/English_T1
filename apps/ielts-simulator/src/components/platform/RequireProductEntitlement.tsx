import React from 'react';
import { Navigate } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { useAccess } from '../../lib/useAccess';
import type { AccessEffectiveResponse, MeResponse } from '../../lib/platformClient';
import type { Location } from 'react-router-dom';
import { Outlet, useLocation } from 'react-router-dom';

const hasProductEntitlement = (me: MeResponse, productId: string): boolean =>
  me.entitlements.some((e) => e.resource_type === 'product' && e.resource_id === productId);

const hasEffectiveProductAccess = (
  me: MeResponse,
  effective: AccessEffectiveResponse | null,
  productId: string,
): boolean => {
  if (hasProductEntitlement(me, productId)) return true;
  if (!effective) return false;
  return Array.isArray(effective.effective_product_ids) && effective.effective_product_ids.includes(productId);
};

type Props = { productId: string; productSlug?: string };

const AccessLoading: React.FC<{ label: string }> = ({ label }) => (
  <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/40 flex items-center justify-center p-6">
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/90 shadow-sm p-5">
      <div className="text-sm font-semibold text-slate-900">{label}</div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-1/3 rounded-full bg-slate-300 animate-pulse" />
      </div>
    </div>
  </div>
);

export const RequireProductEntitlement: React.FC<Props> = ({ productId, productSlug }) => {
  const location = useLocation();
  // Force a fresh /me fetch on guarded routes so entitlement revokes take effect immediately.
  const { status, me, effective } = useAccess({ force: true, includeEffective: true });
  const disablePaywall = String(import.meta.env.VITE_DISABLE_PAYWALL ?? '').toLowerCase() === 'true';

  const returnTo = getReturnTo(location as Location);

  if (status === 'loading') {
    return <AccessLoading label="Checking your access..." />;
  }

  if (status === 'unauthenticated') {
    const url = buildPlatformUrl('/auth', returnTo, productSlug ? { product: productSlug } : { product_id: productId });
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  if (!me) {
    return <AccessLoading label="Loading your service permissions..." />;
  }

  if (!disablePaywall && !hasEffectiveProductAccess(me, effective, productId)) {
    const url = buildPlatformUrl('/pricing', returnTo, productSlug ? { product: productSlug } : { product_id: productId });
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  return <Outlet />;
};
