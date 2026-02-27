import type { FormEvent } from 'react';
import type {
  TeacherStudioAlert,
  TeacherStudioAnnouncement,
  TeacherStudioClassroom,
  TeacherStudioClassroomMembership,
  TeacherStudioContact,
} from '../../lib/client';

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
  formatDate: (iso: string | null | undefined) => string;
  statusClass: (status: string) => string;
  onBack: () => void;
};

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
                placeholder="Enter Teacher Office"
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
          {!canManageLanding ? <p className="small muted">Owner/admin role required to update landing settings.</p> : null}
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
                  const name = contact
                    ? `${contact.first_name} ${contact.last_name}`.trim() || contact.email || contact.id
                    : membership.contact_id;
                  return (
                    <tr key={membership.id}>
                      <td>{name}</td>
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
            const contactLabel = contact
              ? `${contact.first_name} ${contact.last_name}`.trim() || contact.email || contact.id
              : 'academy';
            const status = alert.resolved ? 'resolved' : alert.severity;
            return (
              <li key={alert.id}>
                <div className="row between">
                  <strong>{alert.type}</strong>
                  <span className={statusClass(status)}>{status}</span>
                </div>
                <div className="small muted">
                  {contactLabel} | {formatDate(alert.created_at)}
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
