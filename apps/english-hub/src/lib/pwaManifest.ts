import { SKILLS, type SkillKey } from './skills.ts';

/**
 * Each skill is also its own installable app ("Schood Speaking"): same origin,
 * same account and data, its own manifest, icon and colour. These helpers are
 * pure so they can be tested without a browser.
 */

/** Matches .en-workspace.is-<skill> --skill-accent in english.css and scripts/build-pwa-icons.mjs. */
export const SKILL_THEME: Record<SkillKey, string> = {
  reading: '#4e6d3b',
  listening: '#1f537a',
  writing: '#8a4f1d',
  speaking: '#7a2531',
  grammar: '#2f4384',
  vocabulary: '#236a5f',
  immersion: '#7a5a1f',
};

export const HUB_THEME = '#0e4955';

export type AppManifest = {
  skill: SkillKey | null;
  href: string;
  themeColor: string;
  appleIcon: string;
  title: string;
};

const SKILL_APP_TITLE: Record<SkillKey, string> = {
  reading: 'Schood Reading',
  listening: 'Schood Listening',
  writing: 'Schood Writing',
  speaking: 'Schood Speaking',
  grammar: 'Schood Grammar',
  vocabulary: 'Schood Vocabulary',
  immersion: 'Schood Immersion',
};

/** The skill a path belongs to: "/speaking/lesson/3" → speaking; hub pages → null. */
export const skillOfPath = (pathname: string): SkillKey | null => {
  const first = pathname.split('/')[1] ?? '';
  return SKILLS.find((skill) => skill.key === first)?.key ?? null;
};

/** Which installable app a page offers: the skill's own app inside /<skill>, otherwise Schood English. */
export const manifestFor = (pathname: string): AppManifest => {
  const skill = skillOfPath(pathname);
  if (!skill) {
    return {
      skill: null,
      href: '/manifest.webmanifest',
      themeColor: HUB_THEME,
      appleIcon: '/icons/apple-touch-icon.png',
      title: 'Schood English',
    };
  }
  return {
    skill,
    href: `/manifests/${skill}.webmanifest`,
    themeColor: SKILL_THEME[skill],
    appleIcon: `/icons/${skill}-180.png`,
    title: SKILL_APP_TITLE[skill],
  };
};

/** The built entry script in an index.html ("/assets/index-abc.js"), used to notice a new deploy. */
export const entryScriptFrom = (html: string): string | null => {
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\btype=["']module["']/i.test(tag)) continue;
    const src = /\bsrc=["'](\/assets\/[^"']+)["']/i.exec(tag)?.[1];
    if (src) return src;
  }
  return null;
};

/** A new build is live when both entries are known and differ. Dev builds (no /assets entry) never prompt. */
export const isNewBuild = (current: string | null, latest: string | null): boolean =>
  Boolean(current && latest && current !== latest);

export type InstallCardInput = {
  standalone: boolean;
  dismissed: boolean;
  visits: number;
  canPrompt: boolean;
  ios: boolean;
};

/** The Today install card: from the 2nd visit, when this device can actually install, until dismissed. */
export const shouldShowInstallCard = ({ standalone, dismissed, visits, canPrompt, ios }: InstallCardInput): boolean =>
  !standalone && !dismissed && visits >= 2 && (canPrompt || ios);

/** iPhone, iPod, or an iPad that reports itself as a Mac. */
export const isIosDevice = (userAgent: string, platform: string, maxTouchPoints: number): boolean =>
  /iphone|ipad|ipod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
