// The interview kit: follow-up questions for one candidate, aimed at their weak skills and
// their job. AI writes them when it can; the built-in bank always gives a full kit, so the
// feature works with AI switched off. The AI sees levels and the job, never names or contacts.
import { JOB_ROLES, isSkill, type JobRole, type Skill } from '../../../../packages/company-core/src/mod.ts';
import { consumeAi } from '../core.ts';
import type { Ctx } from '../types.ts';
import { storable } from '../util.ts';
import type { InterviewKit } from './ats.ts';
import type { AttemptRow } from './attempts.ts';
import { weakSkills, type Benchmark } from './benchmark.ts';
import { LISTEN_FOR, ROLE_LISTEN_FOR, ROLE_QUESTIONS, SKILL_QUESTIONS, type Band, type BankQuestion } from './interviewBank.ts';
import type { MessageLocale } from './messages.ts';

const PER_SKILL = 2;
const FROM_ROLE = 3;
export const MAX_QUESTIONS = 10;

/** A small stable hash, so a candidate keeps the same bank questions until HR asks for another set. */
function hash(value: string): number {
  let out = 0;
  for (let index = 0; index < value.length; index++) out = (out * 31 + value.charCodeAt(index)) >>> 0;
  return out;
}

function pick(list: BankQuestion[], count: number, seed: number): BankQuestion[] {
  return Array.from({ length: Math.min(count, list.length) }, (_, index) => list[(seed + index) % list.length]);
}

const bandOf = (fit: Benchmark): Band => (fit.overall.score ?? 0) >= 60 ? 'deeper' : 'basic';

/** The kit from the bank alone. */
export function bankKit(jobRole: string, fit: Benchmark, locale: MessageLocale, seed: string, at: string, reason: InterviewKit['reason'] = null): InterviewKit {
  const role: JobRole = (JOB_ROLES as readonly string[]).includes(jobRole) ? jobRole as JobRole : 'general';
  const number = hash(seed);
  const weak = weakSkills(fit);
  const band = bandOf(fit);
  const questions: InterviewKit['questions'] = [];
  for (const skill of weak) {
    for (const entry of pick(SKILL_QUESTIONS[skill][band], PER_SKILL, number)) questions.push({ skill, ...entry, listen_for: LISTEN_FOR[skill][locale] });
  }
  for (const entry of pick(ROLE_QUESTIONS[role] ?? ROLE_QUESTIONS.general, FROM_ROLE, number)) questions.push({ skill: 'role', ...entry, listen_for: ROLE_LISTEN_FOR[locale] });
  return { source: 'bank', reason, locale, created_at: at, weak, questions };
}

const LANGUAGE: Record<MessageLocale, string> = { en: 'English', ru: 'Russian', uz: 'Uzbek (Latin script)' };

function systemPrompt(locale: MessageLocale): string {
  return `You help an HR specialist prepare a short face-to-face interview that checks a job candidate's spoken English. Write original questions for this job. Reply with strict JSON only: {"questions":[{"skill":"<one of the given weak skills, or \\"role\\" for a situation from the job>","question":"<in plain English, one or two sentences, at the candidate's level>","follow_up":"<one short follow-up in English>","listen_for":"<one sentence in ${LANGUAGE[locale]}: what the interviewer should listen for>"}]}. Give 6 to 8 questions: most on the weak skills, three on situations from the job. Do not ask about age, family, religion, ethnicity, health or marital status. Do not mention scores to the candidate.`;
}

/** The model's reply as a kit's questions; null when it is not usable. */
export function parseKit(data: unknown): InterviewKit['questions'] | null {
  const raw = (data as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(raw)) return null;
  const clean = (value: unknown, max: number) => typeof value === 'string' ? storable(value).trim().slice(0, max) : '';
  const questions = raw.slice(0, MAX_QUESTIONS).flatMap((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const question = clean(item.question, 400);
    if (!question) return [];
    return [{ skill: isSkill(item.skill) ? String(item.skill) : 'role', question, follow_up: clean(item.follow_up, 300), listen_for: clean(item.listen_for, 300) }];
  });
  return questions.length >= 3 ? questions : null;
}

export async function generateKit(ctx: Ctx, input: { jobRole: string; title: string; fit: Benchmark; attempt: AttemptRow | null; locale: MessageLocale; seed: string }): Promise<InterviewKit> {
  const at = ctx.now().toISOString();
  const { jobRole, fit, attempt, locale, seed } = input;
  const fallback = (reason: InterviewKit['reason']) => bankKit(jobRole, fit, locale, seed, at, reason);
  if (!(await consumeAi(ctx))) return fallback('ai_limit');
  const improvements = (skill: 'writing' | 'speaking') => attempt?.ai_feedback?.[skill]?.improvements ?? [];
  const reply = await ctx.ai<unknown>({
    systemPrompt: systemPrompt(locale),
    userPayload: JSON.stringify({
      job_role: jobRole, vacancy: input.title, weak_skills: weakSkills(fit) as Skill[],
      skills: fit.skills.map((entry) => ({ skill: entry.skill, level: entry.level, required: entry.required })),
      overall_level: fit.overall.level,
      noted_weaknesses: [...improvements('writing'), ...improvements('speaking')].slice(0, 6),
    }),
    temperature: 0.6,
    feature: 'company-interview-kit',
    userId: ctx.user,
  }, null);
  if (reply.status !== 'ok') return fallback('ai_unavailable');
  const questions = parseKit(reply.data);
  if (!questions) return fallback('ai_unavailable');
  return { source: 'ai', reason: null, locale, created_at: at, weak: weakSkills(fit), questions };
}
