// In-app notifications. pushNotice is what other areas call; sweepOrg finds the events
// this area reports by reading the tables. The same key never makes a second notice,
// so a sweep may run as often as it likes and two tabs cannot double-count.
import { ASSESSMENT_COLUMNS, closed, type AssessmentRow } from '../hiring/attempts.ts';
import { inAudience } from '../hiring/shared.ts';
import { fetchAll } from '../insights/common.ts';
import { appliesTo, ASSIGNMENT_COLUMNS, type AssignmentRow } from '../training/assignments.ts';
import { findTrack } from '../training/tracks/index.ts';
import { check, CompanyError, UUID, type Ctx, type Db, type MemberRow, type OrgRow, type Route } from '../types.ts';
import { inChunks, tashkentDay } from '../util.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { DAY, ensureSettings, paging, readSettings, tashkentMidnight, type ConnectSettings } from './shared.ts';

export interface NoticeRow {
  id: string;
  org_id: string;
  member_id: string;
  kind: string;
  dedupe_key: string;
  params: Record<string, unknown>;
  link: string | null;
  read_at: string | null;
  push_state?: string | null;
  push_reason?: string | null;
  pushed_at?: string | null;
  created_at: string;
}
export const NOTICE_COLUMNS = 'id,org_id,member_id,kind,dedupe_key,params,link,read_at,created_at';

export interface NoticeInput {
  org_id: string;
  member_id: string;
  /** A name like `lesson_assigned`; the app shows `connect.notice.<kind>` or params.title. */
  kind: string;
  /** Unique for this person: the same key never makes a second notice. */
  key: string;
  /** Short values for the text; strings and numbers only. */
  params?: Record<string, string | number | null>;
  /** A path inside the app. */
  link?: string | null;
}

const safeLink = (link: string | null | undefined): string | null => link && link.startsWith('/') && !link.startsWith('//') && link.length <= 300 ? link : null;
const row = (input: NoticeInput) => ({
  org_id: input.org_id, member_id: input.member_id, kind: input.kind.slice(0, 60), dedupe_key: input.key.slice(0, 200), params: input.params ?? {}, link: safeLink(input.link),
});

/**
 * Tells one person something in the app. Deduplicated by `key`. Never throws: a notice
 * must not fail the action that caused it. True when a new notice was stored.
 */
