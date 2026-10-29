// My English: one call for the learner's home page — level and target, what is
// assigned, where to continue, this week's minutes and lessons, certificates.
// Tests to take come from the hiring area (GET orgs/:org/my/tests), not from here.
import { levelGap, isLevel } from '../../../../packages/company-core/src/mod.ts';
import { check, type Route } from '../types.ts';
import { tashkentDay } from '../util.ts';
import { ASSIGNMENT_COLUMNS, appliesTo, type AssignmentRow } from './assignments.ts';
import { memberProgress, type ProgressRow } from './lessons.ts';
import { daysAgo, learner, weekStart } from './shared.ts';
import { findLesson, findTrack } from './tracks/index.ts';

export const ENGLISH_URL = 'https://english.schood.online';

function lessonRef(code: string, step: unknown = null) {
  const found = findLesson(code);
  return found ? { code, track_code: found.track.code, track_title: found.track.title, title: found.lesson.title, stage: found.lesson.stage, level: found.lesson.level, step } : null;
}

/** First lesson of a track the member has not completed. */
function nextIn(trackCode: string, progress: ProgressRow[]) {
  const track = findTrack(trackCode);
  const lesson = track?.lessons.find((entry) => !progress.some((row) => row.lesson_code === entry.code && row.status === 'completed'));
  return lesson ? lessonRef(lesson.code) : null;
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/my/home', access: 'org', allowSuspended: true,
    async handle(ctx) {
      const member = learner(ctx);
      const now = ctx.now();
      const progress = await memberProgress(ctx, member.id);
      const assignmentRows = check<AssignmentRow[]>(await ctx.db.from('company_assignments').select(ASSIGNMENT_COLUMNS).eq('org_id', ctx.org!.id).eq('status', 'active'));
      const today = tashkentDay(now);
      const assignments = assignmentRows.filter((row) => appliesTo(row, member)).map((row) => {
        const track = row.track_code ? findTrack(row.track_code) : undefined;
        const done = track ? track.lessons.filter((lesson) => progress.some((entry) => entry.lesson_code === lesson.code && entry.status === 'completed')).length : 0;
        return {
          id: row.id, track_code: row.track_code, track_title: track?.title ?? null, target_level: row.target_level, due_date: row.due_date, note: row.note,
          lessons_done: done, lessons_total: track?.lessons.length ?? 0,
          meets_target: row.target_level ? levelGap(isLevel(member.level) ? member.level : null, row.target_level) === 0 && member.level !== null : null,
          overdue: row.due_date !== null && row.due_date < today,
          next: row.track_code ? nextIn(row.track_code, progress) : null,
        };
      }).sort((a, b) => (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1);

      // Continue the lesson touched last; otherwise the next one from an assignment or the job-role track.
      const open = progress.filter((row) => row.status === 'started').sort((a, b) => String(b.updated_at ?? '') < String(a.updated_at ?? '') ? -1 : 1)[0];
      const resume = open ? lessonRef(open.lesson_code, open.data?.step ?? null) : null;
      const suggested = resume ?? assignments.find((entry) => entry.next)?.next ?? nextIn(member.job_role, progress) ?? nextIn('general', progress);

      const since = weekStart(now);
      const windowStart = daysAgo(new Date(`${tashkentDay(now)}T00:00:00+05:00`), 6);
      const activity = check<{ kind: string; minutes: number; created_at: string }[]>(
        await ctx.db.from('company_activity').select('kind,minutes,created_at').eq('member_id', member.id).gte('created_at', (windowStart < since ? windowStart : since).toISOString()),
      );
      const thisWeek = activity.filter((row) => row.created_at >= since.toISOString());
      const days = Array.from({ length: 7 }, (_, index) => {
        const day = tashkentDay(daysAgo(now, 6 - index));
        return { day, minutes: activity.filter((row) => tashkentDay(new Date(row.created_at)) === day).reduce((sum, row) => sum + (row.minutes ?? 0), 0) };
      });
      const counts = await Promise.all(['company_roleplay_sessions', 'company_writing_checks'].map(async (table) => {
        const { count, error } = await ctx.db.from(table).select('id', { count: 'exact', head: true }).eq('member_id', member.id);
        return error ? 0 : count ?? 0;
      }));

      const attempts = check<{ id: string; assessment_id: string; overall_level: string | null; graded_at: string | null; certificate_code: string | null; status: string }[]>(
        await ctx.db.from('company_attempts').select('id,assessment_id,overall_level,graded_at,certificate_code,status').eq('member_id', member.id).eq('status', 'graded'),
      ).filter((row) => row.certificate_code);
      const titles = attempts.length
        ? new Map(check<{ id: string; title: string; kind: string }[]>(await ctx.db.from('company_assessments').select('id,title,kind').in('id', attempts.map((row) => row.assessment_id))).map((row) => [row.id, row]))
        : new Map();

      return {
        member: {
          full_name: member.full_name, job_role: member.job_role, seat: member.seat, level: member.level, level_source: member.level_source, level_at: member.level_at,
          target_level: member.target_level, target_date: member.target_date,
          gap: member.target_level && isLevel(member.target_level) ? levelGap(isLevel(member.level) ? member.level : null, member.target_level) : null,
        },
        english_url: member.seat && ctx.org!.status === 'active' ? ENGLISH_URL : null,
        assignments,
        continue: suggested,
        resuming: Boolean(resume),
        week: {
          since: since.toISOString(),
          minutes: thisWeek.reduce((sum, row) => sum + (row.minutes ?? 0), 0),
          lessons: progress.filter((row) => row.completed_at && row.completed_at >= since.toISOString()).length,
          activities: thisWeek.length,
          days,
        },
        totals: { lessons: progress.filter((row) => row.status === 'completed').length, roleplays: counts[0], writing: counts[1] },
        certificates: attempts
          .sort((a, b) => String(b.graded_at ?? '') < String(a.graded_at ?? '') ? -1 : 1)
          .map((row) => ({ attempt_id: row.id, code: row.certificate_code, level: row.overall_level, graded_at: row.graded_at, title: titles.get(row.assessment_id)?.title ?? null, kind: titles.get(row.assessment_id)?.kind ?? null })),
      };
    },
  },
];
