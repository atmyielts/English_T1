import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CreditCard, Home, UserCircle2 } from 'lucide-react';

type Props = { children: React.ReactNode };

export const PlatformLayout: React.FC<Props> = ({ children }) => {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isAccount = location.pathname.startsWith('/account');
  const isPricing = location.pathname.startsWith('/pricing') || location.pathname.startsWith('/checkout');
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = query.get('returnTo');
  const productId = query.get('product_id');
  const product = query.get('product');

  const buildLink = (path: string) => {
    const qs = new URLSearchParams();
    if (returnTo) qs.set('returnTo', returnTo);
    if (productId) qs.set('product_id', productId);
    if (product) qs.set('product', product);
    const suffix = qs.toString();
    return suffix ? `${path}?${suffix}` : path;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-emerald-50">
      <header className="h-16 bg-white/70 backdrop-blur border-b border-white/60 shadow-sm flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <Link to={buildLink('/')} className="font-bold text-gray-900 hover:text-gray-700">
            schood
          </Link>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            to={buildLink('/')}
            className={[
              'px-3 py-2 rounded-xl font-semibold flex items-center gap-2',
              isHome ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
            ].join(' ')}
          >
            <Home size={16} /> Home
          </Link>
          <Link
            to={buildLink('/account')}
            className={[
              'px-3 py-2 rounded-xl font-semibold flex items-center gap-2',
              isAccount ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
            ].join(' ')}
          >
            <UserCircle2 size={16} /> Account
          </Link>
          <Link
            to={buildLink('/pricing')}
            className={[
              'px-3 py-2 rounded-xl font-semibold flex items-center gap-2',
              isPricing ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
            ].join(' ')}
          >
            <CreditCard size={16} /> Pricing
          </Link>
        </nav>
      </header>

      <main className="p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
};
