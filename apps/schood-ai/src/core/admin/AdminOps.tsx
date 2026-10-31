import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { useI18n, useT } from '../i18n/index.ts';
import { EmptyState, LoadingState } from '../states.tsx';
import { Badge, Button, Field, TextInput } from '../ui.tsx';
import { adminApi, type AdminWorkspace, type AuditView, type ReportView } from './api.ts';
import { AdminError, Notice, Section, SwitchesEditor, useAdminLoad } from './shared.tsx';

// Operations: find a workspace (switch features off for it, suspend it, grant
// support credits), the report queue, and the audit log.

export function WorkspacesTab() {
  const t = useT();
  const [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const { data, error, loading, reload } = useAdminLoad(() => adminApi.workspaces(search), [search]);
  return <>
    <form onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); }} className="mb-4 flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-xs font-semibold text-gray-700">{t('admin.ws.search')}
        <TextInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} className="mt-1"/>
      </label>
      <Button type="submit" icon={<Search size={14} aria-hidden="true"/>}>{t('admin.ws.find')}</Button>
    </form>
    {loading && !data ? <LoadingState/> : error || !data ? <AdminError error={error} onRetry={reload}/> : !data.length ? <EmptyState title={t('admin.ws.empty')}/> :
      data.map((workspace) => <WorkspaceCard key={workspace.id} initial={workspace}/>)}
  </>;
}

function WorkspaceCard({ initial }: { initial: AdminWorkspace }) {
  const t = useT(), { date, number } = useI18n();
  const [ws, setWs] = useState(initial), [features, setFeatures] = useState(initial.features);
  const [state, setState] = useState<{ busy: boolean; error: unknown; notice: string }>({ busy: false, error: null, notice: '' });
  const [grant, setGrant] = useState({ amount: '', reference: '', note: '' });
  const act = async (work: () => Promise<string>) => {
    setState({ busy: true, error: null, notice: '' });
    try { setState({ busy: false, error: null, notice: await work() }); } catch (error) { setState({ busy: false, error, notice: '' }); }
  };
  const saveWorkspace = (patch: { features?: Record<string, boolean>; status?: 'active' | 'suspended' }) => act(async () => {
    const saved = await adminApi.saveWorkspace(ws.id, patch);
    setWs(saved); setFeatures(saved.features);
    return t('admin.saved');
  });
  const submitGrant = (event: FormEvent) => {
    event.preventDefault();
    void act(async () => {
      const balance = await adminApi.grant(ws.id, Number(grant.amount), grant.reference.trim(), grant.note.trim());
      setGrant({ amount: '', reference: '', note: '' });
      return t('admin.ws.granted', { total: number(balance.total) });
    });
  };
  return <Section title={<span className="inline-flex flex-wrap items-center gap-2">{ws.name}<Badge>{t(`admin.ws.kind.${ws.kind}`)}</Badge><Badge tone={ws.status === 'active' ? 'lime' : 'danger'}>{t(`admin.ws.status.${ws.status}`)}</Badge></span>}
    lead={<span className="break-all font-mono text-xs">{ws.id}{ws.contract_plan && ws.contract_until ? ` · ${t('admin.ws.contract', { plan: ws.contract_plan, date: date(ws.contract_until, { dateStyle: 'medium' }) })}` : ''}</span>}
    actions={<Button variant={ws.status === 'active' ? 'danger' : 'secondary'} size="sm" disabled={state.busy}
      onClick={() => { if (ws.status === 'active' && !confirm(t('admin.ws.suspendConfirm'))) return; void saveWorkspace({ status: ws.status === 'active' ? 'suspended' : 'active' }); }}>
      {t(ws.status === 'active' ? 'admin.ws.suspend' : 'admin.ws.activate')}</Button>}>
    {state.notice && <Notice>{state.notice}</Notice>}
    {state.error !== null && <div className="mb-4"><AdminError error={state.error}/></div>}
    <h3 className="m-0 mb-2 text-sm font-semibold">{t('admin.ws.switches')}</h3>
    <SwitchesEditor value={features} disabled={state.busy} onChange={setFeatures}/>
    <div className="mt-3"><Button size="sm" disabled={state.busy} onClick={() => void saveWorkspace({ features })}>{t('admin.save')}</Button></div>
    <h3 className="mb-2 mt-6 text-sm font-semibold">{t('admin.ws.grant')}</h3>
    <form onSubmit={submitGrant} className="grid gap-3 md:grid-cols-[8rem_1fr_1fr_auto] md:items-end">
      <Field label={t('admin.ws.amount')}>{(id) => <TextInput id={id} type="number" min={1} max={1000000} required value={grant.amount} onChange={(event) => setGrant({ ...grant, amount: event.target.value })}/>}</Field>
      <Field label={t('admin.ws.reference')}>{(id) => <TextInput id={id} required maxLength={100} value={grant.reference} onChange={(event) => setGrant({ ...grant, reference: event.target.value })}/>}</Field>
      <Field label={t('admin.ws.note')}>{(id) => <TextInput id={id} maxLength={300} value={grant.note} onChange={(event) => setGrant({ ...grant, note: event.target.value })}/>}</Field>
      <Button type="submit" variant="secondary" disabled={state.busy || !grant.amount || !grant.reference.trim()}>{t('admin.ws.grant')}</Button>
    </form>
  </Section>;
}

