import type { FormEvent } from 'react';
import type {
  TeacherStudioActionItem,
  TeacherStudioAlert,
  TeacherStudioAnnouncement,
  TeacherStudioClassroom,
  TeacherStudioClassroomMembership,
  TeacherStudioContact,
  TeacherStudioEducationOS,
  TeacherStudioLifecycleRow,
} from '../../lib/client';

type ActionStatus = 'resolved' | 'dismissed' | 'snoozed' | 'open';

type ClassroomLandingFormState = {
  description: string;
  headline: string;
  subheadline: string;
  teacher_cta_label: string;
  student_cta_label: string;
  card_summary: string;
};

type ClassroomDetailViewProps = {
  classroom: TeacherStudioClassroom | null;
  memberships: TeacherStudioClassroomMembership[];
  contacts: TeacherStudioContact[];
  announcements: TeacherStudioAnnouncement[];
  alerts: TeacherStudioAlert[];
  landingForm: ClassroomLandingFormState;
  onLandingFieldChange: (field: keyof ClassroomLandingFormState, value: string) => void;
  onSaveLanding: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  canManageLanding: boolean;
  educationOS: TeacherStudioEducationOS | null;
  onResolveActionItem: (item: TeacherStudioActionItem, status?: ActionStatus) => Promise<void>;
  onOpenActionItem: (item: TeacherStudioActionItem) => void;
  canResolveActionItems: boolean;
  canIssueCertificates: boolean;
  formatDate: (iso: string | null | undefined) => string;
  statusClass: (status: string) => string;
  onBack: () => void;
};

const priorityClass = (priority: string): string => {
  if (priority === 'critical' || priority === 'high') return 'status status--bad';
  if (priority === 'medium') return 'status status--pending';
  return 'status status--ok';
};

const severityClass = (severity: string): string => {
  if (severity === 'critical' || severity === 'high') return 'status status--bad';
  if (severity === 'positive' || severity === 'low') return 'status status--ok';
  return 'status status--pending';
};

const isUrgentAction = (item: TeacherStudioActionItem): boolean =>
  item.priority === 'critical' || item.priority === 'high';

const sourceLabel = (source: string): string => source.replace(/_/g, ' ');

const eventTypeLabel = (type: string): string => type.replace(/_/g, ' ');

const contactLabel = (contact: TeacherStudioContact | null | undefined, fallback = 'Unknown student'): string => {
  if (!contact) return fallback;
  const name = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();
  return name || contact.email || fallback;
};

const rowBelongsToClassroom = (
  row: TeacherStudioLifecycleRow,
  classroomId: string,
  memberContactIds: Set<string>,
): boolean => row.classroom_ids.includes(classroomId) || memberContactIds.has(row.contact_id);

