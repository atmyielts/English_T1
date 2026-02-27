import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type {
  TeacherStudioClassroom,
  TeacherStudioClassroomMembership,
  TeacherStudioContact,
} from '../../lib/client';
import type { ClassroomFormState, ClassroomMembershipFormState } from './types';

type ClassroomsViewProps = {
  busy: boolean;
  classroomForm: ClassroomFormState;
  setClassroomForm: Dispatch<SetStateAction<ClassroomFormState>>;
  membershipForm: ClassroomMembershipFormState;
  setMembershipForm: Dispatch<SetStateAction<ClassroomMembershipFormState>>;
  classrooms: TeacherStudioClassroom[];
  classroomMemberships: TeacherStudioClassroomMembership[];
  contacts: TeacherStudioContact[];
  onCreateClassroom: (e: FormEvent) => Promise<void>;
  onSaveMembership: (e: FormEvent) => Promise<void>;
  onRemoveMembership: (membershipId: string) => Promise<void>;
  onOpenClassroom: (classroomId: string) => void;
  formatDate: (iso: string | null | undefined) => string;
};

export const ClassroomsView = ({
  busy,
  classroomForm,
  setClassroomForm,
  membershipForm,
  setMembershipForm,
  classrooms,
  classroomMemberships,
  contacts,
  onCreateClassroom,
  onSaveMembership,
  onRemoveMembership,
  onOpenClassroom,
  formatDate,
}: ClassroomsViewProps) => {
  const classroomNameById = new Map(classrooms.map((item) => [item.id, item.name]));
  const contactById = new Map(contacts.map((item) => [item.id, item]));

  return (
    <>
      <section className="grid two">
        <form className="panel" onSubmit={onCreateClassroom}>
          <h3>Create classroom</h3>
          <input
            className="input"
            placeholder="Classroom name"
            value={classroomForm.name}
            onChange={(e) => setClassroomForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <textarea
            className="input"
            placeholder="Description (optional)"
            value={classroomForm.description}
            onChange={(e) => setClassroomForm((p) => ({ ...p, description: e.target.value }))}
          />
          <button className="primary-btn" type="submit" disabled={busy}>
            Save classroom
          </button>
        </form>

        <form className="panel" onSubmit={onSaveMembership}>
          <h3>Assign student</h3>
          <select
            className="input"
            value={membershipForm.classroom_id}
            onChange={(e) => setMembershipForm((p) => ({ ...p, classroom_id: e.target.value }))}
            required
          >
            <option value="">Select classroom</option>
            {classrooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={membershipForm.contact_id}
            onChange={(e) => setMembershipForm((p) => ({ ...p, contact_id: e.target.value }))}
            required
          >
            <option value="">Select contact</option>
            {contacts.map((item) => (
              <option key={item.id} value={item.id}>
                {(item.first_name || item.last_name) ? `${item.first_name} ${item.last_name}`.trim() : item.email || item.id}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={membershipForm.role}
            onChange={(e) => setMembershipForm((p) => ({ ...p, role: e.target.value }))}
          >
            <option value="student">student</option>
            <option value="assistant">assistant</option>
          </select>
          <button className="primary-btn" type="submit" disabled={busy}>
            Save membership
          </button>
        </form>
      </section>

      <section className="panel">
        <h3>Classrooms</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Members</th>
                <th>Status</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {classrooms.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div>{item.name}</div>
                    {item.description ? <div className="small muted">{item.description}</div> : null}
                  </td>
                  <td>{item.member_count ?? 0}</td>
                  <td>{item.is_active ? 'Active' : 'Inactive'}</td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <button className="small-btn" type="button" onClick={() => onOpenClassroom(item.id)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
              {classrooms.length === 0 ? (
                <tr>
                  <td colSpan={5}>No classrooms yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>Memberships</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Classroom</th>
                <th>Role</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {classroomMemberships.map((item) => {
                const contact = contactById.get(item.contact_id);
                const contactLabel = contact
                  ? `${contact.first_name} ${contact.last_name}`.trim() || contact.email || contact.id
                  : item.contact_id;
                return (
                  <tr key={item.id}>
                    <td>{contactLabel}</td>
                    <td>{classroomNameById.get(item.classroom_id) ?? item.classroom_id}</td>
                    <td>{item.role}</td>
                    <td>{formatDate(item.joined_at)}</td>
                    <td>
                      <button
                        className="small-btn danger-btn"
                        type="button"
                        disabled={busy}
                        onClick={() => void onRemoveMembership(item.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
              {classroomMemberships.length === 0 ? (
                <tr>
                  <td colSpan={5}>No memberships yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
