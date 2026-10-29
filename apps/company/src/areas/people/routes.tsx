// People pages. Owned by the "gtm" workstream (docs/product/45_COMPANY_ENGLISH.md §3.4).
import React from 'react';
import { HR_ROLES, LEAD_ROLES } from '../../../../../packages/company-core/src/mod.ts';
import { lazyPage } from '../lazy.ts';
import type { AreaRoute } from '../types.ts';
import './people.css';

const DepartmentsPage = lazyPage(() => import('./DepartmentsPage.tsx'), 'DepartmentsPage');
const JoinPage = lazyPage(() => import('./JoinPage.tsx'), 'JoinPage');
const PeoplePage = lazyPage(() => import('./PeoplePage.tsx'), 'PeoplePage');
const SettingsPage = lazyPage(() => import('./SettingsPage.tsx'), 'SettingsPage');

export const routes: AreaRoute[] = [
  { path: '/w/:org/people', access: 'org', roles: LEAD_ROLES, nav: { section: 'people', label: 'people.nav.people', order: 0 }, render: () => <PeoplePage/> },
  { path: '/w/:org/departments', access: 'org', roles: HR_ROLES, nav: { section: 'people', label: 'people.nav.departments', order: 10 }, render: () => <DepartmentsPage/> },
  { path: '/w/:org/settings', access: 'org', roles: HR_ROLES, nav: { section: 'people', label: 'people.nav.settings', order: 90 }, render: () => <SettingsPage/> },
  // Public so an invitee sees the company before signing in; joining itself needs a session.
  { path: '/join/:token', access: 'public', render: ({ token }) => <JoinPage token={token}/> },
];
