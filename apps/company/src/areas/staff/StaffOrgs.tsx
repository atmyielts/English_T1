// /staff — every workspace (search, status), opening a new one, and the audit log tab.
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { INDUSTRIES, ORG_STATUSES, SIZE_BANDS } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, useLocation } from '../../router.tsx';
import { LinkResult, useDates, useProblem } from '../people/ui.tsx';
import { AuditTable, StaffFrame, type AuditRow, type Lead, type StaffOrg } from './common.tsx';

export function StaffHome() {
  const { query } = useLocation();
  return query.get('tab') === 'audit' ? <StaffAudit/> : <StaffOrgs/>;
}

function StaffOrgs() {
  const t = useAppT(), problem = useProblem(), { day } = useDates();
  const [data, setData] = useState<{ orgs: StaffOrg[]; counts: Record<string, number> } | null>(null);
  const [q, setQ] = useState(''), [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (status) params.set('status', status);
      const search = params.toString();
      setData(await api(`staff/orgs${search ? `?${search}` : ''}`));
      setError('');
    } catch (cause) {
      setError(problem(cause));
    }
  }, [q, status]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  return <StaffFrame title={t('staff.orgs.title')} lead={t('staff.orgs.lead')}
    actions={<button type="button" aria-expanded={creating} onClick={() => setCreating(!creating)}>{t('staff.orgs.new')}</button>}>
    {creating && <NewWorkspace onClose={() => setCreating(false)} onCreated={() => void load()}/>}
    <div className="company-toolbar" role="search">
      <label>{t('common.search')}<input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('staff.orgs.searchHint')}/></label>
    </div>
    <div className="staff-chips" role="group" aria-label={t('staff.orgs.statusFilter')}>
      <button type="button" className={status ? 'quiet' : ''} aria-pressed={!status} onClick={() => setStatus('')}>{t('common.all')}</button>
      {ORG_STATUSES.map((value) => <button key={value} type="button" className={status === value ? '' : 'quiet'} aria-pressed={status === value} onClick={() => setStatus(value)}>
        {t(`status.${value}` as AppKey)} <span className="staff-count">{data?.counts[value] ?? 0}</span>
      </button>)}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {!data ? <p role="status">{t('app.loading')}</p> : data.orgs.length === 0 ? <p className="people-empty">{t('staff.orgs.empty')}</p> : <div className="company-table-wrap">
      <table className="company-table staff-orgs">
        <thead><tr>
          <th scope="col">{t('staff.orgs.col.name')}</th><th scope="col">{t('people.field.status')}</th><th scope="col">{t('staff.orgs.col.people')}</th>
          <th scope="col">{t('people.usage.seats')}</th><th scope="col">{t('people.usage.tests')}</th><th scope="col">{t('staff.orgs.col.contract')}</th><th scope="col">{t('staff.orgs.col.created')}</th>
        </tr></thead>
        <tbody>{data.orgs.map((org) => <tr key={org.id}>
          <td><Link to={`/staff/orgs/${org.id}`}><strong>{org.name}</strong></Link><span className="people-email">{t(`industry.${org.industry}` as AppKey)}{org.city ? ` · ${org.city}` : ''}</span></td>
          <td><span className={`company-badge ${org.status === 'active' ? 'good' : org.status === 'pilot' ? '' : 'bad'}`}>{t(`status.${org.status}` as AppKey)}</span></td>
          <td>{org.people}{org.invited ? <span className="people-muted"> +{org.invited}</span> : ''}</td>
          <td>{org.seats_used} / {org.seats_limit}</td>
          <td>{org.tests_used ?? 0} / {org.tests_limit ?? '∞'}</td>
          <td>{org.contract_ends_at ? day(org.contract_ends_at) : '—'}</td>
          <td>{day(org.created_at)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </StaffFrame>;
}

function StaffAudit() {
  const t = useAppT(), problem = useProblem();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      api<{ audit: AuditRow[] }>(`staff/audit${/^[a-z_.]{2,60}$/.test(action) ? `?action=${action}` : ''}`).then((data) => { setRows(data.audit); setError(''); }).catch((cause) => setError(problem(cause)));
    }, 250);
    return () => clearTimeout(timer);
  }, [action]);
  return <StaffFrame title={t('staff.audit.title')} lead={t('staff.audit.lead')}>
    <div className="company-toolbar">
      <label>{t('staff.audit.filter')}<select value={action} onChange={(event) => setAction(event.target.value)}>
        <option value="">{t('common.all')}</option>
        {['member.', 'invite.', 'department.', 'settings.', 'staff.', 'lead.', 'org.'].map((prefix) => <option key={prefix} value={prefix}>{prefix.replace('.', '')}</option>)}
      </select></label>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {rows ? <AuditTable rows={rows} showOrg/> : <p role="status">{t('app.loading')}</p>}
  </StaffFrame>;
}

