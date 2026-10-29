// /w/:org/settings — company profile and default language, plan and usage, admins.
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { INDUSTRIES, SIZE_BANDS } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useSession, useWorkspace } from '../../session.tsx';
import type { SettingsData } from './types.ts';
import { Meter, useDates, useProblem } from './ui.tsx';

export function SettingsPage() {
  const t = useAppT(), problem = useProblem(), { day } = useDates();
  const workspace = useWorkspace();
  const session = useSession();
  const [data, setData] = useState<SettingsData | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [leaving, setLeaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const next = await api<SettingsData>(`orgs/${workspace.org.id}/settings`);
      setData(next);
      const org = next.org;
      setForm({
        name: org.name, industry: org.industry, size_band: org.size_band, city: org.city ?? '', contact_phone: org.contact_phone ?? '',
        billing_email: org.billing_email ?? '', tax_id: org.tax_id ?? '', locale: String((org.settings as Record<string, unknown>)?.locale ?? 'ru'),
      });
    } catch (cause) {
      setError(problem(cause));
    }
  }, [workspace.org.id]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>;
  const { org, usage, admins } = data;
  const editable = org.status !== 'suspended' && org.status !== 'closed';
  const set = (key: string) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`orgs/${org.id}/settings`, { method: 'PATCH', body: { ...form, city: form.city || null, contact_phone: form.contact_phone || null, billing_email: form.billing_email || null, tax_id: form.tax_id || null } });
      setNotice(t('common.saved'));
      await Promise.all([load(), workspace.refresh(), session.refresh()]);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true); setError('');
    try {
      await api(`orgs/${org.id}/people/me/leave`, { method: 'POST' });
      await session.refresh();
      navigate('/w');
    } catch (cause) {
      setError(problem(cause));
      setLeaving(false);
    } finally {
      setBusy(false);
    }
  }
  const orgSettings = (org.settings ?? {}) as Record<string, unknown>;
  const contactEmail = typeof orgSettings.schood_contact_email === 'string' ? orgSettings.schood_contact_email : '';
  const contactPhone = typeof orgSettings.schood_contact_phone === 'string' ? orgSettings.schood_contact_phone : '';
  const owners = admins.filter((row) => row.role === 'owner' && row.status === 'active').length;
  const me = data.member;
  const canLeave = me && !(me.role === 'owner' && owners <= 1);
  return <div className="people">
    <header className="page-heading">
      <div>
        <p className="eyebrow">{t('nav.section.people')}</p>
        <h1>{t('people.settings.title')}</h1>
      </div>
    </header>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="people-settings">
      <section aria-labelledby="profile-title">
        <h2 id="profile-title">{t('people.settings.profile')}</h2>
        <form className="people-form-grid" onSubmit={save}>
          <label className="people-span">{t('create.name')}<input required minLength={2} maxLength={120} value={form.name} onChange={set('name')} disabled={!editable}/></label>
          <label>{t('create.industry')}<select value={form.industry} onChange={set('industry')} disabled={!editable}>{INDUSTRIES.map((code) => <option key={code} value={code}>{t(`industry.${code}` as AppKey)}</option>)}</select></label>
          <label>{t('create.size')}<select value={form.size_band} onChange={set('size_band')} disabled={!editable}>{SIZE_BANDS.map((code) => <option key={code} value={code}>{t(`size.${code}` as AppKey)}</option>)}</select></label>
          <label>{t('people.field.city')}<input maxLength={80} value={form.city} onChange={set('city')} disabled={!editable}/></label>
          <label>{t('people.field.contact_phone')}<input type="tel" maxLength={40} value={form.contact_phone} onChange={set('contact_phone')} disabled={!editable}/></label>
          <label>{t('people.field.billing_email')}<input type="email" maxLength={200} value={form.billing_email} onChange={set('billing_email')} disabled={!editable}/></label>
          <label>{t('people.field.tax_id')}<input maxLength={40} inputMode="numeric" value={form.tax_id} onChange={set('tax_id')} disabled={!editable}/></label>
          <label>{t('people.field.locale')}<select value={form.locale} onChange={set('locale')} disabled={!editable}>
            <option value="ru">Русский</option><option value="uz">O‘zbekcha</option><option value="en">English</option>
          </select><span className="hint">{t('people.settings.localeHint')}</span></label>
          {editable && <div className="people-form-actions"><button disabled={busy}>{t('common.save')}</button></div>}
        </form>
      </section>

      <section aria-labelledby="plan-title">
        <h2 id="plan-title">{t('people.settings.plan')}</h2>
        <dl className="people-facts">
          <div><dt>{t('people.field.status')}</dt><dd><span className={`company-badge ${org.status === 'active' ? 'good' : org.status === 'pilot' ? '' : 'bad'}`}>{t(`status.${org.status}` as AppKey)}</span></dd></div>
          <div><dt>{t('people.settings.contract')}</dt><dd>{org.contract_ends_at ? day(org.contract_ends_at) : org.status === 'active' ? t('people.settings.noEnd') : '—'}</dd></div>
        </dl>
        <Meter label={t('people.usage.seats')} used={usage.seats_used} limit={usage.seats_limit} unlimited={t('people.usage.unlimited')}/>
        <Meter label={t('people.usage.tests')} used={usage.tests_used} limit={usage.tests_limit} unlimited={t('people.usage.unlimited')}/>
        <p className="hint">{org.status === 'pilot' ? t('people.settings.pilotNote', { tests: data.pilot_tests }) : t('people.settings.planNote')}</p>
        <div className="company-actions">
          {contactEmail && <a className="button-link quiet" href={`mailto:${contactEmail}`}>{t('people.settings.writeSchood')}</a>}
          {contactPhone && <a className="button-link quiet" href={`tel:${contactPhone.replace(/[^d+]/g, '')}`}>{t('people.settings.callSchood', { phone: contactPhone })}</a>}
          {!contactEmail && !contactPhone && <Link className="button-link quiet" to="/#demo">{t('people.settings.talk')}</Link>}
        </div>
      </section>

      <section aria-labelledby="admins-title" className="people-span-section">
        <h2 id="admins-title">{t('people.settings.admins')}</h2>
        <p className="hint">{t('people.settings.adminsLead')}</p>
        <ul className="people-admins">
          {admins.map((row) => <li key={row.id}>
            <div><strong>{row.full_name || row.email || t('people.unnamed')}</strong><span>{row.email ?? ''}</span></div>
            <span className="company-badge">{t(`role.${row.role}` as AppKey)}</span>
            {row.status === 'invited' && <span className="company-badge warn">{t('people.status.invited')}</span>}
          </li>)}
        </ul>
        <p><Link to={`/w/${org.id}/people`}>{t('people.settings.manageRoles')}</Link></p>
      </section>

      {me && <section aria-labelledby="leave-title" className="people-span-section people-leave">
        <h2 id="leave-title">{t('people.settings.leaveTitle')}</h2>
        {canLeave ? <>
          <p className="hint">{t('people.settings.leaveLead', { company: org.name })}</p>
          {leaving ? <div className="company-actions">
            <button type="button" className="people-danger-solid" disabled={busy} onClick={() => void leave()}>{t('people.settings.leaveConfirm')}</button>
            <button type="button" className="quiet" onClick={() => setLeaving(false)}>{t('common.cancel')}</button>
          </div> : <button type="button" className="quiet people-danger" onClick={() => setLeaving(true)}>{t('people.settings.leave')}</button>}
        </> : <p className="hint">{t('people.settings.lastOwner')}</p>}
      </section>}
    </div>
  </div>;
}
