// The app frame: finds the page for the path, checks sign-in and roles, loads the
// open workspace, and draws the header and the role-aware sidebar.
import React, { Component, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { configured } from '../../../packages/assessment-web/src/client';
import { ServiceHeader } from '../../../packages/service-design/src/ServiceHeader';
import { WorkspaceNavigation, type WorkspaceNavSection } from '../../../packages/service-design/src/WorkspaceNavigation';
import { LocaleSwitcher } from '../../../packages/service-i18n/src/i18n.tsx';
import { api, type Workspace } from './api.ts';
import { allRoutes } from './areas/index.ts';
import { ConsentBanner, homeOf, NotFound, SignIn } from './areas/core/pages.tsx';
import { HeaderBell } from './areas/connect/HeaderBell.tsx';
import { CommandPalette } from './areas/people/CommandPalette.tsx';
import { NAV_SECTIONS, type AreaRoute } from './areas/types.ts';
import { useAppT, useErrorText, type AppKey } from './i18n/index.ts';
import { matchPath, navigate, useLocation } from './router.tsx';
import { useSession, WorkspaceContext, type WorkspaceState } from './session.tsx';

function find(path: string): { route: AreaRoute; params: Record<string, string> } | null {
  for (const route of allRoutes) {
    const params = matchPath(route.path, path);
    if (params) return { route, params };
  }
  return null;
}

const STALE_RELOAD = 'company-stale-reload';
/** True when a page's code can't be fetched: usually an open tab after a new deploy. */
const isStaleChunk = (error: unknown) => /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(String((error as Error)?.message ?? error));

function Crashed() {
  const t = useAppT();
  return <section className="company-narrow" role="alert">
    <h1>{t('app.crashed')}</h1>
    <p>{t('app.crashedLead')}</p>
    <button onClick={() => location.reload()}>{t('app.reload')}</button>
  </section>;
}

/** One failed page shows a way out instead of blanking the app; after a deploy it reloads once to fetch the new code. */
class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
    if (!isStaleChunk(error)) return;
    try {
      if (sessionStorage.getItem(STALE_RELOAD) === location.pathname) return;
      sessionStorage.setItem(STALE_RELOAD, location.pathname);
    } catch {
      return; // Without storage we can't tell whether we already tried, so don't loop.
    }
    location.reload();
  }
  render() {
    return this.state.failed ? <Crashed/> : this.props.children;
  }
}

/** Renders a page, showing a loading line while its code arrives. */
function Page({ route, params }: { route: AreaRoute; params: Record<string, string> }) {
  const t = useAppT();
  const { path } = useLocation();
  return <PageBoundary key={path}><Suspense fallback={<p role="status">{t('app.loading')}</p>}>{route.render(params)}</Suspense></PageBoundary>;
}

function Chrome({ children, nav }: { children: ReactNode; nav?: ReactNode }) {
  const t = useAppT();
  const { user, me, signOut } = useSession();
  const { path } = useLocation();
  const current = path.match(/^\/w\/([^/]+)/)?.[1];
  return <div className="workspace company">
    <ServiceHeader service={t('app.name')} labels={{ skip: t('header.skip'), home: t('header.home'), menu: t('header.menu'), workspace: t('header.workspace', { service: t('app.name') }) }}>
      {me && me.workspaces.length > 1 && <label className="tenant">
        <span className="visually-hidden">{t('header.switch')}</span>
        <select aria-label={t('header.switch')} value={current ?? ''} onChange={(event) => {
          const chosen = me.workspaces.find((entry) => entry.org.id === event.target.value);
          if (chosen) navigate(homeOf(chosen.org.id, chosen.member.role));
        }}>
          {!current && <option value="">{t('header.switch')}</option>}
          {me.workspaces.map(({ org }) => <option key={org.id} value={org.id}>{org.name}</option>)}
        </select>
      </label>}
      {current && user && <><CommandPalette orgId={current}/><HeaderBell orgId={current}/></>}
      {user ? <button className="quiet" onClick={() => void signOut().then(() => navigate('/'))}>{t('header.signOut')}</button>
        : user === '' && <button className="quiet" onClick={() => navigate('/w')}>{t('header.signIn')}</button>}
      <LocaleSwitcher label={t('locale.label')}/>
    </ServiceHeader>
    {nav ? <div className="workspace-layout">{nav}<main id="workspace-main" tabIndex={-1}>{children}</main></div>
      : <main id="workspace-main" tabIndex={-1} className="company-main">{children}</main>}
    <footer>{t('app.footer')}</footer>
  </div>;
}

