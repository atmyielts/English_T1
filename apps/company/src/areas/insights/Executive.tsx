// /w/:org/executive — one printable page for the CEO or the board, in Russian, Uzbek
// or English whatever the app's language. A month can be saved so what was shown does
// not change later; an optional AI commentary is written from the numbers only.
import React, { useMemo, useState } from 'react';
import { INTL, type Locale } from '../../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, useErrorText } from '../../i18n/index.ts';
import { navigate, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi, type LevelCode } from './api.ts';
import type { ExecData, Executive as ExecutiveData, Narrative } from './api2.ts';
import { LEVEL_CODES, LEVEL_SHORT, Loading, Panel, Problem, tashkentToday, useFormat } from './ui.tsx';
import { LocalePicker, useTranslator } from './parts.tsx';

const MAX_DEPARTMENTS = 8;
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

const monthName = (month: string, locale: Locale) => {
  const [year, value] = month.split('-').map(Number);
  if (locale === 'uz') return `${year}-yil, ${UZ_MONTHS[value - 1]}`;
  return new Intl.DateTimeFormat(INTL[locale], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, value - 1, 1)));
};
const lastMonths = (today: string, count: number) => Array.from({ length: count }, (_, index) => {
  const [year, month] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 - index, 1)).toISOString().slice(0, 7);
});
const share = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 100) : null;

