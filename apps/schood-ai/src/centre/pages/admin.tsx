import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { api, Badge, Button, Field, PageHeader, PlanGate, TextInput, useWorkspace } from '../../core/index.ts';
import { ApiErrorState, CentreGate, Loaded, Section, Select, Stat, Table, Tabs, Toggle, useCentreApi, useFormat, useLoad, useSubmit, useT } from '../kit.tsx';

// C7 admin: feature switches, data retention, the usage and cost report and the
// audit log; and C15 the centre's own model keys with the platform fee.

interface Admin { retention_days: number; parent_features: boolean; switches: Record<string, boolean>; areas: { area: string; features: string[]; keys: string[] }[]; add_ons: { extra_teacher_seats: number; extra_students: number } }
interface Usage {
  days: number; credits: { total: number }; grant: number;
  features: { key: string; credits: number; charges: number; feature: string | null }[];
  members: { user_id: string; credits: number; name: string | null; role: string | null; budget: number | null }[];
  by_day: { day: string; credits: number }[]; cost: { usd: number; calls: number; failed: number }; byok: { calls: number };
}
interface AuditEvent { id: number; event: string; actor: { id: string; name: string | null } | null; target_type: string | null; details: Record<string, unknown>; created_at: string }

export function AdminPage() {
  const t = useT();
  const [tab, setTab] = useState<'switches' | 'usage' | 'audit'>('switches');
  return <CentreGate roles={['owner', 'admin']}>
    <PageHeader title={t('centre.admin.title')} lead={t('centre.admin.lead')}/>
    <Tabs label={t('centre.admin.title')} active={tab} onChange={setTab} tabs={[{ key: 'switches', label: t('centre.admin.switches') }, { key: 'usage', label: t('centre.admin.usage') }, { key: 'audit', label: t('centre.admin.audit') }]}/>
    {tab === 'switches' ? <Switches/> : tab === 'usage' ? <UsageReport/> : <AuditLog/>}
  </CentreGate>;
}

function Switches() {
  const t = useT(), call = useCentreApi(), workspace = useWorkspace();
  const state = useLoad<Admin>('admin');
  const submit = useSubmit(), retention = useSubmit(), purge = useSubmit();
  const [days, setDays] = useState<string | null>(null);
  const [purged, setPurged] = useState<{ chats: number; conversations: number } | null>(null);
  return <Loaded state={state}>{(data) => {
    const toggle = (area: string, on: boolean) => submit.run(async () => {
      const next = { ...data.switches };
      if (on) delete next[area]; else next[area] = false;
      await api('core/settings', { method: 'PATCH', workspaceId: workspace.workspaceId, body: { features: next } });
      await state.reload(); await workspace.refresh();
    });
    return <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t('centre.admin.switches')} lead={t('centre.admin.switchesLead')}>
        {submit.error !== null && <div className="mb-3"><ApiErrorState error={submit.error}/></div>}
        <div className="mb-3 rounded-2xl border border-navy-line/30 bg-cream-soft px-3"><Toggle label={t('centre.admin.parents')} description={t('centre.admin.parentsHint')} checked={data.parent_features} disabled={submit.busy} onChange={(on) => void submit.run(async () => { await call('admin', { method: 'PATCH', body: { parent_features: on } }); await state.reload(); await workspace.refresh(); })}/></div>
        <div className="divide-y divide-navy-line/10">{data.areas.map((area) => <Toggle key={area.area} label={t(`centre.area.${area.area}`)} description={area.features.join(' · ')} checked={data.switches[area.area] !== false} disabled={submit.busy} onChange={(on) => void toggle(area.area, on)}/>)}</div>
      </Section>
      <div className="grid content-start gap-6">
        <Section title={t('centre.admin.retention')} lead={t('centre.admin.retentionLead')}>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void retention.run(async () => { await call('admin', { method: 'PATCH', body: { retention_days: Number(days ?? data.retention_days) } }); setDays(null); await state.reload(); }); }}>
            <Field label={t('centre.admin.retentionDays')}>{(id) => <TextInput id={id} type="number" min={30} max={180} value={days ?? String(data.retention_days)} onChange={(event) => setDays(event.target.value)} className="w-32"/>}</Field>
            <Button type="submit" disabled={retention.busy}>{t('centre.common.save')}</Button>
            <Button variant="secondary" disabled={purge.busy} onClick={() => void purge.run(async () => setPurged(await call('retention-run', { method: 'POST', body: {} })))}>{t('centre.admin.runNow')}</Button>
          </form>
          {retention.error !== null && <div className="mt-3"><ApiErrorState error={retention.error}/></div>}
          {purge.error !== null && <div className="mt-3"><ApiErrorState error={purge.error}/></div>}
          {purged && <p role="status" className="m-0 mt-3 text-sm text-green-800">{t('centre.admin.purged', { chats: purged.chats, conversations: purged.conversations })}</p>}
        </Section>
        <Section title={t('centre.admin.addOns')} lead={t('centre.admin.addOnsLead')}>
          <div className="grid grid-cols-2 gap-3"><Stat label={t('centre.admin.extraSeats')} value={data.add_ons.extra_teacher_seats}/><Stat label={t('centre.admin.extraStudents')} value={data.add_ons.extra_students}/></div>
        </Section>
      </div>
    </div>;
  }}</Loaded>;
}

