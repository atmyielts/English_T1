// The applicant tracking layer's shared pieces: candidate rows, attaching an attempt to its
// candidate, moving through stages, the timeline, personal links, rate limits and message
// lookups. Routes live in candidates.ts, share.ts and retention.ts; hr.ts and public.ts use
// the helpers. Everything that runs during a candidate's test start is best-effort: a
// failure here is logged and never stops the test.
import { fetchAll } from '../insights/common.ts';
import { CompanyError, check, type Ctx } from '../types.ts';
import { sha256, token } from '../util.ts';
import { attemptRow } from './shared.ts';
import type { AssessmentRow, AttemptRow } from './attempts.ts';
import { STAGE_ORDER, benchmark, type Benchmark, type Stage } from './benchmark.ts';
import type { CustomTemplates } from './messages.ts';

export const CANDIDATE_COLUMNS = 'id,org_id,assessment_id,attempt_id,name,email,phone,source,invite_token_hash,stage,stage_at,furthest_stage,invited_at,opened_at,reminded_at,reminders,hired_at,interview_kit,anonymised_at,created_by,created_at,updated_at';

export interface InterviewKit {
  source: 'ai' | 'bank'; reason?: 'ai_limit' | 'ai_unavailable' | null; locale: string; created_at: string; weak: string[];
  questions: { skill: string; question: string; follow_up: string; listen_for: string }[];
  /** The interviewer's score out of 5 per question (by position), and their summary. */
  ratings?: Record<string, number>;
  summary?: string | null;
}

/** The average of an interview's scores, or null before anyone scored it. */
export function interviewAverage(kit: Pick<InterviewKit, 'ratings'> | null | undefined): number | null {
  const values = Object.values(kit?.ratings ?? {});
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
}

export interface CandidateRow {
  id: string; org_id: string; assessment_id: string; attempt_id: string | null; name: string | null; email: string | null; phone: string | null;
  source: 'link' | 'invite'; invite_token_hash: string | null; stage: Stage; stage_at: string; furthest_stage: Stage;
  invited_at: string | null; opened_at: string | null; reminded_at: string | null; reminders: number; hired_at: string | null;
  interview_kit: InterviewKit | null; anonymised_at: string | null; created_by: string | null; created_at: string; updated_at: string;
}

export const inviteLink = (ctx: Ctx, raw: string) => `${ctx.env.appUrl}/t/${raw}`;
export async function newInviteToken(): Promise<{ raw: string; hash: string }> {
  const raw = token(24);
  return { raw, hash: await sha256(raw) };
}

export async function loadCandidate(ctx: Ctx, id: string): Promise<CandidateRow> {
  const row = check<CandidateRow | null>(await ctx.db.from('company_candidates').select(CANDIDATE_COLUMNS).eq('id', id).eq('org_id', ctx.org!.id).maybeSingle());
  if (!row) throw new CompanyError('candidate_not_found', 'This candidate was not found.', 404);
  return row;
}

export function refuseErased(candidate: Pick<CandidateRow, 'anonymised_at'>) {
  if (candidate.anonymised_at) throw new CompanyError('candidate_erased', 'This candidate\'s personal data has been deleted.', 409);
}

/** Adds a line to the timeline. Never throws: the action it records has already happened. */
export async function logNote(ctx: Ctx, candidate: Pick<CandidateRow, 'id' | 'org_id'>, kind: 'note' | 'stage' | 'message' | 'system', body: string | null, details: Record<string, unknown> = {}) {
  const { error } = await ctx.db.from('company_candidate_notes').insert({ org_id: candidate.org_id, candidate_id: candidate.id, author: ctx.user, kind, body, details, created_at: ctx.now().toISOString() });
  if (error) console.error(JSON.stringify({ company_hiring: 'note_failed', kind, error: error.message }));
}

/** What a move to this stage means for the test's decision column, which reports and insights read. */
const DECISION_FOR: Partial<Record<Stage, 'shortlist' | 'reject'>> = { interview: 'shortlist', offer: 'shortlist', hired: 'shortlist', rejected: 'reject' };

/**
 * Moves one candidate. A repeat of the same move (double click, second tab) changes nothing
 * and adds nothing to the timeline, because the update only matches a different stage.
 */
