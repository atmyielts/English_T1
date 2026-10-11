import { getLocaleTag, translate } from '../../i18n';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  teacherStudioClassroomChat,
  teacherStudioCreateClickTuitionPayment,
  teacherStudioSendClassroomChatMessage,
  teacherStudioSetClassroomResourceProgress,
  teacherStudioStudentAssignments,
  teacherStudioStudentAttendance,
  teacherStudioStudentBilling,
  teacherStudioStudentSessionJoin,
  teacherStudioSubmitStudentAssignment,
  teacherStudioSubmitStudentAssignmentFile,
  type TeacherStudioAnnouncement,
  type TeacherStudioAttendance,
  type TeacherStudioClassroom,
  type TeacherStudioClassroomMembership,
  type TeacherStudioClassroomResource,
  type TeacherStudioClassroomRoom,
  type TeacherStudioMessage,
  type TeacherStudioStudentAssignment,
  type TeacherStudioStudentBillingItem,
  type TeacherStudioStudentCommercialAccount,
  type TeacherStudioStudentSession,
} from '../../lib/client';
import { supabase } from '../../lib/supabase';
import { StudentCurriculumView } from './StudentCurriculumView';

type StudentClassroomViewProps = {
  actorId: string;
  classroom: TeacherStudioClassroom | null;
  academyName: string;
  memberships: TeacherStudioClassroomMembership[];
  announcements: TeacherStudioAnnouncement[];
  messages: TeacherStudioMessage[];
  sessions?: TeacherStudioStudentSession[];
  formatDate: (iso: string | null | undefined) => string;
  onBack: () => void;
  onRequestHelp: () => void;
};

type StudentLmsTab = 'overview' | 'curriculum' | 'resources' | 'assignments' | 'grades' | 'attendance' | 'billing' | 'chat';
type ClassroomSection = 'overview' | 'course' | 'live' | 'assignments' | 'progress' | 'people' | 'account';
type StudentFocusItem = {
  key: string;
  label: string;
  title: string;
  detail: string;
  tab: StudentLmsTab;
  tone: 'urgent' | 'normal' | 'good';
};

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
  `${amount.toLocaleString(getLocaleTag())} ${currency}`;

const resourceLabel = (resource: TeacherStudioClassroomResource): string =>
  translate(resource.kind.replace(/_/g, ' '));

