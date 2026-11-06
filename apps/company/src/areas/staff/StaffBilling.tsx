// /staff/billing — Schood's own company details for invoices and acts. Nothing is prefilled:
// a document cannot be issued until staff have typed these in.
import React, { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT } from '../../i18n/index.ts';
import type { PartyDetails } from '../people/types.ts';
import { useDates, useProblem } from '../people/ui.tsx';
import { StaffFrame } from './common.tsx';

const FIELDS = ['legal_name', 'tax_id', 'vat_code', 'bank_name', 'mfo', 'account', 'address', 'phone', 'email', 'director'] as const;
type Field = (typeof FIELDS)[number];

export function StaffBilling() {
  const t = useAppT(), problem = useProblem(), { when } = useDates();
  const [form, setForm] = useState<Record<Field, string> | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const fill = (settings: (PartyDetails & { updated_at?: string }) | null) => {
    setForm(Object.fromEntries(FIELDS.map((field) => [field, settings?.[field] ?? ''])) as Record<Field, string>);
    setUpdated(settings?.updated_at ?? null);
  };
  useEffect(() => {
    api<{ settings: (PartyDetails & { updated_at?: string }) | null }>('staff/billing-settings').then((data) => fill(data.settings)).catch((cause) => setError(problem(cause)));
  }, []);
  if (!form) return <StaffFrame title={t('staff.billing.title')}>{error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>}</StaffFrame>;
  const set = (key: Field) => (event: { target: { value: string } }) => { setForm({ ...form, [key]: event.target.value }); setSaved(false); };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setSaved(false);
    try {
      const data = await api<{ settings: PartyDetails & { updated_at?: string } }>('staff/billing-settings', { method: 'PUT', body: Object.fromEntries(FIELDS.map((field) => [field, form![field].trim() || null])) });
      fill(data.settings);
      setSaved(true);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const missing = !form.legal_name || !form.tax_id || !form.bank_name || !form.mfo || !form.account;
  return <StaffFrame title={t('staff.billing.title')} lead={t('staff.billing.lead')}>
    {missing && <p className="notice" role="status">{t('staff.billing.missing')}</p>}
    <section className="people-panel">
      <form className="people-form-grid" onSubmit={submit}>
        <label className="people-span">{t('people.doc.legalName')}<input maxLength={200} value={form.legal_name} onChange={set('legal_name')}/></label>
        <label>{t('people.doc.stir')}<input inputMode="numeric" maxLength={20} value={form.tax_id} onChange={set('tax_id')}/></label>
        <label>{t('people.doc.vatCode')}<input maxLength={40} value={form.vat_code} onChange={set('vat_code')}/></label>
        <label className="people-span">{t('people.doc.bank')}<input maxLength={200} value={form.bank_name} onChange={set('bank_name')}/></label>
        <label>{t('people.doc.mfo')}<input inputMode="numeric" maxLength={10} value={form.mfo} onChange={set('mfo')}/></label>
        <label>{t('people.doc.account')}<input inputMode="numeric" maxLength={30} value={form.account} onChange={set('account')}/></label>
        <label className="people-span">{t('people.doc.address')}<input maxLength={300} value={form.address} onChange={set('address')}/></label>
        <label>{t('people.doc.phone')}<input type="tel" maxLength={40} value={form.phone} onChange={set('phone')}/></label>
        <label>{t('people.doc.email')}<input type="email" maxLength={200} value={form.email} onChange={set('email')}/></label>
        <label className="people-span">{t('people.doc.director')}<input maxLength={160} value={form.director} onChange={set('director')}/></label>
        <div className="people-form-actions">
          <button disabled={busy}>{busy ? t('app.loading') : t('common.save')}</button>
          {saved && <span role="status" className="hint">{t('common.saved')}</span>}
          {updated && <span className="hint">{t('staff.billing.updated', { date: when(updated) })}</span>}
        </div>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  </StaffFrame>;
}
