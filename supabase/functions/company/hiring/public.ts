// Public routes: the candidate test behind a hiring link (/t/:token) and the
// certificate check (/v/:code). Candidates have no account: starting returns a
// private attempt key the page keeps in localStorage to resume. Starts are limited
// per address hash and test; every start reserves one of the workspace's tests.
import { ORG_COLUMNS } from '../handler.ts';
import { check, CompanyError, type Ctx, type OrgRow, type Route } from '../types.ts';
import { email, obj, sha256, text, token } from '../util.ts';
import {
  ASSESSMENT_COLUMNS, ATTEMPT_COLUMNS, attemptView, closed, expireIfOverdue, nextStep, saveAttempt, settingsOf, startAttempt, submitAttempt,
  type AssessmentRow, type AttemptRow,
} from './attempts.ts';
import { orderSkills } from './engine.ts';
import { suggestedMinutes } from './shared.ts';

/** At most this many starts per hour from one address on one test. */
export const STARTS_PER_HOUR = 5;
const LINK = /^[A-Za-z0-9_-]{20,64}$/;
const KEY = /^[A-Za-z0-9_-]{20,64}$/;
const CODE = /^[A-HJ-NP-Z2-9]{10}$/;

async function byLink(ctx: Ctx, raw: string): Promise<{ assessment: AssessmentRow; org: OrgRow }> {
  if (!LINK.test(raw)) throw new CompanyError('link_not_found', 'This test link is not valid.', 404);
  const assessment = check<AssessmentRow | null>(await ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('link_token_hash', await sha256(raw)).eq('kind', 'hiring').maybeSingle());
  if (!assessment) throw new CompanyError('link_not_found', 'This test link is not valid.', 404);
  const org = check<OrgRow | null>(await ctx.db.from('company_orgs').select(ORG_COLUMNS).eq('id', assessment.org_id).maybeSingle());
  if (!org) throw new CompanyError('link_not_found', 'This test link is not valid.', 404);
  return { assessment, org };
}

/** The candidate's attempt from their private key, closed first if its time ran out. */
async function byKey(ctx: Ctx, body: unknown): Promise<{ attempt: AttemptRow; assessment: AssessmentRow; org: OrgRow; input: Record<string, unknown> }> {
  const input = obj(body);
  const key = typeof input.key === 'string' ? input.key : '';
  if (!KEY.test(key)) throw new CompanyError('attempt_not_found', 'This test session was not found.', 404);
  const attempt = check<AttemptRow | null>(await ctx.db.from('company_attempts').select(ATTEMPT_COLUMNS).eq('access_token_hash', await sha256(key)).maybeSingle());
  if (!attempt) throw new CompanyError('attempt_not_found', 'This test session was not found.', 404);
  const assessment = check<AssessmentRow>(await ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('id', attempt.assessment_id).single());
  const org = check<OrgRow>(await ctx.db.from('company_orgs').select(ORG_COLUMNS).eq('id', attempt.org_id).single());
  // AI grading and the audit trail count against the candidate's company.
  ctx.org = org;
  return { attempt: await expireIfOverdue(ctx, attempt, assessment, org, null), assessment, org, input };
}

const candidateView = (ctx: Ctx, attempt: AttemptRow, assessment: AssessmentRow, org: OrgRow) =>
  ({ attempt: attemptView(ctx, attempt, assessment, org, { showResult: settingsOf(assessment).show_level === true }) });

