import React, { useEffect, useId, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight,
  BarChart3,
  BookMarked,
  BookOpen,
  CalendarDays,
  Grid2x2,
  Home,
  LogIn,
  LogOut,
  Menu,
  Settings,
  UserCircle2,
  X,
} from 'lucide-react';
import { LocaleSwitcher } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { TOEFL_IBT_PRODUCT_SLUG } from '../../lib/constants';
import { useAppT, type AppKey } from '../../i18n';
import { useAccess } from '../../lib/useAccess';
import { supabase } from '../../lib/supabase';
import { TOEFL_PLAYBOOK_URL } from '../../features/toefl2026/tasks';

interface MainLayoutProps {
  children: React.ReactNode;
}

type NavItem = { path: string; label: AppKey; icon: LucideIcon };

export const SCHOOD_HOME_URL = 'https://schood.online';

const isMainActivePath = (pathname: string, path: string): boolean => {
  if (path === '/dashboard') return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  return pathname === path || pathname.startsWith(`${path}/`);
};

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'nav.dashboard', icon: Home },
  { path: '/practice', label: 'nav.practice', icon: CalendarDays },
  { path: '/full-exam', label: 'nav.full_exam', icon: BookOpen },
  { path: '/review', label: 'nav.review', icon: Grid2x2 },
  { path: '/stats', label: 'nav.stats', icon: BarChart3 },
];

const pageMetaByPath: Array<{ match: (path: string) => boolean; title: AppKey; subtitle: AppKey }> = [
  { match: (p) => p === '/dashboard' || p.startsWith('/dashboard/'), title: 'page.dashboard.title', subtitle: 'page.dashboard.subtitle' },
  { match: (p) => p.startsWith('/practice'), title: 'page.practice.title', subtitle: 'page.practice.subtitle' },
  { match: (p) => p.startsWith('/full-exam') || p.startsWith('/test'), title: 'page.full_exam.title', subtitle: 'page.full_exam.subtitle' },
  { match: (p) => p.startsWith('/review'), title: 'page.review.title', subtitle: 'page.review.subtitle' },
  { match: (p) => p.startsWith('/stats'), title: 'page.stats.title', subtitle: 'page.stats.subtitle' },
];

