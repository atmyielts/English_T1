// The public API (api/v1/...) for HR systems: people, invitations, tests, results,
// candidates, levels and an activity summary. Bearer key auth happens here, so these are
// `public` routes to the router. Every read is filtered by the key's workspace. Lists
// answer { data, next_cursor }; a cursor is the last id of the previous page.
// Learning detail appears only for people who agreed to share it, and from the later of
// joining and agreeing for Schood English time. Level estimates and company tests are
// the exceptions the consent text names.
import { JOB_ROLES, LEVELS, isLevel, type JobRole } from '../../../../packages/company-core/src/mod.ts';
import { fetchAll, emptyLevels, parseRange, summarize, type ActivityRow, type LevelCounts } from '../insights/common.ts';
import { DAY as PEOPLE_DAY, inviteRoleFor, issueInvite, memberExists, PERSONAL_DAYS, revokeMemberInvites } from '../people/shared.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, checkUnique, CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { email as readEmail, obj, oneOf, text } from '../util.ts';
import { authenticateKey } from './apikeys.ts';
import { emailInvite, emailOpen } from './invite-email.ts';
import { likeEscape, queryText } from './shared.ts';

type Page<T> = { data: T[]; next_cursor: string | null };

function pageParams(query: URLSearchParams, { fallback = 50, max = 200 } = {}): { limit: number; cursor: string | null } {
  const limit = Number(query.get('limit') ?? fallback);
  if (!Number.isInteger(limit) || limit < 1 || limit > max) throw new CompanyError('invalid_field', `limit must be 1 to ${max}.`, 400, { field: 'limit' });
  const cursor = query.get('cursor');
  if (cursor !== null && !UUID.test(cursor)) throw new CompanyError('invalid_field', 'cursor is not valid.', 400, { field: 'cursor' });
  return { limit, cursor };
}

const page = <T extends { id: string }>(rows: T[], limit: number): Page<T> => ({ data: rows, next_cursor: rows.length === limit ? rows[rows.length - 1].id : null });

const PERSON_COLUMNS = 'id,email,full_name,role,department_id,job_role,status,seat,level,level_source,level_at,target_level,target_date,consent_at,invited_at,joined_at';
type PersonRow = Pick<MemberRow, 'id' | 'email' | 'full_name' | 'role' | 'department_id' | 'job_role' | 'status' | 'seat' | 'level' | 'level_source' | 'level_at' | 'target_level' | 'target_date' | 'consent_at' | 'joined_at'> & { invited_at?: string };
/** One shape everywhere. `shares_learning` tells a client why a learning field is empty. */
const person = (row: PersonRow) => ({
  id: row.id, email: row.email, full_name: row.full_name, role: row.role, department_id: row.department_id, job_role: row.job_role, status: row.status, seat: row.seat,
  level: row.level, level_source: row.level_source, level_at: row.level_at, level_note: row.level ? 'Schood estimate' : null,
  target_level: row.target_level, target_date: row.target_date, shares_learning: Boolean(row.consent_at), invited_at: row.invited_at ?? null, joined_at: row.joined_at,
});

const ATTEMPT_COLUMNS = 'id,assessment_id,member_id,candidate_name,candidate_email,candidate_phone,status,started_at,submitted_at,graded_at,overall_level,overall_score,skill_results,decision,certificate_code';
interface AttemptApiRow {
  id: string; assessment_id: string; member_id: string | null; candidate_name: string | null; candidate_email: string | null; candidate_phone: string | null; status: string; started_at: string;
  submitted_at: string | null; graded_at: string | null; overall_level: string | null; overall_score: number | null; skill_results: Record<string, { score?: number; level?: string }> | null; decision: string | null; certificate_code: string | null;
}
const skills = (results: AttemptApiRow['skill_results']) => Object.fromEntries(Object.entries(results ?? {}).map(([skill, value]) => [skill, { score: value?.score ?? null, level: value?.level ?? null }]));
const attemptBase = (row: AttemptApiRow) => ({
  id: row.id, test_id: row.assessment_id, status: row.status, started_at: row.started_at, submitted_at: row.submitted_at, graded_at: row.graded_at,
  overall_level: row.overall_level, overall_score: row.overall_score === null ? null : Number(row.overall_score), skills: skills(row.skill_results), certificate_code: row.certificate_code, level_note: row.overall_level ? 'Schood estimate' : null,
});

