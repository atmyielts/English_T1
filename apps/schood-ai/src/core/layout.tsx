import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BookOpenCheck, ChevronDown, CircleCheck, Coins, FolderOpen, History, Home, Languages, LayoutGrid, Menu, MessageSquareText, Settings, ShieldCheck, X } from 'lucide-react';
import { LOCALE_NAMES, SUPPORTED_LOCALES, type Locale } from '../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';
import type { Audience, AreaNavItem } from './areas.ts';
import { signInUrl, useSession } from './auth.tsx';
import { useT } from './i18n/index.ts';
import { Link, useLocation } from './router.tsx';
import { CreditBalance } from './states.tsx';
import { BrandMark, Button, ButtonLink } from './ui.tsx';
import { useWorkspace } from './workspace.tsx';

// The app frame in the main platform's look: the cream pill header with the brand
// dot, the platform's language picker, a menu sheet on phones, grouped role-aware
// navigation, the workspace (with the centre's own logo and colour) and the footer.

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useI18n(), t = useT();
  return <label className={`inline-flex items-center ${className}`}>
    <span className="sr-only">{t('language.label')}</span>
    <span className="relative inline-flex items-center">
      <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label={t('language.label')}
        className={`h-10 w-[124px] appearance-none rounded-full border border-navy-line bg-white/90 pl-3 pr-14 text-xs font-semibold text-gray-800 ${focus}`}>
        {SUPPORTED_LOCALES.map((code) => <option key={code} value={code} lang={code}>{LOCALE_NAMES[code]}</option>)}
      </select>
      <Languages size={12} className="pointer-events-none absolute right-8 text-gray-500" aria-hidden="true"/>
      <ChevronDown size={12} className="pointer-events-none absolute right-3 text-gray-500" aria-hidden="true"/>
    </span>
  </label>;
}

function Brand() {
  const t = useT();
  return <Link to="/" className={`flex shrink-0 items-center gap-2 font-semibold tracking-tight text-gray-900 no-underline ${focus} rounded-full`}>
    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-navy" aria-hidden="true"/>
    <span>Schood <span className="ai-wordmark">AI</span></span>
    <span className="sr-only">{t('header.home')}</span>
  </Link>;
}

/** The pill header. `menu` is what the phone menu sheet shows (navigation, actions). */
export function SiteHeader({ center, actions, menu }: { center?: ReactNode; actions?: ReactNode; menu?: ReactNode }) {
  const t = useT(), { path } = useLocation();
  const [open, setOpen] = useState(false), id = useId(), header = useRef<HTMLElement>(null), toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <header ref={header} className="relative z-20 px-4 pt-4 md:px-10 md:pt-6"
    onKeyDown={(event) => { if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus(); } }}>
    <a href="#main" className="skip-link">{t('header.skip')}</a>
    <div className="mx-auto max-w-6xl rounded-3xl border border-navy-line bg-cream-deep/80 px-4 py-3 backdrop-blur lg:rounded-full">
      <div className="flex items-center gap-3">
        <Brand/>
        <div className="hidden min-w-0 flex-1 lg:flex lg:justify-center">{center}</div>
        <div className="ml-auto hidden items-center gap-2 lg:flex">{actions}</div>
        <button ref={toggle} type="button" className={`ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-navy-line bg-white/70 lg:hidden ${focus}`}
          aria-expanded={open} aria-controls={id} aria-label={t(open ? 'header.menuClose' : 'header.menuOpen')} onClick={() => setOpen((value) => !value)}>
          {open ? <X size={22} aria-hidden="true"/> : <Menu size={22} aria-hidden="true"/>}
        </button>
      </div>
      <div id={id} hidden={!open} className="mt-3 space-y-3 rounded-2xl border border-navy-line bg-white/95 p-3 lg:hidden">
        {menu}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">{actions}</div>
      </div>
    </div>
  </header>;
}

