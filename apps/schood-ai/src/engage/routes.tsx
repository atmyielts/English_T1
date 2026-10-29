import { lazy, Suspense, type ComponentType } from 'react';
import { Award, BookOpen, Flame, IdCard, Map as MapIcon, Trophy, Users } from 'lucide-react';
import type { AreaNavItem, AreaRoute, HomeCard } from '../core/areas.ts';
import { currentLocale, loadPageText } from './i18n/lazy.ts';

// Lifetime engagement (E1–E14) screens. Every page loads on demand together with its
// text (i18n/lazy.ts), so the first download carries only this file, the nav labels and
// the page titles.

type Page = ComponentType<{ params: Record<string, string> }>;
const page = <K extends string>(load: () => Promise<Record<K, ComponentType<never>>>, name: K) =>
  lazy(async () => { const [module] = await Promise.all([load(), loadPageText(currentLocale())]); return { default: module[name] as Page }; });
const progress = () => import('./pages/Progress.tsx'), social = () => import('./pages/Social.tsx'), passport = () => import('./pages/Passport.tsx'), certs = () => import('./pages/Certificates.tsx');

const ProgressPage = page(progress, 'ProgressPage');
const SettingsPage = page(() => import('./pages/Settings.tsx'), 'SettingsPage');
const MemoryPage = page(() => import('./pages/Memory.tsx'), 'MemoryPage');
const JourneysPage = page(() => import('./pages/Journeys.tsx'), 'JourneysPage');
const PathPage = page(() => import('./pages/Path.tsx'), 'PathPage');
const LeaguePage = page(social, 'LeaguePage'), SquadsPage = page(social, 'SquadsPage'), BoardsPage = page(social, 'BoardsPage');
const StoriesPage = page(() => import('./pages/Stories.tsx'), 'StoriesPage');
const ThenNowPage = page(() => import('./pages/ThenNow.tsx'), 'ThenNowPage');
const PassportPage = page(passport, 'PassportPage'), PublicPassportPage = page(passport, 'PublicPassportPage'), VerifyPage = page(passport, 'VerifyPage');
const EventsPage = page(() => import('./pages/Events.tsx'), 'EventsPage');
const CertificatesPage = page(certs, 'CertificatesPage'), ReviewPage = page(certs, 'ReviewPage');
const SittingPage = page(() => import('./pages/Sitting.tsx'), 'SittingPage');
const TalentPage = page(() => import('./pages/Talent.tsx'), 'TalentPage');
const EngageHomeCard = lazy(async () => { const [module] = await Promise.all([import('./HomeCard.tsx'), loadPageText(currentLocale())]); return module; });

const L = ['learner'] as const;
export const routes: AreaRoute[] = [
  { path: '/progress', component: ProgressPage, title: 'engage.progress.title', audiences: [...L], feature: 'E5' },
  { path: '/progress/settings', component: SettingsPage, title: 'engage.settings.title', audiences: [...L] },
  { path: '/progress/coach', component: MemoryPage, title: 'engage.memory.title', audiences: [...L], feature: 'E9' },
  { path: '/journeys', component: JourneysPage, title: 'engage.journeys.title', audiences: [...L], feature: 'E1' },
  { path: '/journeys/:key', component: JourneysPage, title: 'engage.journeys.title', audiences: [...L], feature: 'E1' },
  { path: '/path', component: PathPage, title: 'engage.path.title', audiences: [...L], feature: 'E2' },
  { path: '/league', component: LeaguePage, title: 'engage.league.title', audiences: [...L], feature: 'E4' },
  { path: '/squads', component: SquadsPage, title: 'engage.squad.title', audiences: [...L], feature: 'E6' },
  { path: '/squads/join/:code', component: SquadsPage, title: 'engage.squad.title', audiences: [...L], feature: 'E6' },
  { path: '/boards', component: BoardsPage, title: 'engage.boards.title', audiences: [...L], feature: 'E11' },
  { path: '/stories', component: StoriesPage, title: 'engage.story.title', audiences: [...L], feature: 'E8' },
  { path: '/stories/:arc', component: StoriesPage, title: 'engage.story.title', audiences: [...L], feature: 'E8' },
  { path: '/stories/:arc/:episode', component: StoriesPage, title: 'engage.story.title', audiences: [...L], feature: 'E8' },
  { path: '/then-vs-now', component: ThenNowPage, title: 'engage.thenNow.title', audiences: [...L], feature: 'E7' },
  { path: '/passport', component: PassportPage, title: 'engage.passport.title', audiences: [...L], feature: 'E3' },
  { path: '/p/:token', component: PublicPassportPage, title: 'engage.passport.publicEyebrow', public: true },
  { path: '/verify', component: VerifyPage, title: 'engage.verify.title', public: true },
  { path: '/verify/:code', component: VerifyPage, title: 'engage.verify.title', public: true },
  { path: '/events', component: EventsPage, title: 'engage.events.title', audiences: [...L], feature: 'E10' },
  { path: '/certificates', component: CertificatesPage, title: 'engage.cert.title', audiences: [...L], feature: 'E12' },
  { path: '/certificates/review', component: ReviewPage, title: 'engage.review.title' },
  { path: '/certificates/sitting/:id', component: SittingPage, title: 'engage.cert.title', audiences: [...L], feature: 'E12', focus: true },
  { path: '/talent', component: TalentPage, title: 'engage.talent.title' },
];

export const nav: AreaNavItem[] = [
  { id: 'engage-progress', path: '/progress', label: 'engage.nav.progress', icon: Flame, audiences: [...L], feature: 'E5' },
  { id: 'engage-journeys', path: '/journeys', label: 'engage.nav.journeys', icon: MapIcon, audiences: [...L], feature: 'E1' },
  { id: 'engage-stories', path: '/stories', label: 'engage.nav.stories', icon: BookOpen, audiences: [...L], feature: 'E8' },
  { id: 'engage-league', path: '/league', label: 'engage.nav.league', icon: Trophy, audiences: [...L], feature: 'E4' },
  { id: 'engage-squads', path: '/squads', label: 'engage.nav.squads', icon: Users, audiences: [...L], feature: 'E6' },
  { id: 'engage-passport', path: '/passport', label: 'engage.nav.passport', icon: IdCard, audiences: [...L], feature: 'E3' },
  { id: 'engage-certificates', path: '/certificates', label: 'engage.nav.certificates', icon: Award, audiences: [...L], feature: 'E12' },
];

export const homeCards: HomeCard[] = [
  { id: 'engage-today', audiences: ['learner'], feature: 'E5', render: () => <Suspense fallback={null}><EngageHomeCard/></Suspense> },
];
