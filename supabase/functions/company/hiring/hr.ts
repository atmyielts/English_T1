// HR routes: hiring tests (create, edit, close, duplicate, link), candidate lists
// with CSV, attempt reports, decisions and notes, grading again and manual scores,
// and placement/progress campaigns for staff.
import { MEMBER_COLUMNS } from '../handler.ts';
import { usage } from '../core.ts';
import { check, CompanyError, type Ctx, type MemberRow, type Route } from '../types.ts';
import { int, obj, oneOf, sha256, text, token, uuid } from '../util.ts';
import {
  ASSESSMENT_COLUMNS, ATTEMPT_COLUMNS, expireIfOverdue, gradeAttempt, loadAssessment, loadAttempt, manualScore,
  type AssessmentRow, type AttemptRow,
} from './attempts.ts';
import { orderSkills } from './engine.ts';
import { bankCounts } from './bank/index.ts';
import {
  HR, LEADS, assessmentView, attemptReport, attemptRow, attemptsCsv, inAudience, networkMatches, readAssessment, stats, suggestedMinutes,
} from './shared.ts';

/** Sweeping overdue attempts grades at most this many with AI per request; the rest wait for HR. */
const SWEEP_AI = 3;

async function newLink(ctx: Ctx): Promise<{ raw: string; hash: string; url: string }> {
  const raw = token(24);
  return { raw, hash: await sha256(raw), url: `${ctx.env.appUrl}/t/${raw}` };
}

async function attemptsOf(ctx: Ctx, assessmentId: string): Promise<AttemptRow[]> {
  return check<AttemptRow[]>(await ctx.db.from('company_attempts').select(ATTEMPT_COLUMNS).eq('org_id', ctx.org!.id).eq('assessment_id', assessmentId).order('started_at', { ascending: false }).limit(2000));
}

async function memberOf(ctx: Ctx, id: string | null): Promise<MemberRow | null> {
  if (!id) return null;
  return check<MemberRow | null>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('id', id).eq('org_id', ctx.org!.id).maybeSingle());
}

/** Closes attempts whose time ran out, so lists show them as submitted rather than "in progress". */
async function sweep(ctx: Ctx, assessment: AssessmentRow, attempts: AttemptRow[]): Promise<AttemptRow[]> {
  let withAi = SWEEP_AI;
  const out: AttemptRow[] = [];
  for (const attempt of attempts) {
    if (attempt.status === 'started' && ctx.now().getTime() > new Date(attempt.deadline_at).getTime() + 120_000) {
      const member = await memberOf(ctx, attempt.member_id);
      out.push(await expireIfOverdue(ctx, attempt, assessment, ctx.org!, member, withAi-- > 0));
    } else out.push(attempt);
  }
  return out;
}

const isHr = (ctx: Ctx) => ctx.staff || ctx.member?.role === 'owner' || ctx.member?.role === 'admin';

/** Members a manager may see: their own department only. HR sees everyone. */
async function visibleMembers(ctx: Ctx): Promise<MemberRow[]> {
  let query = ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', ctx.org!.id).eq('status', 'active');
  if (!isHr(ctx)) {
    if (!ctx.member?.department_id) return [];
    query = query.eq('department_id', ctx.member.department_id);
  }
  return check<MemberRow[]>(await query.order('full_name'));
}

/** Loads an attempt for HR, or for a manager when it is a staff test of someone in their department. */
async function attemptForLead(ctx: Ctx, id: string): Promise<{ attempt: AttemptRow; assessment: AssessmentRow; member: MemberRow | null }> {
  const attempt = await loadAttempt(ctx, ctx.org!.id, uuid(id, 'attempt'));
  const assessment = await loadAssessment(ctx, ctx.org!.id, attempt.assessment_id);
  const member = await memberOf(ctx, attempt.member_id);
  if (!isHr(ctx) && (assessment.kind === 'hiring' || !member || !ctx.member?.department_id || member.department_id !== ctx.member.department_id)) {
    throw new CompanyError('forbidden', 'Your role cannot do this.', 403);
  }
  return { attempt, assessment, member };
}

async function validateAudience(ctx: Ctx, settings: Record<string, unknown>) {
  const audience = settings.audience as { type: string; ids: string[] } | undefined;
  if (!audience || audience.type === 'all') return;
  const table = audience.type === 'departments' ? 'company_departments' : 'company_members';
  const rows = check<{ id: string }[]>(await ctx.db.from(table).select('id').eq('org_id', ctx.org!.id).in('id', audience.ids));
  if (rows.length !== audience.ids.length) throw new CompanyError('invalid_field', 'Some of the chosen people or departments are not in this workspace.', 400, { field: 'audience' });
}

