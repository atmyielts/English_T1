// One attempt's life, shared by the public candidate flow and signed-in staff tests:
// start (reserving a test), autosave, next stage or section, submit, AI grading,
// HR re-grading and manual scores, and finishing (overall level, certificate code,
// the member's level and a `test` activity row).
import { isJobRole, isLevel, overallScore, scoreToLevel, type JobRole, type Level, type Skill } from '../../../../packages/company-core/src/mod.ts';
import { logActivity, reserveTest } from '../core.ts';
import { check, CompanyError, type Ctx, type MemberRow, type OrgRow } from '../types.ts';
import { readableCode } from '../util.ts';
import {
  ADAPTIVE_STAGES, GRACE_MS, PRODUCTION, activeIndex, advance, closeAll, cleanAnswers, createSections, editableIds, pendingSkills, toBankLevel,
  type Answers, type Results, type Section, type ServedChoice,
} from './engine.ts';
import type { BankLevel } from './bank/index.ts';
import { gradeProduction, type Feedback, type Locale, type ProductionSkill } from './grading.ts';
import { mergeIntegrity, type Integrity } from './integrity.ts';

export interface AssessmentSettings {
  /** Hiring: the candidate sees their level on the thank-you page. Placement: always true. */
  show_level?: boolean;
  /** Placement/progress: who takes it. */
  audience?: { type: 'all' | 'departments' | 'members'; ids: string[] };
  /** Placement/progress: days after a graded attempt before the member may test again (null = once). */
  retest_days?: number | null;
  /** Placement/progress: tailor vocabulary, writing and speaking to each member's job role. */
  member_role?: boolean;
}

export interface AssessmentRow {
  id: string; org_id: string; kind: 'hiring' | 'placement' | 'progress'; title: string; job_role: string; skills: string[];
  min_level: Level | null; time_limit_minutes: number; status: 'draft' | 'open' | 'closed'; link_token_hash: string | null;
  max_attempts: number | null; closes_at: string | null; settings: AssessmentSettings; created_by: string | null; created_at: string; updated_at: string;
}

export interface AttemptFeedback {
  writing?: Feedback;
  speaking?: Feedback;
  /** Skills waiting for a grade and why. */
  pending?: Skill[];
  reason?: 'ai_limit' | 'ai_unavailable' | null;
  tried_at?: string;
}

export interface AttemptRow {
  id: string; org_id: string; assessment_id: string; member_id: string | null; user_id: string | null;
  candidate_name: string | null; candidate_email: string | null; candidate_phone: string | null; access_token_hash: string | null;
  status: 'started' | 'submitted' | 'graded' | 'expired'; started_at: string; deadline_at: string; submitted_at: string | null; graded_at: string | null;
  items: Section[]; answers: Answers; overall_level: Level | null; overall_score: number | null; skill_results: Results; ai_feedback: AttemptFeedback;
  integrity: Integrity; decision: 'shortlist' | 'hold' | 'reject' | null; decision_by: string | null; notes: string | null; certificate_code: string | null;
  created_at: string; updated_at: string;
}

export const ASSESSMENT_COLUMNS = 'id,org_id,kind,title,job_role,skills,min_level,time_limit_minutes,status,link_token_hash,max_attempts,closes_at,settings,created_by,created_at,updated_at';
export const ATTEMPT_COLUMNS = 'id,org_id,assessment_id,member_id,user_id,candidate_name,candidate_email,candidate_phone,access_token_hash,status,started_at,deadline_at,submitted_at,graded_at,items,answers,overall_level,overall_score,skill_results,ai_feedback,integrity,decision,decision_by,notes,certificate_code,created_at,updated_at';

