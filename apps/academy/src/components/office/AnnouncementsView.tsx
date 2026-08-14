import { translate } from '../../i18n';
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
  canSendAnnouncements: boolean;
  canSendGlobalAnnouncements: boolean;
};

export const AnnouncementsView = ({
  busy,
  classrooms,
  form,
  setForm,
  announcements,
  onSubmit,
  formatDate,
  canSendAnnouncements,
  canSendGlobalAnnouncements,
}: AnnouncementsViewProps) => {
  const classroomNameById = new Map(classrooms.map((item) => [item.id, item.name]));

  return (
    <>
      {canSendAnnouncements ? (
        <form className="panel workspace-form" onSubmit={onSubmit}>
          <h3>{translate("Send announcement")}</h3>
          <label>{translate("Audience")}<select
            className="input"
            value={form.classroom_id}
            onChange={(e) => setForm((previous) => ({ ...previous, classroom_id: e.target.value }))}
          >
            {canSendGlobalAnnouncements ? <option value="">{translate("All active contacts")}</option> : null}
            {!canSendGlobalAnnouncements ? <option value="">{translate("Select classroom")}</option> : null}
            {classrooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select></label>
          <label>{translate("Title")}<input
            className="input"
            value={form.title}
            onChange={(e) => setForm((previous) => ({ ...previous, title: e.target.value }))}
            required
          /></label>
          <label>{translate("Message")}<textarea
            className="input"
            value={form.content}
            onChange={(e) => setForm((previous) => ({ ...previous, content: e.target.value }))}
            required
          /></label>
          <div className="form-actions"><button
            className="primary-btn"
            type="submit"
            disabled={busy || !form.title.trim() || !form.content.trim() || (!canSendGlobalAnnouncements && !form.classroom_id)}
          >
            {translate("Send announcement")}{' '}</button></div>
        </form>
      ) : null}

      <section className="panel">
        <h3>{translate("Announcement history")}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{translate("Title")}</th>
                <th>{translate("Audience")}</th>
                <th>{translate("Created")}</th>
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
                  <td colSpan={3}><div className="table-empty-state"><strong>{translate("No announcements yet")}</strong><span>{translate("Send a concise update to a classroom or all active contacts.")}</span></div></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
