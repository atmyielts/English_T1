import { translate } from '../../i18n';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type {
  TeacherStudioActionItem,
  TeacherStudioCalendarEvent,
  TeacherStudioClassroom,
  TeacherStudioClassroomMembership,
  TeacherStudioContact,
  TeacherStudioEducationOS,
  TeacherStudioLifecycleRow,
} from '../../lib/client';
import type { ClassroomFormState, ClassroomMembershipFormState } from './types';

type ActionStatus = 'resolved' | 'dismissed' | 'snoozed' | 'open';

type ClassroomsViewProps = {
  busy: boolean;
  classroomForm: ClassroomFormState;
  setClassroomForm: Dispatch<SetStateAction<ClassroomFormState>>;
  membershipForm: ClassroomMembershipFormState;
  setMembershipForm: Dispatch<SetStateAction<ClassroomMembershipFormState>>;
  classrooms: TeacherStudioClassroom[];
  classroomMemberships: TeacherStudioClassroomMembership[];
  contacts: TeacherStudioContact[];
  educationOS: TeacherStudioEducationOS | null;
  onCreateClassroom: (e: FormEvent) => Promise<void>;
  onSaveMembership: (e: FormEvent) => Promise<void>;
  onRemoveMembership: (membershipId: string) => Promise<void>;
  onOpenClassroom: (classroomId: string) => void;
  onResolveActionItem: (item: TeacherStudioActionItem, status?: ActionStatus) => Promise<void>;
  onOpenActionItem: (item: TeacherStudioActionItem) => void;
  formatDate: (iso: string | null | undefined) => string;
  canManageClassrooms: boolean;
  canManageRoster: boolean;
  canResolveActionItems: boolean;
  canIssueCertificates: boolean;
};

const priorityClass = (priority: string): string => {
  if (priority === 'critical' || priority === 'high') return 'status status--bad';
  if (priority === 'medium') return 'status status--pending';
  return 'status status--ok';
};

const isUrgentAction = (item: TeacherStudioActionItem): boolean =>
  item.priority === 'critical' || item.priority === 'high';

const sourceLabel = (source: string): string => translate(source.replace(/_/g, ' '));

const eventTypeLabel = (type: string): string => translate(type.replace(/_/g, ' '));

const contactLabel = (contact: TeacherStudioContact | null | undefined, fallback = 'Unknown student'): string => {
  if (!contact) return fallback;
  const name = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();
  return name || contact.email || fallback;
};

const actionBelongsToClassroom = (
  item: TeacherStudioActionItem,
  classroomId: string,
  membershipsByContact: Map<string, Set<string>>,
): boolean => {
  if (item.classroom_id === classroomId) return true;
  if (!item.contact_id) return false;
  return membershipsByContact.get(item.contact_id)?.has(classroomId) ?? false;
};