export const settingsOf = (assessment: Pick<AssessmentRow, 'settings'>): AssessmentSettings => (assessment.settings && typeof assessment.settings === 'object' ? assessment.settings : {}) as AssessmentSettings;
export const localeOf = (org: OrgRow): Locale => {
  const locale = (org.settings as Record<string, unknown>)?.locale;
  return locale === 'en' || locale === 'uz' ? locale : 'ru';
};
/** The job role a test is tailored to: the member's own for placement when asked, else the test's. */
export const jobRoleFor = (assessment: AssessmentRow, member: Pick<MemberRow, 'job_role'> | null): JobRole => {
  const wanted = settingsOf(assessment).member_role !== false && assessment.kind !== 'hiring' && member ? member.job_role : assessment.job_role;
  return isJobRole(wanted) ? wanted : 'general';
};
const fallbackLevel = (assessment: AssessmentRow, member: Pick<MemberRow, 'level'> | null): BankLevel =>
  toBankLevel(member?.level && isLevel(member.level) ? member.level : assessment.min_level, 'b1');

/** Whether the attempt is past its deadline plus the grace period. */
export const overdue = (attempt: Pick<AttemptRow, 'deadline_at'>, now: Date) => now.getTime() > new Date(attempt.deadline_at).getTime() + GRACE_MS;
export const pastDeadline = (attempt: Pick<AttemptRow, 'deadline_at'>, now: Date) => now.getTime() > new Date(attempt.deadline_at).getTime();
/** Whether a closing date has passed. */
export const closed = (assessment: Pick<AssessmentRow, 'status' | 'closes_at'>, now: Date) =>
  assessment.status !== 'open' || (assessment.closes_at !== null && new Date(assessment.closes_at).getTime() <= now.getTime());

export async function loadAssessment(ctx: Ctx, orgId: string, id: string): Promise<AssessmentRow> {
  const row = check<AssessmentRow | null>(await ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('id', id).eq('org_id', orgId).maybeSingle());
  if (!row) throw new CompanyError('assessment_not_found', 'This test was not found.', 404);
  return row;
}

export async function loadAttempt(ctx: Ctx, orgId: string, id: string): Promise<AttemptRow> {
  const row = check<AttemptRow | null>(await ctx.db.from('company_attempts').select(ATTEMPT_COLUMNS).eq('id', id).eq('org_id', orgId).maybeSingle());
  if (!row) throw new CompanyError('attempt_not_found', 'This attempt was not found.', 404);
  return row;
}

/** Writes changes to an attempt; refuses when someone else changed it meanwhile. */
async function write(ctx: Ctx, attempt: AttemptRow, patch: Partial<AttemptRow>, guard: { status?: AttemptRow['status'] } = {}): Promise<AttemptRow> {
  let query = ctx.db.from('company_attempts').update({ ...patch, updated_at: ctx.now().toISOString() }).eq('id', attempt.id).eq('updated_at', attempt.updated_at);
  if (guard.status) query = query.eq('status', guard.status);
  const rows = check<AttemptRow[]>(await query.select(ATTEMPT_COLUMNS));
  if (!rows.length) throw new CompanyError('attempt_busy', 'This test was updated in another window. Reload and try again.', 409);
  return rows[0];
}

export async function startAttempt(ctx: Ctx, input: {
  assessment: AssessmentRow; org: OrgRow; member: MemberRow | null;
  candidate?: { name: string; email: string | null; phone: string | null }; accessHash?: string | null; integrity?: Integrity; rng?: () => number;
}): Promise<AttemptRow> {
  const { assessment, org, member } = input;
  await reserveTest(ctx.db, org.id);
  const now = ctx.now();
  const sections = createSections(assessment.skills, {
    jobRole: jobRoleFor(assessment, member), rng: input.rng ?? Math.random, now: now.toISOString(), fallback: fallbackLevel(assessment, member),
  });
  if (!sections.length) throw new CompanyError('invalid_field', 'This test has no sections.', 400, { field: 'skills' });
  return check<AttemptRow>(await ctx.db.from('company_attempts').insert({
    org_id: org.id, assessment_id: assessment.id, member_id: member?.id ?? null, user_id: member?.user_id ?? null,
    candidate_name: input.candidate?.name ?? member?.full_name ?? member?.email ?? null,
    candidate_email: input.candidate?.email ?? null, candidate_phone: input.candidate?.phone ?? null,
    access_token_hash: input.accessHash ?? null, status: 'started', started_at: now.toISOString(),
    deadline_at: new Date(now.getTime() + assessment.time_limit_minutes * 60_000).toISOString(),
    items: sections, answers: {}, skill_results: {}, ai_feedback: {}, integrity: input.integrity ?? {},
  }).select(ATTEMPT_COLUMNS).single());
}

