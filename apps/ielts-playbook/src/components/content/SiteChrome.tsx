import React, { useId, useState } from 'react';
import { ArrowRight, BookOpenCheck, Home, LogIn, LogOut, Menu, UserRound, X } from 'lucide-react';
import { NavLink, Link } from 'react-router-dom';
import { LocaleSwitcher } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { useT, type Key } from '../../i18n';
import { ACCOUNT_URL, SCHOOD_HOME_URL, signInUrl } from '../../lib/access';
import { PRACTICE_APP_URL } from '../../lib/constants';
import { signOut, useSignedIn } from '../../lib/useSession';

const navItems: Array<{ to: string; label: Key }> = [
  { to: '/essentials', label: 'nav.essentials' },
  { to: '/test-types-booking', label: 'nav.testPath' },
  { to: '/study-plans', label: 'nav.studyPlans' },
  { to: '/updates', label: 'nav.updates' },
  { to: '/dashboard', label: 'nav.dashboard' },
];

const AccountControls: React.FC<{ onNavigate?: () => void; mobile?: boolean }> = ({ onNavigate, mobile }) => {
  const t = useT();
  const signedIn = useSignedIn();
  const [busy, setBusy] = useState(false);
  const linkClass = mobile ? 'mobile-nav-link' : 'chrome-link';

  if (signedIn === 'loading') return null;
  if (signedIn === 'signed-out') {
    return (
      <a href={signInUrl()} className={linkClass} onClick={onNavigate}>
        <LogIn size={15} strokeWidth={2.4} />
        {t('header.signIn')}
      </a>
    );
  }
  return (
    <>
      <a href={ACCOUNT_URL} className={linkClass} onClick={onNavigate}>
        <UserRound size={15} strokeWidth={2.4} />
        {t('header.account')}
      </a>
      <button
        type="button"
        className={mobile ? 'mobile-nav-link' : 'chrome-link'}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signOut().finally(() => window.location.assign('/'));
        }}
      >
        <LogOut size={15} strokeWidth={2.4} />
        {t('header.signOut')}
      </button>
    </>
  );
};

export const SiteChrome: React.FC<React.PropsWithChildren<{ compact?: boolean }>> = ({ compact = false, children }) => {
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileNavId = useId();
  const closeMobileNav = () => setMobileOpen(false);

  return (
    <div className={`site-shell${compact ? ' compact-shell' : ''}`}>
      <a href="#main" className="skip-link">{t('header.skip')}</a>
      <div className="chrome-topbar">
        <a href={SCHOOD_HOME_URL} className="chrome-link">
          <Home size={14} strokeWidth={2.4} />
          {t('header.home')}
        </a>
        <a href={`${PRACTICE_APP_URL}/?source=playbook`} className="chrome-link chrome-link-hide-sm">
          {t('header.practice')}
        </a>
        <span className="chrome-spacer" />
        <div className="chrome-account">
          <AccountControls />
        </div>
        <LocaleSwitcher label={t('locale.label')} />
      </div>
      <header className={`site-header${mobileOpen ? ' mobile-open' : ''}`}>
        <div className="site-header-row">
          <Link to="/" className="brand-mark" onClick={closeMobileNav}>
            <span className="brand-knot" aria-hidden="true">
              <BookOpenCheck size={20} strokeWidth={2.4} />
            </span>
            <span>
              <strong>IELTS Playbook</strong>
              <span>{t('header.bySchood')}</span>
            </span>
          </Link>
          <nav className="site-nav" aria-label={t('header.primaryNav')}>
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                {t(item.label)}
              </NavLink>
            ))}
          </nav>
          <div className="site-actions">
            <Link to="/onboarding" className="nav-cta">
              {t('header.buildPlan')}
              <ArrowRight size={16} strokeWidth={2.4} />
            </Link>
            <button
              type="button"
              className="nav-menu-button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-controls={mobileNavId}
            >
              {mobileOpen ? <X size={17} strokeWidth={2.4} /> : <Menu size={17} strokeWidth={2.4} />}
              {t('header.menu')}
            </button>
          </div>
        </div>

        <div id={mobileNavId} className="mobile-nav-panel" hidden={!mobileOpen} aria-hidden={!mobileOpen}>
          {navItems.map((item) => (
            <NavLink
              key={`mobile-${item.to}`}
              to={item.to}
              onClick={closeMobileNav}
              className={({ isActive }) => (isActive ? 'mobile-nav-link active' : 'mobile-nav-link')}
            >
              {t(item.label)}
              <ArrowRight size={15} strokeWidth={2.4} />
            </NavLink>
          ))}
          <a href={`${PRACTICE_APP_URL}/?source=playbook`} className="mobile-nav-link" onClick={closeMobileNav}>
            {t('header.practice')}
            <ArrowRight size={15} strokeWidth={2.4} />
          </a>
          <Link to="/onboarding" className="mobile-nav-cta" onClick={closeMobileNav}>
            {t('header.buildPlan')}
            <ArrowRight size={16} strokeWidth={2.4} />
          </Link>
        </div>
      </header>
      <main id="main">{children}</main>
    </div>
  );
};
