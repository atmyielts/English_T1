// hiring routes — owned by the "hiring" workstream (see docs/product/45_COMPANY_ENGLISH.md §3.1):
// hiring tests and candidates, placement and progress campaigns, staff tests, certificates,
// and the applicant tracking layer (role templates, pipeline, share links, interview kits,
// retention, HR test preview).
import { routes as candidates } from './hiring/candidates.ts';
import { routes as hr } from './hiring/hr.ts';
import { routes as member } from './hiring/member.ts';
import { routes as preview } from './hiring/preview.ts';
import { routes as publicRoutes } from './hiring/public.ts';
import { routes as retention } from './hiring/retention.ts';
import { routes as share } from './hiring/share.ts';
import type { Route } from './types.ts';

// retention comes before candidates: "candidates/bulk/erase" must win over "candidates/:candidate/erase".
export const routes: Route[] = [...hr, ...member, ...publicRoutes, ...retention, ...candidates, ...share, ...preview];
