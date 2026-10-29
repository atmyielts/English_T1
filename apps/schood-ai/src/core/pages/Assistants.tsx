import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Bot, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api.ts';
import { useT } from '../i18n/index.ts';
import { Link } from '../router.tsx';
import { ApiErrorState, EmptyState, LoadingState } from '../states.tsx';
import { Badge, Button, Card, Dialog, Field, PageHeader, TextArea, TextInput } from '../ui.tsx';
import { useWorkspace } from '../workspace.tsx';

// /settings/assistants: owners and admins tailor the assistants of this workspace
// (core/specialists). Built-ins can be renamed, given instructions, narrowed in
// what they read and who may use them, or switched off; custom ones can be added.

interface Override { name: string | null; description: string | null; instructions: string; context_kinds: string[]; roles: string[]; enabled: boolean }
interface SpecialistAdminView {
  key: string; built_in: boolean;
  default: { name: string; description: string; context_kinds: string[]; roles: string[] } | null;
  override: Override | null;
}
interface Listing { specialists: SpecialistAdminView[]; custom_context_kinds: string[]; roles: string[]; limits: { custom: number; name: number; description: number; instructions: number } }
interface Draft { key: string; name: string; description: string; instructions: string; context_kinds: string[]; roles: string[]; enabled: boolean }

const slug = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'a_$1').slice(0, 40);

