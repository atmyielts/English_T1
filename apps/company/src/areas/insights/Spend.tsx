// /w/:org/spend — HR enters what training cost and when; the page divides. Each
// currency stands alone: nothing is converted, and there are no benchmarks.
import React, { useState, type FormEvent } from 'react';
import { INTL } from '../../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { navigate, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi } from './api.ts';
import { CURRENCIES, SPEND_CATEGORIES, type SpendData, type SpendEntry } from './api2.ts';
import { Kpi, Loading, Panel, Problem, tashkentToday, useFormat } from './ui.tsx';
import { CsvButton, PeriodForm } from './parts.tsx';

interface Draft { id: string | null; spent_on: string; amount: string; currency: string; category: string; description: string }

export function useMoney() {
  const { locale } = useI18n();
  const number = new Intl.NumberFormat(INTL[locale], { maximumFractionDigits: 2 });
  return (value: number | null | undefined, currency: string) => value === null || value === undefined ? '—' : `${number.format(value)} ${currency}`;
}

export function Spend() {
  const t = useAppT(), f = useFormat(), problem = useErrorText(), money = useMoney();
  const { org } = useWorkspace();
  const { query } = useLocation();
  const today = tashkentToday();
  const from = query.get('from') || `${today.slice(0, 4)}-01-01`, to = query.get('to') || today;
  const { data, error, loading, reload } = useApi<SpendData>(`orgs/${org.id}/insights/spend?from=${from}&to=${to}`);
  const blank: Draft = { id: null, spent_on: today, amount: '', currency: data?.entries[0]?.currency ?? 'UZS', category: 'schood', description: '' };
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true); setActionError('');
    try {
      const body = { spent_on: draft.spent_on, amount: draft.amount, currency: draft.currency, category: draft.category, description: draft.description };
      await api(draft.id ? `orgs/${org.id}/insights/spend/${draft.id}` : `orgs/${org.id}/insights/spend`, { method: draft.id ? 'PATCH' : 'POST', body });
      setDraft(null);
      await reload();
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(entry: SpendEntry) {
    if (!confirm(t('insights.spend.deleteConfirm'))) return;
    setBusy(true); setActionError('');
    try {
      await api(`orgs/${org.id}/insights/spend/${entry.id}`, { method: 'DELETE' });
      await reload();
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const go = (range: { from: string; to: string }) => navigate(`/w/${org.id}/spend?from=${range.from}&to=${range.to}`, { replace: true });

  return <div className="insights insights-more">
    <header className="insights-head">
      <div>
        <h1>{t('insights.spend.title')}</h1>
        <p className="insights-lead">{t('insights.spend.lead')}</p>
      </div>
      {!draft && <div className="company-actions"><button onClick={() => setDraft(blank)}>{t('insights.spend.add')}</button></div>}
    </header>
    <PeriodForm key={`${from}|${to}`} from={from} to={to} onApply={go}/>
    {actionError && <p className="error" role="alert">{actionError}</p>}

    {draft && <Panel id="spend-form" title={draft.id ? t('insights.spend.edit') : t('insights.spend.add')}>
      <form className="insights-form" onSubmit={submit}>
        <div className="insights-form-row">
          <label>{t('insights.spend.date')}<input type="date" required max={today} value={draft.spent_on} onChange={(event) => setDraft({ ...draft, spent_on: event.target.value })}/></label>
          <label>{t('insights.spend.amount')}<input required inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })}/></label>
        </div>
        <div className="insights-form-row">
          <label>{t('insights.spend.currency')}<select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })}>{CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
          <label>{t('insights.spend.category')}<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{SPEND_CATEGORIES.map((code) => <option key={code} value={code}>{t(`insights.spend.cat.${code}` as AppKey)}</option>)}</select></label>
        </div>
        <label>{t('insights.spend.description')} <span className="hint">{t('common.optional')}</span><input maxLength={300} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })}/></label>
        <div className="company-actions">
          <button disabled={busy}>{t('common.save')}</button>
          <button type="button" className="quiet" onClick={() => setDraft(null)}>{t('common.cancel')}</button>
        </div>
      </form>
    </Panel>}

    {error && !data && <Problem message={error} retry={() => void reload()}/>}
    {loading && !data && <Loading/>}
    {data && <>
      <Panel id="spend-outcome" title={t('insights.spend.outcome')}>
        <ul className="insights-movement">
          <li><strong>{f.num(data.outcome.active)}</strong><span>{t('insights.spend.activeLearners')}</span></li>
          <li><strong>{f.minutes(data.outcome.minutes)}</strong><span>{t('insights.spend.learningTime')}</span></li>
          <li><strong>{f.num(data.outcome.levels_gained)}</strong><span>{t('insights.spend.levelsGained')}</span></li>
          <li><strong>{f.num(data.outcome.moved_up)}</strong><span>{t('insights.spend.movedUp')}</span></li>
        </ul>
        <p className="hint">{t('insights.spend.consent', { sharing: data.outcome.sharing, learners: data.outcome.learners })}</p>
      </Panel>

      {data.value.length === 0 ? <Panel title={t('insights.spend.value')}><p className="insights-empty">{t('insights.spend.empty')}</p></Panel>
        : data.value.map((row) => <Panel key={row.currency} id={`spend-${row.currency}`} title={t('insights.spend.valueIn', { currency: row.currency })}>
          <div className="company-stats insights-kpis">
            <Kpi label={t('insights.spend.total')} value={money(row.total, row.currency)} note={t('insights.spend.entries', { count: row.entries })}/>
            <Kpi label={t('insights.spend.perActive')} value={money(row.per_active, row.currency)} note={row.per_active === null ? t('insights.spend.noActive') : t('insights.spend.divided', { total: money(row.total, row.currency), by: f.num(data.outcome.active) })}/>
            <Kpi label={t('insights.spend.perLevel')} value={money(row.per_level, row.currency)} note={row.per_level === null ? t('insights.spend.noLevels') : t('insights.spend.divided', { total: money(row.total, row.currency), by: f.num(data.outcome.levels_gained) })}/>
            <Kpi label={t('insights.spend.perHour')} value={money(row.per_hour, row.currency)} note={row.per_hour === null ? t('insights.spend.noHours') : t('insights.spend.divided', { total: money(row.total, row.currency), by: t('insights.hours', { hours: f.num(Math.round(data.outcome.minutes / 6) / 10) }) })}/>
          </div>
          {row.by_category.length > 1 && <p className="hint">{row.by_category.map((entry) => `${t(`insights.spend.cat.${entry.category}` as AppKey)}: ${money(entry.total, row.currency)}`).join(' · ')}</p>}
        </Panel>)}
      {data.value.length > 1 && <p className="hint">{t('insights.spend.noConversion')}</p>}

      <Panel id="spend-entries" title={t('insights.spend.list')} actions={data.entries.length > 0 && <CsvButton path={`orgs/${org.id}/insights/spend?from=${from}&to=${to}&format=csv`} label={t('common.download')}/>}>
        {data.entries.length === 0 ? <p className="insights-empty">{t('insights.spend.noEntries')}</p> : <div className="company-table-wrap">
          <table className="company-table">
            <thead><tr>
              <th scope="col">{t('insights.spend.date')}</th><th scope="col">{t('insights.spend.amount')}</th><th scope="col">{t('insights.spend.category')}</th><th scope="col">{t('insights.spend.description')}</th>
              <th scope="col"><span className="visually-hidden">{t('insights.framework.colActions')}</span></th>
            </tr></thead>
            <tbody>{data.entries.map((entry) => <tr key={entry.id}>
              <th scope="row">{f.date(entry.spent_on)}</th><td>{money(entry.amount, entry.currency)}</td><td>{t(`insights.spend.cat.${entry.category}` as AppKey)}</td><td>{entry.description ?? '—'}</td>
              <td className="insights-row-actions">
                <button className="quiet" disabled={busy} onClick={() => setDraft({ id: entry.id, spent_on: entry.spent_on, amount: String(entry.amount), currency: entry.currency, category: entry.category, description: entry.description ?? '' })}>{t('common.edit')}</button>
                <button className="quiet" disabled={busy} onClick={() => void remove(entry)}>{t('common.delete')}</button>
              </td>
            </tr>)}</tbody>
          </table>
        </div>}
      </Panel>
      <p className="hint">{t('insights.spend.note')}</p>
    </>}
  </div>;
}
