import type { TeacherStudioEntitlement } from '../../lib/client';

type StudentsPreviewViewProps = {
  entitlements: TeacherStudioEntitlement[];
  statusClass: (status: string) => string;
  formatDate: (iso: string | null | undefined) => string;
  contactsCount: number;
  classroomsCount: number;
  offersCount: number;
  offersGrantsCount: number;
  paidPaymentsCount: number;
  activeStudentsCount: number;
};

export const StudentsPreviewView = ({
  entitlements,
  statusClass,
  formatDate,
  contactsCount,
  classroomsCount,
  offersCount,
  offersGrantsCount,
  paidPaymentsCount,
  activeStudentsCount,
}: StudentsPreviewViewProps) => {
  return (
    <section className="grid two">
      <div className="panel">
        <h3>Student progress (preview)</h3>
        <ul className="list">
          {entitlements.slice(0, 8).map((e) => (
            <li key={e.id}>
              <div className="row between">
                <strong>{e.grant_type}</strong>
                <span className={statusClass(e.status)}>{e.status}</span>
              </div>
              <div className="muted small">Capability: {e.capability_key ?? '-'} | Expires: {formatDate(e.expires_at)}</div>
            </li>
          ))}
          {entitlements.length === 0 ? <li>No active access items.</li> : null}
        </ul>
      </div>

      <div className="panel">
        <h3>Office snapshot</h3>
        <ul className="list">
          <li>Contacts: {contactsCount}</li>
          <li>Classrooms: {classroomsCount}</li>
          <li>Offers: {offersCount}</li>
          <li>Offer grants: {offersGrantsCount}</li>
          <li>Paid transactions: {paidPaymentsCount}</li>
          <li>Active sponsored students: {activeStudentsCount}</li>
        </ul>
      </div>
    </section>
  );
};