export function AssistantsPage() {
  const t = useT(), workspace = useWorkspace();
  const ws = workspace.me!.workspace, manager = ['owner', 'admin'].includes(ws.role);
  const [data, setData] = useState<Listing | null>(null), [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<{ draft: Draft; entry: SpecialistAdminView | null } | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Listing>('core/specialists', { workspaceId: workspace.workspaceId }).then(setData).catch(setError);
  }, [workspace.workspaceId]);
  useEffect(() => { if (manager) load(); }, [load, manager]);
  const remove = async (key: string) => {
    try { await api('core/specialists', { method: 'DELETE', workspaceId: workspace.workspaceId, body: { key } }); load(); void workspace.refresh(); } catch (cause) { setError(cause); }
  };
  const open = (entry: SpecialistAdminView | null) => setEditing({
    entry,
    draft: {
      key: entry?.key ?? '', name: entry?.override?.name ?? '', description: entry?.override?.description ?? '', instructions: entry?.override?.instructions ?? '',
      context_kinds: entry?.override?.context_kinds ?? entry?.default?.context_kinds ?? data?.custom_context_kinds ?? [],
      roles: entry?.override?.roles ?? entry?.default?.roles ?? (ws.kind === 'centre' ? ['owner', 'admin', 'teacher'] : ['owner']), enabled: entry?.override?.enabled ?? true,
    },
  });
  if (!manager) return <><PageHeader title={t('assistants.title')}/><EmptyState title={t('assistants.managersOnly')}/></>;
  const customCount = data?.specialists.filter((entry) => !entry.built_in).length ?? 0;
  return <>
    <p className="mb-2 mt-0 text-sm"><Link to="/settings" className="font-semibold text-gray-800 underline underline-offset-2">{t('nav.settings')}</Link></p>
    <PageHeader title={t('assistants.title')} lead={t('assistants.lead')}
      actions={data && customCount < data.limits.custom && <Button onClick={() => open(null)} icon={<Plus size={16} aria-hidden="true"/>}>{t('assistants.new')}</Button>}/>
    {error !== null ? <ApiErrorState error={error} onRetry={load}/> : !data ? <LoadingState/> :
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">{data.specialists.map((entry) => {
        const name = entry.override?.name || entry.default?.name || entry.key;
        const off = entry.override?.enabled === false;
        return <li key={entry.key}><Card as="div" className={`h-full ${off ? 'opacity-75' : ''}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Bot size={18} aria-hidden="true"/><h2 className="m-0 min-w-0 flex-1 font-display text-lg font-bold">{name}</h2>
            <Badge tone={entry.built_in ? 'neutral' : 'sky'}>{t(entry.built_in ? 'assistants.builtIn' : 'assistants.custom')}</Badge>
            {entry.built_in && entry.override && <Badge tone="lime">{t('assistants.tailored')}</Badge>}
            {off && <Badge tone="warn">{t('assistants.off')}</Badge>}
          </div>
          <p className="mb-0 mt-2 text-sm text-gray-700">{entry.override?.description || entry.default?.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => open(entry)} icon={<Pencil size={13} aria-hidden="true"/>}>{t('assistants.edit')}</Button>
            {entry.built_in && entry.override && <Button size="sm" variant="ghost" onClick={() => void remove(entry.key)} icon={<RotateCcw size={13} aria-hidden="true"/>}>{t('assistants.reset')}</Button>}
            {!entry.built_in && <Button size="sm" variant="danger" onClick={() => { if (confirm(`${t('assistants.delete')}: ${name}?`)) void remove(entry.key); }} icon={<Trash2 size={13} aria-hidden="true"/>}>{t('assistants.delete')}</Button>}
          </div>
        </Card></li>;
      })}</ul>}
    {data && <AssistantEditor editing={editing} listing={data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); void workspace.refresh(); }}/>}
  </>;
}

function AssistantEditor({ editing, listing, onClose, onSaved }: { editing: { draft: Draft; entry: SpecialistAdminView | null } | null; listing: Listing; onClose(): void; onSaved(): void }) {
  const t = useT(), workspace = useWorkspace();
  const [draft, setDraft] = useState<Draft | null>(null), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(editing?.draft ?? null); setError(null); }, [editing]);
  const entry = editing?.entry ?? null, isNew = !entry;
  const kinds = entry?.default?.context_kinds ?? listing.custom_context_kinds;
  const roles = entry?.default ? listing.roles.filter((role) => entry.default!.roles.includes(role)) : listing.roles;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setBusy(true); setError(null);
    try {
      await api('core/specialists', { method: 'PUT', workspaceId: workspace.workspaceId, body: {
        key: isNew ? draft.key || slug(draft.name) : draft.key, name: draft.name.trim() || null, description: draft.description.trim() || null,
        instructions: draft.instructions, context_kinds: draft.context_kinds, roles: draft.roles, enabled: draft.enabled,
      } });
      onSaved();
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  const toggle = (list: string[], value: string, on: boolean) => (on ? [...new Set([...list, value])] : list.filter((entry) => entry !== value));
  return <Dialog open={!!editing} title={isNew ? t('assistants.new') : entry?.override?.name || entry?.default?.name || entry?.key || ''} onClose={onClose} closeLabel={t('library.close')}>
    {draft && <form onSubmit={(event) => void submit(event)} className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
      <Field label={t('assistants.name')} hint={entry?.default ? t('assistants.nameHint', { name: entry.default.name }) : undefined}>
        {(id) => <TextInput id={id} value={draft.name} maxLength={listing.limits.name} required={!entry?.built_in} placeholder={entry?.default?.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value, ...(isNew ? { key: slug(event.target.value) } : {}) })}/>}
      </Field>
      {isNew && <Field label={t('assistants.key')} hint={t('assistants.keyHint')}>{(id) => <TextInput id={id} value={draft.key} maxLength={41} pattern="[a-z][a-z0-9_]{1,40}" required
        onChange={(event) => setDraft({ ...draft, key: event.target.value })} className="font-mono"/>}</Field>}
      <Field label={t('assistants.description')}>{(id) => <TextInput id={id} value={draft.description} maxLength={listing.limits.description} placeholder={entry?.default?.description}
        onChange={(event) => setDraft({ ...draft, description: event.target.value })}/>}</Field>
      <Field label={t('assistants.instructions')} hint={`${t('assistants.instructionsHint')} ${t('assistants.chars', { count: draft.instructions.length, max: listing.limits.instructions })}`}>
        {(id) => <TextArea id={id} rows={6} value={draft.instructions} maxLength={listing.limits.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}/>}
      </Field>
      {kinds.length > 0 && <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('assistants.reads')}</legend>
        <div className="flex flex-wrap gap-3">{kinds.map((kind) => <label key={kind} className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={draft.context_kinds.includes(kind)} onChange={(event) => setDraft({ ...draft, context_kinds: toggle(draft.context_kinds, kind, event.target.checked) })}/>
          {t(`context.${kind}`)}
        </label>)}</div>
      </fieldset>}
      {roles.length > 1 && <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('assistants.roles')}</legend>
        <div className="flex flex-wrap gap-3">{roles.map((role) => <label key={role} className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={draft.roles.includes(role)} onChange={(event) => setDraft({ ...draft, roles: toggle(draft.roles, role, event.target.checked) })}/>
          {t(`role.${role}`)}
        </label>)}</div>
      </fieldset>}
      <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}/>{t('assistants.enabled')}</label>
      {error !== null && <ApiErrorState error={error}/>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('library.cancel')}</Button>
        <Button type="submit" disabled={busy || !draft.roles.length}>{t('admin.save')}</Button>
      </div>
    </form>}
  </Dialog>;
}
