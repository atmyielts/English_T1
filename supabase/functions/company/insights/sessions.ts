// Live training sessions: HR schedules classes and workshops for everyone,
// departments or chosen people; members see theirs; HR marks attendance, and
// each attendance is logged as `session` activity for dashboards and challenges.
// Classes can repeat as a series, leads keep trainer notes, and attendance rates
// per person count only those who share their progress.
import { HR_ROLES, LEAD_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { logActivity } from '../core.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { inChunks, int, obj, oneOf, text } from '../util.ts';
import { csv, DAY, displayName, fetchAll, isLearner, loadScope, localDate, addDays, parseRange, viewerOf, type Viewer } from './common.ts';

export const SESSION_KINDS = ['class', 'workshop'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export interface SessionRow {
  id: string; org_id: string; title: string; kind: SessionKind; trainer: string | null; starts_at: string; duration_minutes: number;
  location: string | null; link: string | null; department_ids: string[]; member_ids: string[]; notes: string | null;
  status: 'scheduled' | 'cancelled'; created_by: string | null; created_at: string; updated_at: string; series_id?: string | null; trainer_notes?: string | null;
}
const COLUMNS = 'id,org_id,title,kind,trainer,starts_at,duration_minutes,location,link,department_ids,member_ids,notes,status,created_by,created_at,updated_at,series_id,trainer_notes';
const MAX_SERIES = 26;
const REPEATS = { weekly: 7, biweekly: 14 } as const;
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
    // Compared here: a list of up to 500 ids does not fit in a GET filter.
    const found = await fetchAll<{ id: string }>(() => ctx.db.from('company_members').select('id').eq('org_id', ctx.org!.id).neq('status', 'removed').order('id'));
    const known = new Set(found.map((row) => row.id));
    if (memberIds.some((id) => !known.has(id))) throw new CompanyError('invalid_field', 'Choose people of this workspace.', 400, { field: 'member_ids' });
  }
  return { department_ids: departmentIds, member_ids: memberIds };
}

