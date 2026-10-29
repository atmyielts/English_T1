// Staff console pages. Owned by the "gtm" workstream (docs/product/45_COMPANY_ENGLISH.md §3.4).
import React from 'react';
import type { AreaRoute } from '../types.ts';
import { StaffLeads } from './StaffLeads.tsx';
import { StaffOrgPage } from './StaffOrg.tsx';
import { StaffHome } from './StaffOrgs.tsx';
import '../people/people.css';
import './staff.css';

export const routes: AreaRoute[] = [
  { path: '/staff', access: 'staff', render: () => <StaffHome/> },
  { path: '/staff/orgs/:org', access: 'staff', render: ({ org }) => <StaffOrgPage key={org} orgId={org}/> },
  { path: '/staff/leads', access: 'staff', render: () => <StaffLeads/> },
];
