import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { LocaleSwitcher } from '../../../../packages/service-i18n/src/i18n.tsx';
import { useAppT, type AppKey } from '../i18n';
import { supabase } from '../lib/supabase';
import { buildPlatformUrl, platformBase } from '../lib/platformUrls';

const SCHOOD_HOME_URL = platformBase || 'https://schood.online';
const ACCOUNT_URL = `${SCHOOD_HOME_URL}/account`;
const IELTS_SIMULATOR_DASHBOARD_URL = 'https://ielts.schood.online/dashboard';
const PLAYBOOK_DASHBOARD_URL = 'https://playbook.ielts.schood.online/dashboard';

interface PracticeShellProps {
  children: ReactNode;
  reviewsDueCount?: number;
  /** In-page links (e.g. dashboard anchors) shown under "More". */
  extraLinks?: Array<{ label: string; href: string }>;
  /** Extra sidebar panel (e.g. dashboard quick actions). */
  sidebarExtra?: ReactNode;
}

// Three primary tabs map to the learner's three intents: DO / REVIEW / CONFIGURE.
const PRIMARY_NAV: Array<{ label: AppKey; hint: AppKey; to: string }> = [
  { label: 'shell.nav.today', hint: 'shell.nav.today.hint', to: '/today' },
  { label: 'shell.nav.progress', hint: 'shell.nav.progress.hint', to: '/dashboard' },
  { label: 'shell.nav.plan', hint: 'shell.nav.plan.hint', to: '/plan' },
];

// Secondary tools — reachable but not competing with the daily path.
const MORE_NAV: Array<{ label: AppKey; to: string }> = [
  { label: 'shell.nav.reviews', to: '/practice/reviews' },
  { label: 'shell.nav.stats', to: '/practice/stats/by-type' },
  { label: 'shell.nav.speaking', to: '/speaking' },
  { label: 'shell.nav.writingPrep', to: '/writing-prep' },
  { label: 'shell.nav.generator', to: '/generator' },
];

const EXTERNAL_NAV: Array<{ label: AppKey; href: string }> = [
  { label: 'shell.nav.simulator', href: IELTS_SIMULATOR_DASHBOARD_URL },
  { label: 'shell.nav.playbook', href: `${PLAYBOOK_DASHBOARD_URL}?source=practice` },
];

/** Signed-in email from the local session (no network call). */
const useSessionEmail = (): string | null | undefined => {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setEmail(data.session?.user.email ?? (data.session ? '' : null));
    }).catch(() => { if (active) setEmail(null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setEmail(session?.user.email ?? (session ? '' : null));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return email;
};

export const PracticeShell = ({ children, reviewsDueCount = 0, extraLinks = [], sidebarExtra }: PracticeShellProps) => {
  const t = useAppT();
  const sidebarMenuId = useId();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const location = useLocation();
  const email = useSessionEmail();
  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      window.location.assign(SCHOOD_HOME_URL);
    }
  };

  return (
    <div className="practice-root">
      <div className="practice-workspace">
        <aside className={`practice-sidebar glass${sidebarOpen ? ' mobile-open' : ''}`}>
          <div className="practice-sidebar-head">
            <Link to="/today" className="practice-sidebar-brand" onClick={closeSidebar}>
              <img src="/schood-logo.png" alt="Schood" />
              <div>
                <strong>{t('shell.brand')}</strong>
                <span>{t('shell.workspace')}</span>
              </div>
            </Link>
            <button
              className="sidebar-menu-button"
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-expanded={sidebarOpen}
              aria-controls={sidebarMenuId}
            >
              {sidebarOpen ? <X size={17} strokeWidth={2.4} /> : <Menu size={17} strokeWidth={2.4} />}
              {t('shell.menu')}
            </button>
          </div>

          <div id={sidebarMenuId} className="practice-sidebar-menu">
            <nav className="practice-sidebar-nav" aria-label={t('shell.nav.label')}>
              {PRIMARY_NAV.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`sidebar-link${isActive ? ' active' : ''}`}
                    onClick={closeSidebar}
                    title={t(item.hint)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {t(item.label)}
                  </Link>
                );
              })}

              <span className="sidebar-nav-label">{t('shell.nav.more')}</span>
              {MORE_NAV.map((item) => {
                const isActive = location.pathname === item.to;
                const label = item.to === '/practice/reviews' && reviewsDueCount > 0
                  ? t('shell.nav.reviewsCount', { count: reviewsDueCount })
                  : t(item.label);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`sidebar-link${isActive ? ' active' : ''}`}
                    onClick={closeSidebar}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {label}
                  </Link>
                );
              })}
              {extraLinks.map((item) => (
                <a key={item.href} href={item.href} className="sidebar-link" onClick={closeSidebar}>{item.label}</a>
              ))}

              <span className="sidebar-nav-label">{t('shell.nav.otherServices')}</span>
              {EXTERNAL_NAV.map((item) => (
                <a key={item.href} href={item.href} className="sidebar-link" onClick={closeSidebar}>
                  {t(item.label)}
                </a>
              ))}
            </nav>

            {sidebarExtra}

            <section className="sidebar-panel sidebar-account-panel" aria-label={t('shell.account.title')}>
              <p className="sidebar-account-state">
                {email === undefined
                  ? t('common.loading')
                  : email === null
                    ? t('shell.account.signedOut')
                    : t('shell.account.signedInAs', { email: email || '—' })}
              </p>
              <div className="sidebar-account-links">
                <a href={SCHOOD_HOME_URL} className="btn ghost compact">{t('shell.account.home')}</a>
                <a href={ACCOUNT_URL} className="btn ghost compact">{t('shell.account.account')}</a>
                {email === null ? (
                  <a href={buildPlatformUrl('/auth')} className="btn solid compact">{t('shell.account.signIn')}</a>
                ) : (
                  <button type="button" className="btn ghost compact" onClick={() => void signOut()} disabled={signingOut || email === undefined}>
                    {signingOut ? t('shell.account.signingOut') : t('shell.account.signOut')}
                  </button>
                )}
              </div>
              <LocaleSwitcher label={t('shell.language')} />
            </section>
          </div>
        </aside>

        <main className="practice-main" id="practice-main">{children}</main>
      </div>
    </div>
  );
};