/** Autosave: answers to the active section only (finished sections are locked) and integrity counters. */
export async function saveAttempt(ctx: Ctx, attempt: AttemptRow, body: Record<string, unknown>): Promise<AttemptRow> {
  if (attempt.status !== 'started') throw new CompanyError('attempt_finished', 'This test has already been submitted.', 409);
  const section = attempt.items[activeIndex(attempt.items)];
  const answers = { ...attempt.answers, ...cleanAnswers(section, body.answers) };
  return await write(ctx, attempt, { answers, integrity: mergeIntegrity(attempt.integrity, body.integrity) }, { status: 'started' });
}

/** Saves, then opens the next adaptive stage or the next section. Ends the test after the last one. */
export async function nextStep(ctx: Ctx, attempt: AttemptRow, assessment: AssessmentRow, org: OrgRow, member: MemberRow | null, body: Record<string, unknown>, rng: () => number = Math.random): Promise<AttemptRow> {
  const saved = await saveAttempt(ctx, attempt, body);
  const moved = advance(saved.items, saved.answers, saved.skill_results, {
    jobRole: jobRoleFor(assessment, member), rng, now: ctx.now().toISOString(), fallback: fallbackLevel(assessment, member),
  });
  const updated = await write(ctx, saved, { items: moved.sections, skill_results: moved.results }, { status: 'started' });
  return moved.finished ? await submitAttempt(ctx, updated, assessment, org, member, {}) : updated;
}

/**
 * Ends the attempt with what was saved: scores objective sections, asks AI for
 * writing and speaking, and grades it when nothing is pending. `useAi: false`
 * leaves writing and speaking pending for HR to grade (used when sweeping many).
 */
export async function submitAttempt(ctx: Ctx, attempt: AttemptRow, assessment: AssessmentRow, org: OrgRow, member: MemberRow | null, options: { auto?: boolean; useAi?: boolean; body?: Record<string, unknown> }): Promise<AttemptRow> {
  if (attempt.status !== 'started') return attempt;
  const now = ctx.now();
  let current = attempt;
  // Answers sent with the submit still count while the grace period lasts.
  if (options.body && !overdue(current, now)) current = await saveAttempt(ctx, current, options.body);
  const answered = Object.keys(current.answers).length > 0;
  const closedOut = closeAll(current.items, current.answers, current.skill_results, now.toISOString());
  const integrity: Integrity = { ...current.integrity, ...(pastDeadline(current, now) && !options.auto ? { late: true } : {}), ...(options.auto ? { auto_submitted: true } : {}) };
  if (!answered && options.auto) {
    return await write(ctx, current, { status: 'expired', submitted_at: now.toISOString(), items: closedOut.sections, skill_results: closedOut.results, integrity }, { status: 'started' });
  }
  current = await write(ctx, current, { status: 'submitted', submitted_at: now.toISOString(), items: closedOut.sections, skill_results: closedOut.results, integrity }, { status: 'started' });
  if (current.member_id) {
    const minutes = Math.max(1, Math.round((now.getTime() - new Date(current.started_at).getTime()) / 60_000));
    await logActivity(ctx.db, { org_id: org.id, member_id: current.member_id, user_id: current.user_id, kind: 'test', minutes, points: 50, ref: current.id });
  }
  return await gradeAttempt(ctx, current, assessment, org, member, { useAi: options.useAi !== false });
}

