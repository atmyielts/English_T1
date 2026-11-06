// Every page of the app. Each workstream edits only its own folder's routes.tsx.
import { routes as core } from './core/routes.tsx';
import { routes as site } from './site/routes.tsx';
import { routes as people } from './people/routes.tsx';
import { routes as hiring } from './hiring/routes.tsx';
import { routes as training } from './training/routes.tsx';
import { routes as insights } from './insights/routes.tsx';
import { routes as staff } from './staff/routes.tsx';
import type { AreaRoute } from './types.ts';

export const allRoutes: AreaRoute[] = [...site, ...core, ...people, ...hiring, ...training, ...insights, ...staff];