function UsageReport() {
  const t = useT(), f = useFormat();
  const [days, setDays] = useState('30');
  const state = useLoad<Usage>('usage', { days });
  return <Loaded state={state}>{(data) => {
    const max = Math.max(1, ...data.by_day.map((row) => row.credits));
    return <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3"><Select label={t('centre.admin.period')} value={days} onChange={setDays} options={['7', '30', '90'].map((value) => ({ value, label: t('centre.admin.lastDays', { count: Number(value) }) }))}/></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('centre.admin.creditsUsed')} value={f.number(data.features.reduce((sum, row) => sum + row.credits, 0))}/>
        <Stat label={t('centre.overview.pool')} value={f.number(data.credits.total)} hint={t('centre.overview.grant', { count: data.grant })}/>
        <Stat label={t('centre.admin.modelCost')} value={`$${data.cost.usd.toFixed(4)}`} hint={t('centre.admin.calls', { count: data.cost.calls, failed: data.cost.failed })}/>
        <Stat label={t('centre.admin.ownKeyCalls')} value={f.number(data.byok.calls)}/>
      </div>
      {data.by_day.length > 0 && <Section title={t('centre.admin.byDay')}>
        <ol className="m-0 flex h-36 list-none items-end gap-1 overflow-x-auto p-0" aria-label={t('centre.admin.byDay')}>
          {data.by_day.map((row) => <li key={row.day} className="flex h-full min-w-4 flex-1 flex-col justify-end" title={`${row.day}: ${row.credits}`}>
            <span className="block rounded-t bg-navy" style={{ height: `${Math.max(4, (row.credits / max) * 100)}%` }}/><span className="sr-only">{`${row.day}: ${row.credits}`}</span>
          </li>)}
        </ol>
      </Section>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('centre.admin.byFeature')}><Table caption={t('centre.admin.byFeature')} rows={data.features} rowKey={(row) => row.key} empty={t('centre.admin.noUsage')} columns={[
          { key: 'key', label: t('centre.admin.feature'), render: (row) => <span><span className="font-semibold">{t(`centre.area.${row.key.split('.')[0]}`)}</span> <span className="text-xs text-gray-600">{row.feature}</span></span> },
          { key: 'charges', label: t('centre.admin.uses'), render: (row) => f.number(row.charges) },
          { key: 'credits', label: t('centre.admin.credits'), render: (row) => f.number(row.credits) },
        ]}/></Section>
        <Section title={t('centre.admin.byMember')}><Table caption={t('centre.admin.byMember')} rows={data.members} rowKey={(row) => row.user_id} empty={t('centre.admin.noUsage')} columns={[
          { key: 'name', label: t('centre.people.name'), render: (row) => <span className="font-semibold">{row.name ?? t('centre.people.unnamed')}</span> },
          { key: 'role', label: t('centre.people.role'), render: (row) => (row.role ? t(`role.${row.role}`) : '—') },
          { key: 'credits', label: t('centre.admin.credits'), render: (row) => `${f.number(row.credits)}${row.budget !== null ? ` / ${f.number(row.budget)}` : ''}` },
        ]}/></Section>
      </div>
    </div>;
  }}</Loaded>;
}

