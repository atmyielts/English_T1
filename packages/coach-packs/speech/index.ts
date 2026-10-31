import { definePack } from '../src/validate.ts';
import { diagnostic } from './diagnostic.ts';
import { drills } from './drills.ts';
import { lessons } from './lessons.ts';
import { manifest } from './manifest.ts';
import { fluency, milestones, plan, reminders } from './plan.ts';
import { roleplays } from './roleplays.ts';
import { rubrics } from './rubrics.ts';
import { samples } from './samples.ts';
import { shadowing } from './shadowing.ts';
import { speaking } from './speaking.ts';

// B6 Public Speaking Coach. Topics, cue cards, questioners, drills and lessons are
// original Schood material; people and organisations are invented for practice.
// Practice text is in Uzbek, Russian and English (T() in each file, split here by
// definePack).
export default definePack({
  manifest,
  diagnostic,
  rubrics,
  activities: [...speaking, ...roleplays, ...shadowing, ...drills, ...lessons],
  questionTypes: [],
  fluency,
  plan,
  reminders,
  milestones,
  samples,
});
