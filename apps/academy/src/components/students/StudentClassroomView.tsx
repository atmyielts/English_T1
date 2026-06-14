import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  teacherStudioClassroomChat,
  teacherStudioCreateClickTuitionPayment,
  teacherStudioSendClassroomChatMessage,
  teacherStudioSetClassroomResourceProgress,
  teacherStudioStudentAssignments,
  teacherStudioStudentAttendance,
  teacherStudioStudentBilling,
  teacherStudioSubmitStudentAssignment,
  type TeacherStudioAnnouncement,
  type TeacherStudioAttendance,
  type TeacherStudioClassroom,
  type TeacherStudioClassroomMembership,
  type TeacherStudioClassroomResource,
  type TeacherStudioClassroomRoom,
  type TeacherStudioMessage,
  type TeacherStudioStudentAssignment,
  type TeacherStudioStudentBillingItem,
} from '../../lib/client';

type StudentClassroomViewProps = {
  classroom: TeacherStudioClassroom | null;
  academyName: string;
  memberships: TeacherStudioClassroomMembership[];
  announcements: TeacherStudioAnnouncement[];
  messages: TeacherStudioMessage[];
  formatDate: (iso: string | null | undefined) => string;
  onBack: () => void;
};

type StudentLmsTab = 'overview' | 'resources' | 'assignments' | 'grades' | 'attendance' | 'billing' | 'chat';

const metadataClassroomId = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).classroom_id;
  if (!value) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const statusClass = (status: string): string => {
  const normalized = status.toLowerCase();
  if (['paid', 'active', 'graded', 'submitted', 'present'].includes(normalized)) return 'status status--ok';
  if (['pending', 'late', 'missing'].includes(normalized)) return 'status status--pending';
  if (['failed', 'canceled', 'absent'].includes(normalized)) return 'status status--bad';
  return 'status';
};

const money = (amount: number, currency: string): string =>
  `${amount.toLocaleString()} ${currency}`;

const resourceLabel = (resource: TeacherStudioClassroomResource): string =>
  resource.kind.replace(/_/g, ' ');