export async function moveStage(ctx: Ctx, candidate: CandidateRow, stage: Stage): Promise<CandidateRow> {
  refuseErased(candidate);
  const now = ctx.now().toISOString();
  const reached = STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(candidate.furthest_stage) ? stage : candidate.furthest_stage;
  const rows = check<CandidateRow[]>(await ctx.db.from('company_candidates')
    .update({ stage, stage_at: now, furthest_stage: reached, hired_at: stage === 'hired' ? now : null })
    .eq('id', candidate.id).eq('org_id', ctx.org!.id).neq('stage', stage).select(CANDIDATE_COLUMNS));
  if (!rows.length) return { ...candidate, stage };
  await logNote(ctx, candidate, 'stage', null, { from: candidate.stage, to: stage });
  // Taken back from rejected with no new decision: the old "reject" must not stay on the report.
  const decision = DECISION_FOR[stage] ?? (candidate.stage === 'rejected' ? null : undefined);
  if (decision !== undefined && candidate.attempt_id) {
    const { error } = await ctx.db.from('company_attempts').update({ decision, decision_by: decision ? ctx.user : null }).eq('id', candidate.attempt_id).eq('org_id', ctx.org!.id);
    if (error) console.error(JSON.stringify({ company_hiring: 'decision_sync_failed', error: error.message }));
  }
  return rows[0];
}

/** A decision taken on the report moves the candidate too. New stays new until HR looks; a decision is looking. */
export async function syncStageFromDecision(ctx: Ctx, attempt: Pick<AttemptRow, 'id'>, decision: 'shortlist' | 'hold' | 'reject' | null) {
  const { data, error } = await ctx.db.from('company_candidates').select(CANDIDATE_COLUMNS).eq('attempt_id', attempt.id).eq('org_id', ctx.org!.id).maybeSingle();
  const candidate = data as CandidateRow | null;
  if (error || !candidate || candidate.anonymised_at) return;
  try {
    if (decision === 'reject') await moveStage(ctx, candidate, 'rejected');
    else if (decision && (candidate.stage === 'new' || candidate.stage === 'rejected')) await moveStage(ctx, candidate, 'reviewing');
  } catch (cause) {
    console.error(JSON.stringify({ company_hiring: 'stage_sync_failed', error: String(cause) }));
  }
}

const candidateFromAttempt = (attempt: AttemptRow, now: string) => ({
  org_id: attempt.org_id, assessment_id: attempt.assessment_id, attempt_id: attempt.id,
  name: attempt.candidate_name, email: attempt.candidate_email, phone: attempt.candidate_phone, source: 'link',
  stage: attempt.decision === 'reject' ? 'rejected' : attempt.decision ? 'reviewing' : 'new',
  furthest_stage: attempt.decision === 'shortlist' || attempt.decision === 'hold' ? 'reviewing' : 'new',
  stage_at: attempt.started_at || now, created_at: attempt.started_at || now,
});

/**
 * Connects a started attempt to its candidate, or creates one (someone who came through the
 * open link). An invited person using the open link with the same email joins their own row.
 */
export async function attachCandidate(ctx: Ctx, attempt: AttemptRow): Promise<void> {
  try {
    const now = ctx.now().toISOString();
    if (attempt.candidate_email) {
      const existing = check<CandidateRow | null>(await ctx.db.from('company_candidates').select(CANDIDATE_COLUMNS).eq('assessment_id', attempt.assessment_id).eq('email', attempt.candidate_email).maybeSingle());
      if (existing) {
        check(await ctx.db.from('company_candidates').update({ attempt_id: attempt.id, name: attempt.candidate_name ?? existing.name, phone: attempt.candidate_phone ?? existing.phone, opened_at: existing.opened_at ?? now }).eq('id', existing.id));
        return;
      }
    }
    const inserted = await ctx.db.from('company_candidates').insert({ ...candidateFromAttempt(attempt, now), opened_at: now, stage_at: now, created_at: now });
    // Two starts at once: the other request made the row, and the next list reconnects this attempt.
    if (inserted.error && inserted.error.code !== '23505') throw new Error(inserted.error.message);
  } catch (cause) {
    console.error(JSON.stringify({ company_hiring: 'candidate_attach_failed', attempt: attempt.id, error: String(cause) }));
  }
}

/**
 * Candidates of a test, making sure every attempt has one. Normally each start made its row;
 * this covers an attempt from before the migration ran, or a start whose candidate write failed.
 */
