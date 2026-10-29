// People routes — owned by the "gtm" workstream (docs/product/45_COMPANY_ENGLISH.md §3.4):
// people and seats, invitations and team links, departments, workspace settings
// and joining from a link. The handlers live in ./people/.
import type { Route } from './types.ts';
import { departmentRoutes } from './people/departments.ts';
import { inviteRoutes } from './people/invites.ts';
import { joinRoutes } from './people/join.ts';
import { memberRoutes } from './people/members.ts';
import { settingsRoutes } from './people/settings.ts';

export const routes: Route[] = [...memberRoutes, ...inviteRoutes, ...departmentRoutes, ...settingsRoutes, ...joinRoutes];
