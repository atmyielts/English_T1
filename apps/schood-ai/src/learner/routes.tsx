import { lazy, type ComponentType } from 'react';
import type { AreaNavItem, AreaRoute, HomeCard } from '../core/areas.ts';

// Learners and parents (L1–L17, P1–P2). Pages, nav icons and home cards load on
// demand: learners are on weak phones, so none of it is in the first download.
type Page = ComponentType<{ params: Record<string, string> }>;
const page = <K extends string>(load: () => Promise<Record<K, ComponentType<never>>>, name: K) => lazy(async () => ({ default: (await load())[name] as Page }));
const tutor = () => import('./pages/Tutor.tsx'), writing = () => import('./pages/Writing.tsx'), speaking = () => import('./pages/Speaking.tsx');
const practice = () => import('./pages/Practice.tsx'), plan = () => import('./pages/Plan.tsx'), daily = () => import('./pages/Daily.tsx'), family = () => import('./pages/Family.tsx');

export const routes: AreaRoute[] = [
  { path: '/learn', component: page(tutor, 'LearnHubPage'), title: 'learner.hub.title', audiences: ['learner'] },
  { path: '/consent', component: page(tutor, 'ConsentPage'), title: 'learner.consent.title', audiences: ['learner'] },
  { path: '/tutor', component: page(tutor, 'TutorPage'), title: 'learner.tool.tutor', audiences: ['learner'], feature: 'L1' },
  { path: '/explain', component: page(() => import('./pages/Explain.tsx'), 'ExplainPage'), title: 'learner.tool.explain', audiences: ['learner'], feature: 'L2' },
  { path: '/write', component: page(writing, 'WritePage'), title: 'learner.tool.write', audiences: ['learner'], feature: 'L3' },
  { path: '/essays', component: page(writing, 'EssaysPage'), title: 'learner.tool.essays', audiences: ['learner'], feature: 'L8' },
  { path: '/speak', component: page(speaking, 'SpeakPage'), title: 'learner.tool.speak', audiences: ['learner'], feature: 'L4' },
  { path: '/interview', component: page(speaking, 'InterviewPage'), title: 'learner.tool.interview', audiences: ['learner'], feature: 'L12' },
  { path: '/pronounce', component: page(practice, 'PronouncePage'), title: 'learner.tool.pronounce', audiences: ['learner'], feature: 'L13' },
  { path: '/words', component: page(practice, 'WordsPage'), title: 'learner.tool.words', audiences: ['learner'], feature: 'L6' },
  { path: '/reading', component: page(practice, 'ReadingPage'), title: 'learner.tool.reading', audiences: ['learner'], feature: 'L10' },
  { path: '/photo', component: page(practice, 'PhotoPage'), title: 'learner.tool.photo', audiences: ['learner'], feature: 'L9' },
  { path: '/plan', component: page(plan, 'PlanPage'), title: 'learner.tool.plan', audiences: ['learner'], feature: 'L5' },
  { path: '/abroad', component: page(plan, 'AbroadPage'), title: 'learner.tool.abroad', audiences: ['learner'], feature: 'L16' },
  { path: '/homework', component: page(daily, 'HomeworkPage'), title: 'learner.tool.homework', audiences: ['learner'], feature: 'L7' },
  { path: '/brief', component: page(daily, 'BriefPage'), title: 'learner.tool.brief', audiences: ['learner'], feature: 'L14' },
  { path: '/duels', component: page(daily, 'DuelsPage'), title: 'learner.tool.duels', audiences: ['learner'], feature: 'L17' },
  // The invited friend may not have a plan or even an account: no AI runs on this page.
  { path: '/duel/:code', component: page(daily, 'DuelLandingPage'), title: 'learner.duel.invited', public: true },
  // Parents manage the family here; linked children see who sees their progress and can unlink.
  { path: '/family', component: page(family, 'FamilyPage'), title: 'learner.tool.family', audiences: ['parent', 'learner'] },
  { path: '/family/join', component: page(family, 'FamilyJoinPage'), title: 'learner.join.title', audiences: ['learner', 'parent'] },
];

export const nav: AreaNavItem[] = [
  { id: 'learn', path: '/learn', label: 'learner.nav.learn', icon: 'LayoutGrid', audiences: ['learner'] },
  { id: 'tutor', path: '/tutor', label: 'learner.tool.tutor', icon: 'MessageSquareText', audiences: ['learner'], feature: 'L1' },
  { id: 'explain', path: '/explain', label: 'learner.tool.explain', icon: 'Brain', audiences: ['learner'], feature: 'L2' },
  { id: 'homework', path: '/homework', label: 'learner.tool.homework', icon: 'ClipboardList', audiences: ['learner'], feature: 'L7' },
  { id: 'write', path: '/write', label: 'learner.tool.write', icon: 'PenLine', audiences: ['learner'], feature: 'L3' },
  { id: 'speak', path: '/speak', label: 'learner.tool.speak', icon: 'Mic', audiences: ['learner'], feature: 'L4' },
  { id: 'reading', path: '/reading', label: 'learner.tool.reading', icon: 'BookOpen', audiences: ['learner'], feature: 'L10' },
  { id: 'plan', path: '/plan', label: 'learner.tool.plan', icon: 'Target', audiences: ['learner'], feature: 'L5' },
  { id: 'brief', path: '/brief', label: 'learner.tool.brief', icon: 'CalendarCheck', audiences: ['learner'], feature: 'L14' },
  { id: 'duels', path: '/duels', label: 'learner.tool.duels', icon: 'Swords', audiences: ['learner'], feature: 'L17' },
  { id: 'family', path: '/family', label: 'learner.tool.family', icon: 'UsersRound', audiences: ['parent'], feature: 'P1' },
];

export const homeCards: HomeCard[] = [
  { id: 'learn', audiences: ['learner'], component: () => import('./cards/LearnCard.tsx') },
  { id: 'family', audiences: ['parent'], component: () => import('./cards/FamilyCard.tsx') },
];

export const icons = () => import('./icons.ts');
