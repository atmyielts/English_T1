import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { TeacherStudioAnnouncement, TeacherStudioClassroom } from '../../lib/client';
import type { AnnouncementFormState } from './types';

type AnnouncementsViewProps = {
  busy: boolean;
  classrooms: TeacherStudioClassroom[];
  form: AnnouncementFormState;
  setForm: Dispatch<SetStateAction<AnnouncementFormState>>;
  announcements: TeacherStudioAnnouncement[];
  onSubmit: (e: FormEvent) => Promise<void>;
  formatDate: (iso: string | null | undefined) => string;
};

export const AnnouncementsView = ({
  busy,
  classrooms,
  form,
  setForm,
  announcements,
  onSubmit,
  formatDate,
}: AnnouncementsViewProps) => {
  const classroomNameById = new Map(classrooms.map((item) => [item.id, item.name]));

  return (
    <>
      <form className="panel" onSubmit={onSubmit}>
        <h3>Send announcement</h3>
        <select
          className="input"
          value={form.classroom_id}
          onChange={(e) => setForm((previous) => ({ ...previous, classroom_id: e.target.value }))}
        >
          <option value="">All active contacts</option>
          {classrooms.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm((previous) => ({ ...previous, title: e.target.value }))}
          required
        />
        <textarea
          className="input"
          placeholder="Announcement message"
          value={form.content}
          onChange={(e) => setForm((previous) => ({ ...previous, content: e.target.value }))}
          required
        />
        <button className="primary-btn" type="submit" disabled={busy || !form.title.trim() || !form.content.trim()}>
          Send announcement
        </button>
      </form>

      <section className="panel">
        <h3>Announcement history</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Audience</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div>{item.title}</div>
                    <div className="small muted">{item.body}</div>
                  </td>
                  <td>{item.classroom_id ? classroomNameById.get(item.classroom_id) ?? item.classroom_id : 'All contacts'}</td>
                  <td>{formatDate(item.created_at)}</td>
                </tr>
              ))}
              {announcements.length === 0 ? (
                <tr>
                  <td colSpan={3}>No announcements yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
