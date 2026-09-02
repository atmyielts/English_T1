import type { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  academyAccessBranchIds,
  academyAccessClassroomIds,
  academyAccessHas,
  type MembershipRow,
} from './access.ts';
import {
  type AssessmentItem,
  assessmentProgress,
  assessmentSummary,
  publicAssessmentItems,
  validateAssessmentItems,
  validateAssessmentReport,
} from '../_shared/academy-assessment-core.ts';

// The deployed schema is managed by SQL migrations, matching the parent Academy client.
// deno-lint-ignore no-explicit-any
type Client = ReturnType<typeof createClient<any>>;
type Row = Record<string, unknown>;
const str = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const record = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
function fail(message = 'Forbidden'): never {
  throw new Error(message);
}
const checked = <T>(result: { data: T; error: { message: string } | null }): T => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const rows = (value: unknown): Row[] => (value ?? []) as Row[];
export const assessmentActions = new Set([
  'assessment_workspace',
  'assessment_create_paper',
  'assessment_create_run',
  'assessment_register',
  'assessment_register_lead',
  'assessment_open',
  'assessment_close',
  'assessment_review',
  'assessment_release',
  'assessment_collect',
  'assessment_student_list',
  'assessment_student_start',
  'assessment_student_save',
  'assessment_student_submit',
  'assessment_student_resume',
]);

export function assessmentClassroomAllowed(
  access: MembershipRow,
  classroom: Row | undefined,
): boolean {
  const branches = academyAccessBranchIds(access);
  if (branches !== null) return Boolean(classroom && branches.includes(str(classroom.branch_id)));
  const ids = academyAccessClassroomIds(access);
  return ids === null || Boolean(classroom && ids.includes(str(classroom.id)));
}

export function assessmentStudentView(candidate: Row, run: Row, paper: Row, includeItems = false) {
  const released = candidate.status === 'released';
  return {
    id: candidate.id,
    run_id: candidate.run_id,
    candidate_code: candidate.candidate_code,
    status: candidate.status,
    started_at: candidate.started_at,
    expires_at: candidate.expires_at,
    submitted_at: candidate.submitted_at,
    released_at: candidate.released_at,
    run: {
      id: run.id,
      title: run.title,
      kind: run.kind,
      status: run.status,
      starts_at: run.starts_at,
      ends_at: run.ends_at,
      room: run.room,
      instructions: run.instructions,
    },
    duration_minutes: paper.duration_minutes,
    report: released ? candidate.report : null,
    summary: released
      ? assessmentSummary(
        paper.items as AssessmentItem[],
        candidate.marks as Record<string, number>,
      )
      : null,
    ...(includeItems && candidate.status === 'in_progress'
      ? {
        items: publicAssessmentItems(paper.items as AssessmentItem[]),
        answers: candidate.answers,
      }
      : {}),
  };
}