const nextEventForClassroom = (
  events: TeacherStudioCalendarEvent[],
  classroomId: string,
): TeacherStudioCalendarEvent | null => {
  const now = Date.now();
  const candidates = events
    .filter((event) => event.classroom_id === classroomId)
    .filter((event) => {
      const startsAt = Date.parse(event.starts_at);
      return !Number.isFinite(startsAt) || startsAt >= now - 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  return candidates[0] ?? null;
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
  educationOS,
  onCreateClassroom,
  onSaveMembership,
  onRemoveMembership,
  onOpenClassroom,
  onResolveActionItem,
  onOpenActionItem,
  formatDate,
  canManageClassrooms,
  canManageRoster,
  canResolveActionItems,
  canIssueCertificates,
}: ClassroomsViewProps) => {
  const classroomNameById = new Map(classrooms.map((item) => [item.id, item.name]));
  const contactById = new Map(contacts.map((item) => [item.id, item]));
  const membershipsByClassroom = new Map<string, TeacherStudioClassroomMembership[]>();
  const membershipsByContact = new Map<string, Set<string>>();

  for (const membership of classroomMemberships) {
    const classroomEntries = membershipsByClassroom.get(membership.classroom_id) ?? [];
    classroomEntries.push(membership);
    membershipsByClassroom.set(membership.classroom_id, classroomEntries);

    const contactEntries = membershipsByContact.get(membership.contact_id) ?? new Set<string>();
    contactEntries.add(membership.classroom_id);
    membershipsByContact.set(membership.contact_id, contactEntries);
  }

  const actionQueue = (educationOS?.action_queue ?? []).filter((item) => item.status === 'open');
  const pipeline = educationOS?.pipeline ?? [];
  const calendarEvents = educationOS?.calendar_events ?? [];
  const pipelineByClassroom = new Map<string, TeacherStudioLifecycleRow[]>();

  for (const row of pipeline) {
    for (const classroomId of row.classroom_ids ?? []) {
      const existing = pipelineByClassroom.get(classroomId) ?? [];
      existing.push(row);
      pipelineByClassroom.set(classroomId, existing);
    }
  }

  const openActionsCount = educationOS?.stats.open_actions ?? actionQueue.length;
  const urgentActionsCount = educationOS?.stats.urgent_actions ?? actionQueue.filter(isUrgentAction).length;
  const gradeBacklogCount =
    educationOS?.stats.grading_backlog ?? actionQueue.filter((item) => item.source_type === 'grading_backlog').length;
  const missingWorkCount = pipeline.reduce((total, row) => total + row.missing_assignments, 0);
  const attendanceRiskCount = pipeline.filter((row) => row.attendance_rate !== null && row.attendance_rate < 70).length;
  const certificateReadyCount = canIssueCertificates
    ? educationOS?.stats.certificate_ready ?? pipeline.filter((row) => row.certificate_ready).length
    : 0;
  const topActions = actionQueue.slice(0, 5);

  const classroomOperationRows = classrooms.map((classroom) => {
    const classActions = actionQueue.filter((item) => actionBelongsToClassroom(item, classroom.id, membershipsByContact));
    const lifecycleRows = pipelineByClassroom.get(classroom.id) ?? [];
    const nextEvent = nextEventForClassroom(calendarEvents, classroom.id);
    return {
      classroom,
      members: membershipsByClassroom.get(classroom.id)?.length ?? classroom.member_count ?? 0,
      actions: classActions,
      urgent: classActions.filter(isUrgentAction).length,
      grading: classActions.filter((item) => item.source_type === 'grading_backlog').length,
      missing: lifecycleRows.reduce((total, row) => total + row.missing_assignments, 0),
      attendanceRisk: lifecycleRows.filter((row) => row.attendance_rate !== null && row.attendance_rate < 70).length,
      certificates: canIssueCertificates ? lifecycleRows.filter((row) => row.certificate_ready).length : 0,
      nextEvent,
      firstAction: classActions[0] ?? null,
    };
  });

  return (
    <>
      <section className="panel lms-ops-panel classroom-operations">
        <div className="row between">
          <h3>{translate("Classroom operations")}</h3>
          <span className="status">{educationOS ? `Generated ${formatDate(educationOS.generated_at)}` : 'Loading'}</span>
        </div>

        <dl className="workspace-pulse classroom-pulse classroom-operations__pulse">
          <div><dt>{translate("Open actions")}</dt><dd>{openActionsCount}</dd></div>
          <div><dt>{translate("Urgent")}</dt><dd>{urgentActionsCount}</dd></div>
          <div><dt>{translate("Grade backlog")}</dt><dd>{gradeBacklogCount}</dd></div>
          <div><dt>{translate("Missing work")}</dt><dd>{missingWorkCount}</dd></div>
          <div><dt>{translate("Attendance risk")}</dt><dd>{attendanceRiskCount}</dd></div>
          {canIssueCertificates ? (
            <div><dt>{translate("Certificates")}</dt><dd>{certificateReadyCount}</dd></div>
          ) : null}
        </dl>

        <div className="grid two">
          <div className="lms-action-stack">
            <div className="row between">
              <strong>{translate("Teacher action queue")}</strong>
              <span className="small muted">{topActions.length} {translate("shown")}</span>
            </div>
            {topActions.map((item) => {
              const contact = item.contact_id ? contactById.get(item.contact_id) : null;
              const classroomName = item.classroom_id ? classroomNameById.get(item.classroom_id) : null;
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
                      {classroomName ? <span>{classroomName}</span> : null}
                      {contact ? <span>{contactLabel(contact)}</span> : null}
                      {item.due_at ? <span>{formatDate(item.due_at)}</span> : null}
                    </div>
                  </div>
                  <div className="lms-action-controls">
                    <button className="small-btn" type="button" onClick={() => onOpenActionItem(item)}>
                      {translate("Open")}{' '}</button>
                    {canResolveActionItems ? (
                      <button className="small-btn" type="button" disabled={busy} onClick={() => void onResolveActionItem(item)}>
                        {translate("Done")}{' '}</button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {topActions.length === 0 ? <div className="empty-state">{translate("No open LMS actions.")}</div> : null}
          </div>

          <div className="table-wrap lms-tight-table">
            <table>
              <thead>
                <tr>
                  <th>{translate("Classroom")}</th>
                  <th>{translate("Open")}</th>
                  <th>{translate("Urgent")}</th>
                  <th>{translate("Grading")}</th>
                  <th>{translate("Missing")}</th>
                  <th>{translate("Attendance")}</th>
                  <th>{translate("Next event")}</th>
                </tr>
              </thead>
              <tbody>
                {classroomOperationRows.map((row) => (
                  <tr key={row.classroom.id}>
                    <td>
                      <button className="link-btn" type="button" onClick={() => onOpenClassroom(row.classroom.id)}>
                        {row.classroom.name}
                      </button>
                      <div className="small muted">{row.members} {translate("members")}</div>
                    </td>
                    <td>{row.actions.length}</td>
                    <td>{row.urgent}</td>
                    <td>{row.grading}</td>
                    <td>{row.missing}</td>
                    <td>{row.attendanceRisk}</td>
                    <td>
                      {row.nextEvent ? (
                        <>
                          <div>{row.nextEvent.title}</div>
                          <div className="small muted">
                            {eventTypeLabel(row.nextEvent.type)} | {formatDate(row.nextEvent.starts_at)}
                          </div>
                        </>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {classroomOperationRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}><div className="table-empty-state"><strong>{translate("No classrooms yet")}</strong><span>{translate("Create the first classroom before assigning students or teachers.")}</span></div></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {canManageClassrooms || canManageRoster ? (
        <section className="grid two">
          {canManageClassrooms ? (
            <details className="panel workspace-create-disclosure">
              <summary>{translate("Create classroom")}</summary>
              <form className="workspace-form" onSubmit={onCreateClassroom}>
                <label>{translate("Classroom name")}<input disabled={busy} className="input" value={classroomForm.name} onChange={(e) => setClassroomForm((p) => ({ ...p, name: e.target.value }))} required /></label>
                <label>{translate("Description")}{' '}<span className="optional-label">{translate("Optional")}</span><textarea disabled={busy} className="input" value={classroomForm.description} onChange={(e) => setClassroomForm((p) => ({ ...p, description: e.target.value }))} /></label>
                <div className="form-actions"><button className="primary-btn" type="submit" disabled={busy}>{translate("Save classroom")}</button></div>
              </form>
            </details>
          ) : null}

          {canManageRoster ? (
            <details className="panel workspace-create-disclosure">
              <summary>{translate("Assign student or assistant")}</summary>
              <form className="workspace-form" onSubmit={onSaveMembership}>
                <label>{translate("Classroom")}<select disabled={busy} className="input" value={membershipForm.classroom_id} onChange={(e) => setMembershipForm((p) => ({ ...p, classroom_id: e.target.value }))} required><option value="">{translate("Select classroom")}</option>{classrooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label>{translate("Contact")}<select disabled={busy} className="input" value={membershipForm.contact_id} onChange={(e) => setMembershipForm((p) => ({ ...p, contact_id: e.target.value }))} required><option value="">{translate("Select contact")}</option>{contacts.map((item) => <option key={item.id} value={item.id}>{contactLabel(item, item.id)}</option>)}</select></label>
                <label>{translate("Classroom role")}<select disabled={busy} className="input" value={membershipForm.role} onChange={(e) => setMembershipForm((p) => ({ ...p, role: e.target.value }))}><option value="student">{translate("Student")}</option><option value="assistant">{translate("Assistant")}</option></select></label>
                <div className="form-actions"><button className="primary-btn" type="submit" disabled={busy}>{translate("Save membership")}</button></div>
              </form>
            </details>
          ) : null}
        </section>
      ) : null}

      <section className="panel">
        <h3>{translate("Classrooms")}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{translate("Name")}</th>
                <th>{translate("Members")}</th>
                <th>{translate("Status")}</th>
                <th>{translate("Open actions")}</th>
                <th>{translate("Created")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {classrooms.map((item) => {
                const operationRow = classroomOperationRows.find((row) => row.classroom.id === item.id);
                return (
                  <tr key={item.id}>
                    <td>
                      <div>{item.name}</div>
                      {item.description ? <div className="small muted">{item.description}</div> : null}
                    </td>
                    <td>{operationRow?.members ?? item.member_count ?? 0}</td>
                    <td><span className={`status ${item.is_active ? 'status--ok' : ''}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <strong>{operationRow?.actions.length ?? 0}</strong>
                      {operationRow?.firstAction ? (
                        <div className="small muted">{operationRow.firstAction.title}</div>
                      ) : null}
                    </td>
                    <td>{formatDate(item.created_at)}</td>
                    <td>
                      <button className="small-btn" type="button" onClick={() => onOpenClassroom(item.id)}>
                        {translate("Open")}{' '}</button>
                    </td>
                  </tr>
                );
              })}
              {classrooms.length === 0 ? (
                <tr>
                  <td colSpan={6}><div className="table-empty-state"><strong>{translate("No classrooms yet")}</strong><span>{translate("Create the first classroom to begin roster and teaching work.")}</span></div></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>{translate("Memberships")}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{translate("Contact")}</th>
                <th>{translate("Classroom")}</th>
                <th>{translate("Role")}</th>
                <th>{translate("Joined")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {classroomMemberships.map((item) => {
                const contact = contactById.get(item.contact_id);
                return (
                  <tr key={item.id}>
                    <td>{contactLabel(contact, item.contact_id)}</td>
                    <td>{classroomNameById.get(item.classroom_id) ?? item.classroom_id}</td>
                    <td>{item.role}</td>
                    <td>{formatDate(item.joined_at)}</td>
                    <td>
                      {canManageRoster ? (
                        <button
                          className="small-btn danger-btn"
                          type="button"
                          disabled={busy}
                          onClick={() => void onRemoveMembership(item.id)}
                        >
                          {translate("Remove")}{' '}</button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {classroomMemberships.length === 0 ? (
                <tr>
                  <td colSpan={5}><div className="table-empty-state"><strong>{translate("No classroom members yet")}</strong><span>{translate("Assign a contact after the classroom is ready.")}</span></div></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