function link(value: unknown): string | null {
  const raw = text(value, 'link', { max: 500, optional: true });
  if (raw === null) return null;
  let url: URL;
  try { url = new URL(raw); } catch { throw new CompanyError('invalid_field', 'link must be a web address.', 400, { field: 'link' }); }
  if (url.protocol !== 'https:') throw new CompanyError('invalid_field', 'link must start with https://', 400, { field: 'link' });
  // Encoding can lengthen it past what the column holds.
  const normal = url.toString();
  if (normal.length > 500) throw new CompanyError('invalid_field', 'link is too long.', 400, { field: 'link' });
  return normal;
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

/** Everyone marked present. A town hall can pass one page of rows. */
const presentAt = (ctx: Ctx, sessionId: string) => fetchAll<{ member_id: string }>(() => ctx.db.from('company_session_attendance').select('member_id').eq('session_id', sessionId).order('member_id'));

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
      const attendance = await inChunks(ids, (chunk) => fetchAll<{ session_id: string; member_id: string }>(() => ctx.db.from('company_session_attendance').select('session_id,member_id').eq('org_id', org.id).in('session_id', chunk).order('session_id').order('member_id'), 20_000));
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
            // The trainer's notes are for those running the training.
            trainer_notes: viewer.lead ? row.trainer_notes ?? null : null,
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
    // Attendance per person over a period, in the viewer's scope. Attendance is learning detail, so only people who share their progress are listed.
    method: 'GET', path: 'orgs/:org/sessions/attendance-rates', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const now = ctx.now(), today = localDate(now);
      const params = new URLSearchParams(query);
      if (!params.get('from')) params.set('from', addDays(today, -89));
      const range = parseRange(params, now, 366);
      const format = oneOf(query.get('format') ?? 'json', ['json', 'csv'] as const, 'format');
      const { members, departments } = await loadScope(ctx);
      const learners = members.filter(isLearner);
      const sharing = learners.filter((member) => member.consent_at);
      const end = new Date(Math.min(range.end.getTime(), now.getTime()));
      const sessions = (await fetchAll<SessionRow>(() => ctx.db.from('company_sessions').select(COLUMNS).eq('org_id', ctx.org!.id).eq('status', 'scheduled').gte('starts_at', range.start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at').order('id'), 5000))
        .map((row) => ({ ...row, department_ids: row.department_ids ?? [], member_ids: row.member_ids ?? [] }));
      const attendance = await inChunks(sessions.map((row) => row.id), (chunk) => fetchAll<{ session_id: string; member_id: string }>(() => ctx.db.from('company_session_attendance').select('session_id,member_id').eq('org_id', ctx.org!.id).in('session_id', chunk).order('session_id').order('member_id'), 50_000));
      const present = new Set(attendance.map((row) => `${row.session_id}:${row.member_id}`));
      const names = new Map(departments.map((entry) => [entry.id, entry.name]));
      const people = sharing.map((member) => {
        const invitedTo = sessions.filter((session) => isInvitee(session, member));
        const attended = invitedTo.filter((session) => present.has(`${session.id}:${member.id}`)).length;
        const extra = sessions.filter((session) => !isInvitee(session, member) && present.has(`${session.id}:${member.id}`)).length;
        return { member_id: member.id, name: displayName(member), department_id: member.department_id, department: member.department_id ? names.get(member.department_id) ?? null : null, invited: invitedTo.length, attended, extra, rate: invitedTo.length ? Math.round(attended / invitedTo.length * 100) : null };
      }).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.name.localeCompare(b.name));
      if (format === 'csv') {
        await ctx.audit('session.rates_exported', null, { from: range.from, to: range.to, rows: people.length });
        return { filename: `schood-company-attendance-${range.from}-${range.to}.csv`, rows: people.length, csv: csv(['name', 'department', 'invited', 'attended', 'attended_not_invited', 'rate_percent'], people.map((row) => [row.name, row.department ?? '', row.invited, row.attended, row.extra, row.rate ?? ''])) };
      }
      const groups: { id: string | null; name: string | null }[] = departments.map((entry) => ({ id: entry.id, name: entry.name }));
      if (people.some((row) => !row.department_id)) groups.push({ id: null, name: null });
      const add = (rows: typeof people) => {
        const invited = rows.reduce((sum, row) => sum + row.invited, 0), attended = rows.reduce((sum, row) => sum + row.attended, 0);
        return { people: rows.length, invited, attended, rate: invited ? Math.round(attended / invited * 100) : null };
      };
      return {
        range: { from: range.from, to: range.to, days: range.days },
        sessions: sessions.length,
        hidden: learners.length - sharing.length,
        total: add(people),
        departments: groups.map((group) => ({ id: group.id, name: group.name, ...add(people.filter((row) => row.department_id === group.id)) })).filter((row) => row.people > 0),
        people,
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
    // A class that repeats: one row per date, tied by series_id, so each has its own attendance.
    method: 'POST', path: 'orgs/:org/sessions/series', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body), now = ctx.now(), org = ctx.org!;
      const repeat = oneOf(input.repeat, ['weekly', 'biweekly'] as const, 'repeat');
      const count = int(input.count, 'count', { min: 2, max: MAX_SERIES })!;
      const first = startsAt(input.starts_at, now);
      const step = REPEATS[repeat] * DAY;
      const last = Date.parse(first) + (count - 1) * step;
      if (last > now.getTime() + 366 * DAY) throw new CompanyError('invalid_field', 'The last class must be within the next year.', 400, { field: 'count' });
      const title = text(input.title, 'title', { min: 2, max: 160 });
      // A double click or a second tab sends the same series again.
      const again = check<{ id: string }[]>(await ctx.db.from('company_sessions').select('id').eq('org_id', org.id).eq('title', title).eq('starts_at', first).not('series_id', 'is', null).limit(1));
      if (again.length) throw new CompanyError('series_exists', 'This series is already scheduled.', 409);
      const seriesId = crypto.randomUUID();
      const audienceFields = await audience(ctx, input, null);
      const base = {
        org_id: org.id, title, kind: oneOf<SessionKind>(input.kind, SESSION_KINDS, 'kind', 'class'),
        trainer: text(input.trainer, 'trainer', { max: 120, optional: true }), duration_minutes: int(input.duration_minutes ?? 60, 'duration_minutes', { min: 10, max: 480 }),
        location: text(input.location, 'location', { max: 200, optional: true }), link: link(input.link), notes: text(input.notes, 'notes', { max: 1000, optional: true }),
        ...audienceFields, status: 'scheduled', created_by: ctx.user, series_id: seriesId,
      };
      const rows = Array.from({ length: count }, (_, index) => ({ ...base, starts_at: new Date(Date.parse(first) + index * step).toISOString() }));
      const created = check<SessionRow[]>(await ctx.db.from('company_sessions').insert(rows).select(COLUMNS));
      await ctx.audit('session.series_created', seriesId, { title, count, repeat });
      return { series_id: seriesId, created: created.length, session: created.sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] };
    },
  },
  {
    // Cancels this class and the later ones in its series. Classes that have started keep their record.
    method: 'POST', path: 'orgs/:org/sessions/:session/cancel-series', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const current = await load(ctx, params.session), now = ctx.now().toISOString();
      if (!current.series_id) throw new CompanyError('not_a_series', 'This session is not part of a series.', 409);
      const later = check<{ id: string }[]>(await ctx.db.from('company_sessions').select('id').eq('org_id', ctx.org!.id).eq('series_id', current.series_id).eq('status', 'scheduled').gte('starts_at', Date.parse(current.starts_at) > Date.parse(now) ? current.starts_at : now).order('starts_at').limit(MAX_SERIES + 1));
      await inChunks(later.map((row) => row.id), async (chunk) => {
        check(await ctx.db.from('company_sessions').update({ status: 'cancelled' }).eq('org_id', ctx.org!.id).in('id', chunk));
        return [];
      });
      await ctx.audit('session.series_cancelled', current.series_id, { cancelled: later.length });
      return { cancelled: later.length };
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
      if (input.trainer_notes !== undefined) patch.trainer_notes = text(input.trainer_notes, 'trainer_notes', { max: 4000, optional: true });
      if (input.department_ids !== undefined || input.member_ids !== undefined) Object.assign(patch, await audience(ctx, input, current));
      if (!Object.keys(patch).length) return { session: current };
      const row = check<SessionRow>(await ctx.db.from('company_sessions').update(patch).eq('id', current.id).eq('org_id', ctx.org!.id).select(COLUMNS).single());
      await ctx.audit('session.updated', row.id, { fields: Object.keys(patch) });
      // Each class keeps its own date and notes; everything else can follow to the later ones.
      const { starts_at: _date, trainer_notes: _notes, ...shared } = patch;
      let later = 0;
      if (input.apply_to_series === true && current.series_id && Object.keys(shared).length) {
        const rows = check<{ id: string }[]>(await ctx.db.from('company_sessions').select('id').eq('org_id', ctx.org!.id).eq('series_id', current.series_id).eq('status', 'scheduled').gt('starts_at', current.starts_at).order('starts_at').limit(MAX_SERIES + 1));
        await inChunks(rows.map((entry) => entry.id), async (chunk) => {
          check(await ctx.db.from('company_sessions').update(shared).eq('org_id', ctx.org!.id).in('id', chunk));
          return [];
        });
        later = rows.length;
      }
      return { session: row, later };
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
      const present = new Set((await presentAt(ctx, session.id)).map((row) => row.member_id));
      const names = new Map(departments.map((entry) => [entry.id, entry.name]));
      const rows = people.filter((member) => isInvitee(session, member) || present.has(member.id))
        .map((member) => ({ member_id: member.id, name: displayName(member), department: member.department_id ? names.get(member.department_id) ?? null : null, invited: isInvitee(session, member), present: present.has(member.id) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        // People lists stay with HR, as in the session list.
        session: { ...session, member_ids: viewer.hr ? session.member_ids : [] },
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
      // Up to 2,000 people, so a piece at a time: the filter goes in the URL.
      const people = await inChunks(wanted, (chunk) => fetchAll<MemberRow>(() => ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('status', 'active').in('id', chunk).order('id')));
      if (people.length !== wanted.length) throw new CompanyError('invalid_field', 'Choose active people of this workspace.', 400, { field: 'present' });
      const existing = new Set((await presentAt(ctx, session.id)).map((row) => row.member_id));
      const wantedSet = new Set(wanted);
      const missing = people.filter((member) => !existing.has(member.id));
      const removed = [...existing].filter((id) => !wantedSet.has(id));
      const markedAt = ctx.now().toISOString();
      let added: MemberRow[] = [];
      if (missing.length) {
        // Only rows this request really added come back, so marking from two tabs logs each person once.
        const inserted = check<{ member_id: string }[]>(await ctx.db.from('company_session_attendance').upsert(missing.map((member) => ({
          session_id: session.id, org_id: org.id, member_id: member.id, user_id: member.user_id, marked_by: ctx.user, marked_at: markedAt,
        })), { onConflict: 'session_id,member_id', ignoreDuplicates: true }).select('member_id'));
        const fresh = new Set(inserted.map((row) => row.member_id));
        added = missing.filter((member) => fresh.has(member.id));
        for (const member of added) {
          await logActivity(ctx.db, { org_id: org.id, member_id: member.id, user_id: member.user_id, kind: 'session', minutes: session.duration_minutes, points: Math.min(SESSION_POINTS_MAX, session.duration_minutes), ref: activityRef(session.id) });
        }
      }
      if (removed.length) {
        await inChunks(removed, async (chunk) => {
          check(await ctx.db.from('company_session_attendance').delete().eq('session_id', session.id).in('member_id', chunk));
          // Take back the activity the attendance gave, so challenges stay fair.
          check(await ctx.db.from('company_activity').delete().eq('org_id', org.id).eq('kind', 'session').eq('ref', activityRef(session.id)).in('member_id', chunk));
          return [];
        });
      }
      if (added.length || removed.length) await ctx.audit('session.attendance', session.id, { added: added.length, removed: removed.length });
      return { present: wanted.length, added: added.length, removed: removed.length };
    },
  },
];
