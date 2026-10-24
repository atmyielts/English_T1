import React, { useState, type FormEvent } from 'react';
import { useI18n } from '../../../packages/service-i18n/src/i18n.tsx';
import { CERTIFICATE_GRADES, type ExamCode } from '../../../packages/subject-core/src/mod.ts';
import { admission, type Journey as JourneyState, type Milestone, type Suggestion } from './api.ts';
import { useAppT, useErrorText, type AppKey } from './i18n/index.ts';
import { useDay } from './dates.ts';

type Draft = { exam_code: ExamCode; sitting_date: string; target: string };

function SuggestionText({ suggestion }: { suggestion: Suggestion }) {
  const t = useAppT(), { number } = useI18n();
  if (suggestion.kind === 'retake_certificate') return <>{t('suggest.retake_certificate', { to: suggestion.to })}</>;
  if (suggestion.kind === 'certificate_counts') return <>{t('suggest.certificate_counts', { grade: suggestion.grade, points: suggestion.points.map((row) => t(`suggest.points.${row.section_id}` as AppKey, { points: number(row.points) })).join('; ') })}</>;
  return <>{t(`suggest.${suggestion.kind}`)}</>;
}

export function Journey({ journey, actor, onChange }: { journey: JourneyState; actor: string; onChange: (journey: JourneyState, notice: string) => void }) {
  const t = useAppT(), problem = useErrorText(), { number } = useI18n();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const day = useDay();
  async function run(action: () => Promise<JourneyState>) {
    setBusy(true); setError('');
    try { onChange(await action(), t('journey.saved')); setDraft(null); } catch (cause) { setError(problem(cause)); } finally { setBusy(false); }
  }
  function open(exam: ExamCode) {
    setDraft({ exam_code: exam, sitting_date: '', target: exam === 'uz-certificate-math' ? 'A' : '' });
    requestAnimationFrame(() => document.getElementById('journey-add')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function add(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const certificate = draft.exam_code === 'uz-certificate-math';
    void run(() => admission<JourneyState>('milestones', 'POST', { exam_code: draft.exam_code, sitting_date: draft.sitting_date, ...(certificate ? { target_grade: draft.target || null } : { target_points: draft.target === '' ? null : Number(draft.target) }) }, actor));
  }
  const report = (row: Milestone, status: 'done' | 'skipped') => {
    const value = result[row.id] ?? '';
    const body = status === 'skipped' ? { status } : row.exam_code === 'uz-certificate-math' ? { status, result_grade: value || null } : { status, result_points: value === '' ? null : Number(value) };
    void run(() => admission<JourneyState>(`milestones/${row.id}`, 'PUT', body, actor));
  };
  const actionFor = (suggestion: Suggestion): ExamCode | null => suggestion.kind === 'plan_admission' ? 'uz-admission' : suggestion.kind === 'plan_certificate' || suggestion.kind === 'retake_certificate' ? 'uz-certificate-math' : null;
  return <>
    <div className="page-heading"><h1>{t('journey.title')}</h1></div>
    <p className="hint">{t('journey.lead')}</p>
    {error && <p role="alert" className="error">{error}</p>}
    <section className="admission-card" aria-labelledby="journey-next">
      <h2 id="journey-next">{t('journey.next')}</h2>
      <ul className="suggestions">{journey.suggestions.map((suggestion, index) => {
        const exam = actionFor(suggestion);
        return <li key={index}><span><SuggestionText suggestion={suggestion}/></span>{exam && <button className="quiet" disabled={busy} onClick={() => open(exam)}>{t('suggest.add')}</button>}</li>;
      })}</ul>
    </section>
    <section className="admission-card" aria-labelledby="journey-list">
      <h2 id="journey-list">{t('journey.title')}</h2>
      {!journey.milestones.length ? <p className="hint">{t('journey.empty')}</p> : <ol className="milestones">{journey.milestones.map((row) => {
        const awaiting = journey.awaiting_result.includes(row.id), certificate = row.exam_code === 'uz-certificate-math';
        const target = certificate ? row.target_grade : row.target_points === null ? null : number(row.target_points);
        const outcome = row.status === 'skipped' ? t('journey.skipped') : row.status === 'done' ? t('journey.result', { result: certificate ? (row.result_grade === 'none' ? t('journey.resultNone') : row.result_grade ?? '') : number(row.result_points ?? 0) }) : null;
        return <li key={row.id} className={`milestone milestone-${row.status}${journey.next?.id === row.id ? ' milestone-next' : ''}`}>
          <div>
            <p className="eyebrow">{day(row.sitting_date)}</p>
            <strong>{t(`exam.${row.exam_code}` as AppKey)}</strong>
            <span>{[target !== null ? t('journey.target', { target }) : null, outcome].filter(Boolean).join(' · ')}</span>
          </div>
          {awaiting && <form className="result-form" onSubmit={(event) => { event.preventDefault(); report(row, 'done'); }}>
            <label>{certificate ? t('journey.resultGrade') : t('journey.resultPoints')}
              {certificate
                ? <select required value={result[row.id] ?? ''} onChange={(event) => setResult({ ...result, [row.id]: event.target.value })}><option value=""/>{CERTIFICATE_GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}<option value="none">{t('journey.resultNone')}</option></select>
                : <input required type="number" inputMode="decimal" min={0} max={189} step="0.1" value={result[row.id] ?? ''} onChange={(event) => setResult({ ...result, [row.id]: event.target.value })}/>}
            </label>
            <div className="action-row"><button disabled={busy}>{t('journey.saveResult')}</button><button type="button" className="quiet" disabled={busy} onClick={() => report(row, 'skipped')}>{t('journey.didNotSit')}</button></div>
          </form>}
          {!awaiting && <button className="quiet" disabled={busy} onClick={() => void run(() => admission<JourneyState>(`milestones/${row.id}`, 'DELETE', undefined, actor))}>{t('journey.remove')}</button>}
        </li>;
      })}</ol>}
      {!draft && <button className="quiet" onClick={() => open('uz-certificate-math')}>{t('journey.add')}</button>}
    </section>
    {draft && <section className="admission-card" id="journey-add" aria-labelledby="journey-add-title">
      <h2 id="journey-add-title">{t('journey.add')}</h2>
      <form className="goal-form" onSubmit={add}>
        <fieldset>
          <legend>{t('journey.exam')}</legend>
          {(['uz-certificate-math', 'uz-admission'] as const).map((code) => <label className="check" key={code}><input type="radio" name="exam" checked={draft.exam_code === code} onChange={() => setDraft({ ...draft, exam_code: code, target: code === 'uz-certificate-math' ? 'A' : '' })}/>{t(`exam.${code}`)}</label>)}
        </fieldset>
        <div className="goal-fields">
          <label>{t('journey.date')}<input type="date" required value={draft.sitting_date} onChange={(event) => setDraft({ ...draft, sitting_date: event.target.value })}/><span className="hint">{t('journey.dateHint')}</span></label>
          {draft.exam_code === 'uz-certificate-math'
            ? <label>{t('journey.targetGrade')}<select value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })}>{CERTIFICATE_GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select></label>
            : <label>{t('journey.targetPoints')}<input type="number" inputMode="decimal" min={0} max={189} step="0.1" value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })}/></label>}
        </div>
        <div className="action-row"><button disabled={busy}>{t('journey.save')}</button><button type="button" className="quiet" onClick={() => setDraft(null)}>{t('practice.back')}</button></div>
      </form>
    </section>}
  </>;
}
