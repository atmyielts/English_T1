import { useCallback, useState } from 'react';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { QuestionCard } from '../components/QuestionCard';
import { renderMath, RichText } from '../components/RichText';
import { adminImport, adminItemsGet, adminSetStatus, type AdminIssue, type AdminItem, type SatQuestion } from '../lib/api';
import { type ContractItem, OFFICIAL_DOMAIN_IDS, toContentRows, validateItems, type ValidationResult } from '../lib/content';
import { useAccess } from '../lib/useAccess';
import { domainLabel, skillLabel } from '../lib/labels';
import { useAppT, useErrorText, type AppKey } from '../i18n';

const PREVIEW = 20;
const mathCheck = (tex: string, display: boolean) => renderMath(tex, display) ? null : 'KaTeX parse error';
const asQuestion = (row: { id: string; type: string; data: Record<string, unknown>; metadata: Record<string, unknown> }): SatQuestion => ({
  id: row.id, type: row.type, data: row.data, metadata: row.metadata,
  section_type: row.metadata.section_type === 'math' ? 'math' : 'reading_writing', domain: (row.metadata.sat_domain ?? 'grammar') as never,
  difficulty: (['easy', 'medium', 'hard'].includes(String(row.metadata.difficulty)) ? row.metadata.difficulty : 'medium') as never,
});
const answerOf = (correct: unknown) => {
  const c = (correct ?? {}) as Record<string, unknown>;
  return Array.isArray(c.accepted) ? c.accepted.join(', ') : String(c.option_id ?? '');
};

