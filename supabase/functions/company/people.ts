// People routes — owned by the "gtm" workstream (docs/product/45_COMPANY_ENGLISH.md §3.4):
// people and seats, invitations and team links, departments, workspace settings
// and joining from a link. The handlers live in ./people/.
import type { Route } from './types.ts';
import { planRoutes } from './people/billing.ts';
import { bulkRoutes } from './people/bulk.ts';
import { departmentRoutes } from './people/departments.ts';
import { inviteRoutes } from './people/invites.ts';
import { joinRoutes } from './people/join.ts';
import { memberRoutes } from './people/members.ts';
import { onboardingRoutes } from './people/onboarding.ts';
import { requestRoutes } from './people/requests.ts';
import { searchRoutes } from './people/search.ts';
import { settingsRoutes } from './people/settings.ts';

// The fixed paths (people/bulk, people/filters, people/requests) go before people/:member.
export const routes: Route[] = [...bulkRoutes, ...requestRoutes, ...onboardingRoutes, ...planRoutes, ...searchRoutes, ...memberRoutes, ...inviteRoutes, ...departmentRoutes, ...settingsRoutes, ...joinRoutes];
