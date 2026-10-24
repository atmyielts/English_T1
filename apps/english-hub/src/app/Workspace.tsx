import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LocaleSwitcher } from '../../../../packages/service-i18n/src/i18n.tsx';
import { useT } from '../i18n';
import { SKILLS, type SkillKey } from '../lib/skills';
import { focusSkillOf, orderSkills } from '../lib/focusSkill';
import { getXp } from '../lib/xp';
import { RailInstallButton } from '../components/InstallApp';
import { useEnglish } from './EnglishContext';
import { DAY_ENTRIES, SKILL_PAGES, YOU_ENTRIES, activeEntry, allEntries, type NavEntry } from './navModel';
import { QuickSwitcher } from './QuickSwitcher';
import './workspace.css';

// XP for the top bar, shared across page changes so moving around doesn't refetch every time.
let xpCache: { at: number; xp: number } | null = null;
const XP_CACHE_MS = 60_000;

const useTodayXp = (pathname: string): number | null => {
  const [xp, setXp] = useState<number | null>(xpCache?.xp ?? null);
  useEffect(() => {
    if (xpCache && Date.now() - xpCache.at < XP_CACHE_MS) {
      setXp(xpCache.xp);
      return;
    }
    const controller = new AbortController();
    getXp(undefined, controller.signal)
      .then((summary) => {
        xpCache = { at: Date.now(), xp: summary.today.xp };
        setXp(summary.today.xp);
      })
      .catch(() => { /* The chip is optional; the page works without it. */ });
    return () => controller.abort();
  }, [pathname]);
  return xp;
};

const LockIcon = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M7 1.5a5.5 5.5 0 0 1 4.38 8.83l3.15 3.14-1.06 1.06-3.14-3.15A5.5 5.5 0 1 1 7 1.5Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
  </svg>
);

/**
 * The one Schood English workspace: the same forest-green sidebar, top bar and
 * phone tab bar on every signed-in page. Hub pages keep their warm paper look
 * in the content area; a skill's pages keep that skill's accent colour.
 */
