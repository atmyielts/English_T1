// Input reading, HR views, statistics and CSV for hiring tests and placement campaigns.
import { JOB_ROLES, LEVEL_LABEL, LEVELS, SKILLS, isLevel, levelIndex, type JobRole, type Level, type Skill } from '../../../../packages/company-core/src/mod.ts';
import { CompanyError, UUID, type MemberRow } from '../types.ts';
import { int, oneOf, text } from '../util.ts';
import { pendingSkills } from './engine.ts';
import { settingsOf, type AssessmentRow, type AssessmentSettings, type AttemptRow } from './attempts.ts';
import { integrityFlags, integrityView, type Flag } from './integrity.ts';

/** Suggested minutes per section; the form adds them up as the default time limit. */
export const SUGGESTED_MINUTES: Record<Skill, number> = { grammar: 7, vocabulary: 7, reading: 12, listening: 10, writing: 15, speaking: 8 };
export const suggestedMinutes = (skills: readonly string[]) => Math.min(180, Math.max(5, skills.reduce((sum, skill) => sum + (SUGGESTED_MINUTES[skill as Skill] ?? 0), 0)));
export const HR = ['owner', 'admin'] as const;
export const LEADS = ['owner', 'admin', 'manager'] as const;

function skillsOf(value: unknown): Skill[] {
  if (!Array.isArray(value)) throw new CompanyError('invalid_field', 'Pick at least one skill.', 400, { field: 'skills' });
  const picked = SKILLS.filter((skill) => value.includes(skill));
  if (!picked.length || value.some((entry) => !(SKILLS as readonly string[]).includes(String(entry)))) throw new CompanyError('invalid_field', 'Pick at least one skill.', 400, { field: 'skills' });
  return picked;
}

function dateOf(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'string' ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) throw new CompanyError('invalid_field', `${field} is not a date.`, 400, { field });
  return parsed.toISOString();
}

function idsOf(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 2000 || value.some((id) => typeof id !== 'string' || !UUID.test(id))) throw new CompanyError('invalid_field', `${field} must be a list of ids.`, 400, { field });
  return [...new Set(value as string[])];
}

/** Reads a create or edit request for a hiring test or a placement/progress campaign. */
export function readAssessment(input: Record<string, unknown>, kind: AssessmentRow['kind'], existing: AssessmentRow | null) {
  const out: Record<string, unknown> = {};
  const has = (key: string) => input[key] !== undefined;
  if (!existing || has('title')) out.title = text(input.title, 'title', { min: 2, max: 160 });
  if (!existing || has('job_role')) out.job_role = oneOf<JobRole>(input.job_role, JOB_ROLES, 'job_role', 'general');
  if (!existing || has('skills')) out.skills = has('skills') ? skillsOf(input.skills) : kind === 'hiring' ? ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'] : ['grammar', 'vocabulary', 'reading', 'listening'];
  if (!existing || has('min_level')) out.min_level = input.min_level === null || input.min_level === undefined || input.min_level === '' ? null : oneOf<Level>(input.min_level, LEVELS, 'min_level');
  if (!existing || has('time_limit_minutes')) {
    out.time_limit_minutes = has('time_limit_minutes') ? int(input.time_limit_minutes, 'time_limit_minutes', { min: 5, max: 180 }) : suggestedMinutes((out.skills ?? existing?.skills ?? []) as string[]);
  }
  if (!existing || has('max_attempts')) out.max_attempts = int(input.max_attempts === '' ? null : input.max_attempts, 'max_attempts', { min: 1, max: 100_000, optional: true });
  if (!existing || has('closes_at')) out.closes_at = dateOf(input.closes_at, 'closes_at');
  if (has('status')) out.status = oneOf(input.status, ['open', 'closed'] as const, 'status');

  const settings: AssessmentSettings = { ...(existing ? settingsOf(existing) : {}) };
  if (kind === 'hiring') {
    if (!existing || has('show_level')) settings.show_level = input.show_level === true;
  } else {
    settings.show_level = true;
    if (!existing || has('audience')) {
      const raw = (input.audience && typeof input.audience === 'object' ? input.audience : { type: 'all' }) as Record<string, unknown>;
      const type = oneOf(raw.type, ['all', 'departments', 'members'] as const, 'audience', 'all');
      const ids = type === 'all' ? [] : idsOf(raw.ids, 'audience');
      if (type !== 'all' && !ids.length) throw new CompanyError('invalid_field', 'Choose who takes the test.', 400, { field: 'audience' });
      settings.audience = { type, ids };
    }
    if (!existing || has('retest_days')) settings.retest_days = int(input.retest_days === '' ? null : input.retest_days, 'retest_days', { min: 1, max: 730, optional: true });
    if (!existing || has('member_role')) settings.member_role = input.member_role !== false;
  }
  out.settings = settings;
  return out;
}

