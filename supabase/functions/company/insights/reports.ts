// Reports (/w/:org/reports): the monthly report for any date range, CSV
// exports of people, attempts and activity, and an optional AI-written
// summary of the report's numbers (feature company-report-summary).
import { isLevel, LEAD_ROLES, levelIndex, SKILLS, type Level } from '../../../../packages/company-core/src/mod.ts';
import { consumeAi } from '../core.ts';
import { check, type Ctx, type MemberRow, type Route } from '../types.ts';
import { obj, oneOf } from '../util.ts';
import {
  activitySummary, addDays, averageScore, csv, displayName, emptyLevels, fetchAll, gradedStaffAttempts, isLearner, levelsAt, loadScope,
  localDate, meetsTarget, memberScore, parseRange, sharingIds, weekOf, type GradedAttempt, type Range,
} from './common.ts';
import type { AssignmentRow } from './overview.ts';

interface AssessmentRow { id: string; kind: string; title: string; min_level: string | null }
interface CandidateAttempt { id: string; assessment_id: string; status: string; overall_level: string | null; decision: string | null; graded_at: string | null }
interface ProgressRow { member_id: string; track_code: string; completed_at: string }

const atLeast = (level: string | null, min: string | null) => isLevel(level) && isLevel(min) && levelIndex(level) >= levelIndex(min);

