import React, { useEffect } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';

type Props = { path: string; productId?: string; productSlug?: string };

export const PlatformRedirect: React.FC<Props> = ({ path, productId, productSlug }) => {
  const location = useLocation();
  const queryReturnTo = new URLSearchParams(location.search).get('returnTo');
  const returnTo = queryReturnTo
    ? (() => {
        if (/^https?:\/\//i.test(queryReturnTo)) return queryReturnTo;
        if (typeof window !== 'undefined') return new URL(queryReturnTo, window.location.origin).toString();
        return queryReturnTo;
      })()
    : getReturnTo(location);

  const url = buildPlatformUrl(
    path,
    returnTo,
    productSlug ? { product: productSlug } : productId ? { product_id: productId } : undefined,
  );

  useEffect(() => {
    if (!hasPlatformBase) return;
    window.location.assign(url);
  }, [url]);

  if (hasPlatformBase) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">Redirecting...</div>;
  }

  return <Navigate to={url} replace />;
};
