import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LocaleSwitcher } from '../../../../packages/service-i18n/src/i18n.tsx';
import { useT } from '../i18n';
import { SKILLS, type SkillKey } from '../lib/skills';
import { useEnglish } from './EnglishContext';

export const HUB_NAV = ['today', 'practice', 'review', 'progress', 'tutor', 'league'] as const;

/** The original Schood English header: logo, pill navigation, account controls. */
export const HubHeader = () => {
  const t = useT();
  const location = useLocation();
  const { session, signInHref, signOut, pricingHref } = useEnglish();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header
      className={`en-hubnav frame ${open ? 'is-open' : ''}`.trim()}
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
    >
      <Link className="en-brand" to={session ? '/today' : '/'}>
        <img src="/schood-logo.png" alt="" width={46} height={46} />
        <span className="en-brand-copy">
          <strong>Schood English</strong>
          <small>{t('app.tagline')}</small>
        </span>
      </Link>
      <button
        type="button"
        className="en-menu-toggle quiet"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? t('nav.close') : t('nav.menu')}
      </button>
      {session ? (
        <nav id={panelId} className="en-hublinks" aria-label={t('nav.workspace')}>
          {HUB_NAV.map((id) => (
            <NavLink key={id} to={`/${id}`} aria-current={location.pathname.startsWith(`/${id}`) ? 'page' : undefined}>
              {t(`nav.${id}`)}
            </NavLink>
          ))}
        </nav>
      ) : <span className="en-hublinks" id={panelId} />}
      <div className="en-hubcontrols">
        <LocaleSwitcher label={t('settings.language.title')} />
        {session ? (
          <>
            <Link className="en-account" to="/settings">{t('nav.settings')}</Link>
            <button type="button" className="quiet" onClick={() => void signOut()}>{t('nav.signOut')}</button>
          </>
        ) : (
          <>
            <a className="en-button-quiet" href={pricingHref()}>{t('landing.pricing')}</a>
            <a className="en-button" href={signInHref(location.pathname === '/' ? '/today' : location.pathname)}>{t('nav.signIn')}</a>
          </>
        )}
      </div>
    </header>
  );
};

/** Hub pages: warm paper background with the framed header. */
export const HubFrame = ({ children }: { children: ReactNode }) => (
  <>
    <div className="en-ambient" aria-hidden="true" />
    <div className="en-hub">
      <HubHeader />
      <main id="workspace-main" className="en-main">{children}</main>
    </div>
  </>
);

/** Skill pages: the original forest-green workspace rail with the skill's own accent colour. */
export const SkillWorkspace = ({ skill, children }: { skill: SkillKey; children: ReactNode }) => {
  const t = useT();
  const location = useLocation();
  const { access, signOut, pricingHref } = useEnglish();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const locked = access.status === 'ready' && !access.unlocked.has(skill);
  const home = `/${skill}`;

  useEffect(() => setOpen(false), [location.pathname]);

  const menu = [
    { to: home, label: t('rail.skillHome', { skill: t(`skill.${skill}`) }), active: location.pathname === home },
    { to: '/today', label: t('nav.today'), active: false },
    { to: '/review', label: t('nav.review'), active: false },
    { to: '/progress', label: t('nav.progress'), active: false },
    { to: '/tutor', label: t('nav.tutor'), active: false },
    { to: '/league', label: t('nav.league'), active: false },
  ];

  return (
    <div className={`en-workspace is-${skill}`}>
      <aside className={`en-rail ${open ? 'is-open' : ''}`.trim()} aria-label={t('rail.label', { skill: t(`skill.${skill}`) })}>
        <div className="en-rail-head">
          <Link className="en-rail-brand" to={home}>
            <span>
              <strong>{t(`skill.${skill}`)}</strong>
              <small>Schood English</small>
            </span>
          </Link>
          <button type="button" className="en-rail-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}>
            {open ? t('nav.close') : t('rail.menu')}
          </button>
        </div>
        <div className="en-rail-body" id={bodyId}>
          <nav className="en-rail-menu" aria-label={t('rail.menu')}>
            {menu.map((item) => (
              <Link key={item.to} to={item.to} aria-current={item.active ? 'page' : undefined}>{item.label}</Link>
            ))}
          </nav>
          <div className="en-rail-section">
            <p className="en-rail-heading"><span>{t('rail.switch')}</span><Link to="/practice">{t('nav.practice')}</Link></p>
            <div className="en-rail-switch">
              {SKILLS.filter((entry) => entry.key !== skill).map((entry) => (
                <Link key={entry.key} to={entry.path}>{t(`skill.${entry.key}`)}</Link>
              ))}
            </div>
          </div>
          <div className="en-rail-footer">
            {locked ? (
              <div className="en-rail-upgrade">
                <strong>{t('locked.title', { skill: t(`skill.${skill}`) })}</strong>
                <p>{t('locked.body')}</p>
                <a href={pricingHref(skill)}>{t('locked.cta')}</a>
                <a href={pricingHref()}>{t('bundle.cta')}</a>
              </div>
            ) : null}
            <LocaleSwitcher label={t('settings.language.title')} />
            <Link to="/settings">{t('nav.settings')}</Link>
            <button type="button" className="is-link" onClick={() => void signOut()}>{t('nav.signOut')}</button>
          </div>
        </div>
      </aside>
      <main id="workspace-main" className="en-ws-main">
        <div className="en-ws-topbar">
          <div>
            <small>{t('rail.topbar', { skill: t(`skill.${skill}`) })}</small>
            <p>{t(`skill.${skill}.what`)}</p>
          </div>
          <Link className="en-button-quiet" to="/today">{t('rail.backToToday')}</Link>
        </div>
        {children}
      </main>
    </div>
  );
};
