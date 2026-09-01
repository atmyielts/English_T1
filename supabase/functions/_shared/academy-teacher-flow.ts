export type AcademyTeacherFlowAccess = {
  tenant_id: string;
  role: string;
  staff_id?: string | null;
  classroom_ids?: string[];
  branch_ids?: string[];
  permissions?: Record<string, boolean>;
};

export type AcademyTeacherFlowDb = any;

type Row = Record<string, any>;

export type TeacherLessonCoverage = {
  id: string;
  label: string;
  covered: boolean;
};

export type TeacherDaySession = {
  id: string;
  academy_id: string;
  classroom_id: string;
  classroom_name: string;
  room_name: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: string;
  delivery_mode: string;
  roster: Array<{
    contact_id: string;
    name: string;
    status: string | null;
    notes: string | null;
  }>;
  attendance_saved: boolean;
  curriculum: {
    course_id: string | null;
    course_title: string | null;
    module_id: string | null;
    module_title: string | null;
    lesson_id: string | null;
    lesson_title: string;
    lesson_summary: string | null;
    estimated_minutes: number;
    objectives: TeacherLessonCoverage[];
  };
  resources: Array<{ id: string; title: string; kind: string; url: string | null; description: string | null }>;
  homework: { title: string; description: string; due_at: string };
  run: Row | null;
  connected_group_count: number;
};

const clean = (value: unknown, max = 5000): string => String(value ?? '').trim().slice(0, max);
const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.map((item) => clean(item, 500)).filter(Boolean)
  : [];
const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const unique = (values: unknown[]): string[] => Array.from(new Set(values.map((value) => clean(value, 64)).filter(Boolean)));

