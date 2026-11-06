// Glossary admin (/w/:org/glossary-admin, HR): add, edit and delete company terms
// and import them from a CSV file exported from Excel or Google Sheets.
import React, { useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import type { Term } from './Glossary.tsx';
import { Loading, useLoad } from './lib.tsx';

const BLANK = { term: '', meaning: '', ru: '', uz: '', example: '', department_id: '' };
type Form = typeof BLANK;
const TEMPLATE = 'term,meaning,ru,uz,example,department\n"Late check-out","Leaving the room after 12:00, usually for a fee","Поздний выезд","Kech chiqish","Late check-out until 16:00 costs half of the room rate.",\n';

function TermForm({ initial, departments, busy, onSubmit, onCancel, submitLabel }: { initial: Form; departments: { id: string; name: string }[]; busy: boolean; onSubmit: (form: Form) => void; onCancel?: () => void; submitLabel: string }) {
  const t = useAppT();
  const [form, setForm] = useState(initial);
  const set = (key: keyof Form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  return <form className="training-term-form" onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit(form); }}>
    <label>{t('training.glossary.term')}<input required maxLength={120} lang="en" value={form.term} onChange={set('term')}/></label>
    <label>{t('training.glossary.meaning')}<textarea required rows={2} maxLength={400} lang="en" value={form.meaning} onChange={set('meaning')}/></label>
    <label><span>{t('training.glossary.ru')} <span className="hint">{t('common.optional')}</span></span><input maxLength={200} lang="ru" value={form.ru} onChange={set('ru')}/></label>
    <label><span>{t('training.glossary.uz')} <span className="hint">{t('common.optional')}</span></span><input maxLength={200} lang="uz" value={form.uz} onChange={set('uz')}/></label>
    <label><span>{t('training.glossary.example')} <span className="hint">{t('common.optional')}</span></span><input maxLength={400} lang="en" value={form.example} onChange={set('example')}/></label>
    <label>{t('training.glossary.department')}
      <select value={form.department_id} onChange={set('department_id')}>
        <option value="">{t('training.glossary.everyone')}</option>
        {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select>
    </label>
    <div className="company-actions">
      <button disabled={busy}>{submitLabel}</button>
      {onCancel && <button type="button" className="quiet" onClick={onCancel}>{t('common.cancel')}</button>}
    </div>
  </form>;
}

export function GlossaryAdmin() {
  const t = useAppT(), problem = useErrorText();
  const { org, departments } = useWorkspace();
  const { data, error, reload } = useLoad<{ terms: Term[]; max_terms: number }>(`orgs/${org.id}/glossary`);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [csv, setCsv] = useState('');
  const [skipped, setSkipped] = useState<{ line: number; reason: string }[]>([]);
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const terms = data?.terms ?? [];
    return needle ? terms.filter((term) => [term.term, term.meaning, term.ru, term.uz].some((value) => value?.toLowerCase().includes(needle))) : terms;
  }, [data, search]);
  if (!data) return <Loading error={error}/>;

  async function run(action: () => Promise<string>) {
    setBusy(true); setFailure(''); setNotice('');
    try {
      setNotice(await action());
      await reload();
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const body = (form: Form) => ({ ...form, department_id: form.department_id || null, ru: form.ru || null, uz: form.uz || null, example: form.example || null });
  const department = (id: string | null) => id ? departments.find((entry) => entry.id === id)?.name ?? '' : t('training.glossary.everyone');

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 300_000) { setFailure(t('training.glossary.fileTooBig')); return; }
    setCsv(await file.text());
  }

  return <div className="training-page">
    <header className="training-head">
      <h1>{t('training.admin.title')}</h1>
      <p>{t('training.admin.lead')}</p>
      <p><Link to={`/w/${org.id}/glossary`}>{t('training.admin.preview')}</Link></p>
    </header>
    {failure && <p className="error" role="alert">{failure}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}

    <div className="training-two">
      <section className="training-card" aria-labelledby="training-add">
        <h2 id="training-add">{t('training.admin.add')}</h2>
        <TermForm key={formKey} initial={BLANK} departments={departments} busy={busy} submitLabel={t('common.add')}
          onSubmit={(form) => void run(async () => {
            await api(`orgs/${org.id}/glossary`, { method: 'POST', body: body(form) });
            setFormKey(formKey + 1);
            return t('training.admin.added', { term: form.term });
          })}/>
      </section>

      <section className="training-card" aria-labelledby="training-import">
        <h2 id="training-import">{t('training.admin.import')}</h2>
        <p>{t('training.admin.importLead')}</p>
        <p><a href={`data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + TEMPLATE)}`} download="glossary-template.csv">{t('training.admin.template')}</a></p>
        <form onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const result = await api<{ added: number; updated: number; skipped: { line: number; reason: string }[] }>(`orgs/${org.id}/glossary/import`, { method: 'POST', body: { csv } });
            setSkipped(result.skipped);
            if (!result.skipped.length) setCsv('');
            return t('training.admin.imported', { added: result.added, updated: result.updated, skipped: result.skipped.length });
          });
        }}>
          <label>{t('training.admin.file')}<input type="file" accept=".csv,.txt,text/csv" onChange={(event) => void readFile(event.target.files?.[0])}/></label>
          <label>{t('training.admin.paste')}<textarea rows={5} value={csv} onChange={(event) => setCsv(event.target.value)} spellCheck={false}/></label>
          <button disabled={busy || !csv.trim()}>{t('training.admin.importButton')}</button>
        </form>
        {skipped.length > 0 && <div className="error" role="alert">
          <p>{t('training.admin.skippedTitle')}</p>
          <ul>{skipped.slice(0, 20).map((row) => <li key={row.line}>{t('training.admin.skippedRow', { line: row.line, reason: row.reason === 'department' ? t('training.admin.reasonDepartment') : row.reason === 'full' ? t('training.admin.reasonFull') : t('training.admin.reasonField', { field: row.reason }) })}</li>)}</ul>
        </div>}
      </section>
    </div>

    <section className="training-card" aria-labelledby="training-terms">
      <h2 id="training-terms">{t('training.admin.terms', { count: data.terms.length })}</h2>
      <div className="company-toolbar"><label>{t('common.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)}/></label></div>
      {data.terms.length === 0 ? <p>{t('training.admin.empty')}</p> : <ul className="training-terms">
        {shown.map((term) => <li key={term.id}>
          {editing === term.id ? <TermForm initial={{ term: term.term, meaning: term.meaning, ru: term.ru ?? '', uz: term.uz ?? '', example: term.example ?? '', department_id: term.department_id ?? '' }}
            departments={departments} busy={busy} submitLabel={t('common.save')} onCancel={() => setEditing(null)}
            onSubmit={(form) => void run(async () => {
              await api(`orgs/${org.id}/glossary/${term.id}`, { method: 'PATCH', body: body(form) });
              setEditing(null);
              return t('common.saved');
            })}/> : <>
            <div><strong lang="en">{term.term}</strong> <span className="company-badge">{department(term.department_id)}</span></div>
            <p lang="en">{term.meaning}</p>
            {(term.ru || term.uz) && <p>{[term.ru, term.uz].filter(Boolean).join(' · ')}</p>}
            {term.example && <p className="hint" lang="en">“{term.example}”</p>}
            <div className="company-actions">
              <button type="button" className="quiet" onClick={() => setEditing(term.id)}>{t('common.edit')}<span className="visually-hidden"> {term.term}</span></button>
              <button type="button" className="quiet" disabled={busy} onClick={() => { if (confirm(t('training.admin.deleteConfirm', { term: term.term }))) void run(async () => { await api(`orgs/${org.id}/glossary/${term.id}`, { method: 'DELETE' }); return t('training.admin.deleted', { term: term.term }); }); }}>{t('common.delete')}<span className="visually-hidden"> {term.term}</span></button>
            </div>
          </>}
        </li>)}
      </ul>}
    </section>
  </div>;
}
