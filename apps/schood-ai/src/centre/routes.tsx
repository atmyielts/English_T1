import { lazy, type ComponentType } from 'react';
import {
  BarChart3, BookMarked, ClipboardCheck, Eye, GraduationCap, HandCoins, KeyRound, Layers, LibraryBig, LayoutDashboard, Megaphone, MessagesSquare,
  Newspaper, Palette, School, Settings2, Sparkles, Users, UsersRound,
} from 'lucide-react';
import { PLACEMENT_KIND, placementMarkdown, type PlacementTest } from '../../../../packages/ai-core/src/materials/centre-placement-markdown.ts';
import { registerMaterialKind, type AreaNavItem, type AreaRoute, type HomeCard } from '../core/index.ts';
import { CentreHomeCard, SetupHomeCard, StudentHomeCard, TeacherHomeCard } from './cards.tsx';

// Centres (T7, T8, C1–C16): the centre admin for owners and office admins, the
// teacher's class assistant, and the branded Student Assistant. Screens load on
// demand. See ../CONTRACT.md.

const page = <K extends string>(load: () => Promise<Record<K, ComponentType<never>>>, name: K) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType<{ params: Record<string, string> }> }));
const setup = () => import('./pages/setup.tsx'), teach = () => import('./pages/teach.tsx'), admin = () => import('./pages/admin.tsx');
const placement = () => import('./pages/placement.tsx'), curriculum = () => import('./pages/curriculum.tsx'), business = () => import('./pages/business.tsx');

registerMaterialKind<PlacementTest>({ kind: PLACEMENT_KIND, label: 'centre.kind.placement', icon: ClipboardCheck, toMarkdown: placementMarkdown, editing: 'readonly', editorPath: (id) => `/centre/placement?test=${id}` });

const CENTRE = ['centre'] as const, TEACHER = ['teacher'] as const, LEARNER = ['learner'] as const;
export const routes: AreaRoute[] = [
  { path: '/centre/new', component: page(setup, 'SetupPage'), title: 'centre.setup.title' },
  { path: '/join', component: page(setup, 'JoinPage'), title: 'centre.join.title' },
  { path: '/centre', component: page(() => import('./pages/overview.tsx'), 'OverviewPage'), title: 'centre.nav.overview', audiences: [...CENTRE], feature: 'C1' },
  { path: '/centre/people', component: page(() => import('./pages/people.tsx'), 'PeoplePage'), title: 'centre.nav.people', audiences: [...CENTRE], feature: 'C7' },
  { path: '/centre/groups', component: page(() => import('./pages/groups.tsx'), 'GroupsPage'), title: 'centre.nav.groups', audiences: ['centre', 'teacher'], feature: 'C2' },
  { path: '/centre/style', component: page(() => import('./pages/style.tsx'), 'StylePage'), title: 'centre.nav.style', audiences: [...CENTRE], feature: 'C1' },
  { path: '/centre/admin', component: page(admin, 'AdminPage'), title: 'centre.nav.admin', audiences: [...CENTRE], feature: 'C7' },
  { path: '/centre/keys', component: page(admin, 'ByokPage'), title: 'centre.nav.keys', audiences: [...CENTRE], feature: 'C15' },
  { path: '/centre/office', component: page(() => import('./pages/office.tsx'), 'OfficePage'), title: 'centre.nav.office', audiences: [...CENTRE], feature: 'C3' },
  { path: '/centre/admissions', component: page(() => import('./pages/admissions.tsx'), 'AdmissionsPage'), title: 'centre.nav.admissions', audiences: [...CENTRE], feature: 'C8' },
  { path: '/centre/marketing', component: page(() => import('./pages/marketing.tsx'), 'MarketingPage'), title: 'centre.nav.marketing', audiences: [...CENTRE], feature: 'C4' },
  { path: '/centre/placement', component: page(placement, 'PlacementPage'), title: 'centre.nav.placement', audiences: ['centre', 'teacher'], feature: 'C5' },
  { path: '/placement/:id', component: page(placement, 'TakePlacementPage'), title: 'centre.take.title' },
  { path: '/centre/curriculum', component: page(curriculum, 'CurriculumPage'), title: 'centre.nav.curriculum', audiences: ['centre', 'teacher'], feature: 'C12' },
  { path: '/centre/curriculum/:id', component: page(curriculum, 'CurriculumDetailPage'), title: 'centre.nav.curriculum', audiences: ['centre', 'teacher'], feature: 'C12' },
  { path: '/centre/knowledge', component: page(() => import('./pages/knowledge.tsx'), 'KnowledgePage'), title: 'centre.nav.knowledge', audiences: ['centre', 'teacher'], feature: 'C13' },
  { path: '/centre/observations', component: page(() => import('./pages/observations.tsx'), 'ObservationsPage'), title: 'centre.nav.observations', audiences: ['centre', 'teacher'], feature: 'C16' },
  { path: '/centre/insights', component: page(business, 'InsightsPage'), title: 'centre.nav.insights', audiences: ['centre', 'teacher'], feature: 'C6' },
  { path: '/centre/brief', component: page(business, 'BriefPage'), title: 'centre.nav.brief', audiences: [...CENTRE], feature: 'C10' },
  { path: '/centre/resell', component: page(business, 'ResellPage'), title: 'centre.nav.resell', audiences: [...CENTRE], feature: 'C9' },
  { path: '/teach/classes', component: page(teach, 'ClassesPage'), title: 'centre.nav.classes', audiences: ['teacher', 'centre'], feature: 'T7' },
  { path: '/my-centre', component: page(teach, 'MyCentrePage'), title: 'centre.nav.myCentre', audiences: [...LEARNER], feature: 'C2' },
];