/** Grades pending writing/speaking with AI (when allowed), then finishes the attempt if nothing is left. */
export async function gradeAttempt(ctx: Ctx, attempt: AttemptRow, assessment: AssessmentRow, org: OrgRow, member: MemberRow | null, options: { useAi: boolean; force?: ProductionSkill[] }): Promise<AttemptRow> {
  if (attempt.status !== 'submitted' && attempt.status !== 'graded') return attempt;
  const results: Results = { ...attempt.skill_results };
  const feedback: AttemptFeedback = { ...attempt.ai_feedback };
  // Forced skills are graded again, but keep their old result if AI fails.
  const targets = [...new Set<Skill>([...pendingSkills(attempt.items, results), ...(options.force ?? [])])]
    .filter((skill) => (PRODUCTION as readonly string[]).includes(skill) && attempt.items.some((section) => section.skill === skill));
  let reason: AttemptFeedback['reason'] = null;
  if (options.useAi) {
    for (const skill of targets) {
      const section = attempt.items.find((candidate) => candidate.skill === skill);
      const outcome = await gradeProduction(ctx, skill as ProductionSkill, section?.tasks ?? [], attempt.answers, {
        locale: localeOf(org), jobRole: jobRoleFor(assessment, member), userId: attempt.user_id ?? ctx.user,
      });
      if ('pending' in outcome) { reason = outcome.pending; break; }
      results[skill] = outcome.result;
      if (outcome.feedback) feedback[skill as ProductionSkill] = outcome.feedback;
      else delete feedback[skill as ProductionSkill];
    }
  }
  const still = pendingSkills(attempt.items, results);
  feedback.pending = still;
  feedback.reason = still.length ? reason ?? feedback.reason ?? 'ai_unavailable' : null;
  if (options.useAi) feedback.tried_at = ctx.now().toISOString();
  return await finish(ctx, attempt, assessment, member, results, feedback);
}

/** Sets a writing or speaking score by hand (HR), then finishes the attempt if nothing is left. */
export async function manualScore(ctx: Ctx, attempt: AttemptRow, assessment: AssessmentRow, member: MemberRow | null, skill: ProductionSkill, score: number): Promise<AttemptRow> {
  if (attempt.status !== 'submitted' && attempt.status !== 'graded') throw new CompanyError('attempt_not_submitted', 'The test has not been submitted yet.', 409);
  if (!attempt.items.some((section) => section.skill === skill)) throw new CompanyError('invalid_field', 'This test has no such section.', 400, { field: 'skill' });
  const results: Results = { ...attempt.skill_results, [skill]: { score, level: scoreToLevel(score), source: 'manual', by: ctx.user, at: ctx.now().toISOString() } };
  const feedback: AttemptFeedback = { ...attempt.ai_feedback };
  feedback.pending = pendingSkills(attempt.items, results);
  if (!feedback.pending.length) feedback.reason = null;
  return await finish(ctx, attempt, assessment, member, results, feedback);
}

/** Whether the member has a later graded test, so re-grading an old one must not move their level back. */
async function newerGraded(ctx: Ctx, attempt: AttemptRow): Promise<boolean> {
  const rows = check<{ id: string }[]>(await ctx.db.from('company_attempts').select('id').eq('member_id', attempt.member_id).eq('status', 'graded')
    .gt('submitted_at', attempt.submitted_at ?? attempt.started_at).neq('id', attempt.id).limit(1));
  return rows.length > 0;
}

async function finish(ctx: Ctx, attempt: AttemptRow, assessment: AssessmentRow, member: MemberRow | null, results: Results, feedback: AttemptFeedback): Promise<AttemptRow> {
  const complete = attempt.items.every((section) => results[section.skill]);
  if (!complete) {
    return await write(ctx, attempt, { skill_results: results, ai_feedback: feedback, status: 'submitted', overall_level: null, overall_score: null });
  }
  const scores = Object.fromEntries(attempt.items.map((section) => [section.skill, results[section.skill]!.score]));
  const score = overallScore(scores) ?? 0;
  const level = scoreToLevel(score);
  const now = ctx.now().toISOString();
  const graded = await write(ctx, attempt, {
    skill_results: results, ai_feedback: feedback, status: 'graded', overall_score: score, overall_level: level,
    graded_at: attempt.graded_at ?? now, certificate_code: attempt.certificate_code ?? readableCode(),
  });
  if (graded.member_id && assessment.kind !== 'hiring' && !(await newerGraded(ctx, graded))) {
    const { error } = await ctx.db.from('company_members').update({ level, level_score: score, level_source: assessment.kind, level_at: now }).eq('id', graded.member_id).eq('org_id', graded.org_id);
    if (error) console.error(JSON.stringify({ company_hiring: 'member_level_failed', error: error.message }));
    if (member) Object.assign(member, { level, level_score: score, level_source: assessment.kind, level_at: now });
  }
  return graded;
}

