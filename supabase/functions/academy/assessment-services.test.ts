import { deepStrictEqual as equal, ok, rejects, throws } from 'node:assert/strict';
import {
  assessmentProgress,
  assessmentSummary,
  publicAssessmentItems,
  validateAssessmentItems,
  validateAssessmentReport,
} from '../_shared/academy-assessment-core.ts';
import {
  assessmentClassroomAllowed,
  assessmentStudentView,
  handleAssessmentService,
} from './assessment-services.ts';
import type { MembershipRow } from './access.ts';

const items = validateAssessmentItems([
  {
    id: 'g',
    skill: 'grammar',
    kind: 'choice',
    prompt: 'Choose.',
    options: ['a', 'b'],
    correct: 1,
    points: 2,
  },
  {
    id: 'w',
    skill: 'writing',
    kind: 'written',
    prompt: 'Write.',
    rubric: 'Award for clarity, structure and accuracy.',
    points: 8,
  },
]);
const member = (role: string, extra = {}): MembershipRow => ({
  tenant_id: 'a',
  role,
  status: 'active',
  ...extra,
});
Deno.test('papers validate evidence and never expose answer keys to learners', () => {
  equal(publicAssessmentItems(items).some((item) => 'correct' in item), false);
  throws(() => validateAssessmentItems([]));
  throws(() => validateAssessmentItems([items[0], items[0]]), /unique/);
  throws(() => validateAssessmentItems([{ ...items[0], correct: null }]), /choices/);
  throws(() => validateAssessmentItems([{ ...items[0], points: Infinity }]), /marks/);
  throws(() => validateAssessmentItems([{ ...items[0], skill: 'writing' }]), /teacher-reviewed/);
  throws(() => validateAssessmentItems([{ ...items[0], skill: 'listening' }]), /audio/);
  throws(
    () =>
      validateAssessmentItems([{
        ...items[0],
        media_url: 'https://user:password@example.test/a.mp3',
      }]),
    /secure/,
  );
});
Deno.test('missing skills are not zeros and manual work is not marked complete prematurely', () => {
  const pending = assessmentSummary(items, { g: 2 });
  equal(pending.percent, null);
  equal(pending.skills.find((s) => s.skill === 'reading')?.percent, null);
  equal(pending.skills.find((s) => s.skill === 'grammar')?.percent, 100);
  equal(assessmentSummary(items, { g: 2, w: 4 }).percent, 60);
  equal(assessmentSummary(items, { g: 200, w: -4 }).earned, 2);
});
Deno.test('level estimates require evidence and no automatic IELTS/CEFR conversion exists', () => {
  throws(() => validateAssessmentReport({ level: 'B1', basis: 'score' }), /evidence/);
  throws(
    () =>
      validateAssessmentReport({
        level: 'IELTS 6',
        basis: 'Written response only; speaking not assessed.',
      }),
    /level/,
  );
  equal(
    validateAssessmentReport({ basis: 'Written response only; speaking not assessed.' }).level,
    '',
  );
});
Deno.test('progress matches learner, paper and group and uses assessment dates', () => {
  const base = {
    contact_id: 's',
    paper_id: 'p',
    classroom_id: 'g',
    assessed_at: '2026-01-01',
    percent: 30,
  };
  const progress = assessmentProgress([
    { ...base, assessed_at: '2026-03-01', percent: 70 },
    base,
    { ...base, paper_id: 'other', percent: 90 },
    { ...base, contact_id: 'other' },
    { ...base, classroom_id: 'other' },
    { ...base, assessed_at: 'bad', percent: 90 },
  ]);
  equal(progress.length, 1);
  equal(progress[0].baseline, 30);
  equal(progress[0].change, 40);
  equal(progress[0].assessments, 2);
});
Deno.test('students receive only their published report, never draft marks or review notes', () => {
  const candidate = {
    id: 'c',
    status: 'reviewed',
    answers: { g: 1 },
    marks: { g: 2, w: 5 },
    review_notes: 'private',
    report: { basis: 'draft' },
  };
  const draft = assessmentStudentView(candidate, {}, { items });
  equal(draft.report, null);
  equal(draft.summary, null);
  equal('review_notes' in draft, false);
  equal('marks' in draft, false);
  const active = assessmentStudentView(
    { ...candidate, status: 'in_progress' },
    {},
    { items },
    true,
  );
  ok(active.items);
  equal('correct' in active.items[0], false);
  equal('rubric' in active.items[1], false);
  equal(
    assessmentStudentView({ ...candidate, status: 'released' }, {}, { items }).summary?.percent,
    70,
  );
});
Deno.test('branch and teacher scope cannot cross classroom boundaries', () => {
  equal(assessmentClassroomAllowed(member('teacher', { classroom_ids: ['g'] }), { id: 'g' }), true);
  equal(
    assessmentClassroomAllowed(member('teacher', { classroom_ids: ['g'] }), { id: 'other' }),
    false,
  );
  equal(
    assessmentClassroomAllowed(member('branch_manager', { branch_ids: ['b'] }), {
      id: 'g',
      branch_id: 'other',
    }),
    false,
  );
  equal(assessmentClassroomAllowed(member('owner'), undefined), true);
});

