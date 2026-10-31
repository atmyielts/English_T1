import { lazy, type ComponentType } from 'react';
import { MATERIAL_KIND_CATALOG } from '../../../../packages/ai-core/src/materials/catalog.ts';
import type { Material } from '../../../../packages/ai-core/src/materials/mod.ts';
import { registerMaterialKind, type AreaNavItem, type AreaRoute, type HomeCard } from '../core/index.ts';
import { materialMarkdownLater } from './markdown.ts';

// Teachers (T1–T6, T9–T15): the Materials Studio and its review card, approved
// materials (library pages of the teacher kinds), print, Live Quiz, marking,
// feedback, channel autopilot, marketplace and brand kit. Pages, nav icons (by
// name) and home cards all load on demand, so this file is all the first download carries.

const page = <K extends string>(load: () => Promise<Record<K, ComponentType<never>>>, name: K) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType<{ params: Record<string, string> }> }));
const studio = () => import('./pages/Studio.tsx'), quizzes = () => import('./pages/Quizzes.tsx'), marking = () => import('./pages/Marking.tsx'), market = () => import('./pages/Market.tsx');

const Studio = page(studio, 'default'), Planner = page(studio, 'PlannerStudio'), Textbook = page(studio, 'TextbookStudio');
const MaterialJob = page(() => import('./pages/MaterialJob.tsx'), 'default');
const MaterialPage = page(() => import('./pages/MaterialPage.tsx'), 'default');
const PrintMaterial = page(() => import('./pages/PrintMaterial.tsx'), 'default');
const QuizHost = page(() => import('./pages/QuizHost.tsx'), 'default');
const Quizzes = page(quizzes, 'QuizzesPage'), QuizResults = page(quizzes, 'QuizResultsPage');
const Play = page(() => import('./pages/Play.tsx'), 'default');
const Handout = page(() => import('./pages/Handout.tsx'), 'default');
const Marking = page(marking, 'MarkingPage'), Batch = page(marking, 'BatchPage');
const Feedback = page(() => import('./pages/Feedback.tsx'), 'default');
const Channel = page(() => import('./pages/Channel.tsx'), 'default');
const Market = page(market, 'MarketPage'), Listing = page(market, 'ListingPage'), MyListings = page(market, 'MyListingsPage'), Moderation = page(market, 'ModerationPage');
const Brand = page(() => import('./pages/Brand.tsx'), 'default');

// Every teacher kind in the library: shown with the material renderer, edited in the Studio's own editor.
// Registration uses the plain catalog, so the material model and exam formats stay out of the first download.
const LibraryMaterial = lazy(() => import('./MaterialView.tsx'));
for (const kind of Object.keys(MATERIAL_KIND_CATALOG)) {
  registerMaterialKind<Material>({
    kind, label: `teacher.kind.${kind}`, toMarkdown: materialMarkdownLater,
    render: LibraryMaterial as unknown as ComponentType<{ material: Material; print: boolean }>, editing: 'readonly', editorPath: (id) => `/studio/page/${id}`,
  });
}

