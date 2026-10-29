import { lazy, type ComponentType } from 'react';
import { GraduationCap } from 'lucide-react';
import type { AreaNavItem, AreaRoute, HomeCard } from '../core/areas.ts';
import { Link } from '../core/index.ts';
import { useT } from '../core/i18n/index.ts';
import './telegram.ts';

// Schood Coaches (B1–B6): the /coach/<pack> screens, also the Telegram Mini App.
// Importing telegram.ts registers the Mini App session source before render.
// Every page loads on demand. The routes are public so a person opening the Mini
// App before linking sees the link step (and examples), not the web landing page;
// each page shows sign-in or linking itself.

const page = <K extends string>(load: () => Promise<Record<K, ComponentType<never>>>, name: K) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType<{ params: Record<string, string> }> }));
const records = () => import('./pages/Records.tsx'), tools = () => import('./pages/Tools.tsx');

const CoachHome = page(() => import('./pages/Home.tsx'), 'CoachHome');
const CoachDashboard = page(() => import('./pages/Dashboard.tsx'), 'CoachDashboard');
const CoachReport = page(() => import('./pages/Report.tsx'), 'CoachReport');
const CoachPlan = page(() => import('./pages/Plan.tsx'), 'CoachPlan');
const CoachSettings = page(() => import('./pages/Settings.tsx'), 'CoachSettingsPage');
const CoachSession = page(() => import('./pages/Session.tsx'), 'CoachSession');
const CoachSamples = page(() => import('./pages/Samples.tsx'), 'CoachSamples');
const CoachLink = page(() => import('./pages/Link.tsx'), 'CoachLink');
const CoachVerify = page(records, 'CoachVerify'), CoachCertificates = page(records, 'CoachCertificates'), CoachTeam = page(records, 'CoachTeam');
const CoachTimer = page(tools, 'CoachTimer'), CoachListen = page(tools, 'CoachListen'), CoachShadow = page(tools, 'CoachShadow'), CoachChart = page(tools, 'CoachChart');

// Specific paths first: /coach/team must not be read as a coach called "team".
export const routes: AreaRoute[] = [
  { path: '/coach', component: CoachHome, title: 'coach.home.title', public: true },
  { path: '/coach/team', component: CoachTeam, title: 'coach.team.title', public: true },
  { path: '/coach/team/join', component: CoachTeam, title: 'coach.team.title', public: true },
  { path: '/coach/certificates', component: CoachCertificates, title: 'coach.cert.title', public: true },
  { path: '/coach/verify/:code', component: CoachVerify, title: 'coach.verify.title', public: true },
  { path: '/coach/:pack', component: CoachDashboard, title: 'coach.tab.dashboard', public: true },
  { path: '/coach/:pack/report', component: CoachReport, title: 'coach.tab.report', public: true },
  { path: '/coach/:pack/plan', component: CoachPlan, title: 'coach.tab.plan', public: true },
  { path: '/coach/:pack/settings', component: CoachSettings, title: 'coach.tab.settings', public: true },
  { path: '/coach/:pack/session/:id', component: CoachSession, title: 'coach.session.title', public: true },
  { path: '/coach/:pack/samples', component: CoachSamples, title: 'coach.samples.title', public: true },
  { path: '/coach/:pack/samples/:id', component: CoachSamples, title: 'coach.samples.title', public: true },
  { path: '/coach/:pack/link', component: CoachLink, title: 'coach.link.title', public: true },
  { path: '/coach/:pack/timer', component: CoachTimer, title: 'coach.timer.title', public: true },
  { path: '/coach/:pack/listen/:set', component: CoachListen, title: 'coach.listen.title', public: true },
  { path: '/coach/:pack/shadow/:set/:sentence', component: CoachShadow, title: 'coach.shadow.title', public: true },
  { path: '/coach/:pack/chart/:task', component: CoachChart, title: 'coach.chart.title', public: true },
];

export const nav: AreaNavItem[] = [
  { id: 'coaches', path: '/coach', label: 'coach.nav', icon: GraduationCap, audiences: ['learner'], group: 'coach' },
];

function CoachesCard() {
  const t = useT();
  return <div className="flex flex-col gap-2 rounded-3xl border border-navy-line bg-white/85 p-5">
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600"><GraduationCap size={16} aria-hidden="true"/>{t('coach.eyebrow')}</span>
    <p className="m-0 font-display text-lg font-bold">{t('coach.card.title')}</p>
    <p className="m-0 text-sm leading-6 text-gray-700">{t('coach.card.lead')}</p>
    <Link to="/coach" className="text-sm font-semibold text-gray-900 underline underline-offset-2">{t('coach.card.open')}</Link>
  </div>;
}
export const homeCards: HomeCard[] = [
  { id: 'coaches', audiences: ['learner'], render: () => <CoachesCard/> },
];
