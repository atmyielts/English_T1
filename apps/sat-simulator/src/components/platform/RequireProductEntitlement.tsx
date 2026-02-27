import React from 'react';
import { Navigate } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { useAccess } from '../../lib/useAccess';
import type { AccessEffectiveResponse, MeResponse } from '../../lib/platformClient';
import type { Location } from 'react-router-dom';
import { Outlet, useLocation } from 'react-router-dom';
import { LoadingScreen } from './LoadingScreen';

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

const AccessLoading: React.FC<{ label: string }> = ({ label }) => <LoadingScreen label={label} />;

export const RequireProductEntitlement: React.FC<Props> = ({ productId, productSlug }) => {
  const location = useLocation();
  // Force a fresh /me fetch on guarded routes so entitlement revokes take effect immediately.
  const { status, me, effective } = useAccess({ force: true, includeEffective: true });
  const disablePaywall = String(import.meta.env.VITE_DISABLE_PAYWALL ?? '').toLowerCase() === 'true';

  const returnTo = getReturnTo(location as Location);

  if (status === 'loading') {
    return <AccessLoading label="Loading SAT access..." />;
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
    return <AccessLoading label="Loading your SAT permissions..." />;
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