/** Per-member progress of a placement or progress campaign. */
async function campaignRows(ctx: Ctx, assessment: AssessmentRow, members: MemberRow[], attempts: AttemptRow[]) {
  const latest = new Map<string, AttemptRow>();
  for (const attempt of attempts) if (attempt.member_id && !latest.has(attempt.member_id)) latest.set(attempt.member_id, attempt);
  return members.filter((member) => inAudience(assessment, member)).map((member) => {
    const attempt = latest.get(member.id) ?? null;
    const graded = attempts.find((entry) => entry.member_id === member.id && entry.status === 'graded') ?? null;
    return {
      member_id: member.id, full_name: member.full_name, email: member.email, department_id: member.department_id, job_role: member.job_role,
      status: !attempt || attempt.status === 'expired' ? 'todo' : attempt.status === 'started' ? 'in_progress' : attempt.status === 'submitted' ? 'pending' : 'done',
      attempt_id: attempt?.id ?? null, started_at: attempt?.started_at ?? null, submitted_at: attempt?.submitted_at ?? null,
      level: graded?.overall_level ?? null, score: graded?.overall_score === undefined || graded?.overall_score === null ? null : Number(graded.overall_score),
      graded_attempt_id: graded?.id ?? null, previous_level: member.level,
    };
  });
}

