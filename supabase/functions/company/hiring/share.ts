// Read-only public pages at /s/:key. A report lets a hiring manager without an account see
// the candidates ranked against the role; a feedback page lets one candidate see their own
// result, when HR chooses to share it. The key is stored only as sha256; links expire, can
// be revoked and are rate-limited. Contact details appear only when HR opts in; HR notes,
// answers and network data never appear.
import { fetchAll } from '../insights/common.ts';
import { ORG_COLUMNS } from '../handler.ts';
import { check, CompanyError, type Ctx, type OrgRow, type Route } from '../types.ts';
import { int, obj, sha256, text, token, uuid } from '../util.ts';
import { CANDIDATE_COLUMNS, candidateView, loadCandidate, refuseErased, withinLimit, type CandidateRow } from './ats.ts';
import { ASSESSMENT_COLUMNS, ATTEMPT_COLUMNS, loadAssessment, type AssessmentRow, type AttemptRow } from './attempts.ts';
import { STAGES, byFit, type Stage } from './benchmark.ts';
import { attemptsOf } from './hr.ts';
import { HR, networkMatches } from './shared.ts';
import { integrityFlags } from './integrity.ts';

export const SHARE_VIEWS_PER_HOUR = 60;
const SHARE_COLUMNS = 'id,org_id,assessment_id,candidate_id,kind,key_hash,label,include_contacts,include_feedback,stages,expires_at,revoked_at,last_opened_at,opens,created_by,created_at';
const KEY = /^[A-Za-z0-9_-]{20,64}$/;

interface ShareRow {
  id: string; org_id: string; assessment_id: string; candidate_id: string | null; kind: 'report' | 'feedback'; key_hash: string; label: string | null;
  include_contacts: boolean; include_feedback: boolean; stages: string[]; expires_at: string; revoked_at: string | null; last_opened_at: string | null; opens: number; created_by: string | null; created_at: string;
}

const shareUrl = (ctx: Ctx, raw: string) => `${ctx.env.appUrl}/s/${raw}`;
const shareView = (row: ShareRow, now: Date) => {
  const { key_hash: _hash, created_by: _creator, ...rest } = row;
  return { ...rest, opens: row.opens ?? 0, active: !row.revoked_at && Date.parse(row.expires_at) > now.getTime() };
};

function expiryOf(ctx: Ctx, input: Record<string, unknown>): string {
  const days = int(input.days ?? 14, 'days', { min: 1, max: 90 })!;
  return new Date(ctx.now().getTime() + days * 86_400_000).toISOString();
}

function stagesOf(value: unknown): Stage[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((stage) => !(STAGES as readonly unknown[]).includes(stage))) throw new CompanyError('invalid_field', 'Choose known stages.', 400, { field: 'stages' });
  return [...new Set(value as Stage[])];
}

async function hiringTest(ctx: Ctx, id: string): Promise<AssessmentRow> {
  const row = await loadAssessment(ctx, ctx.org!.id, uuid(id, 'assessment'));
  if (row.kind !== 'hiring') throw new CompanyError('assessment_not_found', 'This test was not found.', 404);
  return row;
}

async function insertShare(ctx: Ctx, fields: Partial<ShareRow>) {
  const raw = token(24);
  const row = check<ShareRow>(await ctx.db.from('company_share_links').insert({ ...fields, org_id: ctx.org!.id, key_hash: await sha256(raw), created_by: ctx.user, created_at: ctx.now().toISOString() }).select(SHARE_COLUMNS).single());
  return { share: shareView(row, ctx.now()), link: shareUrl(ctx, raw) };
}

const skillsOf = (attempt: AttemptRow | null) => Object.fromEntries((attempt?.items ?? []).map((section) => {
  const result = attempt!.skill_results[section.skill];
  return [section.skill, result ? { level: result.level, score: result.score } : null];
}));

