import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';

type Props = { path: string; productId?: string; productSlug?: string };

export const PlatformRedirect: React.FC<Props> = ({ path, productId, productSlug }) => {
  const location = useLocation();
  const queryReturnTo = new URLSearchParams(location.search).get('returnTo');
  const returnTo = queryReturnTo
    ? (/^https?:\/\//i.test(queryReturnTo)
      ? queryReturnTo
      : typeof window !== 'undefined'
        ? new URL(queryReturnTo, window.location.origin).toString()
        : queryReturnTo)
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
    return <div className="route-loading">Redirecting...</div>;
  }

  return <Navigate to={url} replace />;
};