/** Closes an attempt whose time ran out, with what was saved (no AI when `useAi` is false). */
export async function expireIfOverdue(ctx: Ctx, attempt: AttemptRow, assessment: AssessmentRow, org: OrgRow, member: MemberRow | null, useAi = true): Promise<AttemptRow> {
  if (attempt.status !== 'started' || !overdue(attempt, ctx.now())) return attempt;
  try {
    return await submitAttempt(ctx, attempt, assessment, org, member, { auto: true, useAi });
  } catch (cause) {
    if (cause instanceof CompanyError && cause.code === 'attempt_busy') return attempt;
    throw cause;
  }
}

const publicChoice = (item: ServedChoice) => ({ id: item.id, prompt: item.prompt, options: item.options });

/** The active section as the test page sees it: no keys, no levels, only what can still be answered. */
export function publicSection(section: Section | undefined) {
  if (!section) return null;
  if (section.stages) {
    return { skill: section.skill, stage: section.stages.length, stages: ADAPTIVE_STAGES, items: section.stages[section.stages.length - 1].items.map(publicChoice) };
  }
  if (section.passages) {
    return {
      skill: section.skill,
      passages: section.passages.map((passage) => ({
        id: passage.id, genre: passage.genre, title: passage.title,
        ...(passage.text !== undefined ? { text: passage.text } : { lines: passage.lines }),
        questions: passage.questions.map(publicChoice),
      })),
    };
  }
  return { skill: section.skill, tasks: (section.tasks ?? []).map((task) => ({ id: task.id, prompt: task.prompt, points: task.points, target: task.target })) };
}

/** What a test taker sees of their attempt. Results only when graded and allowed. */
export function attemptView(ctx: Ctx, attempt: AttemptRow, assessment: AssessmentRow, org: OrgRow, options: { showResult: boolean; feedback?: boolean }) {
  const index = activeIndex(attempt.items);
  const section = attempt.items[index];
  const editable = new Set(editableIds(section));
  const results = attempt.status === 'graded' && options.showResult ? {
    overall_level: attempt.overall_level, overall_score: attempt.overall_score, certificate_code: attempt.certificate_code,
    skills: Object.fromEntries(attempt.items.map((entry) => [entry.skill, { level: attempt.skill_results[entry.skill]?.level ?? null, score: attempt.skill_results[entry.skill]?.score ?? null }])),
    ...(options.feedback ? { feedback: { writing: attempt.ai_feedback.writing ?? null, speaking: attempt.ai_feedback.speaking ?? null } } : {}),
  } : null;
  return {
    id: attempt.id, status: attempt.status, kind: assessment.kind, title: assessment.title, company: org.name,
    started_at: attempt.started_at, deadline_at: attempt.deadline_at, submitted_at: attempt.submitted_at,
    now: ctx.now().toISOString(), grace_seconds: GRACE_MS / 1000,
    sections: attempt.items.map((entry) => ({ skill: entry.skill, status: entry.status })),
    current: index,
    section: attempt.status === 'started' ? publicSection(section) : null,
    answers: Object.fromEntries(Object.entries(attempt.answers).filter(([id]) => editable.has(id))),
    plays: attempt.integrity.plays ?? {},
    result: results,
  };
}

// Re-exported for the routes.
export type { Integrity } from './integrity.ts';
