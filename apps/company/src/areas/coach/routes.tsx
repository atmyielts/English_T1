// Coach pages: the daily habit. Owned by the "coach" stream.
import React from 'react';
import { LEAD_ROLES } from '../../../../../packages/company-core/src/mod.ts';
import { lazyPage } from '../lazy.ts';
import type { AreaRoute } from '../types.ts';
import './coach.css';

const Today = lazyPage(() => import('./Today.tsx'), 'Today');
const Review = lazyPage(() => import('./Review.tsx'), 'Review');
const Finder = lazyPage(() => import('./Finder.tsx'), 'Finder');
const Phrasebook = lazyPage(() => import('./Phrasebook.tsx'), 'Phrasebook');
const Shadow = lazyPage(() => import('./Shadow.tsx'), 'Shadow');
const Progress = lazyPage(() => import('./Progress.tsx'), 'Progress');
const Team = lazyPage(() => import('./Team.tsx'), 'Team');
const Adoption = lazyPage(() => import('./Adoption.tsx'), 'Adoption');

export const routes: AreaRoute[] = [
  { path: '/w/:org/today', access: 'org', nav: { section: 'me', label: 'coach.nav.today', order: 10 }, render: () => <Today/> },
  { path: '/w/:org/coach/review', access: 'org', nav: { section: 'me', label: 'coach.nav.review', order: 11 }, render: () => <Review/> },
  { path: '/w/:org/coach/finder', access: 'org', nav: { section: 'me', label: 'coach.nav.finder', order: 12 }, render: () => <Finder/> },
  { path: '/w/:org/coach/phrasebook', access: 'org', nav: { section: 'me', label: 'coach.nav.phrasebook', order: 13 }, render: () => <Phrasebook/> },
  { path: '/w/:org/coach/shadow', access: 'org', nav: { section: 'me', label: 'coach.nav.shadow', order: 14 }, render: () => <Shadow/> },
  { path: '/w/:org/coach/progress', access: 'org', nav: { section: 'me', label: 'coach.nav.progress', order: 30 }, render: () => <Progress/> },
  { path: '/w/:org/coach/team', access: 'org', nav: { section: 'me', label: 'coach.nav.team', order: 40 }, render: () => <Team/> },
  { path: '/w/:org/coach/habit', access: 'org', roles: LEAD_ROLES, nav: { section: 'training', label: 'coach.nav.adoption', order: 30 }, render: () => <Adoption/> },
];
