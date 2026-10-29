// hiring pages. Owned by the "hiring" workstream (docs/product/45_COMPANY_ENGLISH.md §3.1).
import React from 'react';
import type { AreaRoute } from '../types.ts';
import { CandidatePage } from './CandidatePage.tsx';
import { CertificatePage } from './CertificatePage.tsx';
import { HiringListPage, TestDetailPage } from './HiringPages.tsx';
import { MemberTestPage, MyTestsPage } from './MemberPages.tsx';
import { PlacementDetailPage, PlacementListPage } from './PlacementPages.tsx';
import { ReportPage } from './ReportPage.tsx';
import './hiring.css';

const HR = ['owner', 'admin'] as const;
const LEADS = ['owner', 'admin', 'manager'] as const;

export const routes: AreaRoute[] = [
  { path: '/w/:org/hiring', access: 'org', roles: HR, nav: { section: 'hiring', label: 'hiring.nav.tests', order: 10 }, render: () => <HiringListPage/> },
  { path: '/w/:org/hiring/:assessment', access: 'org', roles: HR, render: ({ assessment }) => <TestDetailPage key={assessment} assessmentId={assessment}/> },
  { path: '/w/:org/hiring/:assessment/:attempt', access: 'org', roles: HR, render: ({ assessment, attempt }) => <ReportPage key={attempt} assessmentId={assessment} attemptId={attempt} back="hiring"/> },
  { path: '/w/:org/placement', access: 'org', roles: LEADS, nav: { section: 'hiring', label: 'hiring.nav.placement', order: 20 }, render: () => <PlacementListPage/> },
  { path: '/w/:org/placement/:assessment', access: 'org', roles: LEADS, render: ({ assessment }) => <PlacementDetailPage key={assessment} assessmentId={assessment}/> },
  { path: '/w/:org/placement/:assessment/:attempt', access: 'org', roles: LEADS, render: ({ assessment, attempt }) => <ReportPage key={attempt} assessmentId={assessment} attemptId={attempt} back="placement"/> },
  { path: '/w/:org/tests', access: 'org', nav: { section: 'me', label: 'hiring.nav.myTests', order: 20 }, render: () => <MyTestsPage/> },
  { path: '/w/:org/test/:assessment', access: 'org', render: ({ assessment }) => <MemberTestPage key={assessment} assessmentId={assessment}/> },
  { path: '/t/:token', access: 'public', bare: true, render: ({ token }) => <CandidatePage key={token} token={token}/> },
  { path: '/v/:code', access: 'public', render: ({ code }) => <CertificatePage key={code} code={code}/> },
];
