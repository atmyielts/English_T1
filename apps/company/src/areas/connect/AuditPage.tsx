// The workspace audit log with filters and a CSV download.
import React, { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { useWorkspace } from '../../session.tsx';
import { Page, saveFile, Status, useAction, useDateText, useOrgPath } from './shared.tsx';

interface Entry { id: number | string; actor: string | null; actor_name: string | null; action: string; target: string | null; details: Record<string, unknown>; created_at: string }
interface Answer { entries: Entry[]; next_offset: number | null; actors: { id: string; name: string }[] }
const GROUPS = ['member', 'invite', 'settings', 'import', 'api', 'api_key', 'webhook', 'privacy', 'brand', 'connect'] as const;
const groupFilter = (group: string) => group === 'api' ? 'api.' : `${group}.`;

export function AuditPage() {
  const t = useAppT(), { when } = useDateText();
  const { org } = useWorkspace();
  const path = useOrgPath(org.id);
  const [form, setForm] = useState({ group: '', actor: '', from: '', to: '' });
  const [applied, setApplied] = useState(form);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [actors, setActors] = useState<Answer['actors']>([]);
  const [next, setNext] = useState<number | null>(null);
  const { busy, error, run } = useAction();

  const filters = () => {
    const query = new URLSearchParams();
    if (applied.group) query.set('action', groupFilter(applied.group));
    if (applied.actor) query.set('actor', applied.actor);
    if (applied.from) query.set('from', applied.from);
    if (applied.to) query.set('to', applied.to);
    return query;
  };
  const load = (offset: number) => run(async () => {
    const query = filters();
    query.set('limit', '50');
    query.set('offset', String(offset));
    return await api<Answer>(`${path('audit')}?${query}`);
  }, (result) => {
    setEntries((current) => offset === 0 ? result.entries : [...(current ?? []), ...result.entries]);
    setActors(result.actors);
    setNext(result.next_offset);
  });
  useEffect(() => { void load(0); }, [applied, org.id]);
  const exportCsv = () => void run(() => api<{ csv: string }>(`${path('audit/export')}?${filters()}`), (result) => { saveFile('audit-log.csv', `﻿${result.csv}`, 'text/csv;charset=utf-8'); });

  return <Page title={t('connect.audit.title')} lead={t('connect.audit.lead')}>
    <section aria-label={t('connect.audit.title')}>
      <form className="company-toolbar connect-toolbar" onSubmit={(event) => { event.preventDefault(); setApplied({ ...form }); }}>
        <label>{t('connect.audit.group')}
          <select value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value })}>
            <option value="">{t('connect.audit.group.all')}</option>
            {GROUPS.map((group) => <option key={group} value={group}>{t(`connect.audit.group.${group}` as AppKey)}</option>)}
          </select>
        </label>
        <label>{t('connect.audit.actor')}
          <select value={form.actor} onChange={(event) => setForm({ ...form, actor: event.target.value })}>
            <option value="">{t('connect.audit.anyone')}</option>
            {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
          </select>
        </label>
        <label>{t('connect.audit.from')}<input type="date" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })}/></label>
        <label>{t('connect.audit.to')}<input type="date" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })}/></label>
        <button disabled={busy}>{t('connect.audit.apply')}</button>
        <button type="button" className="quiet" disabled={busy} onClick={exportCsv}>{t('connect.audit.export')}</button>
      </form>
      <Status error={error}/>
      {!entries ? !error && <p role="status">{t('app.loading')}</p>
        : !entries.length ? <p className="connect-empty">{t('connect.audit.empty')}</p>
        : <div className="company-table-wrap"><table className="company-table connect-audit">
          <thead><tr><th>{t('connect.audit.when')}</th><th>{t('connect.audit.actor')}</th><th>{t('connect.audit.action')}</th><th>{t('connect.audit.details')}</th></tr></thead>
          <tbody>{entries.map((entry) => <tr key={String(entry.id)}>
            <td className="connect-nowrap">{when(entry.created_at)}</td>
            <td>{entry.actor_name ?? t('connect.audit.system')}</td>
            <td><code>{entry.action}</code></td>
            <td className="connect-audit-details">{Object.keys(entry.details ?? {}).length ? <code>{JSON.stringify(entry.details)}</code> : '—'}</td>
          </tr>)}</tbody>
        </table></div>}
      {next !== null && <button type="button" className="quiet connect-more" disabled={busy} onClick={() => void load(next)}>{t('connect.audit.more')}</button>}
    </section>
  </Page>;
}