export async function pushNotice(db: Db, input: NoticeInput): Promise<boolean> {
  const { data, error } = await db.from('company_notices').upsert(row(input), { onConflict: 'member_id,dedupe_key', ignoreDuplicates: true }).select('id');
  if (error) {
    console.error(JSON.stringify({ company_notice: 'failed', kind: input.kind, error: error.message }));
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/** Stores many notices at once; returns how many were new. */
export async function pushNotices(db: Db, inputs: NoticeInput[]): Promise<number> {
  let added = 0;
  for (let from = 0; from < inputs.length; from += 500) {
    const { data, error } = await db.from('company_notices').upsert(inputs.slice(from, from + 500).map(row), { onConflict: 'member_id,dedupe_key', ignoreDuplicates: true }).select('id');
    if (error) console.error(JSON.stringify({ company_notice: 'failed', count: inputs.length, error: error.message }));
    else added += (data as unknown[] | null)?.length ?? 0;
  }
  return added;
}

const ASSIGNMENT_DAYS = 3, SESSION_HOURS = 24;
const CONTRACT_DAYS = [30, 7, 1];
/** Events after the last sweep, plus this much in case the last one stopped early. */
const OVERLAP = 2 * 3_600_000;
/** The first sweep of a workspace looks back this far. */
const FIRST_LOOK = 7 * DAY;
/** Between sweeps triggered by someone opening the app. */
export const SWEEP_EVERY = 30 * 60_000;

type Active = Pick<MemberRow, 'id' | 'role' | 'seat' | 'department_id' | 'job_role' | 'joined_at' | 'consent_at' | 'user_id'>;

async function assignmentNotices(db: Db, org: OrgRow, members: Active[], now: Date): Promise<NoticeInput[]> {
  // An assignment is about lessons, and only a working seat opens them. A pilot has none.
  if (org.status !== 'active') return [];
  const today = tashkentDay(now), until = tashkentDay(new Date(now.getTime() + ASSIGNMENT_DAYS * DAY));
  const assignments = check<AssignmentRow[]>(await db.from('company_assignments').select(ASSIGNMENT_COLUMNS).eq('org_id', org.id).eq('status', 'active').gte('due_date', today).lte('due_date', until).limit(500));
  if (!assignments.length) return [];
  const seated = members.filter((member) => member.seat);
  const tracks = [...new Set(assignments.map((entry) => entry.track_code).filter(Boolean))] as string[];
  const done = tracks.length ? await fetchAll<{ member_id: string; track_code: string; lesson_code: string }>(() =>
    db.from('company_lesson_progress').select('member_id,track_code,lesson_code').eq('org_id', org.id).eq('status', 'completed').in('track_code', tracks).order('id')) : [];
  const finished = new Map<string, Set<string>>();
  for (const entry of done) {
    const key = `${entry.member_id}:${entry.track_code}`;
    if (!finished.has(key)) finished.set(key, new Set());
    finished.get(key)!.add(entry.lesson_code);
  }
  const out: NoticeInput[] = [];
  for (const assignment of assignments) {
    const lessons = assignment.track_code ? findTrack(assignment.track_code)?.lessons.length ?? 0 : 0;
    for (const member of seated) {
      if (!appliesTo(assignment, member)) continue;
      if (lessons && (finished.get(`${member.id}:${assignment.track_code}`)?.size ?? 0) >= lessons) continue;
      out.push({ org_id: org.id, member_id: member.id, kind: 'assignment_due', key: `assignment_due:${assignment.id}:${assignment.due_date}`, params: { date: assignment.due_date }, link: `/w/${org.id}/learn` });
    }
  }
  return out;
}

async function testNotices(db: Db, org: OrgRow, members: Active[], now: Date): Promise<NoticeInput[]> {
  const rows = check<AssessmentRow[]>(await db.from('company_assessments').select(ASSESSMENT_COLUMNS)
    .eq('org_id', org.id).neq('kind', 'hiring').eq('status', 'open').gte('created_at', new Date(now.getTime() - 60 * DAY).toISOString()).limit(100));
  const open = rows.filter((entry) => !closed(entry, now));
  if (!open.length) return [];
  const attempts = await inChunks(open.map((entry) => entry.id), (chunk) => fetchAll<{ assessment_id: string; member_id: string | null }>(() =>
    db.from('company_attempts').select('assessment_id,member_id').eq('org_id', org.id).in('assessment_id', chunk).not('member_id', 'is', null).order('id')));
  const taken = new Set(attempts.map((entry) => `${entry.assessment_id}:${entry.member_id}`));
  const out: NoticeInput[] = [];
  for (const assessment of open) for (const member of members) {
    if (!inAudience(assessment, member) || taken.has(`${assessment.id}:${member.id}`)) continue;
    out.push({ org_id: org.id, member_id: member.id, kind: 'test_todo', key: `test_todo:${assessment.id}`, params: { title: assessment.title }, link: `/w/${org.id}/test/${assessment.id}` });
  }
  return out;
}

async function sessionNotices(db: Db, org: OrgRow, members: Active[], now: Date): Promise<NoticeInput[]> {
  const rows = check<{ id: string; title: string; starts_at: string; department_ids: string[] | null; member_ids: string[] | null }[]>(await db.from('company_sessions').select('id,title,starts_at,department_ids,member_ids')
    .eq('org_id', org.id).eq('status', 'scheduled').gt('starts_at', now.toISOString()).lte('starts_at', new Date(now.getTime() + SESSION_HOURS * 3_600_000).toISOString()).limit(100));
  const out: NoticeInput[] = [];
  for (const session of rows) {
    const departments = session.department_ids ?? [], people = session.member_ids ?? [];
    for (const member of members) {
      const invited = (!departments.length && !people.length) || people.includes(member.id) || (member.department_id !== null && departments.includes(member.department_id));
      if (invited) out.push({ org_id: org.id, member_id: member.id, kind: 'session_soon', key: `session_soon:${session.id}:${session.starts_at}`, params: { title: session.title, at: session.starts_at }, link: `/w/${org.id}/sessions` });
    }
  }
  return out;
}

/** Candidate notices name the test, never the candidate: this table stays free of their details. */
async function candidateNotices(db: Db, org: OrgRow, hr: Active[], since: string): Promise<NoticeInput[]> {
  if (!hr.length) return [];
  const attempts = check<{ id: string; assessment_id: string; status: string }[]>(await db.from('company_attempts').select('id,assessment_id,status')
    .eq('org_id', org.id).is('member_id', null).in('status', ['submitted', 'graded']).gte('submitted_at', since).order('submitted_at', { ascending: false }).limit(200));
  if (!attempts.length) return [];
  const tests = await inChunks([...new Set(attempts.map((entry) => entry.assessment_id))], async (chunk) =>
    check<{ id: string; title: string }[]>(await db.from('company_assessments').select('id,title').eq('org_id', org.id).in('id', chunk)));
  const title = new Map(tests.map((entry) => [entry.id, entry.title]));
  return attempts.flatMap((attempt) => hr.map((member): NoticeInput => ({
    org_id: org.id, member_id: member.id, kind: 'candidate_finished', key: `candidate_finished:${attempt.id}`, params: { title: title.get(attempt.assessment_id) ?? '' }, link: `/w/${org.id}/hiring/${attempt.assessment_id}/${attempt.id}`,
  })));
}

async function seatNotices(db: Db, org: OrgRow, members: Active[], since: string): Promise<NoticeInput[]> {
  const rows = check<{ id: string | number; action: string; target: string | null }[]>(await db.from('company_audit').select('id,action,target')
    .eq('org_id', org.id).in('action', ['member.seat_on', 'member.seat_off']).gte('created_at', since).order('created_at', { ascending: true }).limit(500));
  const known = new Set(members.map((member) => member.id));
  return rows.filter((entry) => entry.target && known.has(entry.target)).map((entry) => ({
    org_id: org.id, member_id: entry.target!, kind: entry.action === 'member.seat_on' ? 'seat_on' : 'seat_off', key: `seat:${entry.id}`, link: entry.action === 'member.seat_on' ? `/w/${org.id}/learn` : `/w/${org.id}/me`,
  }));
}

function contractNotices(org: OrgRow, owners: Active[], now: Date): NoticeInput[] {
  if (!org.contract_ends_at) return [];
  const left = Date.parse(org.contract_ends_at) - now.getTime();
  if (left <= 0) return [];
  // The nearest threshold passed: 30, 7 or 1 days out, one notice each.
  const threshold = [...CONTRACT_DAYS].reverse().find((days) => left <= days * DAY);
  if (!threshold) return [];
  const date = tashkentDay(new Date(org.contract_ends_at));
  return owners.map((member) => ({ org_id: org.id, member_id: member.id, kind: 'contract_ending', key: `contract_ending:${date}:${threshold}`, params: { date, days: Math.ceil(left / DAY) }, link: `/w/${org.id}/settings` }));
}

/** The weekly summary for HR. Learning counts only people who agreed to share it. */
async function digestNotices(db: Db, org: OrgRow, settings: ConnectSettings, hr: Active[], members: Active[], now: Date): Promise<NoticeInput[]> {
  if (!settings.digest_enabled || !hr.length) return [];
  const local = new Date(tashkentMidnight(now).getTime() + 5 * 3_600_000);
  if ((local.getUTCDay() + 6) % 7 + 1 !== settings.digest_weekday) return [];
  const today = tashkentDay(now);
  if (settings.last_digest_week === today) return [];
  check(await db.from('company_connect_settings').update({ last_digest_week: today }).eq('org_id', org.id));
  const since = new Date(now.getTime() - 7 * DAY).toISOString();
  const shared = new Map(members.filter((member) => member.consent_at).map((member) => [member.id, member]));
  const activity = await fetchAll<{ member_id: string | null; kind: string; minutes: number; created_at: string }>(() =>
    db.from('company_activity').select('member_id,kind,minutes,created_at').eq('org_id', org.id).gte('created_at', since).order('id'), 50_000);
  const learners = new Set<string>();
  let minutes = 0;
  for (const entry of activity) {
    const member = entry.member_id ? shared.get(entry.member_id) : undefined;
    if (!member) continue;
    // Schood English time counts only from the later of joining and agreeing.
    if (entry.kind === 'english') {
      const from = Math.max(Date.parse(member.joined_at ?? '') || 0, Date.parse(member.consent_at ?? '') || 0);
      if (Date.parse(entry.created_at) < from) continue;
    }
    learners.add(member.id);
    minutes += Number(entry.minutes) || 0;
  }
  const graded = check<{ id: string }[]>(await db.from('company_attempts').select('id').eq('org_id', org.id).eq('status', 'graded').gte('graded_at', since).limit(5000));
  const candidates = check<{ id: string }[]>(await db.from('company_attempts').select('id').eq('org_id', org.id).is('member_id', null).in('status', ['submitted', 'graded']).gte('submitted_at', since).limit(5000));
  return hr.map((member) => ({
    org_id: org.id, member_id: member.id, kind: 'weekly_digest', key: `digest:${today}`,
    params: { people: members.length, learners: learners.size, minutes, tests: graded.length, candidates: candidates.length, date: today }, link: `/w/${org.id}`,
  }));
}

/** Generates this workspace's notices once. Safe to repeat. Returns how many were new. */
export async function sweepOrg(db: Db, org: OrgRow, settings: ConnectSettings, since: string, now: Date): Promise<number> {
  const members = await fetchAll<Active>(() => db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('status', 'active').order('id'));
  const hr = members.filter((member) => member.role === 'owner' || member.role === 'admin');
  const owners = members.filter((member) => member.role === 'owner');
  const ended = Boolean(org.contract_ends_at) && Date.parse(org.contract_ends_at!) <= now.getTime();
  const notices: NoticeInput[] = ended ? [] : [
    ...await assignmentNotices(db, org, members, now),
    ...await testNotices(db, org, members, now),
    ...await sessionNotices(db, org, members, now),
    ...await candidateNotices(db, org, hr, since),
    ...await seatNotices(db, org, members, since),
    ...contractNotices(org, owners, now),
    ...await digestNotices(db, org, settings, hr, members, now),
  ];
  return notices.length ? await pushNotices(db, notices) : 0;
}

/**
 * Sweeps unless someone did in the last half hour. Taking the cursor with a conditional
 * update means two tabs, or a tab and the job, cannot both run it.
 */
export async function maybeSweep(db: Db, org: OrgRow, now: Date, every = SWEEP_EVERY): Promise<number | null> {
  if (org.status !== 'pilot' && org.status !== 'active') return null;
  // The bell asks every minute: this read is all that happens on most of those requests.
  const settings = await readSettings(db, org.id);
  const previous = settings.notices_swept_at;
  if (previous && now.getTime() - Date.parse(previous) < every) return null;
  await ensureSettings(db, org.id);
  let claim = db.from('company_connect_settings').update({ notices_swept_at: now.toISOString() }).eq('org_id', org.id);
  claim = previous ? claim.eq('notices_swept_at', previous) : claim.is('notices_swept_at', null);
  const claimed = check<unknown[]>(await claim.select('org_id'));
  if (!claimed.length) return null;
  const since = new Date(previous ? Date.parse(previous) - OVERLAP : now.getTime() - FIRST_LOOK).toISOString();
  try {
    return await sweepOrg(db, org, settings, since, now);
  } catch (cause) {
    // Hand the cursor back so the events since then are not lost to the next sweep.
    console.error(JSON.stringify({ company_notice_sweep: 'failed', org: org.id, error: String(cause) }));
    const { error } = await db.from('company_connect_settings').update({ notices_swept_at: previous }).eq('org_id', org.id).eq('notices_swept_at', now.toISOString());
    if (error) console.error(JSON.stringify({ company_notice_sweep: 'reset_failed', org: org.id, error: error.message }));
    return null;
  }
}

async function unreadCount(ctx: Ctx, memberId: string): Promise<number> {
  const { count, error } = await ctx.db.from('company_notices').select('id', { count: 'exact', head: true }).eq('member_id', memberId).is('read_at', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Opening the bell must not fail over a sweep. */
async function quietSweep(ctx: Ctx): Promise<void> {
  try {
    await maybeSweep(ctx.db, ctx.org!, ctx.now());
  } catch (cause) {
    console.error(JSON.stringify({ company_notice_sweep: 'failed', org: ctx.org?.id, error: String(cause) }));
  }
}

export const noticeRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/connect/notices/count', access: 'org', allowSuspended: true,
    async handle(ctx) {
      if (!ctx.member) return { unread: 0 };
      await quietSweep(ctx);
      return { unread: await unreadCount(ctx, ctx.member.id) };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/connect/notices', access: 'org', allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      if (!ctx.member) return { notices: [], unread: 0, next_offset: null };
      await quietSweep(ctx);
      const { limit, offset } = paging(query, { fallback: 30, max: 100 });
      let list = ctx.db.from('company_notices').select(NOTICE_COLUMNS).eq('member_id', ctx.member.id).eq('org_id', ctx.org!.id);
      if (query.get('unread') === '1') list = list.is('read_at', null);
      const notices = check<NoticeRow[]>(await list.order('created_at', { ascending: false }).order('id').range(offset, offset + limit - 1));
      return { notices, unread: await unreadCount(ctx, ctx.member.id), next_offset: notices.length === limit ? offset + limit : null };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/connect/notices/read-all', access: 'org', allowSuspended: true,
    async handle(ctx) {
      if (!ctx.member) return { updated: 0 };
      const rows = check<{ id: string }[]>(await ctx.db.from('company_notices').update({ read_at: ctx.now().toISOString() }).eq('member_id', ctx.member.id).is('read_at', null).select('id'));
      return { updated: rows.length };
    },
  },
  {
    // Only the person's own notice; reading it twice is harmless.
    method: 'POST', path: 'orgs/:org/connect/notices/:notice/read', access: 'org', allowSuspended: true,
    async handle(ctx, params) {
      if (!ctx.member) throw new CompanyError('notice_not_found', 'Notice not found.', 404);
      if (!UUID.test(params.notice)) throw new CompanyError('notice_not_found', 'Notice not found.', 404);
      const found = check<NoticeRow | null>(await ctx.db.from('company_notices').select(NOTICE_COLUMNS).eq('id', params.notice).eq('member_id', ctx.member.id).maybeSingle());
      if (!found) throw new CompanyError('notice_not_found', 'Notice not found.', 404);
      if (!found.read_at) check(await ctx.db.from('company_notices').update({ read_at: ctx.now().toISOString() }).eq('id', found.id).is('read_at', null));
      return { ok: true };
    },
  },
];
