import { useEffect, useState, type FormEvent } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api, BrandMark, Button, Field, PageHeader, PlanGate, TextArea, TextInput, useWorkspace } from '../../core/index.ts';
import { ApiErrorState, CentreGate, CopyField, Loaded, Section, Select, Toggle, useCentreApi, useLoad, useSubmit, useT } from '../kit.tsx';

// C1 house style and C14 white label and embed: name, logo, colours and the
// assistant's name (core's workspace settings), instruction language, tone and
// worksheet template, an avatar, and the website widgets with their allowed sites.

interface Settings { workspace: { name: string; branding: { logo_url: string | null; primary_color: string | null; accent_color: string | null; assistant_name: string | null }; house_style: Record<string, string | null> }; can_edit: boolean }
interface Embed {
  public_key: string; embed_domains: string[]; snippet: string; placement_snippet: string;
  widgets: { admissions_chat: boolean; placement: boolean; placement_page_id: string | null; greeting: Record<string, string>; position: 'left' | 'right' };
  white_label: { avatar_url: string | null; launcher_label: Record<string, string> };
}
const LANGS = ['uz', 'ru', 'en'] as const;

export function StylePage() {
  const t = useT();
  return <CentreGate roles={['owner', 'admin']}>
    <PageHeader title={t('centre.style.title')} lead={t('centre.style.lead')}/>
    <div className="grid gap-6"><Brand/><PlanGate feature="C14"><EmbedSettings/></PlanGate></div>
  </CentreGate>;
}

function Brand() {
  const t = useT(), workspace = useWorkspace();
  const [state, setState] = useState<{ data: Settings | null; error: unknown }>({ data: null, error: null });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const submit = useSubmit();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    api<Settings>('core/settings', { workspaceId: workspace.workspaceId }).then((data) => { if (live) setState({ data, error: null }); }).catch((error) => { if (live) setState({ data: null, error }); });
    return () => { live = false; };
  }, [workspace.workspaceId, version]);
  if (state.error) return <ApiErrorState error={state.error}/>;
  if (!state.data) return null;
  const ws = state.data.workspace;
  const current = form ?? {
    name: ws.name, assistant_name: ws.branding.assistant_name ?? '', logo_url: ws.branding.logo_url ?? '', primary_color: ws.branding.primary_color ?? '#0f172a', accent_color: ws.branding.accent_color ?? '#b6f24a',
    tone: ws.house_style.tone ?? '', instruction_language: ws.house_style.instruction_language ?? 'uz', worksheet_template: ws.house_style.worksheet_template ?? 'classic',
  };
  const set = (key: string) => (value: string) => setForm({ ...current, [key]: value });
  const save = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(async () => {
      await api('core/settings', { method: 'PATCH', workspaceId: workspace.workspaceId, body: {
        name: current.name, branding: { logo_url: current.logo_url.trim() || null, primary_color: current.primary_color, accent_color: current.accent_color, assistant_name: current.assistant_name.trim() || null },
        house_style: { tone: current.tone.trim() || null, instruction_language: current.instruction_language, worksheet_template: current.worksheet_template },
      } });
      setForm(null); setVersion((value) => value + 1); await workspace.refresh();
    });
  };
  return <Section title={t('centre.style.brand')} lead={t('centre.style.brandLead')}>
    <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
      <Field label={t('settings.name')}>{(id) => <TextInput id={id} value={current.name} maxLength={120} required onChange={(event) => set('name')(event.target.value)}/>}</Field>
      <Field label={t('settings.assistantName')} hint={t('centre.style.assistantHint')}>{(id) => <TextInput id={id} value={current.assistant_name} maxLength={60} onChange={(event) => set('assistant_name')(event.target.value)}/>}</Field>
      <Field label={t('settings.logo')} hint={t('centre.style.httpsHint')}>{(id) => <TextInput id={id} type="url" inputMode="url" pattern="https://.*" value={current.logo_url} maxLength={500} onChange={(event) => set('logo_url')(event.target.value)}/>}</Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('settings.primary')}>{(id) => <TextInput id={id} type="color" value={current.primary_color} onChange={(event) => set('primary_color')(event.target.value)} className="h-11 p-1"/>}</Field>
        <Field label={t('settings.accent')}>{(id) => <TextInput id={id} type="color" value={current.accent_color} onChange={(event) => set('accent_color')(event.target.value)} className="h-11 p-1"/>}</Field>
      </div>
      <Select label={t('centre.style.language')} hint={t('centre.style.languageHint')} value={current.instruction_language} onChange={set('instruction_language')} options={LANGS.map((lang) => ({ value: lang, label: t(`centre.lang.${lang}`) }))}/>
      <Select label={t('centre.style.template')} value={current.worksheet_template} onChange={set('worksheet_template')} options={['classic', 'compact', 'exam'].map((value) => ({ value, label: t(`centre.style.templates.${value}`) }))}/>
      <div className="md:col-span-2"><Field label={t('centre.style.tone')} hint={t('centre.style.toneHint')}>{(id) => <TextArea id={id} rows={2} maxLength={300} value={current.tone} onChange={(event) => set('tone')(event.target.value)}/>}</Field></div>
      <div className="flex items-center gap-3 md:col-span-2 rounded-2xl border border-navy-line/30 bg-cream-soft p-3">
        <BrandMark name={current.name} logo={/^https:\/\//.test(current.logo_url) ? current.logo_url : null} color={current.primary_color} size={40}/>
        <div><p className="m-0 font-semibold">{current.assistant_name || current.name}</p><p className="m-0 text-xs text-gray-600">{t('centre.style.preview')}</p></div>
      </div>
      {submit.error !== null && <div className="md:col-span-2"><ApiErrorState error={submit.error}/></div>}
      <div className="flex items-center gap-3 md:col-span-2"><Button type="submit" disabled={submit.busy}>{submit.busy ? t('centre.common.working') : t('centre.common.save')}</Button>{submit.done && <span role="status" className="text-sm text-green-800">{t('centre.common.saved')}</span>}</div>
    </form>
  </Section>;
}

