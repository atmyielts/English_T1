// Every public page of the marketing site. Pure data: the app, the sitemap test and
// the content tests all read this list, so a new page cannot be forgotten in one of them.
import { JOB_ROLES } from '../../../../../packages/company-core/src/mod.ts';

export const SITE_URL = 'https://company.schood.online';

export const INDUSTRY_SLUGS = ['hotels', 'banks', 'it-outsourcing', 'call-centres', 'retail', 'logistics', 'manufacturing', 'healthcare', 'education-centres', 'government'] as const;
export type IndustrySlug = (typeof INDUSTRY_SLUGS)[number];
export const SOLUTION_SLUGS = ['hiring', 'placement', 'training', 'reporting'] as const;
export type SolutionSlug = (typeof SOLUTION_SLUGS)[number];

/** Job roles with a level guide page. A new role in the catalogue needs its text here too; the content test says when one is missing. */
export const GUIDE_ROLES = JOB_ROLES;
export type GuideRole = (typeof GUIDE_ROLES)[number];
/** Job roles in URLs read better with hyphens. */
export const roleSlug = (role: GuideRole): string => role.replaceAll('_', '-');
export const roleFromSlug = (slug: string): GuideRole | null => GUIDE_ROLES.find((role) => roleSlug(role) === slug) ?? null;

export const HELP_AUDIENCES = ['hr', 'manager', 'employee', 'candidate'] as const;
export type HelpAudience = (typeof HELP_AUDIENCES)[number];
export const HELP_ARTICLES = [
  'start-pilot', 'departments', 'invite-people', 'import-csv', 'team-links', 'seats', 'hiring-test', 'read-candidates', 'placement', 'training-plan', 'glossary', 'reports', 'challenges-sessions', 'consent', 'plan-limits',
  'manager-view', 'manager-support',
  'join', 'take-test', 'lessons', 'roleplay', 'writing-checker', 'no-seat', 'certificate',
  'candidate-test', 'candidate-lost-link',
] as const;
export type HelpArticleId = (typeof HELP_ARTICLES)[number];
const articlesFor = (audience: HelpAudience, ids: HelpArticleId[]) => Object.fromEntries(ids.map((id) => [id, audience]));
export const HELP_AUDIENCE_OF = {
  ...articlesFor('hr', ['start-pilot', 'departments', 'invite-people', 'import-csv', 'team-links', 'seats', 'hiring-test', 'read-candidates', 'placement', 'training-plan', 'glossary', 'reports', 'challenges-sessions', 'consent', 'plan-limits']),
  ...articlesFor('manager', ['manager-view', 'manager-support']),
  ...articlesFor('employee', ['join', 'take-test', 'lessons', 'roleplay', 'writing-checker', 'no-seat', 'certificate']),
  ...articlesFor('candidate', ['candidate-test', 'candidate-lost-link']),
} as Record<HelpArticleId, HelpAudience>;
/** The workspace screen an article is about, for "open this screen" inside the app. */
export const HELP_SCREEN: Record<HelpArticleId, string | null> = {
  'start-pilot': null, departments: 'departments', 'invite-people': 'people', 'import-csv': 'people', 'team-links': 'people', seats: 'people',
  'hiring-test': 'hiring', 'read-candidates': 'hiring', placement: 'placement', 'training-plan': 'training', glossary: 'glossary-admin', reports: 'reports',
  'challenges-sessions': 'challenges', consent: 'people', 'plan-limits': 'settings',
  'manager-view': 'people', 'manager-support': 'training',
  join: null, 'take-test': 'tests', lessons: 'learn', roleplay: 'roleplay', 'writing-checker': 'writing', 'no-seat': 'me', certificate: 'tests',
  'candidate-test': null, 'candidate-lost-link': null,
};

/** Pages search engines may index, without language parameters. */
export const PUBLIC_PATHS: readonly string[] = [
  '/', '/check', '/guide', '/calculator', '/sample-report', '/help', '/compare', '/privacy', '/terms', '/security', '/for', '/solutions',
  ...SOLUTION_SLUGS.map((slug) => `/solutions/${slug}`),
  ...INDUSTRY_SLUGS.map((slug) => `/for/${slug}`),
  ...GUIDE_ROLES.map((role) => `/guide/${roleSlug(role)}`),
  ...HELP_ARTICLES.map((id) => `/help/${id}`),
];
