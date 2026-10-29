// CSV import: paste or choose a file, check every row, import the valid ones,
// then download the personal links as a CSV to send out.
import React, { useState, type ChangeEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import type { ImportResult } from './types.ts';
import { csvCell, download, useDates, useProblem } from './ui.tsx';

const TEMPLATE = 'name,email,department,job_role,role\nMalika Yusupova,malika@example.uz,Front office,hospitality,employee\nTimur Sadykov,,Sales,sales,manager\n';
const MAX_BYTES = 400_000;

export function ImportPanel({ orgId, onDone, onClose }: { orgId: string; onDone: () => void; onClose: () => void }) {
  const t = useAppT(), problem = useProblem(), { day } = useDates();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) { setError(t('people.import.tooBig')); return; }
    setCsv(await file.text());
    setPreview(null); setResult(null); setError('');
  }
  async function check() {
    setBusy(true); setError(''); setResult(null);
    try {
      setPreview(await api<ImportResult>(`orgs/${orgId}/people/import`, { method: 'POST', body: { csv, dry_run: true } }));
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true); setError('');
    try {
      const done = await api<ImportResult>(`orgs/${orgId}/people/import`, { method: 'POST', body: { csv, dry_run: false } });
      setResult(done); setPreview(null); setCsv('');
      onDone();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  function saveLinks() {
    if (!result?.created) return;
    const header = ['name', 'email', 'department', 'job_role', 'role', 'link'].join(',');
    const lines = result.created.map((row) => [row.name, row.email, row.department, row.job_role, row.role, row.link].map(csvCell).join(','));
    download(`schood-invitations-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...lines].join('\n') + '\n');
  }

  return <section className="people-panel" aria-labelledby="import-title">
    <div className="people-panel-head">
      <h2 id="import-title">{t('people.import.title')}</h2>
      <button type="button" className="quiet" onClick={onClose}>{t('common.close')}</button>
    </div>
    <p className="hint">{t('people.import.lead')}</p>
    <p className="hint"><button type="button" className="people-linkish" onClick={() => download('schood-people-template.csv', TEMPLATE)}>{t('people.import.template')}</button></p>

    {result?.created ? <div className="people-link-result" role="status">
      <p className="people-link-title"><strong>{t('people.import.done', { count: result.created.length })}</strong></p>
      <p className="hint">{t('people.import.doneLead', { date: day(result.expires_at) })}</p>
      <div className="company-actions">
        <button type="button" onClick={saveLinks}>{t('people.import.downloadLinks')}</button>
        <button type="button" className="quiet" onClick={() => setResult(null)}>{t('people.import.another')}</button>
      </div>
      {result.new_departments.length > 0 && <p className="hint">{t('people.import.departmentsCreated', { names: result.new_departments.join(', ') })}</p>}
    </div> : <>
      <div className="people-form-grid">
        <label className="people-span">{t('people.import.file')}<input type="file" accept=".csv,text/csv,text/plain" onChange={(event) => void pick(event)}/></label>
        <label className="people-span">{t('people.import.paste')}<textarea rows={6} spellCheck={false} value={csv} placeholder={TEMPLATE} onChange={(event) => { setCsv(event.target.value); setPreview(null); }}/></label>
      </div>
      <div className="company-actions">
        <button type="button" disabled={busy || !csv.trim()} onClick={() => void check()}>{busy && !preview ? t('app.loading') : t('people.import.check')}</button>
        {preview && preview.valid > 0 && <button type="button" disabled={busy} onClick={() => void commit()}>{t('people.import.submit', { count: preview.valid })}</button>}
      </div>
    </>}

    {preview?.rows && <div className="people-import-preview">
      <p role="status"><strong>{t('people.import.summary', { valid: preview.valid, invalid: preview.invalid })}</strong>{preview.header ? '' : ` ${t('people.import.noHeader')}`}</p>
      {preview.new_departments.length > 0 && <p className="hint">{t('people.import.newDepartments', { names: preview.new_departments.join(', ') })}</p>}
      <div className="company-table-wrap">
        <table className="company-table">
          <thead><tr>
            <th scope="col">{t('people.import.line')}</th><th scope="col">{t('people.field.full_name')}</th><th scope="col">{t('people.field.email')}</th>
            <th scope="col">{t('people.field.department_id')}</th><th scope="col">{t('people.field.job_role')}</th><th scope="col">{t('people.field.role')}</th><th scope="col">{t('people.import.check')}</th>
          </tr></thead>
          <tbody>{preview.rows.map((row) => <tr key={row.line} className={row.error ? 'people-row-bad' : ''}>
            <td>{row.line}</td>
            <td>{row.name || '—'}</td>
            <td>{row.email ?? '—'}</td>
            <td>{row.department ?? '—'}{row.department_new && !row.error && <span className="company-badge">{t('people.import.new')}</span>}</td>
            <td>{row.job_role ? t(`job.${row.job_role}` as AppKey) : '—'}</td>
            <td>{row.role ? t(`role.${row.role}` as AppKey) : '—'}</td>
            <td>{row.error ? <span className="company-badge bad">{t(`people.import.error.${row.error}` as AppKey)}</span> : <span className="company-badge good">{t('people.import.ok')}</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
