// Staff console pages. Owned by the "gtm" workstream (docs/product/45_COMPANY_ENGLISH.md §3.4).
import React from 'react';
import { lazyPage } from '../lazy.ts';
import type { AreaRoute } from '../types.ts';
import '../people/people.css';
import './staff.css';
import './staff-ops.css';

const StaffLeads = lazyPage(() => import('./StaffLeads.tsx'), 'StaffLeads');
const StaffOrgPage = lazyPage(() => import('./StaffOrg.tsx'), 'StaffOrgPage');
const StaffHome = lazyPage(() => import('./StaffOrgs.tsx'), 'StaffHome');
const StaffRevenue = lazyPage(() => import('./StaffRevenue.tsx'), 'StaffRevenue');
const StaffHealth = lazyPage(() => import('./StaffHealth.tsx'), 'StaffHealth');
const StaffBilling = lazyPage(() => import('./StaffBilling.tsx'), 'StaffBilling');
const StaffInvoice = lazyPage(() => import('./StaffInvoice.tsx'), 'StaffInvoice');
const StaffQuote = lazyPage(() => import('./StaffQuote.tsx'), 'StaffQuote');
const StaffView = lazyPage(() => import('./StaffView.tsx'), 'StaffView');

export const routes: AreaRoute[] = [
  { path: '/staff', access: 'staff', render: () => <StaffHome/> },
  { path: '/staff/orgs/:org', access: 'staff', render: ({ org }) => <StaffOrgPage key={org} orgId={org}/> },
  { path: '/staff/leads', access: 'staff', render: () => <StaffLeads/> },
  { path: '/staff/revenue', access: 'staff', render: () => <StaffRevenue/> },
  { path: '/staff/health', access: 'staff', render: () => <StaffHealth/> },
  { path: '/staff/billing', access: 'staff', render: () => <StaffBilling/> },
  { path: '/staff/invoices/:invoice', access: 'staff', render: ({ invoice }) => <StaffInvoice key={invoice} invoiceId={invoice}/> },
  { path: '/staff/contracts/:contract/quote', access: 'staff', render: ({ contract }) => <StaffQuote key={contract} contractId={contract}/> },
  { path: '/staff/orgs/:org/view', access: 'staff', render: ({ org }) => <StaffView key={org} orgId={org}/> },
];
