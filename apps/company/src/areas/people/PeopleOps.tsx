// The People page's working tools: the live getting-started checklist, requests from
// employees, saved filters and the bulk actions bar with its per-row results.
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { JOB_ROLES, LEVELS } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { en, useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import type { BulkResponse, ChecklistState, Department, MemberRequest, PersonRow, SavedFilter } from './types.ts';
import { csvCell, download, LinkResult, useDates, useProblem } from './ui.tsx';

const CHECK_LINK: Record<string, (orgId: string) => string> = {
  departments: (org) => `/w/${org}/departments`,
  people: (org) => `/w/${org}/people?panel=invite`,
  first_test: (org) => `/w/${org}/hiring`,
  seats: (org) => `/w/${org}/people?seat=no&status=active`,
  first_report: (org) => `/w/${org}/reports`,
};

/** What is left to set up, read from the workspace's real data. HR can hide it and bring it back. */
export function OnboardingChecklist({ orgId, editable }: { orgId: string; editable: boolean }) {
  const t = useAppT(), problem = useProblem();
  const [state, setState] = useState<ChecklistState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    api<ChecklistState>(`orgs/${orgId}/onboarding`).then((next) => { if (live) setState(next); }).catch(() => undefined);
    return () => { live = false; };
  }, [orgId]);
  if (!state) return null;
  const dismiss = async (dismissed: boolean) => {
    try {
      setState(await api<ChecklistState>(`orgs/${orgId}/onboarding/dismiss`, { method: 'POST', body: { dismissed } }));
    } catch (cause) {
      setError(problem(cause));
    }
  };
  if (state.dismissed_at) return editable && !state.complete ? <p className="hint no-print"><button type="button" className="people-linkish" onClick={() => void dismiss(false)}>{t('people.checklist.showAgain')}</button></p> : null;
  const items = state.items.filter((item) => item.applies);
  return <aside className="people-checklist" aria-labelledby="people-checklist-title">
    <div className="people-panel-head">
      <h2 id="people-checklist-title">{state.complete ? t('people.checklist.doneTitle') : t('people.checklist.title')}</h2>
      {editable && <button type="button" className="quiet" onClick={() => void dismiss(true)}>{t('people.checklist.hide')}</button>}
    </div>
    {!state.complete && <>
    <div className="people-meter-bar" role="progressbar" aria-label={t('people.checklist.title')} aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.done}>
      <span style={{ width: `${Math.round(state.done / Math.max(1, state.total) * 100)}%` }}/>
    </div>
    <p className="hint">{t('people.checklist.progress', { done: state.done, total: state.total })}</p>
    <ol className="people-checklist-items">
      {items.map((item) => <li key={item.key} className={item.done ? 'ticked' : ''}>
        <span aria-hidden="true" className="people-checklist-mark">{item.done ? '✓' : ''}</span>
        <div>
          <Link to={CHECK_LINK[item.key](orgId)}>{t(`people.checklist.${item.key}` as AppKey)}</Link>
          <span className="visually-hidden">{item.done ? t('people.checklist.stateDone') : t('people.checklist.stateOpen')}</span>
          {!item.done && <small>{t(`people.checklist.${item.key}Hint` as AppKey)}</small>}
        </div>
      </li>)}
    </ol>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </aside>;
}

/** Employees' requests waiting for HR. Shows nothing while there are none. */
export function RequestsPanel({ orgId, editable, onChanged }: { orgId: string; editable: boolean; onChanged: () => Promise<void> }) {
  const t = useAppT(), problem = useProblem(), { day } = useDates();
  const [rows, setRows] = useState<MemberRequest[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setRows((await api<{ requests: MemberRequest[] }>(`orgs/${orgId}/people/requests`)).requests);
    } catch { /* An extra panel: the list itself is what matters if this fails. */ }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);
  if (!rows.length) return null;
  async function decide(id: string, decision: 'approve' | 'decline') {
    setBusy(true); setError('');
    try {
      await api(`orgs/${orgId}/people/requests/${id}`, { method: 'POST', body: { decision } });
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(problem(cause));
      await load();
    } finally {
      setBusy(false);
    }
  }
  return <section className="people-panel" aria-labelledby="people-requests-title">
    <h2 id="people-requests-title">{t('people.requests.title', { count: rows.length })}</h2>
    <ul className="people-admins">
      {rows.map((row) => <li key={row.id}>
        <div>
          <strong>{row.person ?? t('people.unnamed')}</strong>
          <span>{row.kind === 'seat' ? t('people.requests.seat') : t('people.requests.jobFrom', { from: t(`job.${row.current_job_role ?? 'general'}` as AppKey), role: t(`job.${row.job_role}` as AppKey) })} · {day(row.created_at)}</span>
          {row.note && <span>{row.note}</span>}
        </div>
        {editable && <div className="company-actions people-request-actions">
          <button type="button" disabled={busy} onClick={() => void decide(row.id, 'approve')}>{t('people.requests.approve')}</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => void decide(row.id, 'decline')}>{t('people.requests.decline')}</button>
        </div>}
      </li>)}
    </ul>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

