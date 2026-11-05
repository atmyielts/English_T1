import { useEffect, useState, type FormEvent } from 'react';
import { useT } from '../i18n/index.ts';
import { navigate, useLocation } from '../router.tsx';
import { EmptyState, LoadingState } from '../states.tsx';
import { Button, Field, PageHeader, TextArea, TextInput } from '../ui.tsx';
import { adminApi, type ServiceSettings, type TestResult, type UsageLine } from './api.ts';
import { AdminError, Notice, Section, selectClass, SwitchesEditor, useAdminLoad } from './shared.tsx';
import { AuditTab, ReportsTab, WorkspacesTab } from './AdminOps.tsx';
import { ModelsTab } from './AdminRegistry.tsx';

// /admin: the Schood AI console for Schood admins. The function checks the
// existing admin permission (and MFA policy) on every call; this screen only
// shows the result clearly. Sections: service switches and caps, the model
// registry, a test console, usage and cost, workspaces, reports and the audit log.

const TABS = ['service', 'models', 'test', 'usage', 'workspaces', 'reports', 'audit'] as const;
type Tab = (typeof TABS)[number];

export function AdminConsole() {
  const t = useT(), { query } = useLocation();
  const tab = (TABS as readonly string[]).includes(query.get('tab') ?? '') ? query.get('tab') as Tab : 'service';
  return <>
    <PageHeader title={t('admin.title')} lead={t('admin.lead')}/>
    <div role="tablist" aria-label={t('admin.tabs')} className="mb-5 flex gap-1 overflow-x-auto rounded-full border border-navy-line bg-white/80 p-1">
      {TABS.map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => navigate(`/admin?tab=${value}`, { replace: true })}
        className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold ${tab === value ? 'bg-navy text-white' : 'text-gray-800 hover:bg-cream'}`}>{t(`admin.tab.${value}`)}</button>)}
    </div>
    <div role="tabpanel" aria-label={t(`admin.tab.${tab}`)}>
      {tab === 'service' && <ServiceTab/>}
      {tab === 'models' && <ModelsTab/>}
      {tab === 'test' && <TestTab/>}
      {tab === 'usage' && <UsageTab/>}
      {tab === 'workspaces' && <WorkspacesTab/>}
      {tab === 'reports' && <ReportsTab/>}
      {tab === 'audit' && <AuditTab/>}
    </div>
  </>;
}

function ServiceTab() {
  const t = useT();
  const { data, error, loading, reload, set } = useAdminLoad(() => adminApi.settings(), []);
  const [form, setForm] = useState<ServiceSettings | null>(null);
  const [state, setState] = useState<{ busy: boolean; error: unknown; saved: boolean }>({ busy: false, error: null, saved: false });
  useEffect(() => { if (data) setForm({ ...data }); }, [data]);
  if (loading && !data) return <LoadingState/>;
  if (error || !form) return <AdminError error={error} onRetry={reload}/>;
  const save = async (patch: Partial<ServiceSettings>) => {
    setState({ busy: true, error: null, saved: false });
    try { set(await adminApi.saveSettings(patch)); setState({ busy: false, error: null, saved: true }); } catch (cause) { setState({ busy: false, error: cause, saved: false }); }
  };
  const number = (key: 'global_daily_calls' | 'user_daily_calls' | 'workspace_daily_calls') => (id: string) =>
    <TextInput id={id} type="number" min={0} inputMode="numeric" value={form[key]} onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })}/>;
  return <>
    {state.saved && <Notice>{t('admin.saved')}</Notice>}
    {state.error !== null && <div className="mb-4"><AdminError error={state.error}/></div>}
    <Section title={t('admin.service.ai')} lead={t('admin.service.aiLead')}>
      <label className="inline-flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" className="h-5 w-5" checked={form.ai_enabled} disabled={state.busy} onChange={(event) => void save({ ai_enabled: event.target.checked })}/>
        {t(form.ai_enabled ? 'admin.on' : 'admin.off')}
      </label>
    </Section>
    <Section title={t('admin.service.caps')}>
      <form onSubmit={(event) => { event.preventDefault(); void save({ global_daily_calls: form.global_daily_calls, user_daily_calls: form.user_daily_calls, workspace_daily_calls: form.workspace_daily_calls, global_daily_usd: form.global_daily_usd }); }}
        className="grid gap-4 md:grid-cols-2">
        <Field label={t('admin.service.global')}>{number('global_daily_calls')}</Field>
        <Field label={t('admin.service.user')}>{number('user_daily_calls')}</Field>
        <Field label={t('admin.service.workspace')}>{number('workspace_daily_calls')}</Field>
        <Field label={t('admin.service.usd')}>{(id) => <TextInput id={id} type="number" min={0} step="0.01" inputMode="decimal" value={form.global_daily_usd ?? ''}
          onChange={(event) => setForm({ ...form, global_daily_usd: event.target.value === '' ? null : Number(event.target.value) })}/>}</Field>
        <div className="md:col-span-2"><Button type="submit" disabled={state.busy}>{t('admin.save')}</Button></div>
      </form>
    </Section>
    <Section title={t('admin.service.switches')} lead={t('admin.service.switchesLead')} actions={<Button disabled={state.busy} onClick={() => void save({ features: form.features })}>{t('admin.save')}</Button>}>
      <SwitchesEditor value={form.features} disabled={state.busy} onChange={(features) => setForm({ ...form, features })}/>
    </Section>
  </>;
}

function TestTab() {
  const t = useT();
  const models = useAdminLoad(() => adminApi.models(), []);
  const [model, setModel] = useState(''), [prompt, setPrompt] = useState('Reply with one short sentence: what is 2 + 2?');
  const [result, setResult] = useState<TestResult | null>(null), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  useEffect(() => { if (!model && models.data?.length) setModel(models.data.find((entry) => entry.enabled)?.key ?? models.data[0].key); }, [models.data, model]);
  if (models.loading && !models.data) return <LoadingState/>;
  if (models.error) return <AdminError error={models.error} onRetry={models.reload}/>;
  const run = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null); setResult(null);
    try { setResult(await adminApi.test(model, prompt)); } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  return <Section title={t('admin.tab.test')} lead={t('admin.test.lead')}>
    <form onSubmit={(event) => void run(event)} className="grid gap-4">
      <Field label={t('admin.test.model')}>{(id) => <select id={id} className={selectClass} value={model} onChange={(event) => setModel(event.target.value)}>
        {(models.data ?? []).map((entry) => <option key={entry.key} value={entry.key}>{entry.display_name} ({entry.key}){entry.enabled ? '' : ` · ${t('admin.off')}`}</option>)}
      </select>}</Field>
      <Field label={t('admin.test.prompt')}>{(id) => <TextArea id={id} rows={4} maxLength={2000} value={prompt} onChange={(event) => setPrompt(event.target.value)} required/>}</Field>
      <div><Button type="submit" variant="spark" disabled={busy || !model || !prompt.trim()}>{t('admin.test.run')}</Button></div>
    </form>
    {busy && <LoadingState/>}
    {error !== null && <div className="mt-4"><AdminError error={error}/></div>}
    {result && <div className="mt-4 rounded-2xl border border-navy-line/30 bg-white p-4 text-sm">
      {result.status === 'ok' ? <pre className="m-0 mb-3 whitespace-pre-wrap break-words font-sans">{result.text}</pre> : <p className="m-0 mb-3 font-semibold text-red-700">{t('admin.test.failed', { code: result.code ?? result.status })}</p>}
      <dl className="m-0 grid grid-cols-2 gap-2 text-xs text-gray-700 sm:grid-cols-4">
        <div><dt className="font-semibold">{t('admin.test.latency')}</dt><dd className="m-0">{result.latency_ms ?? '—'} ms</dd></div>
        <div><dt className="font-semibold">{t('admin.test.tokens')}</dt><dd className="m-0">{result.input_tokens ?? '—'} / {result.output_tokens ?? '—'}</dd></div>
        <div><dt className="font-semibold">{t('admin.test.cost')}</dt><dd className="m-0">{result.cost_usd !== undefined ? `$${result.cost_usd.toFixed(6)}` : '—'}</dd></div>
        <div><dt className="font-semibold">{t('admin.test.model')}</dt><dd className="m-0 break-all">{result.model_key ?? model}</dd></div>
      </dl>
    </div>}
  </Section>;
}

function UsageTable({ title, rows }: { title: string; rows: UsageLine[] }) {
  const t = useT();
  return <Section title={title}>
    {!rows.length ? <EmptyState title={t('admin.usage.empty')}/> : <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead><tr className="border-b border-gray-300 text-xs text-gray-600">
          <th className="py-2 pr-3">{t('admin.field.key')}</th><th className="py-2 pr-3">{t('admin.usage.calls')}</th><th className="py-2 pr-3">{t('admin.usage.failed')}</th>
          <th className="py-2 pr-3">{t('admin.usage.errorRate')}</th><th className="py-2 pr-3">{t('admin.usage.cost')}</th><th className="py-2">{t('admin.usage.latency')}</th>
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key} className="border-b border-gray-200 last:border-0">
          <td className="break-all py-2 pr-3"><code>{row.key}</code></td><td className="py-2 pr-3">{row.calls}</td><td className="py-2 pr-3">{row.failed}</td>
          <td className={`py-2 pr-3 ${row.error_rate >= 0.1 ? 'font-semibold text-red-700' : ''}`}>{(row.error_rate * 100).toFixed(1)}%</td>
          <td className="py-2 pr-3">${row.cost_usd.toFixed(4)}</td><td className="py-2">{row.avg_latency_ms === null ? '—' : `${row.avg_latency_ms} ms`}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </Section>;
}

function UsageTab() {
  const t = useT();
  const [days, setDays] = useState(7);
  const { data, error, loading, reload } = useAdminLoad(() => adminApi.usage(days), [days]);
  return <>
    <label className="mb-4 flex max-w-xs flex-col gap-1 text-xs font-semibold text-gray-700">{t('admin.usage.days')}
      <select className={selectClass} value={days} onChange={(event) => setDays(Number(event.target.value))}>
        {[1, 7, 30, 90].map((value) => <option key={value} value={value}>{t('admin.usage.daysValue', { days: value })}</option>)}
      </select>
    </label>
    {loading && !data ? <LoadingState/> : error || !data ? <AdminError error={error} onRetry={reload}/> : <>
      <UsageTable title={t('admin.usage.byModel')} rows={data.by_model}/>
      <UsageTable title={t('admin.usage.byFeature')} rows={data.by_feature}/>
    </>}
  </>;
}
