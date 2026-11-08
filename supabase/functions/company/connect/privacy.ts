// Privacy tools for HR: one person's data as a file, deleting their learning data, a
// plain summary of what is kept and why, and the workspace audit log.
// What HR may export follows the consent rule: membership and company tests always,
// learning only for people who agreed. The text of role-plays and writing drafts stays
// out of an HR export; a person's own export includes it. Private AI-tutor chats in
// Schood English are not in these tables and are never read.
import { csv, fetchAll } from '../insights/common.ts';
import { withoutMember, type ChallengeRow } from '../insights/challenges.ts';
import { loadMember } from '../people/shared.ts';
import { check, CompanyError, type Ctx, type MemberRow, type Route } from '../types.ts';
import { isCalendarDate, obj } from '../util.ts';
import { countable } from './api.ts';
import { HR, likeEscape, paging, queryText } from './shared.ts';

/** Tables of a person's learning, deleted by "erase learning". Test results are the company's and stay. */
export const LEARNING_TABLES = [
  'company_lesson_progress', 'company_roleplay_sessions', 'company_writing_checks', 'company_session_attendance',
  'company_writing_snippets', 'company_training_certificates', 'company_risk_actions',
  'company_coach_settings', 'company_coach_cards', 'company_coach_log', 'company_coach_plans',
] as const;
/** Private to the learner: in their own copy, never in a company export. */
const OWN_ONLY_TABLES = ['company_writing_snippets', 'company_coach_settings', 'company_coach_cards', 'company_coach_log', 'company_coach_plans', 'company_connect_prefs', 'company_notices'] as const;

/** A table another release has not added yet is not a reason to fail. */
const missingTable = (code: string | undefined) => code === '42P01' || code === 'PGRST205';

async function rowsOf<T>(ctx: Ctx, table: string, columns: string, memberId: string, orderKey = 'id'): Promise<T[]> {
  try {
    return await fetchAll<T>(() => ctx.db.from(table).select(columns).eq('org_id', ctx.org!.id).eq('member_id', memberId).order('created_at', { ascending: false }).order(orderKey), 20_000);
  } catch (cause) {
    if (String(cause).includes('42P01') || String(cause).includes('PGRST205')) return [];
    throw cause;
  }
}

/** Everything held about one person in this workspace. `self` adds what only they may read. */
export async function exportPerson(ctx: Ctx, member: MemberRow, self: boolean) {
  const orgId = ctx.org!.id;
  const attempts = await fetchAll<Record<string, unknown>>(() => ctx.db.from('company_attempts')
    .select('id,assessment_id,status,started_at,submitted_at,graded_at,overall_level,overall_score,skill_results,certificate_code').eq('org_id', orgId).eq('member_id', member.id).order('id'), 2000);
  const { user_id: _user, ...profile } = member;
  const base = {
    exported_at: ctx.now().toISOString(),
    workspace: { id: orgId, name: ctx.org!.name },
    profile,
    company_tests: attempts,
    level_note: 'Levels are Schood estimates on the CEFR scale, not official certificates.',
  };
  if (!self && !member.consent_at) {
    return { ...base, learning: null, learning_note: 'This person has not agreed to share their learning with the company, so it is not part of this export.' };
  }
  const lessons = await fetchAll<Record<string, unknown>>(() => ctx.db.from('company_lesson_progress').select('track_code,lesson_code,status,score,minutes,attempts,completed_at').eq('org_id', orgId).eq('member_id', member.id).order('lesson_code'), 5000);
  const activityRows = await fetchAll<{ member_id: string | null; kind: string; minutes: number; points: number; created_at: string; ref: string | null }>(() =>
    ctx.db.from('company_activity').select('member_id,kind,minutes,points,ref,created_at').eq('org_id', orgId).eq('member_id', member.id).order('id'), 20_000);
  const activity = self ? activityRows : countable(activityRows, [member]) as typeof activityRows;
  const roleplays = await rowsOf<Record<string, unknown>>(ctx, 'company_roleplay_sessions', self ? 'scenario_code,track_code,status,score,minutes,turns,feedback,member_id,created_at,ended_at' : 'scenario_code,track_code,status,score,minutes,member_id,created_at,ended_at', member.id);
  const writing = await rowsOf<Record<string, unknown>>(ctx, 'company_writing_checks', self ? 'template_code,draft,result,score,locale,member_id,created_at' : 'template_code,score,locale,member_id,created_at', member.id);
  const assignments = check<Record<string, unknown>[]>(await ctx.db.from('company_assignments').select('track_code,target_level,due_date,status,created_at').eq('org_id', orgId).eq('member_id', member.id).limit(500));
  const attendance = await fetchAll<Record<string, unknown>>(() => ctx.db.from('company_session_attendance').select('session_id,marked_at').eq('org_id', orgId).eq('member_id', member.id).order('session_id'), 2000);
  const own: Record<string, unknown[]> = {};
  if (self) {
    for (const table of OWN_ONLY_TABLES) {
      const orderKey = table === 'company_coach_plans' ? 'day' : table === 'company_coach_settings' || table === 'company_connect_prefs' ? 'member_id' : 'id';
      own[table.replace('company_', '')] = (await rowsOf<Record<string, unknown>>(ctx, table, '*', member.id, orderKey)).map(({ user_id: _user, org_id: _org, member_id: _member, ...row }) => row);
    }
    const feed = new Map<string, Record<string, unknown>>();
    try {
      for (const column of ['from_member', 'to_member']) {
        const rows = await fetchAll<Record<string, unknown>>(() => ctx.db.from('company_coach_kudos').select('id,from_member,to_member,kind,message,note,badge,day,created_at').eq('org_id', orgId).eq(column, member.id).order('created_at').order('id'), 20_000);
        for (const row of rows) feed.set(String(row.id), row);
      }
    } catch (cause) {
      if (!String(cause).includes('42P01') && !String(cause).includes('PGRST205')) throw cause;
    }
    own.coach_kudos = [...feed.values()];
  }
  const certificates = await rowsOf<Record<string, unknown>>(ctx, 'company_training_certificates', 'kind,ref_code,member_id,created_at', member.id);
  return {
    ...base,
    learning: {
      lessons, assignments, attendance, roleplays, writing_checks: writing, certificates,
      activity: activity.map(({ member_id: _id, ...row }) => row),
      ...own,
    },
    learning_note: self ? null : 'The text of role-plays and writing drafts is left out of a company export. Private AI-tutor chats are never available to the company.',
  };
}