const TEACHERS: AreaRoute['audiences'] = ['teacher', 'centre'];
export const routes: AreaRoute[] = [
  { path: '/studio', component: Studio, title: 'teacher.nav.studio', audiences: TEACHERS, feature: 'T1' },
  { path: '/studio/plan', component: Planner, title: 'teacher.nav.planner', audiences: TEACHERS, feature: 'T5' },
  { path: '/studio/textbook', component: Textbook, title: 'teacher.nav.textbook', audiences: TEACHERS, feature: 'T9' },
  { path: '/studio/m/:id', component: MaterialJob, title: 'teacher.nav.studio', audiences: TEACHERS },
  { path: '/studio/page/:id', component: MaterialPage, title: 'teacher.nav.material', audiences: TEACHERS },
  { path: '/studio/page/:id/print', component: PrintMaterial, title: 'teacher.nav.print', audiences: TEACHERS },
  { path: '/studio/quiz/:id', component: QuizHost, title: 'teacher.nav.quiz', audiences: TEACHERS, focus: true },
  { path: '/studio/quizzes', component: Quizzes, title: 'teacher.nav.quiz', audiences: TEACHERS },
  { path: '/studio/quizzes/:id', component: QuizResults, title: 'teacher.nav.quiz', audiences: TEACHERS },
  { path: '/studio/marking', component: Marking, title: 'teacher.nav.marking', audiences: TEACHERS, feature: 'T3' },
  { path: '/studio/marking/:id', component: Batch, title: 'teacher.nav.marking', audiences: TEACHERS, feature: 'T3' },
  { path: '/studio/feedback', component: Feedback, title: 'teacher.nav.feedback', audiences: TEACHERS, feature: 'T4' },
  { path: '/studio/channel', component: Channel, title: 'teacher.nav.channel', audiences: TEACHERS, feature: 'T11' },
  { path: '/studio/market', component: Market, title: 'teacher.nav.market', audiences: TEACHERS },
  { path: '/studio/market/mine', component: MyListings, title: 'teacher.nav.market', audiences: TEACHERS },
  { path: '/studio/market/review', component: Moderation, title: 'teacher.nav.market', audiences: TEACHERS },
  { path: '/studio/market/:id', component: Listing, title: 'teacher.nav.market', audiences: TEACHERS },
  { path: '/studio/brand', component: Brand, title: 'teacher.nav.brand', audiences: TEACHERS, feature: 'T13' },
  // Open to anyone: a Live Quiz needs no account (signed in, the class results name you); a handout asks to sign in.
  { path: '/play', component: Play, title: 'teacher.nav.play', public: true },
  { path: '/handout/:token', component: Handout, title: 'teacher.handout.title', public: true },
];

export const icons = () => import('./icons.ts');
export const nav: AreaNavItem[] = [
  { id: 'studio', path: '/studio', label: 'teacher.nav.studio', icon: 'Wand2', audiences: ['teacher', 'centre'], feature: 'T1', group: 'teacher' },
  { id: 'planner', path: '/studio/plan', label: 'teacher.nav.planner', icon: 'LayoutList', audiences: ['teacher', 'centre'], feature: 'T5', group: 'teacher' },
  { id: 'marking', path: '/studio/marking', label: 'teacher.nav.marking', icon: 'ClipboardCheck', audiences: ['teacher', 'centre'], feature: 'T3', group: 'teacher' },
  { id: 'quiz', path: '/studio/quizzes', label: 'teacher.nav.quiz', icon: 'Gamepad2', audiences: ['teacher', 'centre'], feature: 'T10', group: 'teacher' },
  { id: 'feedback', path: '/studio/feedback', label: 'teacher.nav.feedback', icon: 'MessageSquareText', audiences: ['teacher', 'centre'], feature: 'T4', group: 'teacher' },
  { id: 'channel', path: '/studio/channel', label: 'teacher.nav.channel', icon: 'Send', audiences: ['teacher', 'centre'], feature: 'T11', group: 'teacher' },
  { id: 'market', path: '/studio/market', label: 'teacher.nav.market', icon: 'Store', audiences: ['teacher', 'centre'], group: 'teacher' },
  { id: 'brand', path: '/studio/brand', label: 'teacher.nav.brand', icon: 'Megaphone', audiences: ['teacher'], feature: 'T13', group: 'teacher' },
  { id: 'play', path: '/play', label: 'teacher.nav.play', icon: 'Gamepad2', audiences: ['learner'], group: 'learner' },
];

export const homeCards: HomeCard[] = [
  { id: 'studio', audiences: ['teacher', 'centre'], feature: 'T1', component: () => import('./HomeCards.tsx').then((module) => ({ default: module.StudioCard })) },
  { id: 'play', audiences: ['learner'], component: () => import('./HomeCards.tsx').then((module) => ({ default: module.PlayCard })) },
];