/** Whether a member is in a campaign's audience. */
export function inAudience(assessment: AssessmentRow, member: Pick<MemberRow, 'id' | 'department_id'>): boolean {
  const audience = settingsOf(assessment).audience ?? { type: 'all', ids: [] };
  if (audience.type === 'all') return true;
  if (audience.type === 'departments') return member.department_id !== null && audience.ids.includes(member.department_id);
  return audience.ids.includes(member.id);
}

/** Whether a graded result reaches the test's minimum level (null when there is no minimum or no result). */
export function meetsMinimum(attempt: Pick<AttemptRow, 'overall_level'>, assessment: Pick<AssessmentRow, 'min_level'>): boolean | null {
  if (!assessment.min_level || !attempt.overall_level || !isLevel(attempt.overall_level)) return null;
  return levelIndex(attempt.overall_level) >= levelIndex(assessment.min_level);
}

export function assessmentView(row: AssessmentRow) {
  const { link_token_hash, ...rest } = row;
  return { ...rest, settings: settingsOf(row), has_link: Boolean(link_token_hash) };
}

export function stats(attempts: Pick<AttemptRow, 'status' | 'overall_level' | 'overall_score' | 'decision'>[], assessment: Pick<AssessmentRow, 'min_level'>) {
  const graded = attempts.filter((attempt) => attempt.status === 'graded');
  const scores = graded.map((attempt) => Number(attempt.overall_score)).filter(Number.isFinite);
  const levels: Partial<Record<Level, number>> = {};
  for (const attempt of graded) if (attempt.overall_level) levels[attempt.overall_level] = (levels[attempt.overall_level] ?? 0) + 1;
  return {
    total: attempts.length,
    in_progress: attempts.filter((attempt) => attempt.status === 'started').length,
    pending: attempts.filter((attempt) => attempt.status === 'submitted').length,
    graded: graded.length,
    meets: graded.filter((attempt) => meetsMinimum(attempt, assessment) === true).length,
    shortlisted: attempts.filter((attempt) => attempt.decision === 'shortlist').length,
    average: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length * 10) / 10 : null,
    levels,
  };
}

/** One row of the HR candidate list. */
export function attemptRow(attempt: AttemptRow, assessment: AssessmentRow, sameNetwork: number) {
  return {
    id: attempt.id, name: attempt.candidate_name, email: attempt.candidate_email, phone: attempt.candidate_phone, member_id: attempt.member_id,
    status: attempt.status, started_at: attempt.started_at, submitted_at: attempt.submitted_at, graded_at: attempt.graded_at,
    overall_level: attempt.overall_level, overall_score: attempt.overall_score === null ? null : Number(attempt.overall_score),
    skills: Object.fromEntries(attempt.items.map((section) => {
      const result = attempt.skill_results[section.skill];
      return [section.skill, result ? { score: result.score, level: result.level, source: result.source } : null];
    })),
    pending: attempt.status === 'submitted' ? pendingSkills(attempt.items, attempt.skill_results) : [],
    decision: attempt.decision, notes: attempt.notes,
    meets: meetsMinimum(attempt, assessment),
    flags: integrityFlags(attempt.integrity, attempt.items, sameNetwork),
    certificate_code: attempt.status === 'graded' ? attempt.certificate_code : null,
  };
}