/** The person's own saved filter chips, and saving the one on screen. */
export function SavedFilters({ orgId, current, onApply }: { orgId: string; current: Record<string, string>; onApply: (filters: Record<string, string>) => void }) {
  const t = useAppT(), problem = useProblem();
  const [rows, setRows] = useState<SavedFilter[]>([]);
  const [naming, setNaming] = useState(false), [name, setName] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setRows((await api<{ filters: SavedFilter[] }>(`orgs/${orgId}/people/filters`)).filters);
    } catch { /* Convenience only. */ }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);
  const active = Object.values(current).some(Boolean);
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api(`orgs/${orgId}/people/filters`, { method: 'POST', body: { name, filters: current } });
      setNaming(false); setName('');
      await load();
    } catch (cause) {
      setError(problem(cause));
    }
  }
  async function remove(id: string) {
    setError('');
    try {
      await api(`orgs/${orgId}/people/filters/${id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(problem(cause));
    }
  }
  if (!rows.length && !active) return null;
  return <div className="people-filters-saved" role="group" aria-label={t('people.filters.saved')}>
    {rows.map((row) => <span key={row.id} className="people-filter-chip">
      <button type="button" className="quiet" onClick={() => onApply(row.filters)}>{row.name}</button>
      <button type="button" className="quiet" aria-label={t('people.filters.delete', { name: row.name })} onClick={() => void remove(row.id)}>×</button>
    </span>)}
    {active && !naming && <button type="button" className="people-linkish" onClick={() => setNaming(true)}>{t('people.filters.save')}</button>}
    {naming && <form className="people-inline-form" onSubmit={save}>
      <label>{t('people.filters.name')}<input required maxLength={60} autoFocus value={name} onChange={(event) => setName(event.target.value)}/></label>
      <button className="quiet" disabled={!name.trim()}>{t('common.save')}</button>
      <button type="button" className="quiet" onClick={() => setNaming(false)}>{t('common.cancel')}</button>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}

type BulkAction = 'department' | 'job_role' | 'target' | 'seat_on' | 'seat_off' | 'remove' | 'renew_links';

/** Choose an action, say yes once, and see what happened to each person. */
export function BulkBar({ orgId, orgName, selected, departments, seatsActive, onClear, onDone }: { orgId: string; orgName: string; selected: PersonRow[]; departments: Department[]; seatsActive: boolean; onClear: () => void; onDone: () => Promise<void> }) {
  const t = useAppT(), problem = useProblem();
  const [action, setAction] = useState<BulkAction | ''>('');
  const [value, setValue] = useState({ department_id: '', job_role: 'general', target_level: '', target_date: '' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<BulkResponse | null>(null);
  const reset = () => { setConfirming(false); setError(''); };
  async function apply() {
    if (!action) return;
    setBusy(true); setError('');
    try {
      const body: Record<string, unknown> = { action, ids: selected.map((row) => row.id) };
      if (action === 'department') body.department_id = value.department_id || null;
      if (action === 'job_role') body.job_role = value.job_role;
      if (action === 'target') {
        if (value.target_level) body.target_level = value.target_level;
        if (value.target_date) body.target_date = value.target_date;
      }
      const response = await api<BulkResponse>(`orgs/${orgId}/people/bulk`, { method: 'POST', body, timeoutMs: 120000 });
      setResult(response);
      setConfirming(false);
      setAction('');
      onClear();
      await onDone();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const ready = action && (action !== 'target' || value.target_level || value.target_date);
  /** The list HR already sees, as a file: membership and the level estimate, nothing about learning. */
  function exportChosen() {
    const head = ['name', 'email', 'department', 'job_role', 'role', 'status', 'seat', 'level'];
    const names = new Map(departments.map((row) => [row.id, row.name]));
    const rows = selected.map((row) => [row.full_name, row.email, names.get(row.department_id ?? '') ?? '', row.job_role, row.role, row.status, row.seat ? 'yes' : 'no', row.level ?? '']);
    download('schood-company-people.csv', [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n'));
  }
  const newLinks = result?.results.filter((row) => row.link) ?? [];
  function exportLinks() {
    const rows = newLinks.map((row) => [row.name, row.email, row.link]);
    download('schood-company-new-links.csv', [['name', 'email', 'link'], ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n'));
  }
  const failedRows = result?.results.filter((row) => !row.ok) ?? [];
  const reason = (code: string | undefined) => {
    if (code === 'seats_full') return t('people.bulk.noSeats');
    const key = `people.error.${code}` as AppKey;
    return key in en ? t(key) : t('error.internal_error');
  };
  return <>
    {result && <div className="people-bulk-result" role="status">
      <div className="people-panel-head">
        <p><strong>{t('people.bulk.done', { changed: result.changed, failed: result.failed })}</strong></p>
        <button type="button" className="quiet" onClick={() => setResult(null)}>{t('common.close')}</button>
      </div>
      {result.access_sync_failed && <p>{t('people.bulk.syncFailed')}</p>}
      {newLinks.length === 1 && <LinkResult link={newLinks[0].link!} title={t('people.invite.ready', { name: newLinks[0].name ?? '' })} message={t('people.share.personal', { company: orgName })}/>}
      {newLinks.length > 1 && <div className="company-actions"><button type="button" onClick={exportLinks}>{t('people.bulk.linksCsv', { count: newLinks.length })}</button><span className="hint">{t('people.link.once')}</span></div>}
      {failedRows.length > 0 && <div className="company-table-wrap">
        <table className="company-table">
          <thead><tr><th scope="col">{t('people.col.person')}</th><th scope="col">{t('people.bulk.why')}</th></tr></thead>
          <tbody>{failedRows.map((row) => <tr key={row.id}>
            <td>{row.name ?? '—'}</td>
            <td>{reason(row.code)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>}
    {selected.length > 0 && <section className="people-bulk" aria-label={t('people.bulk.title')}>
      <p className="people-bulk-count" role="status"><strong>{t('people.bulk.selected', { count: selected.length })}</strong> <button type="button" className="people-linkish" onClick={onClear}>{t('people.bulk.clear')}</button> · <button type="button" className="people-linkish" onClick={exportChosen}>{t('people.bulk.exportCsv')}</button></p>
      <label>{t('people.bulk.action')}<select value={action} onChange={(event) => { setAction(event.target.value as BulkAction | ''); reset(); }}>
        <option value="">—</option>
        <option value="department">{t('people.bulk.department')}</option>
        <option value="job_role">{t('people.bulk.jobRole')}</option>
        <option value="target">{t('people.bulk.target')}</option>
        {seatsActive && <option value="seat_on">{t('people.bulk.seatOn')}</option>}
        <option value="seat_off">{t('people.bulk.seatOff')}</option>
        <option value="renew_links">{t('people.bulk.renewLinks')}</option>
        <option value="remove">{t('people.bulk.remove')}</option>
      </select></label>
      {action === 'department' && <label>{t('people.field.department_id')}<select value={value.department_id} onChange={(event) => setValue({ ...value, department_id: event.target.value })}>
        <option value="">{t('people.noDepartment')}</option>
        {departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>}
      {action === 'job_role' && <label>{t('people.field.job_role')}<select value={value.job_role} onChange={(event) => setValue({ ...value, job_role: event.target.value })}>
        {JOB_ROLES.map((code) => <option key={code} value={code}>{t(`job.${code}` as AppKey)}</option>)}
      </select></label>}
      {action === 'target' && <>
        <label>{t('people.field.target_level')}<select value={value.target_level} onChange={(event) => setValue({ ...value, target_level: event.target.value })}>
          <option value="">—</option>
          {LEVELS.map((level) => <option key={level} value={level}>{t(`level.${level}` as AppKey)}</option>)}
        </select></label>
        <label>{t('people.field.target_date')}<input type="date" value={value.target_date} onChange={(event) => setValue({ ...value, target_date: event.target.value })}/></label>
      </>}
      {ready && !confirming && <button type="button" className={action === 'remove' ? 'quiet people-danger' : ''} onClick={() => setConfirming(true)}>{t('people.bulk.review')}</button>}
      {confirming && <div className="people-confirm people-bulk-confirm" role="alertdialog" aria-labelledby="people-bulk-confirm">
        <p id="people-bulk-confirm"><strong>{t(`people.bulk.confirm.${action}` as AppKey, { count: selected.length })}</strong></p>
        <p className="hint">{selected.slice(0, 6).map((row) => row.full_name || row.email || t('people.unnamed')).join(', ')}{selected.length > 6 ? ` +${selected.length - 6}` : ''}</p>
        <div className="company-actions">
          <button type="button" className={action === 'remove' ? 'people-danger-solid' : ''} disabled={busy} onClick={() => void apply()}>{busy ? t('app.loading') : t('people.bulk.apply')}</button>
          <button type="button" className="quiet" onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
        </div>
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>}
  </>;
}
