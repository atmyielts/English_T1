import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Database, UploadCloud, Library, ArrowLeft, User, Menu, X, PenTool } from 'lucide-react';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { SAT_PRODUCT_SLUG } from '../../lib/constants';

type Props = { children: React.ReactNode };

type AdminNavProps = {
  pathname: string;
  returnTo: string;
  inactiveClass: string;
  activeClass: string;
  onNavigate?: () => void;
};

const isActivePath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

const AdminNav: React.FC<AdminNavProps> = ({ pathname, returnTo, inactiveClass, activeClass, onNavigate }) => (
  <nav className="flex-1 py-6 space-y-1">
    <Link to="/" onClick={onNavigate} className={`mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${inactiveClass}`}>
      <ArrowLeft size={18} />
      Back to App
    </Link>

    <div className="mt-2 pt-3 border-t border-white/5" />

    <Link
      to="/admin/tests"
      onClick={onNavigate}
      className={`mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${
        isActivePath(pathname, '/admin/tests') ? activeClass : inactiveClass
      }`}
    >
      <Database size={18} />
      Tests
    </Link>
    <Link
      to="/admin/builder"
      onClick={onNavigate}
      className={`mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${
        isActivePath(pathname, '/admin/builder') ? activeClass : inactiveClass
      }`}
    >
      <PenTool size={18} />
      Builder
    </Link>
    <Link
      to={`/admin/import?returnTo=${encodeURIComponent(returnTo)}`}
      onClick={onNavigate}
      className={`mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${
        isActivePath(pathname, '/admin/import') ? activeClass : inactiveClass
      }`}
    >
      <UploadCloud size={18} />
      Import JSON
    </Link>
    <Link
      to="/admin/assets"
      onClick={onNavigate}
      className={`mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${
        isActivePath(pathname, '/admin/assets') ? activeClass : inactiveClass
      }`}
    >
      <Library size={18} />
      Assets
    </Link>
  </nav>
);

export const AdminLayout: React.FC<Props> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeClass = 'bg-white/10 text-white border border-white/10';
  const inactiveClass = 'text-zinc-400 hover:text-white hover:bg-white/5 transition-colors';

  const title = useMemo(() => {
    const p = location.pathname;
    if (p.startsWith('/admin/tests')) return 'Tests Manager';
    if (p.startsWith('/admin/builder')) return 'Test Builder';
    if (p.startsWith('/admin/import')) return 'Import';
    if (p.startsWith('/admin/assets')) return 'Assets';
    return 'Admin';
  }, [location.pathname]);

  const returnTo = getReturnTo(location);

  const goPlatform = (path: string) => {
    const url = buildPlatformUrl(path, returnTo, { product: SAT_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return;
    }
    navigate(url);
  };

  useEffect(() => {
    if (!mobileNavOpen) return;
    // Close on navigation, but schedule it so we don't synchronously set state inside the effect body.
    const t = window.setTimeout(() => setMobileNavOpen(false), 0);
    return () => window.clearTimeout(t);
  }, [location.pathname, mobileNavOpen]);

  return (
    <div className="flex min-h-[100dvh] md:h-screen bg-gradient-to-br from-gray-50 via-white to-amber-50 font-sans overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-72 bg-zinc-950/95 backdrop-blur flex-col shrink-0 z-20 border-r border-white/5">
        <div className="h-16 flex items-center px-6 border-b border-white/5">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-white font-bold text-lg tracking-wide flex items-center gap-2 hover:text-amber-300"
          >
            <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
            Admin Panel
          </button>
        </div>

        <AdminNav
          pathname={location.pathname}
          returnTo={returnTo}
          inactiveClass={inactiveClass}
          activeClass={activeClass}
        />

        <div className="p-4 border-t border-white/5 space-y-2">
          <button
            className="w-full flex items-center justify-center gap-2 text-xs bg-white/10 border border-white/10 text-white py-2 rounded-xl hover:bg-white/15 transition-colors"
            type="button"
            onClick={() => goPlatform('/account')}
          >
            <User size={16} />
            Platform Account
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen ? (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-zinc-950/95 backdrop-blur flex flex-col border-r border-white/5">
            <div className="h-16 flex items-center justify-between px-5 border-b border-white/5">
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  navigate('/');
                }}
                className="text-white font-bold text-lg tracking-wide flex items-center gap-2 hover:text-amber-300"
              >
                <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                Admin Panel
              </button>
              <button
                type="button"
                className="h-10 w-10 inline-flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/10"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <AdminNav
              pathname={location.pathname}
              returnTo={returnTo}
              inactiveClass={inactiveClass}
              activeClass={activeClass}
              onNavigate={() => setMobileNavOpen(false)}
            />

            <div className="p-4 border-t border-white/5 space-y-2">
              <button
                className="w-full flex items-center justify-center gap-2 text-xs bg-white/10 border border-white/10 text-white py-2 rounded-xl hover:bg-white/15 transition-colors"
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  goPlatform('/account');
                }}
              >
                <User size={16} />
                Platform Account
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white/70 backdrop-blur border-b border-white/60 flex items-center justify-between px-4 sm:px-6 lg:px-8 shadow-sm z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-700"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-wider uppercase text-amber-700">Admin</div>
              <h1 className="text-xl font-bold text-gray-800">{title}</h1>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative">{children}</main>
      </div>
    </div>
  );
};
