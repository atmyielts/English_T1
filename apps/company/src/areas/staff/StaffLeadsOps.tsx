// Lead automation views: today's calls, note templates and where requests come from.
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { INDUSTRIES, SIZE_BANDS } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { en, useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useDates, useMoney, useProblem } from '../people/ui.tsx';
import type { Lead } from './common.tsx';

/** One click: the note goes in the timeline and the next follow-up moves this many days ahead. */
export const NOTE_TEMPLATES: { key: AppKey; days: number }[] = [
  { key: 'staff.leads.template.noAnswer', days: 1 },
  { key: 'staff.leads.template.callBack', days: 3 },
  { key: 'staff.leads.template.demoBooked', days: 2 },
  { key: 'staff.leads.template.proposalSent', days: 5 },
  { key: 'staff.leads.template.budgetLater', days: 30 },
];

/** A Tashkent day this many days from now. */
export const withDays = (days: number): string => new Date(Date.now() + 5 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);

interface Call extends Lead { days_late: number; score: number; reasons: string[] }

export function TodayCalls() {
  const t = useAppT(), problem = useProblem(), { day } = useDates();
  const [data, setData] = useState<{ today: string; calls: Call[]; upcoming: number; no_date: number } | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    try {
      setData(await api('staff/leads/today'));
      setError('');
    } catch (cause) {
      setError(problem(cause));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function later(lead: Call, days: number) {
    setBusy(lead.id); setError('');
    try {
      await api(`staff/leads/${lead.id}`, { method: 'PATCH', body: { follow_up_at: withDays(days) } });
      await load();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy('');
    }
  }
  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>;
  return <section className="staff-section" aria-labelledby="calls-title">
    <h2 id="calls-title">{t('staff.calls.title', { count: data.calls.length })}</h2>
    <p className="hint">{t('staff.calls.lead', { upcoming: data.upcoming, none: data.no_date })}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {data.calls.length === 0 ? <p className="people-empty">{t('staff.calls.empty')}</p> : <ul className="staff-leads">
      {data.calls.map((lead) => <li key={lead.id}>
        <div className="staff-call">
          <div className="staff-lead-main">
            <Link to={`/staff/leads?lead=${lead.id}`}><strong>{lead.company}</strong></Link>
            <span>{lead.name}{lead.job_title ? `, ${lead.job_title}` : ''}</span>
            <span className="staff-call-contact">
              {lead.phone && <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}>{lead.phone}</a>}
              {lead.email && <a href={`mailto:${lead.email}`}>{lead.email}</a>}
            </span>
          </div>
          <div className="staff-lead-meta">
            <span className={`company-badge ${lead.score >= 60 ? 'good' : lead.score >= 30 ? '' : 'warn'}`}>{t('staff.leads.score', { score: lead.score })}</span>
            <span className={`company-badge staff-status-${lead.status}`}>{t(`staff.lead.status.${lead.status}` as AppKey)}</span>
            {lead.days_late > 0 ? <span className="company-badge bad">{t('staff.calls.late', { days: lead.days_late })}</span> : lead.follow_up_at ? <span className="company-badge warn">{t('staff.calls.today')}</span> : <span className="company-badge">{t('staff.calls.new', { date: day(lead.created_at) })}</span>}
            <button type="button" className="quiet" disabled={busy === lead.id} onClick={() => void later(lead, 1)}>{t('staff.calls.tomorrow')}</button>
            <button type="button" className="quiet" disabled={busy === lead.id} onClick={() => void later(lead, 7)}>{t('staff.calls.week')}</button>
          </div>
        </div>
      </li>)}
    </ul>}
  </section>;
}

const MANUAL_SOURCES = ['referral', 'call', 'telegram', 'event', 'partner', 'other'] as const;

