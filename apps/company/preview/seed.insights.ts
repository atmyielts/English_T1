// Preview data for the insights pages: graded company tests (placement, then a
// progress retest for half the team), hiring candidates, assignments, lesson
// progress, team challenges, live sessions with attendance, and Schood English
// app activity for a few seated people. Plus a canned AI report summary.
import { scoreToLevel } from '../../../packages/company-core/src/mod.ts';
import type { FakeDb } from '../../../supabase/functions/company/testing.ts';
import { findTrack } from '../../../supabase/functions/company/training/tracks/index.ts';
import type { World } from './boot.ts';

type Row = Record<string, unknown>;
const DAY = 86_400_000;
const BAND_MIDDLE: Record<string, number> = { pre_a1: 8, a1: 24, a2: 40, b1: 56, b2: 72, c1: 86, c2: 96 };
const LOWER: Record<string, string> = { a1: 'pre_a1', a2: 'a1', b1: 'a2', b2: 'b1', c1: 'b2', c2: 'c1' };

/** Tashkent date `days` from now as YYYY-MM-DD. */
const localDay = (now: Date, days: number) => new Date(now.getTime() + days * DAY + 5 * 3_600_000).toISOString().slice(0, 10);
/** An instant on a Tashkent day at a local hour. */
const at = (now: Date, days: number, hour: number) => new Date(`${localDay(now, days)}T${String(hour).padStart(2, '0')}:00:00+05:00`).toISOString();

function skills(score: number, seed: number, list: readonly string[]) {
  return Object.fromEntries(list.map((skill, index) => {
    const value = Math.max(2, Math.min(98, Math.round(score + (((seed * 7 + index * 13) % 17) - 8))));
    return [skill, { score: value, level: scoreToLevel(value) }];
  }));
}

