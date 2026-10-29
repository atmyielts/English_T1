// Writing checker (/w/:org/writing): write a work email or message (free or from a
// job-role task), get a corrected version, tone notes and explanations.
import React, { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { aiMessage, Loading, readLocal, useDate, useLoad, useLocalized, writeLocal, type AiStatus, type Localized } from './lib.tsx';

interface Template { code: string; title: Localized; kind: string; situation: Localized; starter: string; checklist: string[] }
interface Result {
  corrected: string; score: number; summary: string; tone: string; tone_notes: string[];
  changes: { original: string; corrected: string; why: string }[]; checklist: { item: string; done: boolean }[];
}
interface Check { id: string; template_code: string | null; title: Localized | null; draft: string; result: Result; score: number | null; created_at: string }
interface Overview {
  recommended: string; retention_days: number; max_length: number;
  tracks: { code: string; title: Localized; templates: Template[] }[];
  checks: { id: string; template_code: string | null; title: Localized | null; score: number | null; created_at: string; excerpt: string }[];
}

const FREE = '';

export function Writing() {
  const t = useAppT(), pick = useLocalized(), problem = useErrorText(), when = useDate();
  const { locale } = useI18n();
  const { org, member } = useWorkspace();
  const { query } = useLocation();
  const { data, error, reload } = useLoad<Overview>(`orgs/${org.id}/writing`);
  const [track, setTrack] = useState<string | null>(null);
  const [templateCode, setTemplateCode] = useState<string>(() => query.get('template') ?? FREE);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [copied, setCopied] = useState(false);
  const [shown, setShown] = useState<Check | null>(null);

  const draftKey = `training.writing.${templateCode || 'free'}`;
  useEffect(() => { setDraft(readLocal(draftKey, '')); }, [draftKey]);
  const save = (value: string) => { setDraft(value); writeLocal(draftKey, value || null); };

  if (!data) return <Loading error={error}/>;
  const all = data.tracks.flatMap((entry) => entry.templates.map((template) => ({ template, track: entry.code })));
  const selected = all.find((entry) => entry.template.code === templateCode)?.template ?? null;
  const chosenTrack = track ?? all.find((entry) => entry.template.code === templateCode)?.track ?? data.recommended;
  const templates = data.tracks.find((entry) => entry.code === chosenTrack)?.templates ?? [];
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!member) { setFailure(t('training.notMember')); return; }
    if (draft.trim().length < 20) { setFailure(t('training.writing.tooShort')); return; }
    setBusy(true); setFailure(''); setCopied(false);
    try {
      const result = await api<{ status: AiStatus; check?: Check }>(`orgs/${org.id}/writing/check`, { method: 'POST', body: { text: draft, template: templateCode || null, locale }, timeoutMs: 60000 });
      const message = aiMessage(result.status);
      if (message || !result.check) { setFailure(t(message ?? 'training.ai.unavailable')); return; }
      setShown(result.check);
      void reload();
      queueMicrotask(() => document.getElementById('training-result')?.focus());
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setFailure('');
    try {
      const { check } = await api<{ check: Check }>(`orgs/${org.id}/writing/${id}`);
      setShown(check);
      queueMicrotask(() => document.getElementById('training-result')?.focus());
    } catch (cause) {
      setFailure(problem(cause));
    }
  }
  async function remove(id: string) {
    if (!confirm(t('training.writing.deleteConfirm'))) return;
    try {
      await api(`orgs/${org.id}/writing/${id}`, { method: 'DELETE' });
      if (shown?.id === id) setShown(null);
      void reload();
    } catch (cause) {
      setFailure(problem(cause));
    }
  }

  return <div className="training-page">
    <header className="training-head">
      <h1>{t('training.writing.title')}</h1>
      <p>{t('training.writing.lead')}</p>
    </header>
    <p className="notice" role="note">{t('training.writing.retention', { days: data.retention_days })}</p>

    <section className="training-card" aria-labelledby="training-task">
      <h2 id="training-task">{t('training.writing.task')}</h2>
      <div className="company-toolbar">
        <label>{t('training.learn.track')}
          <select value={chosenTrack} onChange={(event) => setTrack(event.target.value)}>
            {data.tracks.map((entry) => <option key={entry.code} value={entry.code}>{pick(entry.title)}{entry.code === data.recommended ? ` — ${t('training.learn.yourRole')}` : ''}</option>)}
          </select>
        </label>
        <label>{t('training.writing.template')}
          <select value={templateCode} onChange={(event) => { setTemplateCode(event.target.value); setShown(null); }}>
            <option value={FREE}>{t('training.writing.free')}</option>
            {selected && !templates.some((template) => template.code === selected.code) && <option value={selected.code}>{pick(selected.title)}</option>}
            {templates.map((template) => <option key={template.code} value={template.code}>{pick(template.title)} · {t(`training.kind.${template.kind}` as AppKey)}</option>)}
          </select>
        </label>
      </div>
      {selected ? <div className="training-template">
        <h3>{pick(selected.title)}</h3>
        <p>{pick(selected.situation)}</p>
        <p><strong>{t('training.writing.goodAnswer')}</strong></p>
        <ul lang="en">{selected.checklist.map((item) => <li key={item}>{item}</li>)}</ul>
        <button type="button" className="quiet" onClick={() => { if (!draft.trim() || confirm(t('training.writing.replaceConfirm'))) save(selected.starter); }}>{t('training.writing.useStarter')}</button>
      </div> : <p className="hint">{t('training.writing.freeHint')}</p>}

      <form onSubmit={submit}>
        <label>{t('training.writing.text')}
          <textarea rows={10} value={draft} maxLength={data.max_length} lang="en" spellCheck={false} onChange={(event) => save(event.target.value)}/>
        </label>
        <p className="hint" aria-live="polite">{t('training.writing.count', { words, chars: draft.length, max: data.max_length })}</p>
        {failure && <p className="error" role="alert">{failure}</p>}
        <div className="company-actions">
          <button disabled={busy || !draft.trim()}>{busy ? t('training.writing.checking') : t('training.writing.check')}</button>
          {draft && <button type="button" className="quiet" disabled={busy} onClick={() => { if (confirm(t('training.writing.clearConfirm'))) save(''); }}>{t('training.writing.clear')}</button>}
        </div>
      </form>
    </section>

    {shown && <section className="training-card training-result" aria-labelledby="training-result-title" id="training-result" tabIndex={-1}>
      <h2 id="training-result-title">{t('training.writing.result')}{shown.title ? ` · ${pick(shown.title)}` : ''}</h2>
      <div className="training-feedback-score"><strong>{shown.result.score}</strong><span>/100</span><span className="hint">{t('training.writing.scoreHint')}</span></div>
      {shown.result.summary && <p>{shown.result.summary}</p>}
      <h3>{t('training.writing.corrected')}</h3>
      <pre className="training-corrected" lang="en">{shown.result.corrected}</pre>
      <div className="company-actions">
        <button type="button" className="quiet" onClick={() => void navigator.clipboard?.writeText(shown.result.corrected).then(() => setCopied(true)).catch(() => undefined)}>{t('common.copy')}</button>
        {copied && <span role="status">{t('common.copied')}</span>}
      </div>
      {(shown.result.tone || shown.result.tone_notes.length > 0) && <>
        <h3>{t('training.writing.tone')}</h3>
        {shown.result.tone && <p>{shown.result.tone}</p>}
        {shown.result.tone_notes.length > 0 && <ul>{shown.result.tone_notes.map((note) => <li key={note}>{note}</li>)}</ul>}
      </>}
      {shown.result.changes.length > 0 && <>
        <h3>{t('training.writing.changes')}</h3>
        <ul className="training-better">
          {shown.result.changes.map((change, index) => <li key={index}>
            {change.original && <span className="training-said" lang="en"><s>{change.original}</s></span>}
            <strong lang="en">{change.corrected}</strong>
            {change.why && <span>{change.why}</span>}
          </li>)}
        </ul>
      </>}
      {shown.result.checklist.length > 0 && <>
        <h3>{t('training.writing.checklist')}</h3>
        <ul className="training-checklist">{shown.result.checklist.map((item) => <li key={item.item} className={item.done ? 'is-done' : ''}><span aria-hidden="true">{item.done ? '✓' : '○'}</span> <span lang="en">{item.item}</span><span className="visually-hidden"> — {item.done ? t('training.done') : t('training.notYet')}</span></li>)}</ul>
      </>}
      <details>
        <summary>{t('training.writing.original')}</summary>
        <pre className="training-corrected" lang="en">{shown.draft}</pre>
      </details>
      <p className="hint">{t('training.ai.label')}</p>
    </section>}

    <section className="training-card" aria-labelledby="training-history">
      <h2 id="training-history">{t('training.writing.history')}</h2>
      {data.checks.length === 0 ? <p>{t('training.writing.noHistory')}</p> : <ul className="training-list">
        {data.checks.map((item) => <li key={item.id}>
          <div>
            <strong>{item.title ? pick(item.title) : t('training.writing.free')}{item.score !== null && ` · ${item.score}/100`}</strong>
            <span>{when(item.created_at)}</span>
            <span className="training-excerpt" lang="en">{item.excerpt}</span>
          </div>
          <span className="company-actions">
            <button type="button" className="quiet" onClick={() => void open(item.id)}>{t('training.writing.open')}</button>
            <button type="button" className="quiet" onClick={() => void remove(item.id)}>{t('common.delete')}</button>
          </span>
        </li>)}
      </ul>}
    </section>
  </div>;
}
