import type { Cefr, TodaySkill } from './english-today.ts';

export type DueCompetency = {
  slug: string;
  skill: TodaySkill;
  level: Cefr;
  title: string;
  due_at: string;
  kind?: 'production';
  stage?: 2 | 3 | 4;
  needs_grammar?: boolean;
};

type DueCompetencyClient = {
  rpc: (
    name: 'english_due_competency' | 'english_due_production',
    args: { p_user: string; p_skills: TodaySkill[] },
  ) => PromiseLike<{ data: DueCompetency | null; error: { code?: string } | null }>;
};

export const competencyActionHref = ({ slug, kind }: Pick<DueCompetency, 'slug' | 'kind'>): string =>
  kind === 'production' ? `/mastery/transfer/${encodeURIComponent(slug)}` : `/mastery/${encodeURIComponent(slug)}`;

export const competencyActionDetail = (action: DueCompetency): string | null => {
  if (action.kind !== 'production') return null;
  if (action.needs_grammar) return 'grammar_prerequisite';
  if (action.skill === 'speaking') return action.stage === 2 ? 'spoken_transfer' : 'spoken_recheck';
  return action.stage === 2 ? 'first_transfer' : 'writing_recheck';
};

const readAction = async (
  sb: DueCompetencyClient, name: 'english_due_competency' | 'english_due_production', userId: string, skills: TodaySkill[],
): Promise<DueCompetency | null> => {
  const { data, error } = await sb.rpc(name, { p_user: userId, p_skills: skills });
  if (!error) return data;
  if (error.code !== 'PGRST202' && error.code !== '42883') {
    console.warn('English assessment projection unavailable', { function: name, code: error.code });
  }
  return null;
};

/** A class or daily free allowance cannot open an independent paid check. */
export const loadDueCompetency = async (
  sb: DueCompetencyClient,
  userId: string,
  ownedSkills: TodaySkill[],
  availableSkills: TodaySkill[],
): Promise<DueCompetency | null> => {
  const skills = ownedSkills.filter((skill) => availableSkills.includes(skill));
  if (!skills.includes('grammar')) return null;
  const productionSkills = skills.filter((skill) => skill === 'writing' || skill === 'speaking');
  const [grammar, production] = await Promise.all([
    readAction(sb, 'english_due_competency', userId, ['grammar']),
    productionSkills.length ? readAction(sb, 'english_due_production', userId, ['grammar', ...productionSkills]) : null,
  ]);
  if (!grammar || !production) return grammar ?? production;
  // An already-due check comes before an unfinished first transfer.
  return production.stage !== 2 && Date.parse(production.due_at) < Date.parse(grammar.due_at) ? production : grammar;
};
