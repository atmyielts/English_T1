// /w/:org/reports — the printable monthly report for any date range, CSV
// exports, and an optional AI-written summary (clearly labelled).
import React, { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, useErrorText } from '../../i18n/index.ts';
import { Link, navigate, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi, type AiSummary, type Funnel, type Report } from './api.ts';
import { addDays, BarList, Columns, DataTable, download, Kpi, LEVEL_SHORT, LevelBadge, LevelLegend, LevelStrip, Loading, Panel, Problem, tashkentToday, useFormat, useMaybeT } from './ui.tsx';

type Preset = 'this_month' | 'last_month' | 'last_90' | 'custom';
const monthStart = (date: string, offset = 0) => {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
};
function presetRange(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const today = tashkentToday();
  if (preset === 'this_month') return { from: monthStart(today), to: today };
  if (preset === 'last_month') return { from: monthStart(today, -1), to: addDays(monthStart(today), -1) };
  return { from: addDays(today, -89), to: today };
}
function presetOf(from: string, to: string): Preset {
  for (const preset of ['this_month', 'last_month', 'last_90'] as const) {
    const range = presetRange(preset);
    if (range.from === from && range.to === to) return preset;
  }
  return 'custom';
}

export function Reports() {
  const t = useAppT(), f = useFormat(), problem = useErrorText();
  const { org, hr } = useWorkspace();
  const { query } = useLocation();
  const fallback = presetRange('this_month');
  const from = query.get('from') || fallback.from, to = query.get('to') || fallback.to;
  const [draft, setDraft] = useState({ from, to });
  useEffect(() => setDraft({ from, to }), [from, to]);
  const preset = presetOf(from, to);
  const { data, error, loading, reload } = useApi<Report>(`orgs/${org.id}/reports/monthly?from=${from}&to=${to}`);
  const [exporting, setExporting] = useState(''), [exportNote, setExportNote] = useState(''), [exportError, setExportError] = useState('');

  const go = (range: { from: string; to: string }) => navigate(`/w/${org.id}/reports?from=${range.from}&to=${range.to}`, { replace: true });
  function apply(event: FormEvent) {
    event.preventDefault();
    if (draft.from && draft.to) go(draft);
  }
  async function exportKind(kind: 'people' | 'attempts' | 'activity') {
    setExporting(kind); setExportError(''); setExportNote('');
    try {
      const result = await api<{ filename: string; csv: string; rows: number; truncated: boolean }>(`orgs/${org.id}/reports/export?kind=${kind}&from=${from}&to=${to}`, { timeoutMs: 60000 });
      // A byte-order mark so Excel opens Cyrillic and Uzbek text correctly.
      download(result.filename, `﻿${result.csv}\r\n`, 'text/csv;charset=utf-8');
      setExportNote(result.truncated ? t('insights.reports.exportTruncated', { count: result.rows }) : t('insights.reports.exported', { count: result.rows }));
    } catch (cause) {
      setExportError(problem(cause));
    } finally {
      setExporting('');
    }
  }

  return <div className="insights insights-reports">
    <header className="insights-head no-print">
      <div>
        <p className="eyebrow">{data?.scope.department ? t('insights.scope.department', { name: data.scope.department.name }) : t('insights.scope.company')}</p>
        <h1>{t('insights.reports.title')}</h1>
        <p className="insights-lead">{t('insights.reports.lead')}</p>
      </div>
    </header>

    <form className="company-toolbar insights-range" onSubmit={apply} aria-label={t('insights.reports.range')}>
      <label>{t('insights.reports.period')}
        <select value={preset} onChange={(event) => { const value = event.target.value as Preset; if (value !== 'custom') go(presetRange(value)); else setDraft({ from, to }); }}>
          <option value="this_month">{t('insights.reports.preset.this_month')}</option>
          <option value="last_month">{t('insights.reports.preset.last_month')}</option>
          <option value="last_90">{t('insights.reports.preset.last_90')}</option>
          <option value="custom">{t('insights.reports.preset.custom')}</option>
        </select>
      </label>
      <label>{t('insights.reports.from')}<input type="date" required value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft({ ...draft, from: event.target.value })}/></label>
      <label>{t('insights.reports.to')}<input type="date" required value={draft.to} min={draft.from || undefined} max={tashkentToday()} onChange={(event) => setDraft({ ...draft, to: event.target.value })}/></label>
      <button disabled={draft.from === from && draft.to === to}>{t('insights.reports.apply')}</button>
      <button type="button" className="quiet" onClick={() => print()} disabled={!data}>{t('insights.reports.print')}</button>
    </form>

    <section className="insights-exports no-print" aria-labelledby="exports-title">
      <h2 id="exports-title">{t('insights.reports.exports')}</h2>
      <div className="company-actions">
        <button className="quiet" disabled={Boolean(exporting)} onClick={() => void exportKind('people')}>{t('insights.reports.export.people')}</button>
        <button className="quiet" disabled={Boolean(exporting)} onClick={() => void exportKind('attempts')}>{t('insights.reports.export.attempts')}</button>
        <button className="quiet" disabled={Boolean(exporting)} onClick={() => void exportKind('activity')}>{t('insights.reports.export.activity')}</button>
      </div>
      <p className="hint">{hr ? t('insights.reports.exportNote') : t('insights.reports.exportNoteManager')}</p>
      {exporting && <p role="status">{t('insights.reports.exporting')}</p>}
      {exportNote && <p className="notice" role="status">{exportNote}</p>}
      {exportError && <p className="error" role="alert">{exportError}</p>}
    </section>

    {error && !data && <Problem message={error} retry={() => void reload()}/>}
    {loading && !data && <Loading/>}
    {error && data && <p className="error" role="alert">{error}</p>}
    {data && <ReportBody report={data} stale={loading}/>}
  </div>;
}