function EmbedSettings() {
  const t = useT(), call = useCentreApi();
  const state = useLoad<{ embed: Embed }>('embed');
  const tests = useLoad<{ tests: { id: string; title: string; status: string }[] }>('placement-tests');
  const [draft, setDraft] = useState<Embed | null>(null), [domain, setDomain] = useState('');
  const submit = useSubmit();
  return <Loaded state={state}>{({ embed }) => {
    const current = draft ?? embed;
    const update = (patch: Partial<Embed>) => setDraft({ ...current, ...patch });
    const widgets = (patch: Partial<Embed['widgets']>) => update({ widgets: { ...current.widgets, ...patch } });
    const save = (body: Record<string, unknown>) => submit.run(async () => { const result = await call<{ embed: Embed }>('embed', { method: 'PATCH', body }); state.setData(result); setDraft(null); });
    const addDomain = () => { const value = domain.trim().toLowerCase().replace(/\/+$/, ''); if (/^https:\/\/[^\s/]+$/.test(value) && !current.embed_domains.includes(value)) { update({ embed_domains: [...current.embed_domains, value] }); setDomain(''); } };
    return <Section title={t('centre.style.embed')} lead={t('centre.style.embedLead')}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-4">
          <Toggle label={t('centre.style.chatWidget')} description={t('centre.style.chatWidgetHint')} checked={current.widgets.admissions_chat} onChange={(on) => widgets({ admissions_chat: on })}/>
          <Toggle label={t('centre.style.placementWidget')} description={t('centre.style.placementWidgetHint')} checked={current.widgets.placement} onChange={(on) => widgets({ placement: on })}/>
          {current.widgets.placement && <Select label={t('centre.style.placementTest')} value={current.widgets.placement_page_id ?? ''} onChange={(value) => widgets({ placement_page_id: value || null })}
            options={[{ value: '', label: t('centre.style.chooseTest') }, ...(tests.data?.tests ?? []).filter((test) => test.status === 'approved').map((test) => ({ value: test.id, label: test.title }))]}/>}
          <Select label={t('centre.style.position')} value={current.widgets.position} onChange={(value) => widgets({ position: value })} options={[{ value: 'right', label: t('centre.style.right') }, { value: 'left', label: t('centre.style.left') }]}/>
          <Field label={t('centre.style.avatar')} hint={t('centre.style.httpsHint')}>{(id) => <TextInput id={id} type="url" value={current.white_label.avatar_url ?? ''} onChange={(event) => update({ white_label: { ...current.white_label, avatar_url: event.target.value || null } })}/>}</Field>
          {LANGS.map((lang) => <Field key={lang} label={t('centre.style.greeting', { language: t(`centre.lang.${lang}`) })}>{(id) => <TextInput id={id} maxLength={300} value={current.widgets.greeting[lang] ?? ''} onChange={(event) => widgets({ greeting: { ...current.widgets.greeting, [lang]: event.target.value } })}/>}</Field>)}
        </div>
        <div className="grid content-start gap-4">
          <div>
            <p className="m-0 mb-1.5 text-sm font-semibold text-gray-800">{t('centre.style.domains')}</p>
            <p className="m-0 mb-2 text-xs text-gray-600">{t('centre.style.domainsHint')}</p>
            <ul className="m-0 mb-2 grid list-none gap-2 p-0">{current.embed_domains.map((origin) => <li key={origin} className="flex items-center justify-between gap-2 rounded-xl border border-navy-line/30 bg-white px-3 py-2 text-sm"><span className="truncate font-mono text-xs">{origin}</span><button type="button" onClick={() => update({ embed_domains: current.embed_domains.filter((entry) => entry !== origin) })} aria-label={t('centre.style.removeDomain', { domain: origin })} className="rounded-full p-1 hover:bg-cream-soft"><Trash2 size={14} aria-hidden="true"/></button></li>)}</ul>
            <div className="flex gap-2"><label className="sr-only" htmlFor="embed-domain">{t('centre.style.domains')}</label><TextInput id="embed-domain" value={domain} placeholder="https://mycentre.uz" onChange={(event) => setDomain(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDomain(); } }}/><Button variant="secondary" onClick={addDomain} icon={<Plus size={14} aria-hidden="true"/>}>{t('centre.common.add')}</Button></div>
          </div>
          <CopyField label={t('centre.style.snippet')} value={embed.snippet}/>
          <CopyField label={t('centre.style.placementSnippet')} value={embed.placement_snippet}/>
          <div><Button size="sm" variant="ghost" onClick={() => { if (confirm(t('centre.style.rotateConfirm'))) void save({ rotate_key: true }); }} icon={<RotateCcw size={14} aria-hidden="true"/>}>{t('centre.style.rotate')}</Button></div>
        </div>
      </div>
      {submit.error !== null && <div className="mt-4"><ApiErrorState error={submit.error}/></div>}
      <div className="mt-4 flex items-center gap-3">
        <Button disabled={submit.busy || !draft} onClick={() => void save({ embed_domains: current.embed_domains, widgets: { admissions_chat: current.widgets.admissions_chat, placement: current.widgets.placement, placement_page_id: current.widgets.placement_page_id, position: current.widgets.position, greeting: current.widgets.greeting }, white_label: { avatar_url: current.white_label.avatar_url, launcher_label: current.white_label.launcher_label } })}>{t('centre.common.save')}</Button>
        {submit.done && <span role="status" className="text-sm text-green-800">{t('centre.common.saved')}</span>}
      </div>
    </Section>;
  }}</Loaded>;
}