export const StudentClassroomView = ({
  classroom,
  academyName,
  memberships,
  announcements,
  messages,
  formatDate,
  onBack,
}: StudentClassroomViewProps) => {
  const [activeTab, setActiveTab] = useState<StudentLmsTab>('overview');
  const [room, setRoom] = useState<TeacherStudioClassroomRoom | null>(null);
  const [assignments, setAssignments] = useState<TeacherStudioStudentAssignment[]>([]);
  const [attendance, setAttendance] = useState<TeacherStudioAttendance[]>([]);
  const [billingItems, setBillingItems] = useState<TeacherStudioStudentBillingItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [submitTarget, setSubmitTarget] = useState<TeacherStudioStudentAssignment | null>(null);
  const [submissionContent, setSubmissionContent] = useState('');
  const [submissionUrl, setSubmissionUrl] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [payingOfferId, setPayingOfferId] = useState('');

  const loadClassroomLms = useCallback(async () => {
    if (!classroom) return;
    setBusy(true);
    setError('');
    try {
      const [roomData, assignmentData, attendanceData, billingData] = await Promise.all([
        teacherStudioClassroomChat(classroom.academy_id, classroom.id),
        teacherStudioStudentAssignments(classroom.academy_id, classroom.id),
        teacherStudioStudentAttendance(classroom.academy_id, classroom.id),
        teacherStudioStudentBilling(classroom.academy_id),
      ]);
      setRoom(roomData);
      setAssignments(assignmentData.assignments);
      setAttendance(attendanceData.attendance);
      setBillingItems(billingData.filter((item) => item.classroom_id === classroom.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [classroom]);

  useEffect(() => {
    void loadClassroomLms();
  }, [loadClassroomLms]);

  const classroomAnnouncements = useMemo(
    () => room?.announcements ?? announcements.filter((announcement) =>
      announcement.classroom_id === classroom?.id || announcement.classroom_id === null
    ),
    [announcements, classroom?.id, room],
  );

  const classroomMessages = useMemo(() => {
    if (room?.messages) return room.messages;
    return messages.filter((message) => {
      const id = metadataClassroomId(message.metadata);
      return !id || id === classroom?.id;
    });
  }, [classroom?.id, messages, room]);

  const publishedResources = useMemo(
    () => (room?.resources ?? []).filter((resource) => resource.is_published !== false),
    [room],
  );

  const completedResourceIds = useMemo(
    () => new Set(room?.progress.viewer_completed_resource_ids ?? []),
    [room],
  );

  const gradeStats = useMemo(() => {
    const graded = assignments
      .map((assignment) => assignment.submission)
      .filter((submission) => submission && typeof submission.score === 'number');
    const totalPercent = graded.reduce((sum, submission) => {
      const max = Number(submission?.max_score ?? 100);
      if (!submission || max <= 0 || typeof submission.score !== 'number') return sum;
      return sum + (submission.score / max) * 100;
    }, 0);
    return {
      submitted: assignments.filter((assignment) => assignment.submission).length,
      graded: graded.length,
      average: graded.length > 0 ? Math.round(totalPercent / graded.length) : null,
    };
  }, [assignments]);

  const attendanceRate = useMemo(() => {
    if (attendance.length === 0) return null;
    const present = attendance.filter((record) => ['present', 'late'].includes(record.status)).length;
    return Math.round((present / attendance.length) * 100);
  }, [attendance]);

  const openSubmission = (assignment: TeacherStudioStudentAssignment) => {
    setSubmitTarget(assignment);
    setSubmissionContent(assignment.submission?.submission_content ?? '');
    setSubmissionUrl(assignment.submission?.submission_url ?? '');
    setSubmissionNotes(assignment.submission?.notes ?? '');
    setNotice('');
    setError('');
  };

  const submitAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!classroom || !submitTarget) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioSubmitStudentAssignment(classroom.academy_id, {
        assignment_id: submitTarget.id,
        submission_content: submissionContent.trim() || null,
        submission_url: submissionUrl.trim() || null,
        notes: submissionNotes.trim() || null,
      });
      setSubmitTarget(null);
      setNotice('Assignment submitted.');
      await loadClassroomLms();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleResource = async (resource: TeacherStudioClassroomResource) => {
    if (!classroom) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioSetClassroomResourceProgress(classroom.academy_id, {
        classroom_id: classroom.id,
        resource_id: resource.id,
        completed: !completedResourceIds.has(resource.id),
      });
      await loadClassroomLms();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const payTuition = async (item: TeacherStudioStudentBillingItem) => {
    setPayingOfferId(item.offer.id);
    setError('');
    setNotice('');
    try {
      const result = await teacherStudioCreateClickTuitionPayment(item.academy_id, {
        contact_id: item.contact_id,
        offer_id: item.offer.id,
        redirect_url: typeof window !== 'undefined' ? window.location.href : null,
      });
      if (result.payment_url) window.location.href = result.payment_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPayingOfferId('');
    }
  };

  const sendChat = async (event: FormEvent) => {
    event.preventDefault();
    if (!classroom || !chatDraft.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioSendClassroomChatMessage(classroom.academy_id, {
        classroom_id: classroom.id,
        content: chatDraft.trim(),
      });
      setChatDraft('');
      await loadClassroomLms();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!classroom) {
    return (
      <section className="panel">
        <h3>Classroom not found</h3>
        <p className="muted">You do not have access to this classroom.</p>
        <button className="ghost-btn" type="button" onClick={onBack}>
          Back to classrooms
        </button>
      </section>
    );
  }

  const tabs: Array<{ id: StudentLmsTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'resources', label: 'Resources' },
    { id: 'assignments', label: 'Assignments' },
    { id: 'grades', label: 'Grades' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'billing', label: 'Billing' },
    { id: 'chat', label: 'Chat' },
  ];

  return (
    <section className="grid">
      <div className="panel">
        <div className="row between wrap">
          <div>
            <h3>{classroom.name}</h3>
            <p className="muted">{academyName}</p>
          </div>
          <button className="ghost-btn" type="button" onClick={onBack}>
            Back to classrooms
          </button>
        </div>
        <p>{classroom.description || 'No classroom description yet.'}</p>
        <section className="stats-grid">
          <article className="stat-card">
            <span>Your role</span>
            <strong>{room?.viewer.role ?? memberships[0]?.role ?? 'student'}</strong>
          </article>
          <article className="stat-card">
            <span>Resources</span>
            <strong>{publishedResources.length}</strong>
          </article>
          <article className="stat-card">
            <span>Assignments</span>
            <strong>{gradeStats.submitted}/{assignments.length}</strong>
          </article>
          <article className="stat-card">
            <span>Average</span>
            <strong>{gradeStats.average === null ? '-' : `${gradeStats.average}%`}</strong>
          </article>
          <article className="stat-card">
            <span>Attendance</span>
            <strong>{attendanceRate === null ? '-' : `${attendanceRate}%`}</strong>
          </article>
        </section>
        <div className="segmented-row" role="tablist" aria-label="Student classroom sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`small-btn ${activeTab === tab.id ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="info-banner">{notice}</div> : null}

      {activeTab === 'overview' ? (
        <section className="grid two">
          <div className="panel">
            <h3>Announcements</h3>
            <ul className="list">
              {classroomAnnouncements.slice(0, 8).map((announcement) => (
                <li key={announcement.id}>
                  <div className="row between">
                    <strong>{announcement.title}</strong>
                    <span className="small muted">{formatDate(announcement.created_at)}</span>
                  </div>
                  <div>{announcement.body}</div>
                </li>
              ))}
              {classroomAnnouncements.length === 0 ? <li>No announcements yet.</li> : null}
            </ul>
          </div>
          <div className="panel">
            <h3>Current work</h3>
            <ul className="list">
              {assignments.slice(0, 8).map((assignment) => (
                <li key={assignment.id}>
                  <div className="row between wrap">
                    <strong>{assignment.title}</strong>
                    <span className={statusClass(assignment.submission?.status ?? 'missing')}>
                      {assignment.submission?.status ?? 'missing'}
                    </span>
                  </div>
                  <div className="small muted">{assignment.due_at ? `Due ${formatDate(assignment.due_at)}` : assignment.assignment_type}</div>
                </li>
              ))}
              {assignments.length === 0 ? <li>No assignments yet.</li> : null}
            </ul>
          </div>
        </section>
      ) : null}

      {activeTab === 'resources' ? (
        <section className="grid two">
          {publishedResources.map((resource) => {
            const done = completedResourceIds.has(resource.id);
            return (
              <article className="panel" key={resource.id}>
                <div className="row between wrap">
                  <div>
                    <h3>{resource.title}</h3>
                    <p className="small muted">{resourceLabel(resource)}</p>
                  </div>
                  <span className={done ? 'status status--ok' : 'status'}>{done ? 'complete' : 'open'}</span>
                </div>
                {resource.description ? <p>{resource.description}</p> : null}
                <div className="row wrap">
                  <a className="small-btn" href={resource.url} target="_blank" rel="noreferrer">Open</a>
                  <button className="small-btn" type="button" disabled={busy} onClick={() => void toggleResource(resource)}>
                    {done ? 'Mark open' : 'Mark done'}
                  </button>
                </div>
              </article>
            );
          })}
          {publishedResources.length === 0 ? <div className="panel">No resources published yet.</div> : null}
        </section>
      ) : null}

      {activeTab === 'assignments' ? (
        <section className="grid two">
          <div className="panel">
            <h3>Assignments</h3>
            <ul className="list">
              {assignments.map((assignment) => (
                <li key={assignment.id}>
                  <div className="row between wrap">
                    <strong>{assignment.title}</strong>
                    <span className={statusClass(assignment.submission?.status ?? 'missing')}>
                      {assignment.submission?.status ?? 'missing'}
                    </span>
                  </div>
                  {assignment.description ? <div>{assignment.description}</div> : null}
                  <div className="small muted">
                    {assignment.due_at ? `Due ${formatDate(assignment.due_at)} | ` : ''}
                    {assignment.max_score ? `${assignment.max_score} points` : assignment.assignment_type}
                  </div>
                  <div className="row wrap">
                    {assignment.experience_url ? <a className="small-btn" href={assignment.experience_url} target="_blank" rel="noreferrer">Open task</a> : null}
                    <button className="small-btn" type="button" onClick={() => openSubmission(assignment)}>
                      {assignment.submission ? 'Update submission' : 'Submit'}
                    </button>
                  </div>
                </li>
              ))}
              {assignments.length === 0 ? <li>No assignments yet.</li> : null}
            </ul>
          </div>

          <div className="panel">
            <h3>{submitTarget ? submitTarget.title : 'Submission'}</h3>
            {submitTarget ? (
              <form className="grid" onSubmit={submitAssignment}>
                <textarea
                  className="input"
                  placeholder="Response"
                  value={submissionContent}
                  onChange={(event) => setSubmissionContent(event.target.value)}
                />
                <input
                  className="input"
                  placeholder="Link"
                  value={submissionUrl}
                  onChange={(event) => setSubmissionUrl(event.target.value)}
                />
                <textarea
                  className="input"
                  placeholder="Notes"
                  value={submissionNotes}
                  onChange={(event) => setSubmissionNotes(event.target.value)}
                />
                <div className="row wrap">
                  <button className="primary-btn" type="submit" disabled={busy}>
                    Save submission
                  </button>
                  <button className="ghost-btn" type="button" onClick={() => setSubmitTarget(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <p className="muted">Select an assignment.</p>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'grades' ? (
        <section className="panel">
          <h3>Grades</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Assignment</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Submitted</th>
                  <th>Feedback</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const submission = assignment.submission;
                  return (
                    <tr key={assignment.id}>
                      <td>{assignment.title}</td>
                      <td><span className={statusClass(submission?.status ?? 'missing')}>{submission?.status ?? 'missing'}</span></td>
                      <td>{typeof submission?.score === 'number' ? `${submission.score}/${submission.max_score ?? assignment.max_score ?? '-'}` : '-'}</td>
                      <td>{formatDate(submission?.submitted_at)}</td>
                      <td>{submission?.notes ?? '-'}</td>
                    </tr>
                  );
                })}
                {assignments.length === 0 ? <tr><td colSpan={5}>No grade rows yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === 'attendance' ? (
        <section className="panel">
          <h3>Attendance</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Status</th><th>Notes</th></tr></thead>
              <tbody>
                {attendance.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDate(record.session_date)}</td>
                    <td><span className={statusClass(record.status)}>{record.status}</span></td>
                    <td>{record.notes ?? '-'}</td>
                  </tr>
                ))}
                {attendance.length === 0 ? <tr><td colSpan={3}>No attendance recorded yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === 'billing' ? (
        <section className="grid two">
          {billingItems.map((item) => (
            <article className="panel" key={`${item.classroom_id}-${item.offer.id}`}>
              <div className="row between wrap">
                <div>
                  <h3>{item.offer.name}</h3>
                  <p className="small muted">{money(item.offer.price_amount, item.offer.currency)}</p>
                </div>
                <span className={item.paid ? 'status status--ok' : 'status status--pending'}>
                  {item.paid ? 'paid' : item.last_payment?.status ?? 'due'}
                </span>
              </div>
              {item.offer.description ? <p>{item.offer.description}</p> : null}
              {!item.paid ? (
                <button
                  className="primary-btn"
                  type="button"
                  disabled={payingOfferId === item.offer.id}
                  onClick={() => void payTuition(item)}
                >
                  {payingOfferId === item.offer.id ? 'Redirecting...' : 'Pay with Click'}
                </button>
              ) : null}
            </article>
          ))}
          {billingItems.length === 0 ? <div className="panel">No tuition due for this classroom.</div> : null}
        </section>
      ) : null}

      {activeTab === 'chat' ? (
        <section className="grid two">
          <div className="panel">
            <h3>Classroom chat</h3>
            <ul className="list">
              {classroomMessages.slice(0, 40).map((message) => (
                <li key={message.id}>
                  <div className="row between">
                    <strong>{String('sender_label' in message && message.sender_label ? message.sender_label : message.sender_type)}</strong>
                    <span className="small muted">{formatDate(message.created_at)}</span>
                  </div>
                  <div>{message.content}</div>
                </li>
              ))}
              {classroomMessages.length === 0 ? <li>No messages yet.</li> : null}
            </ul>
          </div>
          <form className="panel" onSubmit={sendChat}>
            <h3>Send message</h3>
            <textarea
              className="input"
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              placeholder="Message"
            />
            <button className="primary-btn" type="submit" disabled={busy || !chatDraft.trim()}>
              Send
            </button>
          </form>
        </section>
      ) : null}
    </section>
  );
};
