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
          <h3>Operational health</h3>
          <div className="metric-list">
            <div className="metric-row"><span>Paid transactions</span><strong>{metrics.paidCount}</strong></div>
            <div className="metric-row"><span>Pending transactions</span><strong>{metrics.pendingCount}</strong></div>
            <div className="metric-row"><span>Failed transactions</span><strong>{metrics.failedCount}</strong></div>
            <div className="metric-row"><span>Collected amount</span><strong>{metrics.paidAmount.toLocaleString()} UZS</strong></div>
            <div className="metric-row"><span>Pending amount</span><strong>{metrics.pendingAmount.toLocaleString()} UZS</strong></div>
            <div className="metric-row"><span>Active sponsored students</span><strong>{metrics.activeStudents}</strong></div>
          </div>
        </div>

        <div className="panel">
          <h3>Payment mix</h3>
          <div className="progress-item">
            <div className="row between"><span>Paid</span><strong>{metrics.paidShare}%</strong></div>
            <div className="progress-track"><div className="progress-bar progress-bar--paid" style={{ width: `${metrics.paidShare}%` }} /></div>
          </div>
          <div className="progress-item">
            <div className="row between"><span>Pending</span><strong>{metrics.pendingShare}%</strong></div>
            <div className="progress-track"><div className="progress-bar progress-bar--pending" style={{ width: `${metrics.pendingShare}%` }} /></div>
          </div>
          <div className="progress-item">
            <div className="row between"><span>Failed</span><strong>{metrics.failedShare}%</strong></div>
            <div className="progress-track"><div className="progress-bar progress-bar--failed" style={{ width: `${metrics.failedShare}%` }} /></div>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <h3>Recent contacts</h3>
          <ul className="list">
            {recentContacts.map((c) => (
              <li key={c.id}>
                <div className="row between">
                  <strong>{`${c.first_name} ${c.last_name}`.trim() || c.id}</strong>
                  <span className={statusClass(c.status)}>{c.status}</span>
                </div>
                <div className="muted small">{c.email ?? 'No email'} {c.phone ? ` | ${c.phone}` : ''}</div>
                <div className="muted small">Updated: {formatDate(c.updated_at)}</div>
              </li>
            ))}
            {recentContacts.length === 0 ? <li>No contacts yet.</li> : null}
          </ul>
        </div>

        <div className="panel">
          <h3>Expiring soon</h3>
          <ul className="list">
            {expiringEntitlements.map((e) => (
              <li key={e.id}>
                <div className="row between">
                  <strong>{e.grant_type}</strong>
                  <span className={statusClass(e.status)}>{e.status}</span>
                </div>
                <div className="muted small">Capability: {e.capability_key ?? '-'}</div>
                <div className="muted small">Expires: {formatDate(e.expires_at)}</div>
              </li>
            ))}
            {expiringEntitlements.length === 0 ? <li>No dated entitlements yet.</li> : null}
          </ul>
        </div>
      </section>
    </>
  );
};

