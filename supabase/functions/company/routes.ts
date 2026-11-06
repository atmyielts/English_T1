// Every area's routes, in one list. Order matters only between identical paths.
import { routes as core } from './core.ts';
import { routes as people } from './people.ts';
import { routes as hiring } from './hiring.ts';
import { routes as training } from './training.ts';
import { routes as insights } from './insights.ts';
import { routes as staff } from './staff.ts';
import { routes as site } from './site.ts';
import type { Route } from './types.ts';

export const allRoutes: Route[] = [...core, ...people, ...hiring, ...training, ...insights, ...staff, ...site];
