import { definePack } from '../src/validate.ts';
import { diagnostic } from './diagnostic.ts';
import { drills } from './drills.ts';
import { listening } from './listening.ts';
import { manifest } from './manifest.ts';
import { fluency, milestones, plan, reminders } from './plan.ts';
import { questionTypes } from './question-types.ts';
import { reading } from './reading.ts';
import { rubrics } from './rubrics.ts';
import { samples } from './samples.ts';
import { speaking } from './speaking.ts';
import { vocabulary } from './vocabulary.ts';
import { writing } from './writing.ts';

// B1 IELTS Coach. Content is original Schood material written to the public IELTS
// format; nothing is copied from published exam books.
export default definePack({
  manifest,
  diagnostic,
  rubrics,
  activities: [...speaking, ...writing, ...reading, ...listening, ...vocabulary, ...drills],
  questionTypes,
  fluency,
  plan,
  reminders,
  milestones,
  samples,
});