/** A request staff heard about outside the site. Warns about a likely duplicate, then lets them add it anyway. */
export function AddLead({ onAdded }: { onAdded: () => Promise<void> }) {
  const t = useAppT(), problem = useProblem();
  const blank = { company: '', name: '', job_title: '', phone: '', email: '', source: 'referral', industry: '', size_band: '', need: '', follow_up_at: withDays(1), locale: 'ru' };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [duplicate, setDuplicate] = useState('');
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => { setForm({ ...form, [key]: event.target.value }); setDuplicate(''); };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api('staff/leads', { method: 'POST', body: { ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null])), force: Boolean(duplicate) } });
      setForm(blank); setDuplicate(''); setOpen(false);
      await onAdded();
    } catch (cause) {
      const details = cause as { code?: string; details?: { company?: string } };
      if (details.code === 'lead_duplicate') setDuplicate(details.details?.company ?? '?');
      else setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!open) return <div><button type="button" className="quiet" onClick={() => setOpen(true)}>{t('staff.leads.add')}</button></div>;
  return <section className="people-panel" aria-labelledby="add-lead-title">
    <div className="people-panel-head">
      <h2 id="add-lead-title">{t('staff.leads.add')}</h2>
      <button type="button" className="quiet" onClick={() => setOpen(false)}>{t('common.close')}</button>
    </div>
    <form className="people-form-grid" onSubmit={submit}>
      <label>{t('create.name')}<input required minLength={2} maxLength={160} value={form.company} onChange={set('company')}/></label>
      <label>{t('staff.leads.contactName')}<input required minLength={2} maxLength={120} value={form.name} onChange={set('name')}/></label>
      <label>{t('staff.leads.jobTitle')}<input maxLength={120} value={form.job_title} onChange={set('job_title')}/></label>
      <label>{t('people.field.contact_phone')}<input type="tel" maxLength={40} value={form.phone} onChange={set('phone')}/></label>
      <label>{t('people.field.email')}<input type="email" maxLength={200} value={form.email} onChange={set('email')}/></label>
      <label>{t('staff.leads.source')}<select value={form.source} onChange={set('source')}>{MANUAL_SOURCES.map((value) => <option key={value} value={value}>{t(`staff.leads.source.${value}`)}</option>)}</select></label>
      <label>{t('create.industry')}<select value={form.industry} onChange={set('industry')}><option value="">—</option>{INDUSTRIES.map((code) => <option key={code} value={code}>{t(`industry.${code}` as AppKey)}</option>)}</select></label>
      <label>{t('create.size')}<select value={form.size_band} onChange={set('size_band')}><option value="">—</option>{SIZE_BANDS.map((code) => <option key={code} value={code}>{t(`size.${code}` as AppKey)}</option>)}</select></label>
      <label>{t('staff.leads.followUpLabel')}<input type="date" value={form.follow_up_at} onChange={set('follow_up_at')}/></label>
      <label className="people-span">{t('staff.leads.need')}<textarea rows={2} maxLength={2000} value={form.need} onChange={set('need')}/></label>
      {duplicate && <p className="notice people-span" role="status">{t('staff.leads.duplicate', { company: duplicate })}</p>}
      <div className="people-form-actions"><button disabled={busy}>{duplicate ? t('staff.leads.addAnyway') : t('common.add')}</button></div>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

interface SourceRow { source: string; total: number; new: number; contacted: number; pilot: number; won: number; lost: number; signed_value: number; average_score: number; won_share: number }

export function LeadSources() {
  const t = useAppT(), problem = useProblem(), money = useMoney();
  const [data, setData] = useState<{ sources: SourceRow[]; months: { month: string; count: number }[]; total: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<NonNullable<typeof data>>('staff/leads/report').then(setData).catch((cause) => setError(problem(cause))); }, []);
  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>;
  const top = Math.max(1, ...data.months.map((row) => row.count));
  const label = (source: string) => {
    if (source === 'unknown') return t('staff.sources.unknown');
    const key = `staff.leads.source.${source}` as AppKey;
    return key in en ? t(key) : source;
  };
  return <section className="staff-section" aria-labelledby="sources-title">
    <h2 id="sources-title">{t('staff.sources.title')}</h2>
    <p className="hint">{t('staff.sources.lead', { total: data.total })}</p>
    {data.sources.length === 0 ? <p className="people-empty">{t('staff.leads.empty')}</p> : <div className="company-table-wrap">
      <table className="company-table">
        <thead><tr>
          <th scope="col">{t('staff.leads.source')}</th><th scope="col" className="people-num">{t('staff.sources.requests')}</th>
          {(['new', 'contacted', 'pilot', 'won', 'lost'] as const).map((status) => <th key={status} scope="col" className="people-num">{t(`staff.lead.status.${status}`)}</th>)}
          <th scope="col" className="people-num">{t('staff.sources.wonShare')}</th><th scope="col" className="people-num">{t('staff.sources.avgScore')}</th><th scope="col" className="people-num">{t('staff.sources.value')}</th>
        </tr></thead>
        <tbody>{data.sources.map((row) => <tr key={row.source}>
          <td>{label(row.source)}</td><td className="people-num">{row.total}</td><td className="people-num">{row.new}</td><td className="people-num">{row.contacted}</td><td className="people-num">{row.pilot}</td><td className="people-num">{row.won}</td><td className="people-num">{row.lost}</td>
          <td className="people-num">{row.won_share}%</td><td className="people-num">{row.average_score}</td><td className="people-num">{money(row.signed_value)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {data.months.length > 0 && <>
      <h3 className="people-subhead">{t('staff.sources.byMonth')}</h3>
      <ul className="staff-bars">
        {data.months.map((row) => <li key={row.month}><span>{row.month}</span><span className="staff-bar"><span style={{ width: `${Math.round(row.count / top * 100)}%` }}/></span><strong>{row.count}</strong></li>)}
      </ul>
    </>}
  </section>;
}
