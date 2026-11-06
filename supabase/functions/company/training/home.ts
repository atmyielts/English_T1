// My English: one call for the learner's home page — level and target, what is
// assigned, where to continue, this week's minutes and lessons, certificates.
// Tests to take come from the hiring area (GET orgs/:org/my/tests), not from here.
// Open to every member; without a learning seat it offers no lessons (`can_learn`).
// Company courses count like tracks here, and the learner's path leads when nothing is assigned.
import { levelGap, isLevel } from '../../../../packages/company-core/src/mod.ts';
import { fetchAll } from '../people/shared.ts';
import { check, type Ctx, type MemberRow, type Route } from '../types.ts';
import { inChunks, tashkentDay } from '../util.ts';
import { activeAssignments, appliesTo, assignedContent } from './assignments.ts';
import { memberCertificates } from './certificates.ts';
import { liveCourses, type LiveCourse } from './custom.ts';
import { courseSummary, memberProgress, type ProgressRow } from './lessons.ts';
import { myPath } from './paths.ts';
import { canLearn, daysAgo, learner, seatOpen, seatReason, weekStart } from './shared.ts';
import { findLesson } from './tracks/index.ts';

export const ENGLISH_URL = 'https://english.schood.online';

function lessonRef(code: string, step: unknown = null, courses: LiveCourse[] = []) {
  const found = findLesson(code);
  if (found) return { code, track_code: found.track.code, track_title: found.track.title, title: found.lesson.title, stage: found.lesson.stage, level: found.lesson.level, step };
  const course = courses.find((entry) => entry.lessons.some((lesson) => lesson.code === code));
  const lesson = course?.lessons.find((entry) => entry.code === code);
  return course && lesson ? { code, track_code: course.code, track_title: course.title, title: lesson.content.title, stage: 'professional', level: lesson.content.level, step } : null;
}

/** First lesson of a track or course the member has not completed. */
function nextIn(trackCode: string, progress: ProgressRow[], courses: LiveCourse[]) {
  const content = assignedContent(trackCode, courses);
  const code = content?.codes.find((entry) => !progress.some((row) => row.lesson_code === entry && row.status === 'completed'));
  return code ? lessonRef(code, null, courses) : null;
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/my/home', access: 'org', allowSuspended: true,
    async handle(ctx) {
      const member = learner(ctx);
      const now = ctx.now();
      const progress = await memberProgress(ctx, member.id);
      const assignmentRows = await activeAssignments(ctx, member);
      const courses = await liveCourses(ctx);
      const open = canLearn(ctx);
      const today = tashkentDay(now);
      const assignments = assignmentRows.filter((row) => appliesTo(row, member)).map((row) => {
        const content = assignedContent(row.track_code, courses);
        const done = content ? content.codes.filter((code) => progress.some((entry) => entry.lesson_code === code && entry.status === 'completed')).length : 0;
        return {
          id: row.id, track_code: row.track_code, track_title: content?.title ?? null, target_level: row.target_level, due_date: row.due_date, note: row.note,
          lessons_done: done, lessons_total: content?.codes.length ?? 0,
          meets_target: row.target_level ? levelGap(isLevel(member.level) ? member.level : null, row.target_level) === 0 && member.level !== null : null,
          overdue: row.due_date !== null && row.due_date < today,
          next: open && row.track_code ? nextIn(row.track_code, progress, courses) : null,
        };
      }).sort((a, b) => (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1);

      // Continue the lesson touched last; otherwise the next one from an assignment or the job-role track.
      const started = progress.filter((row) => row.status === 'started').sort((a, b) => String(b.updated_at ?? '') < String(a.updated_at ?? '') ? -1 : 1)[0];
      const resume = open && started ? lessonRef(started.lesson_code, started.data?.step ?? null, courses) : null;
      const path = await myPath(ctx, member);
      const pathNext = path.steps.find((step) => step.next && (step.done ?? 0) < step.lessons)?.next ?? null;
      const suggested = !open ? null : resume ?? assignments.find((entry) => entry.next)?.next ?? (pathNext ? lessonRef(pathNext.code, null, courses) : null) ?? nextIn(member.job_role, progress, courses) ?? nextIn('general', progress, courses);

      const since = weekStart(now);
      const windowStart = daysAgo(new Date(`${tashkentDay(now)}T00:00:00+05:00`), 6);
      const activity = await fetchAll<{ kind: string; minutes: number; created_at: string }>(
        () => ctx.db.from('company_activity').select('kind,minutes,created_at').eq('member_id', member.id).gte('created_at', (windowStart < since ? windowStart : since).toISOString()).order('id'),
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
        ? new Map((await inChunks([...new Set(attempts.map((row) => row.assessment_id))], async (chunk) => check<{ id: string; title: string; kind: string }[]>(await ctx.db.from('company_assessments').select('id,title,kind').in('id', chunk)))).map((row) => [row.id, row]))
        : new Map();

      const earned = await memberCertificates(ctx, member.id);
      return {
        path: {
          source: path.source, target_level: path.target_level, steps: path.steps.length,
          lessons: path.steps.reduce((sum, step) => sum + step.lessons, 0), done: path.steps.reduce((sum, step) => sum + (step.done ?? 0), 0), weeks: path.estimate.weeks,
        },
        courses: courses.map((course) => ({ ...courseSummary(course), completed: course.lessons.filter((lesson) => progress.some((row) => row.lesson_code === lesson.code && row.status === 'completed')).length })),
        training_certificates: earned.filter((row) => !row.revoked_at).map((row) => ({ code: row.code, kind: row.kind, title: row.title, issued_at: row.issued_at })),
        member: {
          full_name: member.full_name, job_role: member.job_role, seat: member.seat, level: member.level, level_source: member.level_source, level_at: member.level_at,
          target_level: member.target_level, target_date: member.target_date,
          gap: member.target_level && isLevel(member.target_level) ? levelGap(isLevel(member.level) ? member.level : null, member.target_level) : null,
        },
        can_learn: open,
        seat_reason: seatReason(ctx),
        english_url: seatOpen(ctx, member) ? ENGLISH_URL : null,
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
