// Signed-in staff tests: the member's list of placement/progress tests (the
// contract training's My English reads), starting or resuming one, autosave, next
// section, submit, and their own results and certificates.
import { check, CompanyError, type Ctx, type MemberRow, type Route } from '../types.ts';
import { obj, uuid } from '../util.ts';
import {
  ASSESSMENT_COLUMNS, ATTEMPT_COLUMNS, attemptView, closed, expireIfOverdue, loadAssessment, loadAttempt, nextStep, saveAttempt, settingsOf, startAttempt, submitAttempt,
  type AssessmentRow, type AttemptRow,
} from './attempts.ts';
import { orderSkills } from './engine.ts';
import { inAudience, suggestedMinutes } from './shared.ts';

const DAY = 86_400_000;

function me(ctx: Ctx): MemberRow {
  if (!ctx.member) throw new CompanyError('not_member', 'Only members of this workspace take staff tests.', 403);
  return ctx.member;
}

async function myAttempts(ctx: Ctx, member: MemberRow): Promise<AttemptRow[]> {
  return check<AttemptRow[]>(await ctx.db.from('company_attempts').select(ATTEMPT_COLUMNS).eq('org_id', ctx.org!.id).eq('member_id', member.id).order('started_at', { ascending: false }).limit(200));
}

/** Where a member stands on one campaign. */
function standing(ctx: Ctx, assessment: AssessmentRow, attempts: AttemptRow[]) {
  const mine = attempts.filter((attempt) => attempt.assessment_id === assessment.id);
  const latest = mine[0] ?? null;
  const graded = mine.find((attempt) => attempt.status === 'graded') ?? null;
  const finished = latest && (latest.status === 'graded' || latest.status === 'submitted') ? latest : null;
  const retestDays = settingsOf(assessment).retest_days ?? null;
  const retestAt = finished && retestDays ? new Date(new Date(finished.submitted_at ?? finished.started_at).getTime() + retestDays * DAY) : null;
  const isClosed = closed(assessment, ctx.now());
  let status: 'todo' | 'in_progress' | 'done';
  if (latest?.status === 'started') status = 'in_progress';
  else if (finished && !(retestAt && retestAt.getTime() <= ctx.now().getTime())) status = 'done';
  else status = 'todo';
  return { latest, graded, finished, retestAt, isClosed, status, canStart: status === 'todo' && !isClosed };
}

async function myCampaign(ctx: Ctx, id: string): Promise<AssessmentRow> {
  const member = me(ctx);
  const assessment = await loadAssessment(ctx, ctx.org!.id, uuid(id, 'assessment'));
  if (assessment.kind === 'hiring' || !inAudience(assessment, member)) throw new CompanyError('assessment_not_found', 'This test was not found.', 404);
  return assessment;
}

async function myAttempt(ctx: Ctx, id: string): Promise<{ attempt: AttemptRow; assessment: AssessmentRow; member: MemberRow }> {
  const member = me(ctx);
  const attempt = await loadAttempt(ctx, ctx.org!.id, uuid(id, 'attempt'));
  if (attempt.member_id !== member.id) throw new CompanyError('attempt_not_found', 'This attempt was not found.', 404);
  const assessment = await loadAssessment(ctx, ctx.org!.id, attempt.assessment_id);
  return { attempt: await expireIfOverdue(ctx, attempt, assessment, ctx.org!, member), assessment, member };
}

const view = (ctx: Ctx, attempt: AttemptRow, assessment: AssessmentRow) => ({ attempt: attemptView(ctx, attempt, assessment, ctx.org!, { showResult: true, feedback: true }) });

function resultOf(attempt: AttemptRow | null) {
  if (!attempt) return null;
  return {
    attempt_id: attempt.id, overall_level: attempt.overall_level, overall_score: attempt.overall_score === null ? null : Number(attempt.overall_score),
    graded_at: attempt.graded_at, certificate_code: attempt.certificate_code,
    skills: Object.fromEntries(attempt.items.map((section) => [section.skill, attempt.skill_results[section.skill] ? { level: attempt.skill_results[section.skill]!.level, score: attempt.skill_results[section.skill]!.score } : null])),
    feedback: { writing: attempt.ai_feedback.writing ?? null, speaking: attempt.ai_feedback.speaking ?? null },
  };
}

