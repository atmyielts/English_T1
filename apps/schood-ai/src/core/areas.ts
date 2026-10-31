import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Me } from './types.ts';

// What a feature area adds to the app. Each area's routes.tsx exports `routes`,
// `nav` and `homeCards`; App.tsx merges them. Labels are i18n keys from the area's
// own catalog. Core decides who sees what: an item shows when its audience matches
// and, if it names a feature, when the plan matrix allows it (locked items show a
// plan gate instead of disappearing).
//
// Keep areas out of the first download: name nav icons (`icon: 'PenLine'`) from a lazy
// `icons` module, and give home cards a `component` loader instead of `render`.

export type Audience = 'learner' | 'parent' | 'teacher' | 'centre';

export interface AreaRoute {
  /** `/write`, `/studio/:id`, `/coach/:pack`. Matched before core routes. */
  path: string;
  component: ComponentType<{ params: Record<string, string> }>;
  /** i18n key for the document title. */
  title: string;
  /** Who may open it; omitted means everyone signed in. */
  audiences?: Audience[];
  /** Feature id from the ai-core plan matrix; a locked feature renders the plan gate. */
  feature?: string;
  /** Open without signing in (landing pages, shared certificates). */
  public?: boolean;
  /** Full-bleed focus mode (dark navy) for editors and quiz screens. */
  focus?: boolean;
}
export interface AreaNavItem {
  id: string;
  path: string;
  /** i18n key. */
  label: string;
  /** A Lucide icon, or (better) its name in the area's lazy `icons` module, which keeps icons out of the first download. */
  icon?: LucideIcon | string;
  audiences: Audience[];
  feature?: string;
  /** Sidebar group; defaults to the area's audience. */
  group?: 'core' | 'learner' | 'parent' | 'teacher' | 'centre' | 'coach';
}
export interface HomeCard {
  id: string;
  audiences: Audience[];
  feature?: string;
  /** Renders inline: its code ships in the first download. */
  render?: (me: Me) => ReactNode;
  /** Or loads on demand (`() => import('./WritingCard.tsx')`, default export `({ me }) => …`); a placeholder shows meanwhile. */
  component?: () => Promise<{ default: ComponentType<{ me: Me }> }>;
}
export interface AreaRegistry {
  routes: AreaRoute[];
  nav: AreaNavItem[];
  homeCards: HomeCard[];
  /** The icons nav items name, loaded after the first paint: `() => import('./icons.ts')` exporting `{ PenLine, … }`. */
  icons?: () => Promise<Record<string, LucideIcon>>;
}