const dateInZone = (value: string | Date, timezone: string): string => {
  const date = value instanceof Date ? value : new Date(value);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return `${read('year')}-${read('month')}-${read('day')}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

const addDays = (iso: string, days: number): string => {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const hasPermission = (access: AcademyTeacherFlowAccess, permission: string): boolean =>
  access.permissions?.[permission] === true;

const canUseTeacherFlow = (access: AcademyTeacherFlowAccess): boolean =>
  hasPermission(access, 'viewEducationOS') &&
  (hasPermission(access, 'markAttendance') || hasPermission(access, 'manageAssignments'));

const objectiveLabels = (lesson: Row | null): string[] => {
  if (!lesson) return [];
  const metadata = object(lesson.metadata);
  const direct = strings(metadata.objectives ?? metadata.learning_objectives);
  if (direct.length) return direct;
  const content = Array.isArray(lesson.content) ? lesson.content : [];
  const extracted: string[] = [];
  for (const block of content) {
    if (typeof block === 'string') continue;
    const item = object(block);
    extracted.push(...strings(item.objectives ?? item.items));
    if (['objective', 'learning_objective', 'outcome'].includes(clean(item.type, 40).toLowerCase())) {
      const label = clean(item.label ?? item.title ?? item.text ?? item.content, 500);
      if (label) extracted.push(label);
    }
  }
  return Array.from(new Set(extracted)).slice(0, 20);
};

const homeworkDraft = (lesson: Row | null, endsAt: string): { title: string; description: string; due_at: string } => {
  const metadata = object(lesson?.metadata);
  const configured = metadata.homework;
  if (typeof configured === 'string' && configured.trim()) {
    return {
      title: `Practice: ${clean(lesson?.title, 140) || 'Today’s lesson'}`,
      description: clean(configured, 3000),
      due_at: addDays(endsAt, 2),
    };
  }
  const configuredObject = object(configured);
  return {
    title: clean(configuredObject.title, 180) || `Practice: ${clean(lesson?.title, 140) || 'Today’s lesson'}`,
    description: clean(configuredObject.description, 3000) || clean(lesson?.summary, 3000) || 'Review today’s lesson and complete the attached practice.',
    due_at: clean(configuredObject.due_at, 80) || addDays(endsAt, 2),
  };
};

const check = (result: { error?: { message?: string } | null }, message: string): void => {
  if (result.error) throw new Error(`${message}: ${result.error.message ?? 'unknown error'}`);
};

export const loadAcademyTeacherDay = async (
  sb: AcademyTeacherFlowDb,
  access: AcademyTeacherFlowAccess,
  requestedDate?: string | null,
): Promise<{ date: string; generated_at: string; sessions: TeacherDaySession[]; counts: Record<string, number> }> => {
  if (!canUseTeacherFlow(access)) throw new Error('Forbidden');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(clean(requestedDate, 10))
    ? clean(requestedDate, 10)
    : dateInZone(new Date(), 'Asia/Tashkent');
  const broadStart = new Date(`${date}T00:00:00.000Z`);
  broadStart.setUTCDate(broadStart.getUTCDate() - 1);
  const broadEnd = new Date(`${date}T00:00:00.000Z`);
  broadEnd.setUTCDate(broadEnd.getUTCDate() + 2);

  const sessionResult = await sb.from('academy_lesson_sessions')
    .select('id,academy_id,branch_id,classroom_id,room_id,primary_staff_id,title,starts_at,ends_at,timezone,status,delivery_mode,metadata')
    .eq('academy_id', access.tenant_id)
    .gte('starts_at', broadStart.toISOString()).lt('starts_at', broadEnd.toISOString())
    .order('starts_at').limit(500);
  check(sessionResult, 'Failed to load the teaching day');
  let sessions = (sessionResult.data ?? []).filter((session: Row) => dateInZone(session.starts_at, clean(session.timezone, 80) || 'Asia/Tashkent') === date);

  const assignedClassrooms = new Set(unique(access.classroom_ids ?? []));
  const assignedBranches = new Set(unique(access.branch_ids ?? []));
  if (assignedClassrooms.size) sessions = sessions.filter((session: Row) => assignedClassrooms.has(String(session.classroom_id)));
  else if (assignedBranches.size) sessions = sessions.filter((session: Row) => assignedBranches.has(String(session.branch_id)));

  const initialSessionIds = unique(sessions.map((session: Row) => session.id));
  if (access.staff_id && initialSessionIds.length) {
    const assignmentResult = await sb.from('academy_session_staff_assignments')
      .select('session_id,staff_id,ended_at').eq('academy_id', access.tenant_id)
      .in('session_id', initialSessionIds).is('ended_at', null).limit(1000);
    check(assignmentResult, 'Failed to load teacher session assignments');
    const assignedSessionIds = new Set((assignmentResult.data ?? [])
      .filter((row: Row) => String(row.staff_id) === String(access.staff_id))
      .map((row: Row) => String(row.session_id)));
    sessions = sessions.filter((session: Row) =>
      String(session.primary_staff_id) === String(access.staff_id) || assignedSessionIds.has(String(session.id)));
  }

  const sessionIds = unique(sessions.map((session: Row) => session.id));
  const classroomIds = unique(sessions.map((session: Row) => session.classroom_id));
  if (!sessionIds.length) return { date, generated_at: new Date().toISOString(), sessions: [], counts: { sessions: 0, students: 0, attendance_pending: 0, homework_pending: 0 } };

  const [classrooms, rooms, memberships, attendance, runs, classroomCourses, resources, groups] = await Promise.all([
    sb.from('academy_classrooms').select('id,name,branch_id').eq('academy_id', access.tenant_id).in('id', classroomIds),
    sb.from('academy_rooms').select('id,name').eq('academy_id', access.tenant_id),
    sb.from('academy_classroom_memberships').select('classroom_id,contact_id,role,status').eq('academy_id', access.tenant_id).in('classroom_id', classroomIds).eq('role', 'student').eq('status', 'active').limit(5000),
    sb.from('academy_attendance').select('session_id,contact_id,status,notes').eq('academy_id', access.tenant_id).in('session_id', sessionIds).limit(5000),
    sb.from('academy_teacher_lesson_runs').select('*').eq('academy_id', access.tenant_id).in('session_id', sessionIds).order('created_at').limit(500),
    sb.from('academy_classroom_courses').select('id,classroom_id,course_id,status,assigned_at').eq('academy_id', access.tenant_id).in('classroom_id', classroomIds).in('status', ['scheduled', 'active']).order('assigned_at').limit(2000),
    sb.from('academy_classroom_resources').select('id,classroom_id,title,kind,url,description,metadata,sort_order,is_published').eq('academy_id', access.tenant_id).in('classroom_id', classroomIds).eq('is_published', true).order('sort_order').limit(5000),
    sb.from('academy_telegram_chats').select('id,classroom_id,status,purpose').eq('academy_id', access.tenant_id).in('classroom_id', classroomIds).eq('status', 'active').eq('purpose', 'classroom_community').limit(500),
  ]);
  const rosterContactIds = unique((memberships.data ?? []).map((row: Row) => row.contact_id));
  const contacts = rosterContactIds.length
    ? await sb.from('academy_contacts').select('id,first_name,last_name,email,status').eq('academy_id', access.tenant_id).in('id', rosterContactIds).limit(5000)
    : { data: [], error: null };
  for (const [result, message] of [
    [classrooms, 'Failed to load classrooms'], [rooms, 'Failed to load rooms'],
    [memberships, 'Failed to load rosters'], [contacts, 'Failed to load students'],
    [attendance, 'Failed to load attendance'], [runs, 'Failed to load lesson progress'],
    [classroomCourses, 'Failed to load classroom curriculum'], [resources, 'Failed to load resources'],
  ] as Array<[any, string]>) check(result, message);

  const courseIds = unique((classroomCourses.data ?? []).map((row: Row) => row.course_id));
  const [courses, modules, lessons] = courseIds.length ? await Promise.all([
    sb.from('academy_courses').select('id,title,code,level,status').eq('academy_id', access.tenant_id).in('id', courseIds).neq('status', 'archived').limit(1000),
    sb.from('academy_course_modules').select('id,course_id,title,position,status').eq('academy_id', access.tenant_id).in('course_id', courseIds).neq('status', 'archived').order('position').limit(3000),
    sb.from('academy_lessons').select('id,course_id,module_id,title,summary,content,position,estimated_minutes,status,metadata').eq('academy_id', access.tenant_id).in('course_id', courseIds).neq('status', 'archived').order('position').limit(10000),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  check(courses, 'Failed to load courses'); check(modules, 'Failed to load modules'); check(lessons, 'Failed to load lessons');

  const byId = (rows: Row[]): Map<string, Row> => new Map<string, Row>(rows.map((row) => [String(row.id), row]));
  const classroomById = byId(classrooms.data ?? []);
  const roomById = byId(rooms.data ?? []);
  const contactById = byId(contacts.data ?? []);
  const courseById = byId(courses.data ?? []);
  const moduleById = byId(modules.data ?? []);
  const lessonById = byId(lessons.data ?? []);
  const runBySession = new Map<string, Row>((runs.data ?? []).map((run: Row) => [String(run.session_id), run]));
  const finishedLessonKeys = new Set((runs.data ?? []).filter((run: Row) => run.status === 'finished' && run.lesson_id)
    .map((run: Row) => `${run.classroom_id}:${run.lesson_id}`));
  const attendanceBySessionContact = new Map<string, Row>((attendance.data ?? []).map((row: Row) => [`${row.session_id}:${row.contact_id}`, row]));

  const resultSessions: TeacherDaySession[] = sessions.map((session: Row) => {
    const classroomId = String(session.classroom_id);
    const currentRun = runBySession.get(String(session.id)) ?? null;
    const availableCourseIds = new Set((classroomCourses.data ?? [])
      .filter((row: Row) => String(row.classroom_id) === classroomId)
      .map((row: Row) => String(row.course_id)));
    const curriculumLessons = (lessons.data ?? []).filter((lesson: Row) => availableCourseIds.has(String(lesson.course_id)) && lesson.status === 'published');
    const selectedLesson = currentRun?.lesson_id
      ? lessonById.get(String(currentRun.lesson_id)) ?? null
      : curriculumLessons.find((lesson: Row) => !finishedLessonKeys.has(`${classroomId}:${lesson.id}`))
        ?? curriculumLessons.at(-1) ?? null;
    const selectedModule = selectedLesson ? moduleById.get(String(selectedLesson.module_id)) ?? null : null;
    const selectedCourse = selectedLesson ? courseById.get(String(selectedLesson.course_id)) ?? null : null;
    const labels = currentRun?.coverage?.length
      ? currentRun.coverage
      : objectiveLabels(selectedLesson).map((label, index) => ({ id: `objective-${index + 1}`, label, covered: false }));
    const objectives: TeacherLessonCoverage[] = labels.length
      ? labels.map((item: Row, index: number) => ({ id: clean(item.id, 100) || `objective-${index + 1}`, label: clean(item.label ?? item, 500), covered: item.covered === true }))
      : [{ id: 'objective-1', label: selectedLesson ? `Complete ${selectedLesson.title}` : 'Record what the class covered', covered: false }];
    const relevantResources = (resources.data ?? []).filter((resource: Row) => {
      if (String(resource.classroom_id) !== classroomId) return false;
      const metadata = object(resource.metadata);
      if (!selectedLesson) return true;
      return String(metadata.lesson_id ?? '') === String(selectedLesson.id) ||
        clean(metadata.lesson, 300).toLowerCase() === clean(selectedLesson.title, 300).toLowerCase();
    });
    const fallbackResources = (resources.data ?? []).filter((resource: Row) => String(resource.classroom_id) === classroomId);
    const roster: TeacherDaySession['roster'] = (memberships.data ?? []).filter((membership: Row) => String(membership.classroom_id) === classroomId).map((membership: Row) => {
      const contact = contactById.get(String(membership.contact_id)) ?? {};
      const record = attendanceBySessionContact.get(`${session.id}:${membership.contact_id}`);
      return {
        contact_id: String(membership.contact_id),
        name: `${clean(contact.first_name, 120)} ${clean(contact.last_name, 120)}`.trim() || clean(contact.email, 180) || 'Student',
        status: record?.status ? String(record.status) : null,
        notes: record?.notes ? String(record.notes) : null,
      };
    });
    const savedCount = roster.filter((student) => student.status).length;
    const draft = currentRun?.homework_draft && Object.keys(object(currentRun.homework_draft)).length
      ? object(currentRun.homework_draft) : homeworkDraft(selectedLesson, String(session.ends_at));
    return {
      id: String(session.id), academy_id: String(session.academy_id), classroom_id: classroomId,
      classroom_name: clean(classroomById.get(classroomId)?.name, 180) || 'Classroom',
      room_name: session.room_id ? clean(roomById.get(String(session.room_id))?.name, 180) || null : null,
      title: clean(session.title, 180) || clean(selectedLesson?.title, 180) || 'Lesson',
      starts_at: String(session.starts_at), ends_at: String(session.ends_at),
      timezone: clean(session.timezone, 80) || 'Asia/Tashkent', status: String(session.status),
      delivery_mode: String(session.delivery_mode), roster,
      attendance_saved: roster.length > 0 && savedCount === roster.length,
      curriculum: {
        course_id: selectedCourse?.id ? String(selectedCourse.id) : null,
        course_title: selectedCourse?.title ? String(selectedCourse.title) : null,
        module_id: selectedModule?.id ? String(selectedModule.id) : null,
        module_title: selectedModule?.title ? String(selectedModule.title) : null,
        lesson_id: selectedLesson?.id ? String(selectedLesson.id) : null,
        lesson_title: clean(selectedLesson?.title, 180) || clean(session.title, 180) || 'Today’s lesson',
        lesson_summary: clean(selectedLesson?.summary, 2000) || null,
        estimated_minutes: Number(selectedLesson?.estimated_minutes ?? Math.max(1, Math.round((new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 60000))),
        objectives,
      },
      resources: (relevantResources.length ? relevantResources : fallbackResources.slice(0, 6)).map((resource: Row) => ({
        id: String(resource.id), title: String(resource.title), kind: String(resource.kind),
        url: resource.url ? String(resource.url) : null, description: resource.description ? String(resource.description) : null,
      })),
      homework: {
        title: clean(draft.title, 180), description: clean(draft.description, 3000),
        due_at: clean(draft.due_at, 80) || addDays(String(session.ends_at), 2),
      },
      run: currentRun,
      connected_group_count: (groups.data ?? []).filter((group: Row) => String(group.classroom_id) === classroomId).length,
    };
  });

  return {
    date, generated_at: new Date().toISOString(), sessions: resultSessions,
    counts: {
      sessions: resultSessions.length,
      students: resultSessions.reduce((total, session) => total + session.roster.length, 0),
      attendance_pending: resultSessions.filter((session) => !session.attendance_saved && session.status !== 'completed').length,
      homework_pending: resultSessions.filter((session) => session.run?.status !== 'finished').length,
    },
  };
};

const findSession = async (sb: AcademyTeacherFlowDb, access: AcademyTeacherFlowAccess, sessionId: string): Promise<Row> => {
  const { data, error } = await sb.from('academy_lesson_sessions')
    .select('id,academy_id,branch_id,classroom_id,primary_staff_id,starts_at,timezone,status')
    .eq('academy_id', access.tenant_id).eq('id', sessionId).maybeSingle();
  if (error || !data?.id) throw new Error('Lesson session not found');
  if (access.staff_id) {
    const primary = String(data.primary_staff_id) === String(access.staff_id);
    const { data: assignment } = primary ? { data: null } : await sb.from('academy_session_staff_assignments')
      .select('id').eq('academy_id', access.tenant_id).eq('session_id', sessionId)
      .eq('staff_id', access.staff_id).is('ended_at', null).maybeSingle();
    if (!primary && !assignment?.id) throw new Error('Forbidden');
  }
  const classrooms = unique(access.classroom_ids ?? []);
  const branches = unique(access.branch_ids ?? []);
  if (classrooms.length && !classrooms.includes(String(data.classroom_id))) throw new Error('Forbidden');
  if (!classrooms.length && branches.length && !branches.includes(String(data.branch_id))) throw new Error('Forbidden');
  return data;
};

export const startAcademyTeacherLesson = async (
  sb: AcademyTeacherFlowDb,
  access: AcademyTeacherFlowAccess,
  actorId: string,
  body: Row,
): Promise<Row> => {
  if (!canUseTeacherFlow(access) || !access.staff_id) throw new Error('Forbidden');
  const sessionId = clean(body.session_id, 64);
  const key = clean(body.idempotency_key, 180);
  if (!sessionId || !key) throw new Error('session_id and idempotency_key are required');
  const session = await findSession(sb, access, sessionId);
  const day = await loadAcademyTeacherDay(sb, access, dateInZone(session.starts_at, session.timezone || 'Asia/Tashkent'));
  const item = day.sessions.find((candidate) => candidate.id === sessionId);
  if (!item) throw new Error('Lesson session is outside the teacher’s assigned day');
  const plan = {
    course: item.curriculum.course_title, module: item.curriculum.module_title,
    lesson: item.curriculum.lesson_title, summary: item.curriculum.lesson_summary,
    estimated_minutes: item.curriculum.estimated_minutes, objectives: item.curriculum.objectives,
    resources: item.resources.map(({ id, title, kind }) => ({ id, title, kind })),
  };
  const { data, error } = await sb.rpc('academy_start_teacher_lesson', {
    p_academy_id: access.tenant_id, p_session_id: sessionId, p_actor_id: actorId,
    p_staff_id: access.staff_id, p_course_id: item.curriculum.course_id,
    p_module_id: item.curriculum.module_id, p_lesson_id: item.curriculum.lesson_id,
    p_plan_snapshot: plan, p_homework_draft: item.homework, p_idempotency_key: key,
  });
  if (error) throw new Error(`Failed to start lesson: ${error.message}`);
  return { run: data };
};

export const recordAcademyTeacherAttendance = async (
  sb: AcademyTeacherFlowDb,
  access: AcademyTeacherFlowAccess,
  actorId: string,
  body: Row,
): Promise<Row> => {
  if (!hasPermission(access, 'markAttendance') || !access.staff_id) throw new Error('Forbidden');
  const sessionId = clean(body.session_id, 64);
  const key = clean(body.idempotency_key, 180);
  if (!sessionId || !key || !Array.isArray(body.records)) throw new Error('session_id, attendance records, and idempotency_key are required');
  await findSession(sb, access, sessionId);
  const records = body.records.slice(0, 500).map((record: Row) => ({
    contact_id: clean(record.contact_id, 64), status: clean(record.status, 30).toLowerCase(), notes: clean(record.notes, 1000) || null,
  }));
  if (records.some((record: Row) => !record.contact_id || !['present', 'absent', 'late', 'excused'].includes(record.status))) {
    throw new Error('Every attendance row needs a student and valid status');
  }
  const { data, error } = await sb.rpc('academy_record_teacher_attendance_batch', {
    p_academy_id: access.tenant_id, p_session_id: sessionId, p_actor_id: actorId,
    p_staff_id: access.staff_id, p_records: records, p_idempotency_key: key,
  });
  if (error) throw new Error(`Failed to save attendance: ${error.message}`);
  return data ?? {};
};

export const finishAcademyTeacherLesson = async (
  sb: AcademyTeacherFlowDb,
  access: AcademyTeacherFlowAccess,
  actorId: string,
  body: Row,
): Promise<Row> => {
  if (!canUseTeacherFlow(access) || !access.staff_id) throw new Error('Forbidden');
  const sessionId = clean(body.session_id, 64);
  const key = clean(body.idempotency_key, 180);
  if (!sessionId || !key) throw new Error('session_id and idempotency_key are required');
  await findSession(sb, access, sessionId);
  const coverage = Array.isArray(body.coverage) ? body.coverage.slice(0, 100).map((item: Row, index: number) => ({
    id: clean(item.id, 100) || `objective-${index + 1}`, label: clean(item.label, 500), covered: item.covered === true,
  })).filter((item: Row) => item.label) : [];
  const homework = object(body.homework);
  const assignHomework = body.assign_homework !== false;
  const payload = {
    title: clean(homework.title, 180), description: clean(homework.description, 3000), due_at: clean(homework.due_at, 80),
  };
  if (assignHomework && (!payload.title || Number.isNaN(new Date(payload.due_at).getTime()))) {
    throw new Error('Homework needs a title and valid due date');
  }
  const { data, error } = await sb.rpc('academy_finish_teacher_lesson', {
    p_academy_id: access.tenant_id, p_session_id: sessionId, p_actor_id: actorId,
    p_staff_id: access.staff_id, p_coverage: coverage,
    p_teacher_notes: clean(body.teacher_notes, 5000) || null,
    p_homework: payload, p_assign_homework: assignHomework, p_idempotency_key: key,
  });
  if (error) throw new Error(`Failed to finish lesson: ${error.message}`);
  return data ?? {};
};
