import React, { lazy, Suspense, useEffect, type ComponentType } from 'react';
import * as centre from './centre/routes.tsx';
import * as coach from './coach/routes.tsx';
import type { AreaRegistry, AreaRoute, Audience, HomeCard } from './core/areas.ts';
import { useSession } from './core/auth.tsx';
import { useT } from './core/i18n/index.ts';
import { AppShell, CORE_NAV, PublicShell, type NavEntry } from './core/layout.tsx';
import { namedIcon } from './core/lazy.tsx';
import { HomePage } from './core/pages/Home.tsx';
import { matchPath, useLocation } from './core/router.tsx';
import { ApiErrorState, LoadingState, Paywall, PlanGate } from './core/states.tsx';
import type { WorkspaceView } from './core/types.ts';
import { Button, Card } from './core/ui.tsx';
import { useWorkspace } from './core/workspace.tsx';
import * as engage from './engage/routes.tsx';
import * as learner from './learner/routes.tsx';
import * as teacher from './teacher/routes.tsx';

// Routes, navigation and home cards from every area, merged. Area routes are
// matched before core ones, so an area can take over a deep link such as /tutor.
// Pages load on demand so a learner on a weak connection downloads little up front.

const page = <K extends string>(load: () => Promise<Record<K, ComponentType<never>>>, name: K) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType<{ params: Record<string, string> }> }));
const account = () => import('./core/pages/Account.tsx'), catalog = () => import('./core/pages/Catalog.tsx');
const AssistantPage = page(() => import('./core/pages/Assistant.tsx'), 'AssistantPage');
const HistoryPage = page(account, 'HistoryPage'), CreditsPage = page(account, 'CreditsPage'), ApprovalsPage = page(account, 'ApprovalsPage');
const SettingsPage = page(account, 'SettingsPage'), NotFoundPage = page(account, 'NotFoundPage');
const ExamplesPage = page(catalog, 'ExamplesPage'), LandingPage = page(catalog, 'LandingPage'), PlansPage = page(catalog, 'PlansPage');
const AdminPage = page(() => import('./core/admin/AdminConsole.tsx'), 'AdminConsole');
const AssistantsPage = page(() => import('./core/pages/Assistants.tsx'), 'AssistantsPage');
const library = () => import('./core/library/pages.tsx');
const LibraryPage = page(library, 'LibraryPage'), LibraryPageEditor = page(library, 'LibraryPageEditor'), LibraryPrintPage = page(library, 'LibraryPrintPage');

const AREAS: AreaRegistry[] = [learner, teacher, centre, coach, engage];
const areaRoutes: AreaRoute[] = AREAS.flatMap((area) => area.routes);
// Icons named by string load from the area's own icons module after the first paint.
const areaNav = AREAS.flatMap((area) => area.nav.map((item) => ({ ...item, icon: typeof item.icon === 'string' ? namedIcon(area.icons, item.icon) : item.icon })));
const homeCards: HomeCard[] = AREAS.flatMap((area) => area.homeCards);

interface CoreRoute { path: string; title: string; component: ComponentType<{ params: Record<string, string> }>; public?: boolean; audiences?: Audience[] }
const CORE_ROUTES: CoreRoute[] = [
  { path: '/', title: 'nav.home', component: () => <HomePage cards={homeCards}/> },
  { path: '/assistant', title: 'nav.assistant', component: AssistantPage },
  // Deep links from the other Schood apps, until the learner area registers its own pages.
  ...['/tutor', '/explain', '/write', '/speak'].map((path) => ({ path, title: 'nav.assistant', component: AssistantPage })),
  { path: '/history', title: 'nav.history', component: HistoryPage },
  { path: '/credits', title: 'nav.credits', component: CreditsPage },
  { path: '/approvals', title: 'nav.approvals', component: ApprovalsPage },
  { path: '/library', title: 'nav.library', component: LibraryPage, audiences: ['teacher', 'centre'] },
  { path: '/library/:id', title: 'nav.library', component: LibraryPageEditor, audiences: ['teacher', 'centre'] },
  { path: '/library/:id/print', title: 'nav.library', component: LibraryPrintPage, audiences: ['teacher', 'centre'] },
  { path: '/settings', title: 'nav.settings', component: SettingsPage },
  { path: '/settings/assistants', title: 'assistants.title', component: AssistantsPage },
  { path: '/admin', title: 'nav.admin', component: AdminPage },
  { path: '/plans', title: 'nav.plans', component: PlansPage, public: true },
  { path: '/examples', title: 'nav.examples', component: ExamplesPage, public: true },
];

