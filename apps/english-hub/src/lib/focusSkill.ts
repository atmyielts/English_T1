import { SKILLS, type Skill, type SkillKey } from './skills.ts';

/**
 * A learner who bought exactly one skill gets that skill first in navigation and
 * on Today. Nothing is hidden: the other skills keep their free try and upgrade path.
 */
export const focusSkillOf = (access: { status: string; unlocked: ReadonlySet<SkillKey> }): SkillKey | null => {
  if (access.status !== 'ready' || access.unlocked.size !== 1) return null;
  const [only] = [...access.unlocked];
  return only ?? null;
};

/** The focus skill first, the rest in their usual order. */
export const orderSkills = <T extends Pick<Skill, 'key'>>(skills: readonly T[], focus: SkillKey | null): T[] => {
  if (!focus) return [...skills];
  return [...skills.filter((skill) => skill.key === focus), ...skills.filter((skill) => skill.key !== focus)];
};

/** All seven skills for a learner, the single bought skill first. For any navigation shell. */
export const orderedSkills = (unlocked: ReadonlySet<SkillKey>): Skill[] =>
  orderSkills(SKILLS, focusSkillOf({ status: 'ready', unlocked }));