/** The hiring manager's page: ranked people who finished, against the role. */
async function reportPage(ctx: Ctx, link: ShareRow, assessment: AssessmentRow, org: OrgRow) {
  const candidates = await fetchAll<CandidateRow>(() => ctx.db.from('company_candidates').select(CANDIDATE_COLUMNS).eq('org_id', org.id).eq('assessment_id', assessment.id).is('anonymised_at', null).order('id'));
  ctx.org = org;
  const attempts = await attemptsOf(ctx, assessment.id);
  const byId = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const network = networkMatches(attempts);
  const rows = candidates.flatMap((candidate) => {
    const attempt = candidate.attempt_id ? byId.get(candidate.attempt_id) ?? null : null;
    if (attempt?.status !== 'graded') return [];
    if (link.stages.length && !link.stages.includes(candidate.stage)) return [];
    return [{ view: candidateView(candidate, attempt, assessment, network.get(attempt.id) ?? 0), attempt }];
  }).sort((a, b) => byFit(a.view, b.view));
  return {
    kind: 'report' as const,
    company: org.name, label: link.label, expires_at: link.expires_at, include_contacts: link.include_contacts,
    test: { title: assessment.title, job_role: assessment.job_role, skills: assessment.skills, min_level: assessment.min_level, skill_minimums: assessment.settings?.skill_minimums ?? {} },
    candidates: rows.map(({ view, attempt }, index) => ({
      rank: index + 1, name: view.name, stage: view.stage, overall_level: view.overall_level, overall_score: view.overall_score, verdict: view.benchmark.verdict,
      skills: view.benchmark.skills, submitted_at: view.submitted_at, minutes: view.minutes, interview_average: view.interview_average,
      flags: integrityFlags(attempt.integrity, attempt.items, 0).map((flag) => ({ code: flag.code, severity: flag.severity, value: flag.value })),
      summary: [attempt.ai_feedback?.writing?.summary, attempt.ai_feedback?.speaking?.summary].filter(Boolean),
      ...(link.include_contacts ? { email: view.email, phone: view.phone } : {}),
    })),
  };
}

