// insights routes — owned by the "insights" workstream (see docs/product/45_COMPANY_ENGLISH.md §3.3).
// Overview, person profiles, reports and exports, team challenges, live sessions, the competency
// framework and skills gap, at-risk learners, cohorts, spend, the executive page, custom reports, manager home.
import type { Route } from './types.ts';
import { routes as overview } from './insights/overview.ts';
import { routes as profile } from './insights/profile.ts';
import { routes as reports } from './insights/reports.ts';
import { routes as challenges } from './insights/challenges.ts';
import { routes as sessions } from './insights/sessions.ts';
import { routes as framework } from './insights/framework.ts';
import { routes as gap } from './insights/gap.ts';
import { routes as risk } from './insights/risk.ts';
import { routes as cohorts } from './insights/cohorts.ts';
import { routes as spend } from './insights/spend.ts';
import { routes as executive } from './insights/executive.ts';
import { routes as builder } from './insights/builder.ts';
import { routes as team } from './insights/team.ts';

export const routes: Route[] = [
  ...overview, ...profile, ...reports, ...challenges, ...sessions,
  ...framework, ...gap, ...risk, ...cohorts, ...spend, ...executive, ...builder, ...team,
];
