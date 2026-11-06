// /staff/leads — demo requests from the landing page as a pipeline: status,
// follow-up date, notes and a dated timeline, and opening a workspace for one.
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { en, useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate, useLocation } from '../../router.tsx';
import { useDates, useProblem } from '../people/ui.tsx';
import { NewWorkspace } from './StaffOrgs.tsx';
import { AddLead, LeadSources, NOTE_TEMPLATES, TodayCalls, withDays } from './StaffLeadsOps.tsx';
import { LinkResult } from '../people/ui.tsx';
import { LEAD_STATUSES, StaffFrame, type AuditRow, type Lead, type LeadStatus } from './common.tsx';

export function StaffLeads() {
  const t = useAppT(), problem = useProblem(), { day } = useDates();
  const { query } = useLocation();
  const open = query.get('lead');
  const [data, setData] = useState<{ leads: Lead[]; counts: Record<LeadStatus, number> } | null>(null);
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [q, setQ] = useState('');
  const [byScore, setByScore] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setData(await api('staff/leads'));
      setError('');
    } catch (cause) {
      setError(problem(cause));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const today = new Date().toISOString().slice(0, 10);
  const needle = q.trim().toLowerCase();
  const shown = (data?.leads ?? []).filter((lead) => (!status || lead.status === status)
    && (!needle || [lead.company, lead.name, lead.email, lead.phone].some((value) => String(value ?? '').toLowerCase().includes(needle))));
  const select = (id: string | null) => navigate(id ? `/staff/leads?lead=${id}` : '/staff/leads', { replace: true });
  const view = query.get('view');
  const ordered = byScore ? [...shown].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) : shown;
  return <StaffFrame title={t('staff.leads.title')} lead={t('staff.leads.lead')}>
    <div className="staff-chips" role="group" aria-label={t('staff.leads.views')}>
      <button type="button" className={view === 'today' || view === 'sources' ? 'quiet' : ''} onClick={() => navigate('/staff/leads', { replace: true })}>{t('staff.leads.viewPipeline')}</button>
      <button type="button" className={view === 'today' ? '' : 'quiet'} onClick={() => navigate('/staff/leads?view=today', { replace: true })}>{t('staff.leads.viewToday')}</button>
      <button type="button" className={view === 'sources' ? '' : 'quiet'} onClick={() => navigate('/staff/leads?view=sources', { replace: true })}>{t('staff.leads.viewSources')}</button>
    </div>
    {view === 'today' ? <TodayCalls/> : view === 'sources' ? <LeadSources/> : <>
    <AddLead onAdded={load}/>
    <div className="staff-chips" role="group" aria-label={t('staff.leads.filter')}>
      <button type="button" className={status ? 'quiet' : ''} aria-pressed={!status} onClick={() => setStatus('')}>{t('common.all')} <span className="staff-count">{data?.leads.length ?? 0}</span></button>
      {LEAD_STATUSES.map((value) => <button key={value} type="button" className={status === value ? '' : 'quiet'} aria-pressed={status === value} onClick={() => setStatus(value)}>
        {t(`staff.lead.status.${value}` as AppKey)} <span className="staff-count">{data?.counts[value] ?? 0}</span>
      </button>)}
    </div>
    <div className="company-toolbar" role="search">
      <label>{t('common.search')}<input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('staff.leads.searchHint')}/></label>
      <label className="check"><input type="checkbox" checked={byScore} onChange={(event) => setByScore(event.target.checked)}/>{t('staff.leads.sortScore')}</label>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {!data ? <p role="status">{t('app.loading')}</p> : shown.length === 0 ? <p className="people-empty">{t('staff.leads.empty')}</p> : <ul className="staff-leads">
      {ordered.map((lead) => <li key={lead.id} className={open === lead.id ? 'open' : ''}>
        <button type="button" className="staff-lead-summary" aria-expanded={open === lead.id} onClick={() => select(open === lead.id ? null : lead.id)}>
          <span className="staff-lead-main">
            <strong>{lead.company}</strong>
            <span>{lead.name}{lead.job_title ? `, ${lead.job_title}` : ''}</span>
          </span>
          <span className="staff-lead-meta">
            {lead.score !== undefined && <span className={`company-badge ${lead.score >= 60 ? 'good' : lead.score >= 30 ? '' : 'warn'}`} title={t('staff.leads.scoreHint')}>{t('staff.leads.score', { score: lead.score })}</span>}
            {lead.source === 'company_seats' && <span className="company-badge staff-source-seats">{t('staff.leads.source.company_seats')}</span>}
            <span className={`company-badge staff-status-${lead.status}`}>{t(`staff.lead.status.${lead.status}` as AppKey)}</span>
            {lead.follow_up_at && <span className={`company-badge ${lead.follow_up_at <= today && !['won', 'lost'].includes(lead.status) ? 'bad' : ''}`}>{t('staff.leads.followUp', { date: day(lead.follow_up_at) })}</span>}
            <span className="people-muted">{day(lead.created_at)}</span>
          </span>
        </button>
        {open === lead.id && <LeadDetail lead={lead} onChanged={load}/>}
      </li>)}
    </ul>}
    </>}
  </StaffFrame>;
}