export function ReportsTab() {
  const t = useT(), { date } = useI18n();
  const [status, setStatus] = useState<ReportView['status']>('open');
  const { data, error, loading, reload } = useAdminLoad(() => adminApi.reports(status), [status]);
  const [problem, setProblem] = useState<unknown>(null);
  const review = async (id: string, next: 'reviewed' | 'dismissed') => {
    setProblem(null);
    try { await adminApi.reviewReport(id, next); reload(); } catch (cause) { setProblem(cause); }
  };
  return <>
    <div role="group" aria-label={t('admin.tab.reports')} className="mb-4 flex flex-wrap gap-1 rounded-full border border-navy-line bg-white/80 p-1">
      {(['open', 'reviewed', 'dismissed'] as const).map((value) => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}
        className={`min-h-9 rounded-full px-3 text-xs font-semibold ${status === value ? 'bg-navy text-white' : 'text-gray-800 hover:bg-cream'}`}>{t(`admin.reports.status.${value}`)}</button>)}
    </div>
    {problem !== null && <div className="mb-4"><AdminError error={problem}/></div>}
    {loading && !data ? <LoadingState/> : error || !data ? <AdminError error={error} onRetry={reload}/> : !data.length ? <EmptyState title={t('admin.reports.empty')}/> :
      <ul className="m-0 grid list-none gap-2 p-0">{data.map((report) => <li key={report.id} className="rounded-2xl border border-navy-line/25 bg-white p-4 text-sm">
        <p className="m-0 flex flex-wrap items-center gap-2 font-semibold">{t('admin.reports.reason', { reason: t(`report.reason.${report.reason}`) })}<span className="text-xs font-normal text-gray-600">{date(report.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</span></p>
        {report.note && <p className="mb-0 mt-1 text-gray-800">{report.note}</p>}
        {report.excerpt && <blockquote className="mb-0 mt-2 border-l-4 border-lime pl-3 text-gray-700">{report.excerpt}</blockquote>}
        {report.status === 'open' && <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void review(report.id, 'reviewed')}>{t('admin.reports.review')}</Button>
          <Button size="sm" variant="secondary" onClick={() => void review(report.id, 'dismissed')}>{t('admin.reports.dismiss')}</Button>
        </div>}
      </li>)}</ul>}
  </>;
}

export function AuditTab() {
  const t = useT(), { date } = useI18n();
  const [form, setForm] = useState({ event: '', workspace_id: '' }), [filter, setFilter] = useState({ event: '', workspace_id: '' });
  const [older, setOlder] = useState<AuditView[]>([]), [more, setMore] = useState<unknown>(null);
  const { data, error, loading, reload } = useAdminLoad(() => { setOlder([]); return adminApi.audit(filter); }, [filter]);
  const rows = [...(data ?? []), ...older];
  const loadOlder = async () => {
    try { setOlder([...older, ...await adminApi.audit({ ...filter, before: rows.at(-1)?.id })]); } catch (cause) { setMore(cause); }
  };
  return <>
    <form onSubmit={(event) => { event.preventDefault(); setFilter({ event: form.event.trim(), workspace_id: form.workspace_id.trim() }); }} className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <label className="text-xs font-semibold text-gray-700">{t('admin.audit.event')}<TextInput value={form.event} onChange={(event) => setForm({ ...form, event: event.target.value })} placeholder="admin." maxLength={80} className="mt-1"/></label>
      <label className="text-xs font-semibold text-gray-700">{t('admin.audit.workspace')}<TextInput value={form.workspace_id} onChange={(event) => setForm({ ...form, workspace_id: event.target.value })} maxLength={36} className="mt-1 font-mono"/></label>
      <Button type="submit" variant="secondary">{t('admin.audit.filter')}</Button>
    </form>
    {loading && !data ? <LoadingState/> : error || !data ? <AdminError error={error} onRetry={reload}/> : !rows.length ? <EmptyState title={t('admin.audit.empty')}/> : <>
      <ul className="m-0 grid list-none gap-1 p-0">{rows.map((row) => <li key={row.id} className="rounded-xl border border-navy-line/20 bg-white px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <code className="font-semibold text-gray-900">{row.event}</code>
          <span className="text-gray-600">{date(row.created_at, { dateStyle: 'medium', timeStyle: 'medium' })}</span>
          {row.target_type && <span className="break-all text-gray-700">{row.target_type}: {row.target_id}</span>}
          {row.actor_id && <span className="text-gray-600">{t('admin.audit.actor', { actor: row.actor_id.slice(0, 8) })}</span>}
        </div>
        {Object.keys(row.details).length > 0 && <pre className="m-0 mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-gray-700">{JSON.stringify(row.details)}</pre>}
      </li>)}</ul>
      {more !== null && <div className="mt-3"><AdminError error={more}/></div>}
      {rows.length % 100 === 0 && <div className="mt-3"><Button variant="secondary" size="sm" onClick={() => void loadOlder()}>{t('admin.loadMore')}</Button></div>}
    </>}
  </>;
}

