import { translate } from '../../i18n';
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
        <h3>{translate("Student progress (preview)")}</h3>
        <ul className="list">
          {entitlements.slice(0, 8).map((e) => (
            <li key={e.id}>
              <div className="row between">
                <strong>{e.grant_type}</strong>
                <span className={statusClass(e.status)}>{e.status}</span>
              </div>
              <div className="muted small">{translate("Capability:")}{' '}{e.capability_key ?? '-'} {translate("| Expires:")}{' '}{formatDate(e.expires_at)}</div>
            </li>
          ))}
          {entitlements.length === 0 ? <li>{translate("No active access items.")}</li> : null}
        </ul>
      </div>

      <div className="panel">
        <h3>{translate("Office snapshot")}</h3>
        <ul className="list">
          <li>{translate("Contacts:")}{' '}{contactsCount}</li>
          <li>{translate("Classrooms:")}{' '}{classroomsCount}</li>
          <li>{translate("Offers:")}{' '}{offersCount}</li>
          <li>{translate("Offer grants:")}{' '}{offersGrantsCount}</li>
          <li>{translate("Paid transactions:")}{' '}{paidPaymentsCount}</li>
          <li>{translate("Active sponsored students:")}{' '}{activeStudentsCount}</li>
        </ul>
      </div>
    </section>
  );
};
