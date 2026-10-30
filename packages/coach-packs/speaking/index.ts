import { definePack } from '../src/validate.ts';
import { diagnostic } from './diagnostic.ts';
import { drills } from './drills.ts';
import { manifest } from './manifest.ts';
import { phrases } from './phrases.ts';
import { fluency, milestones, plan, reminders } from './plan.ts';
import { roleplays } from './roleplays.ts';
import { rubrics } from './rubrics.ts';
import { samples } from './samples.ts';
import { shadowing } from './shadowing.ts';

// B2 English Speaking Partner. Scenarios, personas and phrases are original Schood material.
export default definePack({
  manifest,
  diagnostic,
  rubrics,
  activities: [...roleplays, ...phrases, ...shadowing, ...drills],
  questionTypes: [],
  fluency,
  plan,
  reminders,
  milestones,
  samples,
});
