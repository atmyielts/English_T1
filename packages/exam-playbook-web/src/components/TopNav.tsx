import { BookOpenCheck, CalendarRange, Compass, ExternalLink, Home, LineChart, LogIn, LogOut, Menu, NotebookPen, Settings2, Target, UserRound, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LocaleSwitcher } from '../../../service-i18n/src/i18n.tsx';
import { useT } from '../i18n';
import { usePlaybook } from '../lib/context';
import { accountUrl, homeUrl, signInUrl } from '../lib/platformUrls';

export const TopNav = () => {
  const t = useT();
  const { config, access } = usePlaybook();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const items: Array<{ to: string; label: string; icon: ReactNode }> = access.premium
    ? [
      { to: '/dashboard', label: t('nav.dashboard'), icon: <LineChart size={16} aria-hidden="true" /> },
      { to: '/diagnostic', label: t('nav.diagnostic'), icon: <Compass size={16} aria-hidden="true" /> },
      { to: '/modules', label: t('nav.modules'), icon: <BookOpenCheck size={16} aria-hidden="true" /> },
      { to: '/plans', label: t('nav.plans'), icon: <CalendarRange size={16} aria-hidden="true" /> },
      { to: '/notes', label: t('nav.notes'), icon: <NotebookPen size={16} aria-hidden="true" /> },
    ]
    : [
      { to: '/modules', label: t('nav.modules'), icon: <BookOpenCheck size={16} aria-hidden="true" /> },
      { to: '/plans', label: t('nav.plans'), icon: <CalendarRange size={16} aria-hidden="true" /> },
      { to: '/diagnostic', label: t('nav.diagnostic'), icon: <Compass size={16} aria-hidden="true" /> },
    ];

  return (
    <header
      className="top-nav"
      ref={header}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <Link to="/" className="brand">
        <img src="/schood-logo.png" alt="" width={40} height={40} />
        <div>
          <strong>{config.serviceName}</strong>
          <span>{t('brand.tagline')}</span>
        </div>
      </Link>
      <button
        type="button"
        className="nav-menu-toggle"
        ref={toggle}
        aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
      <div id={panelId} className={`nav-panel${open ? ' mobile-open' : ''}`}>
        <nav className="nav-links" aria-label={config.serviceName}>
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
          {access.isAdmin ? (
            <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Settings2 size={16} aria-hidden="true" />
              <span>{t('nav.admin')}</span>
            </NavLink>
          ) : null}
        </nav>
        <div className="nav-metrics">
          <a href={config.simulator.url} className="nav-link">
            <Target size={16} aria-hidden="true" />
            <span>{t('nav.simulator', { exam: config.examName })}</span>
          </a>
          {config.practice.kind === 'product' ? (
            <a href={config.practice.url} className="nav-link">
              <ExternalLink size={16} aria-hidden="true" />
              <span>{t(config.practice.nameKey as 'product.satPractice')}</span>
            </a>
          ) : null}
          <a href={homeUrl()} className="nav-link">
            <Home size={16} aria-hidden="true" />
            <span>{t('nav.home')}</span>
          </a>
          {access.status === 'signed_in' ? (
            <>
              <a href={accountUrl()} className="nav-link">
                <UserRound size={16} aria-hidden="true" />
                <span>{t('nav.account')}</span>
              </a>
              <button type="button" className="nav-link nav-button" onClick={() => void access.signOut()}>
                <LogOut size={16} aria-hidden="true" />
                <span>{t('nav.signOut')}</span>
              </button>
            </>
          ) : access.status === 'anonymous' ? (
            <a href={signInUrl(config.productSlug)} className="nav-link">
              <LogIn size={16} aria-hidden="true" />
              <span>{t('nav.signIn')}</span>
            </a>
          ) : null}
          <LocaleSwitcher label={t('nav.language')} />
        </div>
      </div>
    </header>
  );
};

export const Shell = ({ children, narrow }: { children: ReactNode; narrow?: boolean }) => (
  <div className="app-shell">
    <a className="skip-link" href="#main">{useT()('nav.skip')}</a>
    <TopNav />
    <main id="main" className={`workspace${narrow ? ' narrow' : ''}`}>{children}</main>
  </div>
);