export const routes: Route[] = [
  // ----- Hiring tests and campaigns (shared list and edit routes) -----
  {
    method: 'GET', path: 'orgs/:org/assessments', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const kind = oneOf(query.get('kind') ?? 'hiring', ['hiring', 'placement', 'progress'] as const, 'kind');
      const rows = check<AssessmentRow[]>(await ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('org_id', ctx.org!.id).eq('kind', kind).order('created_at', { ascending: false }).limit(500));
      const attempts = rows.length ? check<AttemptRow[]>(await ctx.db.from('company_attempts').select('assessment_id,status,overall_level,overall_score,decision').eq('org_id', ctx.org!.id).in('assessment_id', rows.map((row) => row.id))) : [];
      return {
        assessments: rows.map((row) => ({ ...assessmentView(row), stats: stats(attempts.filter((attempt) => attempt.assessment_id === row.id), row) })),
        usage: await usage(ctx.db, ctx.org!),
        bank: bankCounts(),
      };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/assessments', access: 'org', roles: HR,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const fields = readAssessment(input, 'hiring', null);
      const link = await newLink(ctx);
      const row = check<AssessmentRow>(await ctx.db.from('company_assessments').insert({
        ...fields, org_id: ctx.org!.id, kind: 'hiring', status: 'open', link_token_hash: link.hash, created_by: ctx.user,
      }).select(ASSESSMENT_COLUMNS).single());
      await ctx.audit('hiring.test_created', row.id, { title: row.title, job_role: row.job_role });
      return { assessment: assessmentView(row), link: link.url };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/assessments/:assessment', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      const row = await loadAssessment(ctx, ctx.org!.id, uuid(params.assessment, 'assessment'));
      const attempts = await sweep(ctx, row, await attemptsOf(ctx, row.id));
      const network = networkMatches(attempts);
      return {
        assessment: assessmentView(row),
        stats: stats(attempts, row),
        attempts: attempts.map((attempt) => attemptRow(attempt, row, network.get(attempt.id) ?? 0)),
        suggested_minutes: suggestedMinutes(row.skills),
      };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/assessments/:assessment', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const row = await loadAssessment(ctx, ctx.org!.id, uuid(params.assessment, 'assessment'));
      const fields = readAssessment(obj(body), row.kind, row);
      if (row.kind !== 'hiring') await validateAudience(ctx, fields.settings as Record<string, unknown>);
      const updated = check<AssessmentRow>(await ctx.db.from('company_assessments').update(fields).eq('id', row.id).eq('org_id', ctx.org!.id).select(ASSESSMENT_COLUMNS).single());
      await ctx.audit(fields.status === 'closed' ? 'hiring.test_closed' : fields.status === 'open' && row.status !== 'open' ? 'hiring.test_reopened' : 'hiring.test_updated', row.id, { fields: Object.keys(fields) });
      return { assessment: assessmentView(updated) };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/assessments/:assessment/duplicate', access: 'org', roles: HR,
    async handle(ctx, params) {
      const row = await loadAssessment(ctx, ctx.org!.id, uuid(params.assessment, 'assessment'));
      const link = row.kind === 'hiring' ? await newLink(ctx) : null;
      const title = `${row.title} (copy)`.slice(0, 160);
      const copy = check<AssessmentRow>(await ctx.db.from('company_assessments').insert({
        org_id: ctx.org!.id, kind: row.kind, title, job_role: row.job_role, skills: row.skills, min_level: row.min_level,
        time_limit_minutes: row.time_limit_minutes, status: 'open', link_token_hash: link?.hash ?? null, max_attempts: row.max_attempts,
        closes_at: row.closes_at && new Date(row.closes_at).getTime() > ctx.now().getTime() ? row.closes_at : null, settings: row.settings, created_by: ctx.user,
      }).select(ASSESSMENT_COLUMNS).single());
      await ctx.audit('hiring.test_duplicated', copy.id, { from: row.id });
      return { assessment: assessmentView(copy), link: link?.url ?? null };
    },
  },
  {
    // A new open link; the old one stops working.
    method: 'POST', path: 'orgs/:org/assessments/:assessment/link', access: 'org', roles: HR,
    async handle(ctx, params) {
      const row = await loadAssessment(ctx, ctx.org!.id, uuid(params.assessment, 'assessment'));
      if (row.kind !== 'hiring') throw new CompanyError('invalid_field', 'Only hiring tests have an open link.', 400, { field: 'kind' });
      const link = await newLink(ctx);
      check(await ctx.db.from('company_assessments').update({ link_token_hash: link.hash }).eq('id', row.id).eq('org_id', ctx.org!.id));
      await ctx.audit('hiring.link_regenerated', row.id);
      return { link: link.url };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/assessments/:assessment/export', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      const row = await loadAssessment(ctx, ctx.org!.id, uuid(params.assessment, 'assessment'));
      const attempts = await attemptsOf(ctx, row.id);
      const network = networkMatches(attempts);
      await ctx.audit('hiring.exported', row.id, { rows: attempts.length });
      const safe = row.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'test';
      return { filename: `${safe}-${ctx.now().toISOString().slice(0, 10)}.csv`, csv: attemptsCsv(attempts.map((attempt) => attemptRow(attempt, row, network.get(attempt.id) ?? 0)), orderSkills(row.skills)) };
    },
  },

  // ----- One attempt: report, decision, grading -----
  {
    method: 'GET', path: 'orgs/:org/attempts/:attempt', access: 'org', roles: LEADS, allowSuspended: true,
    async handle(ctx, params) {
      const found = await attemptForLead(ctx, params.attempt);
      const attempt = await expireIfOverdue(ctx, found.attempt, found.assessment, ctx.org!, found.member);
      let sameNetwork = 0;
      if (attempt.integrity?.ip_hash) {
        const others = check<{ id: string; integrity: { ip_hash?: string } }[]>(await ctx.db.from('company_attempts').select('id,integrity').eq('assessment_id', attempt.assessment_id).neq('id', attempt.id));
        sameNetwork = others.filter((other) => other.integrity?.ip_hash === attempt.integrity.ip_hash).length;
      }
      return {
        attempt: attemptReport(attempt, found.assessment, sameNetwork),
        assessment: assessmentView(found.assessment),
        member: found.member ? { id: found.member.id, full_name: found.member.full_name, email: found.member.email, department_id: found.member.department_id, job_role: found.member.job_role } : null,
        can_edit: isHr(ctx),
      };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/attempts/:attempt', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const input = obj(body);
      const attempt = await loadAttempt(ctx, ctx.org!.id, uuid(params.attempt, 'attempt'));
      const patch: Record<string, unknown> = {};
      if (input.decision !== undefined) {
        patch.decision = input.decision === null ? null : oneOf(input.decision, ['shortlist', 'hold', 'reject'] as const, 'decision');
        patch.decision_by = patch.decision ? ctx.user : null;
      }
      if (input.notes !== undefined) patch.notes = text(input.notes, 'notes', { max: 4000, optional: true });
      if (!Object.keys(patch).length) throw new CompanyError('invalid_body', 'Nothing to change.', 400);
      check(await ctx.db.from('company_attempts').update(patch).eq('id', attempt.id).eq('org_id', ctx.org!.id));
      await ctx.audit('hiring.decision', attempt.id, { decision: patch.decision, notes: input.notes !== undefined });
      return { decision: patch.decision ?? attempt.decision, notes: patch.notes !== undefined ? patch.notes : attempt.notes };
    },
  },
  {
    // Grades pending writing/speaking with AI, or grades a skill again ({ skill }).
    method: 'POST', path: 'orgs/:org/attempts/:attempt/regrade', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const input = body === undefined ? {} : obj(body);
      const attempt = await loadAttempt(ctx, ctx.org!.id, uuid(params.attempt, 'attempt'));
      const assessment = await loadAssessment(ctx, ctx.org!.id, attempt.assessment_id);
      const member = await memberOf(ctx, attempt.member_id);
      if (attempt.status !== 'submitted' && attempt.status !== 'graded') throw new CompanyError('attempt_not_submitted', 'The test has not been submitted yet.', 409);
      const force = input.skill === undefined ? [] : [oneOf(input.skill, ['writing', 'speaking'] as const, 'skill')];
      const updated = await gradeAttempt(ctx, attempt, assessment, ctx.org!, member, { useAi: true, force });
      await ctx.audit('hiring.regraded', attempt.id, { skill: input.skill ?? null, status: updated.status });
      return { attempt: attemptReport(updated, assessment, 0), reason: updated.ai_feedback.reason ?? null };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/attempts/:attempt/score', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const input = obj(body);
      const skill = oneOf(input.skill, ['writing', 'speaking'] as const, 'skill');
      const score = int(input.score, 'score', { min: 0, max: 100 })!;
      const attempt = await loadAttempt(ctx, ctx.org!.id, uuid(params.attempt, 'attempt'));
      const assessment = await loadAssessment(ctx, ctx.org!.id, attempt.assessment_id);
      const updated = await manualScore(ctx, attempt, assessment, await memberOf(ctx, attempt.member_id), skill, score);
      await ctx.audit('hiring.manual_score', attempt.id, { skill, score });
      return { attempt: attemptReport(updated, assessment, 0) };
    },
  },
  {
    // A candidate asked to be forgotten, or a test row was a mistake. The used test is not refunded.
    method: 'DELETE', path: 'orgs/:org/attempts/:attempt', access: 'org', roles: HR,
    async handle(ctx, params) {
      const attempt = await loadAttempt(ctx, ctx.org!.id, uuid(params.attempt, 'attempt'));
      check(await ctx.db.from('company_attempts').delete().eq('id', attempt.id).eq('org_id', ctx.org!.id));
      await ctx.audit('hiring.attempt_deleted', attempt.id, { assessment: attempt.assessment_id });
      return { ok: true };
    },
  },

  // ----- Placement and progress campaigns -----
  {
    method: 'GET', path: 'orgs/:org/placement', access: 'org', roles: LEADS, allowSuspended: true,
    async handle(ctx) {
      const rows = check<AssessmentRow[]>(await ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('org_id', ctx.org!.id).in('kind', ['placement', 'progress']).order('created_at', { ascending: false }).limit(200));
      const members = await visibleMembers(ctx);
      const attempts = rows.length ? check<AttemptRow[]>(await ctx.db.from('company_attempts').select('id,assessment_id,member_id,status,overall_level,overall_score,started_at,submitted_at').eq('org_id', ctx.org!.id).in('assessment_id', rows.map((row) => row.id)).order('started_at', { ascending: false })) : [];
      const campaigns = [];
      for (const row of rows) {
        const people = await campaignRows(ctx, row, members, attempts.filter((attempt) => attempt.assessment_id === row.id) as AttemptRow[]);
        campaigns.push({
          ...assessmentView(row),
          progress: {
            audience: people.length,
            done: people.filter((person) => person.status === 'done').length,
            in_progress: people.filter((person) => person.status === 'in_progress' || person.status === 'pending').length,
            levels: people.reduce<Record<string, number>>((out, person) => { if (person.level) out[person.level] = (out[person.level] ?? 0) + 1; return out; }, {}),
          },
        });
      }
      return { campaigns, usage: isHr(ctx) ? await usage(ctx.db, ctx.org!) : null, can_edit: isHr(ctx) };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/placement', access: 'org', roles: HR,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const kind = oneOf(input.kind, ['placement', 'progress'] as const, 'kind', 'placement');
      const fields = readAssessment(input, kind, null);
      await validateAudience(ctx, fields.settings as Record<string, unknown>);
      const row = check<AssessmentRow>(await ctx.db.from('company_assessments').insert({
        ...fields, org_id: ctx.org!.id, kind, status: 'open', link_token_hash: null, created_by: ctx.user,
      }).select(ASSESSMENT_COLUMNS).single());
      await ctx.audit('placement.created', row.id, { title: row.title, kind, audience: (fields.settings as Record<string, unknown>).audience });
      return { assessment: assessmentView(row) };
    },
  },
  {
    // People HR can choose for a campaign.
    method: 'GET', path: 'orgs/:org/placement/audience', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx) {
      const members = await visibleMembers(ctx);
      return { members: members.map((member) => ({ id: member.id, full_name: member.full_name, email: member.email, department_id: member.department_id, job_role: member.job_role, role: member.role, level: member.level })) };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/placement/:assessment', access: 'org', roles: LEADS, allowSuspended: true,
    async handle(ctx, params) {
      const row = await loadAssessment(ctx, ctx.org!.id, uuid(params.assessment, 'assessment'));
      if (row.kind === 'hiring') throw new CompanyError('assessment_not_found', 'This test was not found.', 404);
      const members = await visibleMembers(ctx);
      const attempts = await attemptsOf(ctx, row.id);
      const people = await campaignRows(ctx, row, members, attempts);
      return { assessment: assessmentView(row), people, stats: stats(attempts.filter((attempt) => !attempt.member_id || people.some((person) => person.member_id === attempt.member_id)), row), can_edit: isHr(ctx) };
    },
  },
];
