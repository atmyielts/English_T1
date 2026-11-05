import { definePack } from '../src/validate.ts';
import { diagnostic } from './diagnostic.ts';
import { drills } from './drills.ts';
import { lessons } from './lessons.ts';
import { manifest } from './manifest.ts';
import { fluency, milestones, plan, reminders } from './plan.ts';
import { ownProduct, roleplays } from './roleplays.ts';
import { rubrics } from './rubrics.ts';
import { samples } from './samples.ts';
import { scriptBuilder } from './script.ts';
import { writing } from './writing.ts';

// B4 Sales Coach. Buyers, scenarios, drills and lessons are original Schood material;
// people, shops and figures are invented for practice. Practice text is in Uzbek,
// Russian and English (T() in each file, split here by definePack).
export default definePack({
  manifest,
  diagnostic,
  rubrics,
  activities: [...roleplays, ownProduct, ...drills, ...lessons, ...writing],
  questionTypes: [],
  fluency,
  plan,
  reminders,
  milestones,
  samples,
  scriptBuilder,
});
