import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { hasAdminPermission, useAdminAccess } from './adminAccess';

type Props = {
  permission?: string;
  title?: string;
  children: React.ReactNode;
};

export const RequireAdminPermission: React.FC<Props> = ({ permission, title, children }) => {
  const access = useAdminAccess();
  const location = useLocation();

  if (!access) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl p-6">
          <div className="text-lg font-semibold text-gray-900">Admin context unavailable</div>
          <p className="mt-2 text-sm text-gray-600">Reload and sign in again.</p>
        </div>
      </div>
    );
  }

  if (!hasAdminPermission(access.permissions, permission)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
          <div className="text-xl font-bold text-gray-900">Permission required</div>
          <p className="text-sm text-gray-600">
            You do not have permission to open <span className="font-semibold text-gray-900">{title ?? location.pathname}</span>.
          </p>
          <div className="text-xs text-gray-500">Required: {permission ?? 'admin.portal.access'}</div>
          <Link to="/admin/analytics" className="inline-flex px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold">
            Go to analytics
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
