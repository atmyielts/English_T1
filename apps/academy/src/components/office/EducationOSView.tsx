import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  teacherStudioAssignments,
  teacherStudioAttendance,
  teacherStudioBranding,
  teacherStudioBulkInvite,
  teacherStudioBulkInvites,
  teacherStudioComputeAtRisk,
  teacherStudioCreateAssignment,
  teacherStudioDeleteSchedule,
  teacherStudioDispatchNotifications,
  teacherStudioGenerateParentReport,
  teacherStudioGradebook,
  teacherStudioIssueAcademyCertificate,
  teacherStudioMarkAttendance,
  teacherStudioNotifications,
  teacherStudioOwnerDashboard,
  teacherStudioRecordPlacement,
  teacherStudioReferralLeaderboard,
  teacherStudioRemoveStaff,
  teacherStudioSchedule,
  teacherStudioStaff,
  teacherStudioSubmitAssignmentForContact,
  teacherStudioUpsertBranding,
  teacherStudioUpsertSchedule,
  teacherStudioUpsertStaff,
  type TeacherStudioAssignment,
  type TeacherStudioAtRiskStudent,
  type TeacherStudioAttendance,
  type TeacherStudioBranding,
  type TeacherStudioClassroom,
  type TeacherStudioClassroomMembership,
  type TeacherStudioContact,
  type TeacherStudioGradebook,
  type TeacherStudioNotification,
  type TeacherStudioOwnerDashboard,
  type TeacherStudioReferralLeader,
  type TeacherStudioScheduleSlot,
  type TeacherStudioStaff,
} from '../../lib/client';

type EducationOSTab = 'command' | 'learning' | 'attendance' | 'growth' | 'engagement' | 'brand';

type EducationOSViewProps = {
  academyId: string;
  classrooms: TeacherStudioClassroom[];
  contacts: TeacherStudioContact[];
  classroomMemberships: TeacherStudioClassroomMembership[];
  formatDate: (iso: string | null | undefined) => string;
  statusClass: (status: string) => string;
};

type BulkInviteRow = Awaited<ReturnType<typeof teacherStudioBulkInvites>>[number];

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const todayDate = (): string => new Date().toISOString().slice(0, 10);

const contactName = (contact: Pick<TeacherStudioContact, 'first_name' | 'last_name' | 'email'> | null | undefined): string => {
  if (!contact) return 'Unknown student';
  const fullName = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();
  return fullName || contact.email || 'Unknown student';
};

const staffClassroomIds = (staff: TeacherStudioStaff): string[] => {
  if (Array.isArray(staff.classroom_ids)) return staff.classroom_ids.map(String);
  return [];
};

const parseInviteLines = (raw: string): Array<{ first_name?: string; last_name?: string; email: string }> =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((part) => part.trim()).filter(Boolean);
      if (parts.length >= 3) return { first_name: parts[0], last_name: parts[1], email: parts[2] };
      if (parts.length === 2) {
        const nameParts = parts[0].split(/\s+/).filter(Boolean);
        return { first_name: nameParts[0] ?? '', last_name: nameParts.slice(1).join(' '), email: parts[1] };
      }
      return { email: parts[0] ?? line };
    })
    .filter((entry) => entry.email.includes('@'));

const defaultBrandingForm = () => ({
  display_name: '',
  tagline: '',
  logo_url: '',
  favicon_url: '',
  primary_color: '#2457ff',
  accent_color: '#13b8a6',
  custom_domain: '',
  footer_text: '',
  hide_schood_logo: false,
});

