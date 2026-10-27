import { BookOpenCheck, Brain, CalendarDays, ExternalLink, Flame, Home, LineChart, LogIn, LogOut, Menu, NotebookTabs, Repeat, Sparkles, Timer, UserRound, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LocaleSwitcher } from '../../../../packages/service-i18n/src/i18n.tsx';
import { useAppT } from '../i18n';
import { PLATFORM_URL, SAT_PLAYBOOK_URL } from '../lib/constants';
import { buildPlatformUrl, getReturnTo } from '../lib/platformUrls';
import { supabase } from '../lib/supabase';

const navItems = [
  { to: '/dashboard', key: 'nav.dashboard', icon: LineChart },
  { to: '/today', key: 'nav.today', icon: CalendarDays },
  { to: '/bank', key: 'nav.bank', icon: BookOpenCheck },
  { to: '/modules', key: 'nav.modules', icon: Timer },
  { to: '/notebook', key: 'nav.notebook', icon: NotebookTabs },
  { to: '/reviews', key: 'nav.reviews', icon: Repeat },
  { to: '/plan', key: 'nav.plan', icon: Brain },
] as const;

export const PracticeTopNav = (props: { streakDays?: number; xp?: number }) => {
  const t = useAppT();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const panelId = useId();
  const header = useRef<HTMLElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setEmail(data.session ? data.session.user.email ?? '' : null); }).catch(() => { if (active) setEmail(null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { if (active) setEmail(session ? session.user.email ?? '' : null); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 980px)');
    const resize = () => setOpen(false);
    viewport.addEventListener('change', resize);
    return () => viewport.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const signOut = async () => {
    await supabase.auth.signOut().catch(() => undefined);
    window.location.assign(PLATFORM_URL);
  };
  return <header className="top-nav" ref={header}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.preventDefault(); setOpen(false); toggle.current?.focus();
      }
    }}
    onBlur={event => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
    <Link to="/dashboard" className="brand">
      <img src="/schood-logo.png" alt="Schood" />
      <div>
        <strong>{t('app.name')}</strong>
        <span>{t('app.tagline')}</span>
      </div>
    </Link>
    <button type="button" className="nav-menu-toggle" ref={toggle}
      aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')} aria-expanded={open} aria-controls={panelId}
      onClick={() => setOpen(value => !value)}>
      {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
    </button>
    <div id={panelId} className={`nav-panel${open ? ' mobile-open' : ''}`}>
      <nav className="nav-links" aria-label={t('nav.label')}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={16} aria-hidden="true" />
              <span>{t(item.key)}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="nav-utility">
        {(props.streakDays != null || props.xp != null) ? <div className="nav-metrics">
          {props.streakDays != null ? <span title={t('nav.streak')}><Flame size={16} aria-hidden="true" />{t('nav.streakValue', { days: props.streakDays })}</span> : null}
          {props.xp != null ? <span title={t('nav.xp')}><Sparkles size={16} aria-hidden="true" />{t('nav.xpValue', { xp: props.xp })}</span> : null}
        </div> : null}
        <a className="nav-link" href={SAT_PLAYBOOK_URL}><ExternalLink size={16} aria-hidden="true" /><span>{t('nav.playbook')}</span></a>
        <a className="nav-link" href={PLATFORM_URL}><Home size={16} aria-hidden="true" /><span>{t('nav.home')}</span></a>
        <a className="nav-link" href={`${PLATFORM_URL}/account`}><UserRound size={16} aria-hidden="true" /><span>{t('nav.account')}</span></a>
        <LocaleSwitcher label={t('nav.language')} />
        {email === null
          ? <a className="nav-link" href={buildPlatformUrl('/auth', getReturnTo(), { product: 'sat-practice' })}><LogIn size={16} aria-hidden="true" /><span>{t('nav.signIn')}</span></a>
          : email !== undefined
            ? <button type="button" className="nav-link nav-button" title={email ? t('nav.signedInAs', { email }) : undefined} onClick={() => void signOut()}>
              <LogOut size={16} aria-hidden="true" /><span>{t('nav.signOut')}</span></button>
            : null}
      </div>
    </div>
  </header>;
};