/** The audit query, the same for the page and the file. Filters match literally. */
function auditQuery(ctx: Ctx, query: URLSearchParams) {
  let list = ctx.db.from('company_audit').select('id,actor,action,target,details,created_at').eq('org_id', ctx.org!.id);
  const action = queryText(query, 'action', 60);
  if (action) list = list.ilike('action', `${likeEscape(action)}%`);
  const actor = queryText(query, 'actor', 36);
  if (actor) {
    if (!/^[0-9a-f-]{36}$/i.test(actor)) throw new CompanyError('invalid_field', 'actor is not valid.', 400, { field: 'actor' });
    list = list.eq('actor', actor);
  }
  const target = queryText(query, 'target', 120);
  if (target) list = list.eq('target', target);
  for (const [name, method, shift] of [['from', 'gte', 0], ['to', 'lt', 1]] as const) {
    const day = query.get(name);
    if (!day) continue;
    if (!isCalendarDate(day)) throw new CompanyError('invalid_field', `${name} must be a date.`, 400, { field: name });
    const bound = new Date(Date.parse(`${day}T00:00:00Z`) - 5 * 3_600_000 + shift * 86_400_000).toISOString();
    list = list[method]('created_at', bound);
  }
  return list.order('created_at', { ascending: false }).order('id', { ascending: false });
}

async function actorNames(ctx: Ctx): Promise<Map<string, string>> {
  const members = await fetchAll<{ user_id: string | null; full_name: string | null; email: string | null }>(() => ctx.db.from('company_members').select('user_id,full_name,email').eq('org_id', ctx.org!.id).not('user_id', 'is', null).order('id'));
  return new Map(members.map((member) => [member.user_id!, member.full_name || member.email || '—']));
}