export const EducationOSView = ({
  academyId,
  classrooms,
  contacts,
  classroomMemberships,
  formatDate,
  statusClass,
}: EducationOSViewProps) => {
  const [activeTab, setActiveTab] = useState<EducationOSTab>('command');
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localNotice, setLocalNotice] = useState('');

  const [dashboard, setDashboard] = useState<TeacherStudioOwnerDashboard | null>(null);
  const [assignments, setAssignments] = useState<TeacherStudioAssignment[]>([]);
  const [gradebook, setGradebook] = useState<TeacherStudioGradebook | null>(null);
  const [attendance, setAttendance] = useState<TeacherStudioAttendance[]>([]);
  const [schedule, setSchedule] = useState<TeacherStudioScheduleSlot[]>([]);
  const [bulkInvites, setBulkInvites] = useState<BulkInviteRow[]>([]);
  const [staff, setStaff] = useState<TeacherStudioStaff[]>([]);
  const [notifications, setNotifications] = useState<TeacherStudioNotification[]>([]);
  const [branding, setBranding] = useState<TeacherStudioBranding | null>(null);
  const [referralLeaderboard, setReferralLeaderboard] = useState<TeacherStudioReferralLeader[]>([]);
  const [atRisk, setAtRisk] = useState<TeacherStudioAtRiskStudent[]>([]);
  const [atRiskScanned, setAtRiskScanned] = useState(0);
  const [lastShareUrl, setLastShareUrl] = useState('');

  const [assignmentForm, setAssignmentForm] = useState({
    title: '',
    assignment_type: 'task',
    due_at: '',
    max_score: '100',
    score_weight: '1',
    description: '',
  });
  const [gradeForm, setGradeForm] = useState({
    assignment_id: '',
    contact_id: '',
    score: '',
    max_score: '100',
    notes: '',
  });
  const [attendanceDate, setAttendanceDate] = useState(todayDate);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, { status: string; notes: string }>>({});
  const [scheduleForm, setScheduleForm] = useState({
    day_of_week: '1',
    start_time: '',
    end_time: '',
    timezone: 'Asia/Tashkent',
    label: '',
  });
  const [inviteText, setInviteText] = useState('First, Last, student@example.com');
  const [placementForm, setPlacementForm] = useState({ contact_id: '', score: '', level: '' });
  const [staffForm, setStaffForm] = useState({
    staff_email: '',
    name: '',
    staff_role: 'teacher',
    classroom_ids: [] as string[],
  });
  const [reportForm, setReportForm] = useState({ contact_id: '', label: 'Monthly progress report', expires_in_days: '180' });
  const [certificateForm, setCertificateForm] = useState({
    contact_id: '',
    classroom_id: '',
    exam_type: 'academy',
    overall_score: '',
    candidate_name: '',
    center_name: '',
  });
  const [brandingForm, setBrandingForm] = useState(defaultBrandingForm);

  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const classroomById = useMemo(() => new Map(classrooms.map((classroom) => [classroom.id, classroom])), [classrooms]);

  const selectedClassroom = selectedClassroomId ? classroomById.get(selectedClassroomId) ?? null : null;

  const selectedMembers = useMemo(() => {
    if (!selectedClassroomId) return [];
    return classroomMemberships
      .filter((membership) => membership.classroom_id === selectedClassroomId && ['student', 'observer'].includes(membership.role))
      .map((membership) => ({
        membership,
        contact: contactById.get(membership.contact_id) ?? null,
      }))
      .filter((item) => item.contact);
  }, [classroomMemberships, contactById, selectedClassroomId]);

  const attendanceForDate = useMemo(() => {
    const map = new Map<string, TeacherStudioAttendance>();
    for (const record of attendance) {
      if (record.session_date === attendanceDate) map.set(record.contact_id, record);
    }
    return map;
  }, [attendance, attendanceDate]);

  const loadOsData = useCallback(async () => {
    if (!academyId) return;
    setLocalBusy(true);
    setLocalError('');
    try {
      const [
        dashboardData,
        staffData,
        notificationsData,
        brandingData,
        referralData,
      ] = await Promise.all([
        teacherStudioOwnerDashboard(academyId),
        teacherStudioStaff(academyId),
        teacherStudioNotifications(academyId),
        teacherStudioBranding(academyId),
        teacherStudioReferralLeaderboard(academyId),
      ]);

      setDashboard(dashboardData);
      setStaff(staffData);
      setNotifications(notificationsData);
      setBranding(brandingData);
      setReferralLeaderboard(referralData);

      if (selectedClassroomId) {
        const [
          assignmentData,
          gradebookData,
          attendanceData,
          scheduleData,
          inviteData,
        ] = await Promise.all([
          teacherStudioAssignments(academyId, selectedClassroomId),
          teacherStudioGradebook(academyId, selectedClassroomId),
          teacherStudioAttendance(academyId, selectedClassroomId),
          teacherStudioSchedule(academyId, selectedClassroomId),
          teacherStudioBulkInvites(academyId, selectedClassroomId),
        ]);
        setAssignments(assignmentData);
        setGradebook(gradebookData);
        setAttendance(attendanceData);
        setSchedule(scheduleData);
        setBulkInvites(inviteData);
      } else {
        setAssignments([]);
        setGradebook(null);
        setAttendance([]);
        setSchedule([]);
        setBulkInvites([]);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocalBusy(false);
    }
  }, [academyId, selectedClassroomId]);

  useEffect(() => {
    if (selectedClassroomId && classrooms.some((classroom) => classroom.id === selectedClassroomId)) return;
    setSelectedClassroomId(classrooms[0]?.id ?? '');
  }, [classrooms, selectedClassroomId]);

  useEffect(() => {
    void loadOsData();
  }, [loadOsData]);

  useEffect(() => {
    setGradeForm((previous) => ({
      ...previous,
      assignment_id: previous.assignment_id || assignments[0]?.id || '',
      contact_id: previous.contact_id || selectedMembers[0]?.contact?.id || '',
      max_score: previous.max_score || String(assignments[0]?.max_score ?? 100),
    }));
  }, [assignments, selectedMembers]);

  useEffect(() => {
    setPlacementForm((previous) => ({
      ...previous,
      contact_id: previous.contact_id || contacts[0]?.id || '',
    }));
    setReportForm((previous) => ({
      ...previous,
      contact_id: previous.contact_id || contacts[0]?.id || '',
    }));
    setCertificateForm((previous) => ({
      ...previous,
      contact_id: previous.contact_id || contacts[0]?.id || '',
      classroom_id: previous.classroom_id || selectedClassroomId,
    }));
  }, [contacts, selectedClassroomId]);

  useEffect(() => {
    const nextDraft: Record<string, { status: string; notes: string }> = {};
    for (const member of selectedMembers) {
      const contactId = member.contact?.id ?? '';
      if (!contactId) continue;
      const existing = attendanceForDate.get(contactId);
      nextDraft[contactId] = {
        status: existing?.status ?? attendanceDraft[contactId]?.status ?? 'present',
        notes: existing?.notes ?? attendanceDraft[contactId]?.notes ?? '',
      };
    }
    setAttendanceDraft(nextDraft);
    // Deliberately exclude attendanceDraft to avoid erasing active edits on each select change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceForDate, selectedMembers]);

  useEffect(() => {
    if (!branding) {
      setBrandingForm(defaultBrandingForm());
      return;
    }
    setBrandingForm({
      display_name: branding.display_name ?? '',
      tagline: branding.tagline ?? '',
      logo_url: branding.logo_url ?? '',
      favicon_url: branding.favicon_url ?? '',
      primary_color: branding.primary_color ?? '#2457ff',
      accent_color: branding.accent_color ?? '#13b8a6',
      custom_domain: branding.custom_domain ?? '',
      footer_text: branding.footer_text ?? '',
      hide_schood_logo: Boolean(branding.hide_schood_logo),
    });
  }, [branding]);

  const runAction = async (success: string, action: () => Promise<void>) => {
    setLocalBusy(true);
    setLocalError('');
    setLocalNotice('');
    try {
      await action();
      await loadOsData();
      setLocalNotice(success);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocalBusy(false);
    }
  };

  const submitAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !selectedClassroomId) return;
    await runAction('Assignment created.', async () => {
      await teacherStudioCreateAssignment(academyId, {
        classroom_id: selectedClassroomId,
        title: assignmentForm.title.trim(),
        assignment_type: assignmentForm.assignment_type,
        description: assignmentForm.description.trim() || null,
        due_at: assignmentForm.due_at ? new Date(assignmentForm.due_at).toISOString() : null,
        max_score: Number(assignmentForm.max_score) > 0 ? Number(assignmentForm.max_score) : null,
        score_weight: Number(assignmentForm.score_weight) > 0 ? Number(assignmentForm.score_weight) : 1,
      });
      setAssignmentForm((previous) => ({ ...previous, title: '', description: '' }));
    });
  };

  const submitGrade = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !gradeForm.assignment_id || !gradeForm.contact_id) return;
    await runAction('Grade recorded.', async () => {
      await teacherStudioSubmitAssignmentForContact(academyId, {
        assignment_id: gradeForm.assignment_id,
        contact_id: gradeForm.contact_id,
        score: Number(gradeForm.score),
        max_score: Number(gradeForm.max_score) > 0 ? Number(gradeForm.max_score) : null,
        notes: gradeForm.notes.trim() || null,
      });
      setGradeForm((previous) => ({ ...previous, score: '', notes: '' }));
    });
  };

  const submitAttendance = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !selectedClassroomId) return;
    await runAction('Attendance saved.', async () => {
      await teacherStudioMarkAttendance(academyId, {
        classroom_id: selectedClassroomId,
        session_date: attendanceDate,
        records: Object.entries(attendanceDraft).map(([contact_id, record]) => ({
          contact_id,
          status: record.status,
          notes: record.notes.trim() || null,
        })),
      });
    });
  };

  const submitSchedule = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !selectedClassroomId) return;
    await runAction('Schedule slot saved.', async () => {
      await teacherStudioUpsertSchedule(academyId, {
        classroom_id: selectedClassroomId,
        day_of_week: Number(scheduleForm.day_of_week),
        start_time: scheduleForm.start_time,
        end_time: scheduleForm.end_time.trim() || null,
        timezone: scheduleForm.timezone.trim() || 'Asia/Tashkent',
        label: scheduleForm.label.trim() || null,
      });
      setScheduleForm((previous) => ({ ...previous, start_time: '', end_time: '', label: '' }));
    });
  };

  const removeSchedule = async (id: string) => {
    if (!academyId) return;
    await runAction('Schedule slot removed.', async () => {
      await teacherStudioDeleteSchedule(academyId, id);
    });
  };

  const submitInvites = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId) return;
    const entries = parseInviteLines(inviteText);
    if (entries.length === 0) {
      setLocalError('Add at least one invite line with an email address.');
      return;
    }
    await runAction('Bulk invite processed.', async () => {
      const result = await teacherStudioBulkInvite(academyId, {
        classroom_id: selectedClassroomId || null,
        contacts: entries,
      });
      setLocalNotice(`Bulk invite processed: ${result.summary.ok} ok, ${result.summary.failed} failed.`);
    });
  };

  const submitPlacement = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !placementForm.contact_id) return;
    await runAction('Placement recorded.', async () => {
      const result = await teacherStudioRecordPlacement(academyId, {
        contact_id: placementForm.contact_id,
        diagnostic_score: placementForm.score ? Number(placementForm.score) : null,
        level: placementForm.level.trim() || null,
      });
      setLocalNotice(`Placement recorded: ${result.level}. ${result.suggested_classrooms.length} classroom suggestion(s).`);
    });
  };

  const submitStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !staffForm.staff_email.trim()) return;
    await runAction('Staff member saved.', async () => {
      await teacherStudioUpsertStaff(academyId, {
        staff_email: staffForm.staff_email.trim(),
        name: staffForm.name.trim() || undefined,
        staff_role: staffForm.staff_role,
        classroom_ids: staffForm.classroom_ids,
      });
      setStaffForm({ staff_email: '', name: '', staff_role: 'teacher', classroom_ids: [] });
    });
  };

  const removeStaff = async (id: string) => {
    if (!academyId) return;
    await runAction('Staff member removed.', async () => {
      await teacherStudioRemoveStaff(academyId, id);
    });
  };

  const computeAtRisk = async () => {
    if (!academyId) return;
    setLocalBusy(true);
    setLocalError('');
    setLocalNotice('');
    try {
      const result = await teacherStudioComputeAtRisk(academyId, selectedClassroomId || null);
      setAtRisk(result.at_risk ?? []);
      setAtRiskScanned(result.scanned ?? 0);
      setLocalNotice(`At-risk scan complete: ${result.at_risk.length} flagged from ${result.scanned} scanned.`);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocalBusy(false);
    }
  };

  const dispatchNotifications = async () => {
    if (!academyId) return;
    await runAction('Notification dispatch attempted.', async () => {
      await teacherStudioDispatchNotifications(academyId);
    });
  };

  const submitParentReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !reportForm.contact_id) return;
    await runAction('Parent report generated.', async () => {
      const result = await teacherStudioGenerateParentReport(academyId, {
        contact_id: reportForm.contact_id,
        label: reportForm.label.trim() || null,
        expires_in_days: Number(reportForm.expires_in_days) > 0 ? Number(reportForm.expires_in_days) : 180,
      });
      setLastShareUrl(result.share_url);
    });
  };

  const submitCertificate = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !certificateForm.contact_id) return;
    await runAction('Certificate issued.', async () => {
      const result = await teacherStudioIssueAcademyCertificate(academyId, {
        contact_id: certificateForm.contact_id,
        classroom_id: certificateForm.classroom_id || selectedClassroomId || null,
        exam_type: certificateForm.exam_type.trim() || 'academy',
        overall_score: certificateForm.overall_score ? Number(certificateForm.overall_score) : null,
        candidate_name: certificateForm.candidate_name.trim() || undefined,
        center_name: certificateForm.center_name.trim() || undefined,
      });
      setLastShareUrl(result.share_url);
    });
  };

  const submitBranding = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId) return;
    await runAction('Branding saved.', async () => {
      await teacherStudioUpsertBranding(academyId, {
        display_name: brandingForm.display_name.trim() || null,
        tagline: brandingForm.tagline.trim() || null,
        logo_url: brandingForm.logo_url.trim() || null,
        favicon_url: brandingForm.favicon_url.trim() || null,
        primary_color: brandingForm.primary_color.trim() || null,
        accent_color: brandingForm.accent_color.trim() || null,
        custom_domain: brandingForm.custom_domain.trim() || null,
        footer_text: brandingForm.footer_text.trim() || null,
        hide_schood_logo: brandingForm.hide_schood_logo,
      });
    });
  };

  const tabs: Array<{ id: EducationOSTab; label: string }> = [
    { id: 'command', label: 'Command' },
    { id: 'learning', label: 'Learning' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'growth', label: 'Growth' },
    { id: 'engagement', label: 'Engagement' },
    { id: 'brand', label: 'Brand' },
  ];

  return (
    <section className="grid education-os">
      <div className="panel">
        <div className="row between wrap">
          <div>
            <h3>Education OS</h3>
            <p className="muted">Run learning, operations, engagement, growth, reporting, and brand control from one academy surface.</p>
          </div>
          <div className="topbar-actions">
            <select className="input academy-select" value={selectedClassroomId} onChange={(event) => setSelectedClassroomId(event.target.value)}>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
              {classrooms.length === 0 ? <option value="">No classrooms</option> : null}
            </select>
            <button className="ghost-btn" type="button" onClick={() => void loadOsData()} disabled={localBusy}>
              Refresh OS
            </button>
          </div>
        </div>
        <div className="segmented-row" role="tablist" aria-label="Education OS sections">
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

      {localError ? <div className="error-banner">{localError}</div> : null}
      {localNotice ? <div className="info-banner">{localNotice}</div> : null}
      {lastShareUrl ? (
        <div className="info-banner">
          Share link: <a href={lastShareUrl} target="_blank" rel="noreferrer">{lastShareUrl}</a>
        </div>
      ) : null}

      {activeTab === 'command' ? (
        <>
          <section className="stats-grid">
            <article className="stat-card">
              <span>Collected total</span>
              <strong>{dashboard ? `${dashboard.revenue.collected_total.toLocaleString()} ${dashboard.revenue.currency}` : '-'}</strong>
            </article>
            <article className="stat-card">
              <span>This month</span>
              <strong>{dashboard ? `${dashboard.revenue.collected_this_month.toLocaleString()} ${dashboard.revenue.currency}` : '-'}</strong>
            </article>
            <article className="stat-card">
              <span>Outstanding</span>
              <strong>{dashboard ? `${dashboard.revenue.outstanding.toLocaleString()} ${dashboard.revenue.currency}` : '-'}</strong>
            </article>
            <article className="stat-card">
              <span>Students</span>
              <strong>{dashboard?.total_students ?? contacts.length}</strong>
            </article>
            <article className="stat-card">
              <span>Classrooms</span>
              <strong>{dashboard?.total_classrooms ?? classrooms.length}</strong>
            </article>
          </section>

          <section className="grid two">
            <div className="panel">
              <h3>Classroom performance</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Classroom</th>
                      <th>Students</th>
                      <th>Assignments</th>
                      <th>Avg score</th>
                      <th>Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.classroom_stats ?? []).map((item) => (
                      <tr key={item.classroom_id}>
                        <td>{item.name}</td>
                        <td>{item.students}</td>
                        <td>{item.assignments}</td>
                        <td>{item.avg_score ?? '-'}</td>
                        <td>{item.attendance_rate !== null ? `${item.attendance_rate}%` : '-'}</td>
                      </tr>
                    ))}
                    {(dashboard?.classroom_stats ?? []).length === 0 ? (
                      <tr><td colSpan={5}>No classroom metrics yet.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <h3>Enrollment funnel</h3>
              <div className="metric-list">
                {Object.entries(dashboard?.funnel ?? {}).map(([status, count]) => (
                  <div className="metric-row" key={status}>
                    <span>{status}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
                {!dashboard ? <div className="small muted">Loading OS dashboard...</div> : null}
              </div>
              <h3>Referral leaders</h3>
              <ul className="list">
                {referralLeaderboard.map((leader) => (
                  <li key={leader.contact_id}>
                    <div className="row between">
                      <strong>{leader.name}</strong>
                      <span className="small muted">{leader.referrals} joined / {leader.enrolled} enrolled</span>
                    </div>
                  </li>
                ))}
                {referralLeaderboard.length === 0 ? <li>No referral activity yet.</li> : null}
              </ul>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'learning' ? (
        <section className="grid">
          <div className="grid two">
            <div className="panel">
              <h3>Create assignment</h3>
              <form className="grid" onSubmit={submitAssignment}>
                <input className="input" placeholder="Assignment title" value={assignmentForm.title} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, title: event.target.value }))} required />
                <textarea className="input" placeholder="Instructions" value={assignmentForm.description} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, description: event.target.value }))} />
                <div className="grid three">
                  <select className="input" value={assignmentForm.assignment_type} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, assignment_type: event.target.value }))}>
                    {['task', 'test', 'lab', 'reading', 'writing', 'listening', 'speaking', 'custom'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                  </select>
                  <input className="input" type="number" min="0" placeholder="Max score" value={assignmentForm.max_score} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, max_score: event.target.value }))} />
                  <input className="input" type="number" min="0" step="0.1" placeholder="Weight" value={assignmentForm.score_weight} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, score_weight: event.target.value }))} />
                </div>
                <input className="input" type="datetime-local" value={assignmentForm.due_at} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, due_at: event.target.value }))} />
                <button className="primary-btn" type="submit" disabled={localBusy || !selectedClassroomId}>Create assignment</button>
              </form>
            </div>

            <div className="panel">
              <h3>Record grade</h3>
              <form className="grid" onSubmit={submitGrade}>
                <select className="input" value={gradeForm.assignment_id} onChange={(event) => setGradeForm((prev) => ({ ...prev, assignment_id: event.target.value }))} required>
                  <option value="">Select assignment</option>
                  {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
                </select>
                <select className="input" value={gradeForm.contact_id} onChange={(event) => setGradeForm((prev) => ({ ...prev, contact_id: event.target.value }))} required>
                  <option value="">Select student</option>
                  {selectedMembers.map((item) => item.contact ? <option key={item.contact.id} value={item.contact.id}>{contactName(item.contact)}</option> : null)}
                </select>
                <div className="grid two">
                  <input className="input" type="number" step="0.1" placeholder="Score" value={gradeForm.score} onChange={(event) => setGradeForm((prev) => ({ ...prev, score: event.target.value }))} required />
                  <input className="input" type="number" step="0.1" placeholder="Max score" value={gradeForm.max_score} onChange={(event) => setGradeForm((prev) => ({ ...prev, max_score: event.target.value }))} />
                </div>
                <textarea className="input" placeholder="Teacher notes" value={gradeForm.notes} onChange={(event) => setGradeForm((prev) => ({ ...prev, notes: event.target.value }))} />
                <button className="primary-btn" type="submit" disabled={localBusy || !gradeForm.assignment_id || !gradeForm.contact_id}>Save grade</button>
              </form>
            </div>
          </div>

          <div className="panel">
            <h3>Gradebook: {selectedClassroom?.name ?? 'No classroom selected'}</h3>
            <div className="table-wrap os-wide-table">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Composite</th>
                    {gradebook?.assignments.map((assignment) => <th key={assignment.id}>{assignment.title}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {gradebook?.rows.map((row) => (
                    <tr key={row.contact_id}>
                      <td>
                        <strong>{`${row.first_name} ${row.last_name}`.trim() || row.email || row.contact_id}</strong>
                        <div className="small muted">{row.submitted_count}/{row.total_assignments} submitted</div>
                      </td>
                      <td>{row.composite_score !== null ? `${row.composite_score}%` : '-'}</td>
                      {gradebook.assignments.map((assignment) => {
                        const submission = row.submissions[assignment.id];
                        return (
                          <td key={assignment.id}>
                            <span className={statusClass(submission?.status ?? 'missing')}>{submission?.status ?? 'missing'}</span>
                            <div className="small muted">
                              {typeof submission?.score === 'number' ? `${submission.score}/${submission.max_score ?? assignment.max_score ?? '-'}` : '-'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {(!gradebook || gradebook.rows.length === 0) ? <tr><td colSpan={(gradebook?.assignments.length ?? 0) + 2}>No gradebook rows yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'attendance' ? (
        <section className="grid">
          <div className="grid two">
            <div className="panel">
              <h3>Take attendance</h3>
              <form className="grid" onSubmit={submitAttendance}>
                <input className="input" type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Status</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMembers.map((item) => {
                        const contact = item.contact;
                        if (!contact) return null;
                        const draft = attendanceDraft[contact.id] ?? { status: 'present', notes: '' };
                        return (
                          <tr key={contact.id}>
                            <td>{contactName(contact)}</td>
                            <td>
                              <select className="input compact-input" value={draft.status} onChange={(event) => setAttendanceDraft((prev) => ({ ...prev, [contact.id]: { ...draft, status: event.target.value } }))}>
                                {['present', 'absent', 'late', 'excused'].map((status) => <option key={status} value={status}>{status}</option>)}
                              </select>
                            </td>
                            <td>
                              <input className="input compact-input" value={draft.notes} onChange={(event) => setAttendanceDraft((prev) => ({ ...prev, [contact.id]: { ...draft, notes: event.target.value } }))} />
                            </td>
                          </tr>
                        );
                      })}
                      {selectedMembers.length === 0 ? <tr><td colSpan={3}>No students in this classroom.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
                <button className="primary-btn" type="submit" disabled={localBusy || selectedMembers.length === 0}>Save attendance</button>
              </form>
            </div>

            <div className="panel">
              <h3>Weekly timetable</h3>
              <form className="grid" onSubmit={submitSchedule}>
                <div className="grid two">
                  <select className="input" value={scheduleForm.day_of_week} onChange={(event) => setScheduleForm((prev) => ({ ...prev, day_of_week: event.target.value }))}>
                    {dayLabels.map((label, index) => <option key={label} value={index}>{label}</option>)}
                  </select>
                  <input className="input" value={scheduleForm.timezone} onChange={(event) => setScheduleForm((prev) => ({ ...prev, timezone: event.target.value }))} />
                </div>
                <div className="grid two">
                  <input className="input" type="time" value={scheduleForm.start_time} onChange={(event) => setScheduleForm((prev) => ({ ...prev, start_time: event.target.value }))} required />
                  <input className="input" type="time" value={scheduleForm.end_time} onChange={(event) => setScheduleForm((prev) => ({ ...prev, end_time: event.target.value }))} />
                </div>
                <input className="input" placeholder="Label" value={scheduleForm.label} onChange={(event) => setScheduleForm((prev) => ({ ...prev, label: event.target.value }))} />
                <button className="primary-btn" type="submit" disabled={localBusy || !selectedClassroomId || !scheduleForm.start_time}>Add schedule slot</button>
              </form>
              <ul className="list">
                {schedule.map((slot) => (
                  <li key={slot.id}>
                    <div className="row between">
                      <strong>{dayLabels[slot.day_of_week] ?? slot.day_of_week} {slot.start_time}{slot.end_time ? `-${slot.end_time}` : ''}</strong>
                      <button className="small-btn" type="button" onClick={() => void removeSchedule(slot.id)} disabled={localBusy}>Remove</button>
                    </div>
                    <div className="small muted">{slot.label || 'Class'} | {slot.timezone}</div>
                  </li>
                ))}
                {schedule.length === 0 ? <li>No timetable slots yet.</li> : null}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'growth' ? (
        <section className="grid two">
          <div className="panel">
            <h3>Bulk enroll</h3>
            <form className="grid" onSubmit={submitInvites}>
              <textarea className="input monospaced-area" value={inviteText} onChange={(event) => setInviteText(event.target.value)} />
              <button className="primary-btn" type="submit" disabled={localBusy}>Invite and enroll</button>
            </form>
            <ul className="list">
              {bulkInvites.slice(0, 8).map((invite) => (
                <li key={invite.id}>
                  <div className="row between">
                    <strong>{invite.email}</strong>
                    <span className={statusClass(invite.status)}>{invite.status}</span>
                  </div>
                  <div className="small muted">{formatDate(invite.invited_at)} {invite.error ? `| ${invite.error}` : ''}</div>
                </li>
              ))}
              {bulkInvites.length === 0 ? <li>No bulk invite history for this classroom.</li> : null}
            </ul>
          </div>

          <div className="panel">
            <h3>Placement and staff</h3>
            <form className="grid" onSubmit={submitPlacement}>
              <select className="input" value={placementForm.contact_id} onChange={(event) => setPlacementForm((prev) => ({ ...prev, contact_id: event.target.value }))}>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}</option>)}
              </select>
              <div className="grid two">
                <input className="input" type="number" min="0" max="100" placeholder="Diagnostic score" value={placementForm.score} onChange={(event) => setPlacementForm((prev) => ({ ...prev, score: event.target.value }))} />
                <input className="input" placeholder="Manual CEFR level" value={placementForm.level} onChange={(event) => setPlacementForm((prev) => ({ ...prev, level: event.target.value.toUpperCase() }))} />
              </div>
              <button className="primary-btn" type="submit" disabled={localBusy || !placementForm.contact_id}>Record placement</button>
            </form>

            <form className="grid staff-form" onSubmit={submitStaff}>
              <input className="input" type="email" placeholder="Staff email" value={staffForm.staff_email} onChange={(event) => setStaffForm((prev) => ({ ...prev, staff_email: event.target.value }))} required />
              <input className="input" placeholder="Display name" value={staffForm.name} onChange={(event) => setStaffForm((prev) => ({ ...prev, name: event.target.value }))} />
              <select className="input" value={staffForm.staff_role} onChange={(event) => setStaffForm((prev) => ({ ...prev, staff_role: event.target.value }))}>
                {['teacher', 'manager', 'assistant'].map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <div className="chip-grid">
                {classrooms.map((classroom) => {
                  const checked = staffForm.classroom_ids.includes(classroom.id);
                  return (
                    <label key={classroom.id} className="classroom-publish-toggle">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setStaffForm((prev) => ({
                          ...prev,
                          classroom_ids: event.target.checked
                            ? [...prev.classroom_ids, classroom.id]
                            : prev.classroom_ids.filter((id) => id !== classroom.id),
                        }))}
                      />
                      {classroom.name}
                    </label>
                  );
                })}
              </div>
              <button className="primary-btn" type="submit" disabled={localBusy}>Save staff</button>
            </form>

            <ul className="list">
              {staff.map((person) => (
                <li key={person.id}>
                  <div className="row between">
                    <strong>{person.display_name || person.email}</strong>
                    <button className="small-btn" type="button" onClick={() => void removeStaff(person.id)} disabled={localBusy}>Remove</button>
                  </div>
                  <div className="small muted">{person.role} | {staffClassroomIds(person).length} classroom(s)</div>
                </li>
              ))}
              {staff.length === 0 ? <li>No staff records yet.</li> : null}
            </ul>
          </div>
        </section>
      ) : null}

      {activeTab === 'engagement' ? (
        <section className="grid two">
          <div className="panel">
            <h3>Risk and notifications</h3>
            <div className="row wrap">
              <button className="primary-btn" type="button" onClick={() => void computeAtRisk()} disabled={localBusy}>Compute at risk</button>
              <button className="ghost-btn" type="button" onClick={() => void dispatchNotifications()} disabled={localBusy}>Dispatch queued</button>
            </div>
            <p className="small muted">Last scan: {atRisk.length} flagged from {atRiskScanned} scanned.</p>
            <ul className="list">
              {atRisk.map((student) => (
                <li key={`${student.contact_id}-${student.classroom_id ?? 'academy'}`}>
                  <div className="row between">
                    <strong>{student.name}</strong>
                    <span className="status status--bad">{student.reasons.length} signal(s)</span>
                  </div>
                  <div className="small muted">{student.classroom_name || 'Academy'} | {student.reasons.join(', ')}</div>
                </li>
              ))}
              {atRisk.length === 0 ? <li>No at-risk results loaded.</li> : null}
            </ul>
            <h3>Notification outbox</h3>
            <ul className="list">
              {notifications.slice(0, 10).map((notification) => (
                <li key={notification.id}>
                  <div className="row between">
                    <strong>{notification.title || notification.type}</strong>
                    <span className={statusClass(notification.status)}>{notification.status}</span>
                  </div>
                  <div className="small muted">{notification.channel} | {formatDate(notification.scheduled_at)}</div>
                  <div>{notification.body}</div>
                </li>
              ))}
              {notifications.length === 0 ? <li>No notifications queued.</li> : null}
            </ul>
          </div>

          <div className="panel">
            <h3>Reports and certificates</h3>
            <form className="grid" onSubmit={submitParentReport}>
              <select className="input" value={reportForm.contact_id} onChange={(event) => setReportForm((prev) => ({ ...prev, contact_id: event.target.value }))}>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}</option>)}
              </select>
              <div className="grid two">
                <input className="input" value={reportForm.label} onChange={(event) => setReportForm((prev) => ({ ...prev, label: event.target.value }))} />
                <input className="input" type="number" min="1" max="365" value={reportForm.expires_in_days} onChange={(event) => setReportForm((prev) => ({ ...prev, expires_in_days: event.target.value }))} />
              </div>
              <button className="primary-btn" type="submit" disabled={localBusy || !reportForm.contact_id}>Generate parent report</button>
            </form>

            <form className="grid" onSubmit={submitCertificate}>
              <select className="input" value={certificateForm.contact_id} onChange={(event) => setCertificateForm((prev) => ({ ...prev, contact_id: event.target.value }))}>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}</option>)}
              </select>
              <select className="input" value={certificateForm.classroom_id} onChange={(event) => setCertificateForm((prev) => ({ ...prev, classroom_id: event.target.value }))}>
                <option value="">Use selected classroom</option>
                {classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
              </select>
              <div className="grid two">
                <input className="input" placeholder="Exam type" value={certificateForm.exam_type} onChange={(event) => setCertificateForm((prev) => ({ ...prev, exam_type: event.target.value }))} />
                <input className="input" type="number" step="0.1" placeholder="Overall score" value={certificateForm.overall_score} onChange={(event) => setCertificateForm((prev) => ({ ...prev, overall_score: event.target.value }))} />
              </div>
              <input className="input" placeholder="Candidate name override" value={certificateForm.candidate_name} onChange={(event) => setCertificateForm((prev) => ({ ...prev, candidate_name: event.target.value }))} />
              <input className="input" placeholder="Center name override" value={certificateForm.center_name} onChange={(event) => setCertificateForm((prev) => ({ ...prev, center_name: event.target.value }))} />
              <button className="primary-btn" type="submit" disabled={localBusy || !certificateForm.contact_id}>Issue certificate</button>
            </form>
          </div>
        </section>
      ) : null}

      {activeTab === 'brand' ? (
        <section className="panel">
          <h3>White-label brand controls</h3>
          <form className="grid" onSubmit={submitBranding}>
            <div className="grid two">
              <input className="input" placeholder="Display name" value={brandingForm.display_name} onChange={(event) => setBrandingForm((prev) => ({ ...prev, display_name: event.target.value }))} />
              <input className="input" placeholder="Tagline" value={brandingForm.tagline} onChange={(event) => setBrandingForm((prev) => ({ ...prev, tagline: event.target.value }))} />
            </div>
            <div className="grid two">
              <input className="input" placeholder="Logo URL" value={brandingForm.logo_url} onChange={(event) => setBrandingForm((prev) => ({ ...prev, logo_url: event.target.value }))} />
              <input className="input" placeholder="Favicon URL" value={brandingForm.favicon_url} onChange={(event) => setBrandingForm((prev) => ({ ...prev, favicon_url: event.target.value }))} />
            </div>
            <div className="grid two">
              <label className="grid">
                <span className="small muted">Primary color</span>
                <input className="input" type="color" value={brandingForm.primary_color} onChange={(event) => setBrandingForm((prev) => ({ ...prev, primary_color: event.target.value }))} />
              </label>
              <label className="grid">
                <span className="small muted">Accent color</span>
                <input className="input" type="color" value={brandingForm.accent_color} onChange={(event) => setBrandingForm((prev) => ({ ...prev, accent_color: event.target.value }))} />
              </label>
            </div>
            <input className="input" placeholder="Custom domain" value={brandingForm.custom_domain} onChange={(event) => setBrandingForm((prev) => ({ ...prev, custom_domain: event.target.value }))} />
            <textarea className="input" placeholder="Footer text" value={brandingForm.footer_text} onChange={(event) => setBrandingForm((prev) => ({ ...prev, footer_text: event.target.value }))} />
            <label className="classroom-publish-toggle">
              <input type="checkbox" checked={brandingForm.hide_schood_logo} onChange={(event) => setBrandingForm((prev) => ({ ...prev, hide_schood_logo: event.target.checked }))} />
              Hide Schood logo on academy-facing pages
            </label>
            <button className="primary-btn" type="submit" disabled={localBusy}>Save branding</button>
          </form>
          <div className="small muted">
            Current brand record: {branding ? `updated ${formatDate(branding.updated_at)}` : 'not configured yet'}
          </div>
        </section>
      ) : null}
    </section>
  );
};
