// The frame of every public page: header with menus, footer, search tags and the
// first-touch record of where the visit came from.
import React, { useEffect, useRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { useI18n, LocaleSwitcher } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useSession } from '../../session.tsx';
import { homeOf } from '../core/pages.tsx';
import { captureAttribution } from './attribution.ts';
import { INDUSTRY_SLUGS, SOLUTION_SLUGS } from './catalog.ts';
import { useSeo, type Seo } from './seo.ts';

interface MenuGroup { label: string; items: { to: string; label: string }[] }

/** A link that also works for a section of the landing page while you are already on it. */
export function SiteLink({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <Link {...rest} to={to} onClick={(event) => {
    onClick?.(event);
    if (!to.startsWith('/#') || location.pathname !== '/' || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    history.pushState(null, '', to);
    document.getElementById(to.slice(2))?.scrollIntoView();
  }}/>;
}

function useGroups(): { solutions: MenuGroup; industries: MenuGroup; resources: MenuGroup; company: MenuGroup } {
  const t = useAppT();
  return {
    solutions: { label: t('site.nav.solutions'), items: SOLUTION_SLUGS.map((slug) => ({ to: `/solutions/${slug}`, label: t(`site.solution.${slug}` as AppKey) })) },
    industries: { label: t('site.nav.industries'), items: INDUSTRY_SLUGS.map((slug) => ({ to: `/for/${slug}`, label: t(`site.forIndustry.${slug}` as AppKey) })) },
    resources: {
      label: t('site.nav.resources'),
      items: [
        { to: '/check', label: t('site.nav.check') },
        { to: '/guide', label: t('site.nav.guide') },
        { to: '/calculator', label: t('site.nav.calculator') },
        { to: '/sample-report', label: t('site.nav.sampleReport') },
        { to: '/compare', label: t('site.nav.compare') },
        { to: '/help', label: t('site.nav.help') },
      ],
    },
    company: {
      label: t('site.footer.company'),
      items: [
        { to: '/security', label: t('site.nav.security') },
        { to: '/privacy', label: t('site.nav.privacy') },
        { to: '/terms', label: t('site.nav.terms') },
        { to: '/#pricing', label: t('site.nav.pricing') },
        { to: '/#demo', label: t('site.cta.demo') },
      ],
    },
  };
}

/** A click outside or Escape closes an open menu; moving to another page rebuilds the header. */
function useDismiss(ref: React.RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const close = (event: Event) => {
      const element = ref.current;
      if (!element?.open) return;
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !element.contains(event.target as Node)) {
        element.open = false;
        if (event instanceof KeyboardEvent) element.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', close); };
  }, [ref]);
}

function NavMenu({ group, wide }: { group: MenuGroup; wide?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useDismiss(ref);
  return <details ref={ref} className="site-menu">
    <summary>{group.label}</summary>
    <ul className={wide ? 'site-menu-panel site-menu-wide' : 'site-menu-panel'}>
      {group.items.map((item) => <li key={item.to}><Link to={item.to} onClick={() => { if (ref.current) ref.current.open = false; }}>{item.label}</Link></li>)}
    </ul>
  </details>;
}

function MobileMenu({ groups }: { groups: MenuGroup[] }) {
  const t = useAppT();
  const ref = useRef<HTMLDetailsElement>(null);
  useDismiss(ref);
  const { user, me } = useSession();
  const first = me?.workspaces[0];
  return <details ref={ref} className="site-burger">
    <summary aria-label={t('header.menu')}><span aria-hidden="true"/></summary>
    <nav className="site-burger-panel" aria-label={t('site.nav.label')} onClick={(event) => { if ((event.target as HTMLElement).closest('a') && ref.current) ref.current.open = false; }}>
      {groups.map((group) => <div key={group.label}>
        <p>{group.label}</p>
        <ul>{group.items.map((item) => <li key={item.to}><SiteLink to={item.to}>{item.label}</SiteLink></li>)}</ul>
      </div>)}
      <div className="site-burger-account">
        {user && first ? <Link className="button-link" to={homeOf(first.org.id, first.member.role)}>{t('site.cta.open')}</Link>
          : <Link className="button-link quiet" to="/w">{user ? t('picker.title') : t('site.cta.signIn')}</Link>}
      </div>
    </nav>
  </details>;
}

export function SiteHeader() {
  const t = useAppT();
  const { user, me } = useSession();
  const groups = useGroups();
  const first = me?.workspaces[0];
  return <header className="site-header">
    <div className="site-header-inner">
      <Link to="/" className="site-brand" aria-label={t('site.brandAria')}><span className="service-brand-dot" aria-hidden="true"/>Schood<span>{t('app.name')}</span></Link>
      <nav className="site-nav" aria-label={t('site.nav.label')}>
        <NavMenu group={groups.solutions}/>
        <NavMenu group={groups.industries} wide/>
        <Link to="/check">{t('site.nav.check')}</Link>
        <Link to="/guide">{t('site.nav.guide')}</Link>
        <NavMenu group={groups.resources}/>
        <SiteLink to="/#pricing">{t('site.nav.pricing')}</SiteLink>
      </nav>
      <div className="site-header-actions">
        <LocaleSwitcher label={t('locale.label')}/>
        {me?.staff && <Link className="button-link quiet site-hide-md" to="/staff">{t('site.cta.staff')}</Link>}
        {user ? (first ? <Link className="button-link site-hide-sm" to={homeOf(first.org.id, first.member.role)}>{t('site.cta.open')}</Link> : <Link className="button-link quiet site-hide-sm" to="/w">{t('picker.title')}</Link>)
          : <Link className="button-link quiet site-hide-sm" to="/w">{t('site.cta.signIn')}</Link>}
        <MobileMenu groups={[groups.solutions, groups.industries, groups.resources]}/>
      </div>
    </div>
  </header>;
}

export function SiteFooter() {
  const t = useAppT();
  const groups = useGroups();
  return <footer className="site-footer">
    <div className="site-footer-about">
      <strong>Schood · {t('app.name')}</strong>
      <p>{t('app.footer')}</p>
      <p className="site-footer-links">
        <a href="https://schood.online">schood.online</a>
        <Link to="/w">{t('site.cta.signIn')}</Link>
      </p>
    </div>
    {[groups.solutions, groups.industries, groups.resources, groups.company].map((group) => <nav key={group.label} aria-label={group.label}>
      <h2>{group.label}</h2>
      <ul>{group.items.map((item) => <li key={item.to}><SiteLink to={item.to}>{item.label}</SiteLink></li>)}</ul>
    </nav>)}
  </footer>;
}

/** Keeps the address in step with the language menu when the page was opened with ?lang=. */
function useLangInAddress() {
  const { locale } = useI18n();
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (!query.has('lang') || query.get('lang') === locale) return;
    query.set('lang', locale);
    history.replaceState(null, '', `${location.pathname}?${query}${location.hash}`);
  }, [locale]);
}

/** Header, footer and tags around a page. Pass `seo` for its title and description. */
export function SiteFrame({ seo, children }: { seo: Seo; children: ReactNode }) {
  const t = useAppT();
  useSeo(seo);
  useLangInAddress();
  useEffect(() => { captureAttribution(); }, []);
  return <div className="site">
    <a className="skip-link" href="#workspace-main">{t('header.skip')}</a>
    <SiteHeader/>
    <main id="workspace-main" tabIndex={-1}>{children}</main>
    <SiteFooter/>
  </div>;
}

/** A trail back up; the last crumb is the page itself. */
export function Crumbs({ items }: { items: { to?: string; label: string }[] }) {
  const t = useAppT();
  return <nav className="site-crumbs" aria-label={t('site.crumbs')}>
    <ol>{items.map((item) => <li key={item.label}>{item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</li>)}</ol>
  </nav>;
}