export function Executive() {
  const t = useAppT(), f = useFormat(), problem = useErrorText();
  const { locale } = useI18n();
  const { org } = useWorkspace();
  const { query } = useLocation();
  const today = tashkentToday();
  const month = query.get('month') || today.slice(0, 7);
  const snapshot = query.get('snapshot');
  const [reportLocale, setReportLocale] = useState<Locale>(locale);
  const params = new URLSearchParams({ month });
  if (snapshot) params.set('snapshot', snapshot);
  const { data, error, loading, reload } = useApi<ExecutiveData>(`orgs/${org.id}/insights/executive?${params}`);
  const [busy, setBusy] = useState(''), [actionError, setActionError] = useState(''), [notice, setNotice] = useState('');
  const [fresh, setFresh] = useState<Record<string, Narrative>>({});
  const go = (next: { month?: string; snapshot?: string | null }) => {
    const out = new URLSearchParams({ month: next.month ?? month });
    if (next.snapshot) out.set('snapshot', next.snapshot);
    navigate(`/w/${org.id}/executive?${out}`, { replace: true });
    setFresh({});
  };
  async function save() {
    setBusy('save'); setActionError(''); setNotice('');
    try {
      const { snapshot: saved } = await api<{ snapshot: { id: string } }>(`orgs/${org.id}/insights/snapshots`, { method: 'POST', body: { month, narratives: { ...(data?.narratives ?? {}), ...fresh } } });
      setNotice(t('insights.exec.saved'));
      go({ snapshot: saved.id });
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy('');
    }
  }
  async function write() {
    setBusy('ai'); setActionError(''); setNotice('');
    try {
      const result = await api<{ status: 'ok' | 'limit' | 'unavailable'; narrative: Narrative | null }>(`orgs/${org.id}/insights/executive/narrative`, { method: 'POST', timeoutMs: 60000, body: { month, locale: reportLocale, snapshot: snapshot ?? undefined } });
      if (result.status === 'ok' && result.narrative) setFresh({ ...fresh, [reportLocale]: result.narrative });
      else setActionError(result.status === 'limit' ? t('insights.ai.limit') : t('insights.ai.unavailable'));
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy('');
    }
  }
  const months = useMemo(() => lastMonths(today, 13), [today]);
  const narrative = fresh[reportLocale] ?? data?.narratives?.[reportLocale] ?? null;

  return <div className="insights insights-more insights-exec">
    <header className="insights-head no-print">
      <div>
        <h1>{t('insights.exec.title')}</h1>
        <p className="insights-lead">{t('insights.exec.lead')}</p>
      </div>
      <div className="company-actions">
        <button className="quiet" onClick={() => print()}>{t('insights.exec.print')}</button>
      </div>
    </header>
    <form className="insights-range no-print" onSubmit={(event) => event.preventDefault()}>
      <label>{t('insights.exec.month')}
        <select value={month} onChange={(event) => go({ month: event.target.value })}>
          {months.map((value) => <option key={value} value={value}>{f.monthLong(`${value}-01`)}</option>)}
        </select>
      </label>
      <LocalePicker value={reportLocale} onChange={setReportLocale} label={t('insights.exec.language')}/>
      <button type="button" className="quiet" disabled={busy !== ''} onClick={() => void save()}>{busy === 'save' ? t('common.loading') : t('insights.exec.save')}</button>
      <button type="button" className="quiet" disabled={busy !== ''} onClick={() => void write()}>{busy === 'ai' ? t('insights.ai.writing') : narrative ? t('insights.ai.again') : t('insights.exec.writeAi')}</button>
    </form>
    {actionError && <p className="error no-print" role="alert">{actionError}</p>}
    {notice && <p className="notice no-print" role="status">{notice}</p>}
    {error && !data && <Problem message={error} retry={() => void reload()}/>}
    {loading && !data && <Loading/>}
    {data && <OnePager data={data} locale={reportLocale} narrative={narrative}/>}
    {data && <Panel id="exec-history" className="no-print" title={t('insights.exec.history')}>
      {data.history.length === 0 ? <p className="insights-empty">{t('insights.exec.noHistory')}</p> : <div className="company-table-wrap">
        <table className="company-table">
          <thead><tr>
            <th scope="col">{t('insights.exec.month')}</th><th scope="col">{t('insights.exec.kind')}</th><th scope="col">{t('insights.exec.compliance')}</th>
            <th scope="col">{t('insights.exec.active')}</th><th scope="col">{t('insights.exec.hours')}</th><th scope="col">{t('insights.exec.levelsGained')}</th><th scope="col"><span className="visually-hidden">{t('insights.framework.colActions')}</span></th>
          </tr></thead>
          <tbody>{data.history.map((row) => <tr key={row.id} className={data.frozen?.id === row.id ? 'insights-row-current' : undefined}>
            <th scope="row">{f.monthLong(`${row.period}-01`)}</th>
            <td>{row.kind === 'monthly' ? t('insights.exec.kindMonthly') : t('insights.exec.kindManual', { date: f.date(row.taken_on) })}</td>
            <td>{row.compliance_percent === null ? '—' : `${row.compliance_percent}%`}</td>
            <td>{f.num(row.active)}</td><td>{f.num(Math.round(row.minutes / 6) / 10)}</td><td>{f.num(row.levels_gained)}</td>
            <td><button className="quiet" onClick={() => go({ month: row.period, snapshot: row.id })}>{t('insights.exec.open')}</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <p className="hint">{t('insights.exec.historyNote')}</p>
    </Panel>}
  </div>;
}

function OnePager({ data, locale, narrative }: { data: ExecutiveData; locale: Locale; narrative: Narrative | null }) {
  const t = useTranslator(locale);
  const number = new Intl.NumberFormat(INTL[locale], { maximumFractionDigits: 1 });
  const num = (value: number | null | undefined) => value === null || value === undefined ? '—' : number.format(value);
  const d: ExecData = data.data;
  const compliance = share(d.compliance?.meets ?? 0, d.compliance?.with_requirement ?? 0);
  const hours = Math.round((d.activity?.minutes ?? 0) / 6) / 10;
  const levels = [...LEVEL_CODES, 'none' as const].filter((level) => (d.levels?.[level] ?? 0) > 0);
  const totalLevels = levels.reduce((sum, level) => sum + d.levels[level], 0);
  const departments = (d.departments ?? []).filter((row) => row.people > 0).sort((a, b) => b.people - a.people);
  const shown = departments.slice(0, MAX_DEPARTMENTS);
  // The month before, from what was saved for it: never recalculated, so the comparison holds still.
  const [year, value] = d.period.month.split('-').map(Number);
  const previousMonth = new Date(Date.UTC(year, value - 2, 1)).toISOString().slice(0, 7);
  const before = data.history.find((row) => row.period === previousMonth && row.kind === 'monthly') ?? data.history.find((row) => row.period === previousMonth) ?? null;
  const signed = (delta: number) => `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${num(Math.abs(delta))}`;
  const versus = (now: number | null, then: number | null | undefined, unit?: (text: string) => string) => {
    if (!before || now === null || then === null || then === undefined) return null;
    const text = signed(Math.round((now - then) * 10) / 10);
    return <small className="insights-onepager-delta">{t('insights.exec.vsMonth', { delta: unit ? unit(text) : text, month: monthName(previousMonth, locale) })}</small>;
  };
  const points = (text: string) => t('insights.exec.points', { delta: text });
  return <article className="insights-onepager" aria-label={t('insights.exec.title')}>
    <header>
      <div>
        <p className="eyebrow">{t('insights.exec.docTitle')}</p>
        <h2>{data.org.name}</h2>
        <p>{monthName(d.period.month, locale)}</p>
      </div>
      <p className="insights-onepager-stamp">
        {data.frozen ? <>{t('insights.exec.frozen', { date: data.frozen.taken_on })}</> : t('insights.exec.liveAt', { date: data.today })}
      </p>
    </header>

    {narrative && <section className="insights-onepager-note">
      <p className="eyebrow">{t('insights.exec.aiBadge')}</p>
      {narrative.headline && <h3>{narrative.headline}</h3>}
      {narrative.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      {narrative.numbers_to_check.length > 0 && <p className="insights-onepager-check">{t('insights.exec.checkNumbers', { numbers: narrative.numbers_to_check.join(', ') })}</p>}
    </section>}

    <dl className="insights-onepager-kpis">
      <div><dt>{t('insights.exec.compliance')}</dt><dd>{compliance === null ? '—' : `${compliance}%`}</dd><small>{d.compliance?.with_requirement ? t('common.of', { done: num(d.compliance.meets), total: num(d.compliance.with_requirement) }) : t('insights.exec.noFramework')}</small>{versus(compliance, before?.compliance_percent, points)}</div>
      <div><dt>{t('insights.exec.tested')}</dt><dd>{num(d.people?.tested)}</dd><small>{t('insights.exec.ofPeople', { count: num(d.people?.people) })}</small>{versus(d.people?.tested ?? 0, before?.tested)}</div>
      <div><dt>{t('insights.exec.active')}</dt><dd>{num(d.activity?.active)}</dd><small>{t('insights.exec.ofSharing', { count: num(d.people?.sharing) })}</small>{versus(d.activity?.active ?? 0, before?.active)}</div>
      <div><dt>{t('insights.exec.hours')}</dt><dd>{num(hours)}</dd><small>{t('insights.exec.lessons', { count: num(d.activity?.lessons) })}</small>{versus(hours, before ? Math.round(before.minutes / 6) / 10 : null)}</div>
      <div><dt>{t('insights.exec.levelsGained')}</dt><dd>{num(d.movement?.levels_gained)}</dd><small>{t('insights.exec.movedUp', { count: num(d.movement?.up) })}</small>{versus(d.movement?.levels_gained ?? 0, before?.levels_gained)}</div>
      <div><dt>{t('insights.exec.avgScore')}</dt><dd>{num(d.avg_score)}</dd><small>{t('insights.exec.outOf100')}</small></div>
    </dl>

    <section>
      <h3>{t('insights.exec.levels')}</h3>
      {totalLevels === 0 ? <p>{t('insights.empty.levels')}</p> : <>
        <div className="insights-strip" role="img" aria-label={levels.map((level) => `${level === 'none' ? t('level.none') : LEVEL_SHORT[level as LevelCode]}: ${d.levels[level]}`).join(', ')}>
          {levels.map((level) => <span key={level} className={`insights-fill-${level}`} style={{ flexGrow: d.levels[level] }}>{d.levels[level] / totalLevels >= 0.08 ? `${level === 'none' ? '—' : LEVEL_SHORT[level as LevelCode]} ${d.levels[level]}` : ''}</span>)}
        </div>
        <p className="insights-onepager-small">{levels.map((level) => `${level === 'none' ? t('level.none') : LEVEL_SHORT[level as LevelCode]}: ${d.levels[level]}`).join(' · ')}</p>
      </>}
    </section>

    <section>
      <h3>{t('insights.exec.departments')}</h3>
      {shown.length === 0 ? <p>{t('insights.exec.noDepartments')}</p> : <table className="insights-onepager-table">
        <thead><tr>
          <th scope="col">{t('insights.col.department')}</th><th scope="col">{t('insights.col.people')}</th><th scope="col">{t('insights.exec.tested')}</th>
          <th scope="col">{t('insights.exec.compliance')}</th><th scope="col">{t('insights.exec.active')}</th><th scope="col">{t('insights.exec.hours')}</th><th scope="col">{t('insights.exec.movedUpCol')}</th>
        </tr></thead>
        <tbody>{shown.map((row) => {
          const percent = share(row.meets, row.with_requirement);
          return <tr key={row.id ?? 'none'}>
            <th scope="row">{row.name ?? t('insights.noDepartment')}</th><td>{num(row.people)}</td><td>{num(row.tested)}</td><td>{percent === null ? '—' : `${percent}%`}</td>
            <td>{num(row.active)}</td><td>{num(Math.round(row.minutes / 6) / 10)}</td><td>{num(row.moved_up)}</td>
          </tr>;
        })}</tbody>
      </table>}
      {departments.length > shown.length && <p className="insights-onepager-small">{t('insights.exec.moreDepartments', { count: departments.length - shown.length })}</p>}
    </section>

    <div className="insights-onepager-two">
      <section>
        <h3>{t('insights.exec.movement')}</h3>
        <ul className="insights-onepager-list">
          <li>{t('insights.exec.moveUp', { count: num(d.movement?.up) })}</li>
          <li>{t('insights.exec.moveSame', { count: num(d.movement?.same) })}</li>
          <li>{t('insights.exec.moveDown', { count: num(d.movement?.down) })}</li>
          <li>{t('insights.exec.moveFirst', { count: num(d.movement?.first) })}</li>
          {(d.compliance?.overdue ?? 0) > 0 && <li>{t('insights.exec.overdue', { count: num(d.compliance.overdue) })}</li>}
          {(d.hiring?.graded ?? 0) > 0 && <li>{t('insights.exec.hiring', { graded: num(d.hiring.graded), shortlisted: num(d.hiring.shortlisted) })}</li>}
        </ul>
      </section>
      <section>
        <h3>{t('insights.exec.spend')}</h3>
        {(d.spend ?? []).length === 0 ? <p className="insights-onepager-small">{t('insights.exec.noSpend')}</p> : <ul className="insights-onepager-list">
          {d.spend.map((row) => {
            const money = new Intl.NumberFormat(INTL[locale], { maximumFractionDigits: 2 });
            const per = (by: number) => by > 0 ? `${money.format(Math.round(row.total / by * 100) / 100)} ${row.currency}` : '—';
            return <li key={row.currency}>
              <strong>{money.format(row.total)} {row.currency}</strong>
              <small>{t('insights.exec.perActive', { value: per(d.activity?.active ?? 0) })} · {t('insights.exec.perLevel', { value: per(d.movement?.levels_gained ?? 0) })} · {t('insights.exec.perHour', { value: per(hours) })}</small>
            </li>;
          })}
        </ul>}
      </section>
    </div>
    <footer>{t('insights.exec.footnote')} {t('insights.estimateNote')}</footer>
  </article>;
}
