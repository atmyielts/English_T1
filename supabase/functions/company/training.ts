// Training routes (docs/product/45_COMPANY_ENGLISH.md §3.2): job-role tracks and
// lessons, My English home, AI role-play, writing checker, company glossary and
// the HR training plan. Content lives in ./training/tracks/.
import type { Route } from './types.ts';
import { routes as lessons } from './training/lessons.ts';
import { routes as home } from './training/home.ts';
import { routes as roleplay } from './training/roleplay.ts';
import { routes as writing } from './training/writing.ts';
import { routes as glossary } from './training/glossary.ts';
import { routes as assignments } from './training/assignments.ts';

export const routes: Route[] = [...lessons, ...home, ...roleplay, ...writing, ...glossary, ...assignments];