function AuditLog() {
  const t = useT(), f = useFormat(), call = useCentreApi();
  const [events, setEvents] = useState<AuditEvent[]>([]), [next, setNext] = useState<number | null | undefined>(undefined), [error, setError] = useState<unknown>(null);
  const load = async (before?: number) => {
    try {
      const result = await call<{ events: AuditEvent[]; next: number | null }>('audit', { query: before ? { before: String(before) } : {} });
      setEvents((current) => (before ? [...current, ...result.events] : result.events)); setNext(result.next); setError(null);
    } catch (cause) { setError(cause); }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ApiErrorState error={error} onRetry={() => void load()}/>;
  return <Section title={t('centre.admin.audit')} lead={t('centre.admin.auditLead')}>
    <Table caption={t('centre.admin.audit')} rows={events} rowKey={(row) => String(row.id)} empty={t('centre.admin.noAudit')} columns={[
      { key: 'when', label: t('centre.admin.when'), render: (row) => f.dateTime(row.created_at) },
      { key: 'who', label: t('centre.admin.who'), render: (row) => row.actor?.name ?? t('centre.admin.system') },
      { key: 'what', label: t('centre.admin.what'), render: (row) => <span><span className="font-semibold">{t(`centre.audit.${row.event.replace(/\./g, '_')}`) === `centre.audit.${row.event.replace(/\./g, '_')}` ? row.event : t(`centre.audit.${row.event.replace(/\./g, '_')}`)}</span>{Object.keys(row.details).length > 0 && <span className="block text-xs text-gray-600">{Object.entries(row.details).slice(0, 4).map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' · ')}</span>}</span> },
    ]}/>
    {next && <div className="mt-4"><Button variant="secondary" onClick={() => void load(next)}>{t('centre.common.more')}</Button></div>}
  </Section>;
}

// --- C15 own model keys -------------------------------------------------------------

interface ByokView {
  allowed: boolean; gateway_ready: boolean; secrets_ready: boolean; rate_uzs_per_1000_calls: number | null; period: string;
  keys: { label: string; adapter: string; base_url: string; models: string[]; hint: string; created_at: string }[];
  fees: { id: string; period: string; calls: number; fee_uzs: number | null; status: string }[];
}

export function ByokPage() {
  const t = useT();
  return <CentreGate roles={['owner', 'admin']}>
    <PageHeader title={t('centre.byok.title')} lead={t('centre.byok.lead')}/>
    <PlanGate feature="C15"><Byok/></PlanGate>
  </CentreGate>;
}

