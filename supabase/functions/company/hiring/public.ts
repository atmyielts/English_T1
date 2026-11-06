// Public routes: the candidate test behind a hiring link (/t/:token) and the
// certificate check (/v/:code). Candidates have no account: starting returns a
// private attempt key the page keeps in localStorage to resume. Starts, and starts
// refused for a used email, are limited per address hash and test; every start
// reserves one of the workspace's tests.
import { ORG_COLUMNS } from '../handler.ts';
import { check, CompanyError, type Ctx, type OrgRow, type Route } from '../types.ts';
import { fetchAll } from '../insights/common.ts';
import { attachCandidate, CANDIDATE_COLUMNS, withinLimit, type CandidateRow } from './ats.ts';
import { email, obj, sha256, text, token } from '../util.ts';
import {
  ASSESSMENT_COLUMNS, ATTEMPT_COLUMNS, attemptView, closed, expireIfOverdue, nextStep, orgOpen, saveAttempt, settingsOf, startAttempt, submitAttempt,
  type AssessmentRow, type AttemptRow,
} from './attempts.ts';
import { orderSkills } from './engine.ts';
import { suggestedMinutes } from './shared.ts';

/** At most this many starts per hour from one address on one test. */
export const STARTS_PER_HOUR = 5;
/** Generous, since a recruiting event may share one address; it only stops someone scanning for links. */
export const LINK_VIEWS_PER_HOUR = 600;
const REFUSED = 'hiring.start_refused';
const LINK = /^[A-Za-z0-9_-]{20,64}$/;
const KEY = /^[A-Za-z0-9_-]{20,64}$/;
const CODE = /^[A-HJ-NP-Z2-9]{10}$/;

/** The test behind a link: the test's open link, or one candidate's personal link. */
async function byLink(ctx: Ctx, raw: string): Promise<{ assessment: AssessmentRow; org: OrgRow; candidate: CandidateRow | null }> {
  if (!LINK.test(raw)) throw new CompanyError('link_not_found', 'This test link is not valid.', 404);
  const hash = await sha256(raw);
  let assessment = check<AssessmentRow | null>(await ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('link_token_hash', hash).eq('kind', 'hiring').maybeSingle());
  let candidate: CandidateRow | null = null;
  if (!assessment) {
    candidate = check<CandidateRow | null>(await ctx.db.from('company_candidates').select(CANDIDATE_COLUMNS).eq('invite_token_hash', hash).maybeSingle());
    if (candidate) assessment = check<AssessmentRow | null>(await ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('id', candidate.assessment_id).eq('kind', 'hiring').maybeSingle());
  }
  if (!assessment) throw new CompanyError('link_not_found', 'This test link is not valid.', 404);
  const org = check<OrgRow | null>(await ctx.db.from('company_orgs').select(ORG_COLUMNS).eq('id', assessment.org_id).maybeSingle());
  if (!org) throw new CompanyError('link_not_found', 'This test link is not valid.', 404);
  return { assessment, org, candidate };
}

/** A personal link's latest attempt. */
const attemptOf = async (ctx: Ctx, candidate: CandidateRow): Promise<AttemptRow | null> => candidate.attempt_id
  ? check<AttemptRow | null>(await ctx.db.from('company_attempts').select(ATTEMPT_COLUMNS).eq('id', candidate.attempt_id).eq('org_id', candidate.org_id).maybeSingle())
  : null;

/** The candidate's attempt from their private key, closed first if its time ran out. */
async function byKey(ctx: Ctx, body: unknown): Promise<{ attempt: AttemptRow; assessment: AssessmentRow; org: OrgRow; input: Record<string, unknown> }> {
  const input = obj(body);
  const key = typeof input.key === 'string' ? input.key : '';
  if (!KEY.test(key)) throw new CompanyError('attempt_not_found', 'This test session was not found.', 404);
  const attempt = check<AttemptRow | null>(await ctx.db.from('company_attempts').select(ATTEMPT_COLUMNS).eq('access_token_hash', await sha256(key)).maybeSingle());
  if (!attempt) throw new CompanyError('attempt_not_found', 'This test session was not found.', 404);
  const assessment = check<AssessmentRow>(await ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('id', attempt.assessment_id).single());
  const org = check<OrgRow>(await ctx.db.from('company_orgs').select(ORG_COLUMNS).eq('id', attempt.org_id).single());
  // A suspended workspace or an ended contract lets a started attempt finish; a closed workspace does not.
  if (org.status === 'closed') throw new CompanyError('org_closed', 'This workspace is closed.', 403);
  // AI grading and the audit trail count against the candidate's company.
  ctx.org = org;
  return { attempt: await expireIfOverdue(ctx, attempt, assessment, org, null), assessment, org, input };
}

