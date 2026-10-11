import { translate } from '../../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readQuizDraft, writeQuizDraft, removeQuizDraft, type QuizDraftScope } from '../../lib/quizDraft';
import {
  academyVideoPlayback,
  teacherStudioSetLessonProgress,
  teacherStudioStartQuiz,
  teacherStudioStudentCurriculum,
  teacherStudioSubmitQuiz,
  type TeacherStudioLesson,
  type TeacherStudioQuiz,
  type TeacherStudioQuizAttempt,
  type TeacherStudioQuizQuestion,
  type TeacherStudioStudentCurriculum,
} from '../../lib/client';

type StudentCurriculumViewProps = {
  actorId: string;
  academyId: string;
  classroomId: string;
};

const lessonText = (lesson: TeacherStudioLesson): string => {
  const content = lesson.content;
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (block && typeof block === 'object' && !Array.isArray(block)) return String((block as Record<string, unknown>).text ?? '');
      return String(block ?? '');
    }).filter(Boolean).join('\n');
  }
  if (content && typeof content === 'object') return String((content as Record<string, unknown>).text ?? '');
  return '';
};

export const StudentCurriculumView = ({ actorId, academyId, classroomId }: StudentCurriculumViewProps) => {
  const [curriculum, setCurriculum] = useState<TeacherStudioStudentCurriculum | null>(null);
  const [expandedLessonId, setExpandedLessonId] = useState('');
  const [activeQuiz, setActiveQuiz] = useState<TeacherStudioQuiz | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<TeacherStudioQuizAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const busy = loading || actionBusy;
  const visitRef = useRef(0);
  const readRef = useRef(0);
  const actionRef = useRef(false);
  const answersRef = useRef<Record<string, unknown>>({});
  const draftRef = useRef<QuizDraftScope | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [videoFrame, setVideoFrame] = useState<{ assetId: string; url: string } | null>(null);
  const [draftError, setDraftError] = useState('');

  useEffect(() => () => { visitRef.current += 1; }, []);

  const load = useCallback(async () => {
    const visit = visitRef.current;
    const request = ++readRef.current;
    const isCurrent = () => visit === visitRef.current && request === readRef.current;
    setLoading(true);
    setError('');
    try {
      const result = await teacherStudioStudentCurriculum(academyId, classroomId);
      if (isCurrent()) setCurriculum(result);
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [academyId, classroomId]);

  useEffect(() => { void load(); }, [load]);

  const progressByLesson = useMemo(
    () => new Map((curriculum?.progress ?? []).map((progress) => [progress.lesson_id, progress])),
    [curriculum?.progress],
  );
  const questionsForQuiz = useMemo(
    () => (curriculum?.questions ?? []).filter((question) => question.quiz_id === activeQuiz?.id),
    [activeQuiz?.id, curriculum?.questions],
  );
  const latestAttemptByQuiz = useMemo(() => {
    const result = new Map<string, TeacherStudioQuizAttempt>();
    for (const attempt of curriculum?.attempts ?? []) {
      if (!result.has(attempt.quiz_id) || attempt.attempt_number > (result.get(attempt.quiz_id)?.attempt_number ?? 0)) result.set(attempt.quiz_id, attempt);
    }
    return result;
  }, [curriculum?.attempts]);

  const markLesson = async (lesson: TeacherStudioLesson, status: 'in_progress' | 'completed') => {
    if (actionRef.current || loading) return;
    actionRef.current = true;
    const visit = visitRef.current;
    setActionBusy(true);
    setError('');
    try {
      await teacherStudioSetLessonProgress(academyId, { classroom_id: classroomId, lesson_id: lesson.id, status });
      if (visit !== visitRef.current) return;
      setNotice(status === 'completed' ? 'Lesson completed.' : 'Lesson started.');
      await load();
    } catch (err) {
      if (visit === visitRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (visit === visitRef.current) { actionRef.current = false; setActionBusy(false); }
    }
  };

  const watchVideo = async (assetId: string) => {
    if (actionRef.current || loading) return;
    actionRef.current = true;
    const visit = visitRef.current;
    setActionBusy(true);
    setError('');
    try {
      const playback = await academyVideoPlayback(academyId, assetId);
      if (visit !== visitRef.current) return;
      setVideoFrame({ assetId, url: playback.iframe_url });
    } catch (err) {
      if (visit === visitRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (visit === visitRef.current) { actionRef.current = false; setActionBusy(false); }
    }
  };

  const startQuiz = async (quiz: TeacherStudioQuiz) => {
    if (actionRef.current || loading) return;
    actionRef.current = true;
    const visit = visitRef.current;
    setActionBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await teacherStudioStartQuiz(academyId, { classroom_id: classroomId, quiz_id: quiz.id });
      if (visit !== visitRef.current) return;
      if (result.attempt.classroom_id !== classroomId || result.attempt.quiz_id !== quiz.id || result.attempt.status !== 'in_progress') throw new Error('The quiz attempt does not belong to this classroom.');
      const scope = { actorId, academyId, classroomId, quizId: quiz.id, attemptId: result.attempt.id };
      const restored = result.resumed ? readQuizDraft(scope, (curriculum?.questions ?? []).filter(question => question.quiz_id === quiz.id)) : {};
      draftRef.current = scope;
      answersRef.current = restored;
      setActiveQuiz(quiz);
      setActiveAttempt(result.attempt);
      setAnswers(restored);
      setDraftError('');
      if (result.resumed) setNotice('Resumed your open quiz attempt.');
    } catch (err) {
      if (visit === visitRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (visit === visitRef.current) { actionRef.current = false; setActionBusy(false); }
    }
  };

  const submitQuiz = async () => {
    if (!activeAttempt || actionRef.current || loading) return;
    actionRef.current = true;
    const visit = visitRef.current;
    const submittedDraft = draftRef.current;
    setActionBusy(true);
    setError('');
    try {
      const attempt = await teacherStudioSubmitQuiz(academyId, { classroom_id: classroomId, attempt_id: activeAttempt.id, answers: answersRef.current });
      if (attempt.id !== activeAttempt.id || attempt.classroom_id !== classroomId || attempt.quiz_id !== activeAttempt.quiz_id) throw new Error('The quiz attempt does not belong to this classroom.');
      // A confirmed submission removes its draft even if the learner has left this view.
      if (submittedDraft && ['submitted', 'graded'].includes(attempt.status)) removeQuizDraft(submittedDraft);
      if (visit !== visitRef.current) return;
      setActiveAttempt(attempt);
      setNotice(attempt.status === 'submitted' ? 'Quiz submitted for teacher grading.' : `Quiz graded: ${attempt.percentage ?? 0}%.`);
      await load();
    } catch (err) {
      if (visit === visitRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (visit === visitRef.current) { actionRef.current = false; setActionBusy(false); }
    }
  };

  const saveAnswer = (id: string, value: unknown) => {
    if (actionRef.current || loading) return;
    const next = { ...answersRef.current, [id]: value };
    answersRef.current = next;
    setAnswers(next);
    if (draftRef.current) setDraftError(writeQuizDraft(draftRef.current, next) ? '' : 'Your quiz answers cannot be saved in this browser tab. Keep the quiz open until you submit.');
  };

  const setChoiceAnswer = (question: TeacherStudioQuizQuestion, value: string, checked: boolean) => {
    if (question.question_type !== 'multiple_choice') {
      saveAnswer(question.id, value);
      return;
    }
    const current = Array.isArray(answersRef.current[question.id]) ? answersRef.current[question.id] as string[] : [];
    saveAnswer(question.id, checked ? [...new Set([...current, value])] : current.filter(item => item !== value));
  };

  const renderQuestion = (question: TeacherStudioQuizQuestion) => {
    if (['single_choice', 'multiple_choice'].includes(question.question_type)) {
      const selected = answers[question.id];
      return (
        <div className="grid">
          {(question.options ?? []).map((rawOption) => {
            const option = String(rawOption);
            const checked = question.question_type === 'multiple_choice'
              ? Array.isArray(selected) && selected.map(String).includes(option)
              : String(selected ?? '') === option;
            return (
              <label className="row" key={option}>
                <input type={question.question_type === 'multiple_choice' ? 'checkbox' : 'radio'} name={question.id} checked={checked} disabled={busy} onChange={(event) => setChoiceAnswer(question, option, event.target.checked)} />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      );
    }
    if (question.question_type === 'true_false') {
      return (
        <select className="input" value={String(answers[question.id] ?? '')} disabled={busy} onChange={(event) => saveAnswer(question.id, event.target.value === '' ? undefined : event.target.value === 'true')}>
          <option value="">{translate("Choose an answer")}</option><option value="true">{translate("True")}</option><option value="false">{translate("False")}</option>
        </select>
      );
    }
    return (
      <textarea className="input" placeholder={question.question_type === 'essay' ? 'Write your response' : 'Your answer'} value={String(answers[question.id] ?? '')} disabled={busy} onChange={(event) => saveAnswer(question.id, event.target.value)} />
    );
  };

  if (!curriculum && busy) return <div className="panel">{translate("Loading curriculum…")}</div>;

  return (
    <section className="grid student-curriculum">
      {error ? <div className="error-banner">{translate(error)}</div> : null}
      {notice ? <div className="info-banner">{translate(notice)}</div> : null}
      {draftError ? <div className="error-banner" role="alert">{translate(draftError)}</div> : null}
      {(curriculum?.courses ?? []).map((course) => {
        const modules = curriculum?.modules.filter((module) => module.course_id === course.id) ?? [];
        const courseLessons = curriculum?.lessons.filter((lesson) => lesson.course_id === course.id) ?? [];
        const completed = courseLessons.filter((lesson) => progressByLesson.get(lesson.id)?.status === 'completed').length;
        const courseQuizzes = curriculum?.quizzes.filter((quiz) => quiz.course_id === course.id) ?? [];
        return (
          <article className="panel" key={course.id}>
            <div className="row between wrap">
              <div><h3>{course.title}</h3><p className="muted">{course.description || course.level || 'Structured learning path'}</p></div>
              <span className="status status--ok">{completed}/{courseLessons.length} {translate("lessons")}</span>
            </div>
            <progress className="course-progress" max={Math.max(1, courseLessons.length)} value={completed} />
            <div className="grid two">
              <div>
                {modules.map((module) => (
                  <section className="curriculum-module" key={module.id}>
                    <h4>{module.title}</h4>
                    {module.description ? <p className="small muted">{module.description}</p> : null}
                    <ul className="list">
                      {(curriculum?.lessons ?? []).filter((lesson) => lesson.module_id === module.id).map((lesson) => {
                        const progress = progressByLesson.get(lesson.id);
                        const expanded = expandedLessonId === lesson.id;
                        const lessonMedia = (curriculum?.media ?? []).filter((media) => media.lesson_id === lesson.id);
                        return (
                          <li key={lesson.id}>
                            <div className="row between wrap">
                              <div><strong>{lesson.title}</strong><div className="small muted">{lesson.estimated_minutes} {translate("min")}{lesson.locked ? ' · locked' : ''}</div></div>
                              <span className={progress?.status === 'completed' ? 'status status--ok' : lesson.locked ? 'status status--pending' : 'status'}>{progress?.status ?? (lesson.locked ? 'locked' : 'not started')}</span>
                            </div>
                            {lesson.summary ? <p>{lesson.summary}</p> : null}
                            <div className="row wrap">
                              <button className="small-btn" type="button" disabled={lesson.locked} onClick={() => { setExpandedLessonId(expanded ? '' : lesson.id); if (!progress && !lesson.locked) void markLesson(lesson, 'in_progress'); }}>{translate(expanded ? 'Close lesson' : 'Open lesson')}</button>
                              {progress?.status !== 'completed' ? <button className="small-btn" type="button" disabled={busy || lesson.locked} onClick={() => void markLesson(lesson, 'completed')}>{translate("Mark complete")}</button> : null}
                            </div>
                            {expanded ? <div className="lesson-content">
                              <p>{lessonText(lesson) || translate('No written lesson content has been published.')}</p>
                              {lessonMedia.map((media) => <div className="managed-video" key={media.id}>
                                <div className="row between wrap"><div><strong>{media.title}</strong><div className="small muted">{media.duration_seconds ? `${Math.ceil(media.duration_seconds / 60)} ${translate('min')}` : translate('Recorded lesson')}</div></div><button className="small-btn" type="button" disabled={busy} onClick={() => void watchVideo(media.video_asset_id)}>{translate('Watch lesson')}</button></div>
                                {videoFrame?.assetId === media.video_asset_id ? <div className="managed-video__frame"><iframe src={videoFrame.url} title={media.title} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div> : null}
                              </div>)}
                            </div> : null}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
              <div>
                <h4>{translate("Assessments")}</h4>
                <ul className="list">
                  {courseQuizzes.map((quiz) => {
                    const latest = latestAttemptByQuiz.get(quiz.id);
                    return (
                      <li key={quiz.id}>
                        <div className="row between wrap"><strong>{quiz.title}</strong><span className={latest?.passed ? 'status status--ok' : latest ? 'status status--pending' : 'status'}>{latest ? `${latest.percentage ?? '-'}%` : 'not attempted'}</span></div>
                        <div className="small muted">{translate("Pass")}{' '}{quiz.passing_score}% · {quiz.attempts_allowed} {translate("attempt")}{quiz.attempts_allowed === 1 ? '' : 's'}{quiz.time_limit_seconds ? ` · ${Math.ceil(quiz.time_limit_seconds / 60)} min` : ''}{quiz.locked ? ' · locked by lesson prerequisite' : ''}</div>
                        <button className="small-btn" type="button" disabled={busy || quiz.locked || latest?.status === 'submitted'} onClick={() => void startQuiz(quiz)}>{latest?.status === 'in_progress' ? 'Resume quiz' : 'Start quiz'}</button>
                      </li>
                    );
                  })}
                  {courseQuizzes.length === 0 ? <li>{translate("No assessments published yet.")}</li> : null}
                </ul>
              </div>
            </div>
          </article>
        );
      })}
      {(curriculum?.courses ?? []).length === 0 ? <div className="panel">{translate("No published curriculum is assigned to this classroom yet.")}</div> : null}

      {activeQuiz && activeAttempt?.status === 'in_progress' ? (
        <section className="panel quiz-attempt-panel">
          <div className="row between wrap"><div><h3>{activeQuiz.title}</h3><p className="muted">{translate("Attempt")}{' '}{activeAttempt.attempt_number}</p></div><span className="status status--pending">{translate("in progress")}</span></div>
          {activeQuiz.instructions ? <p>{activeQuiz.instructions}</p> : null}
          <div className="grid">
            {questionsForQuiz.map((question, index) => <article className="quiz-question" key={question.id}><div className="row between"><strong>{index + 1}. {question.prompt}</strong><span className="small muted">{question.points} {translate("pts")}</span></div>{renderQuestion(question)}</article>)}
          </div>
          <button className="primary-btn" type="button" disabled={busy || questionsForQuiz.length === 0} onClick={() => void submitQuiz()}>{translate("Submit quiz")}</button>
        </section>
      ) : null}
    </section>
  );
};