function LeadDetail({ lead, onChanged }: { lead: Lead; onChanged: () => Promise<void> }) {
  const t = useAppT(), problem = useProblem(), { when } = useDates();
  const [form, setForm] = useState({ status: lead.status as string, follow_up_at: lead.follow_up_at ?? '', notes: lead.notes ?? '' });
  const [note, setNote] = useState('');
  const [timeline, setTimeline] = useState<AuditRow[]>([]);
  const [opening, setOpening] = useState(false);
  const [converted, setConverted] = useState<{ link: string; org: { id: string; name: string } } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const loadTimeline = useCallback(async () => {
    try {
      const response = await api<{ timeline: AuditRow[] }>(`staff/leads/${lead.id}`);
      setTimeline(response.timeline);
    } catch (cause) {
      setError(problem(cause));
    }
  }, [lead.id]);
  useEffect(() => { void loadTimeline(); }, [loadTimeline]);
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setNotice(message);
      await Promise.all([onChanged(), loadTimeline()]);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const applyTemplate = (key: AppKey, days: number) => run(async () => {
    await api(`staff/leads/${lead.id}/notes`, { method: 'POST', body: { body: t(key) } });
    const follow_up_at = withDays(days);
    await api(`staff/leads/${lead.id}`, { method: 'PATCH', body: { follow_up_at, ...(lead.status === 'new' ? { status: 'contacted' } : {}) } });
    setForm((current) => ({ ...current, follow_up_at, status: lead.status === 'new' ? 'contacted' : current.status }));
  }, t('staff.leads.noteAdded'));
  const convert = () => run(async () => {
    setConverted(await api<{ link: string; org: { id: string; name: string } }>(`staff/leads/${lead.id}/convert`, { method: 'POST' }));
    setForm((current) => ({ ...current, status: 'pilot' }));
  }, t('staff.leads.converted'));
  function save(event: FormEvent) {
    event.preventDefault();
    void run(() => api(`staff/leads/${lead.id}`, { method: 'PATCH', body: { status: form.status, follow_up_at: form.follow_up_at || null, notes: form.notes || null } }), t('common.saved'));
  }
  function addNote(event: FormEvent) {
    event.preventDefault();
    void run(async () => { await api(`staff/leads/${lead.id}/notes`, { method: 'POST', body: { body: note } }); setNote(''); }, t('staff.leads.noteAdded'));
  }
  return <div className="staff-lead-detail">
    <dl className="people-facts">
      {lead.phone && <div><dt>{t('people.field.contact_phone')}</dt><dd><a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}>{lead.phone}</a></dd></div>}
      {lead.email && <div><dt>{t('people.field.email')}</dt><dd><a href={`mailto:${lead.email}`}>{lead.email}</a></dd></div>}
      {lead.industry && <div><dt>{t('create.industry')}</dt><dd>{t(`industry.${lead.industry}` as AppKey)}</dd></div>}
      {lead.size_band && <div><dt>{t('create.size')}</dt><dd>{t(`size.${lead.size_band}` as AppKey)}</dd></div>}
      {lead.locale && <div><dt>{t('people.field.locale')}</dt><dd>{lead.locale.toUpperCase()}</dd></div>}
      {(lead.interests ?? []).length > 0 && <div><dt>{t('staff.leads.interests')}</dt><dd>{(lead.interests ?? []).map((value) => t(`site.form.interest.${value}` as AppKey)).join(', ')}</dd></div>}
      {lead.source && <div><dt>{t('staff.leads.source')}</dt><dd>{sourceLabel(t, lead.source)}</dd></div>}
    </dl>
    {lead.need && <blockquote className="staff-need">{lead.need}</blockquote>}
    {(lead.reasons ?? []).length > 0 && <p className="hint">{t('staff.leads.scoreWhy', { reasons: (lead.reasons ?? []).map((reason) => t(`staff.leads.reason.${reason}` as AppKey)).join(', ') })}</p>}
    <div className="company-actions">
      {lead.org ? <Link className="button-link quiet" to={`/staff/orgs/${lead.org.id}`}>{t('staff.leads.workspace', { name: lead.org.name })}</Link>
        : <>
          <button type="button" disabled={busy} onClick={() => void convert()}>{t('staff.leads.convert')}</button>
          <button type="button" className="quiet" aria-expanded={opening} onClick={() => setOpening(!opening)}>{t('staff.leads.openWorkspace')}</button>
        </>}
    </div>
    {converted && <LinkResult link={converted.link} title={t('staff.orgs.ownerLink', { company: converted.org.name })} message={t('staff.orgs.ownerShare', { company: converted.org.name })} note={t('staff.orgs.ownerNote')}/>}
    {opening && !lead.org && <NewWorkspace lead={lead} onClose={() => setOpening(false)} onCreated={() => void onChanged()}/>}
    <form className="people-form-grid" onSubmit={save}>
      <label>{t('people.field.status')}<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
        {LEAD_STATUSES.map((value) => <option key={value} value={value}>{t(`staff.lead.status.${value}` as AppKey)}</option>)}
      </select></label>
      <label>{t('staff.leads.followUpLabel')}<input type="date" value={form.follow_up_at} onChange={(event) => setForm({ ...form, follow_up_at: event.target.value })}/></label>
      <label className="people-span">{t('staff.leads.notes')}<textarea rows={3} maxLength={4000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></label>
      <div className="people-form-actions"><button disabled={busy}>{t('common.save')}</button></div>
    </form>
    <div className="staff-chips" role="group" aria-label={t('staff.leads.templates')}>
      {NOTE_TEMPLATES.map((template) => <button key={template.key} type="button" className="quiet" disabled={busy} onClick={() => void applyTemplate(template.key, template.days)}>{t(template.key)}</button>)}
    </div>
    <form className="people-inline-form" onSubmit={addNote}>
      <label>{t('staff.leads.addNote')}<input maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('staff.leads.notePlaceholder')}/></label>
      <button className="quiet" disabled={busy || !note.trim()}>{t('common.add')}</button>
    </form>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <h3 className="people-subhead">{t('staff.leads.timeline')}</h3>
    <ol className="staff-timeline">
      {timeline.map((row) => <li key={String(row.id)}>
        <time dateTime={row.created_at}>{when(row.created_at)}</time>
        <span>{timelineText(t, row)}</span>
        {row.actor_name && <span className="people-muted">{row.actor_name}</span>}
      </li>)}
    </ol>
  </div>;
}

function sourceLabel(t: ReturnType<typeof useAppT>, source: string): string {
  const key = `staff.leads.source.${source}` as AppKey;
  return key in en ? t(key) : source;
}

function timelineText(t: ReturnType<typeof useAppT>, row: AuditRow): string {
  const details = row.details ?? {};
  switch (row.action) {
    case 'lead.created': return t('staff.timeline.created');
    case 'lead.note': return String(details.body ?? '');
    case 'lead.workspace': return t('staff.timeline.workspace', { name: String(details.name ?? '') });
    case 'lead.updated': {
      const parts: string[] = [];
      const status = details.status as { from: string; to: string } | undefined;
      if (status) parts.push(t('staff.timeline.status', { from: t(`staff.lead.status.${status.from}` as AppKey), to: t(`staff.lead.status.${status.to}` as AppKey) }));
      if (details.follow_up_at) parts.push(t('staff.timeline.followUp'));
      if (details.notes) parts.push(t('staff.timeline.notes'));
      return parts.join(' · ');
    }
    default: return row.action;
  }
}
