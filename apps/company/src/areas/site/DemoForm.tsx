// Demo request form → POST public/leads, carrying where the visit came from and when
// the person prefers to talk. A hidden honeypot field and the time taken to fill the
// form keep bots out without a captcha. A sent form moves on to the thank-you page.
import React, { useRef, useState, type FormEvent } from 'react';
import { INDUSTRIES, SIZE_BANDS, type Industry } from '../../../../../packages/company-core/src/mod.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { navigate } from '../../router.tsx';
import { useProblem } from '../people/ui.tsx';
import { readAttribution } from './attribution.ts';

const INTERESTS = ['hiring', 'placement', 'training', 'reports'] as const;
const SLOTS = ['morning', 'midday', 'afternoon', 'evening'] as const;
const CHANNELS = ['phone', 'telegram', 'email', 'video'] as const;
const DAY = 86_400_000;
const tashkentDay = (at: number) => new Date(at + 5 * 3_600_000).toISOString().slice(0, 10);

export function DemoForm({ source = 'landing', industry = '', checkAnswers }: { source?: string; industry?: Industry | ''; checkAnswers?: Record<string, number> }) {
  const t = useAppT(), problem = useProblem();
  const { locale } = useI18n();
  const started = useRef(Date.now());
  const [form, setForm] = useState({ name: '', job_title: '', company: '', phone: '', email: '', industry: industry as string, size_band: '', need: '', website: '', preferred_day: '', preferred_slot: '', preferred_channel: '' });
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [field, setField] = useState('');
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(''); setField('');
    if (!form.phone.trim() && !form.email.trim()) { setError(t('site.error.contact_required')); setField('phone'); return; }
    setBusy(true);
    try {
      await api('public/leads', { method: 'POST', auth: false, body: {
        ...form, job_title: form.job_title || null, phone: form.phone || null, email: form.email || null, industry: form.industry || null,
        size_band: form.size_band || null, need: form.need || null, interests, locale, source, elapsed_ms: Date.now() - started.current,
        preferred_day: form.preferred_day || null, preferred_slot: form.preferred_slot || null, preferred_channel: form.preferred_channel || null,
        ...readAttribution(), ...(checkAnswers ? { check_answers: checkAnswers } : {}),
      } });
      navigate(`/thanks?from=${source === 'check' ? 'check' : 'demo'}`);
    } catch (cause) {
      setError(problem(cause));
      setField(String((cause as { field?: string }).field ?? ''));
      setBusy(false);
    }
  }
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
      <fieldset className="site-span site-when">
        <legend>{t('site.form.when')} <span className="site-optional">{t('common.optional')}</span></legend>
        <label>{t('site.form.day')}<input type="date" min={tashkentDay(Date.now())} max={tashkentDay(Date.now() + 90 * DAY)} value={form.preferred_day} onChange={set('preferred_day')} {...invalid('preferred_day')}/></label>
        <label>{t('site.form.slot')}<select value={form.preferred_slot} onChange={set('preferred_slot')}>
          <option value="">—</option>
          {SLOTS.map((slot) => <option key={slot} value={slot}>{t(`site.form.slot.${slot}` as AppKey)}</option>)}
        </select></label>
        <label>{t('site.form.channel')}<select value={form.preferred_channel} onChange={set('preferred_channel')}>
          <option value="">—</option>
          {CHANNELS.map((channel) => <option key={channel} value={channel}>{t(`site.form.channel.${channel}` as AppKey)}</option>)}
        </select></label>
        <p className="hint">{t('site.form.whenHint')}</p>
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

/** The same request section on every page, tagged with where it was sent from. */
export function LeadSection({ source, industry, title, lead }: { source: string; industry?: Industry; title?: string; lead?: string }) {
  const t = useAppT();
  return <section className="site-section site-demo" id="demo" aria-labelledby="site-demo-title">
    <div className="site-demo-intro">
      <h2 id="site-demo-title" className="site-h2">{title ?? t('site.demo.title')}</h2>
      <p className="site-section-lead">{lead ?? t('site.demo.lead')}</p>
      <ul className="site-ticks">
        <li>{t('site.demo.point1')}</li>
        <li>{t('site.demo.point2')}</li>
        <li>{t('site.demo.point3')}</li>
      </ul>
    </div>
    <DemoForm source={source} industry={industry ?? ''}/>
  </section>;
}
