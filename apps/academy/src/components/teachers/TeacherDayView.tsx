import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  ExternalLink,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Send,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatLocaleLongDate, translate } from '../../i18n';
import {
  teacherStudioFinishTeacherLesson,
  teacherStudioSaveTeacherAttendance,
  teacherStudioStartTeacherLesson,
  teacherStudioTeacherDay,
  type TeacherDay,
  type TeacherDaySession,
  type TeacherLessonCoverage,
} from '../../lib/client';

type TeacherDayViewProps = {
  academyId: string;
  academyName: string;
  onNavigate: (path: string) => void;
};
type HomeworkState = { title: string; description: string; due_at: string };
type AttendanceState = Record<string, { status: string; notes: string }>;

const localDate = (date = new Date()): string => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
};

const moveDate = (value: string, days: number): string => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
};

const datetimeLocal = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const timeLabel = (value: string): string => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const makeKey = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const sessionTone = (session: TeacherDaySession): string => {
  if (session.run?.status === 'finished' || session.status === 'completed') return 'is-finished';
  if (session.run?.status === 'in_progress' || session.status === 'in_progress') return 'is-live';
  if (new Date(session.ends_at).getTime() < Date.now()) return 'is-past';
  return 'is-next';
};

export const TeacherDayView = ({ academyId, academyName, onNavigate }: TeacherDayViewProps) => {
  const [date, setDate] = useState(localDate());
  const [day, setDay] = useState<TeacherDay | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attendance, setAttendance] = useState<AttendanceState>({});
  const [coverage, setCoverage] = useState<TeacherLessonCoverage[]>([]);
  const [teacherNotes, setTeacherNotes] = useState('');
  const [homework, setHomework] = useState<HomeworkState>({ title: '', description: '', due_at: '' });
  const [assignHomework, setAssignHomework] = useState(true);

  const load = useCallback(async (requestedDate = date) => {
    setLoading(true); setError('');
    try {
      const response = await teacherStudioTeacherDay(academyId, requestedDate);
      setDay(response);
      setSelectedId((current) => response.sessions.some((session) => session.id === current)
        ? current
        : response.sessions.find((session) => session.run?.status === 'in_progress')?.id
          ?? response.sessions.find((session) => new Date(session.ends_at).getTime() >= Date.now())?.id
          ?? response.sessions[0]?.id ?? '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : translate('The teaching day could not load'));
    } finally {
      setLoading(false);
    }
  }, [academyId, date]);

  useEffect(() => { void load(date); }, [academyId, date, load]);

  const selected = useMemo(() => day?.sessions.find((session) => session.id === selectedId) ?? null, [day, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setAttendance(Object.fromEntries(selected.roster.map((student) => [student.contact_id, {
      status: student.status ?? 'present', notes: student.notes ?? '',
    }])));
    setCoverage((selected.run?.coverage as TeacherLessonCoverage[] | undefined) ?? selected.curriculum.objectives);
    setTeacherNotes(typeof selected.run?.teacher_notes === 'string' ? selected.run.teacher_notes : '');
    const savedHomework = selected.run?.homework_draft && typeof selected.run.homework_draft === 'object' && !Array.isArray(selected.run.homework_draft)
      ? selected.run.homework_draft as Record<string, unknown> : selected.homework;
    setHomework({
      title: String(savedHomework.title ?? selected.homework.title),
      description: String(savedHomework.description ?? selected.homework.description),
      due_at: datetimeLocal(String(savedHomework.due_at ?? selected.homework.due_at)),
    });
    setAssignHomework(Boolean(selected.run?.homework_assignment_id) || selected.run?.status !== 'finished');
  }, [selected]);

  const runAction = async (key: string, task: () => Promise<void>) => {
    setBusy(key); setError(''); setNotice('');
    try { await task(); } catch (actionError) { setError(actionError instanceof Error ? actionError.message : translate('The action could not be completed')); }
    finally { setBusy(''); }
  };

  const saveAttendance = () => selected && runAction('attendance', async () => {
    await teacherStudioSaveTeacherAttendance(academyId, {
      session_id: selected.id,
      records: selected.roster.map((student) => ({
        contact_id: student.contact_id,
        status: attendance[student.contact_id]?.status ?? 'present',
        notes: attendance[student.contact_id]?.notes || null,
      })),
      idempotency_key: makeKey(),
    });
    setNotice(translate('Attendance saved for {count} students', { count: selected.roster.length }));
    await load(date);
  });

  const startLesson = () => selected && runAction('start', async () => {
    await teacherStudioStartTeacherLesson(academyId, { session_id: selected.id, idempotency_key: makeKey() });
    setNotice(translate('Lesson started. The plan and timer are now live.'));
    await load(date);
  });

  const finishLesson = () => selected && runAction('finish', async () => {
    if (selected.roster.length && !selected.attendance_saved) throw new Error(translate('Save attendance before finishing the lesson.'));
    if (selected.run?.status !== 'in_progress') throw new Error(translate('Start the lesson before finishing it.'));
    await teacherStudioFinishTeacherLesson(academyId, {
      session_id: selected.id,
      coverage,
      teacher_notes: teacherNotes || null,
      homework: { ...homework, due_at: homework.due_at ? new Date(homework.due_at).toISOString() : '' },
      assign_homework: assignHomework,
      idempotency_key: makeKey(),
    });
    setNotice(assignHomework
      ? translate('Lesson finished and homework assigned. Connected class groups will be notified automatically.')
      : translate('Lesson finished. Curriculum coverage has been saved.'));
    await load(date);
  });

  const finished = selected?.run?.status === 'finished' || selected?.status === 'completed';
  const inProgress = selected?.run?.status === 'in_progress' || selected?.status === 'in_progress';
  const coveredCount = coverage.filter((item) => item.covered).length;

  return (
    <section className="teacher-day" aria-labelledby="teacher-day-title">
      <header className="teacher-day__hero">
        <div>
          <span className="eyebrow">{academyName} · {translate('Teaching workspace')}</span>
          <h2 id="teacher-day-title">{translate('Your teaching day')}</h2>
          <p>{translate('Everything for each class—from attendance to homework—stays in one guided flow.')}</p>
        </div>
        <div className="teacher-day__date-control">
          <button type="button" aria-label={translate('Previous day')} onClick={() => setDate((current) => moveDate(current, -1))}><ArrowLeft size={17} /></button>
          <button type="button" className="teacher-day__date" onClick={() => setDate(localDate())}>
            <CalendarDays size={18} /><span>{date === localDate() ? translate('Today') : formatLocaleLongDate(new Date(`${date}T12:00:00`))}</span>
          </button>
          <button type="button" aria-label={translate('Next day')} onClick={() => setDate((current) => moveDate(current, 1))}><ArrowRight size={17} /></button>
          <button type="button" aria-label={translate('Refresh teaching day')} onClick={() => void load(date)}><RefreshCw size={17} /></button>
        </div>
      </header>

      {error ? <div className="error-banner" role="alert">{translate(error)}</div> : null}
      {notice ? <div className="info-banner" role="status"><CheckCircle2 size={17} />{notice}</div> : null}

      {loading && !day ? <div className="teacher-day__loading"><LoaderCircle className="spin" /><span>{translate('Preparing your classes...')}</span></div> : null}

      {day ? (
        <>
          <dl className="teacher-day__pulse" aria-label={translate('Teaching day status')}>
            <div><dt>{translate('Classes')}</dt><dd>{day.counts.sessions}</dd></div>
            <div><dt>{translate('Students')}</dt><dd>{day.counts.students}</dd></div>
            <div><dt>{translate('Attendance left')}</dt><dd>{day.counts.attendance_pending}</dd></div>
            <div><dt>{translate('Lesson wrap-ups')}</dt><dd>{day.counts.homework_pending}</dd></div>
          </dl>

          {day.sessions.length ? (
            <div className="teacher-day__layout">
              <aside className="teacher-day__timeline" aria-label={translate("Today's classes")}>
                <div className="section-heading"><div><span className="eyebrow">{translate('Schedule')}</span><h3>{translate('Classes')}</h3></div><span className="ledger-count">{day.sessions.length}</span></div>
                {day.sessions.map((session) => (
                  <button type="button" className={`teacher-session-card ${sessionTone(session)} ${selectedId === session.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(session.id)} key={session.id}>
                    <span className="teacher-session-card__time">{timeLabel(session.starts_at)}</span>
                    <span className="teacher-session-card__rail"><i /></span>
                    <span className="teacher-session-card__copy">
                      <strong>{session.classroom_name}</strong>
                      <small>{session.curriculum.lesson_title}</small>
                      <em>{session.room_name || translate(session.delivery_mode)} · {translate(session.run?.status ?? session.status)}</em>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </aside>

              {selected ? (
                <div className="teacher-lesson-flow">
                  <header className="teacher-lesson-flow__header">
                    <div>
                      <span className="eyebrow">{timeLabel(selected.starts_at)}–{timeLabel(selected.ends_at)} · {selected.room_name || translate(selected.delivery_mode)}</span>
                      <h2>{selected.classroom_name}</h2>
                      <p>{selected.curriculum.course_title ? `${selected.curriculum.course_title} · ` : ''}{selected.curriculum.module_title ?? translate('Curriculum ready')}</p>
                    </div>
                    <span className={`teacher-live-status ${finished ? 'is-finished' : inProgress ? 'is-live' : ''}`}>
                      {inProgress ? <><i />{translate('Lesson live')}</> : finished ? <><Check size={15} />{translate('Finished')}</> : translate('Ready to start')}
                    </span>
                  </header>

                  <ol className="teacher-flow-steps" aria-label={translate('Lesson flow')}>
                    <li className="is-done"><Check size={14} /><span>{translate('Plan')}</span></li>
                    <li className={selected.attendance_saved ? 'is-done' : 'is-current'}>{selected.attendance_saved ? <Check size={14} /> : <span>2</span>}<span>{translate('Attendance')}</span></li>
                    <li className={finished ? 'is-done' : inProgress ? 'is-current' : ''}>{finished ? <Check size={14} /> : <span>3</span>}<span>{translate('Teach')}</span></li>
                    <li className={finished ? 'is-done' : ''}>{finished ? <Check size={14} /> : <span>4</span>}<span>{translate('Finish')}</span></li>
                  </ol>

                  <section className="teacher-flow-card teacher-plan-card">
                    <div className="teacher-flow-card__heading"><span className="teacher-flow-card__icon"><BookOpenCheck size={20} /></span><div><span className="eyebrow">{translate('Today’s curriculum')}</span><h3>{selected.curriculum.lesson_title}</h3></div><strong>{translate('{count} min', { count: selected.curriculum.estimated_minutes })}</strong></div>
                    {selected.curriculum.lesson_summary ? <p>{selected.curriculum.lesson_summary}</p> : null}
                    <div className="teacher-objectives">
                      {coverage.map((objective, index) => (
                        <label key={objective.id} className={objective.covered ? 'is-covered' : ''}>
                          <input type="checkbox" checked={objective.covered} disabled={finished} onChange={(event) => setCoverage((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, covered: event.target.checked } : item))} />
                          <span>{objective.covered ? <CheckCircle2 size={18} /> : <Circle size={18} />}{objective.label}</span>
                        </label>
                      ))}
                    </div>
                    {selected.resources.length ? <div className="teacher-resources"><span>{translate('Ready resources')}</span>{selected.resources.map((resource) => resource.url ? <a href={resource.url} target="_blank" rel="noreferrer" key={resource.id}>{resource.title}<ExternalLink size={13} /></a> : <span key={resource.id}>{resource.title}</span>)}</div> : <p className="teacher-flow-hint">{translate('No lesson-specific resources are attached yet. The class can still continue.')}</p>}
                  </section>

                  <section className="teacher-flow-card">
                    <div className="teacher-flow-card__heading"><span className="teacher-flow-card__icon"><UsersRound size={20} /></span><div><span className="eyebrow">{translate('Step 2')}</span><h3>{translate('Attendance')}</h3></div><strong>{selected.roster.length}</strong></div>
                    <div className="teacher-attendance-list">
                      {selected.roster.map((student) => (
                        <div key={student.contact_id}>
                          <label><span>{student.name}</span><select value={attendance[student.contact_id]?.status ?? 'present'} disabled={finished} onChange={(event) => setAttendance((current) => ({ ...current, [student.contact_id]: { status: event.target.value, notes: current[student.contact_id]?.notes ?? '' } }))}><option value="present">{translate('Present')}</option><option value="late">{translate('Late')}</option><option value="absent">{translate('Absent')}</option><option value="excused">{translate('Excused')}</option></select></label>
                          {['late', 'absent', 'excused'].includes(attendance[student.contact_id]?.status) ? <input className="input" value={attendance[student.contact_id]?.notes ?? ''} disabled={finished} placeholder={translate('Optional note')} onChange={(event) => setAttendance((current) => ({ ...current, [student.contact_id]: { status: current[student.contact_id]?.status ?? 'present', notes: event.target.value } }))} /> : null}
                        </div>
                      ))}
                      {!selected.roster.length ? <p>{translate('No active students are enrolled in this class.')}</p> : null}
                    </div>
                    {!finished ? <button className="ghost-btn" type="button" disabled={busy === 'attendance' || !selected.roster.length} onClick={() => void saveAttendance()}>{busy === 'attendance' ? <LoaderCircle className="spin" size={17} /> : <ClipboardCheck size={17} />}{selected.attendance_saved ? translate('Update attendance') : translate('Save attendance')}</button> : null}
                  </section>

                  {!inProgress && !finished ? (
                    <section className="teacher-start-panel">
                      <div><Sparkles size={22} /><span><strong>{translate('Everything is ready')}</strong><small>{translate('The curriculum, roster, resources, and homework draft are already attached.')}</small></span></div>
                      <button className="primary-btn" type="button" disabled={busy === 'start'} onClick={() => void startLesson()}>{busy === 'start' ? <LoaderCircle className="spin" size={17} /> : null}{translate('Start lesson')}</button>
                    </section>
                  ) : null}

                  {(inProgress || finished) ? (
                    <section className="teacher-flow-card teacher-finish-card">
                      <div className="teacher-flow-card__heading"><span className="teacher-flow-card__icon"><CheckCircle2 size={20} /></span><div><span className="eyebrow">{translate('Step 4')}</span><h3>{translate('Finish lesson')}</h3></div><strong>{coveredCount}/{coverage.length}</strong></div>
                      <label><span>{translate('Private teacher notes')}</span><textarea className="input" rows={3} value={teacherNotes} disabled={finished} onChange={(event) => setTeacherNotes(event.target.value)} placeholder={translate('What should you remember before the next lesson?')} /></label>
                      <label className="teacher-homework-toggle"><input type="checkbox" checked={assignHomework} disabled={finished} onChange={(event) => setAssignHomework(event.target.checked)} /><span><strong>{translate('Assign proposed homework')}</strong><small>{selected.connected_group_count > 0 ? translate('The connected class group will be notified automatically.') : translate('The assignment will appear in the student workspace. Connect a class group to notify Telegram too.')}</small></span></label>
                      {assignHomework ? <div className="teacher-homework-form"><label><span>{translate('Homework title')}</span><input className="input" value={homework.title} disabled={finished} onChange={(event) => setHomework((current) => ({ ...current, title: event.target.value }))} /></label><label><span>{translate('Instructions')}</span><textarea className="input" rows={4} value={homework.description} disabled={finished} onChange={(event) => setHomework((current) => ({ ...current, description: event.target.value }))} /></label><label><span>{translate('Due date')}</span><input className="input" type="datetime-local" value={homework.due_at} disabled={finished} onChange={(event) => setHomework((current) => ({ ...current, due_at: event.target.value }))} /></label></div> : null}
                      {!finished ? <button className="primary-btn teacher-finish-button" type="button" disabled={busy === 'finish'} onClick={() => void finishLesson()}>{busy === 'finish' ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}{translate('Finish lesson')}</button> : <div className="teacher-finished-message"><CheckCircle2 size={20} /><span><strong>{translate('Lesson complete')}</strong><small>{selected.run?.homework_assignment_id ? translate('Coverage and homework are saved. No separate Telegram message is needed.') : translate('Curriculum coverage and notes are saved.')}</small></span></div>}
                    </section>
                  ) : null}

                  <footer className="teacher-lesson-links">
                    <button type="button" onClick={() => onNavigate(`/academy/teacher/classrooms/${selected.classroom_id}`)}><BookOpenCheck size={16} />{translate('Open class resources')}<ChevronRight size={15} /></button>
                    <button type="button" onClick={() => onNavigate('/academy/teacher/os')}><ClipboardCheck size={16} />{translate('Curriculum and grading')}<ChevronRight size={15} /></button>
                    <button type="button" onClick={() => onNavigate('/academy/teacher/inbox')}><MessageSquareText size={16} />{translate('Message students')}<ChevronRight size={15} /></button>
                    <button type="button" onClick={() => onNavigate('/telegram')}><Send size={16} />{translate('Open Telegram assistant')}<ChevronRight size={15} /></button>
                  </footer>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="teacher-day__empty"><CalendarDays size={28} /><div><h3>{translate('No classes scheduled for this day')}</h3><p>{translate('Choose another day or ask the academic office to update the timetable.')}</p></div></div>
          )}
        </>
      ) : null}
    </section>
  );
};