export function AdminPage() {
  const t = useAppT();
  const errorText = useErrorText();
  const { accessToken } = useAccess();
  const [text, setText] = useState('');
  const [items, setItems] = useState<ContractItem[] | null>(null);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [list, setList] = useState<{ total: number; items: AdminItem[] } | null>(null);
  const [filters, setFilters] = useState({ status: '', domain: '', q: '' });

  const validate = (source: string) => {
    setNotice(null); setError(null); setParseError(null);
    try {
      const parsed: unknown = JSON.parse(source);
      setItems(Array.isArray(parsed) ? parsed as ContractItem[] : null);
      setResult(validateItems(parsed, mathCheck));
    } catch (failure) {
      setItems(null); setResult(null);
      setParseError(t('admin.parseError', { message: failure instanceof Error ? failure.message : String(failure) }));
    }
  };
  const importAll = async (status: 'draft' | 'published') => {
    if (!accessToken || !items || !result || result.errors.length || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await adminImport(accessToken, items, status);
      setNotice(t('admin.imported', { inserted: res.inserted, updated: res.updated, status: t(status === 'draft' ? 'admin.status.draft' : 'admin.status.published') }));
      void load();
    } catch (failure) { setError(failure); } finally { setBusy(false); }
  };
  const load = useCallback(async (offset = 0) => {
    if (!accessToken) return;
    setError(null);
    try {
      const res = await adminItemsGet(accessToken, { ...filters, limit: 25, offset });
      setList(prev => offset && prev ? { total: res.total, items: [...prev.items, ...res.items] } : res);
    } catch (failure) { setError(failure); }
  }, [accessToken, filters]);
  const setStatus = async (item: AdminItem, status: 'draft' | 'published') => {
    if (!accessToken || busy) return;
    setBusy(true); setError(null);
    try {
      await adminSetStatus(accessToken, [item.id], status);
      setList(prev => prev ? { ...prev, items: prev.items.map(row => row.id === item.id ? { ...row, metadata: { ...row.metadata, content_status: status } } : row) } : prev);
    } catch (failure) { setError(failure); } finally { setBusy(false); }
  };
  const issueLine = (issue: AdminIssue) => t('admin.issue', { index: issue.index + 1, slug: issue.slug ?? '—', message: issue.message });
  const previews = items && result ? items.slice(0, PREVIEW).map(item => {
    try { const row = toContentRows(item); return { item, question: asQuestion({ id: 'preview-' + item.slug, type: row.type, data: row.data, metadata: row.metadata }), correct: row.correct }; }
    catch { return null; }
  }).filter(Boolean) as Array<{ item: ContractItem; question: SatQuestion; correct: unknown }> : [];

  return <div className="app-shell">
    <PracticeTopNav />
    <main className="workspace">
      <header className="page-header"><div>
        <p className="eyebrow">{t('admin.eyebrow')}</p>
        <h1>{t('admin.title')}</h1>
        <p>{t('admin.lead')}</p>
      </div></header>
      {error ? <div className="alert error" role="alert">{errorText(error)}</div> : null}
      {notice ? <div className="alert" role="status">{notice}</div> : null}
      <section className="panel form-panel">
        <label>{t('admin.file')}
          <input type="file" accept="application/json,.json" onChange={async event => {
            const file = event.target.files?.[0];
            if (!file) return;
            const content = await file.text();
            setText(content); validate(content);
          }} />
        </label>
        <label>{t('admin.paste')}
          <textarea rows={8} value={text} onChange={event => setText(event.target.value)} spellCheck={false} />
        </label>
        <div className="row-actions">
          <button type="button" className="btn ghost" disabled={!text.trim()} onClick={() => validate(text)}>{t('admin.validate')}</button>
          <button type="button" className="btn ghost" disabled={busy || !result || result.errors.length > 0 || !result.count} onClick={() => void importAll('draft')}>{busy ? t('admin.importing') : t('admin.importDraft')}</button>
          <button type="button" className="btn solid" disabled={busy || !result || result.errors.length > 0 || !result.count} onClick={() => void importAll('published')}>{busy ? t('admin.importing') : t('admin.importPublished')}</button>
        </div>
        {parseError ? <div className="alert error" role="alert">{parseError}</div> : null}
        {result ? <div role="status" className={`alert${result.errors.length ? ' error' : ''}`}>
          <p>{result.errors.length ? t('admin.invalid', { count: result.errors.length }) : t('admin.valid', { count: result.count })} {result.warnings.length ? t('admin.warnings', { count: result.warnings.length }) : ''}</p>
          {result.errors.length ? <ul className="issue-list">{result.errors.slice(0, 200).map((e, i) => <li key={i}>{issueLine(e)}</li>)}</ul> : null}
          {result.warnings.length ? <details><summary>{t('admin.warnings', { count: result.warnings.length })}</summary><ul className="issue-list">{result.warnings.slice(0, 200).map((w, i) => <li key={i}>{issueLine(w)}</li>)}</ul></details> : null}
        </div> : null}
      </section>
      {previews.length ? <section aria-label={t('admin.previewTitle')} className="question-stack">
        <h2>{t('admin.previewTitle')}</h2>
        {previews.map(({ item, question, correct }) => <div key={item.slug} className="question-shell">
          <div className="chip-row"><span className="chip neutral">{item.slug}</span><span className={`chip ${question.section_type}`}>{domainLabel(t, item.official_domain)}</span><span className="chip neutral">{skillLabel(t, item.skill)}</span><span className="chip neutral">{t(`difficulty.${item.difficulty}` as AppKey)}</span></div>
          <QuestionCard question={question} readOnly />
          <div className="panel"><p><strong>{t('admin.answer', { answer: answerOf(correct) })}</strong></p><RichText as="div" className="explanation" text={item.explanation} /></div>
        </div>)}
      </section> : null}
      <section className="panel">
        <div className="section-head"><h2>{t('admin.list')}</h2></div>
        <div className="filter-bar">
          <label>{t('admin.filterStatus')}<select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">{t('admin.anyStatus')}</option>{(['draft', 'published', 'retired'] as const).map(s => <option key={s} value={s}>{t(`admin.status.${s}`)}</option>)}</select></label>
          <label>{t('bank.domain')}<select value={filters.domain} onChange={e => setFilters(f => ({ ...f, domain: e.target.value }))}>
            <option value="">{t('bank.anyDomain')}</option>{OFFICIAL_DOMAIN_IDS.map(d => <option key={d} value={d}>{domainLabel(t, d)}</option>)}</select></label>
          <label>{t('admin.search')}<input value={filters.q} maxLength={100} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} /></label>
          <label>&nbsp;<button type="button" className="btn solid" onClick={() => void load(0)}>{t('admin.load')}</button></label>
        </div>
        {list ? <p role="status">{t('admin.total', { count: list.total })}</p> : null}
        {list && !list.items.length ? <div className="empty-state">{t('admin.noItems')}</div> : null}
        <div className="question-stack">
          {list?.items.map(item => {
            const status = String(item.metadata.content_status ?? 'published');
            return <details key={item.id} className="admin-item">
              <summary><span className="chip neutral">{String(item.metadata.original_slug ?? item.id)}</span> <span className={`chip status-${status}`}>{hasStatus(status) ? t(`admin.status.${status}`) : status}</span> <RichText text={String(item.data.prompt ?? '').slice(0, 140)} /></summary>
              <QuestionCard question={asQuestion(item)} readOnly />
              <p><strong>{t('admin.answer', { answer: answerOf(item.correct) })}</strong></p>
              {item.explanation ? <RichText as="div" className="explanation" text={item.explanation} /> : null}
              <div className="row-actions">
                {status === 'published'
                  ? <button type="button" className="btn ghost" disabled={busy} onClick={() => void setStatus(item, 'draft')}>{t('admin.unpublish')}</button>
                  : <button type="button" className="btn solid" disabled={busy} onClick={() => void setStatus(item, 'published')}>{t('admin.publish')}</button>}
              </div>
            </details>;
          })}
        </div>
        {list && list.items.length < list.total ? <button type="button" className="btn ghost" onClick={() => void load(list.items.length)}>{t('admin.more')}</button> : null}
      </section>
    </main>
  </div>;
}
const hasStatus = (s: string): s is 'draft' | 'published' | 'retired' => ['draft', 'published', 'retired'].includes(s);