function Byok() {
  const t = useT(), f = useFormat(), call = useCentreApi();
  const state = useLoad<ByokView>('byok');
  const [form, setForm] = useState({ label: 'main', adapter: 'openai_compatible', base_url: '', api_key: '', models: '' });
  const submit = useSubmit(), revoke = useSubmit();
  const save = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(async () => {
      await call('byok', { method: 'POST', body: { label: form.label, adapter: form.adapter, base_url: form.base_url, api_key: form.api_key, models: form.models.split(/[\s,]+/).filter(Boolean) } });
      setForm({ ...form, api_key: '' }); await state.reload();
    });
  };
  return <Loaded state={state}>{(data) => <div className="grid gap-6">
    {!data.gateway_ready && <p role="note" className="m-0 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{t('centre.byok.notYet')}</p>}
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t('centre.byok.keys')}>
        <Table caption={t('centre.byok.keys')} rows={data.keys} rowKey={(row) => row.label} empty={t('centre.byok.none')} columns={[
          { key: 'label', label: t('centre.byok.label'), render: (row) => <span className="font-semibold">{row.label}</span> },
          { key: 'provider', label: t('centre.byok.provider'), render: (row) => <span className="break-all text-xs">{row.adapter} · {row.base_url}</span> },
          { key: 'models', label: t('centre.byok.models'), render: (row) => row.models.join(', ') },
          { key: 'hint', label: t('centre.byok.hint'), render: (row) => <span className="font-mono">…{row.hint}</span> },
          { key: 'revoke', label: <span className="sr-only">{t('centre.people.actions')}</span>, render: (row) => <Button size="sm" variant="danger" disabled={revoke.busy} onClick={() => void revoke.run(async () => { await call('byok', { method: 'DELETE', body: { label: row.label } }); await state.reload(); })} icon={<Trash2 size={14} aria-hidden="true"/>}>{t('centre.people.revoke')}</Button> },
        ]}/>
        {revoke.error !== null && <div className="mt-3"><ApiErrorState error={revoke.error}/></div>}
      </Section>
      <Section title={t('centre.byok.add')} lead={t('centre.byok.addLead')}>
        <form onSubmit={save} className="grid gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('centre.byok.label')}>{(id) => <TextInput id={id} value={form.label} pattern="[a-z0-9][a-z0-9_.\-]{0,40}" onChange={(event) => setForm({ ...form, label: event.target.value.toLowerCase() })} required/>}</Field>
            <Select label={t('centre.byok.adapter')} value={form.adapter} onChange={(adapter) => setForm({ ...form, adapter, base_url: adapter === 'anthropic' ? 'https://api.anthropic.com/v1' : adapter === 'google_gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : form.base_url })} options={[{ value: 'openai_compatible', label: t('centre.byok.openai') }, { value: 'anthropic', label: t('centre.byok.anthropic') }, { value: 'google_gemini', label: t('centre.byok.gemini') }]}/>
          </div>
          <Field label={t('centre.byok.baseUrl')}>{(id) => <TextInput id={id} type="url" value={form.base_url} placeholder="https://" onChange={(event) => setForm({ ...form, base_url: event.target.value })} required/>}</Field>
          <Field label={t('centre.byok.apiKey')} hint={t('centre.byok.apiKeyHint')}>{(id) => <TextInput id={id} type="password" autoComplete="off" value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} required/>}</Field>
          <Field label={t('centre.byok.models')} hint={t('centre.byok.modelsHint')}>{(id) => <TextInput id={id} value={form.models} onChange={(event) => setForm({ ...form, models: event.target.value })} required/>}</Field>
          {submit.error !== null && <ApiErrorState error={submit.error}/>}
          <div><Button type="submit" disabled={submit.busy || !data.secrets_ready} icon={<KeyRound size={16} aria-hidden="true"/>}>{t('centre.byok.save')}</Button></div>
          {!data.secrets_ready && <p className="m-0 text-xs text-gray-600">{t('error.secrets_unconfigured')}</p>}
        </form>
      </Section>
    </div>
    <Section title={t('centre.byok.fees')} lead={data.rate_uzs_per_1000_calls === null ? t('centre.byok.rateContract') : t('centre.byok.rate', { rate: f.number(data.rate_uzs_per_1000_calls) })}>
      <Table caption={t('centre.byok.fees')} rows={data.fees} rowKey={(row) => row.id} empty={t('centre.byok.noFees')} columns={[
        { key: 'period', label: t('centre.byok.period'), render: (row) => row.period },
        { key: 'calls', label: t('centre.byok.calls'), render: (row) => f.number(row.calls) },
        { key: 'fee', label: t('centre.byok.fee'), render: (row) => (row.fee_uzs === null ? t('centre.byok.feeContract') : f.money(row.fee_uzs)) },
        { key: 'status', label: t('centre.people.status'), render: (row) => <Badge>{t(`centre.ledger.${row.status}`)}</Badge> },
      ]}/>
    </Section>
  </div>}</Loaded>;
}
