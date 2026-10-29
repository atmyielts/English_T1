// Staff console frame and shared types.
import React, { type ReactNode } from 'react';
import type { Member, Org, Usage } from '../../api.ts';
import { useAppT } from '../../i18n/index.ts';
import { Link, useLocation } from '../../router.tsx';
import { useDates } from '../people/ui.tsx';

export interface StaffOrg extends Org { people: number; invited: number; seats_used: number }
export interface AuditRow { id: string | number; org_id?: string | null; org_name?: string | null; actor: string | null; actor_name: string | null; action: string; target?: string | null; details: Record<string, unknown>; created_at: string }
export interface Lead {
  id: string; name: string; company: string; job_title: string | null; phone: string | null; email: string | null; size_band: string | null; industry: string | null;
  interests: string[] | null; need: string | null; locale: string | null; status: LeadStatus; notes: string | null; follow_up_at: string | null;
  org_id: string | null; source: string | null; created_at: string; updated_at: string; org?: { id: string; name: string; status: string } | null;
}
export const LEAD_STATUSES = ['new', 'contacted', 'pilot', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export interface StaffOrgDetail {
  org: Org; usage: Usage; counts: { people: number; invited: number; departments: number }; admins: Member[]; audit: AuditRow[]; leads: Lead[]; ai_default: number;
}

export function StaffFrame({ title, lead, actions, children }: { title: string; lead?: string; actions?: ReactNode; children: ReactNode }) {
  const t = useAppT();
  const { path, query } = useLocation();
  const tab = path.startsWith('/staff/leads') ? 'leads' : query.get('tab') === 'audit' ? 'audit' : 'orgs';
  return <div className="staff">
    <nav className="staff-tabs" aria-label={t('staff.nav.label')}>
      <Link to="/staff" aria-current={tab === 'orgs' ? 'page' : undefined}>{t('staff.nav.orgs')}</Link>
      <Link to="/staff/leads" aria-current={tab === 'leads' ? 'page' : undefined}>{t('staff.nav.leads')}</Link>
      <Link to="/staff?tab=audit" aria-current={tab === 'audit' ? 'page' : undefined}>{t('staff.nav.audit')}</Link>
    </nav>
    <header className="page-heading staff-heading">
      <div>
        <p className="eyebrow">{t('nav.section.staff')}</p>
        <h1>{title}</h1>
        {lead && <p className="people-sub">{lead}</p>}
      </div>
      {actions && <div className="company-actions">{actions}</div>}
    </header>
    {children}
  </div>;
}

/** One audit line in plain words: what happened, by whom, on what. */
export function AuditTable({ rows, showOrg = false }: { rows: AuditRow[]; showOrg?: boolean }) {
  const t = useAppT(), { when } = useDates();
  if (!rows.length) return <p className="hint">{t('staff.audit.empty')}</p>;
  return <div className="company-table-wrap">
    <table className="company-table staff-audit">
      <thead><tr>
        <th scope="col">{t('staff.audit.when')}</th>
        {showOrg && <th scope="col">{t('staff.audit.org')}</th>}
        <th scope="col">{t('staff.audit.action')}</th>
        <th scope="col">{t('staff.audit.who')}</th>
        <th scope="col">{t('staff.audit.details')}</th>
      </tr></thead>
      <tbody>{rows.map((row) => <tr key={String(row.id)}>
        <td><time dateTime={row.created_at}>{when(row.created_at)}</time></td>
        {showOrg && <td>{row.org_id ? <Link to={`/staff/orgs/${row.org_id}`}>{row.org_name ?? row.org_id.slice(0, 8)}</Link> : '—'}</td>}
        <td><code>{row.action}</code></td>
        <td>{row.actor_name ?? (row.actor ? row.actor.slice(0, 8) : t('staff.audit.public'))}</td>
        <td className="staff-audit-details">{describe(row.details)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function describe(details: Record<string, unknown>): string {
  return Object.entries(details ?? {}).map(([key, value]) => {
    if (value && typeof value === 'object' && 'from' in (value as Record<string, unknown>)) {
      const change = value as { from: unknown; to: unknown };
      return `${key}: ${String(change.from ?? '—')} → ${String(change.to ?? '—')}`;
    }
    return `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`;
  }).join(' · ').slice(0, 400);
}
