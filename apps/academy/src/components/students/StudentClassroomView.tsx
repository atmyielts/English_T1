import type {
  TeacherStudioAnnouncement,
  TeacherStudioClassroom,
  TeacherStudioClassroomMembership,
  TeacherStudioMessage,
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

const metadataClassroomId = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).classroom_id;
  if (!value) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

export const StudentClassroomView = ({
  classroom,
  academyName,
  memberships,
  announcements,
  messages,
  formatDate,
  onBack,
}: StudentClassroomViewProps) => {
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

  const classroomAnnouncements = announcements.filter((announcement) =>
    announcement.classroom_id === classroom.id || announcement.classroom_id === null
  );

  const classroomMessages = messages.filter((message) => {
    const id = metadataClassroomId(message.metadata);
    return !id || id === classroom.id;
  });

  return (
    <section className="grid">
      <div className="panel">
        <div className="row between">
          <h3>{classroom.name}</h3>
          <button className="ghost-btn" type="button" onClick={onBack}>
            Back to classrooms
          </button>
        </div>
        <p className="muted">{academyName}</p>
        <p>{classroom.description || 'No classroom description yet.'}</p>
        <div className="metric-list">
          <div className="metric-row">
            <span>Your role</span>
            <strong>{memberships[0]?.role ?? 'student'}</strong>
          </div>
          <div className="metric-row">
            <span>Members</span>
            <strong>{classroom.member_count ?? memberships.length}</strong>
          </div>
          <div className="metric-row">
            <span>Announcements</span>
            <strong>{classroomAnnouncements.length}</strong>
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="panel">
          <h3>Announcements</h3>
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
            {classroomAnnouncements.length === 0 ? <li>No announcements yet.</li> : null}
          </ul>
        </div>

        <div className="panel">
          <h3>Messages</h3>
          <ul className="list">
            {classroomMessages.slice(0, 30).map((message) => (
              <li key={message.id}>
                <div className="row between">
                  <strong>{message.sender_type} | {message.message_type}</strong>
                  <span className="small muted">{formatDate(message.created_at)}</span>
                </div>
                <div>{message.content}</div>
              </li>
            ))}
            {classroomMessages.length === 0 ? <li>No messages yet.</li> : null}
          </ul>
        </div>
      </div>
    </section>
  );
};