const railButtonClass = (active: boolean): string =>
  [
    'h-12 w-12 rounded-full border inline-flex items-center justify-center transition-all duration-200',
    active
      ? 'bg-[#c2410c] border-[#c2410c] text-white shadow-[0_8px_24px_rgba(194,65,12,0.30)]'
      : 'bg-white/85 border-[#151d2b]/10 text-[#6b4a2a] hover:bg-white hover:text-[#4a2b12]',
  ].join(' ');

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useAppT();
  const { status, me } = useAccess();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavId = useId();
  const returnTo = getReturnTo(location);
  const signedIn = status === 'authenticated';
  const email = me?.user?.email ?? '';

  const pageMeta = useMemo(() => pageMetaByPath.find((item) => item.match(location.pathname)) ?? pageMetaByPath[0], [location.pathname]);

  const goPlatform = (path: string): void => {
    const url = buildPlatformUrl(path, returnTo, { product: TOEFL_IBT_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return;
    }
    navigate(url);
  };

  const signOut = async (): Promise<void> => {
    try { await supabase.auth.signOut(); } catch { /* the platform clears the shared cookie too */ }
    window.location.assign('/');
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setMobileNavOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  const accountButton = signedIn ? (
    <button type="button" onClick={() => void signOut()} className="h-10 inline-flex items-center gap-2 rounded-full border border-[#151d2b]/15 bg-white/80 px-3 text-sm font-semibold hover:bg-white" title={email ? t('nav.signed_in_as', { email }) : undefined}>
      <LogOut size={15} /> <span className="hidden md:inline">{t('nav.sign_out')}</span>
    </button>
  ) : (
    <button type="button" onClick={() => goPlatform('/auth')} className="h-10 inline-flex items-center gap-2 rounded-full border border-[#151d2b]/15 bg-white/80 px-3 text-sm font-semibold hover:bg-white">
      <LogIn size={15} /> <span className="hidden md:inline">{t('nav.sign_in')}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-[#111827] overflow-x-hidden">
      <aside className="hidden lg:flex fixed inset-y-4 left-4 z-40 w-[92px] flex-col items-center rounded-[34px] border border-[#151d2b]/10 bg-[#eae4de]/95 backdrop-blur-xl shadow-[0_20px_44px_rgba(15,23,42,0.10)]">
        <a
          href={SCHOOD_HOME_URL}
          className="mt-4 h-12 w-12 rounded-2xl bg-white/90 border border-[#151d2b]/10 inline-flex items-center justify-center text-[#0f172a] hover:bg-white"
          title={t('nav.schood_home')}
          aria-label={t('nav.schood_home')}
        >
          <img src="/schood-logo.png" alt="" aria-hidden="true" className="h-7 w-7 rounded-lg object-contain" />
        </a>

        <div className="mt-5 flex flex-col items-center gap-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isMainActivePath(location.pathname, item.path);
            return (
              <Link key={item.path} to={item.path} title={t(item.label)} aria-label={t(item.label)} className={railButtonClass(active)}>
                <Icon size={20} />
              </Link>
            );
          })}
          <a href={TOEFL_PLAYBOOK_URL} title={t('nav.playbook')} aria-label={t('nav.playbook')} className={railButtonClass(false)}>
            <BookMarked size={20} />
          </a>
        </div>

        <div className="mt-auto mb-4 flex flex-col items-center gap-3">
          <button type="button" onClick={() => goPlatform('/pricing')} className={railButtonClass(false)} title={t('nav.pricing')} aria-label={t('nav.pricing')}>
            <Settings size={20} />
          </button>
          <button
            type="button"
            onClick={() => goPlatform('/account')}
            className="h-12 w-12 rounded-full border border-[#151d2b]/10 bg-white/90 inline-flex items-center justify-center text-[#0f172a] hover:bg-white"
            title={t('nav.account')}
            aria-label={t('nav.account')}
          >
            <UserCircle2 size={21} />
          </button>
        </div>
      </aside>

      <div className="lg:pl-[120px]">
        <header className="sticky top-0 z-30 border-b border-[#151d2b]/10 bg-[#f6f1e8]/90 backdrop-blur px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="lg:hidden h-10 w-10 shrink-0 rounded-full border border-[#151d2b]/15 bg-white/90 inline-flex items-center justify-center"
                onClick={() => setMobileNavOpen((open) => !open)}
                aria-label={mobileNavOpen ? t('nav.close_menu') : t('nav.open_menu')}
                aria-expanded={mobileNavOpen}
                aria-controls={mobileNavId}
              >
                {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
              <button type="button" onClick={() => navigate('/')} className="min-w-0 text-left hover:opacity-80">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[#64748b] font-semibold truncate">{t('nav.simulator')}</div>
                <h1 className="text-lg sm:text-xl font-semibold text-[#0f172a] truncate">{t(pageMeta.title)}</h1>
                <p className="hidden sm:block text-sm text-[#475569] truncate">{t(pageMeta.subtitle)}</p>
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a href={TOEFL_PLAYBOOK_URL} className="hidden md:inline-flex h-10 items-center gap-2 rounded-full border border-[#151d2b]/15 bg-white/80 px-4 text-sm font-semibold hover:bg-white">
                {t('nav.playbook')} <ArrowUpRight size={14} />
              </a>
              <span className="hidden sm:inline-flex"><LocaleSwitcher label={t('nav.language')} /></span>
              {accountButton}
              <button
                type="button"
                onClick={() => goPlatform('/account')}
                className="h-10 w-10 rounded-full border border-[#151d2b]/15 bg-white/90 inline-flex items-center justify-center text-[#0f172a]"
                aria-label={t('nav.account')}
                title={t('nav.account')}
              >
                <UserCircle2 size={19} />
              </button>
            </div>
          </div>
        </header>

        {mobileNavOpen ? (
          <div id={mobileNavId} className="lg:hidden border-b border-[#151d2b]/10 bg-[#f6f1e8]/95 px-4 py-4 shadow-sm">
            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isMainActivePath(location.pathname, item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileNavOpen(false)}
                    className={[
                      'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors',
                      active ? 'bg-[#c2410c] text-white border-[#c2410c]' : 'bg-white/80 text-[#111827] border-[#151d2b]/10 hover:bg-white',
                    ].join(' ')}
                  >
                    <Icon size={18} />
                    {t(item.label)}
                  </Link>
                );
              })}
              <a href={TOEFL_PLAYBOOK_URL} className="flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold bg-white/80 text-[#111827] border-[#151d2b]/10">
                <BookMarked size={18} /> {t('nav.playbook')}
              </a>
            </nav>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={SCHOOD_HOME_URL} className="h-11 rounded-xl border border-[#151d2b]/15 bg-white/80 text-sm font-semibold inline-flex items-center justify-center">{t('nav.schood_home')}</a>
              <button type="button" onClick={() => { setMobileNavOpen(false); goPlatform('/pricing'); }} className="h-11 rounded-xl border border-[#151d2b]/15 bg-white/80 text-sm font-semibold">{t('nav.pricing')}</button>
              <button type="button" onClick={() => { setMobileNavOpen(false); goPlatform('/account'); }} className="h-11 rounded-xl border border-[#151d2b]/15 bg-white/80 text-sm font-semibold">{t('nav.account')}</button>
              <div className="h-11 inline-flex items-center"><LocaleSwitcher label={t('nav.language')} /></div>
            </div>
            {signedIn && email ? <p className="mt-3 text-xs text-[#64748b] break-words">{t('nav.signed_in_as', { email })}</p> : null}
          </div>
        ) : null}

        <main className="px-4 pb-8 pt-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
};
