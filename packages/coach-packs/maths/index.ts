import { definePack } from '../src/validate.ts';
import { algebraBanks } from './bank-algebra.ts';
import { appliedBanks } from './bank-applied.ts';
import { functionBanks } from './bank-functions.ts';
import { geometryBanks } from './bank-geometry.ts';
import { numbersBanks } from './bank-numbers.ts';
import { mocks, questionTypes } from './bank.ts';
import { diagnostic } from './diagnostic.ts';
import { drills } from './drills.ts';
import { lessons } from './lessons.ts';
import { manifest } from './manifest.ts';
import { fluency, milestones, plan, reminders } from './plan.ts';
import { rubrics } from './rubrics.ts';
import { samples } from './samples.ts';
import { photoHelp, writing } from './writing.ts';

// B3 Admission Maths Coach. Problems, method cards, drills and solutions are original
// Schood material; every answer is checked by computation in
// packages/coach-packs/test/maths-answers.test.ts. Practice text is in Uzbek and Russian
// (T() in each file, split here by definePack).
export default definePack({
  manifest,
  diagnostic,
  rubrics,
  activities: [...numbersBanks, ...algebraBanks, ...functionBanks, ...appliedBanks, ...geometryBanks, ...mocks, ...writing, photoHelp, ...drills, ...lessons],
  questionTypes,
  fluency,
  plan,
  reminders,
  milestones,
  samples,
  percentile: { rubric: 'admission.mock', windowDays: 30 },
});
