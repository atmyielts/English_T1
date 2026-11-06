// /w/:org/sessions — live classes and workshops. HR schedules them and marks
// attendance; members see theirs, can add them to a calendar and join.
import React, { useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { navigate, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi, type AttendanceSheet, type Department, type PersonOption, type Session, type SessionList } from './api.ts';
import type { AttendanceRates } from './api2.ts';
import { addDays, download, Loading, Panel, Problem, tashkentToday, useFormat } from './ui.tsx';
import { CsvButton, PeriodForm } from './parts.tsx';

const TASHKENT = 5 * 3_600_000;
/** datetime-local value in Tashkent time for an instant. */
const toLocalInput = (iso: string) => new Date(Date.parse(iso) + TASHKENT).toISOString().slice(0, 16);
const fromLocalInput = (value: string) => new Date(`${value}:00+05:00`).toISOString();

function icsText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsDate(ms: number) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
export function sessionCalendar(session: Session, orgName: string): string {
  const start = Date.parse(session.starts_at);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Schood//Company English//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${session.id}@company.schood.online`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(start + session.duration_minutes * 60_000)}`,
    `SUMMARY:${icsText(session.title)}`,
    session.location || session.link ? `LOCATION:${icsText(session.location ?? session.link ?? '')}` : '',
    session.link ? `URL:${session.link}` : '',
    `DESCRIPTION:${icsText([orgName, session.trainer, session.notes, session.link].filter(Boolean).join('\n'))}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return `${lines.join('\r\n')}\r\n`;
}

export function Sessions() {
  const t = useAppT();
  const { org, hr, lead } = useWorkspace();
  const { query } = useLocation();
  const tab = query.get('when');
  const rates = tab === 'rates' && lead;
  const when = tab === 'past' ? 'past' : 'upcoming';
  const { data, error, loading, reload } = useApi<SessionList>(`orgs/${org.id}/sessions?when=${when}`);
  const [editing, setEditing] = useState<Session | 'new' | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const setWhen = (value: 'upcoming' | 'past' | 'rates') => navigate(`/w/${org.id}/sessions${value === 'upcoming' ? '' : `?when=${value}`}`, { replace: true });

  return <div className="insights insights-sessions">
    <header className="insights-head">
      <div>
        <h1>{t('insights.sessions.title')}</h1>
        <p className="insights-lead">{hr ? t('insights.sessions.leadHr') : t('insights.sessions.lead')}</p>
      </div>
      {data?.can_manage && !editing && <div className="company-actions"><button onClick={() => setEditing('new')}>{t('insights.sessions.new')}</button></div>}
    </header>
    {editing && <SessionForm session={editing === 'new' ? null : editing} departments={data?.departments ?? []} onDone={async (saved) => { setEditing(null); if (saved) { if (Date.parse(saved.starts_at) + saved.duration_minutes * 60_000 > Date.now()) setWhen('upcoming'); await reload(); } }}/>}

    <div className="insights-tabs" role="group" aria-label={t('insights.sessions.show')}>
      <button type="button" className={!rates && when === 'upcoming' ? '' : 'quiet'} aria-pressed={!rates && when === 'upcoming'} onClick={() => setWhen('upcoming')}>{t('insights.sessions.upcoming')}</button>
      <button type="button" className={!rates && when === 'past' ? '' : 'quiet'} aria-pressed={!rates && when === 'past'} onClick={() => setWhen('past')}>{t('insights.sessions.past')}</button>
      {lead && <button type="button" className={rates ? '' : 'quiet'} aria-pressed={rates} onClick={() => setWhen('rates')}>{t('insights.rates.tab')}</button>}
    </div>

    {rates && <Rates/>}
    {!rates && error && !data && <Problem message={error} retry={() => void reload()}/>}
    {!rates && loading && !data && <Loading/>}
    {!rates && data && data.when === when && (data.sessions.length === 0
      ? <section className="insights-panel"><p className="insights-empty">{when === 'upcoming' ? (data.can_manage ? t('insights.sessions.emptyHr') : t('insights.sessions.empty')) : t('insights.sessions.emptyPast')}</p></section>
      : <ol className="insights-sessions-list">
        {data.sessions.map((session) => <li key={session.id}>
          <SessionCard session={session} departments={data.departments} canManage={data.can_manage}
            onEdit={() => setEditing(session)} onChanged={() => void reload()}
            onAttendance={() => setMarking(marking === session.id ? null : session.id)} marking={marking === session.id}/>
          {marking === session.id && <AttendancePanel sessionId={session.id} onSaved={() => void reload()} onClose={() => setMarking(null)}/>}
        </li>)}
      </ol>)}
  </div>;
}

function Rates() {
  const t = useAppT(), f = useFormat();
  const { org } = useWorkspace();
  const { query } = useLocation();
  const today = tashkentToday();
  const from = query.get('from') || addDays(today, -89), to = query.get('to') || today;
  const { data, error, loading, reload } = useApi<AttendanceRates>(`orgs/${org.id}/sessions/attendance-rates?from=${from}&to=${to}`);
  const rate = (value: number | null) => value === null ? '—' : `${value}%`;
  return <>
    <PeriodForm key={`${from}|${to}`} from={from} to={to} onApply={(range) => navigate(`/w/${org.id}/sessions?when=rates&from=${range.from}&to=${range.to}`, { replace: true })}/>
    {error && <Problem message={error} retry={() => void reload()}/>}
    {loading && !data && <Loading/>}
    {data && <>
      <ul className="insights-movement">
        <li><strong>{f.num(data.sessions)}</strong><span>{t('insights.rates.sessions')}</span></li>
        <li><strong>{rate(data.total.rate)}</strong><span>{t('insights.rates.overall')}</span></li>
        <li><strong>{f.num(data.total.attended)}</strong><span>{t('insights.rates.attendances')}</span></li>
      </ul>
      {data.departments.length > 0 && <Panel id="rates-depts" title={t('insights.rates.byDepartment')}><div className="company-table-wrap">
        <table className="company-table">
          <thead><tr><th scope="col">{t('insights.col.department')}</th><th scope="col">{t('insights.col.people')}</th><th scope="col">{t('insights.rates.invited')}</th><th scope="col">{t('insights.rates.attended')}</th><th scope="col">{t('insights.rates.rate')}</th></tr></thead>
          <tbody>{data.departments.map((row) => <tr key={row.id ?? 'none'}><th scope="row">{row.name ?? t('insights.noDepartment')}</th><td>{f.num(row.people)}</td><td>{f.num(row.invited)}</td><td>{f.num(row.attended)}</td><td>{rate(row.rate)}</td></tr>)}</tbody>
        </table>
      </div></Panel>}
      <Panel id="rates-people" title={t('insights.rates.byPerson')} actions={data.people.length > 0 && <CsvButton path={`orgs/${org.id}/sessions/attendance-rates?from=${from}&to=${to}&format=csv`} label={t('common.download')}/>}>
        {data.people.length === 0 ? <p className="insights-empty">{t('insights.rates.empty')}</p> : <div className="company-table-wrap">
          <table className="company-table">
            <thead><tr><th scope="col">{t('insights.col.person')}</th><th scope="col">{t('insights.rates.invited')}</th><th scope="col">{t('insights.rates.attended')}</th><th scope="col">{t('insights.rates.rate')}</th></tr></thead>
            <tbody>{data.people.map((row) => <tr key={row.member_id}>
              <th scope="row">{row.name}{row.department && <small className="insights-cell-note">{row.department}</small>}</th>
              <td>{f.num(row.invited)}</td><td>{f.num(row.attended)}{row.extra > 0 ? <small> {t('insights.rates.extra', { count: row.extra })}</small> : null}</td><td>{rate(row.rate)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <p className="hint">{t('insights.rates.note', { hidden: data.hidden })}</p>
      </Panel>
    </>}
  </>;
}

function SessionCard({ session, departments, canManage, onEdit, onChanged, onAttendance, marking }: { session: Session; departments: Department[]; canManage: boolean; onEdit: () => void; onChanged: () => void; onAttendance: () => void; marking: boolean }) {
  const t = useAppT(), f = useFormat(), problem = useErrorText();
  const { org, lead } = useWorkspace();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const ends = Date.parse(session.starts_at) + session.duration_minutes * 60_000;
  const started = Date.parse(session.starts_at) <= Date.now();
  // The join button appears 30 minutes before the start and stays until the end.
  const joinable = ends > Date.now() && Date.parse(session.starts_at) - 30 * 60_000 <= Date.now();
  const cancelled = session.status === 'cancelled';
  const audience = session.department_ids.length || session.member_ids.length
    ? [...departments.filter((entry) => session.department_ids.includes(entry.id)).map((entry) => entry.name), session.member_ids.length ? t('insights.sessions.people', { count: session.member_ids.length }) : ''].filter(Boolean).join(', ') || t('insights.sessions.chosen')
    : t('insights.everyone');
  async function cancelSeries() {
    if (!confirm(t('insights.series.confirmCancel'))) return;
    setBusy(true); setError('');
    try {
      await api(`orgs/${org.id}/sessions/${session.id}/cancel-series`, { method: 'POST' });
      onChanged();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!confirm(t('insights.sessions.confirmCancel'))) return;
    setBusy(true); setError('');
    try {
      await api(`orgs/${org.id}/sessions/${session.id}/cancel`, { method: 'POST' });
      onChanged();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <article className={`insights-session${cancelled ? ' insights-session-cancelled' : ''}`} aria-labelledby={`session-${session.id}`}>
    <div className="insights-session-when">
      <strong>{f.weekday(session.starts_at)}</strong>
      <span>{f.time(session.starts_at)}–{f.time(new Date(ends).toISOString())}</span>
      <small>{t('insights.sessions.tashkent')}</small>
    </div>
    <div className="insights-session-body">
      <p className="insights-meta">
        <span className="company-badge">{t(`insights.sessionKind.${session.kind}` as AppKey)}</span>
        {cancelled && <span className="company-badge bad">{t('insights.sessions.cancelled')}</span>}
        {session.in_progress && !cancelled && <span className="company-badge good">{t('insights.sessions.now')}</span>}
        {session.series_id && <span className="company-badge">{t('insights.series.badge')}</span>}
        {session.attended === true && <span className="company-badge good">{t('insights.sessions.attended')}</span>}
        {session.attended === false && session.for_me && !cancelled && <span className="company-badge warn">{t('insights.sessions.missed')}</span>}
      </p>
      <h2 id={`session-${session.id}`}>{session.title}</h2>
      <p className="insights-session-facts">
        <span>{f.minutes(session.duration_minutes)}</span>
        {session.trainer && <span>{t('insights.sessions.with', { trainer: session.trainer })}</span>}
        {session.location && <span>{session.location}</span>}
        {session.link && !joinable && ends > Date.now() && <span>{t('insights.sessions.online')}</span>}
        {lead && <span>{t('insights.sessions.for', { who: audience })}</span>}
        {!lead && session.for_me && <span>{t('insights.sessions.invited')}</span>}
      </p>
      {session.notes && <p className="insights-description">{session.notes}</p>}
      {session.counts && <p className="hint">{started ? t('insights.sessions.present', { present: session.counts.present, invited: session.counts.invited }) : t('insights.sessions.invitedCount', { count: session.counts.invited })}</p>}
      {!cancelled && <div className="company-actions">
        {session.link && joinable && <a className="button-link" href={session.link} target="_blank" rel="noopener noreferrer">{t('insights.sessions.join')}</a>}
        {ends > Date.now() && <button className="quiet" onClick={() => download(`${session.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) || 'session'}.ics`, sessionCalendar(session, org.name), 'text/calendar;charset=utf-8')}>{t('insights.sessions.calendar')}</button>}
        {canManage && !started && <button className="quiet" disabled={busy} onClick={onEdit}>{t('common.edit')}</button>}
        {canManage && started && <button className={marking ? '' : 'quiet'} aria-expanded={marking} onClick={onAttendance}>{t('insights.sessions.attendance')}</button>}
        {!canManage && lead && started && <button className="quiet" aria-expanded={marking} onClick={onAttendance}>{t('insights.sessions.whoCame')}</button>}
        {canManage && !(session.counts && session.counts.present > 0) && <button className="quiet" disabled={busy} onClick={() => void cancel()}>{t('insights.sessions.cancel')}</button>}
        {canManage && session.series_id && !started && <button className="quiet" disabled={busy} onClick={() => void cancelSeries()}>{t('insights.series.cancel')}</button>}
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  </article>;
}

function AttendancePanel({ sessionId, onSaved, onClose }: { sessionId: string; onSaved: () => void; onClose: () => void }) {
  const t = useAppT(), problem = useErrorText();
  const { org, hr } = useWorkspace();
  const { data, error, loading, reload } = useApi<AttendanceSheet>(`orgs/${org.id}/sessions/${sessionId}/attendance`);
  const [present, setPresent] = useState<Set<string> | null>(null);
  const [extra, setExtra] = useState<{ member_id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false), [saveError, setSaveError] = useState(''), [saved, setSaved] = useState('');
  const chosen = present ?? new Set(data?.people.filter((row) => row.present).map((row) => row.member_id) ?? []);
  const rows = data ? [...data.people, ...extra.map((row) => ({ ...row, department: null, invited: false, present: false }))] : [];
  const toggle = (id: string) => { const next = new Set(chosen); if (next.has(id)) next.delete(id); else next.add(id); setPresent(next); setSaved(''); };
  async function save() {
    setBusy(true); setSaveError(''); setSaved('');
    try {
      const result = await api<{ present: number; added: number; removed: number }>(`orgs/${org.id}/sessions/${sessionId}/attendance`, { method: 'PUT', body: { present: [...chosen] } });
      setSaved(t('insights.attendance.saved', { count: result.present }));
      setPresent(null); setExtra([]);
      await reload();
      onSaved();
    } catch (cause) {
      setSaveError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <Panel id={`att-${sessionId}`} title={t('insights.attendance.title')} className="insights-attendance">
    {error && <Problem message={error} retry={() => void reload()}/>}
    {loading && !data && <Loading/>}
    {data && <>
      {data.can_mark ? <p className="hint">{t('insights.attendance.lead')}</p> : <p className="hint">{t('insights.attendance.readOnly')}</p>}
      {rows.length === 0 ? <p className="insights-empty">{t('insights.attendance.nobody')}</p> : <fieldset className="insights-checklist" disabled={!data.can_mark}>
        <legend>{t('insights.attendance.legend', { count: chosen.size, total: rows.length })}</legend>
        {data.can_mark && <div className="company-actions">
          <button type="button" className="quiet" onClick={() => setPresent(new Set(rows.map((row) => row.member_id)))}>{t('insights.attendance.all')}</button>
          <button type="button" className="quiet" onClick={() => setPresent(new Set())}>{t('insights.attendance.none')}</button>
        </div>}
        {rows.map((row) => <label key={row.member_id} className="check">
          <input type="checkbox" checked={chosen.has(row.member_id)} onChange={() => toggle(row.member_id)}/>
          <span>{row.name}{row.department ? <small> · {row.department}</small> : null}{!row.invited ? <small> · {t('insights.attendance.notInvited')}</small> : null}</span>
        </label>)}
      </fieldset>}
      {data.can_mark && data.others.length > 0 && <label>{t('insights.attendance.addOther')}
        <select value="" onChange={(event) => {
          const person = data.others.find((row) => row.member_id === event.target.value);
          if (person && !extra.some((row) => row.member_id === person.member_id)) { setExtra([...extra, person]); toggle(person.member_id); }
        }}>
          <option value="">{t('insights.attendance.choose')}</option>
          {data.others.filter((row) => !extra.some((entry) => entry.member_id === row.member_id)).map((row) => <option key={row.member_id} value={row.member_id}>{row.name}</option>)}
        </select>
      </label>}
      <div className="company-actions">
        {data.can_mark && <button disabled={busy} onClick={() => void save()}>{t('insights.attendance.save')}</button>}
        <button className="quiet" onClick={onClose}>{t('common.close')}</button>
      </div>
      {data.can_mark && <p className="hint">{t('insights.attendance.note')}</p>}
      {saved && <p className="notice" role="status">{saved}</p>}
      {saveError && <p className="error" role="alert">{saveError}</p>}
      <TrainerNotes sessionId={sessionId} initial={data.session.trainer_notes ?? ''} canEdit={hr && data.session.status === 'scheduled'}/>
    </>}
  </Panel>;
}

function TrainerNotes({ sessionId, initial, canEdit }: { sessionId: string; initial: string; canEdit: boolean }) {
  const t = useAppT(), problem = useErrorText();
  const { org } = useWorkspace();
  const [text, setText] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  async function save() {
    setBusy(true); setError(''); setSaved(false);
    try {
      await api(`orgs/${org.id}/sessions/${sessionId}`, { method: 'PATCH', body: { trainer_notes: text } });
      setSaved(true);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!canEdit && !initial) return null;
  return <div className="insights-form">
    <label>{t('insights.series.trainerNotes')}
      {canEdit ? <textarea rows={3} maxLength={4000} value={text} onChange={(event) => { setText(event.target.value); setSaved(false); }}/> : <p className="insights-description">{initial}</p>}
    </label>
    <p className="hint">{t('insights.series.trainerNotesHint')}</p>
    {canEdit && <div className="company-actions"><button type="button" className="quiet" disabled={busy || text === initial && !saved} onClick={() => void save()}>{t('common.save')}</button></div>}
    {saved && <p className="notice" role="status">{t('common.saved')}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}

function SessionForm({ session, departments, onDone }: { session: Session | null; departments: Department[]; onDone: (saved: Session | null) => void | Promise<void> }) {
  const t = useAppT(), problem = useErrorText();
  const { org } = useWorkspace();
  const people = useApi<{ people: PersonOption[] }>(`orgs/${org.id}/insights/people`);
  const defaultStart = useMemo(() => {
    const next = new Date(Date.now() + 2 * 86_400_000 + TASHKENT);
    return `${next.toISOString().slice(0, 10)}T10:00`;
  }, []);
  const [form, setForm] = useState({
    title: session?.title ?? '', kind: session?.kind ?? 'class', trainer: session?.trainer ?? '', start: session ? toLocalInput(session.starts_at) : defaultStart,
    duration_minutes: String(session?.duration_minutes ?? 60), location: session?.location ?? '', link: session?.link ?? '', notes: session?.notes ?? '',
    audience: session ? (session.member_ids.length ? 'people' : session.department_ids.length ? 'departments' : 'everyone') : 'everyone',
    department_ids: session?.department_ids ?? [] as string[], member_ids: session?.member_ids ?? [] as string[],
    repeat: 'none', count: '8', apply_to_series: false,
  });
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const toggle = (key: 'department_ids' | 'member_ids', id: string) => setForm({ ...form, [key]: form[key].includes(id) ? form[key].filter((value) => value !== id) : [...form[key], id] });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const body = {
        title: form.title, kind: form.kind, trainer: form.trainer, starts_at: fromLocalInput(form.start), duration_minutes: Number(form.duration_minutes),
        location: form.location, link: form.link, notes: form.notes,
        department_ids: form.audience === 'departments' ? form.department_ids : [], member_ids: form.audience === 'people' ? form.member_ids : [],
      };
      const series = !session && form.repeat !== 'none';
      const { session: saved } = await api<{ session: Session }>(session ? `orgs/${org.id}/sessions/${session.id}` : series ? `orgs/${org.id}/sessions/series` : `orgs/${org.id}/sessions`, {
        method: session ? 'PATCH' : 'POST', body: series ? { ...body, repeat: form.repeat, count: Number(form.count) } : session ? { ...body, apply_to_series: form.apply_to_series } : body,
      });
      await onDone(saved);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const options = (people.data?.people ?? []).filter((person) => !filter || person.name.toLowerCase().includes(filter.toLowerCase()));
  return <Panel id="session-form" title={session ? t('insights.sessions.edit') : t('insights.sessions.new')}>
    <form onSubmit={submit} className="insights-form">
      <label>{t('insights.sessions.titleField')}<input required minLength={2} maxLength={160} value={form.title} onChange={set('title')} placeholder={t('insights.sessions.titlePlaceholder')}/></label>
      <div className="insights-form-row">
        <label>{t('insights.sessions.kind')}<select value={form.kind} onChange={set('kind')}><option value="class">{t('insights.sessionKind.class')}</option><option value="workshop">{t('insights.sessionKind.workshop')}</option></select></label>
        <label>{t('insights.sessions.trainer')} <span className="hint">{t('common.optional')}</span><input maxLength={120} value={form.trainer} onChange={set('trainer')}/></label>
      </div>
      <div className="insights-form-row">
        <label>{t('insights.sessions.start')}<input type="datetime-local" required value={form.start} onChange={set('start')}/></label>
        <label>{t('insights.sessions.duration')}<input type="number" required min={10} max={480} step={5} inputMode="numeric" value={form.duration_minutes} onChange={set('duration_minutes')}/></label>
      </div>
      <p className="hint">{t('insights.sessions.timeNote')}</p>
      {!session && <div className="insights-form-row">
        <label>{t('insights.series.repeat')}<select value={form.repeat} onChange={set('repeat')}>
          <option value="none">{t('insights.series.none')}</option>
          <option value="weekly">{t('insights.series.weekly')}</option>
          <option value="biweekly">{t('insights.series.biweekly')}</option>
        </select></label>
        {form.repeat !== 'none' && <label>{t('insights.series.count')}<input type="number" required min={2} max={26} inputMode="numeric" value={form.count} onChange={set('count')}/></label>}
      </div>}
      <div className="insights-form-row">
        <label>{t('insights.sessions.location')} <span className="hint">{t('common.optional')}</span><input maxLength={200} value={form.location} onChange={set('location')} placeholder={t('insights.sessions.locationPlaceholder')}/></label>
        <label>{t('insights.sessions.link')} <span className="hint">{t('common.optional')}</span><input type="url" maxLength={500} pattern="https://.*" value={form.link} onChange={set('link')} placeholder="https://"/></label>
      </div>
      <fieldset>
        <legend>{t('insights.sessions.who')}</legend>
        {(['everyone', 'departments', 'people'] as const).map((value) => <label key={value} className="check"><input type="radio" name="audience" checked={form.audience === value} onChange={() => setForm({ ...form, audience: value })}/>{t(`insights.sessions.audience.${value}` as AppKey)}</label>)}
        {form.audience === 'departments' && <div className="insights-checklist">
          {departments.length === 0 ? <p className="hint">{t('insights.sessions.noDepartments')}</p> : departments.map((entry) => <label key={entry.id} className="check"><input type="checkbox" checked={form.department_ids.includes(entry.id)} onChange={() => toggle('department_ids', entry.id)}/>{entry.name}</label>)}
        </div>}
        {form.audience === 'people' && <div className="insights-checklist">
          <label>{t('common.search')}<input type="search" value={filter} onChange={(event) => setFilter(event.target.value)}/></label>
          {people.loading && <Loading/>}
          <div className="insights-checklist-scroll">
            {options.map((person) => <label key={person.id} className="check"><input type="checkbox" checked={form.member_ids.includes(person.id)} onChange={() => toggle('member_ids', person.id)}/>{person.name}</label>)}
          </div>
          <p className="hint">{t('insights.sessions.chosenCount', { count: form.member_ids.length })}</p>
        </div>}
      </fieldset>
      <label>{t('insights.sessions.notes')} <span className="hint">{t('common.optional')}</span><textarea rows={2} maxLength={1000} value={form.notes} onChange={set('notes')}/></label>
      {session?.series_id && <label className="check"><input type="checkbox" checked={form.apply_to_series} onChange={(event) => setForm({ ...form, apply_to_series: event.target.checked })}/>{t('insights.series.applyLater')}</label>}
      <div className="company-actions">
        <button disabled={busy || (form.audience === 'departments' && !form.department_ids.length) || (form.audience === 'people' && !form.member_ids.length)}>{session ? t('common.save') : t('insights.sessions.schedule')}</button>
        <button type="button" className="quiet" onClick={() => void onDone(null)}>{t('common.cancel')}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </Panel>;
}