export async function candidatesWithAttempts(ctx: Ctx, assessmentId: string, attempts: AttemptRow[]): Promise<CandidateRow[]> {
  const rows = await fetchAll<CandidateRow>(() => ctx.db.from('company_candidates').select(CANDIDATE_COLUMNS).eq('org_id', ctx.org!.id).eq('assessment_id', assessmentId).order('created_at', { ascending: false }).order('id'));
  const attached = new Set(rows.map((row) => row.attempt_id).filter(Boolean));
  const emails = new Map(rows.filter((row) => row.email).map((row) => [row.email, row]));
  const loose = attempts.filter((attempt) => !attempt.member_id && !attached.has(attempt.id));
  if (!loose.length) return rows;
  // Newest first, so a person with two tries is attached to the latest. An earlier try stays unattached.
  for (const attempt of loose) {
    const known = attempt.candidate_email ? emails.get(attempt.candidate_email) : undefined;
    if (known) {
      if (!known.attempt_id) {
        const { error } = await ctx.db.from('company_candidates').update({ attempt_id: attempt.id }).eq('id', known.id);
        if (!error) known.attempt_id = attempt.id;
      }
      continue;
    }
    const inserted = await ctx.db.from('company_candidates').insert(candidateFromAttempt(attempt, ctx.now().toISOString())).select(CANDIDATE_COLUMNS).maybeSingle();
    if (inserted.error) {
      if (inserted.error.code !== '23505') console.error(JSON.stringify({ company_hiring: 'candidate_backfill_failed', error: inserted.error.message }));
      continue;
    }
    if (inserted.data) {
      rows.push(inserted.data as CandidateRow);
      if (attempt.candidate_email) emails.set(attempt.candidate_email, inserted.data as CandidateRow);
    }
  }
  return rows;
}

export type Track = 'invited' | 'opened' | 'started' | 'finished' | 'graded' | 'expired';
export function trackOf(candidate: Pick<CandidateRow, 'opened_at'>, attempt: Pick<AttemptRow, 'status'> | null): Track {
  if (attempt) return attempt.status === 'started' ? 'started' : attempt.status === 'graded' ? 'graded' : attempt.status === 'submitted' ? 'finished' : 'expired';
  return candidate.opened_at ? 'opened' : 'invited';
}

/** One candidate as HR sees them: no token hash, and the scores with a verdict against the role. */
export function candidateView(candidate: CandidateRow, attempt: AttemptRow | null, assessment: AssessmentRow, sameNetwork = 0) {
  const row = attempt ? attemptRow(attempt, assessment, sameNetwork) : null;
  const fit: Benchmark = benchmark(attempt ? { status: attempt.status, overall_level: attempt.overall_level, overall_score: attempt.overall_score, skill_results: attempt.skill_results } : null, assessment);
  const { invite_token_hash, interview_kit: _kit, created_by: _creator, ...rest } = candidate;
  return {
    ...rest,
    has_personal_link: Boolean(invite_token_hash),
    track: trackOf(candidate, attempt),
    status: attempt?.status ?? null,
    started_at: attempt?.started_at ?? null,
    submitted_at: attempt?.submitted_at ?? null,
    minutes: attempt?.submitted_at ? Math.round((Date.parse(attempt.submitted_at) - Date.parse(attempt.started_at)) / 60_000) : null,
    overall_level: attempt?.overall_level ?? null,
    overall_score: attempt?.overall_score === null || attempt?.overall_score === undefined ? null : Number(attempt.overall_score),
    pending: row?.pending ?? [],
    flags: row?.flags ?? [],
    decision: attempt?.decision ?? null,
    benchmark: fit,
    interview_average: interviewAverage(candidate.interview_kit),
  };
}

/**
 * One request against a limit per client address. If the counter itself is unavailable the
 * page still works: keys are long random values, so the limit is a brake and not the lock.
 */
export async function withinLimit(ctx: Ctx, bucket: string, limit: number, windowSeconds = 3600): Promise<boolean> {
  const { data, error } = await ctx.db.rpc('company_hiring_hit', { p_bucket: `${bucket}:${ctx.ipHash}`, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    console.error(JSON.stringify({ company_hiring: 'rate_limit_unavailable', error: error.message }));
    return true;
  }
  return data !== false;
}

export async function hiringSettings(ctx: Ctx, orgId: string): Promise<{ retention_months: number | null; templates: CustomTemplates }> {
  const row = check<{ retention_months: number | null; templates: CustomTemplates } | null>(await ctx.db.from('company_hiring_settings').select('retention_months,templates').eq('org_id', orgId).maybeSingle());
  return { retention_months: row?.retention_months ?? null, templates: (row?.templates ?? {}) as CustomTemplates };
}