export async function buildReport(ctx: Ctx, range: Range) {
  const org = ctx.org!;
  const { viewer, members, departments, department } = await loadScope(ctx);
  const active = members.filter((member) => member.status === 'active');
  const scopeIds = new Set(members.map((member) => member.id));
  const sharing = sharingIds(active);
  const sharingSet = new Set(sharing);
  const [summary, allAttempts, assessments, candidates, assignmentRows, progress] = await Promise.all([
    activitySummary(ctx.db, org.id, range.start, range.end, sharing),
    gradedStaffAttempts(ctx.db, org.id, range.end),
    check<AssessmentRow[]>(await ctx.db.from('company_assessments').select('id,kind,title,min_level').eq('org_id', org.id).order('created_at', { ascending: false }).limit(1000)),
    viewer.hr ? fetchAll<CandidateAttempt>(() => ctx.db.from('company_attempts').select('id,assessment_id,status,overall_level,decision,graded_at').eq('org_id', org.id).is('member_id', null)
      .gte('started_at', range.start.toISOString()).lt('started_at', range.end.toISOString()).order('id'), 20_000) : [],
    fetchAll<AssignmentRow>(() => ctx.db.from('company_assignments').select('id,track_code,target_level,due_date,department_id,member_id,status,note,created_at').eq('org_id', org.id).neq('status', 'cancelled').lt('created_at', range.end.toISOString()).order('id'), 5000),
    fetchAll<ProgressRow>(() => ctx.db.from('company_lesson_progress').select('member_id,track_code,completed_at').eq('org_id', org.id).eq('status', 'completed')
      .gte('completed_at', range.start.toISOString()).lt('completed_at', range.end.toISOString()).order('id'), 50_000),
  ]);
  const attempts = allAttempts.filter((attempt) => attempt.member_id && scopeIds.has(attempt.member_id));
  const lessons = progress.filter((row) => sharingSet.has(row.member_id));
  const totals = new Map(summary.members.map((row) => [row.member_id, row]));
  const departmentName = new Map(departments.map((entry) => [entry.id, entry.name]));

  // Level movement between the start and the end of the range (company tests).
  const before = levelsAt(attempts, range.start), after = levelsAt(attempts, range.end);
  const startCounts = emptyLevels(), endCounts = emptyLevels();
  let up = 0, same = 0, down = 0, first = 0;
  const movedUp = new Set<string>();
  const improvers: { member: MemberRow; from: GradedAttempt | null; to: GradedAttempt; delta: number }[] = [];
  for (const member of active) {
    const from = before.get(member.id) ?? null, to = after.get(member.id) ?? null;
    if (from) startCounts[from.overall_level as Level] += 1;
    if (to) endCounts[to.overall_level as Level] += 1;
    else if (isLearner(member)) endCounts.none += 1;
    if (!from && isLearner(member)) startCounts.none += 1;
    if (!to) continue;
    // Tested for the first time in the period: the first result in it is the baseline.
    const baseline = from ?? attempts.find((attempt) => attempt.member_id === member.id && Date.parse(attempt.graded_at!) >= range.start.getTime());
    if (!from) first += 1;
    if (!baseline || baseline.id === to.id) { if (from) same += 1; continue; }
    const change = levelIndex(to.overall_level as Level) - levelIndex(baseline.overall_level as Level);
    if (change > 0) { up += 1; movedUp.add(member.id); } else if (change < 0) down += 1; else same += 1;
    const delta = Number(to.overall_score) - Number(baseline.overall_score);
    if (Number.isFinite(delta) && (delta > 0 || change > 0)) improvers.push({ member, from: baseline, to, delta: Math.round(delta * 10) / 10 });
  }
  improvers.sort((a, b) => (levelIndex(b.to.overall_level as Level) - levelIndex(b.from!.overall_level as Level)) - (levelIndex(a.to.overall_level as Level) - levelIndex(a.from!.overall_level as Level)) || b.delta - a.delta);

  const groups: { id: string | null; name: string | null }[] = departments.map((entry) => ({ id: entry.id, name: entry.name }));
  if (viewer.hr && active.some((member) => !member.department_id)) groups.push({ id: null, name: null });
  const departmentRows = groups.map((group) => {
    const people = active.filter((member) => (member.department_id ?? null) === group.id);
    const ends = people.map((member) => after.get(member.id)).filter(Boolean) as GradedAttempt[];
    const targeted = people.filter((member) => isLevel(member.target_level));
    return {
      id: group.id, name: group.name, people: people.length,
      active: people.filter((member) => (totals.get(member.id)?.events ?? 0) > 0).length,
      sharing: people.filter((member) => sharingSet.has(member.id)).length,
      minutes: people.reduce((sum, member) => sum + (totals.get(member.id)?.minutes ?? 0), 0),
      lessons: people.reduce((sum, member) => sum + (totals.get(member.id)?.lessons ?? 0), 0),
      tested: ends.length,
      avg: averageScore(ends.map((attempt) => attempt.overall_score)),
      moved_up: people.filter((member) => movedUp.has(member.id)).length,
      with_target: targeted.length,
      at_target: targeted.filter((member) => meetsTarget(member.level, member.target_level)).length,
    };
  });

  // Hiring funnel (HR only).
  const hiringTests = assessments.filter((row) => row.kind === 'hiring');
  const testById = new Map(assessments.map((row) => [row.id, row]));
  const funnel = (rows: CandidateAttempt[]) => {
    const graded = rows.filter((row) => row.status === 'graded');
    return {
      started: rows.length,
      finished: rows.filter((row) => row.status === 'submitted' || row.status === 'graded').length,
      graded: graded.length,
      meets_min: graded.filter((row) => atLeast(row.overall_level, testById.get(row.assessment_id)?.min_level ?? null)).length,
      with_min: graded.filter((row) => isLevel(testById.get(row.assessment_id)?.min_level)).length,
      shortlisted: rows.filter((row) => row.decision === 'shortlist').length,
      held: rows.filter((row) => row.decision === 'hold').length,
      rejected: rows.filter((row) => row.decision === 'reject').length,
      waiting: graded.filter((row) => !row.decision).length,
    };
  };
  const hiringRows = candidates.filter((row) => testById.get(row.assessment_id)?.kind === 'hiring');
  const hiring = viewer.hr ? {
    ...funnel(hiringRows),
    by_test: hiringTests.map((test) => ({ id: test.id, title: test.title, min_level: test.min_level, ...funnel(hiringRows.filter((row) => row.assessment_id === test.id)) })).filter((row) => row.started > 0),
  } : null;

  // Training: what HR asked for and how people are doing on it.
  const assigneesOf = (row: AssignmentRow) => active.filter((member) => row.member_id ? member.id === row.member_id : row.department_id ? member.department_id === row.department_id : isLearner(member));
  const assignments = assignmentRows
    .filter((row) => viewer.hr || (row.department_id && row.department_id === viewer.departmentId) || (row.member_id && scopeIds.has(row.member_id)))
    .map((row) => {
      const people = assigneesOf(row);
      const shared = people.filter((member) => sharingSet.has(member.id));
      const done = row.track_code ? lessons.filter((lesson) => lesson.track_code === row.track_code && shared.some((member) => member.id === lesson.member_id)) : [];
      return {
        id: row.id, track_code: row.track_code, target_level: row.target_level, due_date: row.due_date, status: row.status,
        department: row.department_id ? departmentName.get(row.department_id) ?? null : null,
        person: row.member_id ? displayName(people[0] ?? { full_name: null, email: null }) : null,
        assignees: people.length, sharing: shared.length,
        learners: new Set(done.map((lesson) => lesson.member_id)).size, lessons: done.length,
        target_met: row.target_level ? people.filter((member) => meetsTarget(member.level, row.target_level)).length : null,
        overdue: row.status === 'active' && Boolean(row.due_date && row.due_date < localDate(ctx.now())),
      };
    });
  const byTrack = new Map<string, { track_code: string; lessons: number; learners: Set<string> }>();
  for (const lesson of lessons) {
    const entry = byTrack.get(lesson.track_code) ?? { track_code: lesson.track_code, lessons: 0, learners: new Set<string>() };
    entry.lessons += 1; entry.learners.add(lesson.member_id);
    byTrack.set(lesson.track_code, entry);
  }

  const weeks = [];
  for (let week = weekOf(range.from); week <= range.to; week = addDays(week, 7)) {
    const found = summary.weeks.find((row) => row.week === week);
    weeks.push({ week, minutes: found?.minutes ?? 0, learners: found?.learners ?? 0, events: found?.events ?? 0 });
  }
  const mostActive = summary.members.filter((row) => row.minutes > 0).sort((a, b) => b.minutes - a.minutes).slice(0, 5)
    .map((row) => { const member = active.find((entry) => entry.id === row.member_id)!; return { member_id: row.member_id, name: displayName(member), department: member.department_id ? departmentName.get(member.department_id) ?? null : null, minutes: row.minutes, lessons: row.lessons, days: row.days }; });
  const withTarget = active.filter((member) => isLevel(member.target_level));
  const gradedInRange = attempts.filter((attempt) => Date.parse(attempt.graded_at!) >= range.start.getTime()).length;

  return {
    range: { from: range.from, to: range.to, days: range.days },
    generated_at: ctx.now().toISOString(),
    org: { name: org.name, industry: org.industry },
    scope: { department, unassigned: viewer.manager && !viewer.departmentId },
    summary: {
      people: active.length, learners: active.filter(isLearner).length, sharing: sharing.length,
      active: summary.members.filter((row) => row.events > 0).length,
      minutes: summary.members.reduce((sum, row) => sum + row.minutes, 0),
      lessons: summary.members.reduce((sum, row) => sum + row.lessons, 0),
      tests_graded: gradedInRange + candidates.filter((row) => row.status === 'graded' && row.graded_at && Date.parse(row.graded_at) < range.end.getTime()).length,
      staff_tests: gradedInRange,
      avg_start: averageScore([...before.values()].filter((attempt) => scopeIds.has(attempt.member_id!)).map((attempt) => attempt.overall_score)),
      avg_end: averageScore([...after.values()].filter((attempt) => scopeIds.has(attempt.member_id!)).map((attempt) => attempt.overall_score)),
      current_avg: averageScore(active.filter((member) => isLevel(member.level)).map(memberScore)),
      with_target: withTarget.length, at_target: withTarget.filter((member) => meetsTarget(member.level, member.target_level)).length,
    },
    kinds: summary.kinds,
    weeks,
    movement: { up, same, down, first, start: startCounts, end: endCounts },
    departments: departmentRows,
    improvers: improvers.slice(0, 5).map(({ member, from, to, delta }) => ({
      member_id: member.id, name: displayName(member), department: member.department_id ? departmentName.get(member.department_id) ?? null : null,
      from_level: from!.overall_level, to_level: to.overall_level, from_score: from!.overall_score === null ? null : Number(from!.overall_score), to_score: to.overall_score === null ? null : Number(to.overall_score), delta,
    })),
    most_active: mostActive,
    hiring,
    training: {
      assignments,
      lessons_completed: lessons.length,
      learners: new Set(lessons.map((lesson) => lesson.member_id)).size,
      by_track: [...byTrack.values()].map((entry) => ({ track_code: entry.track_code, lessons: entry.lessons, learners: entry.learners.size })).sort((a, b) => b.lessons - a.lessons),
    },
  };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;

// ---------------------------------------------------------------------------
// CSV exports
// ---------------------------------------------------------------------------

const EXPORTS = ['people', 'attempts', 'activity'] as const;
type ExportKind = (typeof EXPORTS)[number];
const stamp = (value: string | null | undefined) => value ? new Date(Date.parse(value) + 5 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ') : '';

async function exportCsv(ctx: Ctx, kind: ExportKind, range: Range): Promise<{ filename: string; csv: string; rows: number; truncated: boolean }> {
  const org = ctx.org!;
  const { viewer, members, departments } = await loadScope(ctx);
  const departmentName = new Map(departments.map((entry) => [entry.id, entry.name]));
  const dept = (member: MemberRow | undefined) => member?.department_id ? departmentName.get(member.department_id) ?? '' : '';
  const byId = new Map(members.map((member) => [member.id, member]));
  const sharing = sharingIds(members);
  const filename = `schood-company-${kind}-${range.from}-${range.to}.csv`;

  if (kind === 'people') {
    const summary = await activitySummary(ctx.db, org.id, range.start, range.end, sharing);
    const totals = new Map(summary.members.map((row) => [row.member_id, row]));
    const rows = [...members].sort((a, b) => displayName(a).localeCompare(displayName(b))).map((member) => {
      const shared = sharing.includes(member.id), total = totals.get(member.id);
      return [
        displayName(member), member.email, member.role, dept(member), member.job_role, member.status, member.seat ? 'yes' : 'no',
        member.level ?? '', member.level_score ?? '', member.level_source ?? '', member.level_at?.slice(0, 10) ?? '', member.target_level ?? '', member.target_date ?? '',
        member.consent_at ? 'yes' : 'no', member.joined_at?.slice(0, 10) ?? '',
        shared ? total?.minutes ?? 0 : '', shared ? total?.lessons ?? 0 : '', shared ? total?.points ?? 0 : '', shared ? total?.days ?? 0 : '', shared ? stamp(total?.last_at) : '',
      ];
    });
    return { filename, rows: rows.length, truncated: false, csv: csv(['name', 'email', 'role', 'department', 'job_role', 'status', 'seat', 'level', 'level_score', 'level_source', 'level_date', 'target_level', 'target_date', 'shares_progress', 'joined', 'minutes', 'lessons', 'points', 'active_days', 'last_active'], rows) };
  }

  if (kind === 'attempts') {
    const CAP = 20_000;
    const [rows, assessments] = await Promise.all([
      fetchAll<Record<string, unknown>>(() => {
        let query = ctx.db.from('company_attempts').select('id,assessment_id,member_id,candidate_name,candidate_email,candidate_phone,status,started_at,graded_at,overall_level,overall_score,skill_results,decision,certificate_code')
          .eq('org_id', org.id).gte('started_at', range.start.toISOString()).lt('started_at', range.end.toISOString());
        if (!viewer.hr) query = query.not('member_id', 'is', null);
        return query.order('started_at').order('id');
      }, CAP),
      check<AssessmentRow[]>(await ctx.db.from('company_assessments').select('id,kind,title,min_level').eq('org_id', org.id).limit(1000)),
    ]);
    const tests = new Map(assessments.map((row) => [row.id, row]));
    const visible = rows.filter((row) => row.member_id ? byId.has(String(row.member_id)) : viewer.hr);
    const lines = visible.map((row) => {
      const member = row.member_id ? byId.get(String(row.member_id)) : undefined;
      const skills = (row.skill_results ?? {}) as Record<string, { score?: unknown }>;
      const test = tests.get(String(row.assessment_id));
      return [
        stamp(String(row.started_at)), stamp(row.graded_at as string | null), test?.kind ?? '', test?.title ?? '',
        member ? displayName(member) : row.candidate_name ?? '', member ? member.email : row.candidate_email ?? '', member ? '' : row.candidate_phone ?? '', member ? dept(member) : '',
        member ? 'staff' : 'candidate', row.status, row.overall_level ?? '', row.overall_score ?? '',
        ...SKILLS.map((skill) => skills[skill]?.score ?? ''), row.decision ?? '', row.certificate_code ?? '',
      ];
    });
    return { filename, rows: lines.length, truncated: rows.length >= CAP, csv: csv(['started', 'graded', 'test_type', 'test', 'name', 'email', 'phone', 'department', 'person_type', 'status', 'level', 'score', ...SKILLS, 'decision', 'certificate'], lines) };
  }

  // Activity: one line per event, only for people who share their progress.
  const CAP = 50_000;
  const allowed = new Set(sharing);
  const rows = await fetchAll<{ member_id: string | null; kind: string; minutes: number; points: number; created_at: string }>(() => ctx.db.from('company_activity')
    .select('member_id,kind,minutes,points,created_at').eq('org_id', org.id).gte('created_at', range.start.toISOString()).lt('created_at', range.end.toISOString()).order('created_at').order('id'), CAP);
  const lines = rows.filter((row) => row.member_id && allowed.has(row.member_id)).map((row) => {
    const member = byId.get(row.member_id!)!;
    return [stamp(row.created_at), displayName(member), member.email, dept(member), row.kind, row.minutes, row.points];
  });
  return { filename, rows: lines.length, truncated: rows.length >= CAP, csv: csv(['time_tashkent', 'name', 'email', 'department', 'kind', 'minutes', 'points'], lines) };
}

// ---------------------------------------------------------------------------
// AI summary
// ---------------------------------------------------------------------------

export interface ReportSummary { headline: string; paragraphs: string[]; actions: string[] }
const LANGUAGES = { en: 'English', ru: 'Russian', uz: 'Uzbek (Latin script, use the ‘ apostrophe as in o‘ and g‘)' } as const;

/** Only numbers and department names go to the AI: no names or contacts of people. */
export function summaryPayload(report: Report) {
  const { summary, movement, departments, hiring, training, kinds, range, scope } = report;
  return {
    period: range, company_industry: report.org.industry, scope: scope.department ? `department ${scope.department.name}` : 'whole company',
    people: summary.people, sharing_progress: summary.sharing, active_learners: summary.active, minutes: summary.minutes, lessons: summary.lessons,
    tests_graded: summary.tests_graded, average_level_start: summary.avg_start, average_level_end: summary.avg_end,
    at_target: summary.at_target, with_target: summary.with_target,
    level_movement: { up: movement.up, same: movement.same, down: movement.down, first_test: movement.first }, activity_by_kind: kinds,
    departments: departments.map((row) => ({ name: row.name ?? 'no department', people: row.people, active: row.active, minutes: row.minutes, lessons: row.lessons, average_score: row.avg.score, moved_up: row.moved_up, at_target: row.at_target, with_target: row.with_target })),
    hiring: hiring ? { started: hiring.started, graded: hiring.graded, meets_minimum: hiring.meets_min, shortlisted: hiring.shortlisted, rejected: hiring.rejected, waiting_for_decision: hiring.waiting } : null,
    training: { lessons_completed: training.lessons_completed, learners: training.learners, assignments: training.assignments.length, overdue: training.assignments.filter((row) => row.overdue).length },
  };
}

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/reports/monthly', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      return await buildReport(ctx, parseRange(query, ctx.now()));
    },
  },
  {
    method: 'GET', path: 'orgs/:org/reports/export', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const kind = oneOf<ExportKind>(query.get('kind'), EXPORTS, 'kind');
      const result = await exportCsv(ctx, kind, parseRange(query, ctx.now()));
      await ctx.audit('report.exported', kind, { from: query.get('from'), to: query.get('to'), rows: result.rows });
      return result;
    },
  },
  {
    method: 'POST', path: 'orgs/:org/reports/summary', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, _params, body) {
      const input = obj(body ?? {});
      const locale = oneOf(input.locale, ['en', 'ru', 'uz'] as const, 'locale', 'en');
      const report = await buildReport(ctx, parseRange(input, ctx.now()));
      if (!(await consumeAi(ctx))) return { status: 'limit', summary: null };
      const fallback: ReportSummary = { headline: '', paragraphs: [], actions: [] };
      const result = await ctx.ai<ReportSummary>({
        feature: 'company-report-summary',
        userId: ctx.user,
        temperature: 0.3,
        systemPrompt: [
          'You write the summary at the top of a monthly English-training report for the HR team of a company in Uzbekistan or Central Asia.',
          'Use only the numbers in the data. Never invent numbers, names, prices or outcomes, and do not promise results.',
          'Levels are Schood estimates on the CEFR scale (scores 0–100), not official certificates. Only people who share their progress are counted in activity.',
          `Write in ${LANGUAGES[locale]}. Be plain, specific and kind; no marketing words.`,
          'Reply with strict JSON only: {"headline": string (max 120 characters), "paragraphs": string[] (2 or 3, each max 400 characters), "actions": string[] (2 to 4 practical next steps for HR, each max 160 characters)}.',
        ].join('\n'),
        userPayload: JSON.stringify(summaryPayload(report)),
      }, fallback);
      if (result.status !== 'ok' || !result.data || typeof result.data !== 'object') return { status: 'unavailable', summary: null };
      const summary: ReportSummary = {
        headline: clean(result.data.headline, 160),
        paragraphs: (Array.isArray(result.data.paragraphs) ? result.data.paragraphs : []).map((value) => clean(value, 600)).filter(Boolean).slice(0, 3),
        actions: (Array.isArray(result.data.actions) ? result.data.actions : []).map((value) => clean(value, 240)).filter(Boolean).slice(0, 4),
      };
      if (!summary.headline && !summary.paragraphs.length) return { status: 'unavailable', summary: null };
      return { status: 'ok', summary, range: report.range, generated_at: ctx.now().toISOString() };
    },
  },
];

