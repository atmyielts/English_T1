import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export const AdminLegacyRedirectPage: React.FC = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  if (location.pathname.startsWith('/admin/part-builder')) {
    return <Navigate to="/admin/content-library" replace />;
  }

  if (location.pathname.startsWith('/admin/import')) {
    return <Navigate to="/admin/tests?mode=import" replace />;
  }

  if (location.pathname.startsWith('/admin/builder')) {
    const experienceId = params.get('experience_id');
    return <Navigate to={experienceId ? `/admin/tests?experience_id=${encodeURIComponent(experienceId)}` : '/admin/tests'} replace />;
  }

  return <Navigate to="/admin/tests" replace />;
};
