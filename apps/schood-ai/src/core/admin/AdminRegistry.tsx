import { useState, type FormEvent, type ReactNode } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { ADAPTERS, CAPABILITIES } from '../../../../../packages/ai-core/src/mod.ts';
import { useT } from '../i18n/index.ts';
import { LoadingState } from '../states.tsx';
import { Badge, Button, Dialog, Field, TextInput } from '../ui.tsx';
import { adminApi, type ModelView, type ProviderView, type RouteView } from './api.ts';
import { AdminError, Notice, Section, selectClass, useAdminLoad } from './shared.tsx';

// The model registry: providers (which name their secret, never hold it), models
// with capabilities and prices, and routes (ordered model lists with fallback).
// The function validates every save (allowed secret names, hosts, patterns).

const EMPTY_PROVIDER: Omit<ProviderView, 'key_configured'> = { key: '', adapter: 'openai_compatible', display_name: '', base_url: 'https://', api_key_env: '', extra_headers: {}, config: {}, enabled: true };
const EMPTY_MODEL: ModelView = { key: '', provider_key: '', model_id: '', display_name: '', capabilities: ['chat', 'stream'], context_window: null, max_output: null, input_usd_per_mtok: 0, output_usd_per_mtok: 0, no_training: false, enabled: true };
const EMPTY_ROUTE: RouteView = { key: '', model_keys: [], required_capabilities: [], require_no_training: false, max_output_tokens: null, temperature: null, enabled: true };

function Editor<T>({ title, value, onClose, onSave, children }: { title: string; value: T | null; onClose(): void; onSave(value: T): Promise<void>; children(value: T, set: (next: T) => void): ReactNode }) {
  const t = useT();
  const [draft, setDraft] = useState<T | null>(value), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(value);
  if (value !== opened) { setOpened(value); setDraft(value); setError(null); }
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setBusy(true); setError(null);
    try { await onSave(draft); onClose(); } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  return <Dialog open={value !== null} title={title} onClose={onClose} closeLabel={t('admin.close')}>
    {draft && <form onSubmit={(event) => void submit(event)} className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
      {children(draft, setDraft)}
      {error !== null && <AdminError error={error}/>}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose}>{t('admin.cancel')}</Button>
        <Button type="submit" disabled={busy}>{t('admin.save')}</Button>
      </div>
    </form>}
  </Dialog>;
}

const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) =>
  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={checked} onChange={(event) => onChange(event.target.checked)}/>{label}</label>;
const optionalNumber = (value: string) => (value.trim() === '' ? null : Number(value));