export function seed(db: FakeDb, world: World) {
  const { orgId, now, departments } = world;
  const owner = world.personas.owner.id;
  const members = db.rows('company_members').filter((row) => row.org_id === orgId);
  const learners = members.filter((row) => row.status === 'active' && row.role !== 'owner' && row.role !== 'admin');
  let activityId = db.rows('company_activity').reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
  const activity = (row: Row) => db.rows('company_activity').push({ id: ++activityId, org_id: orgId, ref: null, ...row });

  // --- Company tests --------------------------------------------------------
  const placement = crypto.randomUUID(), progress = crypto.randomUUID(), reception = crypto.randomUUID(), salesTest = crypto.randomUUID();
  db.rows('company_assessments').push(
    { id: placement, org_id: orgId, kind: 'placement', title: 'Placement test — all staff', job_role: 'general', skills: ['grammar', 'vocabulary', 'reading', 'listening'], min_level: null, time_limit_minutes: 40, status: 'closed', settings: {}, created_by: owner, created_at: at(now, -44, 9), updated_at: at(now, -30, 9) },
    { id: progress, org_id: orgId, kind: 'progress', title: 'October progress check', job_role: 'general', skills: ['grammar', 'vocabulary', 'reading', 'listening', 'speaking'], min_level: null, time_limit_minutes: 40, status: 'open', settings: {}, created_by: owner, created_at: at(now, -14, 9), updated_at: at(now, -14, 9) },
    { id: reception, org_id: orgId, kind: 'hiring', title: 'Front desk receptionist', job_role: 'hospitality', skills: ['grammar', 'vocabulary', 'listening', 'speaking'], min_level: 'b1', time_limit_minutes: 35, status: 'open', settings: {}, created_by: owner, created_at: at(now, -25, 9), updated_at: at(now, -25, 9) },
    { id: salesTest, org_id: orgId, kind: 'hiring', title: 'Sales associate', job_role: 'sales', skills: ['grammar', 'vocabulary', 'reading', 'writing'], min_level: 'b1', time_limit_minutes: 35, status: 'open', settings: {}, created_by: owner, created_at: at(now, -12, 9), updated_at: at(now, -12, 9) },
  );
  const attempt = (row: Row) => db.rows('company_attempts').push({
    id: crypto.randomUUID(), org_id: orgId, items: [], answers: {}, ai_feedback: {}, integrity: {}, decision: null, notes: null, certificate_code: null,
    candidate_name: null, candidate_email: null, candidate_phone: null, member_id: null, user_id: null, ...row,
  });

  learners.filter((row) => row.level).forEach((member, index) => {
    const level = String(member.level);
    const score = Number(member.level_score ?? BAND_MIDDLE[level]);
    const improved = index % 2 === 0 && LOWER[level];
    const placedLevel = improved ? LOWER[level] : level;
    const placedScore = improved ? Math.max(4, score - 11 - (index % 4)) : score;
    const placedAt = at(now, -43 + (index % 3), 10 + (index % 6));
    attempt({
      assessment_id: placement, member_id: member.id, user_id: member.user_id, status: 'graded', started_at: placedAt, deadline_at: placedAt,
      submitted_at: placedAt, graded_at: placedAt, overall_level: scoreToLevel(placedScore) === placedLevel ? placedLevel : scoreToLevel(placedScore), overall_score: placedScore,
      skill_results: skills(placedScore, index, ['grammar', 'vocabulary', 'reading', 'listening']), certificate_code: `SRHP${String(index).padStart(4, '0')}`,
    });
    activity({ member_id: member.id, user_id: member.user_id, kind: 'test', minutes: 38, points: 40, ref: `attempt:placement:${index}`, created_at: placedAt });
    if (improved) {
      const retestAt = at(now, -12 + (index % 9), 11 + (index % 5));
      attempt({
        assessment_id: progress, member_id: member.id, user_id: member.user_id, status: 'graded', started_at: retestAt, deadline_at: retestAt,
        submitted_at: retestAt, graded_at: retestAt, overall_level: scoreToLevel(score), overall_score: score,
        skill_results: skills(score, index + 3, ['grammar', 'vocabulary', 'reading', 'listening', 'speaking']), certificate_code: `SRHQ${String(index).padStart(4, '0')}`,
      });
      member.level = scoreToLevel(score);
      member.level_source = 'progress';
      member.level_at = retestAt;
      activity({ member_id: member.id, user_id: member.user_id, kind: 'test', minutes: 40, points: 40, ref: `attempt:progress:${index}`, created_at: retestAt });
    } else {
      member.level_at = placedAt;
      member.level_source = 'placement';
    }
  });
  // One retest still waiting for the AI to grade speaking.
  const waiting = learners.find((row) => !row.level);
  if (waiting) attempt({ assessment_id: placement, member_id: waiting.id, user_id: waiting.user_id, status: 'started', started_at: at(now, -1, 15), deadline_at: at(now, -1, 16), skill_results: {} });

  const candidates: [string, string, string | null, number | null, string | null, number][] = [
    ['Laylo Abdullayeva', 'reception', 'b2', 71, 'shortlist', -18],
    ['Shohruh Karimov', 'reception', 'b1', 52, null, -9],
    ['Dmitriy Lee', 'reception', 'a2', 37, 'reject', -15],
    ['Madina Rakhimova', 'reception', 'b1', 58, 'hold', -7],
    ['Javlon Tursunov', 'reception', 'c1', 83, null, -3],
    ['Sevara Nazarova', 'reception', null, null, null, -1],
    ['Akmal Ismoilov', 'sales', 'b1', 49, null, -5],
    ['Nargiza Xolmatova', 'sales', 'b2', 68, 'shortlist', -8],
    ['Rustam Yuldashev', 'sales', 'a2', 34, 'reject', -10],
  ];
  candidates.forEach(([name, test, level, score, decision, days], index) => {
    const started = at(now, days, 10 + (index % 7));
    attempt({
      assessment_id: test === 'reception' ? reception : salesTest, candidate_name: name, candidate_email: `${name.split(' ')[0].toLowerCase()}@mail.example`, candidate_phone: '+998 90 000 00 00',
      status: level ? 'graded' : 'submitted', started_at: started, deadline_at: started, submitted_at: started, graded_at: level ? started : null,
      overall_level: level, overall_score: score, decision, skill_results: score ? skills(score, index + 5, ['grammar', 'vocabulary', 'listening', 'speaking']) : {},
      certificate_code: level ? `SRHC${String(index).padStart(4, '0')}` : null,
    });
  });

  // --- Training ---------------------------------------------------------------
  db.rows('company_assignments').push(
    { id: crypto.randomUUID(), org_id: orgId, track_code: 'hospitality', target_level: 'b1', due_date: localDay(now, 24), department_id: departments.front, member_id: null, note: 'Front office: Foundation stage before the high season.', status: 'active', created_by: owner, created_at: at(now, -30, 9), updated_at: at(now, -30, 9) },
    { id: crypto.randomUUID(), org_id: orgId, track_code: 'sales', target_level: 'b2', due_date: localDay(now, -4), department_id: departments.sales, member_id: null, note: null, status: 'active', created_by: owner, created_at: at(now, -40, 9), updated_at: at(now, -40, 9) },
    { id: crypto.randomUUID(), org_id: orgId, track_code: 'banking_finance', target_level: null, due_date: localDay(now, 45), department_id: departments.finance, member_id: null, note: null, status: 'active', created_by: owner, created_at: at(now, -20, 9), updated_at: at(now, -20, 9) },
  );
  // seed.training gives the employee and manager personas their own progress and everyone
  // else foundation lessons, so these are real professional-stage lessons that cannot clash.
  const trainingPersonas = new Set<string>([world.personas.employee.id, world.personas.manager.id]);
  learners.filter((row) => row.consent_at && row.user_id && !trainingPersonas.has(String(row.user_id))).forEach((member, index) => {
    const track = findTrack(String(member.job_role)) ?? findTrack('general')!;
    const lessons = track.lessons.filter((entry) => entry.stage === 'professional');
    const done = 2 + (index % 5);
    for (let lesson = 1; lesson <= Math.min(done + 1, lessons.length); lesson++) {
      const completed = lesson <= done;
      const when = at(now, -36 + lesson * 6 + (index % 4), 9 + (lesson % 8));
      db.rows('company_lesson_progress').push({
        id: crypto.randomUUID(), org_id: orgId, member_id: member.id, user_id: member.user_id, track_code: track.code, lesson_code: lessons[lesson - 1].code,
        status: completed ? 'completed' : 'started', score: completed ? 62 + ((index * 11 + lesson * 7) % 36) : null, minutes: completed ? 14 + ((index + lesson) % 9) : 6,
        attempts: 1, data: {}, completed_at: completed ? when : null, created_at: when, updated_at: when,
      });
    }
  });

  // --- Team challenges --------------------------------------------------------
  db.rows('company_challenges').push(
    { id: crypto.randomUUID(), org_id: orgId, title: 'Autumn learning sprint', description: 'Every lesson, role-play and live session counts. The department with the best average per person wins the team breakfast.', metric: 'points', starts_on: localDay(now, -13), ends_on: localDay(now, 14), department_ids: [], ended_at: null, created_by: owner, created_at: at(now, -15, 9), updated_at: at(now, -15, 9) },
    { id: crypto.randomUUID(), org_id: orgId, title: 'Guest phone calls week', description: 'Front office: five job-role lessons on phone English.', metric: 'lessons', starts_on: localDay(now, 5), ends_on: localDay(now, 11), department_ids: [departments.front], ended_at: null, created_by: owner, created_at: at(now, -2, 9), updated_at: at(now, -2, 9) },
    { id: crypto.randomUUID(), org_id: orgId, title: 'September minutes challenge', description: null, metric: 'minutes', starts_on: localDay(now, -42), ends_on: localDay(now, -21), department_ids: [], ended_at: null, created_by: owner, created_at: at(now, -43, 9), updated_at: at(now, -43, 9) },
  );

  // --- Live sessions ------------------------------------------------------------
  const past = crypto.randomUUID();
  db.rows('company_sessions').push(
    { id: crypto.randomUUID(), org_id: orgId, title: 'Handling guest complaints', kind: 'workshop', trainer: 'Schood trainer', starts_at: at(now, 2, 15), duration_minutes: 90, location: 'Training room, 3rd floor', link: null, department_ids: [departments.front], member_ids: [], notes: 'Bring one real complaint you handled this month.', status: 'scheduled', created_by: owner, created_at: at(now, -5, 9), updated_at: at(now, -5, 9) },
    { id: crypto.randomUUID(), org_id: orgId, title: 'Business email basics', kind: 'class', trainer: null, starts_at: at(now, 6, 11), duration_minutes: 60, location: null, link: 'https://meet.example.com/schood-email', department_ids: [], member_ids: [], notes: null, status: 'scheduled', created_by: owner, created_at: at(now, -3, 9), updated_at: at(now, -3, 9) },
    { id: past, org_id: orgId, title: 'Phone English for the front desk', kind: 'class', trainer: 'Schood trainer', starts_at: at(now, -6, 15), duration_minutes: 60, location: 'Training room, 3rd floor', link: null, department_ids: [departments.front, departments.sales], member_ids: [], notes: null, status: 'scheduled', created_by: owner, created_at: at(now, -12, 9), updated_at: at(now, -12, 9) },
  );
  learners.filter((row) => row.department_id === departments.front || row.department_id === departments.sales).forEach((member, index) => {
    if (index % 3 === 2) return;
    db.rows('company_session_attendance').push({ session_id: past, org_id: orgId, member_id: member.id, user_id: member.user_id, marked_by: owner, marked_at: at(now, -6, 17) });
    activity({ member_id: member.id, user_id: member.user_id, kind: 'session', minutes: 60, points: 60, ref: `session:${past}`, created_at: at(now, -6, 16) });
  });

  // --- Schood English app (seated, consenting people) -------------------------
  const english = '0e000000-0000-4000-8000-0000000000e1';
  db.rows('languages').push({ id: english, code: 'en' });
  const services = ['reading', 'listening', 'grammar', 'vocabulary', 'speaking', 'writing'];
  learners.filter((row) => row.seat && row.user_id).forEach((member, index) => {
    db.rows('learner_language_goals').push({ user_id: member.user_id, language_id: english, current_cefr_estimate: String(member.level ?? 'a2').toUpperCase(), target_cefr: String(member.target_level ?? 'b1').toUpperCase(), daily_time_minutes: 15 + (index % 3) * 5 });
    for (let back = 40; back >= 0; back--) {
      if ((back + index) % 3 === 0) continue;
      const skill = services[(back + index) % services.length];
      db.rows('learning_attempts').push({
        id: crypto.randomUUID(), user_id: member.user_id, language_id: english, content_item_id: `item-${skill}-${(back * 3 + index) % 11}`, service_key: skill,
        status: 'scored', time_spent_seconds: 240 + ((back * 37 + index * 53) % 600), correctness_ratio: 0.5 + ((back + index * 3) % 5) / 10,
        overall_score: null, submitted_at: at(now, -back, 19 + (index % 3)),
      });
    }
  });

  // --- Required levels, spend, saved reports (analytics pages) ------------------
  const requirement = (row: Row) => db.rows('company_level_requirements').push({ id: crypto.randomUUID(), org_id: orgId, job_role: null, department_id: null, skills: {}, due_date: null, source: 'hr', note: null, created_by: owner, ...row });
  requirement({ job_role: 'hospitality', level: 'b1', skills: { speaking: 'b1', listening: 'b1' }, due_date: localDay(now, 75), source: 'suggestion' });
  requirement({ job_role: 'sales', level: 'b2', skills: { speaking: 'b2' }, due_date: localDay(now, 20) });
  requirement({ job_role: 'banking_finance', level: 'b1', skills: { reading: 'b1' }, due_date: localDay(now, -5), note: 'Agreed with the finance director' });
  requirement({ level: 'a2' });

  const spend = (days: number, amount: number, currency: string, category: string, description: string | null) => db.rows('company_training_spend').push({ id: crypto.randomUUID(), org_id: orgId, spent_on: localDay(now, days), amount, currency, category, description, created_by: owner, created_at: at(now, days, 12) });
  spend(-40, 18_000_000, 'UZS', 'schood', 'Seats, first quarter');
  spend(-12, 6_500_000, 'UZS', 'trainer', 'Live workshop: guest complaints');
  spend(-3, 1_200_000, 'UZS', 'materials', 'Printed glossaries');
  spend(-20, 400, 'USD', 'other', 'Speaking club hosts');

  const view = (name: string, config: Row) => db.rows('company_saved_views').push({ id: crypto.randomUUID(), org_id: orgId, name, config, created_by: owner, created_at: at(now, -9, 10), updated_at: at(now, -9, 10) });
  view('Board pack: departments', { rows: 'department', columns: ['people', 'tested', 'avg_level', 'compliance_pct', 'moved_up', 'active', 'hours'], filters: { department_ids: [], job_roles: [], levels: [], seat: 'any' }, period: { preset: 'last_90' } });
  view('Monthly activity', { rows: 'month', columns: ['active', 'hours', 'lessons', 'tests_graded', 'sessions_attended'], filters: { department_ids: [], job_roles: [], levels: [], seat: 'any' }, period: { preset: 'this_year' } });

  // --- Challenge and session depth ------------------------------------------------
  const september = db.rows('company_challenges').find((row) => row.title === 'September minutes challenge');
  if (september) september.prize = 'Lunch with the general manager';
  const cupStart = localDay(now, -6);
  db.rows('company_challenges').push({
    id: crypto.randomUUID(), org_id: orgId, title: 'Department cup', description: 'Departments team up. The team with the most points per person wins, so size gives no advantage.', metric: 'points', starts_on: cupStart, ends_on: localDay(now, 21),
    department_ids: [departments.front, departments.sales, departments.finance], ended_at: null, created_by: owner, created_at: at(now, -7, 10), updated_at: at(now, -7, 10), template: 'department_cup', mode: 'teams', prize: 'Team dinner',
    teams: [{ id: 'team-1', name: 'Front of house', department_ids: [departments.front] }, { id: 'team-2', name: 'Back office', department_ids: [departments.sales, departments.finance] }], final_results: null, finished_at: null,
  });
  const series = crypto.randomUUID();
  for (let week = 0; week < 4; week++) {
    db.rows('company_sessions').push({
      id: crypto.randomUUID(), org_id: orgId, title: 'Weekly speaking club', kind: 'class', trainer: 'Schood trainer', starts_at: at(now, 3 + week * 7, 17), duration_minutes: 45, location: 'Room 2', link: null,
      department_ids: [departments.front], member_ids: [], notes: 'Bring a real guest situation from this week.', status: 'scheduled', created_by: owner, created_at: at(now, -2, 10), updated_at: at(now, -2, 10), series_id: series, trainer_notes: null,
    });
  }
  const pastSession = db.rows('company_sessions').find((row) => row.id === past);
  if (pastSession) pastSession.trainer_notes = 'Covered greetings and holding a call. Next time: taking messages accurately.';
}

