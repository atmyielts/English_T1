import { Fragment, useEffect, useId, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LocaleSwitcher } from '../../../../packages/service-i18n/src/i18n.tsx';
import { useT } from '../i18n';
import { skillByKey, type SkillKey } from '../lib/skills';
import { focusSkillOf } from '../lib/focusSkill';
import { useEnglish } from './EnglishContext';
import { Workspace } from './Workspace';

export const HUB_NAV = ['today', 'practice', 'review', 'progress', 'tutor', 'league'] as const;

/** The original Schood English header: logo, pill navigation, account controls. */
export const HubHeader = () => {
  const t = useT();
  const location = useLocation();
  const { session, signInHref, signOut, pricingHref, access } = useEnglish();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // A learner with exactly one skill gets it right after Today.
  const focus = skillByKey(focusSkillOf(access));

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
            <Fragment key={id}>
              <NavLink to={`/${id}`} aria-current={location.pathname.startsWith(`/${id}`) ? 'page' : undefined}>
                {t(`nav.${id}`)}
              </NavLink>
              {id === 'today' && focus ? <NavLink to={focus.path}>{t(`skill.${focus.key}`)}</NavLink> : null}
            </Fragment>
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

/**
 * Hub pages. Signed in, they live in the one workspace (sidebar + top bar);
 * signed out, visitors get the warm paper page with the framed header.
 */
export const HubFrame = ({ children }: { children: ReactNode }) => {
  const { session } = useEnglish();
  if (session) return <Workspace>{children}</Workspace>;
  return (
    <>
      <div className="en-ambient" aria-hidden="true" />
      <div className="en-hub">
        <HubHeader />
        <main id="workspace-main" className="en-main">{children}</main>
      </div>
    </>
  );
};

/** Skill pages: the same workspace, in the skill's own accent colour. */
export const SkillWorkspace = ({ skill, children }: { skill: SkillKey; children: ReactNode }) => (
  <Workspace skill={skill}>{children}</Workspace>
);