/** Starts and refused starts from this address on this test in the last hour. */
async function startsThisHour(ctx: Ctx, assessment: AssessmentRow, org: OrgRow): Promise<number> {
  const hourAgo = new Date(ctx.now().getTime() - 3_600_000).toISOString();
  const started = await fetchAll<{ integrity: { ip_hash?: string } }>(() => ctx.db.from('company_attempts').select('integrity').eq('assessment_id', assessment.id).gte('started_at', hourAgo).order('id'));
  const refused = await fetchAll<{ details: { ip_hash?: string } }>(() => ctx.db.from('company_audit').select('details').eq('org_id', org.id).eq('action', REFUSED).eq('target', assessment.id).gte('created_at', hourAgo).order('id'));
  return started.filter((row) => row.integrity?.ip_hash === ctx.ipHash).length + refused.filter((row) => row.details?.ip_hash === ctx.ipHash).length;
}

/**
 * The answer when this email already has an attempt, in words that do not confirm it,
 * so the link cannot be used to check who applied. Counts toward the hourly limit.
 */
async function cannotStart(ctx: Ctx, assessment: AssessmentRow, org: OrgRow): Promise<CompanyError> {
  const { error } = await ctx.db.from('company_audit').insert({ org_id: org.id, actor: null, action: REFUSED, target: assessment.id, details: { ip_hash: ctx.ipHash }, created_at: ctx.now().toISOString() });
  if (error) console.error(JSON.stringify({ company_audit: 'failed', action: REFUSED, error: error.message }));
  return new CompanyError('cannot_start', 'We could not start a test with these details. If you already started, use your original link or ask the company for a new one.', 409);
}

const candidateView = (ctx: Ctx, attempt: AttemptRow, assessment: AssessmentRow, org: OrgRow) =>
  ({ attempt: attemptView(ctx, attempt, assessment, org, { showResult: settingsOf(assessment).show_level === true }) });

