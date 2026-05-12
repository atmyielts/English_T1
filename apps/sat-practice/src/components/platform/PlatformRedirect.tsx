import { Navigate, useLocation } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';

export const PlatformRedirect = (props: { path: string; productSlug?: string }) => {
  const location = useLocation();
  const url = buildPlatformUrl(props.path, getReturnTo(location), { product: props.productSlug });
  if (hasPlatformBase) {
    window.location.assign(url);
    return null;
  }
  return <Navigate to={url} replace />;
};
