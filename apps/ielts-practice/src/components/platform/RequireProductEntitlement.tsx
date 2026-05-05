import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { useAccess } from '../../lib/useAccess';
import { IELTS_PRACTICE_PRODUCT_ID, IELTS_PRACTICE_PRODUCT_SLUG } from '../../lib/constants';
import type { AccessEffectiveResponse, MeResponse } from '../../lib/api';
import { AccessLoading } from './AccessLoading';

const hasProductEntitlement = (me: MeResponse, productId: string): boolean =>
  me.entitlements.some((entry) => entry.resource_type === 'product' && entry.resource_id === productId);

const hasEffectiveProductAccess = (
  me: MeResponse,
  effective: AccessEffectiveResponse | null,
  productId: string,
): boolean => {
  if (hasProductEntitlement(me, productId)) return true;
  return Array.isArray(effective?.effective_product_ids) && effective.effective_product_ids.includes(productId);
};

export const RequireProductEntitlement: React.FC = () => {
  const location = useLocation();
  const { status, me, effective } = useAccess({ force: true, includeEffective: true });
  const disablePaywall = String(import.meta.env.VITE_DISABLE_PAYWALL ?? '').toLowerCase() === 'true';
  const returnTo = getReturnTo(location);

  if (status === 'loading') return <AccessLoading label="Checking access" />;

  if (status === 'unauthenticated') {
    const url = buildPlatformUrl('/auth', returnTo, { product: IELTS_PRACTICE_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  if (!me) return <AccessLoading label="Loading account" detail="We are preparing your Practice Labs workspace." />;

  if (!disablePaywall && !hasEffectiveProductAccess(me, effective, IELTS_PRACTICE_PRODUCT_ID)) {
    const url = buildPlatformUrl('/pricing', returnTo, { product: IELTS_PRACTICE_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  return <Outlet />;
};