/** Canned AI summary built from the report numbers it is sent. */
export const ai = {
  'company-executive-narrative': (payload: unknown) => {
    const data = payload as { people: { people: number; tested: number }; compliance: { with_requirement: number; meets: number }; activity: { active: number; minutes: number }; level_movement: { up: number } };
    return {
      headline: `${data.compliance.meets} of ${data.compliance.with_requirement} people meet the level their job requires`,
      paragraphs: [`${data.people.tested} of ${data.people.people} people have a tested level. ${data.activity.active} learners were active for ${Math.round(data.activity.minutes / 60)} hours this month, and ${data.level_movement.up} moved up a level.`],
    };
  },
  'company-report-summary': (payload: unknown) => {
    const data = payload as { people: number; active_learners: number; sharing_progress: number; minutes: number; lessons: number; level_movement: { up: number; first_test: number }; departments: { name: string; minutes: number }[]; hiring: { graded: number; waiting_for_decision: number } | null; training: { overdue: number } };
    const best = [...data.departments].sort((a, b) => b.minutes - a.minutes)[0];
    const hours = Math.round(data.minutes / 6) / 10;
    return {
      headline: `${data.active_learners} of ${data.sharing_progress} sharing learners were active; ${data.level_movement.up} moved up a level`,
      paragraphs: [
        `People spent ${hours} hours learning and completed ${data.lessons} job-role lessons. ${best ? `${best.name} led with ${Math.round(best.minutes / 60)} hours.` : ''}`,
        `${data.level_movement.up} people moved up at least one level on a company retest${data.level_movement.first_test ? ` and ${data.level_movement.first_test} were tested for the first time` : ''}.${data.hiring ? ` ${data.hiring.graded} candidates were graded and ${data.hiring.waiting_for_decision} are waiting for a decision.` : ''}`,
      ],
      actions: [
        data.training.overdue ? `Follow up on ${data.training.overdue} overdue assignment(s) with the department managers.` : 'Set the next assignment with a due date for each department.',
        'Invite people who have not agreed to share progress to do so, so the report covers the whole team.',
        data.hiring && data.hiring.waiting_for_decision ? 'Decide on the candidates who are waiting, so good ones are not lost.' : 'Plan a progress retest for people who have studied for a month.',
      ],
    };
  },
};
