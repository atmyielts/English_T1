// hiring routes — owned by the "hiring" workstream (see docs/product/45_COMPANY_ENGLISH.md §3.1):
// hiring tests and candidates, placement and progress campaigns, staff tests, certificates.
import { routes as hr } from './hiring/hr.ts';
import { routes as member } from './hiring/member.ts';
import { routes as publicRoutes } from './hiring/public.ts';
import type { Route } from './types.ts';

export const routes: Route[] = [...hr, ...member, ...publicRoutes];
