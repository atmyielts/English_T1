// Staff console pages. Owned by the "gtm" workstream (docs/product/45_COMPANY_ENGLISH.md §3.4).
import React from 'react';
import { lazyPage } from '../lazy.ts';
import type { AreaRoute } from '../types.ts';
import '../people/people.css';
import './staff.css';

const StaffLeads = lazyPage(() => import('./StaffLeads.tsx'), 'StaffLeads');
const StaffOrgPage = lazyPage(() => import('./StaffOrg.tsx'), 'StaffOrgPage');
const StaffHome = lazyPage(() => import('./StaffOrgs.tsx'), 'StaffHome');

export const routes: AreaRoute[] = [
  { path: '/staff', access: 'staff', render: () => <StaffHome/> },
  { path: '/staff/orgs/:org', access: 'staff', render: ({ org }) => <StaffOrgPage key={org} orgId={org}/> },
  { path: '/staff/leads', access: 'staff', render: () => <StaffLeads/> },
];
