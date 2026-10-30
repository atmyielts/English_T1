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

type PageName = keyof typeof import('./pages/index.ts');
const pages = () => import('./pages/index.ts');
const page = (name: PageName) => lazy(async () => ({ default: (await pages())[name] as ComponentType<{ params: Record<string, string> }> }));

// Specific paths first: /coach/team must not be read as a coach called "team".
export const routes: AreaRoute[] = ([
  ['', 'CoachHome', 'coach.home.title'],
  ['/team', 'CoachTeam', 'coach.team.title'],
  ['/team/join', 'CoachTeam', 'coach.team.title'],
  ['/certificates', 'CoachCertificates', 'coach.cert.title'],
  ['/verify/:code', 'CoachVerify', 'coach.verify.title'],
  ['/:pack', 'CoachDashboard', 'coach.tab.dashboard'],
  ['/:pack/report', 'CoachReport', 'coach.tab.report'],
  ['/:pack/plan', 'CoachPlan', 'coach.tab.plan'],
  ['/:pack/settings', 'CoachSettingsPage', 'coach.tab.settings'],
  ['/:pack/session/:id', 'CoachSession', 'coach.session.title'],
  ['/:pack/samples', 'CoachSamples', 'coach.samples.title'],
  ['/:pack/samples/:id', 'CoachSamples', 'coach.samples.title'],
  ['/:pack/link', 'CoachLink', 'coach.link.title'],
  ['/:pack/timer', 'CoachTimer', 'coach.timer.title'],
  ['/:pack/listen/:set', 'CoachListen', 'coach.listen.title'],
  ['/:pack/shadow/:set/:sentence', 'CoachShadow', 'coach.shadow.title'],
  ['/:pack/chart/:task', 'CoachChart', 'coach.chart.title'],
] as const).map(([path, name, title]) => ({ path: `/coach${path}`, component: page(name), title, public: true }));

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
