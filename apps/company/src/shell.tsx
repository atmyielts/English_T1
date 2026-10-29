// The app frame: finds the page for the path, checks sign-in and roles, loads the
// open workspace, and draws the header and the role-aware sidebar.
import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import { configured } from '../../../packages/assessment-web/src/client';
import { ServiceHeader } from '../../../packages/service-design/src/ServiceHeader';
import { WorkspaceNavigation, type WorkspaceNavSection } from '../../../packages/service-design/src/WorkspaceNavigation';
import { LocaleSwitcher } from '../../../packages/service-i18n/src/i18n.tsx';
import { api, type Workspace } from './api.ts';
import { allRoutes } from './areas/index.ts';
import { ConsentBanner, homeOf, NotFound, SignIn } from './areas/core/pages.tsx';
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
  const sections: WorkspaceNavSection[] = NAV_SECTIONS.map((section) => ({
    id: section,
    label: t(`nav.section.${section}` as AppKey),
    items: allRoutes
      .filter((candidate) => candidate.access === 'org' && candidate.nav?.section === section && allowed(candidate))
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
      <ConsentBanner/>
      {allowed(route) ? route.render(params) : <p className="error" role="alert">{t('error.forbidden')}</p>}
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
  if (route.access === 'public') return route.bare ? <>{route.render(params)}</> : <Chrome>{route.render(params)}</Chrome>;
  if (user === undefined) return <Chrome><p role="status">{t('app.loading')}</p></Chrome>;
  if (!user) return <SignIn/>;
  if (error && !me) return <Chrome><p className="error" role="alert">{problem(error)}</p></Chrome>;
  if (!me) return <Chrome><p role="status">{t('app.loading')}</p></Chrome>;
  if (route.access === 'staff' && !me.staff) return <Chrome><NotFound/></Chrome>;
  if (route.access === 'org') return <WorkspacePage key={params.org} orgId={params.org} route={route} params={params}/>;
  return <Chrome>{route.render(params)}</Chrome>;
}
