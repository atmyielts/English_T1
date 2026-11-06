// Deleting candidate personal data, now or after a period the workspace chooses, and the
// workspace's hiring settings. Anonymous scores stay so a company's hiring statistics hold.
// The nightly job is the SQL function company_hiring_apply_retention(); erasing one person
// here does what company_hiring_anonymise_candidate() does there. Keep the two in step.
import { fetchAll } from '../insights/common.ts';
import { check, CompanyError, type Ctx, type Route } from '../types.ts';
import { inChunks, int, obj, uuid } from '../util.ts';
import { CANDIDATE_COLUMNS, hiringSettings, loadCandidate, type CandidateRow } from './ats.ts';
import type { AttemptRow } from './attempts.ts';
import { DEFAULT_TEMPLATES, readTemplates } from './messages.ts';
import { HR } from './shared.ts';

export const MAX_BULK_ERASE = 200;

const RUNNING = () => new CompanyError('candidate_in_test', 'This person is taking the test right now. Try again after it ends.', 409);

export async function eraseCandidate(ctx: Ctx, candidate: CandidateRow): Promise<void> {
  if (candidate.anonymised_at) return;
  const orgId = ctx.org!.id;
  type Light = Pick<AttemptRow, 'id' | 'status' | 'integrity' | 'candidate_email'>;
  const attached = candidate.attempt_id ? check<Light[]>(await ctx.db.from('company_attempts').select('id,status,integrity,candidate_email').eq('id', candidate.attempt_id).eq('org_id', orgId)) : [];
  const sameEmail = candidate.email ? await fetchAll<Light>(() => ctx.db.from('company_attempts').select('id,status,integrity,candidate_email').eq('org_id', orgId).eq('assessment_id', candidate.assessment_id).eq('candidate_email', candidate.email).is('member_id', null).order('id')) : [];
  const attempts = [...new Map([...attached, ...sameEmail].map((attempt) => [attempt.id, attempt])).values()];
  if (attempts.some((attempt) => attempt.status === 'started')) throw RUNNING();
  for (const attempt of attempts) {
    const { ip_hash: _ip, user_agent: _agent, ...integrity } = (attempt.integrity ?? {}) as Record<string, unknown>;
    check(await ctx.db.from('company_attempts').update({
      candidate_name: null, candidate_email: null, candidate_phone: null, access_token_hash: null, notes: null, answers: {}, ai_feedback: {}, certificate_code: null,
      integrity: { ...integrity, anonymised: true },
    }).eq('id', attempt.id).eq('org_id', orgId));
  }
  check(await ctx.db.from('company_candidate_notes').delete().eq('candidate_id', candidate.id).eq('org_id', orgId));
  check(await ctx.db.from('company_share_links').delete().eq('candidate_id', candidate.id).eq('org_id', orgId));
  check(await ctx.db.from('company_candidates').update({ name: null, email: null, phone: null, invite_token_hash: null, interview_kit: null, anonymised_at: ctx.now().toISOString() }).eq('id', candidate.id).eq('org_id', orgId));
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/hiring/settings', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx) {
      const settings = await hiringSettings(ctx, ctx.org!.id);
      return { retention_months: settings.retention_months, templates: settings.templates, defaults: DEFAULT_TEMPLATES };
    },
  },
  {
    method: 'PUT', path: 'orgs/:org/hiring/settings', access: 'org', roles: HR,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const current = await hiringSettings(ctx, ctx.org!.id);
      const retention = input.retention_months === undefined ? current.retention_months : input.retention_months === null || input.retention_months === '' ? null : int(input.retention_months, 'retention_months', { min: 1, max: 120 });
      const templates = input.templates === undefined ? current.templates : readTemplates(input.templates);
      check(await ctx.db.from('company_hiring_settings').upsert({ org_id: ctx.org!.id, retention_months: retention, templates, updated_by: ctx.user }, { onConflict: 'org_id' }));
      await ctx.audit('hiring.settings_updated', null, { retention_months: retention, templates: Object.keys(templates) });
      return { retention_months: retention, templates };
    },
  },
  {
    // Declared before the single-candidate route, whose :candidate would otherwise match "bulk".
    method: 'POST', path: 'orgs/:org/candidates/bulk/erase', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, _params, body) {
      const ids = obj(body).ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > MAX_BULK_ERASE) throw new CompanyError('invalid_field', `Choose 1 to ${MAX_BULK_ERASE} candidates.`, 400, { field: 'ids', max: MAX_BULK_ERASE });
      const unique = [...new Set(ids.map((id) => uuid(id, 'ids')))];
      const rows = await inChunks(unique, (chunk) => fetchAll<CandidateRow>(() => ctx.db.from('company_candidates').select(CANDIDATE_COLUMNS).eq('org_id', ctx.org!.id).in('id', chunk).order('id')));
      let erased = 0, running = 0;
      for (const row of rows) {
        try {
          if (!row.anonymised_at) {
            await eraseCandidate(ctx, row);
            erased += 1;
          }
        } catch (cause) {
          if (cause instanceof CompanyError && cause.code === 'candidate_in_test') running += 1;
          else throw cause;
        }
      }
      await ctx.audit('hiring.candidates_erased', null, { erased, running });
      return { erased, running };
    },
  },
  {
    // Works in a paused or ended workspace too: a person may ask to be forgotten at any time.
    method: 'POST', path: 'orgs/:org/candidates/:candidate/erase', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      const candidate = await loadCandidate(ctx, uuid(params.candidate, 'candidate'));
      await eraseCandidate(ctx, candidate);
      await ctx.audit('hiring.candidate_erased', candidate.id, { assessment: candidate.assessment_id });
      return { ok: true };
    },
  },
];
