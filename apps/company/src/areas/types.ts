import type { ReactNode } from 'react';
import type { OrgRole } from '../../../../packages/company-core/src/mod.ts';
import type { AppKey } from '../i18n/index.ts';

/** Navigation groups in the workspace sidebar, in display order. */
export const NAV_SECTIONS = ['overview', 'me', 'people', 'hiring', 'training', 'insights'] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

/**
 * One page. `public` pages render without sign-in, `user` pages need a session,
 * `org` pages live under /w/:org and get the workspace chrome and context,
 * `staff` pages are for Schood staff.
 */
export interface AreaRoute {
  path: string;
  access: 'public' | 'user' | 'org' | 'staff';
  /** For `org` pages: roles that may open it (all when omitted). Staff may open any. */
  roles?: readonly OrgRole[];
  render: (params: Record<string, string>) => ReactNode;
  /** Shown in the workspace sidebar. `order` sorts within the section. */
  nav?: { section: NavSection; label: AppKey; order: number };
  /** Full-width page without the service header (landing, candidate test). */
  bare?: boolean;
}