function ReportBody({ report, stale }: { report: Report; stale: boolean }) {
  const t = useAppT(), f = useFormat(), maybe = useMaybeT();
  const { org } = useWorkspace();
  const s = report.summary, m = report.movement;
  const moved = m.up + m.same + m.down;
  const track = (code: string | null) => code ? maybe(`job.${code}`, code) : '—';
  return <article className={`insights-report${stale ? ' insights-stale' : ''}`} aria-busy={stale}>
    <header className="insights-report-head">
      <p className="eyebrow">{t('insights.reports.docTitle')}</p>
      <h2 className="insights-report-title">{report.org.name}{report.scope.department ? ` · ${report.scope.department.name}` : ''}</h2>
      <p>{t('insights.reports.periodText', { from: f.date(report.range.from), to: f.date(report.range.to), days: report.range.days })}</p>
      <p className="hint">{t('insights.reports.generated', { date: f.date(report.generated_at) })} · {t('insights.estimateNote')}</p>
    </header>

    <AiSummaryBlock range={report.range}/>

    <Panel id="rp-summary" title={t('insights.reports.summary')}>
      <div className="company-grid insights-kpis">
        <Kpi label={t('insights.kpi.people')} value={f.num(s.people)} note={t('insights.kpi.learners', { count: s.learners })}/>
        <Kpi label={t('insights.reports.activeLearners')} value={f.num(s.active)} note={t('insights.reports.ofSharing', { count: s.sharing })}/>
        <Kpi label={t('insights.reports.time')} value={f.minutes(s.minutes)} note={t('insights.kpi.lessonsMonth', { count: s.lessons })}/>
        <Kpi label={t('insights.reports.testsGraded')} value={f.num(s.tests_graded)} note={t('insights.reports.staffTests', { count: s.staff_tests })}/>
        <Kpi label={t('insights.reports.avgLevel')} value={s.avg_end.level ? <LevelBadge level={s.avg_end.level} score={s.avg_end.score}/> : '—'}
          note={s.avg_start.level ? t('insights.reports.avgFrom', { level: `${LEVEL_SHORT[s.avg_start.level]} · ${f.num(s.avg_start.score)}` }) : t('insights.reports.noStart')}/>
        <Kpi label={t('insights.kpi.atTarget')} value={s.with_target ? f.pct(s.at_target, s.with_target) : '—'} note={s.with_target ? t('insights.kpi.atTargetNote', { done: s.at_target, total: s.with_target }) : t('insights.kpi.noTargets')}/>
      </div>
    </Panel>

    <Panel id="rp-movement" title={t('insights.reports.movement')}>
      {moved + m.first === 0 ? <p className="insights-empty">{t('insights.reports.noMovement')}</p> : <>
        <ul className="insights-movement">
          <li className="insights-up"><strong>{f.num(m.up)}</strong><span>{t('insights.reports.movedUp')}</span></li>
          <li><strong>{f.num(m.same)}</strong><span>{t('insights.reports.stayed')}</span></li>
          <li className="insights-down"><strong>{f.num(m.down)}</strong><span>{t('insights.reports.movedDown')}</span></li>
          <li><strong>{f.num(m.first)}</strong><span>{t('insights.reports.firstTest')}</span></li>
        </ul>
        <div className="insights-trend">
          <div className="insights-trend-row"><span className="insights-trend-month">{f.dateShort(report.range.from)}</span><LevelStrip counts={m.start} label={t('insights.reports.atStart')}/></div>
          <div className="insights-trend-row"><span className="insights-trend-month">{f.dateShort(report.range.to)}</span><LevelStrip counts={m.end} label={t('insights.reports.atEnd')}/></div>
        </div>
        <LevelLegend/>
      </>}
    </Panel>

    <Panel id="rp-departments" title={t('insights.departments.title')}>
      {report.departments.length === 0 ? <p className="insights-empty">{t('insights.departments.empty')}</p> : <div className="company-table-wrap">
        <table className="company-table insights-table">
          <thead><tr>
            <th scope="col">{t('insights.col.department')}</th><th scope="col">{t('insights.col.people')}</th><th scope="col">{t('insights.col.active')}</th>
            <th scope="col">{t('insights.col.minutes')}</th><th scope="col">{t('insights.col.lessons')}</th><th scope="col">{t('insights.col.avg')}</th>
            <th scope="col">{t('insights.col.movedUp')}</th><th scope="col">{t('insights.col.atTarget')}</th>
          </tr></thead>
          <tbody>{report.departments.map((row) => <tr key={row.id ?? 'none'}>
            <th scope="row">{row.name ?? t('insights.noDepartment')}</th>
            <td>{f.num(row.people)}</td>
            <td>{t('common.of', { done: f.num(row.active), total: f.num(row.sharing) })}</td>
            <td>{f.minutes(row.minutes)}</td>
            <td>{f.num(row.lessons)}</td>
            <td>{row.avg.level ? <LevelBadge level={row.avg.level} score={row.avg.score}/> : '—'}</td>
            <td>{f.num(row.moved_up)}</td>
            <td>{row.with_target ? `${row.at_target}/${row.with_target}` : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </Panel>

    <div className="insights-two">
      <Panel id="rp-improvers" title={t('insights.reports.improvers')}>
        {report.improvers.length === 0 ? <p className="insights-empty">{t('insights.reports.noImprovers')}</p> : <ol className="insights-rank">
          {report.improvers.map((row) => <li key={row.member_id}>
            <Link to={`/w/${org.id}/people/${row.member_id}`}>{row.name}</Link>
            <span>{row.department ?? t('insights.noDepartment')}</span>
            <span className="insights-rank-value"><LevelBadge level={row.from_level}/> → <LevelBadge level={row.to_level}/> <small>{row.delta > 0 ? `+${f.num(row.delta)}` : f.num(row.delta)}</small></span>
          </li>)}
        </ol>}
      </Panel>
      <Panel id="rp-active" title={t('insights.reports.mostActive')}>
        {report.most_active.length === 0 ? <p className="insights-empty">{t('insights.kinds.empty')}</p> : <ol className="insights-rank">
          {report.most_active.map((row) => <li key={row.member_id}>
            <Link to={`/w/${org.id}/people/${row.member_id}`}>{row.name}</Link>
            <span>{row.department ?? t('insights.noDepartment')}</span>
            <span className="insights-rank-value">{f.minutes(row.minutes)} <small>{t('insights.reports.daysActive', { count: row.days })}</small></span>
          </li>)}
        </ol>}
      </Panel>
    </div>

    {report.hiring && <Panel id="rp-hiring" title={t('insights.reports.hiring')}>
      {report.hiring.started === 0 ? <p className="insights-empty">{t('insights.reports.noHiring')}</p> : <>
        <FunnelBars funnel={report.hiring}/>
        {report.hiring.by_test.length > 0 && <div className="company-table-wrap"><table className="company-table insights-table">
          <thead><tr><th scope="col">{t('insights.col.test')}</th><th scope="col">{t('insights.funnel.started')}</th><th scope="col">{t('insights.funnel.graded')}</th><th scope="col">{t('insights.funnel.meetsMin')}</th><th scope="col">{t('insights.funnel.shortlisted')}</th><th scope="col">{t('insights.funnel.waiting')}</th></tr></thead>
          <tbody>{report.hiring.by_test.map((row) => <tr key={row.id}>
            <th scope="row">{row.title}{row.min_level && <> · <LevelBadge level={row.min_level}/>+</>}</th>
            <td>{row.started}</td><td>{row.graded}</td><td>{row.with_min ? `${row.meets_min}/${row.with_min}` : '—'}</td><td>{row.shortlisted}</td><td>{row.waiting}</td>
          </tr>)}</tbody>
        </table></div>}
      </>}
    </Panel>}

    <Panel id="rp-training" title={t('insights.reports.training')}>
      <p>{t('insights.reports.trainingLead', { lessons: report.training.lessons_completed, learners: report.training.learners })}</p>
      {report.training.assignments.length === 0 ? <p className="insights-empty">{t('insights.reports.noAssignments')}</p> : <div className="company-table-wrap"><table className="company-table insights-table">
        <thead><tr><th scope="col">{t('insights.col.assignment')}</th><th scope="col">{t('insights.col.for')}</th><th scope="col">{t('insights.col.due')}</th><th scope="col">{t('insights.col.learning')}</th><th scope="col">{t('insights.col.lessons')}</th><th scope="col">{t('insights.col.targetMet')}</th></tr></thead>
        <tbody>{report.training.assignments.map((row) => <tr key={row.id}>
          <th scope="row">{track(row.track_code)}{row.target_level && <> · <LevelBadge level={row.target_level}/></>}</th>
          <td>{row.person ?? row.department ?? t('insights.everyone')}</td>
          <td>{f.date(row.due_date)} {row.overdue && <span className="company-badge bad">{t('insights.profile.overdue')}</span>}{row.status === 'done' && <span className="company-badge good">{t('insights.profile.done')}</span>}</td>
          <td>{t('common.of', { done: row.learners, total: row.sharing })}</td>
          <td>{row.lessons}</td>
          <td>{row.target_met === null ? '—' : `${row.target_met}/${row.assignees}`}</td>
        </tr>)}</tbody>
      </table></div>}
      {report.training.by_track.length > 0 && <>
        <h3>{t('insights.reports.byTrack')}</h3>
        <BarList label={t('insights.reports.byTrack')} rows={report.training.by_track.map((row) => ({ key: row.track_code, label: track(row.track_code), value: row.lessons, note: t('insights.reports.learnersCount', { count: row.learners }) }))}/>
      </>}
    </Panel>

    <div className="insights-two">
      <Panel id="rp-weeks" title={t('insights.weeks.titleRange')}>
        <Columns label={t('insights.weeks.titleRange')} valueLabel={t('insights.col.minutes')} format={f.minutes} short={f.minutesShort}
          points={report.weeks.map((week) => ({ key: week.week, label: f.dateShort(week.week), title: t('insights.weekOf', { date: f.date(week.week) }), value: week.minutes }))}/>
      </Panel>
      <Panel id="rp-kinds" title={t('insights.kinds.titleRange')}>
        {Object.keys(report.kinds).length === 0 ? <p className="insights-empty">{t('insights.kinds.empty')}</p> : <>
          <BarList label={t('insights.kinds.titleRange')} format={f.minutes}
            rows={Object.entries(report.kinds).sort((a, b) => b[1].minutes - a[1].minutes).map(([kind, totals]) => ({ key: kind, label: maybe(`insights.kind.${kind}`, kind), value: totals.minutes, note: t('insights.kinds.events', { count: totals.events }) }))}/>
          <DataTable caption={t('insights.kinds.titleRange')} head={[t('insights.col.kind'), t('insights.col.events'), t('insights.col.minutes')]}
            rows={Object.entries(report.kinds).map(([kind, totals]) => [maybe(`insights.kind.${kind}`, kind), totals.events, totals.minutes])}/>
        </>}
      </Panel>
    </div>
    <p className="hint insights-report-foot">{t('insights.reports.footnote', { sharing: s.sharing, people: s.learners })}</p>
  </article>;
}

function FunnelBars({ funnel }: { funnel: Funnel }) {
  const t = useAppT(), f = useFormat();
  const rows = [
    { key: 'started', label: t('insights.funnel.started'), value: funnel.started },
    { key: 'finished', label: t('insights.funnel.finished'), value: funnel.finished },
    { key: 'graded', label: t('insights.funnel.graded'), value: funnel.graded },
    { key: 'meets', label: t('insights.funnel.meetsMin'), value: funnel.meets_min },
    { key: 'shortlisted', label: t('insights.funnel.shortlisted'), value: funnel.shortlisted },
  ];
  return <>
    <BarList label={t('insights.reports.hiring')} max={Math.max(1, funnel.started)} rows={rows.map((row) => ({ ...row, note: f.pct(row.value, funnel.started), className: 'insights-fill-funnel' }))}/>
    <p className="hint">{t('insights.funnel.decisions', { held: funnel.held, rejected: funnel.rejected, waiting: funnel.waiting })}</p>
  </>;
}

function AiSummaryBlock({ range }: { range: Report['range'] }) {
  const t = useAppT(), f = useFormat(), problem = useErrorText();
  const { locale } = useI18n();
  const { org } = useWorkspace();
  const [result, setResult] = useState<AiSummary | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setResult(null); setError(''); }, [range.from, range.to]);
  async function write() {
    setBusy(true); setError('');
    try {
      setResult(await api<AiSummary>(`orgs/${org.id}/reports/summary`, { method: 'POST', body: { from: range.from, to: range.to, locale }, timeoutMs: 60000 }));
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  if (result?.status === 'ok' && result.summary) {
    return <section className="insights-ai" aria-labelledby="ai-title">
      <p className="insights-ai-label"><span className="company-badge">{t('insights.ai.badge')}</span> {t('insights.ai.check')}</p>
      <h2 id="ai-title">{result.summary.headline}</h2>
      {result.summary.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      {result.summary.actions.length > 0 && <>
        <h3>{t('insights.ai.actions')}</h3>
        <ul>{result.summary.actions.map((action, index) => <li key={index}>{action}</li>)}</ul>
      </>}
      <p className="hint">{result.generated_at ? t('insights.ai.generated', { date: f.date(result.generated_at) }) : ''}</p>
      <div className="company-actions no-print">
        <button className="quiet" disabled={busy} onClick={() => void write()}>{t('insights.ai.again')}</button>
        <button className="quiet" onClick={() => setResult(null)}>{t('insights.ai.remove')}</button>
      </div>
    </section>;
  }
  return <div className="insights-ai-ask no-print">
    <div>
      <strong>{t('insights.ai.title')}</strong>
      <p className="hint">{t('insights.ai.lead')}</p>
    </div>
    <button className="quiet" disabled={busy} onClick={() => void write()}>{busy ? t('insights.ai.writing') : t('insights.ai.write')}</button>
    {result?.status === 'limit' && <p className="error" role="alert">{t('insights.ai.limit')}</p>}
    {result?.status === 'unavailable' && <p className="error" role="alert">{t('insights.ai.unavailable')}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}

