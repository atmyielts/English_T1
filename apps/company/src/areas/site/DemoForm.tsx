// Demo request form → POST public/leads. A hidden honeypot field and the time
// taken to fill the form keep bots out without a captcha.
import React, { useRef, useState, type FormEvent } from 'react';
import { INDUSTRIES, SIZE_BANDS } from '../../../../../packages/company-core/src/mod.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useProblem } from '../people/ui.tsx';

const INTERESTS = ['hiring', 'placement', 'training', 'reports'] as const;

export function DemoForm() {
  const t = useAppT(), problem = useProblem();
  const { locale } = useI18n();
  const started = useRef(Date.now());
  const [form, setForm] = useState({ name: '', job_title: '', company: '', phone: '', email: '', industry: '', size_band: '', need: '', website: '' });
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [field, setField] = useState('');
  const [sent, setSent] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(''); setField('');
    if (!form.phone.trim() && !form.email.trim()) { setError(t('site.error.contact_required')); setField('phone'); return; }
    setBusy(true);
    try {
      await api('public/leads', { method: 'POST', auth: false, body: {
        ...form, job_title: form.job_title || null, phone: form.phone || null, email: form.email || null, industry: form.industry || null,
        size_band: form.size_band || null, need: form.need || null, interests, locale, source: 'landing', elapsed_ms: Date.now() - started.current,
      } });
      setSent(true);
    } catch (cause) {
      setError(problem(cause));
      setField(String((cause as { field?: string }).field ?? ''));
    } finally {
      setBusy(false);
    }
  }
  if (sent) return <div className="site-form-sent" role="status">
    <h3>{t('site.demo.sent.title')}</h3>
    <p>{t('site.demo.sent.body')}</p>
    <p><Link className="button-link" to="/start">{t('site.cta.pilot')}</Link></p>
  </div>;
  const invalid = (name: string) => field === name ? { 'aria-invalid': true as const, 'aria-describedby': 'site-form-error' } : {};
  return <form className="site-form" onSubmit={submit} noValidate={false}>
    <div className="site-form-grid">
      <label>{t('site.form.name')}<input required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={set('name')} {...invalid('name')}/></label>
      <label><span>{t('site.form.jobTitle')} <span className="site-optional">{t('common.optional')}</span></span><input maxLength={120} autoComplete="organization-title" value={form.job_title} onChange={set('job_title')}/></label>
      <label className="site-span">{t('site.form.company')}<input required minLength={2} maxLength={160} autoComplete="organization" value={form.company} onChange={set('company')} {...invalid('company')}/></label>
      <label>{t('site.form.phone')}<input type="tel" maxLength={40} autoComplete="tel" inputMode="tel" placeholder="+998" value={form.phone} onChange={set('phone')} {...invalid('phone')}/></label>
      <label>{t('site.form.email')}<input type="email" maxLength={200} autoComplete="email" value={form.email} onChange={set('email')} {...invalid('email')}/></label>
      <p className="hint site-span">{t('site.demo.contactHint')}</p>
      <label>{t('create.industry')}<select value={form.industry} onChange={set('industry')}>
        <option value="">—</option>
        {INDUSTRIES.map((code) => <option key={code} value={code}>{t(`industry.${code}` as AppKey)}</option>)}
      </select></label>
      <label>{t('create.size')}<select value={form.size_band} onChange={set('size_band')}>
        <option value="">—</option>
        {SIZE_BANDS.map((code) => <option key={code} value={code}>{t(`size.${code}` as AppKey)}</option>)}
      </select></label>
      <fieldset className="site-span site-interests">
        <legend>{t('site.form.interests')}</legend>
        {INTERESTS.map((value) => <label key={value} className="check"><input type="checkbox" checked={interests.includes(value)}
          onChange={(event) => setInterests(event.target.checked ? [...interests, value] : interests.filter((item) => item !== value))}/>{t(`site.form.interest.${value}`)}</label>)}
      </fieldset>
      <label className="site-span"><span>{t('site.form.need')} <span className="site-optional">{t('common.optional')}</span></span><textarea rows={4} maxLength={2000} value={form.need} onChange={set('need')} placeholder={t('site.form.needHint')}/></label>
      {/* Honeypot: people never see or fill this. */}
      <div className="site-trap" aria-hidden="true">
        <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')}/></label>
      </div>
    </div>
    {error && <p className="error" role="alert" id="site-form-error">{error}</p>}
    <div className="site-form-foot">
      <button disabled={busy}>{busy ? t('app.loading') : t('site.demo.submit')}</button>
      <p className="hint">{t('site.demo.privacy')}</p>
    </div>
  </form>;
}