export const privacyRoutes: Route[] = [
  {
    // A plain summary, not a legal document: what the workspace holds right now and the rules the code follows.
    method: 'GET', path: 'orgs/:org/connect/privacy/summary', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx) {
      const orgId = ctx.org!.id;
      const members = await fetchAll<{ id: string; status: string; consent_at: string | null }>(() => ctx.db.from('company_members').select('id,status,consent_at').eq('org_id', orgId).order('id'));
      const active = members.filter((member) => member.status === 'active');
      const count = async (table: string, build: (query: { eq: (c: string, v: unknown) => unknown }) => unknown = (query) => query) => {
        const { count: total, error } = await (build(ctx.db.from(table).select('id', { count: 'exact', head: true }).eq('org_id', orgId)) as PromiseLike<{ count: number | null; error: { code?: string; message: string } | null }>);
        if (error) { if (missingTable(error.code)) return 0; throw new Error(error.message); }
        return total ?? 0;
      };
      const attempts = await fetchAll<{ id: string; member_id: string | null }>(() => ctx.db.from('company_attempts').select('id,member_id').eq('org_id', orgId).order('id'), 50_000);
      return {
        counts: {
          people_active: active.length, people_invited: members.filter((member) => member.status === 'invited').length, people_removed: members.filter((member) => member.status === 'removed').length,
          sharing: active.filter((member) => member.consent_at).length, not_sharing: active.filter((member) => !member.consent_at).length,
          candidate_attempts: attempts.filter((attempt) => !attempt.member_id).length, staff_attempts: attempts.filter((attempt) => attempt.member_id).length,
          roleplays: await count('company_roleplay_sessions'), writing_checks: await count('company_writing_checks'),
        },
      };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/connect/privacy/people', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const search = queryText(query, 'q', 120);
      let list = ctx.db.from('company_members').select('id,full_name,email,status,consent_at').eq('org_id', ctx.org!.id).neq('status', 'removed');
      if (search) list = list.ilike(search.includes('@') ? 'email' : 'full_name', `%${likeEscape(search)}%`);
      return { people: check<Record<string, unknown>[]>(await list.order('full_name').limit(30)) };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/connect/privacy/people/:member/export', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      const member = await loadMember(ctx, ctx.org!.id, params.member);
      await ctx.audit('privacy.exported', member.id, { consent: Boolean(member.consent_at) });
      return await exportPerson(ctx, member, false);
    },
  },
  {
    // A person's own copy, which is theirs whether or not they share it with the company.
    method: 'GET', path: 'orgs/:org/connect/privacy/me/export', access: 'org', allowSuspended: true,
    async handle(ctx) {
      if (!ctx.member) throw new CompanyError('not_member', 'Only members of this workspace have this.', 403);
      await ctx.audit('privacy.exported_own', ctx.member.id);
      return await exportPerson(ctx, ctx.member, true);
    },
  },
  {
    // { confirm: 'ERASE' }. Lessons, practice and time go; membership and company test results stay.
    // Works after an agreement ends: that is when people ask. Repeating it finds nothing more to delete.
    method: 'POST', path: 'orgs/:org/connect/privacy/people/:member/erase-learning', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params, body) {
      const input = obj(body);
      if (input.confirm !== 'ERASE') throw new CompanyError('confirm_required', 'Type ERASE to confirm.', 400, { field: 'confirm' });
      const member = await loadMember(ctx, ctx.org!.id, params.member);
      const counts: Record<string, number> = {};
      for (const table of LEARNING_TABLES) {
        const { data, error } = await ctx.db.from(table).delete().eq('org_id', ctx.org!.id).eq('member_id', member.id).select('member_id');
        if (error) {
          if (missingTable(error.code)) { counts[table] = 0; continue; }
          throw new Error(`${error.code ?? 'db'}: ${error.message}`);
        }
        counts[table] = (data as unknown[] | null)?.length ?? 0;
      }
      const { data, error } = await ctx.db.from('company_activity').delete().eq('org_id', ctx.org!.id).eq('member_id', member.id).neq('kind', 'test').select('member_id');
      if (error) throw new Error(`${error.code ?? 'db'}: ${error.message}`);
      counts.company_activity = (data as unknown[] | null)?.length ?? 0;
      // Shared badges are learning evidence too. Leaving them behind would make
      // them reappear if this person chose to join the feed again after erasure.
      counts.company_coach_kudos = 0;
      for (const column of ['from_member', 'to_member']) {
        const result = await ctx.db.from('company_coach_kudos').delete().eq('org_id', ctx.org!.id).eq(column, member.id).select('id');
        if (result.error && !missingTable(result.error.code)) throw new Error(`${result.error.code ?? 'db'}: ${result.error.message}`);
        counts.company_coach_kudos += (result.data as unknown[] | null)?.length ?? 0;
      }
      // Finished challenges keep a frozen copy of everyone's numbers, which never recomputes:
      // take this person's out of it, or their name and score would stay on the winners page.
      counts.company_challenges = 0;
      const frozen = check<Pick<ChallengeRow, 'id' | 'teams' | 'final_results'>[]>(await ctx.db.from('company_challenges').select('id,teams,final_results').eq('org_id', ctx.org!.id).not('final_results', 'is', null));
      for (const challenge of frozen) {
        const final = challenge.final_results && withoutMember(challenge.final_results, member, challenge.teams ?? []);
        if (!final) continue;
        check(await ctx.db.from('company_challenges').update({ final_results: final }).eq('id', challenge.id).eq('org_id', ctx.org!.id));
        counts.company_challenges++;
      }
      await ctx.audit('privacy.learning_erased', member.id, { counts });
      return { erased: counts };
    },
  },
  {
    // ?action=member. &actor= &target= &from= &to= (Tashkent days) &limit= &offset=
    method: 'GET', path: 'orgs/:org/connect/audit', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const { limit, offset } = paging(query);
      const names = await actorNames(ctx);
      const rows = check<{ id: number; actor: string | null; action: string; target: string | null; details: Record<string, unknown>; created_at: string }[]>(await auditQuery(ctx, query).range(offset, offset + limit - 1));
      return {
        entries: rows.map((row) => ({ ...row, actor_name: row.actor ? names.get(row.actor) ?? null : null })),
        next_offset: rows.length === limit ? offset + limit : null,
        actors: [...names.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 300),
      };
    },
  },
  {
    // The same filters as a spreadsheet-safe CSV, up to 5,000 rows.
    method: 'GET', path: 'orgs/:org/connect/audit/export', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const names = await actorNames(ctx);
      const rows = await fetchAll<{ actor: string | null; action: string; target: string | null; details: unknown; created_at: string }>(() => auditQuery(ctx, query), 5000);
      return { csv: csv(['when', 'who', 'action', 'target', 'details'], rows.map((row) => [row.created_at, row.actor ? names.get(row.actor) ?? row.actor : '', row.action, row.target ?? '', JSON.stringify(row.details ?? {})])), rows: rows.length };
    },
  },
];