/** Opens a workspace with an owner invitation link; prefilled from a demo request. */
export function NewWorkspace({ lead, onClose, onCreated }: { lead?: Lead; onClose: () => void; onCreated: (orgId: string) => void }) {
  const t = useAppT(), problem = useProblem();
  const [form, setForm] = useState({
    name: lead?.company ?? '', industry: lead?.industry ?? 'other', size_band: lead?.size_band ?? '1-50', city: '', contact_phone: lead?.phone ?? '',
    owner_name: lead?.name ?? '', owner_email: lead?.email ?? '', status: 'pilot', seats_limit: '0', tests_limit: '', contract_ends_at: '', locale: lead?.locale ?? 'ru',
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<{ link: string; org: { id: string; name: string } } | null>(null);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const body: Record<string, unknown> = {
        ...form, lead_id: lead?.id, city: form.city || null, contact_phone: form.contact_phone || null, owner_email: form.owner_email || null, owner_name: form.owner_name || null,
        seats_limit: Number(form.seats_limit || 0), contract_ends_at: form.contract_ends_at || null,
      };
      if (form.tests_limit === '') delete body.tests_limit; else body.tests_limit = Number(form.tests_limit);
      const created = await api<{ link: string; org: { id: string; name: string } }>('staff/orgs', { method: 'POST', body });
      setResult(created);
      onCreated(created.org.id);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <section className="people-panel" aria-labelledby="new-org-title">
    <div className="people-panel-head">
      <h2 id="new-org-title">{lead ? t('staff.orgs.newFor', { company: lead.company }) : t('staff.orgs.new')}</h2>
      <button type="button" className="quiet" onClick={onClose}>{t('common.close')}</button>
    </div>
    {result ? <>
      <LinkResult link={result.link} title={t('staff.orgs.ownerLink', { company: result.org.name })} message={t('staff.orgs.ownerShare', { company: result.org.name })} note={t('staff.orgs.ownerNote')}/>
      <p><Link className="button-link quiet" to={`/staff/orgs/${result.org.id}`}>{t('staff.orgs.openDetail')}</Link></p>
    </> : <form className="people-form-grid" onSubmit={submit}>
      <label className="people-span">{t('create.name')}<input required minLength={2} maxLength={120} value={form.name} onChange={set('name')}/></label>
      <label>{t('create.industry')}<select value={form.industry} onChange={set('industry')}>{INDUSTRIES.map((code) => <option key={code} value={code}>{t(`industry.${code}` as AppKey)}</option>)}</select></label>
      <label>{t('create.size')}<select value={form.size_band} onChange={set('size_band')}>{SIZE_BANDS.map((code) => <option key={code} value={code}>{t(`size.${code}` as AppKey)}</option>)}</select></label>
      <label>{t('people.field.city')}<input maxLength={80} value={form.city} onChange={set('city')}/></label>
      <label>{t('people.field.contact_phone')}<input maxLength={40} value={form.contact_phone} onChange={set('contact_phone')}/></label>
      <label>{t('staff.orgs.ownerName')}<input maxLength={120} value={form.owner_name} onChange={set('owner_name')}/></label>
      <label>{t('staff.orgs.ownerEmail')}<input type="email" maxLength={200} value={form.owner_email} onChange={set('owner_email')}/></label>
      <label>{t('people.field.status')}<select value={form.status} onChange={set('status')}><option value="pilot">{t('status.pilot')}</option><option value="active">{t('status.active')}</option></select></label>
      <label>{t('staff.plan.seats')}<input type="number" min={0} max={100000} value={form.seats_limit} onChange={set('seats_limit')}/></label>
      <label>{t('staff.plan.tests')}<input type="number" min={0} max={1000000} value={form.tests_limit} onChange={set('tests_limit')} placeholder={t('staff.plan.testsDefault')}/></label>
      <label>{t('staff.plan.contract')}<input type="date" value={form.contract_ends_at} onChange={set('contract_ends_at')}/></label>
      <label>{t('people.field.locale')}<select value={form.locale} onChange={set('locale')}><option value="ru">Русский</option><option value="uz">O‘zbekcha</option><option value="en">English</option></select></label>
      <div className="people-form-actions"><button disabled={busy}>{busy ? t('app.loading') : t('staff.orgs.create')}</button></div>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