/** Other attempts on the same test that started from the same address today, per attempt. */
export function networkMatches(attempts: AttemptRow[]): Map<string, number> {
  const byHash = new Map<string, number>();
  for (const attempt of attempts) if (attempt.integrity?.ip_hash) byHash.set(attempt.integrity.ip_hash, (byHash.get(attempt.integrity.ip_hash) ?? 0) + 1);
  return new Map(attempts.map((attempt) => [attempt.id, attempt.integrity?.ip_hash ? (byHash.get(attempt.integrity.ip_hash) ?? 1) - 1 : 0]));
}

/** The full report HR reads and prints (answer keys stay on the server; HR sees counts). */
export function attemptReport(attempt: AttemptRow, assessment: AssessmentRow, sameNetwork: number) {
  return {
    ...attemptRow(attempt, assessment, sameNetwork),
    deadline_at: attempt.deadline_at,
    decision_by: attempt.decision_by,
    results: attempt.skill_results,
    feedback: { writing: attempt.ai_feedback.writing ?? null, speaking: attempt.ai_feedback.speaking ?? null, reason: attempt.ai_feedback.reason ?? null, tried_at: attempt.ai_feedback.tried_at ?? null },
    integrity: integrityView(attempt.integrity),
    sections: attempt.items.map((section) => ({
      skill: section.skill, status: section.status, started_at: section.started_at, finished_at: section.finished_at,
      seconds: attempt.integrity.section_seconds?.[section.skill] ?? null,
      texts: section.passages?.map((passage) => ({ id: passage.id, title: passage.title, genre: passage.genre, level: passage.level, questions: passage.questions.length })) ?? null,
      tasks: section.tasks?.map((task) => {
        const answer = attempt.answers[task.id];
        const value = typeof answer === 'string' ? answer : answer && typeof answer === 'object' ? answer.transcript : '';
        return { id: task.id, prompt: task.prompt, points: task.points, target: task.target, answer: value, mode: answer && typeof answer === 'object' ? answer.mode : null };
      }) ?? null,
    })),
  };
}

const cell = (value: unknown): string => {
  let out = value === null || value === undefined ? '' : String(value);
  // Spreadsheet formula injection: a cell starting with = + - @ is shown as text.
  if (/^[=+\-@\t\r]/.test(out)) out = `'${out}`;
  return /[",\n\r;]/.test(out) ? `"${out.replaceAll('"', '""')}"` : out;
};

/** CSV of a test's attempts (one row per candidate), with a byte-order mark for Excel. */
export function attemptsCsv(rows: ReturnType<typeof attemptRow>[], skills: Skill[]): string {
  const header = ['Name', 'Email', 'Phone', 'Status', 'Started', 'Submitted', 'Overall level', 'Overall score', ...skills.flatMap((skill) => [`${skill} level`, `${skill} score`]), 'Meets minimum', 'Decision', 'Notes', 'Flags', 'Certificate'];
  const lines = rows.map((row) => [
    row.name, row.email, row.phone, row.status, row.started_at, row.submitted_at,
    row.overall_level ? LEVEL_LABEL[row.overall_level as Level] : '', row.overall_score ?? '',
    ...skills.flatMap((skill) => {
      const result = row.skills[skill];
      return [result ? LEVEL_LABEL[result.level] : '', result ? result.score : ''];
    }),
    row.meets === null ? '' : row.meets ? 'yes' : 'no', row.decision ?? '', row.notes ?? '', row.flags.map((flag: Flag) => flag.code).join(' '), row.certificate_code ?? '',
  ].map(cell).join(','));
  return `﻿${[header.map(cell).join(','), ...lines].join('\r\n')}\r\n`;
}
