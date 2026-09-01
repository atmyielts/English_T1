import { translate } from '../../i18n';
import { useMemo, useState } from 'react';
import type { TeacherStudioContact, TeacherStudioEntitlement } from '../../lib/client';

type EntitlementsViewProps = {
  entitlements: TeacherStudioEntitlement[];
  contacts: TeacherStudioContact[];
  statusClass: (status: string) => string;
  formatDate: (iso: string | null | undefined) => string;
};

const readableAccessName = (value: string | null | undefined) => value
  ? value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  : 'General learning access';

export const EntitlementsView = ({
  entitlements,
  contacts,
  statusClass,
  formatDate,
}: EntitlementsViewProps) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'revoked'>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entitlements.filter((e) => {
      if (statusFilter !== 'all' && e.status.toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      const contact = contacts.find((c) => c.id === e.contact_id);
      const contactText = `${contact?.first_name ?? ''} ${contact?.last_name ?? ''} ${contact?.email ?? ''}`.toLowerCase();
      return (
        e.grant_type.toLowerCase().includes(q) ||
        (e.capability_key ?? '').toLowerCase().includes(q) ||
        contactText.includes(q)
      );
    });
  }, [contacts, entitlements, query, statusFilter]);

  const capabilityDist = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filtered) {
      const key = e.capability_key ?? e.grant_type;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [filtered]);

  return (
    <>
      <section className="grid two">
        <div className="panel">
          <h3>{translate("Filters")}</h3>
          <div className="filters-grid">
            <input className="input" placeholder={translate("Search student, course, or test...")} value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'expired' | 'revoked')}>
              <option value="all">{translate("All statuses")}</option>
              <option value="active">{translate("Active")}</option>
              <option value="expired">{translate("Expired")}</option>
              <option value="revoked">{translate("Revoked")}</option>
            </select>
          </div>
        </div>

        <div className="panel">
          <h3>{translate("Access by product")}</h3>
          <div className="metric-list">
            {capabilityDist.map(([key, value]) => (
              <div key={key} className="metric-row">
                <span>{translate(readableAccessName(key))}</span>
                <strong>{value}</strong>
              </div>
            ))}
            {capabilityDist.length === 0 ? <div className="muted">{translate("No student access data yet.")}</div> : null}
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>{translate("Student access")}</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{translate("Student")}</th><th>{translate("Access method")}</th><th>{translate("Course or test")}</th><th>{translate("Uses left")}</th><th>{translate("Status")}</th><th>{translate("Expires")}</th></tr></thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>{contacts.find((c) => c.id === e.contact_id)?.email ?? e.contact_id}</td>
                  <td>{translate(readableAccessName(e.grant_type))}</td>
                  <td>{translate(readableAccessName(e.capability_key))}</td>
                  <td>{e.remaining ?? '-'}</td>
                  <td><span className={statusClass(e.status)}>{e.status}</span></td>
                  <td>{formatDate(e.expires_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td colSpan={6}>{translate("No student access matches these filters.")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