export const routes: Route[] = [
  {
    // What the candidate sees before starting.
    method: 'GET', path: 'public/t/:token', access: 'public',
    async handle(ctx, params) {
      const { assessment, org } = await byLink(ctx, params.token);
      const open = !closed(assessment, ctx.now()) && (org.status === 'pilot' || org.status === 'active');
      const skills = orderSkills(assessment.skills);
      return {
        test: {
          company: org.name, title: assessment.title, job_role: assessment.job_role, skills,
          time_limit_minutes: assessment.time_limit_minutes, suggested_minutes: suggestedMinutes(skills), closes_at: assessment.closes_at,
          show_level: settingsOf(assessment).show_level === true, speaking: skills.includes('speaking'), listening: skills.includes('listening'),
          locale: (org.settings as Record<string, unknown>)?.locale ?? 'ru',
        },
        open,
      };
    },
  },
  {
    method: 'POST', path: 'public/t/:token/start', access: 'public',
    async handle(ctx, params, body) {
      const input = obj(body);
      const { assessment, org } = await byLink(ctx, params.token);
      if (closed(assessment, ctx.now()) || !(org.status === 'pilot' || org.status === 'active')) throw new CompanyError('test_closed', 'This test is closed.', 409);
      if (input.consent !== true) throw new CompanyError('consent_required', 'Please agree to the processing of your answers first.', 400, { field: 'consent' });
      const name = text(input.name, 'name', { min: 2, max: 120 })!;
      const address = email(input.email, 'email')!;
      const phone = text(input.phone, 'phone', { max: 40, optional: true });
      const hourAgo = new Date(ctx.now().getTime() - 3_600_000).toISOString();
      const recent = check<{ integrity: { ip_hash?: string } }[]>(await ctx.db.from('company_attempts').select('integrity').eq('assessment_id', assessment.id).gte('started_at', hourAgo));
      if (recent.filter((row) => row.integrity?.ip_hash === ctx.ipHash).length >= STARTS_PER_HOUR) {
        throw new CompanyError('too_many_starts', 'Too many tests were started from this network. Try again in an hour.', 429);
      }
      const previous = check<{ id: string; candidate_email: string | null }[]>(await ctx.db.from('company_attempts').select('id,candidate_email').eq('assessment_id', assessment.id).neq('status', 'expired'));
      if (previous.some((row) => row.candidate_email === address)) throw new CompanyError('already_taken', 'This email has already been used for this test.', 409);
      if (assessment.max_attempts !== null && previous.length >= assessment.max_attempts) throw new CompanyError('test_full', 'This test has reached its number of candidates.', 409);
      const key = token(24);
      ctx.org = org;
      const attempt = await startAttempt(ctx, {
        assessment, org, member: null, candidate: { name, email: address, phone }, accessHash: await sha256(key),
        integrity: { ip_hash: ctx.ipHash, user_agent: (ctx.req.headers.get('user-agent') ?? '').slice(0, 200) },
      });
      await ctx.audit('hiring.candidate_started', attempt.id, { assessment: assessment.id });
      return { key, ...candidateView(ctx, attempt, assessment, org) };
    },
  },
  {
    method: 'POST', path: 'public/attempts/state', access: 'public',
    async handle(ctx, _params, body) {
      const { attempt, assessment, org } = await byKey(ctx, body);
      return candidateView(ctx, attempt, assessment, org);
    },
  },
  {
    method: 'POST', path: 'public/attempts/save', access: 'public',
    async handle(ctx, _params, body) {
      const { attempt, assessment, org, input } = await byKey(ctx, body);
      if (attempt.status !== 'started') return candidateView(ctx, attempt, assessment, org);
      const saved = await saveAttempt(ctx, attempt, input);
      return { saved_at: saved.updated_at };
    },
  },
  {
    method: 'POST', path: 'public/attempts/next', access: 'public',
    async handle(ctx, _params, body) {
      const { attempt, assessment, org, input } = await byKey(ctx, body);
      if (attempt.status !== 'started') return candidateView(ctx, attempt, assessment, org);
      return candidateView(ctx, await nextStep(ctx, attempt, assessment, org, null, input), assessment, org);
    },
  },
  {
    method: 'POST', path: 'public/attempts/submit', access: 'public',
    async handle(ctx, _params, body) {
      const { attempt, assessment, org, input } = await byKey(ctx, body);
      if (attempt.status !== 'started') return candidateView(ctx, attempt, assessment, org);
      const submitted = await submitAttempt(ctx, attempt, assessment, org, null, { body: input });
      await ctx.audit('hiring.candidate_submitted', attempt.id, { status: submitted.status });
      return candidateView(ctx, submitted, assessment, org);
    },
  },
  {
    // Certificate check: name, company, levels and date — no contact details.
    method: 'GET', path: 'public/v/:code', access: 'public',
    async handle(ctx, params) {
      const code = String(params.code ?? '').trim().toUpperCase();
      if (!CODE.test(code)) throw new CompanyError('certificate_not_found', 'No certificate has this code.', 404);
      const attempt = check<AttemptRow | null>(await ctx.db.from('company_attempts').select(ATTEMPT_COLUMNS).eq('certificate_code', code).eq('status', 'graded').maybeSingle());
      if (!attempt) throw new CompanyError('certificate_not_found', 'No certificate has this code.', 404);
      const assessment = check<AssessmentRow>(await ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('id', attempt.assessment_id).single());
      const org = check<OrgRow>(await ctx.db.from('company_orgs').select(ORG_COLUMNS).eq('id', attempt.org_id).single());
      return {
        certificate: {
          code, name: attempt.candidate_name, company: org.name, title: assessment.title, kind: assessment.kind,
          overall_level: attempt.overall_level, overall_score: attempt.overall_score === null ? null : Number(attempt.overall_score),
          skills: Object.fromEntries(attempt.items.map((section) => [section.skill, attempt.skill_results[section.skill] ? { level: attempt.skill_results[section.skill]!.level, score: attempt.skill_results[section.skill]!.score } : null])),
          transcript_based: attempt.items.some((section) => section.skill === 'speaking'),
          date: attempt.graded_at,
        },
      };
    },
  },
];
