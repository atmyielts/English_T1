// Coach routes (orgs/:org/coach/...): the daily plan, phrase deck and spaced review, phrase
// finder, situation phrasebook, shadowing, streaks and badges, and the opt-in team feed.
import type { Route } from './types.ts';
import { routes as today } from './coach/today.ts';
import { routes as deck } from './coach/deck.ts';
import { routes as finder } from './coach/finder.ts';
import { routes as practice } from './coach/practice.ts';
import { routes as progress } from './coach/progress.ts';
import { routes as team } from './coach/team.ts';
import { routes as adoption } from './coach/adoption.ts';

export const routes: Route[] = [...today, ...deck, ...finder, ...practice, ...progress, ...team, ...adoption];
