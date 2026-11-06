// Certificates of completion for a job-role track or a company course. Earned by
// finishing every lesson; given automatically when the last lesson is passed, and
// on request for anyone who finished earlier. Anyone can check a code at /c/:code:
// name, company, title and date, no contact details. /v/ is hiring's, this is /c/.
import { HR_ROLES, LEAD_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { ORG_COLUMNS } from '../handler.ts';
import { fetchAll } from '../people/shared.ts';
import { check, CompanyError, type Ctx, type MemberRow, type OrgRow, type Route } from '../types.ts';
import { obj, oneOf, readableCode, text, uuid } from '../util.ts';
import type { Localized } from './content.ts';
import { liveCourses, type LiveCourse } from './custom.ts';
import { memberProgress, type ProgressRow } from './lessons.ts';
import { isHr, learner } from './shared.ts';
import { findLesson, findTrack } from './tracks/index.ts';

export interface CertificateRow {
  id: string; org_id: string; member_id: string; user_id: string | null; kind: 'track' | 'course'; ref_code: string; title: Localized;
  holder_name: string | null; lessons: number; score: number | null; code: string; issued_at: string; revoked_at: string | null;
}
const COLUMNS = 'id,org_id,member_id,user_id,kind,ref_code,title,holder_name,lessons,score,code,issued_at,revoked_at';
const CODE = /^[A-HJ-NP-Z2-9]{6,16}$/;
/** Checks one address may make per Tashkent day (ctx.ipHash already includes the day). */
export const CHECKS_PER_DAY = 200;

interface Earnable { kind: 'track' | 'course'; ref: string; title: Localized; codes: string[] }

/** What the person has finished every lesson of, among these. */
function earnedFrom(candidates: Earnable[], progress: ProgressRow[]) {
  const done = new Map(progress.filter((row) => row.status === 'completed').map((row) => [row.lesson_code, row.score]));
  return candidates.filter((entry) => entry.codes.length > 0 && entry.codes.every((code) => done.has(code))).map((entry) => {
    const scores = entry.codes.map((code) => done.get(code)).filter((score): score is number => typeof score === 'number');
    return { ...entry, score: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null };
  });
}

const courseEarnable = (course: LiveCourse): Earnable => ({ kind: 'course', ref: course.code, title: course.title, codes: course.lessons.map((lesson) => lesson.code) });
function trackEarnable(code: string): Earnable | null {
  const track = findTrack(code);
  return track ? { kind: 'track', ref: track.code, title: track.title, codes: track.lessons.map((lesson) => lesson.code) } : null;
}

/** Issues one certificate, or finds the one already there: two tabs must not earn it twice. */
async function issue(ctx: Ctx, member: MemberRow, entry: ReturnType<typeof earnedFrom>[number]): Promise<CertificateRow> {
  const read = () => ctx.db.from('company_training_certificates').select(COLUMNS).eq('member_id', member.id).eq('kind', entry.kind).eq('ref_code', entry.ref).maybeSingle();
  const existing = check<CertificateRow | null>(await read());
  if (existing) return existing;
  for (let attempt = 0; attempt < 4; attempt++) {
    const created = await ctx.db.from('company_training_certificates').insert({
      org_id: member.org_id, member_id: member.id, user_id: member.user_id, kind: entry.kind, ref_code: entry.ref, title: entry.title,
      holder_name: member.full_name, lessons: entry.codes.length, score: entry.score, code: readableCode(10), issued_at: ctx.now().toISOString(),
    }).select(COLUMNS).single();
    if (created.error?.code !== '23505') return check<CertificateRow>(created);
    // Either someone else just made this certificate, or the random code was taken: then try another.
    const found = check<CertificateRow | null>(await read());
    if (found) return found;
  }
  throw new Error('no free certificate code');
}

/**
 * After a first completion: gives the certificate of the track or courses this lesson
 * finishes. Never throws, so a lesson check cannot fail because of it.
 */
export async function awardAfterLesson(ctx: Ctx, member: MemberRow, lessonCode: string): Promise<{ code: string; title: Localized }[]> {
  try {
    const progress = await memberProgress(ctx, member.id);
    const candidates: Earnable[] = [];
    const builtIn = findLesson(lessonCode);
    if (builtIn) {
      const entry = trackEarnable(builtIn.track.code);
      if (entry) candidates.push(entry);
    } else {
      for (const course of await liveCourses(ctx)) if (course.lessons.some((lesson) => lesson.code === lessonCode)) candidates.push(courseEarnable(course));
    }
    const out: { code: string; title: Localized }[] = [];
    for (const entry of earnedFrom(candidates, progress)) {
      const row = await issue(ctx, member, entry);
      out.push({ code: row.code, title: row.title });
    }
    return out;
  } catch (cause) {
    console.error(JSON.stringify({ company_certificate: 'award_failed', error: String(cause) }));
    return [];
  }
}

const mine = (row: CertificateRow) => ({ id: row.id, kind: row.kind, ref_code: row.ref_code, title: row.title, holder_name: row.holder_name, lessons: row.lessons, score: row.score, code: row.code, issued_at: row.issued_at, revoked_at: row.revoked_at });

export async function memberCertificates(ctx: Ctx, memberId: string): Promise<CertificateRow[]> {
  return await fetchAll<CertificateRow>(() => ctx.db.from('company_training_certificates').select(COLUMNS).eq('member_id', memberId).order('issued_at', { ascending: false }).order('id'), 500);
}

export const routes: Route[] = [
  {
    // The person's certificates, and anything finished earlier that has none yet comes with them here.
    method: 'GET', path: 'orgs/:org/my/certificates', access: 'org', allowSuspended: true,
    async handle(ctx) {
      if (!ctx.member) return { certificates: [], claimable: [] };
      const member = ctx.member;
      const [rows, progress, courses] = await Promise.all([memberCertificates(ctx, member.id), memberProgress(ctx, member.id), liveCourses(ctx)]);
      const tracks = [...new Set(progress.filter((row) => row.status === 'completed').map((row) => row.track_code))].map(trackEarnable).filter((entry): entry is Earnable => Boolean(entry));
      const held = new Set(rows.map((row) => `${row.kind}:${row.ref_code}`));
      const claimable = earnedFrom([...tracks, ...courses.map(courseEarnable)], progress).filter((entry) => !held.has(`${entry.kind}:${entry.ref}`))
        .map((entry) => ({ kind: entry.kind, code: entry.ref, title: entry.title, lessons: entry.codes.length }));
      return { certificates: rows.map(mine), claimable };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/my/certificates', access: 'org',
    async handle(ctx, _params, body) {
      const member = learner(ctx);
      const input = obj(body);
      const kind = oneOf(input.kind, ['track', 'course'] as const, 'kind');
      const code = text(input.code, 'code', { min: 1, max: 80 })!;
      const candidate = kind === 'track' ? trackEarnable(code) : (await liveCourses(ctx)).filter((course) => course.code === code).map(courseEarnable)[0] ?? null;
      if (!candidate) throw new CompanyError('certificate_not_earned', 'Finish every lesson first.', 409);
      const [earned] = earnedFrom([candidate], await memberProgress(ctx, member.id));
      if (!earned) throw new CompanyError('certificate_not_earned', 'Finish every lesson first.', 409);
      return { certificate: mine(await issue(ctx, member, earned)) };
    },
  },
  {
    // HR and managers (own department) see certificates of people who agreed to share their progress.
    method: 'GET', path: 'orgs/:org/certificates', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx) {
      const org = ctx.org!.id;
      const [rows, members] = await Promise.all([
        fetchAll<CertificateRow>(() => ctx.db.from('company_training_certificates').select(COLUMNS).eq('org_id', org).order('issued_at', { ascending: false }).order('id'), 5000),
        fetchAll<Pick<MemberRow, 'id' | 'full_name' | 'email' | 'department_id' | 'consent_at'>>(() => ctx.db.from('company_members').select('id,full_name,email,department_id,consent_at').eq('org_id', org).neq('status', 'removed').order('id')),
      ]);
      const hr = isHr(ctx), department = ctx.member?.department_id ?? null;
      const byId = new Map(members.map((member) => [member.id, member]));
      const visible = rows.filter((row) => {
        const member = byId.get(row.member_id);
        return member?.consent_at && (hr || (department !== null && member.department_id === department));
      });
      return {
        can_manage: hr,
        hidden: hr ? rows.filter((row) => !byId.get(row.member_id)?.consent_at).length : 0,
        certificates: visible.map((row) => ({ ...mine(row), member_id: row.member_id, full_name: byId.get(row.member_id)?.full_name ?? null, email: byId.get(row.member_id)?.email ?? null, department_id: byId.get(row.member_id)?.department_id ?? null })),
      };
    },
  },
  {
    // HR withdraws one given in error; the public check then says so. `revoke: false` restores it.
    method: 'POST', path: 'orgs/:org/certificates/:certificate/revoke', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const id = uuid(params.certificate, 'certificate');
      const row = check<CertificateRow | null>(await ctx.db.from('company_training_certificates').select(COLUMNS).eq('id', id).eq('org_id', ctx.org!.id).maybeSingle());
      if (!row) throw new CompanyError('certificate_not_found', 'No certificate has this code.', 404);
      const input = body === undefined ? {} : obj(body);
      const revoked_at = input.revoke === false ? null : ctx.now().toISOString();
      check(await ctx.db.from('company_training_certificates').update({ revoked_at }).eq('id', id));
      await ctx.audit(revoked_at ? 'certificate.revoked' : 'certificate.restored', id, { code: row.code });
      return { certificate: mine({ ...row, revoked_at }) };
    },
  },
  {
    // The public check: name, company, what was completed and when; never contact details.
    method: 'GET', path: 'public/c/:code', access: 'public',
    async handle(ctx, params) {
      const { data: allowed, error } = await ctx.db.rpc('company_training_hit', { p_ip_hash: ctx.ipHash, p_route: 'certificate', p_limit: CHECKS_PER_DAY });
      if (error) console.error(JSON.stringify({ company_certificate: 'rate_limit_unavailable', error: error.message }));
      else if (allowed === false) throw new CompanyError('too_many_requests', 'Too many checks from this address today. Try again tomorrow.', 429);
      const code = String(params.code ?? '').trim().toUpperCase();
      if (!CODE.test(code)) throw new CompanyError('certificate_not_found', 'No certificate has this code.', 404);
      const row = check<CertificateRow | null>(await ctx.db.from('company_training_certificates').select(COLUMNS).eq('code', code).maybeSingle());
      if (!row) throw new CompanyError('certificate_not_found', 'No certificate has this code.', 404);
      const org = check<OrgRow | null>(await ctx.db.from('company_orgs').select(ORG_COLUMNS).eq('id', row.org_id).maybeSingle());
      return {
        certificate: {
          code: row.code, name: row.holder_name, company: org?.name ?? null, title: row.title, kind: row.kind, lessons: row.lessons, score: row.score,
          date: row.issued_at, revoked: Boolean(row.revoked_at),
        },
      };
    },
  },
];
