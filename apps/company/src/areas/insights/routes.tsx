// Insights pages. Owned by the "insights" workstream (docs/product/45_COMPANY_ENGLISH.md §3.3).
// Challenges and Sessions are open to everyone: the first entry for each path
// renders the page for all roles; the next two only place it in the sidebar,
// under Insights for HR and managers and under My English for employees.
import React from 'react';
import { lazyPage } from '../lazy.ts';
import type { AreaRoute } from '../types.ts';
import './insights.css';
import './insights-more.css';

const Challenges = lazyPage(() => import('./Challenges.tsx'), 'Challenges');
const Overview = lazyPage(() => import('./Overview.tsx'), 'Overview');
const Profile = lazyPage(() => import('./Profile.tsx'), 'Profile');
const Reports = lazyPage(() => import('./Reports.tsx'), 'Reports');
const Sessions = lazyPage(() => import('./Sessions.tsx'), 'Sessions');
const Framework = lazyPage(() => import('./Framework.tsx'), 'Framework');
const SkillsGap = lazyPage(() => import('./SkillsGap.tsx'), 'SkillsGap');
const AtRisk = lazyPage(() => import('./AtRisk.tsx'), 'AtRisk');
const Cohorts = lazyPage(() => import('./Cohorts.tsx'), 'Cohorts');
const Spend = lazyPage(() => import('./Spend.tsx'), 'Spend');
const Executive = lazyPage(() => import('./Executive.tsx'), 'Executive');
const Builder = lazyPage(() => import('./Builder.tsx'), 'Builder');
const Team = lazyPage(() => import('./Team.tsx'), 'Team');
const Winners = lazyPage(() => import('./Winners.tsx'), 'Winners');

const LEADS = ['owner', 'admin', 'manager'] as const;
const HR = ['owner', 'admin'] as const;

export const routes: AreaRoute[] = [
  { path: '/w/:org', access: 'org', roles: LEADS, nav: { section: 'overview', label: 'nav.section.overview', order: 0 }, render: () => <Overview/> },
  { path: '/w/:org/people/:member', access: 'org', render: (params) => <Profile key={params.member} memberId={params.member}/> },
  { path: '/w/:org/team', access: 'org', roles: LEADS, nav: { section: 'overview', label: 'insights.nav.team', order: 1 }, render: () => <Team/> },
  { path: '/w/:org/executive', access: 'org', roles: HR, nav: { section: 'insights', label: 'insights.nav.executive', order: 5 }, render: () => <Executive/> },
  { path: '/w/:org/reports', access: 'org', roles: LEADS, nav: { section: 'insights', label: 'insights.nav.reports', order: 10 }, render: () => <Reports/> },
  { path: '/w/:org/custom-reports', access: 'org', roles: LEADS, nav: { section: 'insights', label: 'insights.nav.builder', order: 11 }, render: () => <Builder/> },
  { path: '/w/:org/skills-gap', access: 'org', roles: LEADS, nav: { section: 'insights', label: 'insights.nav.skillsGap', order: 12 }, render: () => <SkillsGap/> },
  { path: '/w/:org/framework', access: 'org', roles: LEADS, nav: { section: 'insights', label: 'insights.nav.framework', order: 13 }, render: () => <Framework/> },
  { path: '/w/:org/at-risk', access: 'org', roles: LEADS, nav: { section: 'insights', label: 'insights.nav.atRisk', order: 14 }, render: () => <AtRisk/> },
  { path: '/w/:org/cohorts', access: 'org', roles: LEADS, nav: { section: 'insights', label: 'insights.nav.cohorts', order: 15 }, render: () => <Cohorts/> },
  { path: '/w/:org/spend', access: 'org', roles: HR, nav: { section: 'insights', label: 'insights.nav.spend', order: 16 }, render: () => <Spend/> },
  { path: '/w/:org/challenges/winners', access: 'org', render: () => <Winners/> },
  { path: '/w/:org/challenges', access: 'org', render: () => <Challenges/> },
  { path: '/w/:org/challenges', access: 'org', roles: LEADS, nav: { section: 'insights', label: 'insights.nav.challenges', order: 20 }, render: () => <Challenges/> },
  { path: '/w/:org/challenges', access: 'org', roles: ['employee'], nav: { section: 'me', label: 'insights.nav.challenges', order: 90 }, render: () => <Challenges/> },
  { path: '/w/:org/sessions', access: 'org', render: () => <Sessions/> },
  { path: '/w/:org/sessions', access: 'org', roles: LEADS, nav: { section: 'insights', label: 'insights.nav.sessions', order: 30 }, render: () => <Sessions/> },
  { path: '/w/:org/sessions', access: 'org', roles: ['employee'], nav: { section: 'me', label: 'insights.nav.sessions', order: 91 }, render: () => <Sessions/> },
];
