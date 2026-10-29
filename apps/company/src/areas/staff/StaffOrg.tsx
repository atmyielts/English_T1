// /staff/orgs/:org — one workspace: plan (status, seats, tests, contract end, AI cap),
// owners and HR admins, a new owner link, linked demo requests and the audit log.
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ORG_STATUSES } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { LinkResult, Meter, useDates, useProblem } from '../people/ui.tsx';
import { AuditTable, StaffFrame, type StaffOrgDetail } from './common.tsx';

/** A stored contract end (end of a Tashkent day) as the date input shows it. */
const tashkentDate = (iso: string | null | undefined) => iso ? new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(0, 10) : '';

export function StaffOrgPage({ orgId }: { orgId: string }) {
  const t = useAppT(), problem = useProblem(), { day } = useDates();
  const [data, setData] = useState<StaffOrgDetail | null>(null);
  const [plan, setPlan] = useState({ status: 'pilot', seats_limit: '0', tests_limit: '', unlimited: false, contract_ends_at: '', ai_daily_limit: '', contact_email: '', contact_phone: '' });
  const [owner, setOwner] = useState({ email: '', full_name: '' });
  const [ownerLink, setOwnerLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const next = await api<StaffOrgDetail>(`staff/orgs/${orgId}`);
      setData(next);
      const { org } = next;
      const settings = (org.settings ?? {}) as Record<string, unknown>, ai = settings.ai_daily_limit;
      setPlan({
        status: org.status, seats_limit: String(org.seats_limit ?? 0), tests_limit: org.tests_limit === null || org.tests_limit === undefined ? '' : String(org.tests_limit),
        unlimited: org.tests_limit === null, contract_ends_at: tashkentDate(org.contract_ends_at), ai_daily_limit: typeof ai === 'number' ? String(ai) : '',
        contact_email: String(settings.schood_contact_email ?? ''), contact_phone: String(settings.schood_contact_phone ?? ''),
      });
      setError('');
    } catch (cause) {
      setError(problem(cause));
    }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <StaffFrame title={t('staff.org.title')}>{error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>}</StaffFrame>;
  const { org, usage, counts } = data;
  const set = (key: keyof typeof plan) => (event: { target: { value: string } }) => setPlan({ ...plan, [key]: event.target.value });

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api<{ synced: number | null }>(`staff/orgs/${orgId}`, { method: 'PATCH', body: {
        status: plan.status, seats_limit: Number(plan.seats_limit || 0), tests_limit: plan.unlimited ? null : Number(plan.tests_limit || 0),
        contract_ends_at: plan.contract_ends_at || null, ai_daily_limit: plan.ai_daily_limit === '' ? null : Number(plan.ai_daily_limit),
        schood_contact_email: plan.contact_email.trim() || null, schood_contact_phone: plan.contact_phone.trim() || null,
      } });
      setNotice(response.synced === null ? t('staff.plan.savedNoSync') : t('staff.plan.saved', { count: response.synced }));
      await load();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function inviteOwner(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await api<{ link: string }>(`staff/orgs/${orgId}/owner-invite`, { method: 'POST', body: { email: owner.email || null, full_name: owner.full_name || null } });
      setOwnerLink(response.link);
      setOwner({ email: '', full_name: '' });
      await load();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  return <StaffFrame title={org.name} lead={`${t(`industry.${org.industry}` as AppKey)} · ${t(`size.${org.size_band}` as AppKey)}${org.city ? ` · ${org.city}` : ''}`}
    actions={<Link className="button-link" to={`/w/${org.id}`}>{t('staff.org.open')}</Link>}>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="company-grid staff-stats">
      <div className="company-stat"><strong>{counts.people}</strong><span>{t('staff.org.people')}</span></div>
      <div className="company-stat"><strong>{counts.invited}</strong><span>{t('staff.org.invited')}</span></div>
      <div className="company-stat"><strong>{counts.departments}</strong><span>{t('people.departments.title')}</span></div>
      <div className="company-stat"><strong>{day(org.created_at)}</strong><span>{t('staff.orgs.col.created')}</span></div>
    </div>
    <div className="people-settings">
      <section aria-labelledby="plan-title">
        <h2 id="plan-title">{t('staff.plan.title')}</h2>
        <Meter label={t('people.usage.seats')} used={usage.seats_used} limit={usage.seats_limit} unlimited={t('people.usage.unlimited')}/>
        <Meter label={t('people.usage.tests')} used={usage.tests_used} limit={usage.tests_limit} unlimited={t('people.usage.unlimited')}/>
        <form className="people-form-grid" onSubmit={savePlan}>
          <label>{t('people.field.status')}<select value={plan.status} onChange={set('status')}>{ORG_STATUSES.map((value) => <option key={value} value={value}>{t(`status.${value}` as AppKey)}</option>)}</select></label>
          <label>{t('staff.plan.seats')}<input type="number" min={0} max={100000} required value={plan.seats_limit} onChange={set('seats_limit')}/></label>
          <label>{t('staff.plan.tests')}<input type="number" min={0} max={1000000} value={plan.tests_limit} onChange={set('tests_limit')} disabled={plan.unlimited} required={!plan.unlimited}/></label>
          <label className="check"><input type="checkbox" checked={plan.unlimited} onChange={(event) => setPlan({ ...plan, unlimited: event.target.checked })}/>{t('staff.plan.unlimited')}</label>
          <label>{t('staff.plan.contract')}<input type="date" value={plan.contract_ends_at} onChange={set('contract_ends_at')}/></label>
          <label>{t('staff.plan.ai')}<input type="number" min={0} max={100000} value={plan.ai_daily_limit} onChange={set('ai_daily_limit')} placeholder={t('staff.plan.aiDefault', { count: data.ai_default })}/></label>
          <label>{t('staff.plan.contactEmail')}<input type="email" maxLength={200} value={plan.contact_email} onChange={set('contact_email')}/></label>
          <label>{t('staff.plan.contactPhone')}<input type="tel" maxLength={40} value={plan.contact_phone} onChange={set('contact_phone')}/></label>
          <p className="hint people-span">{t('staff.plan.contactNote')}</p>
          <p className="hint people-span">{t('staff.plan.note')}</p>
          <div className="people-form-actions"><button disabled={busy}>{t('staff.plan.save')}</button></div>
        </form>
      </section>
      <section aria-labelledby="owners-title">
        <h2 id="owners-title">{t('staff.org.admins')}</h2>
        {data.admins.length === 0 ? <p className="hint">{t('staff.org.noAdmins')}</p> : <ul className="people-admins">
          {data.admins.map((row) => <li key={row.id}>
            <div><strong>{row.full_name || row.email || '—'}</strong><span>{row.email ?? ''}</span></div>
            <span className="company-badge">{t(`role.${row.role}` as AppKey)}</span>
            {row.status === 'invited' && <span className="company-badge warn">{t('people.status.invited')}</span>}
          </li>)}
        </ul>}
        <h3 className="people-subhead">{t('staff.org.ownerInvite')}</h3>
        {ownerLink && <LinkResult link={ownerLink} title={t('staff.orgs.ownerLink', { company: org.name })} message={t('staff.orgs.ownerShare', { company: org.name })} note={t('staff.orgs.ownerNote')}/>}
        <form className="people-form-grid" onSubmit={inviteOwner}>
          <label>{t('staff.orgs.ownerName')}<input maxLength={120} value={owner.full_name} onChange={(event) => setOwner({ ...owner, full_name: event.target.value })}/></label>
          <label>{t('staff.orgs.ownerEmail')}<input type="email" maxLength={200} value={owner.email} onChange={(event) => setOwner({ ...owner, email: event.target.value })}/></label>
          <div className="people-form-actions"><button className="quiet" disabled={busy || (!owner.email && !owner.full_name)}>{t('staff.org.makeOwnerLink')}</button></div>
        </form>
        {data.leads.length > 0 && <>
          <h3 className="people-subhead">{t('staff.org.leads')}</h3>
          <ul className="people-admins">{data.leads.map((lead) => <li key={lead.id}>
            <div><strong>{lead.name}</strong><span>{[lead.phone, lead.email].filter(Boolean).join(' · ')}</span></div>
            <span className="company-badge">{t(`staff.lead.status.${lead.status}` as AppKey)}</span>
            <Link to={`/staff/leads?lead=${lead.id}`}>{t('staff.org.openLead')}</Link>
          </li>)}</ul>
        </>}
      </section>
    </div>
    <section className="staff-section" aria-labelledby="audit-title">
      <h2 id="audit-title">{t('staff.audit.title')}</h2>
      <AuditTable rows={data.audit}/>
    </section>
  </StaffFrame>;
}
