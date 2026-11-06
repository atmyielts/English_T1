// Import from an HR or hiring system: paste or choose a file, say which column is which,
// see what would change, apply. The text stays in this page until "show what would change".
import React, { useEffect, useRef, useState } from 'react';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { useWorkspace } from '../../session.tsx';
import { Page, saveFile, send, Status, useAction, useLoad, useOrgPath } from './shared.tsx';

type Field = 'name' | 'first_name' | 'last_name' | 'email' | 'department' | 'job_role' | 'role';
const MAX_FILE = 400_000;
interface Row { line: number; name: string; email: string | null; department: string | null; job_role: string; changes?: Record<string, { from: unknown; to: unknown }> }
interface Plan {
  headers: string[]; mapping: Partial<Record<Field, string>>; add: Row[]; update: Row[]; unchanged: number; errors: { line: number; name: string; code: string }[]; missing: { id: string; name: string; email: string }[];
  new_departments: string[]; unknown_titles: string[]; too_many: boolean; total_rows: number; add_total: number; update_total: number; error_total: number;
}
interface Remembered { remembered: { mapping?: Partial<Record<Field, string>>; job_role_map?: Record<string, string>; has_header?: boolean }; fields: Field[]; job_roles: string[]; max_rows: number }
interface Done { added: number; updated: number; skipped: number; links: { name: string; email: string | null; link: string }[]; links_csv: string }

