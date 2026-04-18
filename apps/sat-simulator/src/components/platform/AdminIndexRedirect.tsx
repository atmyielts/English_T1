import React from 'react';
import { Navigate } from 'react-router-dom';
import { firstAllowedAdminRoute, useAdminAccess } from './adminAccess';

export const AdminIndexRedirect: React.FC = () => {
  const access = useAdminAccess();
  if (!access) return <Navigate to="/account" replace />;

  const target = firstAllowedAdminRoute(access.permissions);
  if (target) return <Navigate to={target} replace />;

  return <Navigate to="/account" replace />;
};
