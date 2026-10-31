import { definePack } from '../src/validate.ts';
import { diagnostic } from './diagnostic.ts';
import { drills } from './drills.ts';
import { facts } from './facts.ts';
import { interview } from './interview.ts';
import { lessons } from './lessons.ts';
import { manifest } from './manifest.ts';
import { fluency, milestones, plan, reminders } from './plan.ts';
import { roleplays } from './roleplays.ts';
import { rubrics } from './rubrics.ts';
import { samples } from './samples.ts';
import { writing } from './writing.ts';

// B5 Career and Interview Coach. Interview questions, interviewers, CV and letter tasks,
// drills and lessons are original Schood material; employers, people and figures are
// invented for practice. Visa facts come only from the dated, sourced datasets in
// facts.ts. Practice text is in Uzbek, Russian and English (T() in each file, split here
// by definePack).
export default definePack({
  manifest,
  diagnostic,
  rubrics,
  activities: [...interview, ...roleplays, ...writing, ...drills, ...lessons],
  questionTypes: [],
  fluency,
  plan,
  reminders,
  milestones,
  samples,
  facts,
});
