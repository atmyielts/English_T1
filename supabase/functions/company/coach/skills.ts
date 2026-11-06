// The skills a person's last company test shows most need work. Plans and review lean on them.
import { isSkill, type Skill } from '../../../../packages/company-core/src/mod.ts';
import { check, type Ctx, type MemberRow } from '../types.ts';
import type { ReviewMode } from './srs.ts';

/** The lowest two, if they are below B2 on the Schood scale. */
export async function weakSkills(ctx: Ctx, member: MemberRow): Promise<Skill[]> {
  const latest = check<{ skill_results: Record<string, { score?: unknown }> | null } | null>(
    await ctx.db.from('company_attempts').select('skill_results').eq('org_id', ctx.org!.id).eq('member_id', member.id).eq('status', 'graded').order('graded_at', { ascending: false }).limit(1).maybeSingle(),
  );
  return Object.entries(latest?.skill_results ?? {})
    .map(([skill, result]) => ({ skill, score: Number(result?.score) }))
    .filter((entry): entry is { skill: Skill; score: number } => isSkill(entry.skill) && Number.isFinite(entry.score) && entry.score < 65)
    .sort((a, b) => a.score - b.score).slice(0, 2).map((entry) => entry.skill);
}

/** A weak skill turns plain recall into the way of asking that trains it. */
export function modeForSkills(mode: ReviewMode, weak: readonly Skill[]): ReviewMode {
  if (mode !== 'recall') return mode;
  if (weak[0] === 'listening') return 'listen';
  if (weak[0] === 'writing' || weak[0] === 'grammar') return 'type';
  return mode;
}
