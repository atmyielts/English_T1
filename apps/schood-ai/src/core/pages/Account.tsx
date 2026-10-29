import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pin, PinOff, Trash2 } from 'lucide-react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../api.ts';
import { ApproveRunCard } from '../cards.tsx';
import { useT } from '../i18n/index.ts';
import { Link, navigate } from '../router.tsx';
import { ApiErrorState, EmptyState, LoadingState } from '../states.tsx';
import type { ActionView, BalanceView, BudgetView, LedgerView, ThreadView } from '../types.ts';
import { Button, Card, Field, PageHeader, TextInput } from '../ui.tsx';
import { useWorkspace } from '../workspace.tsx';

// History, credits, approvals, workspace settings and not found.

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    load().then((data) => setState({ data, error: null, loading: false })).catch((error) => setState({ data: null, error, loading: false }));
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export function HistoryPage() {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n();
  const { data, error, loading, reload } = useLoad(() => api<{ threads: ThreadView[] }>('core/threads', { workspaceId: workspace.workspaceId }), [workspace.workspaceId]);
  const [notice, setNotice] = useState('');
  const remove = async (id: string | null) => {
    if (!confirm(t(id ? 'history.confirmOne' : 'history.confirmAll'))) return;
    await api('core/threads', { method: 'DELETE', workspaceId: workspace.workspaceId, body: id ? { id } : { all: true } });
    setNotice(t('history.deleted'));
    reload();
  };
  const pin = async (thread: ThreadView) => {
    await api('core/threads', { method: 'PATCH', workspaceId: workspace.workspaceId, body: { id: thread.id, pinned: !thread.pinned } });
    reload();
  };
  return <>
    <PageHeader title={t('history.title')} lead={t('history.lead')} actions={!!data?.threads.length && <Button variant="danger" onClick={() => void remove(null)} icon={<Trash2 size={16} aria-hidden="true"/>}>{t('history.deleteAll')}</Button>}/>
    {notice && <p role="status" className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {loading ? <LoadingState/> : error ? <ApiErrorState error={error} onRetry={reload}/> : !data?.threads.length ? <EmptyState title={t('history.empty')}/> :
      <ul className="m-0 grid list-none gap-2 p-0">{data.threads.map((thread) => <li key={thread.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-navy-line/20 bg-white/85 p-3">
        <Link to={`/assistant?thread=${encodeURIComponent(thread.id)}`} className="min-w-0 flex-1 truncate font-semibold text-gray-900 no-underline hover:underline">{thread.title || t('chat.newChat')}</Link>
        <span className="text-xs text-gray-600">{date(thread.last_message_at, { dateStyle: 'medium' })}</span>
        <Button variant="ghost" size="sm" onClick={() => void pin(thread)} icon={thread.pinned ? <PinOff size={14} aria-hidden="true"/> : <Pin size={14} aria-hidden="true"/>}>{t(thread.pinned ? 'history.unpin' : 'history.pin')}</Button>
        <Button variant="ghost" size="sm" onClick={() => void remove(thread.id)} icon={<Trash2 size={14} aria-hidden="true"/>}>{t('history.delete')}</Button>
      </li>)}</ul>}
  </>;
}

export function CreditsPage() {
  const t = useT(), workspace = useWorkspace(), { date, number } = useI18n();
  const { data, error, loading, reload } = useLoad(() => api<{ balance: BalanceView; budget: BudgetView | null; grant: number; ledger: LedgerView[] }>('core/credits', { workspaceId: workspace.workspaceId }), [workspace.workspaceId]);
  return <>
    <PageHeader title={t('credits.title')} lead={t('credits.lead')}/>
    {loading ? <LoadingState/> : error || !data ? <ApiErrorState error={error} onRetry={reload}/> : <>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="m-0 text-xs font-semibold uppercase tracking-wider text-gray-600">{t('credits.total')}</p><p className="m-0 mt-1 font-display text-3xl font-bold">{number(data.balance.total)}</p></Card>
        <Card><p className="m-0 text-xs font-semibold uppercase tracking-wider text-gray-600">{t('credits.plan')}</p><p className="m-0 mt-1 font-display text-3xl font-bold">{number(data.balance.plan)}</p>
          <p className="m-0 mt-2 text-xs text-gray-600">{data.balance.cycle_ends_at ? t('credits.renews', { date: date(data.balance.cycle_ends_at, { dateStyle: 'long' }) }) : t('credits.noPlan')}</p></Card>
        <Card><p className="m-0 text-xs font-semibold uppercase tracking-wider text-gray-600">{t('credits.pack')}</p><p className="m-0 mt-1 font-display text-3xl font-bold">{number(data.balance.pack)}</p></Card>
      </div>
      {data.budget && <Card className="mt-4"><p className="m-0 text-sm font-semibold text-gray-900">{t('credits.budget')}</p><p className="m-0 mt-1 text-sm text-gray-700">{t('home.credits.budget', { left: data.budget.left, limit: data.budget.limit })}</p></Card>}
      <h2 className="mb-3 mt-8 font-display text-xl font-bold">{t('credits.history')}</h2>
      {!data.ledger.length ? <EmptyState title={t('credits.empty')}/> : <div className="overflow-x-auto rounded-3xl border border-navy-line bg-white/85">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <tbody>{data.ledger.map((row) => <tr key={row.id} className="border-b border-gray-200 last:border-0">
            <td className="px-4 py-3 text-gray-600">{date(row.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</td>
            <td className="px-4 py-3 text-gray-900">{t(`credits.kind.${row.kind}`)}{row.credit_key && <span className="ml-2 text-xs text-gray-500">{row.credit_key}</span>}</td>
            <td className="px-4 py-3 text-gray-600">{row.mine ? t('credits.mine') : t('credits.someone')}</td>
            <td className={`px-4 py-3 text-right font-semibold ${row.delta < 0 ? 'text-gray-900' : 'text-green-700'}`}>{row.delta > 0 ? '+' : ''}{number(row.delta)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </>;
}

export function ApprovalsPage() {
  const t = useT(), workspace = useWorkspace();
  const { data, error, loading, reload } = useLoad(() => api<{ actions: ActionView[] }>('core/actions', { workspaceId: workspace.workspaceId }), [workspace.workspaceId]);
  return <>
    <PageHeader title={t('approvals.title')} lead={t('approvals.lead')}/>
    {loading ? <LoadingState/> : error ? <ApiErrorState error={error} onRetry={reload}/> : !data?.actions.length ? <EmptyState title={t('approvals.empty')}/> :
      <div className="grid gap-4">{data.actions.map((action) => <ApproveRunCard key={action.id} action={action}/>)}</div>}
  </>;
}

export function SettingsPage() {
  const t = useT(), workspace = useWorkspace();
  const me = workspace.me!;
  const ws = me.workspace, manager = ['owner', 'admin'].includes(ws.role);
  const [form, setForm] = useState({ name: ws.name, logo_url: ws.branding.logo_url ?? '', primary_color: ws.branding.primary_color ?? '#0f172a', accent_color: ws.branding.accent_color ?? '#b6f24a', assistant_name: ws.branding.assistant_name ?? '' });
  const [state, setState] = useState<{ busy: boolean; error: unknown; saved: boolean }>({ busy: false, error: null, saved: false });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setState({ busy: true, error: null, saved: false });
    try {
      await api('core/settings', { method: 'PATCH', workspaceId: workspace.workspaceId, body: {
        ...(ws.kind === 'centre' ? { name: form.name } : {}),
        branding: { logo_url: form.logo_url.trim() || null, primary_color: form.primary_color, accent_color: form.accent_color, assistant_name: form.assistant_name.trim() || null },
      } });
      setState({ busy: false, error: null, saved: true });
      await workspace.refresh();
    } catch (error) { setState({ busy: false, error, saved: false }); }
  };
  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
  return <>
    <PageHeader title={t('settings.title')}/>
    {ws.kind === 'centre' && <Card className="mb-6">
      <h2 className="m-0 mb-4 font-display text-xl font-bold">{t('settings.workspace')}</h2>
      {!manager && <p className="m-0 mb-4 text-sm text-gray-700">{t('settings.readOnly')}</p>}
      <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <fieldset disabled={!manager || state.busy} className="contents">
          <Field label={t('settings.name')}>{(id) => <TextInput id={id} value={form.name} maxLength={120} required onChange={update('name')}/>}</Field>
          <Field label={t('settings.assistantName')}>{(id) => <TextInput id={id} value={form.assistant_name} maxLength={60} onChange={update('assistant_name')}/>}</Field>
          <Field label={t('settings.logo')}>{(id) => <TextInput id={id} type="url" inputMode="url" pattern="https://.*" value={form.logo_url} maxLength={500} onChange={update('logo_url')}/>}</Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('settings.primary')}>{(id) => <TextInput id={id} type="color" value={form.primary_color} onChange={update('primary_color')} className="h-11 p-1"/>}</Field>
            <Field label={t('settings.accent')}>{(id) => <TextInput id={id} type="color" value={form.accent_color} onChange={update('accent_color')} className="h-11 p-1"/>}</Field>
          </div>
          {manager && <div className="md:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit">{t('settings.save')}</Button>{state.saved && <span role="status" className="text-sm text-green-800">{t('settings.saved')}</span>}</div>}
        </fieldset>
      </form>
      {state.error !== null && <div className="mt-4"><ApiErrorState error={state.error}/></div>}
    </Card>}
    <Card>
      <h2 className="m-0 font-display text-xl font-bold">{t('settings.data')}</h2>
      <p className="m-0 mt-2 text-sm text-gray-700">{t('settings.dataLead')}</p>
      <div className="mt-4"><Button variant="danger" onClick={() => navigate('/history')} icon={<Trash2 size={16} aria-hidden="true"/>}>{t('history.deleteAll')}</Button></div>
    </Card>
  </>;
}

export function NotFoundPage() {
  const t = useT();
  return <Card className="max-w-xl">
    <h1 className="m-0 font-display text-2xl font-bold">{t('notFound.title')}</h1>
    <p className="m-0 mt-2 text-sm text-gray-700">{t('notFound.lead')}</p>
    <div className="mt-4"><Link to="/" className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('notFound.home')}</Link></div>
  </Card>;
}