export const routes: Route[] = [
  {
    // What the candidate sees before starting. Opening a personal link is tracked for HR.
    method: 'GET', path: 'public/t/:token', access: 'public',
    async handle(ctx, params) {
      if (!(await withinLimit(ctx, 'link', LINK_VIEWS_PER_HOUR))) throw new CompanyError('too_many_requests', 'Too many requests from this network. Try again in an hour.', 429);
      const { assessment, org, candidate } = await byLink(ctx, params.token);
      const open = !closed(assessment, ctx.now()) && orgOpen(org, ctx.now());
      const skills = orderSkills(assessment.skills);
      let personal: { name: string | null; email: string | null; phone: string | null; status: 'new' | 'running' | 'finished' } | null = null;
      if (candidate && org.status !== 'closed') {
        const { error } = await ctx.db.from('company_candidates').update({ opened_at: ctx.now().toISOString() }).eq('id', candidate.id).is('opened_at', null);
        if (error) console.error(JSON.stringify({ company_hiring: 'opened_failed', error: error.message }));
        const attempt = await attemptOf(ctx, candidate);
        personal = {
          name: candidate.name, email: candidate.email, phone: candidate.phone,
          status: attempt?.status === 'started' ? 'running' : attempt?.status === 'submitted' || attempt?.status === 'graded' ? 'finished' : 'new',
        };
      }
      return {
        personal,
        test: {
          company: org.name, title: assessment.title, job_role: assessment.job_role, skills,
          time_limit_minutes: assessment.time_limit_minutes, suggested_minutes: suggestedMinutes(skills), closes_at: assessment.closes_at,
          show_level: settingsOf(assessment).show_level === true, speaking: skills.includes('speaking'), listening: skills.includes('listening'),
          locale: (org.settings as Record<string, unknown>)?.locale ?? 'ru',
        },
        open: open || (org.status !== 'closed' && personal?.status === 'running'),
      };
    },
  },
  {
    method: 'POST', path: 'public/t/:token/start', access: 'public',
    async handle(ctx, params, body) {
      const input = obj(body);
      if (!(await withinLimit(ctx, 'start', LINK_VIEWS_PER_HOUR))) throw new CompanyError('too_many_requests', 'Too many requests from this network. Try again in an hour.', 429);
      const { assessment, org, candidate } = await byLink(ctx, params.token);
      // Paused workspaces may finish an existing test; closed ones must not
      // return a replacement access key or test content through a personal link.
      if (org.status === 'closed') throw new CompanyError('org_closed', 'This workspace is closed.', 403);
      if (candidate) {
        // A personal link is proof of who this is: it reopens a running test on any device,
        // with a new key, and never starts a second test after a finished one.
        ctx.org = org;
        const earlier = await attemptOf(ctx, candidate);
        const current = earlier ? await expireIfOverdue(ctx, earlier, assessment, org, null, false) : null;
        if (current?.status === 'started') {
          const key = token(24);
          check(await ctx.db.from('company_attempts').update({ access_token_hash: await sha256(key) }).eq('id', current.id).eq('org_id', org.id));
          await ctx.audit('hiring.candidate_resumed', current.id, { assessment: assessment.id });
          return { key, ...candidateView(ctx, current, assessment, org) };
        }
        if (current?.status === 'submitted' || current?.status === 'graded') throw new CompanyError('test_taken', 'You have already completed this test.', 409);
      }
      if (closed(assessment, ctx.now()) || !orgOpen(org, ctx.now())) throw new CompanyError('test_closed', 'This test is closed.', 409);
      if (input.consent !== true) throw new CompanyError('consent_required', 'Please agree to the processing of your answers first.', 400, { field: 'consent' });
      const name = text(input.name ?? candidate?.name, 'name', { min: 2, max: 120 })!;
      // A personal link was made for one address, so it cannot be used to test under another.
      const address = candidate?.email ?? email(input.email, 'email')!;
      const phone = text(input.phone ?? candidate?.phone, 'phone', { max: 40, optional: true });
      // Everyone at a recruiting event may share one network: a personal link is its own limit.
      if (!candidate && await startsThisHour(ctx, assessment, org) >= STARTS_PER_HOUR) {
        throw new CompanyError('too_many_starts', 'Too many tests were started from this network. Try again in an hour.', 429);
      }
      ctx.org = org;
      // An attempt left to run out closes first: with no answers it stops blocking this email.
      const mine = check<AttemptRow[]>(await ctx.db.from('company_attempts').select(ATTEMPT_COLUMNS).eq('assessment_id', assessment.id).eq('candidate_email', address).neq('status', 'expired').limit(20));
      const current = await Promise.all(mine.map((row) => expireIfOverdue(ctx, row, assessment, org, null, false)));
      if (assessment.max_attempts !== null) {
        const taken = await ctx.db.from('company_attempts').select('id', { count: 'exact', head: true }).eq('assessment_id', assessment.id).neq('status', 'expired');
        if (taken.error) throw new Error(taken.error.message);
        if ((taken.count ?? 0) >= assessment.max_attempts) throw new CompanyError('test_full', 'This test has reached its number of candidates.', 409);
      }
      if (current.some((row) => row.status !== 'expired')) throw await cannotStart(ctx, assessment, org);
      const key = token(24);
      let attempt: AttemptRow;
      try {
        attempt = await startAttempt(ctx, {
          assessment, org, member: null, candidate: { name, email: address, phone }, accessHash: await sha256(key),
          integrity: { ip_hash: ctx.ipHash, user_agent: (ctx.req.headers.get('user-agent') ?? '').slice(0, 200) },
        });
      } catch (cause) {
        if (cause instanceof CompanyError && cause.code === 'attempt_exists') throw await cannotStart(ctx, assessment, org);
        throw cause;
      }
      if (candidate && !candidate.email) {
        // Invited by phone only: they gave their address now.
        const { error } = await ctx.db.from('company_candidates').update({ attempt_id: attempt.id, email: address, name, phone, opened_at: candidate.opened_at ?? ctx.now().toISOString() }).eq('id', candidate.id);
        if (error) {
          console.error(JSON.stringify({ company_hiring: 'candidate_attach_failed', error: error.message }));
          await ctx.db.from('company_candidates').update({ attempt_id: attempt.id }).eq('id', candidate.id);
        }
      } else await attachCandidate(ctx, attempt);
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
