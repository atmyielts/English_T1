// /w/:org/people — everyone in the workspace. HR invites (one person, CSV, team
// links), edits, seats and removes; a manager sees their own department read-only.
import React, { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { JOB_ROLES, LEVEL_LABEL, LEVELS, type Level } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { ImportPanel } from './ImportPanel.tsx';
import { TeamLinksPanel } from './TeamLinks.tsx';
import type { PeopleList, PersonRow } from './types.ts';
import { LinkResult, Meter, useDates, useProblem } from './ui.tsx';

type Panel = 'invite' | 'import' | 'links' | null;
type Filters = { q: string; department: string; role: string; level: string; seat: string; status: string };
const NO_FILTERS: Filters = { q: '', department: '', role: '', level: '', seat: '', status: '' };

export function PeoplePage() {
  const t = useAppT(), problem = useProblem();
  const workspace = useWorkspace();
  const { org } = workspace;
  const [data, setData] = useState<PeopleList | null>(null);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const { query } = useLocation();
  const [filters, setFilters] = useState<Filters>(() => ({ ...NO_FILTERS, department: query.get('department') ?? '' }));
  const [notice, setNotice] = useState('');
  const showRemoved = filters.status === 'removed';
  const load = useCallback(async () => {
    try {
      setData(await api<PeopleList>(`orgs/${org.id}/people${showRemoved ? '?removed=1' : ''}`));
      setError('');
    } catch (cause) {
      setError(problem(cause));
    }
  }, [org.id, showRemoved]);
  useEffect(() => { void load(); }, [load]);

  const editable = Boolean(data?.can_edit) && org.status !== 'suspended' && org.status !== 'closed';
  const departmentName = useMemo(() => new Map((data?.departments ?? []).map((row) => [row.id, row.name])), [data]);
  const shown = useMemo(() => {
    if (!data) return [];
    const q = filters.q.trim().toLowerCase();
    return data.members.filter((row) =>
      (!q || `${row.full_name ?? ''} ${row.email ?? ''}`.toLowerCase().includes(q))
      && (!filters.department || (filters.department === 'none' ? !row.department_id : row.department_id === filters.department))
      && (!filters.role || row.role === filters.role)
      && (!filters.level || (filters.level === 'none' ? !row.level : row.level === filters.level))
      && (!filters.seat || (filters.seat === 'yes') === row.seat)
      && (!filters.status || row.status === filters.status));
  }, [data, filters]);

  if (error && !data) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p role="status">{t('app.loading')}</p>;
  const active = data.members.filter((row) => row.status === 'active').length;
  const invited = data.members.filter((row) => row.status === 'invited').length;
  const filtered = Object.values(filters).some(Boolean);
  const set = (key: keyof Filters) => (event: { target: { value: string } }) => setFilters({ ...filters, [key]: event.target.value });
  const toggle = (next: Panel) => { setPanel(panel === next ? null : next); setNotice(''); };
  const changed = async (message?: string) => {
    if (message) setNotice(message);
    await Promise.all([load(), workspace.refresh()]);
  };

  return <div className="people">
    <header className="page-heading people-heading">
      <div>
        <p className="eyebrow">{t('nav.section.people')}</p>
        <h1>{t('people.title')}</h1>
        <p className="people-sub">{t('people.summary', { active, invited })}{data.scope === 'department' ? ` · ${t('people.scopeDepartment')}` : ''}</p>
      </div>
      {editable && <div className="company-actions people-heading-actions">
        <button type="button" aria-expanded={panel === 'invite'} onClick={() => toggle('invite')}>{t('people.action.invite')}</button>
        <button type="button" className="quiet" aria-expanded={panel === 'import'} onClick={() => toggle('import')}>{t('people.action.import')}</button>
        <button type="button" className="quiet" aria-expanded={panel === 'links'} onClick={() => toggle('links')}>{t('people.action.links')}</button>
      </div>}
    </header>

    {data.usage && <div className="people-usage">
      <Meter label={t('people.usage.seats')} used={data.usage.seats_used} limit={data.usage.seats_limit} unlimited={t('people.usage.unlimited')}/>
      <Meter label={t('people.usage.tests')} used={data.usage.tests_used} limit={data.usage.tests_limit} unlimited={t('people.usage.unlimited')}/>
      {data.status !== 'active' && <p className="hint">{t('people.usage.pilotSeats')}</p>}
    </div>}

    {notice && <p className="notice" role="status">{notice}</p>}
    {editable && data.members.length <= 3 && !panel && <GettingStarted orgId={org.id} departments={data.departments.length} people={data.members.length} links={data.links.length} onPanel={setPanel}/>}
    {panel === 'invite' && <InvitePanel data={data} onDone={() => changed()} onClose={() => setPanel(null)}/>}
    {panel === 'import' && <ImportPanel orgId={org.id} onDone={() => changed()} onClose={() => setPanel(null)}/>}
    {panel === 'links' && <TeamLinksPanel orgId={org.id} orgName={org.name} links={data.links} departments={data.departments} onChange={() => changed()} onClose={() => setPanel(null)}/>}

    <section className="people-list" aria-labelledby="people-list-title">
      <h2 id="people-list-title" className="visually-hidden">{t('people.title')}</h2>
      <div className="company-toolbar people-toolbar" role="search">
        <label className="people-search">{t('common.search')}<input type="search" value={filters.q} onChange={set('q')} placeholder={t('people.filter.searchHint')}/></label>
        <label>{t('people.field.department_id')}<select value={filters.department} onChange={set('department')}>
          <option value="">{t('common.all')}</option>
          <option value="none">{t('people.noDepartment')}</option>
          {data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
        <label>{t('people.field.role')}<select value={filters.role} onChange={set('role')}>
          <option value="">{t('common.all')}</option>
          {(['owner', 'admin', 'manager', 'employee'] as const).map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}
        </select></label>
        <label>{t('people.field.level')}<select value={filters.level} onChange={set('level')}>
          <option value="">{t('common.all')}</option>
          <option value="none">{t('level.none')}</option>
          {LEVELS.map((level) => <option key={level} value={level}>{t(`level.${level}` as AppKey)}</option>)}
        </select></label>
        <label>{t('people.field.seat')}<select value={filters.seat} onChange={set('seat')}>
          <option value="">{t('common.all')}</option>
          <option value="yes">{t('people.seat.with')}</option>
          <option value="no">{t('people.seat.without')}</option>
        </select></label>
        <label>{t('people.field.status')}<select value={filters.status} onChange={set('status')}>
          <option value="">{t('people.status.current')}</option>
          <option value="active">{t('people.status.active')}</option>
          <option value="invited">{t('people.status.invited')}</option>
          {data.can_edit && <option value="removed">{t('people.status.removed')}</option>}
        </select></label>
        {filtered && <button type="button" className="quiet" onClick={() => setFilters(NO_FILTERS)}>{t('people.filter.clear')}</button>}
      </div>
      <p className="hint people-count" role="status">{t('people.shown', { count: shown.length, total: data.members.length })}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {shown.length === 0 ? <p className="people-empty">{filtered ? t('people.empty.filtered') : t('people.empty.none')}</p>
        : <div className="company-table-wrap people-table-wrap">
          <table className="company-table people-table">
            <thead><tr>
              <th scope="col">{t('people.col.person')}</th>
              <th scope="col">{t('people.field.department_id')}</th>
              <th scope="col">{t('people.field.role')}</th>
              <th scope="col">{t('people.field.level')}</th>
              <th scope="col">{t('people.field.seat')}</th>
              <th scope="col">{t('people.field.status')}</th>
              {editable && <th scope="col"><span className="visually-hidden">{t('people.col.actions')}</span></th>}
            </tr></thead>
            <tbody>{shown.map((row) => <PersonLine key={row.id} row={row} data={data} editable={editable} departmentName={departmentName.get(row.department_id ?? '') ?? null} onChanged={changed}/>)}</tbody>
          </table>
        </div>}
    </section>
  </div>;
}

function GettingStarted({ orgId, departments, people, links, onPanel }: { orgId: string; departments: number; people: number; links: number; onPanel: (panel: Panel) => void }) {
  const t = useAppT();
  return <aside className="people-start" aria-labelledby="people-start-title">
    <h2 id="people-start-title">{t('people.start.title')}</h2>
    <ol>
      <li className={departments ? 'done' : ''}><Link to={`/w/${orgId}/departments`}>{t('people.start.departments')}</Link></li>
      <li className={people > 1 || links ? 'done' : ''}><button type="button" className="people-linkish" onClick={() => onPanel('links')}>{t('people.start.link')}</button> · <button type="button" className="people-linkish" onClick={() => onPanel('import')}>{t('people.start.import')}</button></li>
      <li><Link to={`/w/${orgId}/hiring`}>{t('people.start.test')}</Link></li>
    </ol>
  </aside>;
}

function InvitePanel({ data, onDone, onClose }: { data: PeopleList; onDone: () => void; onClose: () => void }) {
  const t = useAppT(), problem = useProblem();
  const { org, member, staff } = useWorkspace();
  const blank = { full_name: '', email: '', role: 'employee', department_id: '', job_role: 'general', target_level: '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<{ link: string; name: string } | null>(null);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const roles = (staff || member?.role === 'owner' ? ['employee', 'manager', 'admin', 'owner'] : ['employee', 'manager', 'admin']) as ('employee' | 'manager' | 'admin' | 'owner')[];
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const body = { kind: 'personal', ...form, email: form.email || null, department_id: form.department_id || null, target_level: form.target_level || null };
      const response = await api<{ link: string }>(`orgs/${org.id}/invites`, { method: 'POST', body });
      setResult({ link: response.link, name: form.full_name });
      setForm({ ...blank, role: form.role, department_id: form.department_id, job_role: form.job_role });
      onDone();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <section className="people-panel" aria-labelledby="invite-title">
    <div className="people-panel-head">
      <h2 id="invite-title">{t('people.invite.title')}</h2>
      <button type="button" className="quiet" onClick={onClose}>{t('common.close')}</button>
    </div>
    <p className="hint">{t('people.invite.lead')}</p>
    {result && <LinkResult link={result.link} title={t('people.invite.ready', { name: result.name })} message={t('people.share.personal', { company: org.name })}/>}
    <form onSubmit={submit} className="people-form-grid">
      <label>{t('people.field.full_name')}<input required minLength={2} maxLength={120} autoComplete="off" value={form.full_name} onChange={set('full_name')}/></label>
      <label><span>{t('people.field.email')} <span className="people-optional">{t('common.optional')}</span></span><input type="email" maxLength={200} autoComplete="off" value={form.email} onChange={set('email')}/></label>
      <label>{t('people.field.role')}<select value={form.role} onChange={set('role')}>{roles.map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}</select></label>
      <label>{t('people.field.department_id')}<select value={form.department_id} onChange={set('department_id')}>
        <option value="">{t('people.noDepartment')}</option>
        {data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <label>{t('people.field.job_role')}<select value={form.job_role} onChange={set('job_role')}>{JOB_ROLES.map((code) => <option key={code} value={code}>{t(`job.${code}` as AppKey)}</option>)}</select></label>
      <label><span>{t('people.field.target_level')} <span className="people-optional">{t('common.optional')}</span></span><select value={form.target_level} onChange={set('target_level')}>
        <option value="">—</option>
        {LEVELS.map((level) => <option key={level} value={level}>{t(`level.${level}` as AppKey)}</option>)}
      </select></label>
      <div className="people-form-actions"><button disabled={busy}>{busy ? t('app.loading') : t('people.invite.submit')}</button></div>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

function PersonLine({ row, data, editable, departmentName, onChanged }: { row: PersonRow; data: PeopleList; editable: boolean; departmentName: string | null; onChanged: (message?: string) => Promise<void> }) {
  const t = useAppT(), problem = useProblem(), { day } = useDates();
  const { org, member: me, staff } = useWorkspace();
  const [mode, setMode] = useState<'view' | 'edit' | 'remove'>('view');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const canOwners = staff || me?.role === 'owner';
  const ownerLocked = row.role === 'owner' && !canOwners;
  const removed = row.status === 'removed';
  const name = row.full_name || row.email || t('people.unnamed');
  async function run(action: () => Promise<unknown>, message?: string) {
    setBusy(true); setError('');
    try {
      await action();
      setMode('view');
      await onChanged(message);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const seat = () => run(() => api(`orgs/${org.id}/people/${row.id}/seat`, { method: 'POST', body: { seat: !row.seat } }), row.seat ? t('people.seat.offDone', { name }) : t('people.seat.onDone', { name }));
  const renew = () => run(async () => {
    const response = await api<{ link: string }>(`orgs/${org.id}/invites/${row.invite!.id}/renew`, { method: 'POST' });
    setLink(response.link);
  });
  const seatsActive = data.status === 'active';
  const cols = editable ? 7 : 6;
  return <>
    <tr className={removed ? 'people-removed' : ''}>
      <td data-label={t('people.col.person')}>
        <strong className="people-name">{name}{me && row.id === me.id ? ` · ${t('people.you')}` : ''}</strong>
        {row.email && row.full_name && <span className="people-email">{row.email}</span>}
        <span className="people-job">{t(`job.${row.job_role}` as AppKey)}</span>
      </td>
      <td data-label={t('people.field.department_id')}>{departmentName ?? <span className="people-muted">{t('people.noDepartment')}</span>}</td>
      <td data-label={t('people.field.role')}>{t(`role.${row.role}` as AppKey)}</td>
      <td data-label={t('people.field.level')}>
        {row.level ? <span className="company-badge" title={t(`level.${row.level}` as AppKey)}>{LEVEL_LABEL[row.level as Level]}</span> : <span className="people-muted">{t('level.none')}</span>}
        {row.target_level && <span className="people-target">{t('people.target', { level: LEVEL_LABEL[row.target_level as Level] })}{row.target_date ? ` · ${day(row.target_date)}` : ''}</span>}
      </td>
      <td data-label={t('people.field.seat')}>
        {editable && !removed ? <button type="button" className={`people-seat ${row.seat ? 'on' : ''}`} role="switch" aria-checked={row.seat} disabled={busy || (!row.seat && !seatsActive)}
          title={!row.seat && !seatsActive ? t('people.usage.pilotSeats') : undefined}
          aria-label={t('people.seat.toggle', { name })} onClick={() => void seat()}>
          <span aria-hidden="true"/>{row.seat ? t('people.seat.on') : t('people.seat.off')}
        </button> : row.seat ? <span className="company-badge good">{t('people.seat.on')}</span> : <span className="people-muted">—</span>}
      </td>
      <td data-label={t('people.field.status')}>
        <span className={`company-badge ${row.status === 'active' ? 'good' : row.status === 'invited' ? 'warn' : 'bad'}`}>{t(`people.status.${row.status}` as AppKey)}</span>
        {row.status === 'active' && !row.consent_at && row.role !== 'owner' && row.role !== 'admin' && <span className="people-muted people-consent">{t('people.noConsent')}</span>}
        {row.invite && <span className="people-muted people-consent">{row.invite.state === 'open' ? t('people.inviteUntil', { date: day(row.invite.expires_at) }) : t(`people.inviteState.${row.invite.state}` as AppKey)}</span>}
      </td>
      {editable && <td className="people-row-actions">
        {!removed && <div className="company-actions">
          <button type="button" className="quiet" aria-expanded={mode === 'edit'} onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}>{t('common.edit')}</button>
          {row.invite && <button type="button" className="quiet" disabled={busy} onClick={() => void renew()}>{t('people.action.newLink')}</button>}
          {!ownerLocked && <button type="button" className="quiet people-danger" onClick={() => setMode('remove')}>{t('common.remove')}</button>}
        </div>}
      </td>}
    </tr>
    {(mode !== 'view' || error || link) && <tr className="people-detail-row"><td colSpan={cols}>
      {link && <LinkResult link={link} title={t('people.invite.ready', { name })} message={t('people.share.personal', { company: org.name })}/>}
      {mode === 'edit' && <EditPerson row={row} data={data} canOwners={canOwners} busy={busy} onCancel={() => setMode('view')}
        onSave={(body) => run(() => api(`orgs/${org.id}/people/${row.id}`, { method: 'PATCH', body }), t('people.edit.saved', { name }))}/>}
      {mode === 'remove' && <div className="people-confirm" role="alertdialog" aria-labelledby={`remove-${row.id}`}>
        <p id={`remove-${row.id}`}><strong>{t('people.remove.title', { name })}</strong> {t('people.remove.body')}</p>
        <div className="company-actions">
          <button type="button" className="people-danger-solid" disabled={busy} onClick={() => void run(() => api(`orgs/${org.id}/people/${row.id}`, { method: 'DELETE' }), t('people.remove.done', { name }))}>{t('people.remove.confirm')}</button>
          <button type="button" className="quiet" onClick={() => setMode('view')}>{t('common.cancel')}</button>
        </div>
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
    </td></tr>}
  </>;
}

function EditPerson({ row, data, canOwners, busy, onSave, onCancel }: { row: PersonRow; data: PeopleList; canOwners: boolean; busy: boolean; onSave: (body: Record<string, unknown>) => void; onCancel: () => void }) {
  const t = useAppT();
  const [form, setForm] = useState({
    full_name: row.full_name ?? '', email: row.email ?? '', role: row.role, department_id: row.department_id ?? '', job_role: row.job_role,
    target_level: row.target_level ?? '', target_date: row.target_date ?? '',
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const roleLocked = row.role === 'owner' && !canOwners;
  const roles = canOwners ? ['owner', 'admin', 'manager', 'employee'] : ['admin', 'manager', 'employee'];
  function submit(event: FormEvent) {
    event.preventDefault();
    const body: Record<string, unknown> = {
      full_name: form.full_name || null, department_id: form.department_id || null, job_role: form.job_role,
      target_level: form.target_level || null, target_date: form.target_date || null,
    };
    if (!roleLocked && form.role !== row.role) body.role = form.role;
    if (row.status === 'invited' && form.email !== (row.email ?? '')) body.email = form.email || null;
    onSave(body);
  }
  return <form className="people-form-grid people-edit" onSubmit={submit} aria-label={t('people.edit.title', { name: row.full_name ?? row.email ?? '' })}>
    <label>{t('people.field.full_name')}<input maxLength={120} value={form.full_name} onChange={set('full_name')}/></label>
    {row.status === 'invited' && <label>{t('people.field.email')}<input type="email" maxLength={200} value={form.email} onChange={set('email')}/></label>}
    <label>{t('people.field.role')}<select value={form.role} onChange={set('role')} disabled={roleLocked}>
      {roleLocked && <option value="owner">{t('role.owner')}</option>}
      {roles.map((role) => <option key={role} value={role}>{t(`role.${role}` as AppKey)}</option>)}
    </select></label>
    <label>{t('people.field.department_id')}<select value={form.department_id} onChange={set('department_id')}>
      <option value="">{t('people.noDepartment')}</option>
      {data.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
    </select></label>
    <label>{t('people.field.job_role')}<select value={form.job_role} onChange={set('job_role')}>{JOB_ROLES.map((code) => <option key={code} value={code}>{t(`job.${code}` as AppKey)}</option>)}</select></label>
    <label>{t('people.field.target_level')}<select value={form.target_level} onChange={set('target_level')}>
      <option value="">—</option>
      {LEVELS.map((level) => <option key={level} value={level}>{t(`level.${level}` as AppKey)}</option>)}
    </select></label>
    <label>{t('people.field.target_date')}<input type="date" value={form.target_date} onChange={set('target_date')}/></label>
    <div className="people-form-actions">
      <button disabled={busy}>{t('common.save')}</button>
      <button type="button" className="quiet" onClick={onCancel}>{t('common.cancel')}</button>
    </div>
  </form>;
}