export const StudentClassroomView = ({
  actorId,
  classroom,
  academyName,
  memberships,
  announcements,
  messages,
  sessions = [],
  formatDate,
  onBack,
  onRequestHelp,
}: StudentClassroomViewProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<StudentLmsTab>('overview');
  const [classroomV2Enabled, setClassroomV2Enabled] = useState(false);
  const [room, setRoom] = useState<TeacherStudioClassroomRoom | null>(null);
  const [assignments, setAssignments] = useState<TeacherStudioStudentAssignment[]>([]);
  const [attendance, setAttendance] = useState<TeacherStudioAttendance[]>([]);
  const [billingItems, setBillingItems] = useState<TeacherStudioStudentBillingItem[]>([]);
  const [billingAccounts, setBillingAccounts] = useState<TeacherStudioStudentCommercialAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [submitTarget, setSubmitTarget] = useState<TeacherStudioStudentAssignment | null>(null);
  const [submissionContent, setSubmissionContent] = useState('');
  const [submissionUrl, setSubmissionUrl] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [payingOfferId, setPayingOfferId] = useState('');
  const [joiningSessionId, setJoiningSessionId] = useState('');
  const visitRef = useRef(0);
  const readRef = useRef(0);
  const actionRef = useRef(false);
  const paymentRef = useRef(false);
  const joinRef = useRef(false);
  useEffect(() => () => { visitRef.current += 1; }, []);

  useEffect(() => {
    let active = true;
    void supabase.from('platform_settings').select('classroom_v2_enabled').eq('id', 1).maybeSingle().then(({ data }) => {
      if (active) setClassroomV2Enabled(data?.classroom_v2_enabled === true);
    });
    return () => { active = false; };
  }, []);

  const requestedSection = searchParams.get('section');
  const activeSection: ClassroomSection = ['overview', 'course', 'live', 'assignments', 'progress', 'people', 'account'].includes(requestedSection ?? '')
    ? requestedSection as ClassroomSection
    : 'overview';
  const sectionByLegacyTab: Record<StudentLmsTab, ClassroomSection> = {
    overview: 'overview',
    curriculum: 'course',
    resources: 'course',
    assignments: 'assignments',
    grades: 'progress',
    attendance: 'progress',
    billing: 'account',
    chat: 'people',
  };
  const showLegacyPanel = (tab: StudentLmsTab): boolean => classroomV2Enabled
    ? activeSection === sectionByLegacyTab[tab]
    : activeTab === tab;
  const openLegacyTab = (tab: StudentLmsTab) => {
    if (!classroomV2Enabled) {
      setActiveTab(tab);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('section', sectionByLegacyTab[tab]);
    setSearchParams(next);
  };

  const openSection = (section: ClassroomSection) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', section);
    setSearchParams(next);
  };

  const loadClassroomLms = useCallback(async () => {
    if (!classroom) return;
    const visit = visitRef.current;
    const request = ++readRef.current;
    const isCurrent = () => visit === visitRef.current && request === readRef.current;
    setBusy(true);
    setError('');
    try {
      const [roomData, assignmentData, attendanceData, billingData] = await Promise.all([
        teacherStudioClassroomChat(classroom.academy_id, classroom.id),
        teacherStudioStudentAssignments(classroom.academy_id, classroom.id),
        teacherStudioStudentAttendance(classroom.academy_id, classroom.id),
        teacherStudioStudentBilling(classroom.academy_id),
      ]);
      if (!isCurrent()) return;
      setRoom(roomData);
      setAssignments(assignmentData.assignments);
      setAttendance(attendanceData.attendance);
      setBillingItems(billingData.items.filter((item) => item.classroom_id === classroom.id));
      setBillingAccounts(billingData.accounts);
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isCurrent()) setBusy(false);
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

  const commercialAccount = useMemo(
    () => billingAccounts.find((account) => account.academy_id === classroom?.academy_id) ?? null,
    [billingAccounts, classroom?.academy_id],
  );

  const classroomSubscriptions = useMemo(
    () => commercialAccount?.subscriptions ?? [],
    [commercialAccount],
  );

  const classroomCharges = useMemo(
    () => commercialAccount?.charges ?? [],
    [commercialAccount],
  );

  const classroomLedger = useMemo(
    () => commercialAccount?.ledger_entries ?? [],
    [commercialAccount],
  );

  const commercialCurrency = classroomCharges[0]?.currency
    ?? classroomSubscriptions[0]?.currency
    ?? commercialAccount?.balances[0]?.currency
    ?? 'UZS';
  const classroomOutstanding = classroomCharges.reduce((sum, charge) => sum + charge.outstanding_amount, 0);
  const classroomPaid = classroomCharges.reduce((sum, charge) => sum + charge.allocated_amount, 0);

  const focusItems = useMemo<StudentFocusItem[]>(() => {
    const now = Date.now();
    const openAssignments = assignments
      .filter((assignment) => {
        const status = assignment.submission?.status?.toLowerCase() ?? 'missing';
        return !['graded'].includes(status);
      })
      .sort((a, b) => {
        const aDue = a.due_at ? Date.parse(a.due_at) : Number.POSITIVE_INFINITY;
        const bDue = b.due_at ? Date.parse(b.due_at) : Number.POSITIVE_INFINITY;
        return aDue - bDue;
      });
    const nextAssignment = openAssignments[0] ?? null;
    const unpaidBilling = billingItems.find((item) => !item.paid) ?? null;
    const overdueCharge = classroomCharges.find((charge) => charge.outstanding_amount > 0 && charge.days_overdue > 0) ?? null;
    const nextResource = publishedResources.find((resource) => !completedResourceIds.has(resource.id)) ?? null;
    const gradedFeedback = assignments.find((assignment) => assignment.submission?.status === 'graded' && assignment.submission.notes) ?? null;
    const recentAttendanceRisk = attendanceRate !== null && attendanceRate < 75;

    const items: StudentFocusItem[] = [];

    if (nextAssignment) {
      const dueTs = nextAssignment.due_at ? Date.parse(nextAssignment.due_at) : null;
      const overdue = typeof dueTs === 'number' && Number.isFinite(dueTs) && dueTs < now;
      items.push({
        key: `assignment:${nextAssignment.id}`,
        label: overdue ? 'Overdue assignment' : 'Next assignment',
        title: nextAssignment.title,
        detail: nextAssignment.due_at ? `Due ${formatDate(nextAssignment.due_at)}` : nextAssignment.assignment_type,
        tab: 'assignments',
        tone: overdue ? 'urgent' : 'normal',
      });
    }

    if (unpaidBilling) {
      items.push({
        key: `billing:${unpaidBilling.offer.id}`,
        label: 'Tuition action',
        title: unpaidBilling.offer.name,
        detail: unpaidBilling.last_payment?.status === 'pending'
          ? 'Payment is pending confirmation.'
          : `${money(unpaidBilling.offer.price_amount, unpaidBilling.offer.currency)} due`,
        tab: 'billing',
        tone: unpaidBilling.last_payment?.status === 'pending' ? 'normal' : 'urgent',
      });
    }

    if (overdueCharge && !unpaidBilling) {
      items.push({
        key: `charge:${overdueCharge.id}`,
        label: 'Overdue balance',
        title: overdueCharge.description ?? overdueCharge.charge_number,
        detail: `${money(overdueCharge.outstanding_amount, overdueCharge.currency)} outstanding`,
        tab: 'billing',
        tone: 'urgent',
      });
    }

    if (nextResource) {
      items.push({
        key: `resource:${nextResource.id}`,
        label: 'Continue learning',
        title: nextResource.title,
        detail: `${resourceLabel(nextResource)} is still open.`,
        tab: 'resources',
        tone: 'normal',
      });
    }

    if (gradedFeedback) {
      items.push({
        key: `feedback:${gradedFeedback.id}`,
        label: 'Teacher feedback',
        title: gradedFeedback.title,
        detail: gradedFeedback.submission?.notes ?? 'Feedback is ready.',
        tab: 'grades',
        tone: 'good',
      });
    }

    if (recentAttendanceRisk) {
      items.push({
        key: 'attendance-risk',
        label: 'Attendance',
        title: 'Attendance needs attention',
        detail: `${attendanceRate}% attendance in this classroom.`,
        tab: 'attendance',
        tone: 'urgent',
      });
    }

    if (items.length === 0) {
      items.push({
        key: 'all-clear',
        label: 'Today',
        title: 'You are caught up',
        detail: 'No open assignments, billing actions, or attendance alerts right now.',
        tab: 'overview',
        tone: 'good',
      });
    }

    return items.slice(0, 4);
  }, [assignments, attendanceRate, billingItems, classroomCharges, completedResourceIds, formatDate, publishedResources]);

  const openSubmission = (assignment: TeacherStudioStudentAssignment) => {
    setSubmitTarget(assignment);
    setSubmissionContent(assignment.submission?.submission_content ?? '');
    setSubmissionUrl(assignment.submission?.submission_url ?? '');
    setSubmissionNotes(assignment.submission?.notes ?? '');
    setSubmissionFile(null);
    setNotice('');
    setError('');
  };

  const submitAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!classroom || !submitTarget || busy || actionRef.current) return;
    actionRef.current = true;
    const visit = visitRef.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        assignment_id: submitTarget.id,
        submission_content: submissionContent.trim() || null,
        submission_url: submissionUrl.trim() || null,
        notes: submissionNotes.trim() || null,
      };
      if (submissionFile) {
        await teacherStudioSubmitStudentAssignmentFile(classroom.academy_id, {
          ...payload,
          file: submissionFile,
        });
      } else {
        await teacherStudioSubmitStudentAssignment(classroom.academy_id, payload);
      }
      if (visit !== visitRef.current) return;
      setSubmitTarget(null);
      setSubmissionFile(null);
      setNotice('Assignment submitted.');
      await loadClassroomLms();
    } catch (err) {
      if (visit === visitRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (visit === visitRef.current) { actionRef.current = false; setBusy(false); }
    }
  };

  const toggleResource = async (resource: TeacherStudioClassroomResource) => {
    if (!classroom || busy || actionRef.current) return;
    actionRef.current = true;
    const visit = visitRef.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioSetClassroomResourceProgress(classroom.academy_id, {
        classroom_id: classroom.id,
        resource_id: resource.id,
        completed: !completedResourceIds.has(resource.id),
      });
      if (visit !== visitRef.current) return;
      await loadClassroomLms();
    } catch (err) {
      if (visit === visitRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (visit === visitRef.current) { actionRef.current = false; setBusy(false); }
    }
  };

  const payTuition = async (item: TeacherStudioStudentBillingItem) => {
    if (paymentRef.current) return;
    paymentRef.current = true;
    const visit = visitRef.current;
    setPayingOfferId(item.offer.id);
    setError('');
    setNotice('');
    try {
      const result = await teacherStudioCreateClickTuitionPayment(item.academy_id, {
        contact_id: item.contact_id,
        offer_id: item.offer.id,
        redirect_url: typeof window !== 'undefined' ? window.location.href : null,
      });
      if (visit === visitRef.current && result.payment_url) window.location.href = result.payment_url;
    } catch (err) {
      if (visit === visitRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (visit === visitRef.current) { paymentRef.current = false; setPayingOfferId(''); }
    }
  };

  const sendChat = async (event: FormEvent) => {
    event.preventDefault();
    if (!classroom || !chatDraft.trim() || busy || actionRef.current) return;
    actionRef.current = true;
    const visit = visitRef.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioSendClassroomChatMessage(classroom.academy_id, {
        classroom_id: classroom.id,
        content: chatDraft.trim(),
      });
      if (visit !== visitRef.current) return;
      setChatDraft('');
      await loadClassroomLms();
    } catch (err) {
      if (visit === visitRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (visit === visitRef.current) { actionRef.current = false; setBusy(false); }
    }
  };

  const joinSession = async (session: TeacherStudioStudentSession) => {
    if (!classroom || joinRef.current) return;
    joinRef.current = true;
    const visit = visitRef.current;
    setJoiningSessionId(session.id);
    setError('');
    try {
      const delivery = await teacherStudioStudentSessionJoin(classroom.academy_id, classroom.id, session.id);
      if (visit === visitRef.current) window.location.assign(delivery.join_url);
    } catch (err) {
      if (visit === visitRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (visit === visitRef.current) { joinRef.current = false; setJoiningSessionId(''); }
    }
  };

  if (!classroom) {
    return (
      <section className="panel student-classroom-unavailable">
        <span className="eyebrow">{translate('Classroom access')}</span>
        <h3>{translate('This classroom is not linked to your student account')}</h3>
        <p className="muted">{translate('The link may be old, the classroom may belong to another academy, or your enrollment may not be active yet. Your available classrooms are listed in My classrooms.')}</p>
        <div className="record-actions">
          <button className="primary-btn" type="button" onClick={onBack}>
            {translate('See my classrooms')}
          </button>
          <button className="ghost-btn" type="button" onClick={onRequestHelp}>
            {translate('Ask the academy for help')}
          </button>
        </div>
      </section>
    );
  }

  const tabs: Array<{ id: StudentLmsTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'curriculum', label: 'Courses' },
    { id: 'resources', label: 'Resources' },
    { id: 'assignments', label: 'Assignments' },
    { id: 'grades', label: 'Grades' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'billing', label: 'Billing' },
    { id: 'chat', label: 'Chat' },
  ];
  const sections: Array<{ id: ClassroomSection; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'course', label: 'Course' },
    { id: 'live', label: 'Live' },
    { id: 'assignments', label: 'Assignments' },
    { id: 'progress', label: 'Progress' },
    { id: 'people', label: 'People & discussion' },
    { id: 'account', label: 'Account' },
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
            {translate("Back to classrooms")}{' '}</button>
        </div>
        <p>{classroom.description || 'No classroom description yet.'}</p>
        <section className="stats-grid">
          <article className="stat-card">
            <span>{translate("Your role")}</span>
            <strong>{room?.viewer.role ?? memberships[0]?.role ?? 'student'}</strong>
          </article>
          <article className="stat-card">
            <span>{translate("Resources")}</span>
            <strong>{publishedResources.length}</strong>
          </article>
          <article className="stat-card">
            <span>{translate("Assignments")}</span>
            <strong>{gradeStats.submitted}/{assignments.length}</strong>
          </article>
          <article className="stat-card">
            <span>{translate("Average")}</span>
            <strong>{gradeStats.average === null ? '-' : `${gradeStats.average}%`}</strong>
          </article>
          <article className="stat-card">
            <span>{translate("Attendance")}</span>
            <strong>{attendanceRate === null ? '-' : `${attendanceRate}%`}</strong>
          </article>
        </section>
        {classroomV2Enabled ? (
          <>
            <nav className="classroom-section-nav" aria-label={translate("Student classroom sections")}>
              {sections.map((section) => (
                <button key={section.id} className={`small-btn ${activeSection === section.id ? 'is-active' : ''}`} type="button" onClick={() => openSection(section.id)} aria-current={activeSection === section.id ? 'page' : undefined}>
                  {translate(section.label)}
                </button>
              ))}
            </nav>
            <details className="classroom-section-menu">
              <summary>{translate("Classroom sections")} · {translate(sections.find((section) => section.id === activeSection)?.label ?? "Overview")}</summary>
              <nav aria-label={translate("Student classroom sections")}>
                {sections.map((section) => (
                  <button key={section.id} className={`small-btn ${activeSection === section.id ? 'is-active' : ''}`} type="button" onClick={(event) => { openSection(section.id); event.currentTarget.closest('details')?.removeAttribute('open'); }} aria-current={activeSection === section.id ? 'page' : undefined}>
                    {translate(section.label)}
                  </button>
                ))}
              </nav>
            </details>
          </>
        ) : (
          <nav className="segmented-row" aria-label={translate("Student classroom sections")}>
            {tabs.map((tab) => (
              <button key={tab.id} className={`small-btn ${activeTab === tab.id ? 'is-active' : ''}`} type="button" onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined}>
                {translate(tab.label)}
              </button>
            ))}
          </nav>
        )}
      </div>

      {error ? <div className="error-banner">{translate(error)}</div> : null}
      {notice ? <div className="info-banner">{translate(notice)}</div> : null}

      {showLegacyPanel('overview') ? (
        <section className="grid">
          <div className="panel student-focus-panel">
            <div className="row between wrap">
              <div>
                <h3>{translate("Next best actions")}</h3>
                <p className="muted">{translate("Your current classroom priorities, ordered by what helps you move forward.")}</p>
              </div>
              <span className="status">{focusItems.length} {translate("focus item")}{focusItems.length === 1 ? '' : 's'}</span>
            </div>
            <div className="student-focus-grid">
              {focusItems.map((item) => (
                <button
                  className={`student-focus-card student-focus-card--${item.tone}`}
                  key={item.key}
                  type="button"
                  onClick={() => openLegacyTab(item.tab)}
                >
                  <span>{translate(item.label)}</span>
                  <strong>{translate(item.title)}</strong>
                  <small>{item.detail}</small>
                </button>
              ))}
            </div>
          </div>

          <section className="grid two">
          <div className="panel">
            <h3>{translate("Announcements")}</h3>
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
              {classroomAnnouncements.length === 0 ? <li>{translate("No announcements yet.")}</li> : null}
            </ul>
          </div>
          <div className="panel">
            <h3>{translate("Current work")}</h3>
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
              {assignments.length === 0 ? <li>{translate("No assignments yet.")}</li> : null}
            </ul>
          </div>
          </section>
        </section>
      ) : null}

      {classroomV2Enabled && activeSection === 'live' ? (
        <section className="grid classroom-live-grid">
          <div className="panel">
            <div className="row between wrap">
              <div>
                <h3>{translate("Live sessions")}</h3>
                <p className="muted">{translate("Online rooms open shortly before class. Your membership is checked again when you join.")}</p>
              </div>
              <span className="status">{sessions.length} {translate("sessions")}</span>
            </div>
          </div>
          {sessions.map((session) => (
            <article className="panel classroom-live-session" key={session.id}>
              <div className="row between wrap">
                <div>
                  <p className="small muted">{formatDate(session.starts_at)} · {session.delivery_mode.replaceAll('_', ' ')}</p>
                  <h3>{session.title}</h3>
                  <p className="small muted">{formatDate(session.starts_at)} — {formatDate(session.ends_at)} · {session.timezone}</p>
                </div>
                <span className={statusClass(session.status)}>{translate(session.status.replaceAll('_', ' '))}</span>
              </div>
              {session.delivery_mode === 'online' || session.delivery_mode === 'hybrid' ? (
                <button
                  type="button"
                  className={session.join_available ? 'primary-btn' : 'ghost-btn'}
                  disabled={!session.join_available || joiningSessionId === session.id}
                  onClick={() => void joinSession(session)}
                >
                  {joiningSessionId === session.id
                    ? translate("Opening room...")
                    : session.join_available
                      ? translate("Join live room")
                      : translate("Room opens 15 minutes before class")}
                </button>
              ) : <p className="muted">{translate("This session takes place in person.")}</p>}
            </article>
          ))}
          {sessions.length === 0 ? <div className="panel">{translate("No upcoming live sessions.")}</div> : null}
        </section>
      ) : null}

      {showLegacyPanel('resources') ? (
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
                  <a className="small-btn" href={resource.url} target="_blank" rel="noreferrer">{translate("Open")}</a>
                  <button className="small-btn" type="button" disabled={busy} onClick={() => void toggleResource(resource)}>
                    {done ? 'Mark open' : 'Mark done'}
                  </button>
                </div>
              </article>
            );
          })}
          {publishedResources.length === 0 ? <div className="panel">{translate("No resources published yet.")}</div> : null}
        </section>
      ) : null}

      {showLegacyPanel('curriculum') ? (
        <StudentCurriculumView key={`${actorId}:${classroom.academy_id}:${classroom.id}`} actorId={actorId} academyId={classroom.academy_id} classroomId={classroom.id} />
      ) : null}

      {showLegacyPanel('assignments') ? (
        <section className="grid two">
          <div className="panel">
            <h3>{translate("Assignments")}</h3>
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
                    {assignment.max_score ? translate("{score} points", { score: assignment.max_score }) : translate(assignment.assignment_type.replaceAll("_", " "))}
                    {assignment.attempts_allowed ? ` | Attempt ${assignment.submission?.attempt_number ?? 0}/${assignment.attempts_allowed}` : ''}
                  </div>
                  <div className="row wrap">
                    {assignment.experience_url ? <a className="small-btn" href={assignment.experience_url} target="_blank" rel="noreferrer">{translate("Open task")}</a> : null}
                    {assignment.submission?.signed_url ? <a className="small-btn" href={assignment.submission.signed_url} target="_blank" rel="noreferrer">{translate("Open file")}</a> : null}
                    <button className="small-btn" type="button" onClick={() => openSubmission(assignment)}>
                      {assignment.submission ? 'Update submission' : 'Submit'}
                    </button>
                  </div>
                </li>
              ))}
              {assignments.length === 0 ? <li>{translate("No assignments yet.")}</li> : null}
            </ul>
          </div>

          <div className="panel">
            <h3>{submitTarget ? submitTarget.title : 'Submission'}</h3>
            {submitTarget ? (
              <form className="grid" onSubmit={submitAssignment}>
                <textarea
                  className="input"
                  placeholder={translate("Response")}
                  value={submissionContent}
                  disabled={busy}
                  onChange={(event) => setSubmissionContent(event.target.value)}
                />
                <input
                  className="input"
                  placeholder={translate("Link")}
                  value={submissionUrl}
                  disabled={busy}
                  onChange={(event) => setSubmissionUrl(event.target.value)}
                />
                <input
                  className="input"
                  type="file"
                  disabled={busy}
                  onChange={(event) => setSubmissionFile(event.target.files?.[0] ?? null)}
                />
                {submissionFile ? (
                  <div className="small muted">
                    {translate("File ready:")}{' '}{submissionFile.name} ({Math.round(submissionFile.size / 1024)} {translate("KB)")}{' '}</div>
                ) : null}
                <textarea
                  className="input"
                  placeholder={translate("Notes")}
                  value={submissionNotes}
                  disabled={busy}
                  onChange={(event) => setSubmissionNotes(event.target.value)}
                />
                <div className="row wrap">
                  <button className="primary-btn" type="submit" disabled={busy}>
                    {translate("Save submission")}{' '}</button>
                  <button className="ghost-btn" type="button" onClick={() => setSubmitTarget(null)}>
                    {translate("Cancel")}{' '}</button>
                </div>
              </form>
            ) : (
              <p className="muted">{translate("Select an assignment.")}</p>
            )}
          </div>
        </section>
      ) : null}

      {showLegacyPanel('grades') ? (
        <section className="panel">
          <h3>{translate("Grades")}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{translate("Assignment")}</th>
                  <th>{translate("Status")}</th>
                  <th>{translate("Score")}</th>
                  <th>{translate("Submitted")}</th>
                  <th>{translate("Feedback")}</th>
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
                      <td>
                        {submission?.notes ?? '-'}
                        {submission?.signed_url ? (
                          <div><a href={submission.signed_url} target="_blank" rel="noreferrer">{translate("Open submitted file")}</a></div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {assignments.length === 0 ? <tr><td colSpan={5}>{translate("No grade rows yet.")}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showLegacyPanel('attendance') ? (
        <section className="panel">
          <h3>{translate("Attendance")}</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{translate("Date")}</th><th>{translate("Status")}</th><th>{translate("Notes")}</th></tr></thead>
              <tbody>
                {attendance.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDate(record.session_date)}</td>
                    <td><span className={statusClass(record.status)}>{record.status}</span></td>
                    <td>{record.notes ?? '-'}</td>
                  </tr>
                ))}
                {attendance.length === 0 ? <tr><td colSpan={3}>{translate("No attendance recorded yet.")}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showLegacyPanel('billing') ? (
        <section className="grid">
          <div className="panel">
            <div className="row between wrap">
              <div>
                <span className="eyebrow">{translate("Student account")}</span>
                <h3>{translate("Billing statement")}</h3>
                <p className="muted">{translate("Your agreements, charges, payments, credits, and outstanding balance at {academy}.", { academy: academyName })}</p>
              </div>
              <span className={classroomOutstanding > 0 ? 'status status--pending' : 'status status--ok'}>
                {classroomOutstanding > 0 ? 'payment due' : 'account current'}
              </span>
            </div>
            <div className="commercial-core__stats">
              <article><strong>{money(classroomOutstanding, commercialCurrency)}</strong><span>{translate("Outstanding balance")}</span></article>
              <article><strong>{money(classroomPaid, commercialCurrency)}</strong><span>{translate("Payments allocated")}</span></article>
              <article><strong>{classroomCharges.length}</strong><span>{translate("Charges")}</span></article>
              <article><strong>{classroomSubscriptions.length}</strong><span>{translate("Agreements")}</span></article>
            </div>
          </div>

          {classroomSubscriptions.length > 0 ? (
            <div className="panel">
              <h3>{translate("Tuition agreements")}</h3>
              <div className="subscription-cards">
                {classroomSubscriptions.map((subscription) => (
                  <article key={subscription.id}>
                    <header>
                      <strong>{money(subscription.agreed_amount, subscription.currency)}</strong>
                      <span className={statusClass(subscription.status)}>{subscription.status}</span>
                    </header>
                    <p>{translate(subscription.billing_cycle.replace(/_/g, ' '))} {translate("· starts")}{' '}{formatDate(subscription.starts_on)}</p>
                    <small>
                      {translate("List")}{' '}{money(subscription.list_amount, subscription.currency)}
                      {subscription.discount_amount > 0 ? ` · discount ${money(subscription.discount_amount, subscription.currency)}` : ''}
                    </small>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <div className="panel">
            <h3>{translate("Charges")}</h3>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead><tr><th>{translate("Charge")}</th><th>{translate("Issued / due")}</th><th>{translate("Net")}</th><th>{translate("Paid")}</th><th>{translate("Outstanding")}</th><th>{translate("Status")}</th></tr></thead>
                <tbody>
                  {classroomCharges.map((charge) => (
                    <tr key={charge.id}>
                      <td><strong>{charge.charge_number}</strong><div className="small muted">{charge.description ?? charge.charge_type}</div></td>
                      <td>{formatDate(charge.issued_on)} / {formatDate(charge.due_on)}</td>
                      <td>{money(charge.effective_amount, charge.currency)}</td>
                      <td className="amount-credit">{money(charge.allocated_amount, charge.currency)}</td>
                      <td className={charge.outstanding_amount > 0 ? 'amount-due' : ''}>{money(charge.outstanding_amount, charge.currency)}</td>
                      <td><span className={statusClass(charge.calculated_status)}>{translate(charge.calculated_status.replace(/_/g, ' '))}</span></td>
                    </tr>
                  ))}
                  {classroomCharges.length === 0 ? <tr><td colSpan={6}>{translate("No account charges yet.")}</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h3>{translate("Payments and credits")}</h3>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead><tr><th>{translate("Date")}</th><th>{translate("Entry")}</th><th>{translate("Reason")}</th><th>{translate("Amount")}</th></tr></thead>
                <tbody>
                  {classroomLedger.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.effective_at)}</td>
                      <td>{translate(entry.entry_type.replace(/_/g, ' '))}</td>
                      <td>{entry.reason ?? '-'}</td>
                      <td className={entry.amount < 0 ? 'amount-credit' : 'amount-due'}>{money(Math.abs(entry.amount), entry.currency)}</td>
                    </tr>
                  ))}
                  {classroomLedger.length === 0 ? <tr><td colSpan={4}>{translate("No payments or credits recorded yet.")}</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid two">
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
          </div>
        </section>
      ) : null}

      {showLegacyPanel('chat') ? (
        <section className="grid two">
          {classroomV2Enabled ? (
            <div className="panel">
              <h3>{translate("People in this classroom")}</h3>
              <ul className="list">
                {(room?.members ?? []).map((member) => (
                  <li key={member.id}>
                    <div className="row between wrap"><strong>{member.contact?.display_name || translate("Classroom member")}</strong><span className="status">{translate(member.role)}</span></div>
                  </li>
                ))}
                {(room?.members.length ?? 0) === 0 ? <li>{translate("No classroom members are available.")}</li> : null}
              </ul>
            </div>
          ) : null}
          <div className="panel">
            <h3>{translate("Classroom chat")}</h3>
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
              {classroomMessages.length === 0 ? <li>{translate("No messages yet.")}</li> : null}
            </ul>
          </div>
          <form className="panel" onSubmit={sendChat}>
            <h3>{translate("Send message")}</h3>
            <textarea
              className="input"
              value={chatDraft}
              disabled={busy}
              onChange={(event) => setChatDraft(event.target.value)}
              placeholder={translate("Message")}
            />
            <button className="primary-btn" type="submit" disabled={busy || !chatDraft.trim()}>
              {translate("Send")}{' '}</button>
          </form>
        </section>
      ) : null}
    </section>
  );
};