export function ModelsTab() {
  const t = useT();
  const providers = useAdminLoad(() => adminApi.providers(), []);
  const models = useAdminLoad(() => adminApi.models(), []);
  const routes = useAdminLoad(() => adminApi.routes(), []);
  const [provider, setProvider] = useState<Omit<ProviderView, 'key_configured'> | null>(null);
  const [model, setModel] = useState<ModelView | null>(null);
  const [route, setRoute] = useState<RouteView | null>(null);
  const [notice, setNotice] = useState('');
  const first = providers.error ?? models.error ?? routes.error;
  if (first) return <AdminError error={first} onRetry={() => { providers.reload(); models.reload(); routes.reload(); }}/>;
  if (!providers.data || !models.data || !routes.data) return <LoadingState/>;
  const saved = () => setNotice(t('admin.saved'));
  const editButton = (onClick: () => void) => <Button variant="ghost" size="sm" onClick={onClick} icon={<Pencil size={13} aria-hidden="true"/>}>{t('admin.edit')}</Button>;
  return <>
    {notice && <Notice>{notice}</Notice>}
    <Section title={t('admin.models.providers')} lead={t('admin.models.keyHint')} actions={<Button variant="secondary" size="sm" onClick={() => setProvider({ ...EMPTY_PROVIDER })} icon={<Plus size={14} aria-hidden="true"/>}>{t('admin.add')}</Button>}>
      <ul className="m-0 grid list-none gap-2 p-0">{providers.data.map((entry) => <li key={entry.key} className="flex flex-wrap items-center gap-2 rounded-2xl border border-navy-line/25 bg-white p-3 text-sm">
        <span className="min-w-0 flex-1"><strong>{entry.display_name}</strong> <code className="text-xs text-gray-600">{entry.key} · {entry.adapter}</code><span className="block truncate text-xs text-gray-600">{entry.base_url} · {entry.api_key_env}</span></span>
        <Badge tone={entry.key_configured ? 'lime' : 'warn'}>{t(entry.key_configured ? 'admin.models.keySet' : 'admin.models.keyMissing')}</Badge>
        {!entry.enabled && <Badge>{t('admin.off')}</Badge>}
        {editButton(() => { const { key_configured: _configured, ...rest } = entry; setProvider(rest); })}
      </li>)}</ul>
    </Section>
    <Section title={t('admin.models.models')} actions={<Button variant="secondary" size="sm" onClick={() => setModel({ ...EMPTY_MODEL, provider_key: providers.data![0]?.key ?? '' })} icon={<Plus size={14} aria-hidden="true"/>}>{t('admin.add')}</Button>}>
      <ul className="m-0 grid list-none gap-2 p-0">{models.data.map((entry) => <li key={entry.key} className="flex flex-wrap items-center gap-2 rounded-2xl border border-navy-line/25 bg-white p-3 text-sm">
        <span className="min-w-0 flex-1"><strong>{entry.display_name}</strong> <code className="break-all text-xs text-gray-600">{entry.key}</code>
          <span className="block text-xs text-gray-600">{entry.capabilities.join(', ')} · ${entry.input_usd_per_mtok} / ${entry.output_usd_per_mtok} per 1M{entry.no_training ? ' · no training' : ''}</span></span>
        {!entry.enabled && <Badge>{t('admin.off')}</Badge>}
        {editButton(() => setModel({ ...entry }))}
      </li>)}</ul>
    </Section>
    <Section title={t('admin.models.routes')} lead={t('admin.models.routeHint')} actions={<Button variant="secondary" size="sm" onClick={() => setRoute({ ...EMPTY_ROUTE })} icon={<Plus size={14} aria-hidden="true"/>}>{t('admin.add')}</Button>}>
      <ul className="m-0 grid list-none gap-2 p-0">{routes.data.map((entry) => <li key={entry.key} className="flex flex-wrap items-center gap-2 rounded-2xl border border-navy-line/25 bg-white p-3 text-sm">
        <span className="min-w-0 flex-1"><code className="font-semibold">{entry.key}</code><span className="block break-all text-xs text-gray-600">{entry.model_keys.join(' → ')}</span></span>
        {!entry.enabled && <Badge>{t('admin.off')}</Badge>}
        {editButton(() => setRoute({ ...entry }))}
      </li>)}</ul>
    </Section>

    <Editor title={t('admin.models.providers')} value={provider} onClose={() => setProvider(null)} onSave={async (value) => { await adminApi.saveProvider(value); providers.reload(); saved(); }}>
      {(value, set) => <>
        <Field label={t('admin.field.key')}>{(id) => <TextInput id={id} value={value.key} maxLength={41} required onChange={(event) => set({ ...value, key: event.target.value })}/>}</Field>
        <Field label={t('admin.field.adapter')}>{(id) => <select id={id} className={selectClass} value={value.adapter} onChange={(event) => set({ ...value, adapter: event.target.value })}>{ADAPTERS.map((adapter) => <option key={adapter} value={adapter}>{adapter}</option>)}</select>}</Field>
        <Field label={t('admin.field.name')}>{(id) => <TextInput id={id} value={value.display_name} maxLength={80} required onChange={(event) => set({ ...value, display_name: event.target.value })}/>}</Field>
        <Field label={t('admin.field.baseUrl')}>{(id) => <TextInput id={id} type="url" value={value.base_url} maxLength={300} required onChange={(event) => set({ ...value, base_url: event.target.value })}/>}</Field>
        <Field label={t('admin.field.keyEnv')} hint={t('admin.models.keyHint')}>{(id) => <TextInput id={id} value={value.api_key_env} maxLength={64} required pattern="[A-Z][A-Z0-9_]*" onChange={(event) => set({ ...value, api_key_env: event.target.value.toUpperCase() })}/>}</Field>
        <Check label={t('admin.enabled')} checked={value.enabled} onChange={(enabled) => set({ ...value, enabled })}/>
      </>}
    </Editor>
    <Editor title={t('admin.models.models')} value={model} onClose={() => setModel(null)} onSave={async (value) => { await adminApi.saveModel(value); models.reload(); saved(); }}>
      {(value, set) => <>
        <Field label={t('admin.field.provider')}>{(id) => <select id={id} className={selectClass} value={value.provider_key} onChange={(event) => set({ ...value, provider_key: event.target.value })}>{providers.data!.map((entry) => <option key={entry.key} value={entry.key}>{entry.display_name}</option>)}</select>}</Field>
        <Field label={t('admin.field.key')}>{(id) => <TextInput id={id} value={value.key} maxLength={121} required placeholder="openrouter/vendor/model" onChange={(event) => set({ ...value, key: event.target.value })}/>}</Field>
        <Field label={t('admin.field.modelId')}>{(id) => <TextInput id={id} value={value.model_id} maxLength={160} required onChange={(event) => set({ ...value, model_id: event.target.value })}/>}</Field>
        <Field label={t('admin.field.name')}>{(id) => <TextInput id={id} value={value.display_name} maxLength={120} required onChange={(event) => set({ ...value, display_name: event.target.value })}/>}</Field>
        <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('admin.field.capabilities')}</legend>
          <div className="flex flex-wrap gap-3">{CAPABILITIES.map((capability) => <Check key={capability} label={capability} checked={value.capabilities.includes(capability)}
            onChange={(on) => set({ ...value, capabilities: on ? [...value.capabilities, capability] : value.capabilities.filter((entry) => entry !== capability) })}/>)}</div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('admin.field.contextWindow')}>{(id) => <TextInput id={id} type="number" min={1} value={value.context_window ?? ''} onChange={(event) => set({ ...value, context_window: optionalNumber(event.target.value) })}/>}</Field>
          <Field label={t('admin.field.maxOutput')}>{(id) => <TextInput id={id} type="number" min={1} value={value.max_output ?? ''} onChange={(event) => set({ ...value, max_output: optionalNumber(event.target.value) })}/>}</Field>
          <Field label={t('admin.field.inputPrice')}>{(id) => <TextInput id={id} type="number" min={0} step="0.001" value={value.input_usd_per_mtok} onChange={(event) => set({ ...value, input_usd_per_mtok: Number(event.target.value) })}/>}</Field>
          <Field label={t('admin.field.outputPrice')}>{(id) => <TextInput id={id} type="number" min={0} step="0.001" value={value.output_usd_per_mtok} onChange={(event) => set({ ...value, output_usd_per_mtok: Number(event.target.value) })}/>}</Field>
        </div>
        <Check label={t('admin.field.noTraining')} checked={value.no_training} onChange={(no_training) => set({ ...value, no_training })}/>
        <Check label={t('admin.enabled')} checked={value.enabled} onChange={(enabled) => set({ ...value, enabled })}/>
      </>}
    </Editor>
    <Editor title={t('admin.models.routes')} value={route} onClose={() => setRoute(null)} onSave={async (value) => { await adminApi.saveRoute(value); routes.reload(); saved(); }}>
      {(value, set) => <>
        <Field label={t('admin.field.key')} hint={t('admin.models.routeHint')}>{(id) => <TextInput id={id} value={value.key} maxLength={61} required placeholder="tier.standard" onChange={(event) => set({ ...value, key: event.target.value })}/>}</Field>
        <Field label={t('admin.field.models')}>{(id) => <TextInput id={id} list="schood-ai-model-keys" value={value.model_keys.join(', ')} required
          onChange={(event) => set({ ...value, model_keys: event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean) })}/>}</Field>
        <datalist id="schood-ai-model-keys">{models.data!.map((entry) => <option key={entry.key} value={entry.key}/>)}</datalist>
        <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('admin.field.capabilities')}</legend>
          <div className="flex flex-wrap gap-3">{CAPABILITIES.map((capability) => <Check key={capability} label={capability} checked={value.required_capabilities.includes(capability)}
            onChange={(on) => set({ ...value, required_capabilities: on ? [...value.required_capabilities, capability] : value.required_capabilities.filter((entry) => entry !== capability) })}/>)}</div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('admin.field.maxOutput')}>{(id) => <TextInput id={id} type="number" min={16} max={64000} value={value.max_output_tokens ?? ''} onChange={(event) => set({ ...value, max_output_tokens: optionalNumber(event.target.value) })}/>}</Field>
          <Field label={t('admin.field.temperature')}>{(id) => <TextInput id={id} type="number" min={0} max={2} step="0.1" value={value.temperature ?? ''} onChange={(event) => set({ ...value, temperature: optionalNumber(event.target.value) })}/>}</Field>
        </div>
        <Check label={t('admin.field.requireNoTraining')} checked={value.require_no_training} onChange={(require_no_training) => set({ ...value, require_no_training })}/>
        <Check label={t('admin.enabled')} checked={value.enabled} onChange={(enabled) => set({ ...value, enabled })}/>
      </>}
    </Editor>
  </>;
}
