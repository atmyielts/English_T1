// Team join links: one link for a whole department (WhatsApp/Telegram group,
// printed QR, intranet). Shown once; renew to get a new one, revoke to stop it.
import React, { useState, type FormEvent } from 'react';
import { JOB_ROLES } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import type { Department, TeamLink } from './types.ts';
import { LinkResult, useDates, useProblem } from './ui.tsx';

export function TeamLinkForm({ orgId, departments, onCreated, compact = false }: { orgId: string; departments: Department[]; onCreated: (link: string, invite: TeamLink) => void; compact?: boolean }) {
  const t = useAppT(), problem = useProblem();
  const [form, setForm] = useState({ department_id: '', job_role: 'general', role: 'employee', max_uses: '', expires_days: '14' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await api<{ link: string; invite: TeamLink }>(`orgs/${orgId}/invites`, { method: 'POST', body: {
        kind: 'link', department_id: form.department_id || null, job_role: form.job_role, role: form.role,
        max_uses: form.max_uses ? Number(form.max_uses) : null, expires_days: Number(form.expires_days),
      } });
      onCreated(response.link, response.invite);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <>
    <form onSubmit={submit} className={`people-form-grid ${compact ? 'people-compact' : ''}`}>
      <label>{t('people.field.department_id')}<select value={form.department_id} onChange={set('department_id')}>
        <option value="">{t('people.noDepartment')}</option>
        {departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <label>{t('people.field.job_role')}<select value={form.job_role} onChange={set('job_role')}>{JOB_ROLES.map((code) => <option key={code} value={code}>{t(`job.${code}` as AppKey)}</option>)}</select></label>
      <label>{t('people.links.joinAs')}<select value={form.role} onChange={set('role')}>
        <option value="employee">{t('role.employee')}</option>
        <option value="manager">{t('role.manager')}</option>
      </select></label>
      <label><span>{t('people.links.maxUses')} <span className="people-optional">{t('common.optional')}</span></span><input type="number" inputMode="numeric" min={1} max={5000} value={form.max_uses} onChange={set('max_uses')} placeholder={t('people.links.noLimit')}/></label>
      <label>{t('people.links.expires')}<select value={form.expires_days} onChange={set('expires_days')}>
        {['3', '7', '14', '30', '60', '90'].map((days) => <option key={days} value={days}>{t('people.links.days', { count: Number(days) })}</option>)}
      </select></label>
      <div className="people-form-actions"><button disabled={busy}>{busy ? t('app.loading') : t('people.links.create')}</button></div>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}

export function TeamLinksPanel({ orgId, orgName, links, departments, onChange, onClose }: { orgId: string; orgName: string; links: TeamLink[]; departments: Department[]; onChange: () => void; onClose: () => void }) {
  const t = useAppT(), problem = useProblem(), { day } = useDates();
  const [fresh, setFresh] = useState<{ link: string; id: string } | null>(null);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const names = new Map(departments.map((row) => [row.id, row.name]));
  async function act(id: string, action: 'revoke' | 'renew') {
    setBusy(id); setError('');
    try {
      const response = await api<{ link?: string }>(`orgs/${orgId}/invites/${id}/${action}`, { method: 'POST' });
      if (response.link) setFresh({ link: response.link, id });
      onChange();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy('');
    }
  }
  const message = t('people.share.team', { company: orgName });
  return <section className="people-panel" aria-labelledby="links-title">
    <div className="people-panel-head">
      <h2 id="links-title">{t('people.links.title')}</h2>
      <button type="button" className="quiet" onClick={onClose}>{t('common.close')}</button>
    </div>
    <p className="hint">{t('people.links.lead')}</p>
    {fresh && <LinkResult link={fresh.link} title={t('people.links.ready')} message={message}/>}
    <TeamLinkForm orgId={orgId} departments={departments} onCreated={(link, invite) => { setFresh({ link, id: invite.id }); onChange(); }}/>
    <h3 className="people-subhead">{t('people.links.existing')}</h3>
    {links.length === 0 ? <p className="hint">{t('people.links.none')}</p> : <ul className="people-links">
      {links.map((link) => <li key={link.id}>
        <div>
          <strong>{link.department_id ? names.get(link.department_id) ?? t('people.noDepartment') : t('people.links.anyDepartment')}</strong>
          <span>{t(`job.${link.job_role}` as AppKey)} · {t(`role.${link.role}` as AppKey)}</span>
          <span>{link.max_uses ? t('people.links.usesOf', { uses: link.uses, max: link.max_uses }) : t('people.links.uses', { uses: link.uses })} · {t('people.links.until', { date: day(link.expires_at) })}</span>
        </div>
        <span className={`company-badge ${link.state === 'open' ? 'good' : 'warn'}`}>{t(`people.inviteState.${link.state}` as AppKey)}</span>
        <div className="company-actions">
          <button type="button" className="quiet" disabled={busy === link.id} onClick={() => void act(link.id, 'renew')}>{t('people.action.newLink')}</button>
          <button type="button" className="quiet people-danger" disabled={busy === link.id} onClick={() => void act(link.id, 'revoke')}>{t('people.links.revoke')}</button>
        </div>
      </li>)}
    </ul>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