/** The candidate's own page: their levels and, if HR allows, the written feedback. */
async function feedbackPage(ctx: Ctx, link: ShareRow, assessment: AssessmentRow, org: OrgRow) {
  const candidate = check<CandidateRow | null>(await ctx.db.from('company_candidates').select(CANDIDATE_COLUMNS).eq('id', link.candidate_id).eq('org_id', org.id).maybeSingle());
  if (!candidate || candidate.anonymised_at || !candidate.attempt_id) throw new CompanyError('share_not_found', 'This link is not valid.', 404);
  const attempt = check<AttemptRow | null>(await ctx.db.from('company_attempts').select(ATTEMPT_COLUMNS).eq('id', candidate.attempt_id).eq('org_id', org.id).maybeSingle());
  if (!attempt || attempt.status !== 'graded') throw new CompanyError('share_not_found', 'This link is not valid.', 404);
  const feedback = (skill: 'writing' | 'speaking') => {
    const entry = attempt.ai_feedback?.[skill];
    return entry ? { strengths: entry.strengths ?? [], improvements: entry.improvements ?? [], summary: entry.summary ?? '' } : null;
  };
  return {
    kind: 'feedback' as const,
    company: org.name, expires_at: link.expires_at, name: candidate.name,
    test: { title: assessment.title, job_role: assessment.job_role, skills: assessment.skills },
    overall_level: attempt.overall_level, overall_score: attempt.overall_score === null ? null : Number(attempt.overall_score),
    skills: skillsOf(attempt), date: attempt.graded_at, certificate_code: attempt.certificate_code,
    feedback: link.include_feedback ? { writing: feedback('writing'), speaking: feedback('speaking') } : null,
  };
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/assessments/:assessment/shares', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      const assessment = await hiringTest(ctx, params.assessment);
      const rows = await fetchAll<ShareRow>(() => ctx.db.from('company_share_links').select(SHARE_COLUMNS).eq('org_id', ctx.org!.id).eq('assessment_id', assessment.id).eq('kind', 'report').order('created_at', { ascending: false }).order('id'), 500);
      return { shares: rows.map((row) => shareView(row, ctx.now())) };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/assessments/:assessment/shares', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const input = obj(body);
      const assessment = await hiringTest(ctx, params.assessment);
      const result = await insertShare(ctx, {
        assessment_id: assessment.id, kind: 'report', label: text(input.label, 'label', { max: 120, optional: true }),
        include_contacts: input.include_contacts === true, stages: stagesOf(input.stages), expires_at: expiryOf(ctx, input),
      });
      await ctx.audit('hiring.share_created', assessment.id, { contacts: input.include_contacts === true, stages: result.share.stages, expires_at: result.share.expires_at });
      return result;
    },
  },
  {
    method: 'GET', path: 'orgs/:org/candidates/:candidate/shares', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      const candidate = await loadCandidate(ctx, uuid(params.candidate, 'candidate'));
      const rows = check<ShareRow[]>(await ctx.db.from('company_share_links').select(SHARE_COLUMNS).eq('org_id', ctx.org!.id).eq('candidate_id', candidate.id).order('created_at', { ascending: false }).limit(50));
      return { shares: rows.map((row) => shareView(row, ctx.now())) };
    },
  },
  {
    // The candidate's own report, to send them if HR decides to. Needs a graded test.
    method: 'POST', path: 'orgs/:org/candidates/:candidate/shares', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const input = body === undefined ? {} : obj(body);
      const candidate = await loadCandidate(ctx, uuid(params.candidate, 'candidate'));
      refuseErased(candidate);
      const attempt = candidate.attempt_id ? check<{ status: string } | null>(await ctx.db.from('company_attempts').select('status').eq('id', candidate.attempt_id).eq('org_id', ctx.org!.id).maybeSingle()) : null;
      if (attempt?.status !== 'graded') throw new CompanyError('not_graded', 'This candidate has no graded test yet.', 409);
      const result = await insertShare(ctx, { assessment_id: candidate.assessment_id, candidate_id: candidate.id, kind: 'feedback', include_feedback: input.include_feedback !== false, expires_at: expiryOf(ctx, { days: input.days ?? 30 }) });
      await ctx.audit('hiring.feedback_shared', candidate.id, { expires_at: result.share.expires_at });
      return result;
    },
  },
  {
    // Revoking must work in a paused workspace: it only takes access away.
    method: 'DELETE', path: 'orgs/:org/shares/:share', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      const id = uuid(params.share, 'share');
      const rows = check<{ id: string }[]>(await ctx.db.from('company_share_links').update({ revoked_at: ctx.now().toISOString() }).eq('id', id).eq('org_id', ctx.org!.id).is('revoked_at', null).select('id'));
      if (!rows.length) {
        const existing = check<{ id: string } | null>(await ctx.db.from('company_share_links').select('id').eq('id', id).eq('org_id', ctx.org!.id).maybeSingle());
        if (!existing) throw new CompanyError('share_not_found', 'This link is not valid.', 404);
      } else await ctx.audit('hiring.share_revoked', id);
      return { ok: true };
    },
  },
  {
    method: 'GET', path: 'public/s/:key', access: 'public',
    async handle(ctx, params) {
      if (!(await withinLimit(ctx, 'share', SHARE_VIEWS_PER_HOUR))) throw new CompanyError('too_many_requests', 'Too many requests from this network. Try again in an hour.', 429);
      if (!KEY.test(params.key)) throw new CompanyError('share_not_found', 'This link is not valid.', 404);
      const link = check<ShareRow | null>(await ctx.db.from('company_share_links').select(SHARE_COLUMNS).eq('key_hash', await sha256(params.key)).maybeSingle());
      if (!link || link.revoked_at) throw new CompanyError('share_not_found', 'This link is not valid.', 404);
      if (Date.parse(link.expires_at) <= ctx.now().getTime()) throw new CompanyError('share_expired', 'This link has expired.', 410);
      const org = check<OrgRow | null>(await ctx.db.from('company_orgs').select(ORG_COLUMNS).eq('id', link.org_id).maybeSingle());
      if (!org || org.status === 'closed') throw new CompanyError('share_not_found', 'This link is not valid.', 404);
      const assessment = check<AssessmentRow | null>(await ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('id', link.assessment_id).eq('org_id', org.id).maybeSingle());
      if (!assessment) throw new CompanyError('share_not_found', 'This link is not valid.', 404);
      const { error } = await ctx.db.from('company_share_links').update({ last_opened_at: ctx.now().toISOString(), opens: (link.opens ?? 0) + 1 }).eq('id', link.id);
      if (error) console.error(JSON.stringify({ company_hiring: 'share_count_failed', error: error.message }));
      return link.kind === 'feedback' ? await feedbackPage(ctx, link, assessment, org) : await reportPage(ctx, link, assessment, org);
    },
  },
];
