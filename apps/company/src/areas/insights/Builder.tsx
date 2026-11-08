// /w/:org/custom-reports — a custom report: choose rows, columns, filters and a period, then
// run it, export it to CSV or save it for the workspace. A saved period stays relative,
// so "last 30 days" keeps meaning the last 30 days.
import React, { useEffect, useMemo, useState } from 'react';
import { JOB_ROLES } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { useLocation, navigate } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi, type LevelCode } from './api.ts';
import { COLUMN_GROUPS, PERIOD_PRESETS, ROW_KINDS, type BuilderResult, type ColumnCode, type RowKind, type SavedView, type ViewConfig } from './api2.ts';
import { LEVEL_CODES, LEVEL_SHORT, LevelBadge, Loading, Panel, Problem, tashkentToday, useFormat } from './ui.tsx';
import { CsvButton } from './parts.tsx';

const START: ViewConfig = { rows: 'department', columns: ['people', 'tested', 'avg_level', 'compliance_pct', 'active', 'hours'], filters: { department_ids: [], job_roles: [], levels: [], seat: 'any' }, period: { preset: 'this_month' } };

export function Builder() {
  const t = useAppT(), f = useFormat(), problem = useErrorText();
  const { org } = useWorkspace();
  const { query } = useLocation();
  const views = useApi<{ views: SavedView[] }>(`orgs/${org.id}/insights/views`);
  const [config, setConfig] = useState<ViewConfig>(START);
  const [result, setResult] = useState<BuilderResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const activeId = query.get('view');
  const active = views.data?.views.find((view) => view.id === activeId) ?? null;
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  async function run(next: ViewConfig = config) {
    setBusy(true); setError(''); setNotice('');
    try {
      const output = await api<BuilderResult>(`orgs/${org.id}/insights/builder/run`, { method: 'POST', body: next, timeoutMs: 60000 });
      setResult(output);
      setDepartments(output.departments);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  // Opening a saved view loads and runs it; the first visit runs the starting report.
  useEffect(() => {
    if (activeId && !views.data) return;
    const next = active ? active.config : START;
    setConfig(next);
    setName(active?.name ?? '');
    void run(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeId ? Boolean(views.data) : false]);

  const labels = useMemo(() => {
    const out: Record<string, string> = { total: t('insights.builder.total'), [`rows:${config.rows}`]: t(`insights.builder.rows.${config.rows}` as AppKey) };
    for (const group of Object.values(COLUMN_GROUPS)) for (const column of group) out[`col:${column}`] = t(`insights.builder.col.${column}` as AppKey);
    for (const row of result?.rows ?? []) out[`row:${row.key}`] = rowLabel(row, t);
    return out;
  }, [config.rows, result, t]);

  async function save(asNew: boolean) {
    setBusy(true); setError(''); setNotice('');
    try {
      if (active && !asNew) {
        await api(`orgs/${org.id}/insights/views/${active.id}`, { method: 'PATCH', body: { name, config } });
        setNotice(t('common.saved'));
        await views.reload();
      } else {
        const { view } = await api<{ view: SavedView }>(`orgs/${org.id}/insights/views`, { method: 'POST', body: { name, config } });
        await views.reload();
        setNotice(t('common.saved'));
        navigate(`/w/${org.id}/custom-reports?view=${view.id}`, { replace: true });
      }
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!active || !confirm(t('insights.builder.deleteConfirm', { name: active.name }))) return;
    setBusy(true); setError('');
    try {
      await api(`orgs/${org.id}/insights/views/${active.id}`, { method: 'DELETE' });
      await views.reload();
      navigate(`/w/${org.id}/custom-reports`, { replace: true });
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const toggleColumn = (column: ColumnCode) => setConfig({ ...config, columns: config.columns.includes(column) ? config.columns.filter((value) => value !== column) : [...config.columns, column] });
  const toggle = (key: 'department_ids' | 'job_roles' | 'levels', value: string) => {
    const list = config.filters[key];
    setConfig({ ...config, filters: { ...config.filters, [key]: list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value] } });
  };
  const ordered = (Object.values(COLUMN_GROUPS).flat() as ColumnCode[]).filter((column) => config.columns.includes(column));

  return <div className="insights insights-more">
    <header className="insights-head">
      <div>
        <h1>{t('insights.builder.title')}</h1>
        <p className="insights-lead">{t('insights.builder.lead')}</p>
      </div>
    </header>

    {views.data && views.data.views.length > 0 && <nav className="insights-chips no-print" aria-label={t('insights.builder.saved')}>
      <button type="button" className={active ? 'quiet' : ''} aria-pressed={!active} onClick={() => navigate(`/w/${org.id}/custom-reports`, { replace: true })}>{t('insights.builder.newReport')}</button>
      {views.data.views.map((view) => <button key={view.id} type="button" className={view.id === activeId ? '' : 'quiet'} aria-pressed={view.id === activeId} onClick={() => navigate(`/w/${org.id}/custom-reports?view=${view.id}`, { replace: true })}>{view.name}</button>)}
    </nav>}

    <Panel id="builder-form" className="no-print" title={t('insights.builder.choose')}>
      <form className="insights-form" onSubmit={(event) => { event.preventDefault(); void run(); }}>
        <div className="insights-form-row">
          <label>{t('insights.builder.rowsLabel')}
            <select value={config.rows} onChange={(event) => setConfig({ ...config, rows: event.target.value as RowKind })}>
              {ROW_KINDS.map((kind) => <option key={kind} value={kind}>{t(`insights.builder.rows.${kind}` as AppKey)}</option>)}
            </select>
          </label>
          <label>{t('insights.builder.period')}
            <select value={config.period.preset} onChange={(event) => {
              const preset = event.target.value as ViewConfig['period']['preset'];
              const today = tashkentToday();
              setConfig({ ...config, period: preset === 'custom' ? { preset, from: config.period.from ?? `${today.slice(0, 7)}-01`, to: config.period.to ?? today } : { preset } });
            }}>
              {PERIOD_PRESETS.map((preset) => <option key={preset} value={preset}>{t(`insights.builder.preset.${preset}` as AppKey)}</option>)}
            </select>
          </label>
        </div>
        {config.period.preset === 'custom' && <div className="insights-form-row">
          <label>{t('insights.reports.from')}<input type="date" required value={config.period.from ?? ''} onChange={(event) => setConfig({ ...config, period: { ...config.period, from: event.target.value } })}/></label>
          <label>{t('insights.reports.to')}<input type="date" required value={config.period.to ?? ''} onChange={(event) => setConfig({ ...config, period: { ...config.period, to: event.target.value } })}/></label>
        </div>}
        <fieldset>
          <legend>{t('insights.builder.columns')}</legend>
          {(Object.entries(COLUMN_GROUPS) as [keyof typeof COLUMN_GROUPS, readonly ColumnCode[]][]).map(([group, columns]) => <div key={group} className="insights-check-group">
            <p className="insights-check-title">{t(`insights.builder.group.${group}` as AppKey)}</p>
            <div className="insights-check-row">{columns.map((column) => <label key={column} className="check"><input type="checkbox" checked={config.columns.includes(column)} onChange={() => toggleColumn(column)}/>{t(`insights.builder.col.${column}` as AppKey)}</label>)}</div>
          </div>)}
        </fieldset>
        <details className="insights-filters">
          <summary>{t('insights.builder.filters')}{config.filters.department_ids.length + config.filters.job_roles.length + config.filters.levels.length + (config.filters.seat === 'any' ? 0 : 1) > 0 ? ` · ${config.filters.department_ids.length + config.filters.job_roles.length + config.filters.levels.length + (config.filters.seat === 'any' ? 0 : 1)}` : ''}</summary>
          {departments.length > 0 && <fieldset><legend>{t('insights.col.department')}</legend><div className="insights-check-row">
            {departments.map((entry) => <label key={entry.id} className="check"><input type="checkbox" checked={config.filters.department_ids.includes(entry.id)} onChange={() => toggle('department_ids', entry.id)}/>{entry.name}</label>)}
            <label className="check"><input type="checkbox" checked={config.filters.department_ids.includes('none')} onChange={() => toggle('department_ids', 'none')}/>{t('insights.noDepartment')}</label>
          </div></fieldset>}
          <fieldset><legend>{t('insights.gap.jobRole')}</legend><div className="insights-check-row">
            {JOB_ROLES.map((role) => <label key={role} className="check"><input type="checkbox" checked={config.filters.job_roles.includes(role)} onChange={() => toggle('job_roles', role)}/>{t(`job.${role}` as AppKey)}</label>)}
          </div></fieldset>
          <fieldset><legend>{t('insights.col.level')}</legend><div className="insights-check-row">
            {[...LEVEL_CODES, 'none' as const].map((level) => <label key={level} className="check"><input type="checkbox" checked={config.filters.levels.includes(level)} onChange={() => toggle('levels', level)}/>{level === 'none' ? t('level.none') : LEVEL_SHORT[level]}</label>)}
          </div></fieldset>
          <label>{t('insights.builder.seat')}
            <select value={config.filters.seat} onChange={(event) => setConfig({ ...config, filters: { ...config.filters, seat: event.target.value as ViewConfig['filters']['seat'] } })}>
              <option value="any">{t('insights.builder.seatAny')}</option><option value="yes">{t('insights.builder.seatYes')}</option><option value="no">{t('insights.builder.seatNo')}</option>
            </select>
          </label>
        </details>
        <div className="company-actions">
          <button disabled={busy || config.columns.length === 0}>{busy ? t('common.loading') : t('insights.builder.run')}</button>
          {result && config.columns.length > 0 && <CsvButton path={`orgs/${org.id}/insights/builder/export`} body={{ config, labels }} label={t('insights.builder.export')}/>}
        </div>
        <div className="insights-save-view">
          <label>{t('insights.builder.viewName')}<input minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)}/></label>
          <div className="company-actions">
            {active?.can_edit && <button type="button" className="quiet" disabled={busy || name.trim().length < 2 || config.columns.length === 0} onClick={() => void save(false)}>{t('insights.builder.update')}</button>}
            <button type="button" className="quiet" disabled={busy || name.trim().length < 2 || config.columns.length === 0} onClick={() => void save(true)}>{t('insights.builder.saveNew')}</button>
            {active?.can_edit && <button type="button" className="quiet" disabled={busy} onClick={() => void remove()}>{t('common.delete')}</button>}
          </div>
        </div>
      </form>
      <p className="hint">{t('insights.builder.savedNote')}</p>
    </Panel>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {views.error && <Problem message={views.error} retry={() => void views.reload()}/>}
    {busy && !result && <Loading/>}

    {result && <Panel id="builder-result" title={t('insights.builder.result', { from: f.date(result.range.from), to: f.date(result.range.to) })}>
      {result.scope.department && <p className="hint">{t('insights.scope.department', { name: result.scope.department.name })}</p>}
      {result.scope.unassigned && <p className="notice" role="status">{t('insights.scope.unassigned')}</p>}
      {result.rows.length === 0 ? <p className="insights-empty">{t('insights.builder.empty')}</p> : <div className="company-table-wrap">
        <table className="company-table">
          <thead><tr>
            <th scope="col">{t(`insights.builder.rows.${result.config.rows}` as AppKey)}</th>
            {ordered.map((column) => <th key={column} scope="col">{t(`insights.builder.col.${column}` as AppKey)}</th>)}
          </tr></thead>
          <tbody>
            {result.rows.map((row) => <tr key={row.key}>
              <th scope="row">{rowLabel(row, t)}</th>
              {ordered.map((column) => <td key={column}><Cell column={column} value={row.values[column]}/></td>)}
            </tr>)}
          </tbody>
          <tfoot><tr>
            <th scope="row">{t('insights.builder.total')}</th>
            {ordered.map((column) => <td key={column}><strong><Cell column={column} value={result.total[column]}/></strong></td>)}
          </tr></tfoot>
        </table>
      </div>}
      <p className="hint">{t('insights.builder.consent', { sharing: result.sharing, people: result.people })}</p>
    </Panel>}
  </div>;
}

function rowLabel(row: BuilderResult['rows'][number], t: ReturnType<typeof useAppT>): string {
  if (row.kind === 'department') return row.label ?? t('insights.noDepartment');
  if (row.kind === 'job_role') return t(`job.${row.key}` as AppKey);
  if (row.kind === 'level') return row.key === 'none' ? t('level.none') : LEVEL_SHORT[row.key as LevelCode];
  return row.label ?? '—';
}

function Cell({ column, value }: { column: ColumnCode; value: number | string | null | undefined }) {
  const f = useFormat();
  if (value === null || value === undefined) return <>—</>;
  if (column === 'avg_level') return <LevelBadge level={value as LevelCode}/>;
  if (column === 'compliance_pct') return <>{value}%</>;
  return <>{typeof value === 'number' ? f.num(value) : value}</>;
}
