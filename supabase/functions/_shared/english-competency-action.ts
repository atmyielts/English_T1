import type { Cefr, TodaySkill } from './english-today.ts';

export type DueCompetency = {
  slug: string;
  skill: TodaySkill;
  level: Cefr;
  title: string;
  due_at: string;
};

type DueCompetencyClient = {
  rpc: (
    name: 'english_due_competency',
    args: { p_user: string; p_skills: TodaySkill[] },
  ) => PromiseLike<{ data: DueCompetency | null; error: { code?: string } | null }>;
};

/** A class or daily free allowance cannot open an independent paid check. */
export const loadDueCompetency = async (
  sb: DueCompetencyClient,
  userId: string,
  ownedSkills: TodaySkill[],
  availableSkills: TodaySkill[],
): Promise<DueCompetency | null> => {
  // Select only skills served by the assessment endpoint.
  const skills = ownedSkills.filter((skill) => skill === 'grammar' && availableSkills.includes(skill));
  if (!skills.length) return null;

  const { data, error } = await sb.rpc('english_due_competency', { p_user: userId, p_skills: skills });
  if (!error) return data;
  // The Hub can roll forward or back independently of the additive migration.
  if (error.code !== 'PGRST202' && error.code !== '42883') {
    console.warn('english_due_competency projection unavailable', { code: error.code });
  }
  return null;
};
