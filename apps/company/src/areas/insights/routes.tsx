// Insights pages. Owned by the "insights" workstream (docs/product/45_COMPANY_ENGLISH.md §3.3).
// Challenges and Sessions are open to everyone: the first entry for each path
// renders the page for all roles; the next two only place it in the sidebar,
// under Insights for HR and managers and under My English for employees.
import React from 'react';
import { lazyPage } from '../lazy.ts';
import type { AreaRoute } from '../types.ts';
import './insights.css';

const Challenges = lazyPage(() => import('./Challenges.tsx'), 'Challenges');
const Overview = lazyPage(() => import('./Overview.tsx'), 'Overview');
const Profile = lazyPage(() => import('./Profile.tsx'), 'Profile');
const Reports = lazyPage(() => import('./Reports.tsx'), 'Reports');
const Sessions = lazyPage(() => import('./Sessions.tsx'), 'Sessions');

const LEADS = ['owner', 'admin', 'manager'] as const;

export const routes: AreaRoute[] = [
  { path: '/w/:org', access: 'org', roles: LEADS, nav: { section: 'overview', label: 'nav.section.overview', order: 0 }, render: () => <Overview/> },
  { path: '/w/:org/people/:member', access: 'org', render: (params) => <Profile key={params.member} memberId={params.member}/> },
  { path: '/w/:org/reports', access: 'org', roles: LEADS, nav: { section: 'insights', label: 'insights.nav.reports', order: 10 }, render: () => <Reports/> },
  { path: '/w/:org/challenges', access: 'org', render: () => <Challenges/> },
  { path: '/w/:org/challenges', access: 'org', roles: LEADS, nav: { section: 'insights', label: 'insights.nav.challenges', order: 20 }, render: () => <Challenges/> },
  { path: '/w/:org/challenges', access: 'org', roles: ['employee'], nav: { section: 'me', label: 'insights.nav.challenges', order: 90 }, render: () => <Challenges/> },
  { path: '/w/:org/sessions', access: 'org', render: () => <Sessions/> },
  { path: '/w/:org/sessions', access: 'org', roles: LEADS, nav: { section: 'insights', label: 'insights.nav.sessions', order: 30 }, render: () => <Sessions/> },
  { path: '/w/:org/sessions', access: 'org', roles: ['employee'], nav: { section: 'me', label: 'insights.nav.sessions', order: 91 }, render: () => <Sessions/> },
];
