// Training pages. Owned by the "training" workstream (docs/product/45_COMPANY_ENGLISH.md).
import React from 'react';
import { ComingSoon } from '../core/pages.tsx';
import type { AreaRoute } from '../types.ts';

export const routes: AreaRoute[] = [
  { path: '/w/:org/me', access: 'org', nav: { section: 'me', label: 'nav.section.me', order: 0 }, render: () => <ComingSoon title="nav.section.me"/> },
];