export function Footer() {
  const t = useT();
  return <footer className="px-4 pb-10 md:px-10">
    <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 border-t border-gray-300/70 pt-6 text-sm text-gray-600 md:flex-row md:items-center">
      <p className="m-0 max-w-2xl text-xs leading-5">{t('app.footer')}</p>
      <a href="https://schood.online/contact" className="text-sm underline underline-offset-2">{t('app.footer.support')}</a>
    </div>
  </footer>;
}

function SignOut() {
  const t = useT(), session = useSession();
  return <Button variant="secondary" size="sm" className="h-10" onClick={() => void session.source?.signOut()}>{t('header.signOut')}</Button>;
}

/** Signed-out header actions. */
export function SignInActions() {
  const t = useT();
  return <>
    <ButtonLink href={signInUrl('signup')} variant="secondary" className="h-10 min-h-10">{t('header.signUp')}</ButtonLink>
    <ButtonLink href={signInUrl()} className="h-10 min-h-10">{t('header.signIn')}</ButtonLink>
    <LanguageSwitcher/>
  </>;
}

export function WorkspaceSwitcher() {
  const t = useT(), workspace = useWorkspace();
  const me = workspace.me;
  if (!me || me.workspaces.length < 2) return null;
  return <label className="inline-flex items-center">
    <span className="sr-only">{t('header.workspace')}</span>
    <span className="relative inline-flex items-center">
      <select value={me.workspace.id} onChange={(event) => workspace.setWorkspace(event.target.value)} aria-label={t('header.workspace')}
        className={`h-10 max-w-[13rem] appearance-none truncate rounded-full border border-navy-line bg-white/90 pl-3 pr-8 text-xs font-semibold text-gray-800 ${focus}`}>
        {me.workspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.kind === 'personal' ? t('header.personal') : ws.name}</option>)}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-3 text-gray-500" aria-hidden="true"/>
    </span>
  </label>;
}

export function AudienceSwitcher() {
  const t = useT(), workspace = useWorkspace();
  if (workspace.audiences.length < 2) return null;
  return <div role="radiogroup" aria-label={t('header.mode')} className="flex flex-wrap gap-1 rounded-full border border-navy-line bg-white/80 p-1">
    {workspace.audiences.map((audience) => <button key={audience} type="button" role="radio" aria-checked={workspace.audience === audience} onClick={() => workspace.setAudience(audience)}
      className={`min-h-9 flex-1 rounded-full px-3 text-xs font-semibold ${workspace.audience === audience ? 'bg-navy text-white' : 'text-gray-800 hover:bg-cream-soft'} ${focus}`}>{t(`audience.${audience}`)}</button>)}
  </div>;
}

export interface NavEntry { id: string; path: string; label: string; icon?: AreaNavItem['icon']; group: string }
export const CORE_NAV: (NavEntry & { audiences?: Audience[]; adminOnly?: boolean })[] = [
  { id: 'home', path: '/', label: 'nav.home', icon: Home, group: 'core' },
  { id: 'assistant', path: '/assistant', label: 'nav.assistant', icon: MessageSquareText, group: 'core' },
  { id: 'history', path: '/history', label: 'nav.history', icon: History, group: 'core' },
  { id: 'library', path: '/library', label: 'nav.library', icon: FolderOpen, group: 'core', audiences: ['teacher', 'centre'] },
  { id: 'approvals', path: '/approvals', label: 'nav.approvals', icon: CircleCheck, group: 'core', audiences: ['teacher', 'centre'] },
  { id: 'credits', path: '/credits', label: 'nav.credits', icon: Coins, group: 'core' },
  { id: 'examples', path: '/examples', label: 'nav.examples', icon: LayoutGrid, group: 'core' },
  { id: 'plans', path: '/plans', label: 'nav.plans', icon: BookOpenCheck, group: 'core' },
  { id: 'settings', path: '/settings', label: 'nav.settings', icon: Settings, group: 'core' },
  { id: 'admin', path: '/admin', label: 'nav.admin', icon: ShieldCheck, group: 'core', adminOnly: true },
];
const GROUP_ORDER = ['core', 'learner', 'parent', 'teacher', 'centre', 'coach'];

