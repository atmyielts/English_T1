import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Grid2x2,
  Home,
  Menu,
  Settings,
  UserCircle2,
  X,
} from 'lucide-react';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { SAT_PRODUCT_SLUG } from '../../lib/constants';

interface MainLayoutProps {
  children: React.ReactNode;
}

type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
};

const isMainActivePath = (pathname: string, path: string): boolean => {
  if (path === '/dashboard') return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  return pathname === path || pathname.startsWith(`${path}/`);
};

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: Home },
  { path: '/practice', label: 'Practice', icon: CalendarDays },
  { path: '/full-exam', label: 'Full exam', icon: BookOpen },
  { path: '/review', label: 'Review', icon: Grid2x2 },
  { path: '/stats', label: 'Stats', icon: BarChart3 },
];

const pageMetaByPath: Array<{ match: (path: string) => boolean; title: string; subtitle: string }> = [
  {
    match: (path) => path === '/dashboard' || path.startsWith('/dashboard/'),
    title: 'Dashboard',
    subtitle: 'Overview, progress, and quick actions',
  },
  {
    match: (path) => path.startsWith('/practice'),
    title: 'Practice',
    subtitle: 'Train one SAT module at a time',
  },
  {
    match: (path) => path.startsWith('/full-exam') || path.startsWith('/test'),
    title: 'Full Exam',
    subtitle: 'Run complete digital SAT simulations',
  },
  {
    match: (path) => path.startsWith('/review'),
    title: 'Review',
    subtitle: 'Open completed sessions and inspect answers',
  },
  {
    match: (path) => path.startsWith('/stats'),
    title: 'Stats',
    subtitle: 'Track score and pacing trends',
  },
];

const railButtonClass = (active: boolean): string =>
  [
    'h-12 w-12 rounded-full border inline-flex items-center justify-center transition-all duration-200',
    active
      ? 'bg-[#0f172a] border-[#0f172a] text-white shadow-[0_8px_24px_rgba(15,23,42,0.24)]'
      : 'bg-white/85 border-[#151d2b]/10 text-[#0f172a]/75 hover:bg-white hover:text-[#0f172a]',
  ].join(' ');

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const returnTo = getReturnTo(location);

  const pageMeta = useMemo(() => {
    const matched = pageMetaByPath.find((item) => item.match(location.pathname));
    return matched ?? pageMetaByPath[0];
  }, [location.pathname]);

  const goPlatform = (path: string): void => {
    const url = buildPlatformUrl(path, returnTo, { product: SAT_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return;
    }
    navigate(url);
  };

  const goPlatformHome = (): void => {
    if (hasPlatformBase) {
      const url = buildPlatformUrl('/', returnTo, { product: SAT_PRODUCT_SLUG });
      window.location.assign(url);
      return;
    }
    navigate('/platform-home');
  };

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-[#111827]">
      {/* Desktop rail */}
      <aside className="hidden lg:flex fixed inset-y-4 left-4 z-40 w-[92px] flex-col items-center rounded-[34px] border border-[#151d2b]/10 bg-[#eae4de]/95 backdrop-blur-xl shadow-[0_20px_44px_rgba(15,23,42,0.10)]">
        <button
          type="button"
          onClick={goPlatformHome}
          className="mt-4 h-12 w-12 rounded-2xl bg-white/90 border border-[#151d2b]/10 inline-flex items-center justify-center text-[#0f172a] hover:bg-white"
          title="Platform home"
          aria-label="Platform home"
        >
          <span className="text-lg font-black">S</span>
        </button>

        <div className="mt-5 flex flex-col items-center gap-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isMainActivePath(location.pathname, item.path);
            return (
              <Link key={item.path} to={item.path} title={item.label} aria-label={item.label} className={railButtonClass(active)}>
                <Icon size={20} />
              </Link>
            );
          })}
        </div>

        <div className="mt-auto mb-4 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => goPlatform('/pricing')}
            className={railButtonClass(false)}
            title="Pricing"
            aria-label="Pricing"
          >
            <Settings size={20} />
          </button>

          <button
            type="button"
            onClick={() => goPlatform('/account')}
            className="h-12 w-12 rounded-full border border-[#151d2b]/10 bg-white/90 inline-flex items-center justify-center text-[#0f172a] hover:bg-white"
            title="Account"
            aria-label="Account"
          >
            <UserCircle2 size={21} />
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[86vw] max-w-sm bg-[#f6f1e8] border-r border-[#151d2b]/10 p-5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={goPlatformHome}
                className="h-10 px-4 rounded-full bg-[#111827] text-white text-sm font-semibold"
              >
                Platform
              </button>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="h-10 w-10 rounded-full border border-[#151d2b]/15 bg-white inline-flex items-center justify-center"
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="mt-6 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isMainActivePath(location.pathname, item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={[
                      'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors',
                      active
                        ? 'bg-[#111827] text-white border-[#111827]'
                        : 'bg-white/80 text-[#111827] border-[#151d2b]/10 hover:bg-white',
                    ].join(' ')}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => goPlatform('/pricing')}
                className="h-10 rounded-xl border border-[#151d2b]/15 bg-white/80 text-sm font-semibold"
              >
                Pricing
              </button>
              <button
                type="button"
                onClick={() => goPlatform('/account')}
                className="h-10 rounded-xl border border-[#151d2b]/15 bg-white/80 text-sm font-semibold"
              >
                Account
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[120px]">
        <header className="sticky top-0 z-30 border-b border-[#151d2b]/10 bg-[#f6f1e8]/90 backdrop-blur px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="lg:hidden h-10 w-10 rounded-full border border-[#151d2b]/15 bg-white/90 inline-flex items-center justify-center"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={18} />
              </button>
              <button type="button" onClick={() => navigate('/')} className="min-w-0 text-left hover:opacity-80">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[#64748b] font-semibold">SAT Simulator</div>
                <h1 className="text-lg sm:text-xl font-semibold text-[#0f172a] truncate">{pageMeta.title}</h1>
                <p className="hidden sm:block text-sm text-[#475569]">{pageMeta.subtitle}</p>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goPlatform('/pricing')}
                className="hidden sm:inline-flex h-10 items-center gap-2 rounded-full border border-[#151d2b]/15 bg-white/80 px-4 text-sm font-semibold hover:bg-white"
              >
                Pricing <ArrowUpRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => goPlatform('/account')}
                className="h-10 w-10 rounded-full border border-[#151d2b]/15 bg-white/90 inline-flex items-center justify-center text-[#0f172a]"
                aria-label="Account"
              >
                <UserCircle2 size={19} />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 pb-8 pt-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
};