function WorkspacePage({ orgId, route, params }: { orgId: string; route: AreaRoute; params: Record<string, string> }) {
  const t = useAppT(), problem = useErrorText();
  const { me } = useSession();
  const { path } = useLocation();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setWorkspace(await api<Workspace>(`orgs/${orgId}`));
      setError('');
    } catch (cause) {
      setError(problem(cause));
    }
  }, [orgId]);
  useEffect(() => { setWorkspace(null); void load(); }, [load]);

  if (error) return <Chrome><p className="error" role="alert">{error}</p></Chrome>;
  if (!workspace || !me) return <Chrome><p role="status">{t('app.loading')}</p></Chrome>;
  const staff = me.staff;
  const role = workspace.member?.role ?? (staff ? 'owner' : 'employee');
  // Employees open on My English rather than the company overview.
  if (role === 'employee' && path === `/w/${orgId}`) {
    queueMicrotask(() => navigate(`/w/${orgId}/me`, { replace: true }));
    return null;
  }
  const allowed = (candidate: AreaRoute) => staff || !candidate.roles || candidate.roles.includes(role);
  const state: WorkspaceState = {
    ...workspace, refresh: load, staff,
    hr: staff || role === 'owner' || role === 'admin',
    lead: staff || role !== 'employee',
  };
  // A page listed in two sections for different roles (e.g. Challenges under My English
  // for employees, under Insights for HR) shows once: preferably where the route names
  // the person's own role, otherwise the first entry they may open (staff).
  const navRoutes = allRoutes.filter((candidate) => candidate.access === 'org' && candidate.nav && allowed(candidate));
  const chosen = new Map<string, AreaRoute>();
  for (const candidate of navRoutes) {
    const current = chosen.get(candidate.path);
    const names = (entry: AreaRoute) => !entry.roles || entry.roles.includes(role);
    if (!current || (!names(current) && names(candidate))) chosen.set(candidate.path, candidate);
  }
  const sections: WorkspaceNavSection[] = NAV_SECTIONS.map((section) => ({
    id: section,
    label: t(`nav.section.${section}` as AppKey),
    items: [...chosen.values()]
      .filter((candidate) => candidate.nav!.section === section)
      .sort((a, b) => a.nav!.order - b.nav!.order)
      .map((candidate) => {
        const to = candidate.path.replace(':org', orgId);
        return { id: candidate.path, label: t(candidate.nav!.label), active: path === to || (to !== `/w/${orgId}` && path.startsWith(`${to}/`)), onClick: () => navigate(to) };
      }),
  }));
  return <WorkspaceContext.Provider value={state}>
    <Chrome nav={<WorkspaceNavigation label={t('nav.label')} menuLabel={t('nav.menu')} sections={sections}/>}>
      <p className="company-org-name">{workspace.org.name} · {t(`status.${workspace.org.status}` as AppKey)}</p>
      {workspace.org.status === 'suspended' && <p className="error" role="status">{t('org.suspended')}</p>}
      {workspace.org.status === 'active' && workspace.org.contract_ends_at && Date.parse(workspace.org.contract_ends_at) <= Date.now() && <p className="error" role="status">{t('org.contractEnded')}</p>}
      <ConsentBanner/>
      {allowed(route) ? <Page route={route} params={params}/> : <p className="error" role="alert">{t('error.forbidden')}</p>}
    </Chrome>
  </WorkspaceContext.Provider>;
}

export function App() {
  const t = useAppT(), problem = useErrorText();
  const { path } = useLocation();
  const { user, me, error } = useSession();
  if (!configured) return <main className="configuration"><h1>{t('app.title')}</h1><p>{t('app.notConfigured')}</p></main>;
  const found = find(path);
  if (!found) return <Chrome><NotFound/></Chrome>;
  const { route, params } = found;
  if (route.access === 'public') return route.bare ? <Page route={route} params={params}/> : <Chrome><Page route={route} params={params}/></Chrome>;
  if (user === undefined) return <Chrome><p role="status">{t('app.loading')}</p></Chrome>;
  if (!user) return <SignIn/>;
  if (error && !me) return <Chrome><p className="error" role="alert">{problem(error)}</p></Chrome>;
  if (!me) return <Chrome><p role="status">{t('app.loading')}</p></Chrome>;
  if (route.access === 'staff' && !me.staff) return <Chrome><NotFound/></Chrome>;
  if (route.access === 'org') return <WorkspacePage key={params.org} orgId={params.org} route={route} params={params}/>;
  return <Chrome><Page route={route} params={params}/></Chrome>;
}