export const Workspace = ({ skill, children }: { skill?: SkillKey; children: ReactNode }) => {
  const t = useT();
  const location = useLocation();
  const { access, signOut, pricingHref } = useEnglish();
  const [open, setOpen] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const bodyId = useId();
  const xp = useTodayXp(location.pathname);

  const entries = allEntries();
  const current = activeEntry(location.pathname, entries);
  const ready = access.status === 'ready';
  const locked = Boolean(skill) && ready && !access.unlocked.has(skill as SkillKey);
  const noPlan = ready && access.unlocked.size === 0;
  const skills = orderSkills(SKILLS, focusSkillOf(access));

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSwitcher(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const link = (entry: NavEntry) => (
    <Link key={entry.to} to={entry.to} aria-current={current?.to === entry.to ? 'page' : undefined}>
      {t(entry.labelKey, entry.labelParams)}
    </Link>
  );

  const tabs: Array<{ to: string; label: string }> = [
    { to: '/today', label: t('nav.today') },
    { to: '/practice', label: t('nav.practice') },
    { to: '/review', label: t('nav.review') },
    { to: '/tutor', label: t('nav.tutor') },
  ];

  return (
    <div className={`en-workspace en-shell ${skill ? `is-${skill}` : 'is-hub'}`}>
      {skill ? null : <div className="en-ambient" aria-hidden="true" />}
      <aside className={`en-rail ${open ? 'is-open' : ''}`.trim()} aria-label={t('ws.label')}>
        <div className="en-rail-head">
          <Link className="en-rail-brand" to="/today">
            <span>
              <strong>Schood English</strong>
              <small>{skill ? t(`skill.${skill}`) : t('app.tagline')}</small>
            </span>
          </Link>
          <button type="button" className="en-rail-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}>
            {open ? t('nav.close') : t('rail.menu')}
          </button>
        </div>
        <div className="en-rail-body" id={bodyId}>
          <button type="button" className="en-ws-search" onClick={() => setSwitcher(true)}>
            <SearchIcon />
            <span>{t('ws.search')}</span>
            <kbd>Ctrl K</kbd>
          </button>

          <nav className="en-rail-section" aria-label={t('ws.group.day')}>
            <p className="en-rail-heading"><span>{t('ws.group.day')}</span></p>
            <div className="en-rail-menu">{DAY_ENTRIES.map(link)}</div>
          </nav>

          <nav className="en-rail-section" aria-label={t('ws.group.skills')}>
            <p className="en-rail-heading"><span>{t('ws.group.skills')}</span></p>
            <div className="en-rail-menu en-rail-skills">
              {skills.map((entry) => {
                const here = skill === entry.key;
                const owned = !ready || access.unlocked.has(entry.key);
                const pages = SKILL_PAGES[entry.key] ?? [];
                return (
                  <div key={entry.key} className={`en-rail-skill is-${entry.key} ${here ? 'is-here' : ''}`.trim()}>
                    <Link to={entry.path} aria-current={here && location.pathname === entry.path ? 'page' : undefined}>
                      <span className="en-rail-dot" aria-hidden="true" />
                      <span className="en-rail-skill-name">{t(`skill.${entry.key}`)}</span>
                      {owned ? null : <span className="en-rail-lock" title={t('ws.locked')}><LockIcon /><span className="visually-hidden">{t('ws.locked')}</span></span>}
                    </Link>
                    {here && pages.length ? <div className="en-rail-sub">{pages.map(link)}</div> : null}
                  </div>
                );
              })}
            </div>
          </nav>

          <nav className="en-rail-section" aria-label={t('ws.group.you')}>
            <p className="en-rail-heading"><span>{t('ws.group.you')}</span></p>
            <div className="en-rail-menu">{YOU_ENTRIES.map(link)}</div>
          </nav>

          <div className="en-rail-footer">
            {locked && skill ? (
              <div className="en-rail-upgrade">
                <strong>{t('locked.title', { skill: t(`skill.${skill}`) })}</strong>
                <p>{t('locked.body')}</p>
                <a href={pricingHref(skill)}>{t('locked.cta')}</a>
                <a href={pricingHref()}>{t('bundle.cta')}</a>
              </div>
            ) : noPlan ? (
              <div className="en-rail-upgrade">
                <strong>{t('bundle.short')}</strong>
                <p>{t('ws.bundleBody')}</p>
                <a href={pricingHref()}>{t('locked.cta')}</a>
              </div>
            ) : null}
            {skill ? <RailInstallButton skill={skill} /> : null}
            <LocaleSwitcher label={t('settings.language.title')} />
            <a href="https://schood.online/contact">{t('footer.help')}</a>
            <button type="button" className="is-link" onClick={() => void signOut()}>{t('nav.signOut')}</button>
          </div>
        </div>
      </aside>

      <main id="workspace-main" className="en-ws-main">
        <div className="en-ws-topbar">
          <div className="en-ws-where">
            {skill ? (
              <>
                <small>{t('rail.topbar', { skill: t(`skill.${skill}`) })}</small>
                <p>{t(`skill.${skill}.what`)}</p>
              </>
            ) : null}
          </div>
          <div className="en-ws-tools">
            {xp !== null ? (
              <Link className="en-ws-xp" to="/league" title={t('nav.league')}>{t('ws.xpToday', { xp: String(xp) })}</Link>
            ) : null}
            <button type="button" className="en-ws-search is-compact" onClick={() => setSwitcher(true)} aria-label={t('ws.search')}>
              <SearchIcon />
            </button>
          </div>
        </div>
        {skill ? children : <div className="en-hub">{children}</div>}
      </main>

      <nav className="en-tabbar" aria-label={t('ws.tabs')}>
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`) ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => { setOpen((value) => !value); window.scrollTo({ top: 0 }); }}
        >
          {t('ws.tab.menu')}
        </button>
      </nav>

      <QuickSwitcher open={switcher} onClose={() => setSwitcher(false)} />
    </div>
  );
};