export function ImportPage() {
  const t = useAppT();
  const { org, refresh } = useWorkspace();
  const path = useOrgPath(org.id);
  const { data: start, error: loadError } = useLoad<Remembered>(path('import'));
  const { busy, error, run, setError } = useAction();
  const [text, setText] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Partial<Record<Field, string>>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<{ plan: Plan; fingerprint: string } | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  // Once HR has touched a column the page sends its choices; until then the server suggests.
  const chose = useRef(false);

  useEffect(() => {
    if (start?.remembered.has_header === false) setHasHeader(false);
    if (start?.remembered.job_role_map) setTitles(start.remembered.job_role_map);
  }, [start]);

  const preview = (columns: Partial<Record<Field, string>> | null) => run(
    () => send<{ plan: Plan; fingerprint: string }>(path('import/preview'), 'POST', { text, has_header: hasHeader, job_role_map: titles, ...(columns ? { mapping: columns } : {}) }),
    (result) => { setPlan(result); setMapping(result.plan.mapping); },
  );
  const check = (event?: React.FormEvent) => {
    event?.preventDefault();
    return preview(chose.current ? mapping : null);
  };
  function choose(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE) { setError(t('connect.import.fileTooLarge')); return; }
    file.text().then(setText, () => setError(t('connect.import.fileFailed')));
  }
  // Choosing a column makes a new plan straight away.
  const setColumn = (field: Field, column: string) => {
    chose.current = true;
    const next = { ...mapping };
    if (column) next[field] = column; else delete next[field];
    setMapping(next);
    void preview(next);
  };
  const apply = () => run(() => send<Done>(path('import/apply'), 'POST', { text, has_header: hasHeader, job_role_map: titles, mapping, fingerprint: plan!.fingerprint }), (result) => {
    setDone(result);
    void refresh();
  });

  if (done) return <Page title={t('connect.import.title')}>
    <section>
      <p className="notice" role="status">{t('connect.import.done', { added: done.added, updated: done.updated, skipped: done.skipped })}</p>
      {done.links.length > 0 && <div className="connect-once">
        <p><strong>{t('connect.import.linksLead')}</strong></p>
        <div className="company-actions"><button type="button" onClick={() => saveFile('invitation-links.csv', `﻿${done.links_csv}`, 'text/csv;charset=utf-8')}>{t('connect.import.downloadLinks')}</button></div>
      </div>}
      <div className="company-actions"><button type="button" className="quiet" onClick={() => { chose.current = false; setDone(null); setPlan(null); setText(''); }}>{t('connect.import.again')}</button></div>
    </section>
  </Page>;

  const current = plan?.plan;
  return <Page title={t('connect.import.title')} lead={t('connect.import.lead')}>
    {loadError && <p className="error" role="alert">{loadError}</p>}
    <section aria-labelledby="connect-import-source">
      <h2 id="connect-import-source">{t('connect.import.source')}</h2>
      <Status error={error}/>
      <form className="connect-stack" onSubmit={check}>
        <label>{t('connect.import.paste')}<textarea rows={8} required maxLength={400_000} value={text} onChange={(event) => { setText(event.target.value); setPlan(null); }}/></label>
        <label>{t('connect.import.file')}<input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={(event) => { choose(event.target.files?.[0]); setPlan(null); }}/></label>
        <label className="check"><input type="checkbox" checked={hasHeader} onChange={(event) => { setHasHeader(event.target.checked); chose.current = false; setPlan(null); }}/>{t('connect.import.hasHeader')}</label>
        <div className="company-actions"><button disabled={busy || !text.trim()}>{t('connect.import.check')}</button></div>
      </form>
    </section>
    {current && start && <>
      <section aria-labelledby="connect-import-map">
        <h2 id="connect-import-map">{t('connect.import.mapping')}</h2>
        <p className="hint">{t('connect.import.mappingLead')}</p>
        <div className="connect-grid connect-form">
          {start.fields.map((field) => <label key={field}>{t(`connect.import.field.${field}` as AppKey)}
            <select value={mapping[field] ?? ''} onChange={(event) => setColumn(field, event.target.value)}>
              <option value="">{t('connect.import.notMapped')}</option>
              {current.headers.map((header) => <option key={header} value={header}>{header}</option>)}
            </select>
          </label>)}
        </div>
      </section>
      {current.unknown_titles.length > 0 && <section aria-labelledby="connect-import-titles">
        <h2 id="connect-import-titles">{t('connect.import.titles')}</h2>
        <p className="hint">{t('connect.import.titlesLead')}</p>
        <div className="connect-grid connect-form">
          {current.unknown_titles.map((title) => <label key={title}>{title}
            <select value={titles[title] ?? 'general'} onChange={(event) => { setTitles({ ...titles, [title]: event.target.value }); }}>
              {start.job_roles.map((role) => <option key={role} value={role}>{t(`job.${role}` as AppKey)}</option>)}
            </select>
          </label>)}
        </div>
        <div className="company-actions"><button type="button" className="quiet" disabled={busy} onClick={() => void check()}>{t('connect.import.check')}</button></div>
      </section>}
      <section aria-labelledby="connect-import-summary">
        <h2 id="connect-import-summary">{t('connect.import.summary')}</h2>
        <div className="company-grid connect-stats">
          <div className="company-stat"><strong>{current.add_total}</strong><span>{t('connect.import.add')}</span></div>
          <div className="company-stat"><strong>{current.update_total}</strong><span>{t('connect.import.update')}</span></div>
          <div className="company-stat"><strong>{current.unchanged}</strong><span>{t('connect.import.unchanged')}</span></div>
          <div className="company-stat"><strong>{current.error_total}</strong><span>{t('connect.import.errors')}</span></div>
        </div>
        {current.too_many && <p className="connect-warn" role="status">{t('connect.import.tooMany', { max: start.max_rows })}</p>}
        {current.new_departments.length > 0 && <p>{t('connect.import.newDepartments', { names: current.new_departments.join(', ') })}</p>}
        {current.add.length > 0 && <>
          <h3 className="connect-h3">{t('connect.import.add')}</h3>
          <div className="company-table-wrap"><table className="company-table">
            <thead><tr><th>{t('connect.import.colName')}</th><th>{t('connect.import.colEmail')}</th><th>{t('connect.import.colDepartment')}</th><th>{t('connect.import.colJob')}</th></tr></thead>
            <tbody>{current.add.map((row) => <tr key={row.line}><td>{row.name}</td><td>{row.email ?? '—'}</td><td>{row.department ?? '—'}</td><td>{t(`job.${row.job_role}` as AppKey)}</td></tr>)}</tbody>
          </table></div>
          {current.add_total > current.add.length && <p className="hint">{t('connect.import.andMore', { count: current.add_total - current.add.length })}</p>}
        </>}
        {current.update.length > 0 && <>
          <h3 className="connect-h3">{t('connect.import.update')}</h3>
          <div className="company-table-wrap"><table className="company-table">
            <thead><tr><th>{t('connect.import.colName')}</th><th>{t('connect.import.colChange')}</th></tr></thead>
            <tbody>{current.update.map((row) => <tr key={row.line}><td>{row.name}<br/><span className="connect-muted">{row.email}</span></td><td>{Object.entries(row.changes ?? {}).map(([field, change]) => {
              const show = (value: unknown) => field === 'job_role' && value ? t(`job.${value}` as AppKey) : String(value ?? '—');
              return <div key={field}>{show(change.from)} → <strong>{show(change.to)}</strong></div>;
            })}</td></tr>)}</tbody>
          </table></div>
        </>}
        {current.errors.length > 0 && <>
          <h3 className="connect-h3">{t('connect.import.errors')}</h3>
          <div className="company-table-wrap"><table className="company-table">
            <thead><tr><th>{t('connect.import.colLine')}</th><th>{t('connect.import.colName')}</th><th>{t('connect.import.colProblem')}</th></tr></thead>
            <tbody>{current.errors.map((row) => <tr key={row.line}><td>{row.line}</td><td>{row.name || '—'}</td><td>{t(`connect.import.error.${row.code}` as AppKey)}</td></tr>)}</tbody>
          </table></div>
        </>}
        {current.missing.length > 0 && <details className="connect-details">
          <summary>{t('connect.import.missing')} ({current.missing.length})</summary>
          <p className="hint">{t('connect.import.missingLead')}</p>
          <ul>{current.missing.map((row) => <li key={row.id}>{row.name} <span className="connect-muted">{row.email}</span></li>)}</ul>
        </details>}
        <Status error={error}/>
        {current.add_total + current.update_total === 0
          ? <p className="connect-empty">{t('connect.import.nothing')}</p>
          : <div className="company-actions"><button type="button" disabled={busy || current.too_many} onClick={() => void apply()}>{t('connect.import.apply', { add: current.add_total, update: current.update_total })}</button></div>}
      </section>
    </>}
  </Page>;
}
