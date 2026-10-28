import type { TranslationKey } from '../i18n/locales/en';

// The exam families Schood sells (IELTS, SAT and TOEFL). Product slugs match products.metadata.slug;
// urls are the fallback when the live product row (metadata.app_url) is not
// loaded. Complete bundles are bought on the platform pricing page.
// Bundle membership mirrors supabase/functions/_shared/product-bundles.ts.

export type ExamFamilyKey = 'ielts' | 'sat' | 'toefl';
export type ExamFamilyRole = 'simulator' | 'practice' | 'playbook' | 'complete';

export type ExamFamilyMember = {
  role: ExamFamilyRole;
  slug: string;
  /** Product name (brand name, not translated). */
  name: string;
  url: string;
  descKey: TranslationKey;
};

export type ExamFamily = {
  key: ExamFamilyKey;
  titleKey: TranslationKey;
  discoveryPath: string;
  members: ExamFamilyMember[];
};

export const EXAM_FAMILIES: ExamFamily[] = [
  {
    key: 'ielts',
    titleKey: 'examFamily.ielts.title',
    discoveryPath: '/ielts',
    members: [
      { role: 'simulator', slug: 'ielts-academic-simulator', name: 'IELTS Simulator', url: 'https://ielts.schood.online', descKey: 'examFamily.ielts.simulator' },
      { role: 'practice', slug: 'ielts-practice', name: 'IELTS Practice', url: 'https://practice.ielts.schood.online', descKey: 'examFamily.ielts.practice' },
      { role: 'playbook', slug: 'ielts-playbook', name: 'IELTS Playbook', url: 'https://playbook.ielts.schood.online', descKey: 'examFamily.ielts.playbook' },
      { role: 'complete', slug: 'ielts-complete', name: 'IELTS Complete', url: '/pricing?product=ielts-complete', descKey: 'examFamily.ielts.complete' },
    ],
  },
  {
    key: 'sat',
    titleKey: 'examFamily.sat.title',
    discoveryPath: '/sat',
    members: [
      { role: 'simulator', slug: 'sat-exam-simulator', name: 'SAT Simulator', url: 'https://sat.schood.online', descKey: 'examFamily.sat.simulator' },
      { role: 'practice', slug: 'sat-practice', name: 'SAT Practice', url: 'https://practice.sat.schood.online', descKey: 'examFamily.sat.practice' },
      { role: 'playbook', slug: 'sat-playbook', name: 'SAT Playbook', url: 'https://playbook.sat.schood.online', descKey: 'examFamily.sat.playbook' },
      { role: 'complete', slug: 'sat-complete', name: 'SAT Complete', url: '/pricing?product=sat-complete', descKey: 'examFamily.sat.complete' },
    ],
  },
  {
    key: 'toefl',
    titleKey: 'examFamily.toefl.title',
    discoveryPath: '/toefl',
    members: [
      { role: 'simulator', slug: 'toefl-ibt-simulator', name: 'TOEFL Simulator', url: 'https://toefl.schood.online', descKey: 'examFamily.toefl.simulator' },
      { role: 'playbook', slug: 'toefl-playbook', name: 'TOEFL Playbook', url: 'https://playbook.toefl.schood.online', descKey: 'examFamily.toefl.playbook' },
      { role: 'complete', slug: 'toefl-complete', name: 'TOEFL Complete', url: '/pricing?product=toefl-complete', descKey: 'examFamily.toefl.complete' },
    ],
  },
];

export const examFamilyByKey = (key: string | null | undefined): ExamFamily | null =>
  EXAM_FAMILIES.find((family) => family.key === key) ?? null;

export const examFamilyForSlug = (slug: string | null | undefined): ExamFamily | null =>
  slug ? EXAM_FAMILIES.find((family) => family.members.some((member) => member.slug === slug)) ?? null : null;

export const roleLabelKey = (role: ExamFamilyRole): TranslationKey => `examFamily.role.${role}` as TranslationKey;

export const pricingPathForSlug = (slug: string, returnTo?: string): string => {
  const qs = new URLSearchParams({ product: slug });
  if (returnTo) qs.set('returnTo', returnTo);
  return `/pricing?${qs.toString()}`;
};

type ProductLike = { metadata?: Record<string, unknown> | null };

/** The member's live app_url when its product row is loaded, else the static url. */
export const memberUrl = (member: ExamFamilyMember, productsBySlug?: Map<string, ProductLike>): string => {
  if (member.role === 'complete') return member.url;
  const meta = productsBySlug?.get(member.slug)?.metadata ?? null;
  const live = meta && typeof meta.app_url === 'string' ? meta.app_url.trim() : '';
  return live || member.url;
};