export async function handleAssessmentService(
  sb: Client,
  action: string,
  body: Row,
  userId: string,
  memberships: MembershipRow[],
  studentContacts: Row[] = [],
): Promise<Row> {
  const academyId = str(body.academy_id, 64);
  if (!academyId) fail('Choose an academy first.');
  if (action.startsWith('assessment_student_')) {
    const contactIds = studentContacts.filter((contact) => contact.academy_id === academyId).map((
      contact,
    ) => str(contact.id));
    if (!contactIds.length) fail();
    const candidates = rows(
      checked(
        await sb.from('academy_assessment_candidates').select('*').eq('academy_id', academyId).in(
          'contact_id',
          contactIds,
        ).order('created_at', { ascending: false }).limit(250),
      ),
    );
    const runIds = [...new Set(candidates.map((candidate) => str(candidate.run_id)))];
    const runs = runIds.length
      ? rows(
        checked(
          await sb.from('academy_assessment_runs').select('*').eq('academy_id', academyId).in(
            'id',
            runIds,
          ),
        ),
      )
      : [];
    const paperIds = [...new Set(runs.map((run) => str(run.paper_id)))];
    const papers = paperIds.length
      ? rows(
        checked(
          await sb.from('academy_assessment_papers').select('*').eq('academy_id', academyId).in(
            'id',
            paperIds,
          ),
        ),
      )
      : [];
    const studentView = (candidate: Row, run: Row, paper: Row, includeItems = false) => {
      const contact = studentContacts.find((c) => c.id === candidate.contact_id);
      return {
        ...assessmentStudentView(candidate, run, paper, includeItems),
        learner_name: `${str(contact?.first_name)} ${str(contact?.last_name)}`.trim(),
      };
    };
    const context = (candidate: Row) => {
      const run = runs.find((r) => r.id === candidate.run_id)!;
      const paper = papers.find((p) => p.id === run?.paper_id)!;
      if (!run || !paper) fail('This assessment is unavailable. Ask your center to check it.');
      return { run, paper };
    };
    if (action === 'assessment_student_list') {
      return {
        candidates: candidates.map((candidate) => {
          const { run, paper } = context(candidate);
          return studentView(candidate, run, paper);
        }),
        server_time: new Date().toISOString(),
      };
    }
    const candidate = candidates.find((c) => c.id === str(body.candidate_id, 64));
    if (!candidate) fail();
    const { run, paper } = context(candidate);
    if (action === 'assessment_student_resume') {
      return {
        candidate: studentView(candidate, run, paper, true),
        server_time: new Date().toISOString(),
      };
    }
    const command = action.replace('assessment_student_', '');
    if (!['start', 'save', 'submit'].includes(command)) fail();
    const updated = checked(
      await sb.rpc('academy_assessment_candidate_command', {
        p_academy_id: academyId,
        p_candidate_id: candidate.id,
        p_actor_id: userId,
        p_action: command,
        p_payload: { answers: record(body.answers) },
      }),
    ) as Row;
    return {
      candidate: studentView(updated, run, paper, true),
      server_time: new Date().toISOString(),
    };
  }

  const access = memberships.find((m) => m.tenant_id === academyId);
  if (!access || !academyAccessHas(access, 'viewContacts')) fail();
  if (
    !academyAccessHas(access, 'manageAdmissions') &&
    !academyAccessHas(access, 'viewAcademicReports') &&
    !academyAccessHas(access, 'gradeSubmissions')
  ) fail();
  const canCreate = academyAccessHas(access, 'manageAssignments');
  const canRun = academyAccessHas(access, 'manageAdmissions') ||
    academyAccessHas(access, 'manageAcademicOperations');
  const canReview = academyAccessHas(access, 'gradeSubmissions');
  const allClasses = rows(
    checked(
      await sb.from('academy_classrooms').select('id,name,branch_id').eq('academy_id', academyId)
        .limit(2000),
    ),
  );
  const classrooms = allClasses.filter((classroom) =>
    assessmentClassroomAllowed(access, classroom)
  );
  const classIds = new Set(classrooms.map((c) => str(c.id)));
  const branches = academyAccessBranchIds(access);
  const unscoped = academyAccessClassroomIds(access) === null && branches === null;
  const allContacts = rows(
    checked(
      await sb.from('academy_contacts').select(
        'id,first_name,last_name,email,user_id,status,primary_branch_id',
      ).eq('academy_id', academyId).limit(10000),
    ),
  );
  const membershipsRows = classIds.size
    ? rows(
      checked(
        await sb.from('academy_classroom_memberships').select('contact_id,classroom_id,status').eq(
          'academy_id',
          academyId,
        ).in('classroom_id', [...classIds]).in('status', [
          'active',
          'invited',
          'paused',
          'completed',
        ]).limit(10000),
      ),
    )
    : [];
  let allowedContacts = allContacts.filter((contact) =>
    unscoped || branches?.includes(str(contact.primary_branch_id)) ||
    membershipsRows.some((m) => m.contact_id === contact.id)
  );
  const leads = unscoped && academyAccessHas(access, 'manageAdmissions')
    ? rows(
      checked(
        await sb.from('academy_leads').select('id,full_name,email,interested_course').eq(
          'academy_id',
          academyId,
        ).eq('status', 'open').limit(1000),
      ),
    )
    : [];
  const allRuns = rows(
    checked(
      await sb.from('academy_assessment_runs').select('*').eq('academy_id', academyId).order(
        'created_at',
        { ascending: false },
      ).limit(500),
    ),
  );
  const allPapers = rows(
    checked(
      await sb.from('academy_assessment_papers').select('*').eq('academy_id', academyId).order(
        'created_at',
        { ascending: false },
      ).limit(500),
    ),
  );
  // Creating an intake paper explicitly assigns its author to review that paper's intake sessions.
  const runs = allRuns.filter((run) =>
    unscoped || classIds.has(str(run.classroom_id)) ||
    (canReview && !run.classroom_id &&
      allPapers.some((p) => p.id === run.paper_id && p.created_by === userId))
  );
  const runIds = runs.map((run) => str(run.id));
  const papers = allPapers.filter((paper) =>
    unscoped || paper.created_by === userId || runs.some((run) => run.paper_id === paper.id)
  );
  const allCandidates = runIds.length
    ? rows(
      checked(
        await sb.from('academy_assessment_candidates').select('*').eq('academy_id', academyId).in(
          'run_id',
          runIds,
        ).order('created_at', { ascending: false }).limit(5000),
      ),
    )
    : [];
  const reviewContactIds = new Set(
    allCandidates.filter((c) => runs.some((r) => r.id === c.run_id && !r.classroom_id)).map((c) =>
      str(c.contact_id)
    ),
  );
  allowedContacts = allContacts.filter((c) =>
    allowedContacts.some((a) => a.id === c.id) || reviewContactIds.has(str(c.id))
  );
  const contactIds = new Set(allowedContacts.map((c) => str(c.id)));
  const candidates = allCandidates.filter((c) => contactIds.has(str(c.contact_id)));
  if (action === 'assessment_workspace') {
    const summaries: Array<Row & { summary: ReturnType<typeof assessmentSummary> | null }> =
      candidates.map((candidate) => {
        const run = runs.find((r) => r.id === candidate.run_id)!;
        const paper = allPapers.find((p) => p.id === run.paper_id);
        return {
          ...candidate,
          summary: paper
            ? assessmentSummary(
              paper.items as AssessmentItem[],
              candidate.marks as Record<string, number>,
            )
            : null,
        };
      });
    const academy = checked(
      await sb.from('tenants').select('id,name').eq('id', academyId).single(),
    );
    return {
      academy,
      leads,
      papers: papers.map((p) => ({
        ...p,
        items: canCreate || canReview
          ? p.items
          : publicAssessmentItems(p.items as AssessmentItem[]),
      })),
      runs,
      candidates: summaries.map((c) =>
        canReview ? c : {
          ...c,
          answers: {},
          marks: {},
          review_notes: '',
          report: c.status === 'released' ? c.report : {},
          summary: c.status === 'released' ? c.summary : null,
        }
      ),
      contacts: allowedContacts,
      classrooms,
      memberships: membershipsRows,
      permissions: {
        create: canCreate,
        run: canRun,
        review: canReview,
        enroll: academyAccessHas(access, 'manageRoster'),
        intake: unscoped,
        admissions: academyAccessHas(access, 'manageAdmissions'),
      },
      limited: allRuns.length === 500 || allPapers.length === 500 ||
        allCandidates.length === 5000 || membershipsRows.length === 10000 ||
        allClasses.length === 2000 || allContacts.length === 10000,
      progress: assessmentProgress(
        summaries.filter((c) => c.status === 'released').map((c) => {
          const run = runs.find((r) => r.id === c.run_id)!;
          return {
            contact_id: str(c.contact_id),
            paper_id: str(run.paper_id),
            classroom_id: run.classroom_id as string | null,
            assessed_at: str(c.started_at || c.submitted_at),
            percent: c.summary?.percent ?? null,
          };
        }),
      ),
    };
  }
  if (action === 'assessment_create_paper') {
    if (!canCreate) fail();
    const title = str(body.title);
    const duration = Number(body.duration_minutes);
    if (!title || !Number.isInteger(duration) || duration < 5 || duration > 240) {
      fail('Name the paper and choose 5–240 minutes.');
    }
    const items = validateAssessmentItems(body.items);
    const paper = checked(
      await sb.from('academy_assessment_papers').insert({
        academy_id: academyId,
        title,
        duration_minutes: duration,
        items,
        created_by: userId,
      }).select('*').single(),
    );
    return { paper };
  }
  if (action === 'assessment_create_run') {
    if (!canRun) fail();
    const classroomId = str(body.classroom_id, 64) || null;
    if (classroomId ? !classIds.has(classroomId) : !unscoped) fail();
    if (!papers.some((p) => p.id === body.paper_id)) fail('Choose an available assessment paper.');
    const title = str(body.title), kind = str(body.kind);
    const start = Date.parse(str(body.starts_at)), end = Date.parse(str(body.ends_at));
    const capacity = Number(body.capacity);
    if (
      !title || !['placement', 'exam', 'audit'].includes(kind) || !Number.isFinite(start) ||
      !Number.isFinite(end) || end <= start || !Number.isInteger(capacity) || capacity < 1 ||
      capacity > 500
    ) fail('Check the title, session dates, and available seats.');
    const run = checked(
      await sb.from('academy_assessment_runs').insert({
        academy_id: academyId,
        paper_id: body.paper_id,
        classroom_id: classroomId,
        title,
        kind,
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
        capacity,
        room: str(body.room),
        instructions: str(body.instructions, 3000),
        created_by: userId,
      }).select('*').single(),
    );
    return { run };
  }
  if (action === 'assessment_register_lead') {
    if (!unscoped || !academyAccessHas(access, 'manageAdmissions')) fail();
    const run = runs.find((r) => r.id === str(body.run_id, 64));
    const lead = leads.find((l) => l.id === str(body.lead_id, 64));
    if (!run || !lead) fail();
    return {
      contact_id: checked(
        await sb.rpc('academy_register_assessment_lead', {
          p_academy_id: academyId,
          p_run_id: run.id,
          p_lead_id: lead.id,
          p_actor_id: userId,
        }),
      ),
    };
  }
  if (['assessment_register', 'assessment_open', 'assessment_close'].includes(action)) {
    if (!canRun) fail();
    const run = runs.find((r) => r.id === str(body.run_id, 64));
    if (!run) fail();
    if (action === 'assessment_register') {
      const selected = Array.isArray(body.contact_ids)
        ? [...new Set(body.contact_ids.map((id) => str(id, 64)))]
        : [];
      if (!selected.length || selected.length > 500 || selected.some((id) => !contactIds.has(id))) {
        fail();
      }
      if (
        run.classroom_id &&
        selected.some((id) =>
          !membershipsRows.some((m) => m.classroom_id === run.classroom_id && m.contact_id === id)
        )
      ) fail('Choose students enrolled in this group. Use an intake session for new applicants.');
      return {
        registered: checked(
          await sb.rpc('academy_register_assessment_candidates', {
            p_academy_id: academyId,
            p_run_id: run.id,
            p_contact_ids: selected,
          }),
        ),
      };
    }
    const expected = action === 'assessment_open' ? 'draft' : 'open';
    if (run.status !== expected) {
      fail('This session has already changed. Refresh to see its current status.');
    }
    if (action === 'assessment_open' && Date.parse(str(run.ends_at)) <= Date.now()) {
      fail('This session has already ended. Create a new session.');
    }
    return {
      run: checked(
        await sb.from('academy_assessment_runs').update({
          status: action === 'assessment_open' ? 'open' : 'closed',
        }).eq('academy_id', academyId).eq('id', run.id).eq('status', expected).select('*').single(),
      ),
    };
  }
  if (['assessment_review', 'assessment_release', 'assessment_collect'].includes(action)) {
    if (!canReview) fail();
    const candidate = candidates.find((c) => c.id === str(body.candidate_id, 64));
    if (!candidate) fail();
    const payload = action === 'assessment_review'
      ? {
        marks: record(body.marks),
        review_notes: str(body.review_notes, 5000),
        report: validateAssessmentReport(body.report),
      }
      : {};
    return {
      candidate: checked(
        await sb.rpc('academy_assessment_candidate_command', {
          p_academy_id: academyId,
          p_candidate_id: candidate.id,
          p_actor_id: userId,
          p_action: action === 'assessment_review'
            ? 'review'
            : action === 'assessment_collect'
            ? 'collect'
            : 'release',
          p_payload: payload,
        }),
      ),
    };
  }
  fail();
}