export const ClassroomDetailView = ({
  classroom,
  memberships,
  contacts,
  announcements,
  alerts,
  landingForm,
  onLandingFieldChange,
  onSaveLanding,
  busy,
  canManageLanding,
  educationOS,
  onResolveActionItem,
  onOpenActionItem,
  canResolveActionItems,
  canIssueCertificates,
  formatDate,
  statusClass,
  onBack,
}: ClassroomDetailViewProps) => {
  if (!classroom) {
    return (
      <section className="panel">
        <h3>Classroom not found</h3>
        <p className="muted">This classroom does not exist in the selected academy.</p>
        <button className="ghost-btn" type="button" onClick={onBack}>
          Back to classrooms
        </button>
      </section>
    );
  }

  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const memberContactIds = new Set(memberships.map((membership) => membership.contact_id));
  const classroomAnnouncements = announcements.filter((announcement) => announcement.classroom_id === classroom.id);
  const classroomAlerts = alerts.filter((alert) => alert.contact_id && memberContactIds.has(alert.contact_id));
  const actionQueue = (educationOS?.action_queue ?? []).filter((item) => item.status === 'open');
  const classroomActionItems = actionQueue.filter(
    (item) => item.classroom_id === classroom.id || (!!item.contact_id && memberContactIds.has(item.contact_id)),
  );
  const classroomLifecycleRows = (educationOS?.pipeline ?? []).filter((row) =>
    rowBelongsToClassroom(row, classroom.id, memberContactIds),
  );
  const classroomEvents = (educationOS?.calendar_events ?? [])
    .filter((event) => event.classroom_id === classroom.id || (!!event.contact_id && memberContactIds.has(event.contact_id)))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, 6);
  const classroomInsights = (educationOS?.intelligence ?? [])
    .filter((insight) => insight.classroom_id === classroom.id || (!!insight.contact_id && memberContactIds.has(insight.contact_id)))
    .slice(0, 4);
  const lifecycleByContact = new Map(classroomLifecycleRows.map((row) => [row.contact_id, row]));
  const actionByContact = new Map<string, TeacherStudioActionItem>();

  for (const item of classroomActionItems) {
    if (item.contact_id && !actionByContact.has(item.contact_id)) actionByContact.set(item.contact_id, item);
  }

  const studentRows = memberships.map((membership) => {
    const contact = contactById.get(membership.contact_id);
    const lifecycle = lifecycleByContact.get(membership.contact_id) ?? null;
    const nextAction = actionByContact.get(membership.contact_id) ?? null;
    return {
      membership,
      contact,
      lifecycle,
      nextAction,
      name: contactLabel(contact, membership.contact_id),
      stage: lifecycle?.derived_stage ?? lifecycle?.stage ?? membership.role,
      score: lifecycle?.composite_score ?? null,
      attendance: lifecycle?.attendance_rate ?? null,
      missing: lifecycle?.missing_assignments ?? 0,
      certificateReady: canIssueCertificates ? lifecycle?.certificate_ready ?? false : false,
    };
  });

  const urgentActionsCount = classroomActionItems.filter(isUrgentAction).length;
  const gradeBacklogCount = classroomActionItems.filter((item) => item.source_type === 'grading_backlog').length;
  const missingWorkCount = classroomLifecycleRows.reduce((total, row) => total + row.missing_assignments, 0);
  const attendanceRiskCount = classroomLifecycleRows.filter((row) => row.attendance_rate !== null && row.attendance_rate < 70).length;
  const certificateReadyCount = canIssueCertificates
    ? classroomLifecycleRows.filter((row) => row.certificate_ready).length
    : 0;

  return (
    <section className="grid">
      <div className="panel">
        <div className="row between">
          <h3>{classroom.name}</h3>
          <button className="ghost-btn" type="button" onClick={onBack}>
            Back to classrooms
          </button>
        </div>
        <p className="muted">{classroom.description || 'No description yet.'}</p>
        <div className="metric-list">
          <div className="metric-row">
            <span>Status</span>
            <strong>{classroom.is_active ? 'active' : 'inactive'}</strong>
          </div>
          <div className="metric-row">
            <span>Members</span>
            <strong>{memberships.length}</strong>
          </div>
          <div className="metric-row">
            <span>Announcements</span>
            <strong>{classroomAnnouncements.length}</strong>
          </div>
          <div className="metric-row">
            <span>Alerts</span>
            <strong>{classroomAlerts.length}</strong>
          </div>
        </div>
      </div>

      <div className="panel lms-ops-panel">
        <div className="row between">
          <h3>Learning operations</h3>
          <span className="status">{classroomActionItems.length} open actions</span>
        </div>
        <div className="lms-kpi-grid">
          <article>
            <span>Urgent</span>
            <strong>{urgentActionsCount}</strong>
          </article>
          <article>
            <span>Grade backlog</span>
            <strong>{gradeBacklogCount}</strong>
          </article>
          <article>
            <span>Missing work</span>
            <strong>{missingWorkCount}</strong>
          </article>
          <article>
            <span>Attendance risk</span>
            <strong>{attendanceRiskCount}</strong>
          </article>
          {canIssueCertificates ? (
            <article>
              <span>Certificates</span>
              <strong>{certificateReadyCount}</strong>
            </article>
          ) : null}
        </div>

        <div className="table-wrap lms-tight-table">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Stage</th>
                <th>Score</th>
                <th>Attendance</th>
                <th>Missing</th>
                <th>Next action</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {studentRows.map((row) => (
                <tr key={row.membership.id}>
                  <td>
                    <div>{row.name}</div>
                    <div className="small muted">{row.contact?.email || row.membership.role}</div>
                  </td>
                  <td>{row.stage}</td>
                  <td>{row.score !== null ? row.score : '-'}</td>
                  <td>{row.attendance !== null ? `${row.attendance}%` : '-'}</td>
                  <td>{row.missing}</td>
                  <td>
                    {row.nextAction ? (
                      <>
                        <div>{row.nextAction.title}</div>
                        <div className="small muted">{row.nextAction.recommended_action || row.lifecycle?.next_action || '-'}</div>
                      </>
                    ) : (
                      <span className="muted">{row.lifecycle?.next_action || '-'}</span>
                    )}
                    {row.certificateReady ? <div className="small status status--ok">certificate ready</div> : null}
                  </td>
                  <td>
                    {row.nextAction && canResolveActionItems ? (
                      <button className="small-btn" type="button" disabled={busy} onClick={() => void onResolveActionItem(row.nextAction!)}>
                        Done
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {studentRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>No members in this classroom.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid two">
        <div className="panel">
          <h3>Classroom action queue</h3>
          <div className="lms-action-stack">
            {classroomActionItems.slice(0, 8).map((item) => {
              const contact = item.contact_id ? contactById.get(item.contact_id) : null;
              return (
                <div className="lms-action-row" key={item.id}>
                  <div>
                    <div className="row">
                      <span className={priorityClass(item.priority)}>{item.priority}</span>
                      <strong>{item.title}</strong>
                    </div>
                    <p className="small muted">{item.recommended_action || item.description}</p>
                    <div className="lms-meta-row">
                      <span>{sourceLabel(item.source_type)}</span>
                      {contact ? <span>{contactLabel(contact)}</span> : null}
                      {item.due_at ? <span>{formatDate(item.due_at)}</span> : null}
                    </div>
                  </div>
                  <div className="lms-action-controls">
                    <button className="small-btn" type="button" onClick={() => onOpenActionItem(item)}>
                      Open
                    </button>
                    {canResolveActionItems ? (
                      <button className="small-btn" type="button" disabled={busy} onClick={() => void onResolveActionItem(item)}>
                        Done
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {classroomActionItems.length === 0 ? <div className="empty-state">No open actions for this classroom.</div> : null}
          </div>
        </div>

        <div className="panel">
          <h3>Operating calendar</h3>
          <ul className="list">
            {classroomEvents.map((event) => (
              <li key={event.id}>
                <div className="row between">
                  <strong>{event.title}</strong>
                  <span className={priorityClass(event.priority)}>{eventTypeLabel(event.type)}</span>
                </div>
                <div className="small muted">{formatDate(event.starts_at)}</div>
              </li>
            ))}
            {classroomEvents.length === 0 ? <li>No scheduled operating events.</li> : null}
          </ul>
        </div>
      </div>

      {classroomInsights.length > 0 ? (
        <div className="panel">
          <h3>Decision signals</h3>
          <div className="grid two">
            {classroomInsights.map((insight) => (
              <div className="lms-signal" key={insight.id}>
                <div className="row between">
                  <strong>{insight.title}</strong>
                  <span className={severityClass(insight.severity)}>{insight.severity}</span>
                </div>
                <p>{insight.detail}</p>
                <div className="small muted">{insight.recommended_action}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="panel">
        <h3>Classroom landing copy</h3>
        <p className="muted">
          Configure the classroom landing headline, explanation text, and entry button labels shown before workspace screens.
        </p>
        <form className="grid" onSubmit={onSaveLanding}>
          <label className="grid">
            <span className="small muted">Description</span>
            <textarea
              className="input"
              value={landingForm.description}
              onChange={(event) => onLandingFieldChange('description', event.target.value)}
              placeholder="Short context for this classroom's outcomes and teaching style."
              disabled={!canManageLanding || busy}
            />
          </label>
          <label className="grid">
            <span className="small muted">Hero headline</span>
            <input
              className="input"
              value={landingForm.headline}
              onChange={(event) => onLandingFieldChange('headline', event.target.value)}
              placeholder="Intensive Writing Workshop"
              disabled={!canManageLanding || busy}
            />
          </label>
          <label className="grid">
            <span className="small muted">Hero subheadline</span>
            <textarea
              className="input"
              value={landingForm.subheadline}
              onChange={(event) => onLandingFieldChange('subheadline', event.target.value)}
              placeholder="Explain schedule, goals, and expected learner profile."
              disabled={!canManageLanding || busy}
            />
          </label>
          <div className="grid two">
            <label className="grid">
              <span className="small muted">Teacher CTA label</span>
              <input
                className="input"
                value={landingForm.teacher_cta_label}
                onChange={(event) => onLandingFieldChange('teacher_cta_label', event.target.value)}
                placeholder="Enter staff workspace"
                disabled={!canManageLanding || busy}
              />
            </label>
            <label className="grid">
              <span className="small muted">Student CTA label</span>
              <input
                className="input"
                value={landingForm.student_cta_label}
                onChange={(event) => onLandingFieldChange('student_cta_label', event.target.value)}
                placeholder="Enter Student Workplace"
                disabled={!canManageLanding || busy}
              />
            </label>
          </div>
          <label className="grid">
            <span className="small muted">Classroom card summary</span>
            <textarea
              className="input"
              value={landingForm.card_summary}
              onChange={(event) => onLandingFieldChange('card_summary', event.target.value)}
              placeholder="Short summary shown on academy landing classroom cards."
              disabled={!canManageLanding || busy}
            />
          </label>
          <button className="primary-btn" type="submit" disabled={!canManageLanding || busy}>
            Save classroom landing
          </button>
          {!canManageLanding ? <p className="small muted">Classroom management access required to update landing settings.</p> : null}
        </form>
      </div>

      <div className="grid two">
        <div className="panel">
          <h3>Members</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((membership) => {
                  const contact = contactById.get(membership.contact_id);
                  return (
                    <tr key={membership.id}>
                      <td>{contactLabel(contact, membership.contact_id)}</td>
                      <td>{contact?.email || '-'}</td>
                      <td>{membership.role}</td>
                      <td>{formatDate(membership.joined_at)}</td>
                    </tr>
                  );
                })}
                {memberships.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No members in this classroom.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h3>Classroom announcements</h3>
          <ul className="list">
            {classroomAnnouncements.map((announcement) => (
              <li key={announcement.id}>
                <div className="row between">
                  <strong>{announcement.title}</strong>
                  <span className="small muted">{formatDate(announcement.created_at)}</span>
                </div>
                <div>{announcement.body}</div>
              </li>
            ))}
            {classroomAnnouncements.length === 0 ? <li>No classroom announcements yet.</li> : null}
          </ul>
        </div>
      </div>

      <div className="panel">
        <h3>Related alerts</h3>
        <ul className="list">
          {classroomAlerts.map((alert) => {
            const contact = alert.contact_id ? contactById.get(alert.contact_id) : null;
            const contactName = contactLabel(contact, 'academy');
            const status = alert.resolved ? 'resolved' : alert.severity;
            return (
              <li key={alert.id}>
                <div className="row between">
                  <strong>{alert.type}</strong>
                  <span className={statusClass(status)}>{status}</span>
                </div>
                <div className="small muted">
                  {contactName} | {formatDate(alert.created_at)}
                </div>
                <div>{alert.message}</div>
              </li>
            );
          })}
          {classroomAlerts.length === 0 ? <li>No alerts linked to this classroom.</li> : null}
        </ul>
      </div>
    </section>
  );
};
