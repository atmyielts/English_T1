import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Me } from './types.ts';

// What a feature area adds to the app. Each area's routes.tsx exports `routes`,
// `nav` and `homeCards`; App.tsx merges them. Labels are i18n keys from the area's
// own catalog. Core decides who sees what: an item shows when its audience matches
// and, if it names a feature, when the plan matrix allows it (locked items show a
// plan gate instead of disappearing).

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
  icon?: LucideIcon;
  audiences: Audience[];
  feature?: string;
  /** Sidebar group; defaults to the area's audience. */
  group?: 'core' | 'learner' | 'parent' | 'teacher' | 'centre' | 'coach';
}
export interface HomeCard {
  id: string;
  audiences: Audience[];
  feature?: string;
  render: (me: Me) => ReactNode;
}
export interface AreaRegistry { routes: AreaRoute[]; nav: AreaNavItem[]; homeCards: HomeCard[] }
