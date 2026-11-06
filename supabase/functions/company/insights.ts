// insights routes — owned by the "insights" workstream (see docs/product/45_COMPANY_ENGLISH.md §3.3).
// Overview, person profiles, reports and exports, team challenges, live sessions.
import type { Route } from './types.ts';
import { routes as overview } from './insights/overview.ts';
import { routes as profile } from './insights/profile.ts';
import { routes as reports } from './insights/reports.ts';
import { routes as challenges } from './insights/challenges.ts';
import { routes as sessions } from './insights/sessions.ts';

export const routes: Route[] = [...overview, ...profile, ...reports, ...challenges, ...sessions];