// This fluent in-memory double exercises the real Edge handler's authorization,
// tenant predicates and response redaction. SQL behavior is tested separately.
const fixture = () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    tenants: [{ id: 'a', name: 'Center' }],
    academy_classrooms: [{ id: 'g', academy_id: 'a', name: 'Group', branch_id: 'b' }, {
      id: 'other',
      academy_id: 'a',
      name: 'Other',
      branch_id: 'other',
    }],
    academy_contacts: [{ id: 's', academy_id: 'a', first_name: 'Learner' }, {
      id: 'new',
      academy_id: 'a',
      first_name: 'Applicant',
    }, { id: 'secret', academy_id: 'a' }],
    academy_classroom_memberships: [{
      academy_id: 'a',
      classroom_id: 'g',
      contact_id: 's',
      status: 'active',
    }],
    academy_leads: [],
    academy_assessment_papers: [{ id: 'p', academy_id: 'a', created_by: 'teacher', items }],
    academy_assessment_runs: [{ id: 'r', academy_id: 'a', classroom_id: 'g', paper_id: 'p' }, {
      id: 'intake',
      academy_id: 'a',
      classroom_id: null,
      paper_id: 'p',
    }, { id: 'outside', academy_id: 'a', classroom_id: 'other', paper_id: 'p' }],
    academy_assessment_candidates: [
      {
        id: 'c',
        academy_id: 'a',
        run_id: 'r',
        contact_id: 's',
        status: 'reviewed',
        marks: { g: 2, w: 4 },
        answers: { g: 1 },
        report: { basis: 'private' },
      },
      {
        id: 'i',
        academy_id: 'a',
        run_id: 'intake',
        contact_id: 'new',
        status: 'submitted',
        marks: { g: 2 },
        answers: { g: 1 },
      },
      {
        id: 'x',
        academy_id: 'a',
        run_id: 'outside',
        contact_id: 'secret',
        status: 'submitted',
        marks: {},
      },
    ],
  };
  const calls: unknown[] = [];
  const sb = {
    from: (table: string) => {
      let selected = [...(tables[table] ?? [])];
      const chain = {
        select: (_fields: string) => chain,
        eq: (key: string, value: unknown) => {
          selected = selected.filter((r) => r[key] === value);
          return chain;
        },
        in: (key: string, values: unknown[]) => {
          selected = selected.filter((r) => values.includes(r[key]));
          return chain;
        },
        order: () => chain,
        limit: (n: number) => {
          selected = selected.slice(0, n);
          return chain;
        },
        single: () => Promise.resolve({ data: selected[0], error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: selected, error: null }).then(resolve),
      };
      return chain;
    },
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve({ data: {}, error: null });
    },
  };
  return { sb: sb as unknown as Parameters<typeof handleAssessmentService>[0], calls };
};
Deno.test('student cannot impersonate another candidate or academy', async () => {
  const { sb, calls } = fixture();
  await rejects(
    () =>
      handleAssessmentService(
        sb,
        'assessment_student_start',
        { academy_id: 'a', candidate_id: 'x' },
        'student',
        [],
        [{ academy_id: 'a', id: 's' }],
      ),
    /Forbidden/,
  );
  await rejects(
    () =>
      handleAssessmentService(
        sb,
        'assessment_student_start',
        { academy_id: 'other', candidate_id: 'c' },
        'student',
        [],
        [{ academy_id: 'a', id: 's' }],
      ),
    /Forbidden/,
  );
  equal(calls.length, 0);
  const data = await handleAssessmentService(
    sb,
    'assessment_student_list',
    { academy_id: 'a' },
    'student',
    [],
    [{ academy_id: 'a', id: 's' }],
  );
  equal((data.candidates as unknown[]).length, 1);
});
Deno.test('teacher reviews assigned groups and own intake paper, not unrelated groups', async () => {
  const { sb, calls } = fixture();
  const access = [member('teacher', { classroom_ids: ['g'] })];
  const data = await handleAssessmentService(
    sb,
    'assessment_workspace',
    { academy_id: 'a' },
    'teacher',
    access,
  );
  equal((data.candidates as Array<{ id: string }>).map((c) => c.id).sort(), ['c', 'i']);
  await rejects(
    () =>
      handleAssessmentService(
        sb,
        'assessment_release',
        { academy_id: 'a', candidate_id: 'x' },
        'teacher',
        access,
      ),
    /Forbidden/,
  );
  await rejects(
    () =>
      handleAssessmentService(
        sb,
        'assessment_register',
        { academy_id: 'a', run_id: 'r', contact_ids: ['s'] },
        'teacher',
        access,
      ),
    /Forbidden/,
  );
  equal(calls.length, 0);
});
Deno.test('office can organize but cannot see draft results or mark work', async () => {
  const { sb, calls } = fixture();
  const access = [member('manager')];
  const data = await handleAssessmentService(
    sb,
    'assessment_workspace',
    { academy_id: 'a' },
    'manager',
    access,
  );
  const first = (data.candidates as Array<Record<string, unknown>>)[0];
  equal(first.answers, {});
  equal(first.report, {});
  equal(first.summary, null);
  await rejects(
    () =>
      handleAssessmentService(
        sb,
        'assessment_review',
        { academy_id: 'a', candidate_id: 'c' },
        'manager',
        access,
      ),
    /Forbidden/,
  );
  equal(calls.length, 0);
});

Deno.test('teacher recovery reaches the locked collection command and cashier cannot enter', async () => {
  const { sb, calls } = fixture();
  await handleAssessmentService(
    sb,
    'assessment_collect',
    { academy_id: 'a', candidate_id: 'c' },
    'teacher',
    [member('teacher', { classroom_ids: ['g'] })],
  );
  equal(calls, [{
    name: 'academy_assessment_candidate_command',
    args: {
      p_academy_id: 'a', p_candidate_id: 'c', p_actor_id: 'teacher',
      p_action: 'collect', p_payload: {},
    },
  }]);
  await rejects(
    () => handleAssessmentService(sb, 'assessment_workspace', { academy_id: 'a' }, 'cashier', [member('cashier')]),
    /Forbidden/,
  );
});
