import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CreditCard, Tag, Receipt, Users, Settings, ArrowLeft, LayoutGrid, Inbox, BarChart3, Megaphone, BookOpen, HandCoins } from 'lucide-react';
import { hasAdminPermission, useAdminAccess } from '../platform/adminAccess';

type Props = { children: React.ReactNode };

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  permission: string;
};

export const AdminLayout: React.FC<Props> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useAdminAccess();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const returnTo = useMemo(() => new URLSearchParams(location.search).get('returnTo') ?? '/', [location.search]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const navItems = useMemo<NavItem[]>(
    () => [
      { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, permission: 'admin.analytics.view' },
      { to: '/admin/english', label: 'English', icon: BookOpen, permission: 'admin.analytics.view' },
      { to: '/admin/products', label: 'Products', icon: LayoutGrid, permission: 'admin.products.manage' },
      { to: '/admin/billing', label: 'Billing', icon: CreditCard, permission: 'admin.billing.manage' },
      { to: '/admin/coupons', label: 'Coupons', icon: Tag, permission: 'admin.coupons.manage' },
      { to: '/admin/referrals', label: 'Referrals', icon: HandCoins, permission: 'admin.referrals.manage' },
      { to: '/admin/payments', label: 'Payments', icon: Receipt, permission: 'admin.payments.manage' },
      { to: '/admin/users', label: 'Users', icon: Users, permission: 'admin.users.manage' },
      { to: '/admin/trials', label: 'Trials', icon: Tag, permission: 'admin.trials.manage' },
      { to: '/admin/settings', label: 'Settings', icon: Settings, permission: 'admin.settings.manage' },
      { to: '/admin/support', label: 'Support', icon: Inbox, permission: 'admin.support.manage' },
      { to: '/admin/announcements', label: 'Announcements', icon: Megaphone, permission: 'admin.announcements.manage' },
    ],
    [],
  );
  const visibleItems = useMemo(
    () => navItems.filter((item) => hasAdminPermission(access?.permissions ?? [], item.permission)),
    [access?.permissions, navItems],
  );

  const Nav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex-1 py-6 space-y-1">
      <Link
        to={`/account?returnTo=${encodeURIComponent(returnTo)}`}
        onClick={onNavigate}
        className="mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100"
      >
        <ArrowLeft size={18} />
        Back to Account
      </Link>

      <div className="mt-2 pt-3 border-t border-gray-200" />
      {visibleItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={`mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${
              isActive(item.to) ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Icon size={18} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="relative h-screen bg-gray-50 overflow-hidden">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-72 bg-white border-r border-gray-200 flex-col overflow-y-auto z-30">
        <div className="h-16 flex items-center px-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <button type="button" onClick={() => navigate('/')} className="font-bold text-gray-900 hover:text-gray-700">
            schood Admin
          </button>
        </div>
        <Nav />
      </aside>

      <div className="h-full md:pl-72">
        <div className="flex h-full flex-col min-w-0 overflow-hidden">
        <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-600"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <span className="text-lg">=</span>
            </button>
            <div className="text-sm font-semibold text-gray-700">Admin Control Center</div>
          </div>
          {access ? <div className="hidden md:block text-xs text-gray-500">Role: {access.role}</div> : null}
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>

      {mobileOpen ? (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-gray-200 flex flex-col">
            <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200">
              <button type="button" onClick={() => { setMobileOpen(false); navigate('/'); }} className="font-bold text-gray-900 hover:text-gray-700">
                schood Admin
              </button>
              <button
                type="button"
                className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-600"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                x
              </button>
            </div>
            <Nav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}
    </div>
  );
};
