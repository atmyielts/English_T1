// engage text in English that the app shell needs before any engage page loads: nav labels
// and page titles. Keys start with `engage.`; uz.ts and ru.ts must have the same keys. The
// text of the pages themselves is in pages.en.ts, loaded with the page chunks (lazy.ts).
export const en = {
  'engage.nav.progress': 'Progress',
  'engage.nav.journeys': 'Journeys',
  'engage.nav.stories': 'Stories',
  'engage.nav.league': 'League',
  'engage.nav.squads': 'Squad',
  'engage.nav.path': 'Lifetime path',
  'engage.nav.passport': 'Skill Passport',
  'engage.nav.events': 'Season and events',
  'engage.nav.boards': 'Leaderboards',
  'engage.nav.certificates': 'Certificates',
  'engage.nav.thenNow': 'Then vs now',
  'engage.progress.title': 'Your progress',
  'engage.league.title': 'Weekly league',
  'engage.memory.title': 'What the coach remembers',
  'engage.settings.title': 'Progress settings',
  'engage.journeys.title': 'Journeys',
  'engage.path.title': 'Your lifetime path',
  'engage.squad.title': 'Your squad',
  'engage.boards.title': 'Leaderboards',
  'engage.events.title': 'Season and events',
  'engage.story.title': 'Stories',
  'engage.thenNow.title': 'Then vs now',
  'engage.passport.title': 'Skill Passport',
  'engage.passport.publicEyebrow': 'Skill Passport',
  'engage.verify.title': 'Check a Skill Certificate',
  'engage.cert.title': 'Skill Certificates',
  'engage.review.title': 'Reviewer queue',
  'engage.talent.title': 'Talent pool',
} satisfies Record<string, string>;
export type EngageKey = keyof typeof en;