export const routes: Route[] = [
  {
    // Contract with training (My English): { tests: [{ assessment_id, title, kind, status, level, attempt_id, deadline_at }] }.
    method: 'GET', path: 'orgs/:org/my/tests', access: 'org', allowSuspended: true,
    async handle(ctx) {
      if (!ctx.member) return { tests: [] };
      const member = ctx.member;
      const campaigns = check<AssessmentRow[]>(await ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('org_id', ctx.org!.id).in('kind', ['placement', 'progress']).order('created_at', { ascending: false }).limit(200));
      let attempts = await myAttempts(ctx, member);
      const tests = [];
      for (const assessment of campaigns) {
        if (!inAudience(assessment, member)) continue;
        let place = standing(ctx, assessment, attempts);
        if (place.latest?.status === 'started' && ctx.now().getTime() > new Date(place.latest.deadline_at).getTime() + 120_000) {
          const expired = await expireIfOverdue(ctx, place.latest, assessment, ctx.org!, member);
          attempts = attempts.map((attempt) => attempt.id === expired.id ? expired : attempt);
          place = standing(ctx, assessment, attempts);
        }
        // A closed campaign stays listed only for people who took it.
        if (place.isClosed && place.status === 'todo') continue;
        tests.push({
          assessment_id: assessment.id,
          title: assessment.title,
          kind: assessment.kind,
          status: place.status,
          level: place.graded?.overall_level ?? null,
          attempt_id: place.latest?.id ?? null,
          deadline_at: place.status === 'in_progress' ? place.latest!.deadline_at : place.isClosed ? null : assessment.closes_at,
        });
      }
      const order = { todo: 0, in_progress: 1, done: 2 } as const;
      tests.sort((a, b) => order[a.status] - order[b.status]);
      return { tests };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/my/tests/:assessment', access: 'org', allowSuspended: true,
    async handle(ctx, params) {
      const assessment = await myCampaign(ctx, params.assessment);
      const place = standing(ctx, assessment, await myAttempts(ctx, me(ctx)));
      return {
        test: {
          id: assessment.id, title: assessment.title, kind: assessment.kind, skills: orderSkills(assessment.skills),
          time_limit_minutes: assessment.time_limit_minutes, closes_at: assessment.closes_at, suggested_minutes: suggestedMinutes(assessment.skills),
          retest_days: settingsOf(assessment).retest_days ?? null,
        },
        status: place.status,
        closed: place.isClosed,
        can_start: place.canStart && ctx.org!.status !== 'suspended',
        attempt_id: place.latest?.status === 'started' ? place.latest.id : null,
        retest_at: place.retestAt?.toISOString() ?? null,
        result: resultOf(place.graded),
        pending: place.finished?.status === 'submitted',
      };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/my/attempts', access: 'org', allowSuspended: true,
    async handle(ctx) {
      if (!ctx.member) return { attempts: [] };
      const attempts = (await myAttempts(ctx, ctx.member)).filter((attempt) => attempt.status === 'graded');
      const ids = [...new Set(attempts.map((attempt) => attempt.assessment_id))];
      const titles = ids.length ? check<{ id: string; title: string; kind: string }[]>(await ctx.db.from('company_assessments').select('id,title,kind').in('id', ids)) : [];
      return {
        attempts: attempts.map((attempt) => {
          const assessment = titles.find((row) => row.id === attempt.assessment_id);
          return { ...resultOf(attempt), assessment_id: attempt.assessment_id, title: assessment?.title ?? null, kind: assessment?.kind ?? null };
        }),
      };
    },
  },
  {
    // Starts (or resumes) the member's test. Every new start reserves one of the workspace's tests.
    method: 'POST', path: 'orgs/:org/my/attempts', access: 'org',
    async handle(ctx, _params, body) {
      const member = me(ctx);
      const input = obj(body);
      const assessment = await myCampaign(ctx, String(input.assessment_id ?? ''));
      const attempts = await myAttempts(ctx, member);
      const place = standing(ctx, assessment, attempts);
      if (place.latest?.status === 'started') {
        const current = await expireIfOverdue(ctx, place.latest, assessment, ctx.org!, member);
        if (current.status === 'started') return view(ctx, current, assessment);
      }
      if (place.isClosed) throw new CompanyError('test_closed', 'This test is closed.', 409);
      if (place.status === 'done') throw new CompanyError('already_taken', 'You have already taken this test.', 409, { retest_at: place.retestAt?.toISOString() ?? null });
      const attempt = await startAttempt(ctx, { assessment, org: ctx.org!, member });
      await ctx.audit('placement.started', attempt.id, { assessment: assessment.id });
      return view(ctx, attempt, assessment);
    },
  },
  {
    method: 'GET', path: 'orgs/:org/my/attempts/:attempt', access: 'org', allowSuspended: true,
    async handle(ctx, params) {
      const { attempt, assessment } = await myAttempt(ctx, params.attempt);
      return view(ctx, attempt, assessment);
    },
  },
  {
    method: 'POST', path: 'orgs/:org/my/attempts/:attempt/save', access: 'org', allowSuspended: true,
    async handle(ctx, params, body) {
      const { attempt, assessment } = await myAttempt(ctx, params.attempt);
      if (attempt.status !== 'started') return view(ctx, attempt, assessment);
      const saved = await saveAttempt(ctx, attempt, obj(body));
      return { saved_at: saved.updated_at };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/my/attempts/:attempt/next', access: 'org', allowSuspended: true,
    async handle(ctx, params, body) {
      const { attempt, assessment, member } = await myAttempt(ctx, params.attempt);
      if (attempt.status !== 'started') return view(ctx, attempt, assessment);
      return view(ctx, await nextStep(ctx, attempt, assessment, ctx.org!, member, obj(body)), assessment);
    },
  },
  {
    method: 'POST', path: 'orgs/:org/my/attempts/:attempt/submit', access: 'org', allowSuspended: true,
    async handle(ctx, params, body) {
      const { attempt, assessment, member } = await myAttempt(ctx, params.attempt);
      if (attempt.status !== 'started') return view(ctx, attempt, assessment);
      return view(ctx, await submitAttempt(ctx, attempt, assessment, ctx.org!, member, { body: body === undefined ? undefined : obj(body) }), assessment);
    },
  },
];
