import { translate } from '../../i18n';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  teacherStudioCurriculum,
  teacherStudioGradeCategories,
  teacherStudioGradeQuizAttempt,
  teacherStudioPublishCourse,
  teacherStudioQuizAttempts,
  teacherStudioQuizzes,
  teacherStudioRubrics,
  teacherStudioUpsertCourse,
  teacherStudioUpsertGradeCategory,
  teacherStudioUpsertLesson,
  teacherStudioUpsertModule,
  teacherStudioUpsertQuiz,
  teacherStudioUpsertQuizQuestion,
  teacherStudioUpsertRubric,
  type TeacherStudioCurriculum,
  type TeacherStudioQuiz,
  type TeacherStudioQuizAttempt,
  type TeacherStudioQuizQuestion,
  type TeacherStudioGradeCategory,
  type TeacherStudioRubric,
} from '../../lib/client';

type CurriculumViewProps = {
  academyId: string;
  classroomId: string;
  canManage: boolean;
  canGrade: boolean;
};

const emptyCurriculum: TeacherStudioCurriculum = { courses: [], modules: [], lessons: [], classroom_courses: [] };

const splitLines = (value: string): string[] => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

export const CurriculumView = ({ academyId, classroomId, canManage, canGrade }: CurriculumViewProps) => {
  const [curriculum, setCurriculum] = useState<TeacherStudioCurriculum>(emptyCurriculum);
  const [quizzes, setQuizzes] = useState<TeacherStudioQuiz[]>([]);
  const [questions, setQuestions] = useState<TeacherStudioQuizQuestion[]>([]);
  const [categories, setCategories] = useState<TeacherStudioGradeCategory[]>([]);
  const [rubrics, setRubrics] = useState<TeacherStudioRubric[]>([]);
  const [attempts, setAttempts] = useState<TeacherStudioQuizAttempt[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [courseForm, setCourseForm] = useState({ title: '', code: '', level: '', description: '', estimated_minutes: '0' });
  const [moduleForm, setModuleForm] = useState({ title: '', description: '' });
  const [lessonForm, setLessonForm] = useState({ title: '', summary: '', content: '', estimated_minutes: '15', prerequisite_lesson_id: '', available_from: '' });
  const [quizForm, setQuizForm] = useState({ title: '', instructions: '', lesson_id: '', passing_score: '60', attempts_allowed: '1', time_limit_minutes: '' });
  const [questionForm, setQuestionForm] = useState({ question_type: 'single_choice', prompt: '', options: '', correct_answer: '', points: '1', explanation: '' });
  const [categoryForm, setCategoryForm] = useState({ name: '', weight: '1', drop_lowest: '0' });
  const [rubricForm, setRubricForm] = useState({ title: '', description: '', criteria: '' });
  const [attemptDrafts, setAttemptDrafts] = useState<Record<string, { score: string; feedback: string }>>({});

  const load = useCallback(async () => {
    if (!academyId || !classroomId || !canManage) return;
    setBusy(true);
    setError('');
    try {
      const [curriculumData, quizData, categoryData, rubricData, attemptData] = await Promise.all([
        teacherStudioCurriculum(academyId, classroomId),
        teacherStudioQuizzes(academyId, { classroom_id: classroomId }),
        canGrade ? teacherStudioGradeCategories(academyId, classroomId) : Promise.resolve([]),
        canGrade ? teacherStudioRubrics(academyId) : Promise.resolve([]),
        canGrade ? teacherStudioQuizAttempts(academyId, { classroom_id: classroomId }) : Promise.resolve([]),
      ]);
      setCurriculum(curriculumData);
      setQuizzes(quizData.quizzes);
      setQuestions(quizData.questions);
      setCategories(categoryData);
      setRubrics(rubricData);
      setAttempts(attemptData);
      setSelectedCourseId((current) => curriculumData.courses.some((course) => course.id === current) ? current : curriculumData.courses[0]?.id ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [academyId, classroomId, canGrade, canManage]);

  useEffect(() => { void load(); }, [load]);

  const selectedCourse = useMemo(
    () => curriculum.courses.find((course) => course.id === selectedCourseId) ?? null,
    [curriculum.courses, selectedCourseId],
  );
  const courseModules = useMemo(
    () => curriculum.modules.filter((module) => module.course_id === selectedCourseId),
    [curriculum.modules, selectedCourseId],
  );
  const selectedModule = useMemo(
    () => courseModules.find((module) => module.id === selectedModuleId) ?? courseModules[0] ?? null,
    [courseModules, selectedModuleId],
  );
  const moduleLessons = useMemo(
    () => curriculum.lessons.filter((lesson) => lesson.module_id === selectedModule?.id),
    [curriculum.lessons, selectedModule?.id],
  );
  const courseLessons = useMemo(
    () => curriculum.lessons.filter((lesson) => lesson.course_id === selectedCourseId),
    [curriculum.lessons, selectedCourseId],
  );
  const courseQuizzes = useMemo(
    () => quizzes.filter((quiz) => quiz.course_id === selectedCourseId),
    [quizzes, selectedCourseId],
  );
  const selectedQuiz = useMemo(
    () => courseQuizzes.find((quiz) => quiz.id === selectedQuizId) ?? courseQuizzes[0] ?? null,
    [courseQuizzes, selectedQuizId],
  );
  const quizQuestions = useMemo(
    () => questions.filter((question) => question.quiz_id === selectedQuiz?.id),
    [questions, selectedQuiz?.id],
  );
  const pendingAttempts = useMemo(() => attempts.filter((attempt) => attempt.status === 'submitted'), [attempts]);

  useEffect(() => {
    if (selectedModule && selectedModule.id !== selectedModuleId) setSelectedModuleId(selectedModule.id);
  }, [selectedModule, selectedModuleId]);

  useEffect(() => {
    if (selectedQuiz && selectedQuiz.id !== selectedQuizId) setSelectedQuizId(selectedQuiz.id);
  }, [selectedQuiz, selectedQuizId]);

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      setNotice(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const createCourse = (event: FormEvent) => {
    event.preventDefault();
    if (!courseForm.title.trim()) return;
    void run(async () => {
      const course = await teacherStudioUpsertCourse(academyId, {
        classroom_id: classroomId,
        title: courseForm.title.trim(),
        code: courseForm.code.trim() || null,
        level: courseForm.level.trim() || null,
        description: courseForm.description.trim() || null,
        estimated_minutes: Math.max(0, Number(courseForm.estimated_minutes) || 0),
        status: 'draft',
      });
      setSelectedCourseId(course.id);
      setCourseForm({ title: '', code: '', level: '', description: '', estimated_minutes: '0' });
    }, 'Course created and assigned to this classroom.');
  };

  const createModule = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCourse || !moduleForm.title.trim()) return;
    void run(async () => {
      const module = await teacherStudioUpsertModule(academyId, {
        classroom_id: classroomId,
        course_id: selectedCourse.id,
        title: moduleForm.title.trim(),
        description: moduleForm.description.trim() || null,
        status: 'draft',
      });
      setSelectedModuleId(module.id);
      setModuleForm({ title: '', description: '' });
    }, 'Module added.');
  };

  const createLesson = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCourse || !selectedModule || !lessonForm.title.trim()) return;
    void run(async () => {
      await teacherStudioUpsertLesson(academyId, {
        classroom_id: classroomId,
        course_id: selectedCourse.id,
        module_id: selectedModule.id,
        title: lessonForm.title.trim(),
        summary: lessonForm.summary.trim() || null,
        lesson_content: [{ type: 'rich_text', text: lessonForm.content.trim() }],
        estimated_minutes: Math.max(0, Number(lessonForm.estimated_minutes) || 0),
        prerequisite_lesson_id: lessonForm.prerequisite_lesson_id || null,
        available_from: lessonForm.available_from ? new Date(lessonForm.available_from).toISOString() : null,
        status: 'draft',
      });
      setLessonForm({ title: '', summary: '', content: '', estimated_minutes: '15', prerequisite_lesson_id: '', available_from: '' });
    }, 'Lesson added.');
  };

  const createQuiz = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCourse || !quizForm.title.trim()) return;
    void run(async () => {
      const quiz = await teacherStudioUpsertQuiz(academyId, {
        classroom_id: classroomId,
        course_id: selectedCourse.id,
        lesson_id: quizForm.lesson_id || null,
        title: quizForm.title.trim(),
        description: quizForm.instructions.trim() || null,
        passing_score: Math.min(100, Math.max(0, Number(quizForm.passing_score) || 60)),
        attempts_allowed: Math.max(1, Number(quizForm.attempts_allowed) || 1),
        time_limit_seconds: quizForm.time_limit_minutes ? Math.max(1, Number(quizForm.time_limit_minutes)) * 60 : null,
        status: 'draft',
      });
      setSelectedQuizId(quiz.id);
      setQuizForm({ title: '', instructions: '', lesson_id: '', passing_score: '60', attempts_allowed: '1', time_limit_minutes: '' });
    }, 'Quiz created as a draft.');
  };

  const createQuestion = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedQuiz || !questionForm.prompt.trim()) return;
    const options = splitLines(questionForm.options);
    let correctAnswer: unknown = questionForm.correct_answer.trim();
    if (questionForm.question_type === 'multiple_choice') correctAnswer = questionForm.correct_answer.split(',').map((item) => item.trim()).filter(Boolean);
    if (questionForm.question_type === 'true_false') correctAnswer = questionForm.correct_answer === 'true';
    if (questionForm.question_type === 'essay') correctAnswer = null;
    void run(async () => {
      await teacherStudioUpsertQuizQuestion(academyId, {
        classroom_id: classroomId,
        quiz_id: selectedQuiz.id,
        question_type: questionForm.question_type,
        prompt: questionForm.prompt.trim(),
        options,
        correct_answer: correctAnswer,
        points: Math.max(0.1, Number(questionForm.points) || 1),
        explanation: questionForm.explanation.trim() || null,
      });
      setQuestionForm({ question_type: 'single_choice', prompt: '', options: '', correct_answer: '', points: '1', explanation: '' });
    }, 'Question added.');
  };

  const createCategory = (event: FormEvent) => {
    event.preventDefault();
    if (!categoryForm.name.trim()) return;
    void run(async () => {
      await teacherStudioUpsertGradeCategory(academyId, {
        classroom_id: classroomId,
        name: categoryForm.name.trim(),
        weight: Math.max(0.01, Number(categoryForm.weight) || 1),
        drop_lowest: Math.max(0, Number(categoryForm.drop_lowest) || 0),
      });
      setCategoryForm({ name: '', weight: '1', drop_lowest: '0' });
    }, 'Grade category added.');
  };

  const createRubric = (event: FormEvent) => {
    event.preventDefault();
    const criteria = splitLines(rubricForm.criteria).map((line, index) => {
      const [name, description, maxPoints] = line.split('|').map((item) => item.trim());
      return { id: `criterion-${index + 1}`, name, description: description || '', max_points: Math.max(1, Number(maxPoints) || 5) };
    });
    if (!rubricForm.title.trim() || criteria.length === 0) return;
    void run(async () => {
      await teacherStudioUpsertRubric(academyId, { title: rubricForm.title.trim(), description: rubricForm.description.trim() || null, criteria, status: 'active' });
      setRubricForm({ title: '', description: '', criteria: '' });
    }, 'Rubric added.');
  };

  const gradeAttempt = (attempt: TeacherStudioQuizAttempt) => {
    const draft = attemptDrafts[attempt.id] ?? { score: String(attempt.score ?? ''), feedback: '' };
    const score = Number(draft.score);
    if (!Number.isFinite(score)) return;
    void run(
      () => teacherStudioGradeQuizAttempt(academyId, { attempt_id: attempt.id, score, max_score: attempt.max_score ?? undefined, feedback: draft.feedback.trim() || null }),
      'Quiz attempt graded.',
    );
  };

  if (!canManage) return null;

  return (
    <section className="grid curriculum-workspace">
      <div className="panel">
        <div className="row between wrap">
          <div>
            <h3>{translate("Curriculum and assessments")}</h3>
            <p className="muted">{translate("Build structured courses, publish sequenced lessons, run native quizzes, and configure grade policy.")}</p>
          </div>
          <button className="ghost-btn" type="button" onClick={() => void load()} disabled={busy}>{translate("Refresh curriculum")}</button>
        </div>
        <section className="stats-grid">
          <article className="stat-card"><span>{translate("Courses")}</span><strong>{curriculum.courses.length}</strong></article>
          <article className="stat-card"><span>{translate("Modules")}</span><strong>{curriculum.modules.length}</strong></article>
          <article className="stat-card"><span>{translate("Lessons")}</span><strong>{curriculum.lessons.length}</strong></article>
          <article className="stat-card"><span>{translate("Quizzes")}</span><strong>{quizzes.length}</strong></article>
          <article className="stat-card"><span>{translate("Needs grading")}</span><strong>{pendingAttempts.length}</strong></article>
        </section>
      </div>

      {error ? <div className="error-banner">{translate(error)}</div> : null}
      {notice ? <div className="info-banner">{translate(notice)}</div> : null}

      <div className="grid two">
        <div className="panel">
          <h3>{translate("Create course")}</h3>
          <form className="grid" onSubmit={createCourse}>
            <input className="input" placeholder={translate("Course title")} value={courseForm.title} onChange={(event) => setCourseForm((previous) => ({ ...previous, title: event.target.value }))} required />
            <div className="grid three">
              <input className="input" placeholder={translate("Code")} value={courseForm.code} onChange={(event) => setCourseForm((previous) => ({ ...previous, code: event.target.value }))} />
              <input className="input" placeholder={translate("Level")} value={courseForm.level} onChange={(event) => setCourseForm((previous) => ({ ...previous, level: event.target.value }))} />
              <input className="input" type="number" min="0" placeholder={translate("Minutes")} value={courseForm.estimated_minutes} onChange={(event) => setCourseForm((previous) => ({ ...previous, estimated_minutes: event.target.value }))} />
            </div>
            <textarea className="input" placeholder={translate("Course description")} value={courseForm.description} onChange={(event) => setCourseForm((previous) => ({ ...previous, description: event.target.value }))} />
            <button className="primary-btn" type="submit" disabled={busy}>{translate("Create and assign")}</button>
          </form>
        </div>

        <div className="panel">
          <div className="row between wrap">
            <div><h3>{translate("Course workspace")}</h3><p className="small muted">{translate("Choose the curriculum attached to this classroom.")}</p></div>
            {selectedCourse ? <span className={`status ${selectedCourse.status === 'published' ? 'status--ok' : 'status--pending'}`}>{selectedCourse.status}</span> : null}
          </div>
          <select className="input" aria-label={translate("Course workspace")} value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>
            {curriculum.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            {curriculum.courses.length === 0 ? <option value="">{translate("No courses yet")}</option> : null}
          </select>
          {selectedCourse ? (
            <div className="grid">
              <p>{selectedCourse.description || 'No course description yet.'}</p>
              <div className="row wrap">
                <span className="status">{selectedCourse.level || 'Open level'}</span>
                <span className="status">{selectedCourse.estimated_minutes} {translate("min")}</span>
                <button className="small-btn" type="button" disabled={busy || selectedCourse.status === 'published'} onClick={() => void run(() => teacherStudioPublishCourse(academyId, { course_id: selectedCourse.id, classroom_id: classroomId }), 'Course and lessons published.')}>{translate("Publish course")}</button>
              </div>
            </div>
          ) : <div className="empty-state">{translate("Create the first course to start authoring.")}</div>}
        </div>
      </div>

      {selectedCourse ? (
        <div className="grid two">
          <div className="panel">
            <h3>{translate("Modules")}</h3>
            <form className="grid" onSubmit={createModule}>
              <input className="input" placeholder={translate("Module title")} value={moduleForm.title} onChange={(event) => setModuleForm((previous) => ({ ...previous, title: event.target.value }))} required />
              <textarea className="input" placeholder={translate("Module description")} value={moduleForm.description} onChange={(event) => setModuleForm((previous) => ({ ...previous, description: event.target.value }))} />
              <button className="primary-btn" type="submit" disabled={busy}>{translate("Add module")}</button>
            </form>
            <ul className="list">
              {courseModules.map((module) => (
                <li key={module.id}>
                  <button className="small-btn" type="button" onClick={() => setSelectedModuleId(module.id)}>{module.title}</button>
                  <span className="small muted"> {curriculum.lessons.filter((lesson) => lesson.module_id === module.id).length} {translate("lessons")}</span>
                </li>
              ))}
              {courseModules.length === 0 ? <li>{translate("No modules yet.")}</li> : null}
            </ul>
          </div>

          <div className="panel">
            <h3>{translate("Lessons")}{' '}{selectedModule ? `— ${selectedModule.title}` : ''}</h3>
            {selectedModule ? (
              <form className="grid" onSubmit={createLesson}>
                <input className="input" placeholder={translate("Lesson title")} value={lessonForm.title} onChange={(event) => setLessonForm((previous) => ({ ...previous, title: event.target.value }))} required />
                <input className="input" placeholder={translate("Lesson summary")} value={lessonForm.summary} onChange={(event) => setLessonForm((previous) => ({ ...previous, summary: event.target.value }))} />
                <textarea className="input" placeholder={translate("Lesson content")} value={lessonForm.content} onChange={(event) => setLessonForm((previous) => ({ ...previous, content: event.target.value }))} />
                <div className="grid three">
                  <input className="input" type="number" min="0" value={lessonForm.estimated_minutes} onChange={(event) => setLessonForm((previous) => ({ ...previous, estimated_minutes: event.target.value }))} />
                  <select className="input" value={lessonForm.prerequisite_lesson_id} onChange={(event) => setLessonForm((previous) => ({ ...previous, prerequisite_lesson_id: event.target.value }))}>
                    <option value="">{translate("No prerequisite")}</option>
                    {courseLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
                  </select>
                  <input className="input" type="datetime-local" value={lessonForm.available_from} onChange={(event) => setLessonForm((previous) => ({ ...previous, available_from: event.target.value }))} />
                </div>
                <button className="primary-btn" type="submit" disabled={busy}>{translate("Add lesson")}</button>
              </form>
            ) : <p className="muted">{translate("Add a module first.")}</p>}
            <ul className="list">
              {moduleLessons.map((lesson) => <li key={lesson.id}><strong>{lesson.title}</strong><div className="small muted">{lesson.estimated_minutes} {translate("min ·")}{' '}{lesson.status}{lesson.prerequisite_lesson_id ? ' · prerequisite gated' : ''}</div></li>)}
              {selectedModule && moduleLessons.length === 0 ? <li>{translate("No lessons in this module yet.")}</li> : null}
            </ul>
          </div>
        </div>
      ) : null}

      {selectedCourse ? (
        <div className="grid two">
          <div className="panel">
            <h3>{translate("Native quizzes")}</h3>
            <form className="grid" onSubmit={createQuiz}>
              <input className="input" placeholder={translate("Quiz title")} value={quizForm.title} onChange={(event) => setQuizForm((previous) => ({ ...previous, title: event.target.value }))} required />
              <textarea className="input" placeholder={translate("Instructions")} value={quizForm.instructions} onChange={(event) => setQuizForm((previous) => ({ ...previous, instructions: event.target.value }))} />
              <select className="input" value={quizForm.lesson_id} onChange={(event) => setQuizForm((previous) => ({ ...previous, lesson_id: event.target.value }))}>
                <option value="">{translate("Course-level quiz")}</option>
                {courseLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
              </select>
              <div className="grid three">
                <input className="input" type="number" min="0" max="100" placeholder={translate("Pass %")} value={quizForm.passing_score} onChange={(event) => setQuizForm((previous) => ({ ...previous, passing_score: event.target.value }))} />
                <input className="input" type="number" min="1" placeholder={translate("Attempts")} value={quizForm.attempts_allowed} onChange={(event) => setQuizForm((previous) => ({ ...previous, attempts_allowed: event.target.value }))} />
                <input className="input" type="number" min="1" placeholder={translate("Minutes")} value={quizForm.time_limit_minutes} onChange={(event) => setQuizForm((previous) => ({ ...previous, time_limit_minutes: event.target.value }))} />
              </div>
              <button className="primary-btn" type="submit" disabled={busy}>{translate("Create quiz")}</button>
            </form>
            <select className="input" value={selectedQuiz?.id ?? ''} onChange={(event) => setSelectedQuizId(event.target.value)}>
              {courseQuizzes.map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.title} · {quiz.status}</option>)}
              {courseQuizzes.length === 0 ? <option value="">{translate("No quizzes yet")}</option> : null}
            </select>
            {selectedQuiz ? (
              <button className="small-btn" type="button" disabled={busy || selectedQuiz.status === 'published' || quizQuestions.length === 0} onClick={() => void run(() => teacherStudioUpsertQuiz(academyId, { id: selectedQuiz.id, classroom_id: classroomId, course_id: selectedQuiz.course_id, status: 'published' }), 'Quiz published.')}>{translate("Publish quiz")}</button>
            ) : null}
          </div>

          <div className="panel">
            <h3>{translate("Question builder")}</h3>
            {selectedQuiz ? (
              <form className="grid" onSubmit={createQuestion}>
                <select className="input" value={questionForm.question_type} onChange={(event) => setQuestionForm((previous) => ({ ...previous, question_type: event.target.value, correct_answer: '' }))}>
                  {['single_choice', 'multiple_choice', 'true_false', 'short_text', 'essay'].map((type) => <option key={type} value={type}>{translate(type.replace(/_/g, ' '))}</option>)}
                </select>
                <textarea className="input" placeholder={translate("Question prompt")} value={questionForm.prompt} onChange={(event) => setQuestionForm((previous) => ({ ...previous, prompt: event.target.value }))} required />
                {['single_choice', 'multiple_choice'].includes(questionForm.question_type) ? <textarea className="input" placeholder={translate("One option per line")} value={questionForm.options} onChange={(event) => setQuestionForm((previous) => ({ ...previous, options: event.target.value }))} /> : null}
                {questionForm.question_type === 'true_false' ? (
                  <select className="input" value={questionForm.correct_answer} onChange={(event) => setQuestionForm((previous) => ({ ...previous, correct_answer: event.target.value }))}><option value="">{translate("Correct answer")}</option><option value="true">{translate("True")}</option><option value="false">{translate("False")}</option></select>
                ) : questionForm.question_type !== 'essay' ? (
                  <input className="input" placeholder={questionForm.question_type === 'multiple_choice' ? 'Correct options, comma separated' : 'Correct answer'} value={questionForm.correct_answer} onChange={(event) => setQuestionForm((previous) => ({ ...previous, correct_answer: event.target.value }))} />
                ) : null}
                <div className="grid two"><input className="input" type="number" min="0.1" step="0.1" value={questionForm.points} onChange={(event) => setQuestionForm((previous) => ({ ...previous, points: event.target.value }))} /><input className="input" placeholder={translate("Answer explanation")} value={questionForm.explanation} onChange={(event) => setQuestionForm((previous) => ({ ...previous, explanation: event.target.value }))} /></div>
                <button className="primary-btn" type="submit" disabled={busy}>{translate("Add question")}</button>
              </form>
            ) : <p className="muted">{translate("Create or select a quiz first.")}</p>}
            <ul className="list">{quizQuestions.map((question) => <li key={question.id}><strong>{question.prompt}</strong><div className="small muted">{translate(question.question_type.replace(/_/g, ' '))} · {question.points} {translate("points")}</div></li>)}{selectedQuiz && quizQuestions.length === 0 ? <li>{translate("No questions yet.")}</li> : null}</ul>
          </div>
        </div>
      ) : null}

      {canGrade ? (
        <div className="grid two">
          <div className="panel">
            <h3>{translate("Grade categories")}</h3>
            <form className="grid" onSubmit={createCategory}>
              <input className="input" placeholder={translate("Category name")} value={categoryForm.name} onChange={(event) => setCategoryForm((previous) => ({ ...previous, name: event.target.value }))} required />
              <div className="grid two"><input className="input" type="number" min="0.01" step="0.01" placeholder={translate("Weight")} value={categoryForm.weight} onChange={(event) => setCategoryForm((previous) => ({ ...previous, weight: event.target.value }))} /><input className="input" type="number" min="0" placeholder={translate("Drop lowest")} value={categoryForm.drop_lowest} onChange={(event) => setCategoryForm((previous) => ({ ...previous, drop_lowest: event.target.value }))} /></div>
              <button className="primary-btn" type="submit" disabled={busy}>{translate("Add category")}</button>
            </form>
            <ul className="list">{categories.map((category) => <li key={category.id}><strong>{category.name}</strong><div className="small muted">{translate("Weight")}{' '}{category.weight} {translate("· drop")}{' '}{category.drop_lowest}</div></li>)}{categories.length === 0 ? <li>{translate("No weighted categories yet.")}</li> : null}</ul>
          </div>

          <div className="panel">
            <h3>{translate("Reusable rubrics")}</h3>
            <form className="grid" onSubmit={createRubric}>
              <input className="input" placeholder={translate("Rubric title")} value={rubricForm.title} onChange={(event) => setRubricForm((previous) => ({ ...previous, title: event.target.value }))} required />
              <input className="input" placeholder={translate("Description")} value={rubricForm.description} onChange={(event) => setRubricForm((previous) => ({ ...previous, description: event.target.value }))} />
              <textarea className="input" placeholder={translate("One criterion per line: Name | Description | Max points")} value={rubricForm.criteria} onChange={(event) => setRubricForm((previous) => ({ ...previous, criteria: event.target.value }))} required />
              <button className="primary-btn" type="submit" disabled={busy}>{translate("Add rubric")}</button>
            </form>
            <ul className="list">{rubrics.map((rubric) => <li key={rubric.id}><strong>{rubric.title}</strong><div className="small muted">{rubric.criteria.length} {translate("criteria")}</div></li>)}{rubrics.length === 0 ? <li>{translate("No rubrics yet.")}</li> : null}</ul>
          </div>
        </div>
      ) : null}

      {canGrade && pendingAttempts.length > 0 ? (
        <div className="panel">
          <h3>{translate("Quiz grading queue")}</h3>
          <div className="table-wrap"><table><thead><tr><th>{translate("Attempt")}</th><th>{translate("Auto score")}</th><th>{translate("Final score")}</th><th>{translate("Feedback")}</th><th /></tr></thead><tbody>{pendingAttempts.map((attempt) => {
            const draft = attemptDrafts[attempt.id] ?? { score: String(attempt.score ?? ''), feedback: '' };
            return <tr key={attempt.id}><td>{translate("Student")}{' '}{attempt.contact_id.slice(0, 8)} · #{attempt.attempt_number}</td><td>{attempt.score ?? '-'}/{attempt.max_score ?? '-'}</td><td><input className="input compact-input" type="number" min="0" max={attempt.max_score ?? undefined} value={draft.score} onChange={(event) => setAttemptDrafts((previous) => ({ ...previous, [attempt.id]: { ...draft, score: event.target.value } }))} /></td><td><input className="input compact-input" value={draft.feedback} onChange={(event) => setAttemptDrafts((previous) => ({ ...previous, [attempt.id]: { ...draft, feedback: event.target.value } }))} /></td><td><button className="small-btn" type="button" disabled={busy} onClick={() => gradeAttempt(attempt)}>{translate("Save")}</button></td></tr>;
          })}</tbody></table></div>
        </div>
      ) : null}
    </section>
  );
};
