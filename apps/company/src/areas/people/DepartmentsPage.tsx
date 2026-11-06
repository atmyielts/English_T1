// /w/:org/departments — create, rename and delete departments (HR).
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import type { DepartmentStats } from './types.ts';
import { useProblem } from './ui.tsx';

type Stats = { people: number; invited: number; seats: number };

export function DepartmentsPage() {
  const t = useAppT(), problem = useProblem();
  const workspace = useWorkspace();
  const { org } = workspace;
  const [data, setData] = useState<{ departments: DepartmentStats[]; unassigned: Stats } | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const editable = org.status !== 'suspended' && org.status !== 'closed';
  const load = useCallback(async () => {
    try {
      setData(await api(`orgs/${org.id}/departments`));
    } catch (cause) {
      setError(problem(cause));
    }
  }, [org.id]);
  useEffect(() => { void load(); }, [load]);
  const changed = async (message: string) => {
    setNotice(message);
    await Promise.all([load(), workspace.refresh()]);
  };
  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api(`orgs/${org.id}/departments`, { method: 'POST', body: { name } });
      await changed(t('people.departments.added', { name: name.trim() }));
      setName('');
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>;
  return <div className="people">
    <header className="page-heading">
      <div>
        <p className="eyebrow">{t('nav.section.people')}</p>
        <h1>{t('people.departments.title')}</h1>
        <p className="people-sub">{t('people.departments.lead')}</p>
      </div>
    </header>
    {notice && <p className="notice" role="status">{notice}</p>}
    {editable && <form className="people-inline-form" onSubmit={add}>
      <label>{t('people.departments.new')}<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('people.departments.placeholder')}/></label>
      <button disabled={busy || !name.trim()}>{t('common.add')}</button>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    {data.departments.length === 0 ? <p className="people-empty">{t('people.departments.empty')}</p> : <ul className="people-departments">
      {data.departments.map((row) => <DepartmentLine key={row.id} row={row} editable={editable} onChanged={changed} onError={setError}/>)}
    </ul>}
    <p className="hint people-unassigned">{t('people.departments.unassigned', { count: data.unassigned.people + data.unassigned.invited })} <Link to={`/w/${org.id}/people`}>{t('people.departments.openPeople')}</Link></p>
  </div>;
}

function DepartmentLine({ row, editable, onChanged, onError }: { row: DepartmentStats; editable: boolean; onChanged: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const t = useAppT(), problem = useProblem();
  const { org } = useWorkspace();
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [name, setName] = useState(row.name);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); onError('');
    try {
      await action();
      setMode('view');
      await onChanged(message);
    } catch (cause) {
      onError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const total = row.people + row.invited;
  return <li>
    {mode === 'rename' ? <form className="people-inline-form" onSubmit={(event) => { event.preventDefault(); void run(() => api(`orgs/${org.id}/departments/${row.id}`, { method: 'PATCH', body: { name } }), t('people.departments.renamed', { name: name.trim() })); }}>
      <label>{t('people.departments.rename', { name: row.name })}<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} autoFocus/></label>
      <button disabled={busy}>{t('common.save')}</button>
      <button type="button" className="quiet" onClick={() => { setMode('view'); setName(row.name); }}>{t('common.cancel')}</button>
    </form> : <div className="people-department-line">
      <div>
        <strong>{row.name}</strong>
        <span>{t('people.departments.counts', { people: row.people, invited: row.invited, seats: row.seats })}</span>
      </div>
      <div className="company-actions">
        <Link className="button-link quiet" to={`/w/${org.id}/people?department=${row.id}`}>{t('people.departments.view')}</Link>
        {editable && <button type="button" className="quiet" onClick={() => setMode('rename')}>{t('people.departments.renameButton')}</button>}
        {editable && <button type="button" className="quiet people-danger" onClick={() => setMode('delete')}>{t('common.delete')}</button>}
      </div>
    </div>}
    {mode === 'delete' && <div className="people-confirm" role="alertdialog" aria-labelledby={`delete-${row.id}`}>
      <p id={`delete-${row.id}`}><strong>{t('people.departments.deleteTitle', { name: row.name })}</strong> {total ? t('people.departments.deleteMoves', { count: total }) : ''} {t('people.departments.deleteNote')}</p>
      <div className="company-actions">
        <button type="button" className="people-danger-solid" disabled={busy} onClick={() => void run(() => api(`orgs/${org.id}/departments/${row.id}`, { method: 'DELETE' }), t('people.departments.deleted', { name: row.name }))}>{t('common.delete')}</button>
        <button type="button" className="quiet" onClick={() => setMode('view')}>{t('common.cancel')}</button>
      </div>
    </div>}
  </li>;
}
