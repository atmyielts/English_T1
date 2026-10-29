import { lazy, type ComponentType } from 'react';
import {
  BookOpenCheck, ClipboardCheck, FileText, Gamepad2, GraduationCap, LayoutList, Megaphone, MessageSquareText, Presentation, Send, Store, Wand2,
} from 'lucide-react';
import { MATERIAL_KIND_CATALOG } from '../../../../packages/ai-core/src/materials/catalog.ts';
import type { Material } from '../../../../packages/ai-core/src/materials/mod.ts';
import { registerMaterialKind, Link, useT, type AreaNavItem, type AreaRoute, type HomeCard } from '../core/index.ts';
import { materialMarkdownLater } from './markdown.ts';

// Teachers (T1–T6, T9–T15): the Materials Studio and its review card, approved
// materials (library pages of the teacher kinds), print, Live Quiz, marking,
// feedback, channel autopilot, marketplace and brand kit. Pages load on demand.

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
const ICONS = { exam: GraduationCap, planning: LayoutList, textbook: BookOpenCheck, general: FileText } as const;
for (const [kind, group] of Object.entries(MATERIAL_KIND_CATALOG)) {
  registerMaterialKind<Material>({
    kind, label: `teacher.kind.${kind}`, icon: kind === 'slide_outline' ? Presentation : ICONS[group], toMarkdown: materialMarkdownLater,
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
  // Students join a Live Quiz and open handouts from any audience; signing in is asked on the page.
  { path: '/play', component: Play, title: 'teacher.nav.play', public: true },
  { path: '/handout/:token', component: Handout, title: 'teacher.handout.title', public: true },
];

export const nav: AreaNavItem[] = [
  { id: 'studio', path: '/studio', label: 'teacher.nav.studio', icon: Wand2, audiences: ['teacher', 'centre'], feature: 'T1', group: 'teacher' },
  { id: 'planner', path: '/studio/plan', label: 'teacher.nav.planner', icon: LayoutList, audiences: ['teacher', 'centre'], feature: 'T5', group: 'teacher' },
  { id: 'marking', path: '/studio/marking', label: 'teacher.nav.marking', icon: ClipboardCheck, audiences: ['teacher', 'centre'], feature: 'T3', group: 'teacher' },
  { id: 'quiz', path: '/studio/quizzes', label: 'teacher.nav.quiz', icon: Gamepad2, audiences: ['teacher', 'centre'], feature: 'T10', group: 'teacher' },
  { id: 'feedback', path: '/studio/feedback', label: 'teacher.nav.feedback', icon: MessageSquareText, audiences: ['teacher', 'centre'], feature: 'T4', group: 'teacher' },
  { id: 'channel', path: '/studio/channel', label: 'teacher.nav.channel', icon: Send, audiences: ['teacher', 'centre'], feature: 'T11', group: 'teacher' },
  { id: 'market', path: '/studio/market', label: 'teacher.nav.market', icon: Store, audiences: ['teacher', 'centre'], group: 'teacher' },
  { id: 'brand', path: '/studio/brand', label: 'teacher.nav.brand', icon: Megaphone, audiences: ['teacher'], feature: 'T13', group: 'teacher' },
  { id: 'play', path: '/play', label: 'teacher.nav.play', icon: Gamepad2, audiences: ['learner'], group: 'learner' },
];

function StudioCard() {
  const t = useT();
  return <div className="flex h-full flex-col gap-2 rounded-3xl border border-navy-line bg-white p-5">
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600"><Wand2 size={14} aria-hidden="true"/>{t('teacher.home.studioEyebrow')}</span>
    <strong className="font-display text-lg">{t('teacher.home.studioTitle')}</strong>
    <p className="m-0 text-sm text-gray-700">{t('teacher.home.studioLead')}</p>
    <Link to="/studio" className="mt-auto inline-flex min-h-10 w-fit items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('teacher.home.studioOpen')}</Link>
  </div>;
}
function PlayCard() {
  const t = useT();
  return <div className="flex h-full flex-col gap-2 rounded-3xl border border-navy-line bg-white p-5">
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600"><Gamepad2 size={14} aria-hidden="true"/>{t('teacher.nav.play')}</span>
    <strong className="font-display text-lg">{t('teacher.home.playTitle')}</strong>
    <p className="m-0 text-sm text-gray-700">{t('teacher.home.playLead')}</p>
    <Link to="/play" className="mt-auto inline-flex min-h-10 w-fit items-center rounded-full border border-navy-line px-4 text-sm font-semibold text-gray-900 no-underline">{t('teacher.home.playOpen')}</Link>
  </div>;
}
export const homeCards: HomeCard[] = [
  { id: 'studio', audiences: ['teacher', 'centre'], feature: 'T1', render: () => <StudioCard/> },
  { id: 'play', audiences: ['learner'], render: () => <PlayCard/> },
];
