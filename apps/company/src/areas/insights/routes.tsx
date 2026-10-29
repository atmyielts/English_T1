// Insights pages. Owned by the "insights" workstream (docs/product/45_COMPANY_ENGLISH.md).
import React from 'react';
import { ComingSoon } from '../core/pages.tsx';
import type { AreaRoute } from '../types.ts';

export const routes: AreaRoute[] = [
  { path: '/w/:org', access: 'org', roles: ['owner', 'admin', 'manager'], nav: { section: 'overview', label: 'nav.section.overview', order: 0 }, render: () => <ComingSoon title="nav.section.overview"/> },
];