/** Grouped navigation for the current audience; locked area items still show (their page shows the plan gate). */
export function NavGroups({ items }: { items: NavEntry[] }) {
  const t = useT(), { path } = useLocation();
  const groups = GROUP_ORDER.map((group) => ({ group, entries: items.filter((item) => item.group === group) })).filter((entry) => entry.entries.length);
  return <nav aria-label={t('nav.label')} className="flex flex-col gap-5">
    {groups.map(({ group, entries }) => <div key={group}>
      <p className="m-0 mb-1 px-3 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-gray-600" id={`nav-${group}`}>{t(`nav.group.${group}`)}</p>
      <ul aria-labelledby={`nav-${group}`} className="m-0 grid list-none gap-0.5 p-0">
        {entries.map((item) => {
          const active = item.path === '/' ? path === '/' : path === item.path || path.startsWith(`${item.path}/`);
          const Icon = item.icon;
          return <li key={item.id}><Link to={item.path} aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-medium no-underline ${active ? 'bg-navy text-white' : 'text-gray-900 hover:bg-white/80'} ${focus}`}>
            {Icon && <Icon size={17} aria-hidden="true"/>}{t(item.label)}
          </Link></li>;
        })}
      </ul>
    </div>)}
  </nav>;
}

function WorkspaceCard() {
  const t = useT(), workspace = useWorkspace(), me = workspace.me;
  if (!me) return null;
  const ws = me.workspace;
  const name = ws.kind === 'personal' ? t('header.personal') : ws.name;
  return <div className="flex items-center gap-3 rounded-3xl border border-navy-line bg-white/80 p-3" style={ws.branding.primary_color ? { boxShadow: `inset 4px 0 0 ${ws.branding.primary_color}` } : undefined}>
    <BrandMark name={name} logo={ws.branding.logo_url} color={ws.branding.primary_color} size={36}/>
    <div className="min-w-0">
      <p className="m-0 truncate text-sm font-semibold text-gray-900">{name}</p>
      <p className="m-0 text-xs text-gray-600">{ws.kind === 'centre' ? t(`role.${ws.role}`) : t(`audience.${workspace.audience}`)}</p>
    </div>
  </div>;
}

/** The signed-in frame: header, sidebar navigation on wide screens, menu sheet on phones. */
export function AppShell({ nav, children, focusMode = false }: { nav: NavEntry[]; children: ReactNode; focusMode?: boolean }) {
  const actions = <><WorkspaceSwitcher/><CreditBalance compact/><LanguageSwitcher/><SignOut/></>;
  return <div className={`min-h-screen ${focusMode ? 'bg-navy' : 'bg-cream'}`}>
    <SiteHeader actions={actions} menu={<div className="flex flex-col gap-3"><WorkspaceCard/><AudienceSwitcher/><NavGroups items={nav}/></div>}/>
    <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 pt-6 md:px-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden lg:flex lg:flex-col lg:gap-4">
        <WorkspaceCard/>
        <AudienceSwitcher/>
        <NavGroups items={nav}/>
      </aside>
      <main id="main" tabIndex={-1} className="min-w-0 outline-none">{children}</main>
    </div>
    {!focusMode && <Footer/>}
  </div>;
}

/** Public pages (landing, plans, examples) for people who are not signed in. */
export function PublicShell({ children }: { children: ReactNode }) {
  const t = useT();
  const links = <nav aria-label={t('nav.label')} className="flex flex-wrap items-center gap-2">
    {[['/examples', 'nav.examples'], ['/plans', 'nav.plans']].map(([to, label]) => <Link key={to} to={to} className={`inline-flex h-10 items-center rounded-full border border-navy-line bg-white/70 px-3.5 text-sm font-medium text-gray-900 no-underline ${focus}`}>{t(label)}</Link>)}
  </nav>;
  return <div className="min-h-screen bg-cream">
    <SiteHeader center={links} actions={<SignInActions/>} menu={links}/>
    <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-16 pt-8 outline-none md:px-10">{children}</main>
    <Footer/>
  </div>;
}