export const nav: AreaNavItem[] = [
  { id: 'centre-overview', path: '/centre', label: 'centre.nav.overview', icon: LayoutDashboard, audiences: [...CENTRE], feature: 'C1' },
  { id: 'centre-people', path: '/centre/people', label: 'centre.nav.people', icon: Users, audiences: [...CENTRE], feature: 'C7' },
  { id: 'centre-groups', path: '/centre/groups', label: 'centre.nav.groups', icon: UsersRound, audiences: [...CENTRE], feature: 'C2' },
  { id: 'centre-office', path: '/centre/office', label: 'centre.nav.office', icon: MessagesSquare, audiences: [...CENTRE], feature: 'C3' },
  { id: 'centre-admissions', path: '/centre/admissions', label: 'centre.nav.admissions', icon: Sparkles, audiences: [...CENTRE], feature: 'C8' },
  { id: 'centre-marketing', path: '/centre/marketing', label: 'centre.nav.marketing', icon: Megaphone, audiences: [...CENTRE], feature: 'C4' },
  { id: 'centre-placement', path: '/centre/placement', label: 'centre.nav.placement', icon: ClipboardCheck, audiences: [...CENTRE], feature: 'C5' },
  { id: 'centre-curriculum', path: '/centre/curriculum', label: 'centre.nav.curriculum', icon: Layers, audiences: [...CENTRE], feature: 'C12' },
  { id: 'centre-knowledge', path: '/centre/knowledge', label: 'centre.nav.knowledge', icon: LibraryBig, audiences: [...CENTRE], feature: 'C13' },
  { id: 'centre-observations', path: '/centre/observations', label: 'centre.nav.observations', icon: Eye, audiences: [...CENTRE], feature: 'C16' },
  { id: 'centre-insights', path: '/centre/insights', label: 'centre.nav.insights', icon: BarChart3, audiences: [...CENTRE], feature: 'C6' },
  { id: 'centre-brief', path: '/centre/brief', label: 'centre.nav.brief', icon: Newspaper, audiences: [...CENTRE], feature: 'C10' },
  { id: 'centre-resell', path: '/centre/resell', label: 'centre.nav.resell', icon: HandCoins, audiences: [...CENTRE], feature: 'C9' },
  { id: 'centre-style', path: '/centre/style', label: 'centre.nav.style', icon: Palette, audiences: [...CENTRE], feature: 'C1' },
  { id: 'centre-admin', path: '/centre/admin', label: 'centre.nav.admin', icon: Settings2, audiences: [...CENTRE], feature: 'C7' },
  { id: 'centre-keys', path: '/centre/keys', label: 'centre.nav.keys', icon: KeyRound, audiences: [...CENTRE], feature: 'C15' },
  { id: 'teach-classes', path: '/teach/classes', label: 'centre.nav.classes', icon: School, audiences: [...TEACHER], feature: 'T7', group: 'teacher' },
  { id: 'teach-groups', path: '/centre/groups', label: 'centre.nav.groups', icon: UsersRound, audiences: [...TEACHER], feature: 'C2', group: 'teacher' },
  { id: 'teach-placement', path: '/centre/placement', label: 'centre.nav.placement', icon: ClipboardCheck, audiences: [...TEACHER], feature: 'C5', group: 'teacher' },
  { id: 'teach-curriculum', path: '/centre/curriculum', label: 'centre.nav.curriculum', icon: Layers, audiences: [...TEACHER], feature: 'C12', group: 'teacher' },
  { id: 'teach-knowledge', path: '/centre/knowledge', label: 'centre.nav.knowledge', icon: BookMarked, audiences: [...TEACHER], feature: 'C13', group: 'teacher' },
  { id: 'teach-observations', path: '/centre/observations', label: 'centre.nav.observations', icon: Eye, audiences: [...TEACHER], feature: 'C16', group: 'teacher' },
  { id: 'teach-insights', path: '/centre/insights', label: 'centre.nav.insights', icon: BarChart3, audiences: [...TEACHER], feature: 'C6', group: 'teacher' },
  { id: 'my-centre', path: '/my-centre', label: 'centre.nav.myCentre', icon: GraduationCap, audiences: [...LEARNER], feature: 'C2', group: 'learner' },
];

export const homeCards: HomeCard[] = [
  { id: 'centre-setup', audiences: ['learner', 'teacher', 'parent'], render: (me) => <SetupHomeCard me={me}/> },
  { id: 'centre-today', audiences: [...CENTRE], render: (me) => <CentreHomeCard me={me}/> },
  { id: 'centre-teacher', audiences: [...TEACHER], render: (me) => <TeacherHomeCard me={me}/> },
  { id: 'centre-student', audiences: [...LEARNER], render: (me) => <StudentHomeCard me={me}/> },
];
