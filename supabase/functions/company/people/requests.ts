// What employees ask HR for (a learning seat, a different job role) and the person's own
// profile: their name, language, requests, leaving and downloading their data.
import { HR_ROLES, isJobRole } from '../../../../packages/company-core/src/mod.ts';
import { accessSyncFlag, syncAccess } from '../core.ts';
import { contractEnded, MEMBER_COLUMNS } from '../handler.ts';
import { check, checkUnique, CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { inChunks, obj, oneOf, text } from '../util.ts';
import { countsForCompany } from './health.ts';
import { DAY, fetchAll, loadMember, seatCount } from './shared.ts';

export const REQUEST_KINDS = ['seat', 'job_role'] as const;
const REQUEST_COLUMNS = 'id,org_id,member_id,kind,job_role,note,status,decided_at,created_at';
interface RequestRow { id: string; org_id: string; member_id: string; kind: (typeof REQUEST_KINDS)[number]; job_role: string | null; note: string | null; status: string; decided_at: string | null; created_at: string }

const self = (ctx: Ctx): MemberRow => {
  if (!ctx.member) throw new CompanyError('not_member', 'You are not in this workspace.', 403);
  return ctx.member;
};

/** Tables with a person's own learning rows, for "download my data". A table that is not there yet is skipped. */
const OWN_TABLES: { key: string; table: string; columns: string }[] = [
  { key: 'lessons', table: 'company_lesson_progress', columns: '*' },
  { key: 'assignments', table: 'company_assignments', columns: '*' },
  { key: 'roleplays', table: 'company_roleplay_sessions', columns: '*' },
  { key: 'writing_checks', table: 'company_writing_checks', columns: '*' },
];

export const requestRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/profile', access: 'org', allowSuspended: true,
    async handle(ctx) {
      const member = self(ctx);
      const extra = check<{ locale: string | null } | null>(await ctx.db.from('company_members').select('locale').eq('id', member.id).maybeSingle());
      const department = member.department_id ? check<{ name: string } | null>(await ctx.db.from('company_departments').select('name').eq('id', member.department_id).eq('org_id', ctx.org!.id).maybeSingle()) : null;
      const requests = check<RequestRow[]>(await ctx.db.from('company_member_requests').select(REQUEST_COLUMNS).eq('org_id', ctx.org!.id).eq('member_id', member.id).order('created_at', { ascending: false }).limit(20));
      const owners = check<{ id: string }[]>(await ctx.db.from('company_members').select('id').eq('org_id', ctx.org!.id).eq('role', 'owner').eq('status', 'active'));
      return {
        member, email: ctx.email, locale: extra?.locale ?? null, department: department?.name ?? null, requests,
        last_owner: member.role === 'owner' && owners.length <= 1,
        seats_available_here: ctx.org!.status === 'active',


      };
    },
  },
  {
    // { full_name?, locale? }: a person keeps their own name and language right, also while a workspace is paused.
    method: 'PATCH', path: 'orgs/:org/profile', access: 'org', allowSuspended: true,
    async handle(ctx, _params, body) {
      const member = self(ctx), input = obj(body);
      const patch: Record<string, unknown> = {};
      if ('full_name' in input) patch.full_name = text(input.full_name, 'full_name', { min: 2, max: 120 });
      if ('locale' in input) patch.locale = input.locale === null ? null : oneOf(input.locale, ['en', 'ru', 'uz'] as const, 'locale');
      if (!Object.keys(patch).length) return { member };
      const updated = check<MemberRow>(await ctx.db.from('company_members').update(patch).eq('id', member.id).select(MEMBER_COLUMNS).single());
      await ctx.audit('member.profile_updated', member.id, { fields: Object.keys(patch) });
      return { member: updated, locale: patch.locale ?? undefined };
    },
  },
  {
    // { kind: 'seat' | 'job_role', job_role?, note? }: goes to HR, who decide.
    method: 'POST', path: 'orgs/:org/profile/requests', access: 'org',
    async handle(ctx, _params, body) {
      const member = self(ctx), org = ctx.org!, input = obj(body);
      const kind = oneOf(input.kind, REQUEST_KINDS, 'kind');
      let job_role: string | null = null;
      if (kind === 'seat') {
        if (member.seat) throw new CompanyError('already_seated', 'You already have a learning seat.', 409);
        if (org.status !== 'active') throw new CompanyError('seats_inactive', 'Learning seats are available once Schood activates your agreement.', 409, { status: org.status });
      } else {
        if (!isJobRole(input.job_role)) throw new CompanyError('invalid_field', 'job_role is not a job role.', 400, { field: 'job_role' });
        job_role = input.job_role;
        if (job_role === member.job_role) throw new CompanyError('job_role_same', 'This is already your job role.', 409);
      }
      const request = checkUnique<RequestRow>(await ctx.db.from('company_member_requests').insert({
        org_id: org.id, member_id: member.id, user_id: ctx.user, kind, job_role, note: text(input.note, 'note', { max: 500, optional: true }), status: 'pending',
      }).select(REQUEST_COLUMNS).single(), () => new CompanyError('request_pending', 'You already have a request waiting for HR.', 409));
      await ctx.audit('request.created', request.id, { kind, job_role });
      return { request };
    },
  },
  {
    method: 'DELETE', path: 'orgs/:org/profile/requests/:request', access: 'org', allowSuspended: true,
    async handle(ctx, params) {
      const member = self(ctx);
      if (!UUID.test(params.request)) throw new CompanyError('request_not_found', 'Request not found.', 404);
      const rows = check<{ id: string }[]>(await ctx.db.from('company_member_requests').update({ status: 'withdrawn' }).eq('id', params.request).eq('org_id', ctx.org!.id).eq('member_id', member.id).eq('status', 'pending').select('id'));
      if (!rows.length) throw new CompanyError('request_decided', 'This request has already been decided.', 409);
      return { ok: true };
    },
  },
  {
    // Everything this workspace holds about the person who asks, and nobody else. Private AI-tutor chats are not company data and are not here.
    method: 'GET', path: 'orgs/:org/profile/export', access: 'org', allowSuspended: true,
    async handle(ctx) {
      const member = self(ctx), org = ctx.org!;
      const attempts = await fetchAll<Record<string, unknown>>(() => ctx.db.from('company_attempts').select('id,assessment_id,status,started_at,submitted_at,graded_at,overall_level,overall_score,skill_results,ai_feedback,certificate_code').eq('org_id', org.id).eq('member_id', member.id).order('started_at').order('id'));
      const activity = await fetchAll<Record<string, unknown>>(() => ctx.db.from('company_activity').select('kind,minutes,points,ref,created_at').eq('org_id', org.id).eq('member_id', member.id).order('created_at').order('id'), 100_000);
      const requests = check<RequestRow[]>(await ctx.db.from('company_member_requests').select(REQUEST_COLUMNS).eq('org_id', org.id).eq('member_id', member.id).order('created_at'));
      const out: Record<string, unknown> = {
        exported_at: ctx.now().toISOString(),
        workspace: { id: org.id, name: org.name },
        person: { ...member, account_email: ctx.email },
        tests: attempts, activity, requests,
      };
      for (const { key, table, columns } of OWN_TABLES) {
        const { data, error } = await ctx.db.from(table).select(columns).eq('org_id', org.id).eq('member_id', member.id);
        if (error) console.error(JSON.stringify({ company_export: 'skipped', table, error: error.message }));
        out[key] = error ? [] : data ?? [];
      }
      await ctx.audit('member.data_exported', member.id);
      return out;
    },
  },
  {
    // HR's inbox of requests. Oldest first: they have waited longest.
    method: 'GET', path: 'orgs/:org/people/requests', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx) {
      const org = ctx.org!;
      const rows = await fetchAll<RequestRow>(() => ctx.db.from('company_member_requests').select(REQUEST_COLUMNS).eq('org_id', org.id).eq('status', 'pending').order('created_at').order('id'));
      const people = await inChunks([...new Set(rows.map((row) => row.member_id))], (chunk) => fetchAll<MemberRow>(() => ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).in('id', chunk).order('id')));
      const byId = new Map(people.map((row) => [row.id, row]));
      return { requests: rows.map((row) => ({ ...row, person: byId.get(row.member_id)?.full_name || byId.get(row.member_id)?.email || null, current_job_role: byId.get(row.member_id)?.job_role ?? null, seat: byId.get(row.member_id)?.seat ?? false })) };
    },
  },
  {
    // { decision: 'approve' | 'decline' }: approving does what was asked, within the seat limit.
    method: 'POST', path: 'orgs/:org/people/requests/:request', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const org = ctx.org!, input = obj(body);
      const decision = oneOf(input.decision, ['approve', 'decline'] as const, 'decision');
      if (!UUID.test(params.request)) throw new CompanyError('request_not_found', 'Request not found.', 404);
      const request = check<RequestRow | null>(await ctx.db.from('company_member_requests').select(REQUEST_COLUMNS).eq('id', params.request).eq('org_id', org.id).maybeSingle());
      if (!request) throw new CompanyError('request_not_found', 'Request not found.', 404);
      if (request.status !== 'pending') throw new CompanyError('request_decided', 'This request has already been decided.', 409);
      const member = await loadMember(ctx, org.id, request.member_id);
      if (decision === 'approve' && member.status === 'removed') throw new CompanyError('member_removed', 'This person was removed from the workspace.', 409);
      if (decision === 'approve' && request.kind === 'seat' && !member.seat) {
        if (org.status !== 'active') throw new CompanyError('seats_inactive', 'Learning seats are available once Schood activates your agreement.', 409, { status: org.status });
        if (contractEnded(org, ctx.now())) throw new CompanyError('seats_contract_ended', 'This agreement has ended, so learning seats cannot be turned on. Extend the contract first.', 409);
        if (await seatCount(ctx.db, org.id) >= org.seats_limit) throw new CompanyError('seats_full', 'All learning seats are in use.', 409, { limit: org.seats_limit });
      }
      // Claimed first: of two HR tabs, one decides and one is told it is done.
      const claimed = check<RequestRow[]>(await ctx.db.from('company_member_requests').update({ status: decision === 'approve' ? 'approved' : 'declined', decided_by: ctx.user, decided_at: ctx.now().toISOString() }).eq('id', request.id).eq('status', 'pending').select(REQUEST_COLUMNS));
      if (!claimed.length) throw new CompanyError('request_decided', 'This request has already been decided.', 409);
      let access = 'none';
      if (decision === 'approve' && request.kind === 'job_role' && request.job_role) check(await ctx.db.from('company_members').update({ job_role: request.job_role }).eq('id', member.id));
      if (decision === 'approve' && request.kind === 'seat' && !member.seat) {
        // Counted and turned on under the workspace lock: of several approvals for the last
        // free seat one wins, instead of each turning it on, counting too many and backing out.
        const claim = check<string>(await ctx.db.rpc('company_claim_seat', { p_org: org.id, p_member: member.id }));
        if (claim === 'full' || claim === 'missing') {
          check(await ctx.db.from('company_member_requests').update({ status: 'pending', decided_by: null, decided_at: null }).eq('id', request.id));
          if (claim === 'missing') throw new CompanyError('member_removed', 'This person was removed from the workspace.', 409);
          throw new CompanyError('seats_full', 'All learning seats are in use.', 409, { limit: org.seats_limit });
        }
        access = await syncAccess(ctx.db, member.user_id);
      }
      await ctx.audit(`request.${decision === 'approve' ? 'approved' : 'declined'}`, request.id, { kind: request.kind, member: member.id, job_role: request.job_role, access });
      return { request: claimed[0], ...accessSyncFlag(access) };
    },
  },
  {
    // Seats that could go to someone else, before buying more. Activity is read only for people who
    // agreed to share it; those who did not are just counted. Someone who joined in the last two weeks is left alone.
    method: 'GET', path: 'orgs/:org/people/seats/idle', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx) {
      const org = ctx.org!, now = ctx.now(), since = new Date(now.getTime() - 30 * DAY).toISOString(), settled = now.getTime() - 14 * DAY;
      const seated = await fetchAll<MemberRow>(() => ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('seat', true).neq('status', 'removed').order('id'));
      const sharing = seated.filter((row) => row.status === 'active' && row.consent_at);
      const activity = await inChunks(sharing.map((row) => row.id), (chunk) => fetchAll<{ member_id: string; kind: string; created_at: string }>(() => ctx.db.from('company_activity').select('member_id,kind,created_at').eq('org_id', org.id).in('member_id', chunk).gte('created_at', since).order('created_at').order('id'), 100_000));
      const byId = new Map(seated.map((row) => [row.id, row]));
      const busy = new Set(activity.filter((row) => countsForCompany(row, byId.get(row.member_id))).map((row) => row.member_id));
      const summary = (row: MemberRow) => ({ id: row.id, name: row.full_name || row.email, department_id: row.department_id, joined_at: row.joined_at });
      return {
        idle: sharing.filter((row) => !busy.has(row.id) && (!row.joined_at || Date.parse(row.joined_at) < settled)).map(summary),
        not_joined: seated.filter((row) => row.status === 'invited').map(summary),
        not_sharing: seated.filter((row) => row.status === 'active' && !row.consent_at).length,
        seats_used: seated.length,
      };
    },
  },
  {
    // HR's presence, for the workspace's health at Schood. Once an hour at most, and only owners' and admins'.
    method: 'POST', path: 'orgs/:org/people/me/seen', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx) {
      if (!ctx.member) return { ok: true };
      const now = ctx.now(), hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
      const current = check<{ last_seen_at: string | null } | null>(await ctx.db.from('company_members').select('last_seen_at').eq('id', ctx.member.id).maybeSingle());
      if (!current?.last_seen_at || current.last_seen_at < hourAgo) check(await ctx.db.from('company_members').update({ last_seen_at: now.toISOString() }).eq('id', ctx.member.id));
      return { ok: true };
    },
  },
];