async function loadPerson(ctx: Ctx, id: string): Promise<MemberRow> {
  if (!UUID.test(id)) throw new CompanyError('member_not_found', 'Person not found.', 404);
  const row = check<MemberRow | null>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', ctx.org!.id).eq('id', id).maybeSingle());
  if (!row) throw new CompanyError('member_not_found', 'Person not found.', 404);
  return row;
}

/** Drops Schood English time from before the person agreed; the rest of a sharing person's learning counts. */
export function countable(rows: ActivityRow[], members: Pick<MemberRow, 'id' | 'consent_at' | 'joined_at'>[]): ActivityRow[] {
  const floor = new Map(members.filter((member) => member.consent_at).map((member) => [member.id, Math.max(Date.parse(member.joined_at ?? '') || 0, Date.parse(member.consent_at!) || 0)]));
  return rows.filter((row) => {
    const from = row.member_id ? floor.get(row.member_id) : undefined;
    if (from === undefined) return false;
    return row.kind !== 'english' || Date.parse(row.created_at) >= from;
  });
}

export const publicApiRoutes: Route[] = [
  {
    method: 'GET', path: 'api/v1/workspace', access: 'public',
    async handle(ctx) {
      const key = await authenticateKey(ctx, 'read');
      const org = ctx.org!;
      const departments = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id).order('name'));
      return { data: { id: org.id, name: org.name, status: org.status, contract_ends_at: org.contract_ends_at, seats_limit: org.seats_limit, tests_limit: org.tests_limit, tests_used: org.tests_used, departments }, key: { scope: key.scope, name: key.name } };
    },
  },
  {
    // ?status=active|invited|removed &department_id= &email= &limit= &cursor=
    method: 'GET', path: 'api/v1/people', access: 'public',
    async handle(ctx, _params, _body, query) {
      await authenticateKey(ctx, 'read');
      const { limit, cursor } = pageParams(query);
      let list = ctx.db.from('company_members').select(PERSON_COLUMNS).eq('org_id', ctx.org!.id);
      const status = query.get('status');
      if (status) list = list.eq('status', oneOf(status, ['active', 'invited', 'removed'] as const, 'status'));
      const department = query.get('department_id');
      if (department) {
        if (!UUID.test(department)) throw new CompanyError('invalid_field', 'department_id is not valid.', 400, { field: 'department_id' });
        list = list.eq('department_id', department);
      }
      const email = queryText(query, 'email', 200);
      if (email) list = list.ilike('email', likeEscape(email));
      if (cursor) list = list.gt('id', cursor);
      const rows = check<PersonRow[]>(await list.order('id').limit(limit));
      const { data, next_cursor } = page(rows, limit);
      return { data: data.map(person), next_cursor };
    },
  },
  {
    // One person. `learning` is null until they agree to share it.
    method: 'GET', path: 'api/v1/people/:id', access: 'public',
    async handle(ctx, params) {
      await authenticateKey(ctx, 'read');
      const member = await loadPerson(ctx, params.id);
      if (!member.consent_at) return { data: { ...person(member), learning: null } };
      const lessons = check<{ id: string }[]>(await ctx.db.from('company_lesson_progress').select('id').eq('member_id', member.id).eq('status', 'completed').limit(5000));
      const activity = await fetchAll<ActivityRow>(() => ctx.db.from('company_activity').select('member_id,kind,minutes,points,created_at').eq('org_id', ctx.org!.id).eq('member_id', member.id).order('id'), 20_000);
      const minutes = countable(activity, [member]).reduce((sum, row) => sum + (Number(row.minutes) || 0), 0);
      return { data: { ...person(member), learning: { lessons_completed: lessons.length, minutes } } };
    },
  },
  {
    // { full_name, email?, job_role?, department_id?, role? } → the person and their personal link, once.
    method: 'POST', path: 'api/v1/people', access: 'public',
    async handle(ctx, _params, body) {
      const key = await authenticateKey(ctx, 'write');
      const org = ctx.org!, input = obj(body);
      const full_name = text(input.full_name, 'full_name', { min: 2, max: 120 })!;
      const email = readEmail(input.email, 'email', true);
      const role = oneOf(input.role, ['employee', 'manager'] as const, 'role', 'employee');
      const job_role = oneOf<JobRole>(input.job_role, JOB_ROLES, 'job_role', 'general');
      let department_id: string | null = null;
      if (input.department_id !== undefined && input.department_id !== null) {
        if (typeof input.department_id !== 'string' || !UUID.test(input.department_id)) throw new CompanyError('invalid_field', 'department_id is not valid.', 400, { field: 'department_id' });
        const found = check<{ id: string } | null>(await ctx.db.from('company_departments').select('id').eq('org_id', org.id).eq('id', input.department_id).maybeSingle());
        if (!found) throw new CompanyError('invalid_field', 'department_id is not a department of this workspace.', 400, { field: 'department_id' });
        department_id = found.id;
      }
      if (email) {
        const taken = check<{ id: string }[]>(await ctx.db.from('company_members').select('id').eq('org_id', org.id).eq('email', email).neq('status', 'removed'));
        if (taken.length) throw new CompanyError('member_exists', 'Someone with this email is already in the workspace.', 409, { field: 'email', member_id: taken[0].id });
      }
      const member = checkUnique<MemberRow>(await ctx.db.from('company_members').insert({
        org_id: org.id, full_name, email, role, department_id, job_role, status: 'invited', seat: false, invited_at: ctx.now().toISOString(),
      }).select(MEMBER_COLUMNS).single(), memberExists);
      const { link } = await issueInvite(ctx, {
        org_id: org.id, member_id: member.id, kind: 'personal', role: inviteRoleFor(role), department_id, job_role, max_uses: 1, expires_at: new Date(ctx.now().getTime() + PERSONAL_DAYS * PEOPLE_DAY).toISOString(),
      });
      await ctx.audit('api.member_created', member.id, { api_key: key.id, name: full_name, email, role });
      return { data: person(member), invite_link: link };
    },
  },
  {
    // { send_email?: true } → a fresh personal link; the old one stops working. With
    // send_email the link goes by email instead, and only when email is switched on.
    method: 'POST', path: 'api/v1/people/:id/invite', access: 'public',
    async handle(ctx, params, body) {
      const key = await authenticateKey(ctx, 'write');
      const input = body === undefined ? {} : obj(body);
      const member = await loadPerson(ctx, params.id);
      if (member.status !== 'invited') throw new CompanyError('invite_closed', 'This person has already joined or was removed.', 409);
      if (member.role === 'owner' || member.role === 'admin') throw new CompanyError('owner_protected', 'People who run the workspace are invited from the app.', 403);
      if (input.send_email === true) {
        if (!await emailOpen(ctx)) throw new CompanyError('email_off', 'Invitation emails are not switched on for this workspace.', 409);
        const result = await emailInvite(ctx, member);
        return { data: { sent: result.status === 'sent', reason: result.reason ?? null } };
      }
      await revokeMemberInvites(ctx, member.id);
      const { link } = await issueInvite(ctx, {
        org_id: ctx.org!.id, member_id: member.id, kind: 'personal', role: inviteRoleFor(member.role), department_id: member.department_id, job_role: member.job_role,
        max_uses: 1, expires_at: new Date(ctx.now().getTime() + PERSONAL_DAYS * PEOPLE_DAY).toISOString(),
      });
      await ctx.audit('api.member_invited', member.id, { api_key: key.id });
      return { data: { invite_link: link } };
    },
  },
  {
    // ?kind=hiring|placement|progress. The link token is never part of this.
    method: 'GET', path: 'api/v1/tests', access: 'public',
    async handle(ctx, _params, _body, query) {
      await authenticateKey(ctx, 'read');
      const { limit, cursor } = pageParams(query);
      let list = ctx.db.from('company_assessments').select('id,kind,title,job_role,skills,min_level,time_limit_minutes,status,closes_at,created_at').eq('org_id', ctx.org!.id);
      const kind = query.get('kind');
      if (kind) list = list.eq('kind', oneOf(kind, ['hiring', 'placement', 'progress'] as const, 'kind'));
      if (cursor) list = list.gt('id', cursor);
      return page(check<{ id: string }[]>(await list.order('id').limit(limit)), limit);
    },
  },
  {
    // Results of one test; staff are named by id, candidates by the details they gave.
    method: 'GET', path: 'api/v1/tests/:id/results', access: 'public',
    async handle(ctx, params, _body, query) {
      await authenticateKey(ctx, 'read');
      if (!UUID.test(params.id)) throw new CompanyError('test_not_found', 'This test was not found.', 404);
      const test = check<{ id: string } | null>(await ctx.db.from('company_assessments').select('id').eq('org_id', ctx.org!.id).eq('id', params.id).maybeSingle());
      if (!test) throw new CompanyError('test_not_found', 'This test was not found.', 404);
      const { limit, cursor } = pageParams(query);
      let list = ctx.db.from('company_attempts').select(ATTEMPT_COLUMNS).eq('org_id', ctx.org!.id).eq('assessment_id', test.id);
      if (cursor) list = list.gt('id', cursor);
      const rows = check<AttemptApiRow[]>(await list.order('id').limit(limit));
      return {
        data: rows.map((row) => ({ ...attemptBase(row), member_id: row.member_id, candidate: row.member_id ? null : { name: row.candidate_name, email: row.candidate_email, phone: row.candidate_phone, decision: row.decision } })),
        next_cursor: rows.length === limit ? rows[rows.length - 1].id : null,
      };
    },
  },
  {
    // Candidates across hiring tests. ?test_id= &status= &decision=
    method: 'GET', path: 'api/v1/candidates', access: 'public',
    async handle(ctx, _params, _body, query) {
      await authenticateKey(ctx, 'read');
      const { limit, cursor } = pageParams(query);
      let list = ctx.db.from('company_attempts').select(ATTEMPT_COLUMNS).eq('org_id', ctx.org!.id).is('member_id', null);
      const test = query.get('test_id');
      if (test) {
        if (!UUID.test(test)) throw new CompanyError('invalid_field', 'test_id is not valid.', 400, { field: 'test_id' });
        list = list.eq('assessment_id', test);
      }
      const status = query.get('status');
      if (status) list = list.eq('status', oneOf(status, ['started', 'submitted', 'graded', 'expired'] as const, 'status'));
      const decision = query.get('decision');
      if (decision) list = list.eq('decision', oneOf(decision, ['shortlist', 'hold', 'reject'] as const, 'decision'));
      if (cursor) list = list.gt('id', cursor);
      const rows = check<AttemptApiRow[]>(await list.order('id').limit(limit));
      return {
        data: rows.map((row) => ({ ...attemptBase(row), name: row.candidate_name, email: row.candidate_email, phone: row.candidate_phone, decision: row.decision })),
        next_cursor: rows.length === limit ? rows[rows.length - 1].id : null,
      };
    },
  },
  {
    // How many people are at each level, overall and per department.
    method: 'GET', path: 'api/v1/levels', access: 'public',
    async handle(ctx) {
      await authenticateKey(ctx, 'read');
      const members = await fetchAll<{ id: string; level: string | null; department_id: string | null }>(() => ctx.db.from('company_members').select('id,level,department_id').eq('org_id', ctx.org!.id).eq('status', 'active').order('id'));
      const departments = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', ctx.org!.id).order('name'));
      const count = (rows: typeof members): LevelCounts => {
        const levels = emptyLevels();
        for (const row of rows) levels[isLevel(row.level) ? row.level : 'none']++;
        return levels;
      };
      return {
        data: {
          note: 'Levels are Schood estimates on the CEFR scale, not official certificates.', scale: LEVELS, total: members.length, levels: count(members),
          departments: departments.map((department) => {
            const rows = members.filter((member) => member.department_id === department.id);
            return { id: department.id, name: department.name, total: rows.length, levels: count(rows) };
          }),
        },
      };
    },
  },
  {
    // ?from=YYYY-MM-DD &to=YYYY-MM-DD (Tashkent days, at most 92). Only people who agreed to share count.
    method: 'GET', path: 'api/v1/activity/summary', access: 'public',
    async handle(ctx, _params, _body, query) {
      await authenticateKey(ctx, 'read');
      const range = parseRange(query, ctx.now(), 92);
      const members = await fetchAll<Pick<MemberRow, 'id' | 'consent_at' | 'joined_at'>>(() => ctx.db.from('company_members').select('id,consent_at,joined_at').eq('org_id', ctx.org!.id).eq('status', 'active').order('id'));
      const sharing = members.filter((member) => member.consent_at);
      const rows = await fetchAll<ActivityRow>(() => ctx.db.from('company_activity').select('member_id,kind,minutes,points,created_at')
        .eq('org_id', ctx.org!.id).gte('created_at', range.start.toISOString()).lt('created_at', range.end.toISOString()).order('id'), 100_000);
      const summary = summarize(countable(rows, sharing), new Set(sharing.map((member) => member.id)));
      return {
        data: {
          from: range.from, to: range.to, people_total: members.length, people_sharing: sharing.length,
          minutes: summary.members.reduce((sum, row) => sum + row.minutes, 0), lessons: summary.members.reduce((sum, row) => sum + row.lessons, 0), learners: summary.members.length,
          kinds: summary.kinds, weeks: summary.weeks,
          people: summary.members.map((row) => ({ member_id: row.member_id, minutes: row.minutes, lessons: row.lessons, active_days: row.days, last_at: row.last_at })),
        },
      };
    },
  },
];
