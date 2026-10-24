// Course version pinning (docs/product/42 §12). A classroom run with
// version_mode 'pinned' reads the snapshot stored in academy_course_versions
// when the course was published; a run with version_mode 'live' (every run
// created before pinning existed) keeps reading the live course rows.
// The SQL side (academy_module_unlocked and the unlock gates) follows the same rule.
type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };
type Db = { from: (table: string) => any };

export type CourseVersion = {
  id: string;
  course_id: string;
  version: number;
  published_at?: string | null;
  snapshot: Row;
};

const isRow = (value: unknown): value is Row => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);
const byPosition = (a: Row, b: Row) => Number(a.position ?? 0) - Number(b.position ?? 0);

export const pinnedVersionId = (run: Row | null | undefined): string | null =>
  run && run.version_mode === "pinned" && typeof run.course_version_id === "string" && run.course_version_id
    ? run.course_version_id
    : null;

export const learnerQuestion = (question: Row): Row => ({
  id: question.id,
  quiz_id: question.quiz_id,
  question_type: question.question_type,
  prompt: question.prompt,
  options: question.options ?? [],
  points: question.points,
  position: question.position,
  metadata: question.metadata ?? {},
});

// Snapshot rows in the shape of the live learner selects, so the learner app
// renders a pinned course exactly like a live one.
export const versionCurriculum = (academyId: string, version: CourseVersion) => {
  const snapshot = isRow(version.snapshot) ? version.snapshot : {};
  const owned = { academy_id: academyId, course_id: version.course_id, status: "published" };
  const course: Row = {
    ...(isRow(snapshot.course) ? snapshot.course : {}),
    id: version.course_id,
    academy_id: academyId,
    status: "published",
    published_at: version.published_at ?? null,
    course_version_id: version.id,
    course_version: version.version,
  };
  return {
    course,
    modules: rows(snapshot.modules).map((module): Row => ({ ...module, ...owned })).sort(byPosition),
    lessons: rows(snapshot.lessons).map((lesson): Row => ({ ...lesson, ...owned })).sort(byPosition),
    quizzes: rows(snapshot.quizzes).map((quiz): Row => ({ ...quiz, ...owned })),
    questions: rows(snapshot.questions).map(learnerQuestion).sort(byPosition),
  };
};

export const snapshotLesson = (version: CourseVersion, lessonId: string): Row | null =>
  rows(version.snapshot?.lessons).find((lesson) => String(lesson.id) === lessonId) ?? null;

export const snapshotQuiz = (version: CourseVersion, quizId: string): Row | null =>
  rows(version.snapshot?.quizzes).find((quiz) => String(quiz.id) === quizId) ?? null;

// Full questions, with correct answers, for server-side grading only.
export const snapshotQuestions = (version: CourseVersion, quizId: string): Row[] =>
  rows(version.snapshot?.questions).filter((question) => String(question.quiz_id) === quizId).sort(byPosition);

export const loadCourseVersions = async (db: Db, academyId: string, ids: string[]): Promise<Map<string, CourseVersion>> => {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await db.from("academy_course_versions")
    .select("id, course_id, version, published_at, snapshot")
    .eq("academy_id", academyId).in("id", unique).limit(unique.length) as Result;
  if (error) throw new Error(`Failed to load course versions: ${error.message}`);
  return new Map(rows(data).map((row) => [String(row.id), row as unknown as CourseVersion]));
};

// The run of one course in one classroom and, when pinned, its version.
export const loadRunVersion = async (
  db: Db,
  academyId: string,
  classroomId: string,
  courseId: string,
): Promise<{ run: Row | null; version: CourseVersion | null }> => {
  const { data, error } = await db.from("academy_classroom_courses")
    .select("id, status, starts_at, ends_at, version_mode, course_version_id")
    .eq("academy_id", academyId).eq("classroom_id", classroomId).eq("course_id", courseId)
    .in("status", ["scheduled", "active", "completed"]).maybeSingle() as Result;
  if (error) throw new Error(`Failed to load classroom course: ${error.message}`);
  const run = isRow(data) ? data : null;
  const versionId = pinnedVersionId(run);
  if (!versionId) return { run, version: null };
  const versions = await loadCourseVersions(db, academyId, [versionId]);
  return { run, version: versions.get(versionId) ?? null };
};
