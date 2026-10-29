// One person's profile (/w/:org/people/:member): company test history with
// per-skill results, certificates and assignments for everyone the viewer may
// see; lessons, role-plays, minutes and Schood English activity only when the
// person shares their progress (or is looking at themself).
import { isLevel, SKILLS } from '../../../../packages/company-core/src/mod.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, CompanyError, UUID, type MemberRow, type Route } from '../types.ts';
import { addDays, canSee, dayStart, fetchAll, localDate, meetsTarget, shares, viewerOf, weekOf } from './common.ts';
import { englishSummary } from './english.ts';
import { optional, type AssignmentRow } from './overview.ts';

interface AttemptRow { id: string; assessment_id: string; status: string; overall_level: string | null; overall_score: number | null; skill_results: Record<string, { score?: unknown; level?: unknown }> | null; started_at: string; submitted_at: string | null; graded_at: string | null; certificate_code: string | null }
interface ProgressRow { track_code: string; lesson_code: string; status: string; score: number | null; minutes: number; completed_at: string | null; updated_at: string | null }
interface ActivityRow { kind: string; minutes: number; points: number; created_at: string }

export const PROFILE_WEEKS = 12;

export function skillBars(results: AttemptRow['skill_results']) {
  return SKILLS.filter((skill) => results && typeof results === 'object' && results[skill])
    .map((skill) => {
      const entry = results![skill] ?? {};
      const score = Number(entry.score);
      return { skill, score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null, level: isLevel(entry.level) ? entry.level : null };
    });
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/members/:member/profile', access: 'org', allowSuspended: true,
    async handle(ctx, params) {
      const viewer = viewerOf(ctx), org = ctx.org!, now = ctx.now(), today = localDate(now);
      if (!UUID.test(params.member)) throw new CompanyError('member_not_found', 'Person not found.', 404);
      const member = check<MemberRow | null>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('id', params.member).maybeSingle());
      if (!member || !canSee(viewer, member) || (member.status === 'removed' && !viewer.hr)) throw new CompanyError('member_not_found', 'Person not found.', 404);
      const self = member.id === viewer.memberId;
      const detail = self || shares(member);

      const firstWeek = addDays(weekOf(today), -7 * (PROFILE_WEEKS - 1));
      const [department, attempts, assignmentRows, progress, activity, attendance] = await Promise.all([
        member.department_id ? ctx.db.from('company_departments').select('id,name').eq('id', member.department_id).maybeSingle() : null,
        check<AttemptRow[]>(await ctx.db.from('company_attempts').select('id,assessment_id,status,overall_level,overall_score,skill_results,started_at,submitted_at,graded_at,certificate_code')
          .eq('org_id', org.id).eq('member_id', member.id).order('started_at', { ascending: false }).limit(60)),
        fetchAll<AssignmentRow>(() => ctx.db.from('company_assignments').select('id,track_code,target_level,due_date,department_id,member_id,status,note,created_at').eq('org_id', org.id).neq('status', 'cancelled').order('id'), 5000),
        detail ? fetchAll<ProgressRow>(() => ctx.db.from('company_lesson_progress').select('track_code,lesson_code,status,score,minutes,completed_at,updated_at').eq('member_id', member.id).order('lesson_code'), 3000) : [],
        detail ? fetchAll<ActivityRow>(() => ctx.db.from('company_activity').select('kind,minutes,points,created_at').eq('org_id', org.id).eq('member_id', member.id).gte('created_at', dayStart(firstWeek).toISOString()).order('id'), 10_000) : [],
        detail ? optional<{ session_id: string; marked_at: string }[]>(() => ctx.db.from('company_session_attendance').select('session_id,marked_at').eq('member_id', member.id).order('marked_at', { ascending: false }).limit(50), []) : [],
      ]);

      const assessmentIds = [...new Set(attempts.map((attempt) => attempt.assessment_id))];
      const sessionIds = attendance.map((row) => row.session_id);
      const [assessments, sessions] = await Promise.all([
        assessmentIds.length ? check<{ id: string; title: string; kind: string }[]>(await ctx.db.from('company_assessments').select('id,title,kind').eq('org_id', org.id).in('id', assessmentIds)) : [],
        sessionIds.length ? optional<{ id: string; title: string; kind: string; starts_at: string; duration_minutes: number }[]>(() => ctx.db.from('company_sessions').select('id,title,kind,starts_at,duration_minutes').eq('org_id', org.id).in('id', sessionIds), []) : [],
      ]);
      const assessmentById = new Map(assessments.map((row) => [row.id, row]));

      const tests = attempts.filter((attempt) => attempt.status !== 'expired').map((attempt) => ({
        id: attempt.id, assessment_id: attempt.assessment_id, title: assessmentById.get(attempt.assessment_id)?.title ?? null, kind: assessmentById.get(attempt.assessment_id)?.kind ?? null,
        status: attempt.status, overall_level: isLevel(attempt.overall_level) ? attempt.overall_level : null, overall_score: attempt.overall_score === null ? null : Number(attempt.overall_score),
        skills: attempt.status === 'graded' ? skillBars(attempt.skill_results) : [], started_at: attempt.started_at, graded_at: attempt.graded_at, certificate_code: attempt.status === 'graded' ? attempt.certificate_code : null,
      }));
      const certificates = tests.filter((test) => test.certificate_code).map((test) => ({ code: test.certificate_code!, level: test.overall_level, date: test.graded_at, title: test.title }));

      const completedByTrack = new Map<string, number>();
      for (const row of progress) if (row.status === 'completed') completedByTrack.set(row.track_code, (completedByTrack.get(row.track_code) ?? 0) + 1);
      const assignments = assignmentRows
        .filter((row) => row.member_id === member.id || (row.department_id !== null && row.department_id === member.department_id))
        .map((row) => ({
          id: row.id, track_code: row.track_code, target_level: row.target_level, due_date: row.due_date, status: row.status, note: row.note,
          scope: row.member_id ? 'person' : 'department', overdue: row.status === 'active' && Boolean(row.due_date && row.due_date < today),
          target_met: row.target_level ? meetsTarget(member.level, row.target_level) : null,
          lessons_done: detail && row.track_code ? completedByTrack.get(row.track_code) ?? 0 : null,
        }))
        .sort((a, b) => (a.status === b.status ? String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')) : a.status === 'active' ? -1 : 1));

      let learning = null;
      if (detail) {
        const kinds: Record<string, { events: number; minutes: number }> = {};
        const weeks = Array.from({ length: PROFILE_WEEKS }, (_, index) => ({ week: addDays(firstWeek, index * 7), minutes: 0, events: 0 }));
        const days = new Set<string>();
        let minutes = 0, points = 0, last: string | null = null;
        for (const row of activity) {
          const kind = kinds[row.kind] ??= { events: 0, minutes: 0 };
          kind.events += 1; kind.minutes += Number(row.minutes) || 0;
          minutes += Number(row.minutes) || 0; points += Number(row.points) || 0;
          const day = localDate(row.created_at);
          days.add(day);
          const week = weeks.find((entry) => entry.week === weekOf(day));
          if (week) { week.minutes += Number(row.minutes) || 0; week.events += 1; }
          if (!last || Date.parse(row.created_at) > Date.parse(last)) last = new Date(row.created_at).toISOString();
        }
        const tracks = new Map<string, { track_code: string; completed: number; started: number; last_at: string | null }>();
        for (const row of progress) {
          const entry = tracks.get(row.track_code) ?? { track_code: row.track_code, completed: 0, started: 0, last_at: null };
          if (row.status === 'completed') entry.completed += 1; else entry.started += 1;
          const at = row.completed_at ?? row.updated_at;
          if (at && (!entry.last_at || Date.parse(at) > Date.parse(entry.last_at))) entry.last_at = at;
          tracks.set(row.track_code, entry);
        }
        const completed = progress.filter((row) => row.status === 'completed');
        const scored = completed.filter((row) => row.score !== null && Number.isFinite(Number(row.score)));
        learning = {
          weeks_count: PROFILE_WEEKS,
          minutes, points, active_days: days.size, last_at: last, kinds, weeks,
          lessons_completed: completed.length, lessons_started: progress.length - completed.length,
          lesson_minutes: progress.reduce((sum, row) => sum + (Number(row.minutes) || 0), 0),
          avg_lesson_score: scored.length ? Math.round(scored.reduce((sum, row) => sum + Number(row.score), 0) / scored.length) : null,
          tracks: [...tracks.values()].sort((a, b) => String(b.last_at ?? '').localeCompare(String(a.last_at ?? ''))),
          recent_lessons: [...progress].sort((a, b) => String(b.completed_at ?? b.updated_at ?? '').localeCompare(String(a.completed_at ?? a.updated_at ?? ''))).slice(0, 8),
          sessions: sessions.sort((a, b) => b.starts_at.localeCompare(a.starts_at)).slice(0, 10),
        };
      }

      const english = detail && member.seat && member.user_id ? await englishSummary(ctx.db, member.user_id, now) : null;
      const departmentRow = department ? (department as { data: { id: string; name: string } | null }).data : null;
      return {
        member: { ...member, department_name: departmentRow?.name ?? null },
        self,
        detail,
        can_manage: viewer.hr,
        tests,
        certificates,
        assignments,
        learning,
        english,
        english_reason: english ? null : !member.seat ? 'no_seat' : !detail ? 'no_consent' : !member.user_id ? 'not_joined' : 'no_data',
      };
    },
  },
];
