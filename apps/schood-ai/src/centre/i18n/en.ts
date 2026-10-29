// centre text in English. Keys start with `centre.` (and `error.<code>` for the
// centre's refusals); uz.ts and ru.ts have every key of this file and of
// en-pages.ts. Numbers use {count|one:…|other:…} plurals.
//
// Only what shows before a centre screen opens lives here (navigation, page titles,
// home cards and the material kind), because core puts this catalog in the first
// download. The screens' English is in en-pages.ts and arrives with the
// screens (see kit.tsx `useT`). When core loads area English on demand, merge
// en-pages.ts back into this file and delete the adapter.
import type { PageKey } from './en-pages.ts';

export const en = {
  'centre.nav.overview': 'Centre overview', 'centre.nav.people': 'People and seats', 'centre.nav.groups': 'Groups and rules', 'centre.nav.office': 'Office',
  'centre.nav.admissions': 'Admissions agent', 'centre.nav.marketing': 'Marketing', 'centre.nav.placement': 'Placement tests', 'centre.nav.curriculum': 'Curriculum',
  'centre.nav.knowledge': 'Staff knowledge', 'centre.nav.observations': 'Lesson observations', 'centre.nav.insights': 'Insights', 'centre.nav.brief': 'Monday brief',
  'centre.nav.resell': 'Resell to students', 'centre.nav.style': 'Brand and website', 'centre.nav.admin': 'Admin', 'centre.nav.keys': 'Own model keys',
  'centre.nav.classes': 'My classes', 'centre.nav.myCentre': 'My centre',
  'centre.home.setup.eyebrow': 'Education centres', 'centre.home.setup.lead': 'Run a centre? Set up a centre workspace for your teachers and students, or join one with an invite code.',
  'centre.home.centre.eyebrow': 'Your centre today', 'centre.home.centre.lead': 'Seats, credits, approvals and Academy numbers in one place.',
  'centre.home.teacher.eyebrow': 'Your classes', 'centre.home.teacher.lead': 'See missed homework and absences in your groups and ask the teacher assistant about them.',
  'centre.home.student.lead': 'Your study assistant from {centre}: explanations, practice, word lists and readings at your level.', 'centre.home.student.open': 'Ask {name}',
  'centre.kind.placement': 'Placement test',
  'centre.gate.create': 'Set up a centre', 'centre.gate.join': 'Join with a code',
  'centre.setup.title': 'Set up your centre',
  'centre.join.title': 'Join a centre',
  'centre.take.title': 'Placement test',
} satisfies Record<string, string>;
export type CentreKey = keyof typeof en | PageKey;
