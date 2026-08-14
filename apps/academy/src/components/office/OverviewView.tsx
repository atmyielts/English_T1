import { getLocaleTag, translate } from '../../i18n';
import type { TeacherStudioContact, TeacherStudioEntitlement } from '../../lib/client';
import type { StatusMetrics } from './types';

type OverviewViewProps = {
  metrics: StatusMetrics;
  contacts: TeacherStudioContact[];
  entitlements: TeacherStudioEntitlement[];
  formatDate: (iso: string | null | undefined) => string;
  statusClass: (status: string) => string;
};

export const OverviewView = ({
  metrics,
  contacts,
  entitlements,
  formatDate,
  statusClass,
}: OverviewViewProps) => {
  const recentContacts = contacts.slice(0, 6);
  const expiringEntitlements = entitlements
    .filter((e) => e.expires_at)
    .sort((a, b) => Date.parse(a.expires_at ?? '') - Date.parse(b.expires_at ?? ''))
    .slice(0, 6);

  return (
    <>
      <section className="grid two">
        <div className="panel">
          <h3>{translate("Operational health")}</h3>
          <div className="metric-list">
            <div className="metric-row"><span>{translate("Paid transactions")}</span><strong>{metrics.paidCount}</strong></div>
            <div className="metric-row"><span>{translate("Pending transactions")}</span><strong>{metrics.pendingCount}</strong></div>
            <div className="metric-row"><span>{translate("Failed transactions")}</span><strong>{metrics.failedCount}</strong></div>
            <div className="metric-row"><span>{translate("Collected amount")}</span><strong>{metrics.paidAmount.toLocaleString(getLocaleTag())} {translate("UZS")}</strong></div>
            <div className="metric-row"><span>{translate("Pending amount")}</span><strong>{metrics.pendingAmount.toLocaleString(getLocaleTag())} {translate("UZS")}</strong></div>
            <div className="metric-row"><span>{translate("Active sponsored students")}</span><strong>{metrics.activeStudents}</strong></div>
          </div>
        </div>

        <div className="panel">
          <h3>{translate("Payment mix")}</h3>
          <div className="progress-item">
            <div className="row between"><span>{translate("Paid")}</span><strong>{metrics.paidShare}%</strong></div>
            <div className="progress-track"><div className="progress-bar progress-bar--paid" style={{ width: `${metrics.paidShare}%` }} /></div>
          </div>
          <div className="progress-item">
            <div className="row between"><span>{translate("Pending")}</span><strong>{metrics.pendingShare}%</strong></div>
            <div className="progress-track"><div className="progress-bar progress-bar--pending" style={{ width: `${metrics.pendingShare}%` }} /></div>
          </div>
          <div className="progress-item">
            <div className="row between"><span>{translate("Failed")}</span><strong>{metrics.failedShare}%</strong></div>
            <div className="progress-track"><div className="progress-bar progress-bar--failed" style={{ width: `${metrics.failedShare}%` }} /></div>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <h3>{translate("Recent contacts")}</h3>
          <ul className="list">
            {recentContacts.map((c) => (
              <li key={c.id}>
                <div className="row between">
                  <strong>{`${c.first_name} ${c.last_name}`.trim() || c.id}</strong>
                  <span className={statusClass(c.status)}>{c.status}</span>
                </div>
                <div className="muted small">{c.email ?? 'No email'} {c.phone ? ` | ${c.phone}` : ''}</div>
                <div className="muted small">{translate("Updated:")}{' '}{formatDate(c.updated_at)}</div>
              </li>
            ))}
            {recentContacts.length === 0 ? <li>{translate("No contacts yet.")}</li> : null}
          </ul>
        </div>

        <div className="panel">
          <h3>{translate("Expiring soon")}</h3>
          <ul className="list">
            {expiringEntitlements.map((e) => (
              <li key={e.id}>
                <div className="row between">
                  <strong>{e.grant_type}</strong>
                  <span className={statusClass(e.status)}>{e.status}</span>
                </div>
                <div className="muted small">{translate("Capability:")}{' '}{e.capability_key ?? '-'}</div>
                <div className="muted small">{translate("Expires:")}{' '}{formatDate(e.expires_at)}</div>
              </li>
            ))}
            {expiringEntitlements.length === 0 ? <li>{translate("No dated entitlements yet.")}</li> : null}
          </ul>
        </div>
      </section>
    </>
  );
};

