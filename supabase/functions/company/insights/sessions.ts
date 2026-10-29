// Live training sessions: HR schedules classes and workshops for everyone,
// departments or chosen people; members see theirs; HR marks attendance, and
// each attendance is logged as `session` activity for dashboards and challenges.
import { HR_ROLES, LEAD_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { logActivity } from '../core.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { int, obj, oneOf, text } from '../util.ts';
import { DAY, displayName, fetchAll, loadScope, viewerOf, type Viewer } from './common.ts';

export const SESSION_KINDS = ['class', 'workshop'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export interface SessionRow {
  id: string; org_id: string; title: string; kind: SessionKind; trainer: string | null; starts_at: string; duration_minutes: number;
  location: string | null; link: string | null; department_ids: string[]; member_ids: string[]; notes: string | null;
  status: 'scheduled' | 'cancelled'; created_by: string | null; created_at: string; updated_at: string;
}
const COLUMNS = 'id,org_id,title,kind,trainer,starts_at,duration_minutes,location,link,department_ids,member_ids,notes,status,created_by,created_at,updated_at';
const SESSION_POINTS_MAX = 100;

const everyone = (session: Pick<SessionRow, 'department_ids' | 'member_ids'>) => !session.department_ids?.length && !session.member_ids?.length;

/** Whether a member is expected at the session. */
export function isInvitee(session: Pick<SessionRow, 'department_ids' | 'member_ids'>, member: Pick<MemberRow, 'id' | 'department_id'>): boolean {
  return everyone(session) || (member.department_id !== null && (session.department_ids ?? []).includes(member.department_id)) || (session.member_ids ?? []).includes(member.id);
}

/** Whether the viewer sees the session: HR all; a manager those for their department or its people; others their own. */
export function invited(session: Pick<SessionRow, 'department_ids' | 'member_ids'>, viewer: Viewer, member: Pick<MemberRow, 'id' | 'department_id'> | null, departmentPeople?: Set<string>): boolean {
  if (viewer.hr || everyone(session)) return true;
  if (member && isInvitee(session, member)) return true;
  if (viewer.manager && viewer.departmentId) {
    if ((session.department_ids ?? []).includes(viewer.departmentId)) return true;
    if (departmentPeople && (session.member_ids ?? []).some((id) => departmentPeople.has(id))) return true;
  }
  return false;
}

const endsAt = (session: Pick<SessionRow, 'starts_at' | 'duration_minutes'>) => Date.parse(session.starts_at) + session.duration_minutes * 60_000;

function idList(value: unknown, field: string, max: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max || value.some((id) => typeof id !== 'string' || !UUID.test(id))) {
    throw new CompanyError('invalid_field', `${field} must be a list of ids.`, 400, { field });
  }
  return [...new Set(value as string[])];
}

async function audience(ctx: Ctx, input: Record<string, unknown>, current: SessionRow | null) {
  const departmentIds = input.department_ids === undefined && current ? current.department_ids : idList(input.department_ids, 'department_ids', 100);
  const memberIds = input.member_ids === undefined && current ? current.member_ids : idList(input.member_ids, 'member_ids', 500);
  if (departmentIds.length && (input.department_ids !== undefined)) {
    const found = check<{ id: string }[]>(await ctx.db.from('company_departments').select('id').eq('org_id', ctx.org!.id).in('id', departmentIds));
    if (found.length !== departmentIds.length) throw new CompanyError('invalid_field', 'Choose departments of this workspace.', 400, { field: 'department_ids' });
  }
  if (memberIds.length && (input.member_ids !== undefined)) {
    const found = check<{ id: string }[]>(await ctx.db.from('company_members').select('id').eq('org_id', ctx.org!.id).neq('status', 'removed').in('id', memberIds));
    if (found.length !== memberIds.length) throw new CompanyError('invalid_field', 'Choose people of this workspace.', 400, { field: 'member_ids' });
  }
  return { department_ids: departmentIds, member_ids: memberIds };
}

function link(value: unknown): string | null {
  const raw = text(value, 'link', { max: 500, optional: true });
  if (raw === null) return null;
  let url: URL;
  try { url = new URL(raw); } catch { throw new CompanyError('invalid_field', 'link must be a web address.', 400, { field: 'link' }); }
  if (url.protocol !== 'https:') throw new CompanyError('invalid_field', 'link must start with https://', 400, { field: 'link' });
  return url.toString();
}

function startsAt(value: unknown, now: Date): string {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new CompanyError('invalid_field', 'starts_at must be a date and time.', 400, { field: 'starts_at' });
  if (parsed < now.getTime() - 60 * DAY || parsed > now.getTime() + 366 * DAY) throw new CompanyError('invalid_field', 'starts_at must be within the last 60 days or the next year.', 400, { field: 'starts_at' });
  return new Date(parsed).toISOString();
}

async function load(ctx: Ctx, id: string): Promise<SessionRow> {
  if (!UUID.test(id)) throw new CompanyError('session_not_found', 'Session not found.', 404);
  const row = check<SessionRow | null>(await ctx.db.from('company_sessions').select(COLUMNS).eq('org_id', ctx.org!.id).eq('id', id).maybeSingle());
  if (!row) throw new CompanyError('session_not_found', 'Session not found.', 404);
  return { ...row, department_ids: row.department_ids ?? [], member_ids: row.member_ids ?? [] };
}

const activityRef = (sessionId: string) => `session:${sessionId}`;

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/sessions', access: 'org', allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const when = oneOf(query.get('when') ?? 'upcoming', ['upcoming', 'past'] as const, 'when');
      const viewer = viewerOf(ctx), now = ctx.now(), org = ctx.org!;
      let request = ctx.db.from('company_sessions').select(COLUMNS).eq('org_id', org.id);
      request = when === 'upcoming'
        ? request.gte('starts_at', new Date(now.getTime() - 8 * 3_600_000).toISOString()).order('starts_at', { ascending: true })
        : request.gte('starts_at', new Date(now.getTime() - 180 * DAY).toISOString()).lt('starts_at', now.toISOString()).order('starts_at', { ascending: false });
      const rows = check<SessionRow[]>(await request.limit(300)).map((row) => ({ ...row, department_ids: row.department_ids ?? [], member_ids: row.member_ids ?? [] }));
      const scope = viewer.lead ? await loadScope(ctx) : null;
      const people = scope ? scope.members.filter((member) => member.status === 'active') : [];
      const departmentPeople = new Set(people.map((member) => member.id));
      const sessions = rows
        .filter((row) => (when === 'upcoming' ? endsAt(row) > now.getTime() : endsAt(row) <= now.getTime()))
        .filter((row) => invited(row, viewer, ctx.member, departmentPeople));
      const ids = sessions.map((row) => row.id);
      const attendance = ids.length ? await fetchAll<{ session_id: string; member_id: string }>(() => ctx.db.from('company_session_attendance').select('session_id,member_id').eq('org_id', org.id).in('session_id', ids).order('session_id').order('member_id'), 20_000) : [];
      const departments = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id).order('name'));
      return {
        when,
        can_manage: viewer.hr,
        departments: viewer.hr ? departments : departments.filter((entry) => sessions.some((row) => row.department_ids.includes(entry.id))),
        sessions: sessions.map((row) => {
          const present = attendance.filter((entry) => entry.session_id === row.id);
          const mine = viewer.memberId ? present.some((entry) => entry.member_id === viewer.memberId) : false;
          const counts = viewer.lead ? {
            invited: people.filter((member) => isInvitee(row, member)).length,
            present: present.filter((entry) => departmentPeople.has(entry.member_id)).length,
          } : null;
          return {
            ...row,
            // People lists stay with HR; others learn only whether they are invited.
            member_ids: viewer.hr ? row.member_ids : [],
            for_me: ctx.member ? isInvitee(row, ctx.member) : false,
            attended: when === 'past' ? mine : null,
            counts,
            in_progress: Date.parse(row.starts_at) <= now.getTime() && endsAt(row) > now.getTime(),
          };
        }),
      };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/sessions', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const row = check<SessionRow>(await ctx.db.from('company_sessions').insert({
        org_id: ctx.org!.id,
        title: text(input.title, 'title', { min: 2, max: 160 }),
        kind: oneOf<SessionKind>(input.kind, SESSION_KINDS, 'kind', 'class'),
        trainer: text(input.trainer, 'trainer', { max: 120, optional: true }),
        starts_at: startsAt(input.starts_at, ctx.now()),
        duration_minutes: int(input.duration_minutes ?? 60, 'duration_minutes', { min: 10, max: 480 }),
        location: text(input.location, 'location', { max: 200, optional: true }),
        link: link(input.link),
        notes: text(input.notes, 'notes', { max: 1000, optional: true }),
        ...(await audience(ctx, input, null)),
        status: 'scheduled',
        created_by: ctx.user,
      }).select(COLUMNS).single());
      await ctx.audit('session.created', row.id, { title: row.title, starts_at: row.starts_at });
      return { session: row };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/sessions/:session', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const input = obj(body);
      const current = await load(ctx, params.session);
      if (current.status === 'cancelled') throw new CompanyError('session_cancelled', 'This session was cancelled.', 409);
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = text(input.title, 'title', { min: 2, max: 160 });
      if (input.kind !== undefined) patch.kind = oneOf<SessionKind>(input.kind, SESSION_KINDS, 'kind');
      if (input.trainer !== undefined) patch.trainer = text(input.trainer, 'trainer', { max: 120, optional: true });
      if (input.starts_at !== undefined) patch.starts_at = startsAt(input.starts_at, ctx.now());
      if (input.duration_minutes !== undefined) patch.duration_minutes = int(input.duration_minutes, 'duration_minutes', { min: 10, max: 480 });
      if (input.location !== undefined) patch.location = text(input.location, 'location', { max: 200, optional: true });
      if (input.link !== undefined) patch.link = link(input.link);
      if (input.notes !== undefined) patch.notes = text(input.notes, 'notes', { max: 1000, optional: true });
      if (input.department_ids !== undefined || input.member_ids !== undefined) Object.assign(patch, await audience(ctx, input, current));
      if (!Object.keys(patch).length) return { session: current };
      const row = check<SessionRow>(await ctx.db.from('company_sessions').update(patch).eq('id', current.id).eq('org_id', ctx.org!.id).select(COLUMNS).single());
      await ctx.audit('session.updated', row.id, { fields: Object.keys(patch) });
      return { session: row };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/sessions/:session/cancel', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const current = await load(ctx, params.session);
      if (current.status === 'cancelled') return { session: current };
      const marked = check<{ member_id: string }[]>(await ctx.db.from('company_session_attendance').select('member_id').eq('session_id', current.id).limit(1));
      if (marked.length) throw new CompanyError('session_has_attendance', 'Attendance is already marked for this session.', 409);
      const row = check<SessionRow>(await ctx.db.from('company_sessions').update({ status: 'cancelled' }).eq('id', current.id).eq('org_id', ctx.org!.id).select(COLUMNS).single());
      await ctx.audit('session.cancelled', row.id, { title: row.title });
      return { session: row };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/sessions/:session/attendance', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, params) {
      const session = await load(ctx, params.session);
      const { viewer, members, departments } = await loadScope(ctx);
      const people = members.filter((member) => member.status === 'active');
      if (!invited(session, viewer, ctx.member, new Set(people.map((member) => member.id)))) throw new CompanyError('session_not_found', 'Session not found.', 404);
      const present = new Set(check<{ member_id: string }[]>(await ctx.db.from('company_session_attendance').select('member_id').eq('session_id', session.id)).map((row) => row.member_id));
      const names = new Map(departments.map((entry) => [entry.id, entry.name]));
      const rows = people.filter((member) => isInvitee(session, member) || present.has(member.id))
        .map((member) => ({ member_id: member.id, name: displayName(member), department: member.department_id ? names.get(member.department_id) ?? null : null, invited: isInvitee(session, member), present: present.has(member.id) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        session,
        started: Date.parse(session.starts_at) <= ctx.now().getTime(),
        can_mark: viewer.hr && session.status === 'scheduled' && Date.parse(session.starts_at) <= ctx.now().getTime(),
        people: rows,
        // HR may also mark someone who was not on the list.
        others: viewer.hr ? people.filter((member) => !isInvitee(session, member) && !present.has(member.id)).map((member) => ({ member_id: member.id, name: displayName(member) })).sort((a, b) => a.name.localeCompare(b.name)) : [],
      };
    },
  },
  {
    method: 'PUT', path: 'orgs/:org/sessions/:session/attendance', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const input = obj(body);
      const session = await load(ctx, params.session), org = ctx.org!;
      if (session.status === 'cancelled') throw new CompanyError('session_cancelled', 'This session was cancelled.', 409);
      if (Date.parse(session.starts_at) > ctx.now().getTime()) throw new CompanyError('session_not_started', 'Attendance can be marked once the session has started.', 409);
      const wanted = idList(input.present, 'present', 2000);
      const people = wanted.length ? await fetchAll<MemberRow>(() => ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('status', 'active').in('id', wanted).order('id'), 5000) : [];
      if (people.length !== wanted.length) throw new CompanyError('invalid_field', 'Choose active people of this workspace.', 400, { field: 'present' });
      const existing = new Set(check<{ member_id: string }[]>(await ctx.db.from('company_session_attendance').select('member_id').eq('session_id', session.id)).map((row) => row.member_id));
      const wantedSet = new Set(wanted);
      const added = people.filter((member) => !existing.has(member.id));
      const removed = [...existing].filter((id) => !wantedSet.has(id));
      const markedAt = ctx.now().toISOString();
      if (added.length) {
        check(await ctx.db.from('company_session_attendance').upsert(added.map((member) => ({
          session_id: session.id, org_id: org.id, member_id: member.id, user_id: member.user_id, marked_by: ctx.user, marked_at: markedAt,
        })), { onConflict: 'session_id,member_id', ignoreDuplicates: true }));
        for (const member of added) {
          await logActivity(ctx.db, { org_id: org.id, member_id: member.id, user_id: member.user_id, kind: 'session', minutes: session.duration_minutes, points: Math.min(SESSION_POINTS_MAX, session.duration_minutes), ref: activityRef(session.id) });
        }
      }
      if (removed.length) {
        check(await ctx.db.from('company_session_attendance').delete().eq('session_id', session.id).in('member_id', removed));
        // Take back the activity the attendance gave, so challenges stay fair.
        check(await ctx.db.from('company_activity').delete().eq('org_id', org.id).eq('kind', 'session').eq('ref', activityRef(session.id)).in('member_id', removed));
      }
      if (added.length || removed.length) await ctx.audit('session.attendance', session.id, { added: added.length, removed: removed.length });
      return { present: wanted.length, added: added.length, removed: removed.length };
    },
  },
];