function resolve(path: string): { route: (AreaRoute | CoreRoute) | null; params: Record<string, string> } {
  for (const route of [...areaRoutes, ...CORE_ROUTES]) {
    const params = matchPath(route.path, path);
    if (params) return { route, params };
  }
  return { route: null, params: {} };
}

export function App() {
  const t = useT(), session = useSession(), workspace = useWorkspace(), { path } = useLocation();
  const { route, params } = resolve(path);
  useEffect(() => { document.title = `${route ? t(route.title) : t('notFound.title')} · Schood AI`; }, [route, t]);

  if (session.status === 'unconfigured') return <PublicShell><Card><h1 className="m-0 font-display text-2xl font-bold">{t('app.title')}</h1><p className="mb-0 mt-2 text-sm text-gray-700">{t('app.notConfigured')}</p></Card></PublicShell>;
  if (session.status === 'loading') return <PublicShell><LoadingState label={t('app.loading')}/></PublicShell>;
  const loading = <LoadingState label={t('app.loading')}/>;
  if (session.status === 'signed_out') {
    // Every page that is not public starts at the landing page with a sign-in that returns here.
    return <PublicShell><Suspense fallback={loading}>{route && 'public' in route && route.public ? <route.component params={params}/> : <LandingPage params={{}}/>}</Suspense></PublicShell>;
  }
  if (!workspace.me) {
    if (workspace.status === 'error') return <PublicShell><ApiErrorState error={workspace.error} onRetry={() => void workspace.refresh()}/></PublicShell>;
    return <PublicShell><LoadingState label={t('app.loading')}/></PublicShell>;
  }

  const audience = workspace.audience;
  const nav: NavEntry[] = [
    ...CORE_NAV.filter((item) => (!item.audiences || item.audiences.includes(audience)) && (!item.adminOnly || workspace.me!.user.is_schood_admin)),
    ...areaNav.filter((item) => item.audiences.includes(audience)).map((item) => ({ id: item.id, path: item.path, label: item.label, icon: item.icon, group: item.group ?? (audience === 'centre' ? 'centre' : audience) })),
  ];
  let content: React.ReactNode;
  if (!route) content = <NotFoundPage params={{}}/>;
  else if (route.audiences && !route.audiences.includes(audience)) content = <WrongPlace wanted={route.audiences}/>;
  else if ('feature' in route && route.feature) content = <PlanGate feature={route.feature}><route.component params={params}/></PlanGate>;
  else content = <route.component params={params}/>;
  const blocked = !workspace.me.plan.plans.length && !workspace.me.plan.beta && !workspace.me.plan.features.length && path === '/assistant';
  return <AppShell nav={nav} focusMode={!!route && 'focus' in route && !!route.focus}>
    <Suspense fallback={loading}>{blocked ? <><h1 className="m-0 mb-4 font-display text-3xl font-bold">{t('chat.title')}</h1><Paywall plans={['plus', 'family', 'teacher']}/></> : content}</Suspense>
  </AppShell>;
}

/** The audiences a centre workspace gives a role (the centre side of audiencesFor). */
const centreAudiences = (ws: WorkspaceView): Audience[] =>
  ws.kind !== 'centre' ? [] : ws.role === 'student' ? ['learner'] : ws.role === 'parent' ? ['parent'] : ws.role === 'teacher' ? ['teacher'] : ['centre', 'teacher'];

/**
 * A page for another audience (a centre owner opening /centre/brief from the Monday brief
 * while their own workspace is open): switch to the audience or the one workspace where it
 * belongs, offer a choice when there are several, and say not found only when there is none.
 */
function WrongPlace({ wanted }: { wanted: Audience[] }) {
  const t = useT(), workspace = useWorkspace(), me = workspace.me!;
  const here = workspace.audiences.find((audience) => wanted.includes(audience)) ?? null;
  const places = here ? [] : me.workspaces.filter((ws) => ws.id !== me.workspace.id && ws.status === 'active' && centreAudiences(ws).some((audience) => wanted.includes(audience)));
  const only = places.length === 1 ? places[0].id : null;
  useEffect(() => {
    if (here) workspace.setAudience(here);
    else if (only) workspace.setWorkspace(only);
  }, [here, only]);
  if (here || only) return <LoadingState label={t('app.loading')}/>;
  if (!places.length) return <NotFoundPage params={{}}/>;
  return <Card>
    <h1 className="m-0 font-display text-2xl font-bold">{t('place.choose.title')}</h1>
    <p className="mb-4 mt-2 text-sm text-gray-700">{t('place.choose.lead')}</p>
    <div className="flex flex-wrap gap-2">{places.map((ws) => <Button key={ws.id} variant="secondary" onClick={() => workspace.setWorkspace(ws.id)}>{ws.name}</Button>)}</div>
  </Card>;
}
