import { useState, type FormEvent } from 'react';
import { CalendarPlus, MessageSquarePlus, Search, Sparkles, Target } from 'lucide-react';
import { ApiErrorState, Badge, Button, CreditCost, Dialog, EmptyState, Field, PageHeader, PlanGate, TextArea, TextInput, useT } from '../../core/index.ts';
import { ApprovalList, CentreGate, Loaded, newKey, Section, Select, Table, Tabs, useCentreApi, useFormat, useLoad, useSubmit } from '../kit.tsx';

// C3 office assistant (lead follow-ups and trial bookings from Academy leads) and
// C11 win-back and renewal campaigns from Academy risk signals. Every message is a
// draft until a person approves it; sending runs with their own Academy access.

interface Lead { id: string; name: string; phone: string | null; interest: string | null; stage: { key: string; label: string | null } | null; source: string | null; last_contacted_at: string | null; next_follow_up_at: string | null; overdue: boolean; bot_thread_id: string | null }
interface Campaign { id: string; kind: 'winback' | 'renewal'; status: string; audience: { contact_id: string; name: string; reason: string; signals: Record<string, unknown> }[]; action_ids: string[]; created_at: string }
const LANGS = ['uz', 'ru', 'en'] as const;

export function OfficePage() {
  const t = useT();
  const [tab, setTab] = useState<'leads' | 'campaigns' | 'approvals'>('leads');
  return <CentreGate roles={['owner', 'admin']}>
    <PageHeader title={t('centre.office.title')} lead={t('centre.office.lead')}/>
    <Tabs label={t('centre.office.title')} active={tab} onChange={setTab} tabs={[{ key: 'leads', label: t('centre.office.leads') }, { key: 'campaigns', label: t('centre.office.campaigns') }, { key: 'approvals', label: t('centre.office.approvals') }]}/>
    {tab === 'leads' ? <Leads/> : tab === 'campaigns' ? <PlanGate feature="C11"><Campaigns/></PlanGate> : <Section title={t('centre.office.approvals')} lead={t('centre.office.approvalsLead')}><ApprovalList kinds={['centre_lead_message', 'centre_book_trial', 'centre_parent_message']}/></Section>}
  </CentreGate>;
}

function Leads() {
  const t = useT(), f = useFormat();
  const state = useLoad<{ leads: Lead[] }>('leads');
  const [query, setQuery] = useState(''), [onlyOverdue, setOnlyOverdue] = useState(false), [drafting, setDrafting] = useState<{ lead: Lead; kind: 'follow_up' | 'trial_invite' } | null>(null);
  return <Section title={t('centre.office.leads')} lead={t('centre.office.leadsLead')} actions={<>
    <div className="relative"><label htmlFor="lead-search" className="sr-only">{t('centre.common.search')}</label><Search size={14} className="absolute left-3 top-3.5 text-gray-500" aria-hidden="true"/><TextInput id="lead-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('centre.common.search')} className="pl-8"/></div>
    <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyOverdue} onChange={(event) => setOnlyOverdue(event.target.checked)}/>{t('centre.office.onlyOverdue')}</label>
  </>}>
    <Loaded state={state}>{(data) => {
      const rows = data.leads.filter((lead) => (!onlyOverdue || lead.overdue) && (!query.trim() || `${lead.name} ${lead.phone ?? ''} ${lead.interest ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())));
      return <Table caption={t('centre.office.leads')} rows={rows} rowKey={(lead) => lead.id} empty={t('centre.office.noLeads')} columns={[
        { key: 'name', label: t('centre.people.name'), render: (lead) => <span><span className="font-semibold">{lead.name}</span>{lead.phone && <span className="block text-xs text-gray-600">{lead.phone}</span>}</span> },
        { key: 'interest', label: t('centre.office.interest'), render: (lead) => lead.interest ?? '—' },
        { key: 'stage', label: t('centre.office.stage'), render: (lead) => <span>{lead.stage?.label ?? lead.stage?.key ?? '—'}{lead.source && <span className="block text-xs text-gray-600">{lead.source}</span>}</span> },
        { key: 'next', label: t('centre.office.next'), render: (lead) => lead.next_follow_up_at ? <Badge tone={lead.overdue ? 'warn' : 'neutral'}>{f.date(lead.next_follow_up_at)}</Badge> : '—' },
        { key: 'actions', label: <span className="sr-only">{t('centre.people.actions')}</span>, render: (lead) => <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="spark" onClick={() => setDrafting({ lead, kind: 'follow_up' })} icon={<MessageSquarePlus size={14} aria-hidden="true"/>}>{t('centre.office.followUp')}</Button>
          <Button size="sm" variant="secondary" onClick={() => setDrafting({ lead, kind: 'trial_invite' })} icon={<CalendarPlus size={14} aria-hidden="true"/>}>{t('centre.office.trial')}</Button>
        </div> },
      ]}/>;
    }}</Loaded>
    {drafting && <LeadDraft lead={drafting.lead} kind={drafting.kind} onClose={() => setDrafting(null)}/>}
  </Section>;
}

function LeadDraft({ lead, kind, onClose }: { lead: Lead; kind: 'follow_up' | 'trial_invite'; onClose(): void }) {
  const t = useT(), call = useCentreApi();
  const [form, setForm] = useState({ language: 'uz', note: '', date: '', time: '10:00', minutes: '60' });
  const [result, setResult] = useState<{ draft: string; action_id: string; reaches: string } | null>(null);
  const submit = useSubmit();
  const [key] = useState(newKey);
  const draft = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(async () => {
      const starts = kind === 'trial_invite' ? new Date(`${form.date}T${form.time}:00+05:00`) : null;
      setResult(await call('lead-draft', { method: 'POST', idempotencyKey: key, body: {
        lead_id: lead.id, kind, language: form.language, note: form.note.trim() || null,
        ...(starts ? { starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + Number(form.minutes) * 60_000).toISOString() } : {}),
      } }));
    });
  };
  return <Dialog open title={kind === 'follow_up' ? t('centre.office.followUpFor', { name: lead.name }) : t('centre.office.trialFor', { name: lead.name })} onClose={onClose} closeLabel={t('centre.common.close')}>
    {result ? <div className="grid gap-3">
      <p className="m-0 text-sm text-gray-700">{result.reaches === 'centre_bot' ? t('centre.office.viaBot') : t('centre.office.manual')}</p>
      <ApprovalList ids={[result.action_id]}/>
      <div><Button variant="secondary" onClick={onClose}>{t('centre.common.done')}</Button></div>
    </div> : <form onSubmit={draft} className="grid gap-4">
      <Select label={t('centre.common.language')} value={form.language} onChange={(language) => setForm({ ...form, language })} options={LANGS.map((lang) => ({ value: lang, label: t(`centre.lang.${lang}`) }))}/>
      {kind === 'trial_invite' && <div className="grid grid-cols-3 gap-3">
        <Field label={t('centre.office.date')}>{(id) => <TextInput id={id} type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })}/>}</Field>
        <Field label={t('centre.office.time')}>{(id) => <TextInput id={id} type="time" required value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })}/>}</Field>
        <Field label={t('centre.admissions.duration')}>{(id) => <TextInput id={id} type="number" min={20} max={240} value={form.minutes} onChange={(event) => setForm({ ...form, minutes: event.target.value })}/>}</Field>
      </div>}
      <Field label={t('centre.office.note')} hint={t('centre.office.noteHint')}>{(id) => <TextArea id={id} rows={2} maxLength={800} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })}/>}</Field>
      {submit.error !== null && <ApiErrorState error={submit.error}/>}
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" variant="spark" disabled={submit.busy} icon={<Sparkles size={16} aria-hidden="true"/>}>{submit.busy ? t('centre.common.drafting') : t('centre.common.draft')}</Button><CreditCost creditKey="office.draft"/></div>
    </form>}
  </Dialog>;
}

function Campaigns() {
  const t = useT(), f = useFormat(), call = useCentreApi();
  const state = useLoad<{ campaigns: Campaign[] }>('campaigns');
  const [open, setOpen] = useState<Campaign | null>(null);
  const create = useSubmit();
  return <div className="grid gap-6">
    <Section title={t('centre.office.campaigns')} lead={t('centre.office.campaignsLead')} actions={<>
      <Button variant="secondary" disabled={create.busy} onClick={() => void create.run(async () => { const result = await call<{ campaign: Campaign }>('campaigns', { method: 'POST', body: { kind: 'winback' } }); setOpen(result.campaign); await state.reload(); })} icon={<Target size={16} aria-hidden="true"/>}>{t('centre.office.newWinback')}</Button>
      <Button variant="secondary" disabled={create.busy} onClick={() => void create.run(async () => { const result = await call<{ campaign: Campaign }>('campaigns', { method: 'POST', body: { kind: 'renewal' } }); setOpen(result.campaign); await state.reload(); })}>{t('centre.office.newRenewal')}</Button>
    </>}>
      {create.error !== null && <div className="mb-3"><ApiErrorState error={create.error}/></div>}
      <Loaded state={state}>{(data) => <Table caption={t('centre.office.campaigns')} rows={data.campaigns} rowKey={(row) => row.id} empty={t('centre.office.noCampaigns')} columns={[
        { key: 'kind', label: t('centre.office.kind'), render: (row) => <span className="font-semibold">{t(`centre.office.campaign.${row.kind}`)}</span> },
        { key: 'audience', label: t('centre.office.audience'), render: (row) => t('centre.office.people', { count: row.audience.length }) },
        { key: 'drafts', label: t('centre.office.drafts'), render: (row) => f.number(row.action_ids.length) },
        { key: 'date', label: t('centre.admin.when'), render: (row) => f.date(row.created_at) },
        { key: 'open', label: <span className="sr-only">{t('centre.people.actions')}</span>, render: (row) => <Button size="sm" variant="secondary" onClick={() => setOpen(row)}>{t('centre.common.open')}</Button> },
      ]}/>}</Loaded>
    </Section>
    {open && <CampaignDetail key={open.id} campaign={open} onChanged={() => void state.reload()}/>}
  </div>;
}

function CampaignDetail({ campaign, onChanged }: { campaign: Campaign; onChanged(): void }) {
  const t = useT(), call = useCentreApi();
  const [selected, setSelected] = useState<string[]>(campaign.audience.slice(0, 30).map((entry) => entry.contact_id));
  const [language, setLanguage] = useState('uz'), [actionIds, setActionIds] = useState(campaign.action_ids), [stopped, setStopped] = useState<string | null>(null);
  const submit = useSubmit();
  const draft = () => submit.run(async () => {
    const result = await call<{ drafted: { action_id: string }[]; stopped: string | null }>('campaign-draft', { method: 'POST', body: { campaign_id: campaign.id, contact_ids: selected.slice(0, 30), language } });
    setActionIds([...new Set([...actionIds, ...result.drafted.map((row) => row.action_id)])]); setStopped(result.stopped); onChanged();
  });
  return <Section title={t(`centre.office.campaign.${campaign.kind}`)} lead={t('centre.office.reviewAudience')}>
    {!campaign.audience.length ? <EmptyState title={t('centre.office.noAudience')}/> : <>
      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">{campaign.audience.map((entry) => <li key={entry.contact_id}><label className="flex items-start gap-3 rounded-2xl border border-navy-line/30 bg-white p-3 text-sm">
        <input type="checkbox" className="mt-1" checked={selected.includes(entry.contact_id)} onChange={() => setSelected(selected.includes(entry.contact_id) ? selected.filter((id) => id !== entry.contact_id) : [...selected, entry.contact_id])}/>
        <span><span className="font-semibold">{entry.name}</span><span className="block text-xs text-gray-600">{t(`centre.office.reason.${entry.reason}`)}{Object.entries(entry.signals).filter(([, value]) => value !== null).map(([key, value]) => ` · ${t(`centre.office.signal.${key}`)}: ${value}`).join('')}</span></span>
      </label></li>)}</ul>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Select label={t('centre.common.language')} value={language} onChange={setLanguage} options={LANGS.map((lang) => ({ value: lang, label: t(`centre.lang.${lang}`) }))}/>
        <Button variant="spark" disabled={submit.busy || !selected.length} onClick={() => void draft()} icon={<Sparkles size={16} aria-hidden="true"/>}>{submit.busy ? t('centre.common.drafting') : t('centre.office.draftAll', { count: Math.min(30, selected.length) })}</Button>
        <span className="text-xs text-gray-600">{t('centre.office.perMessage')} <CreditCost creditKey="winback.message"/></span>
      </div>
      {stopped && <p role="status" className="m-0 mt-3 text-sm text-amber-900">{t('centre.office.stopped', { reason: t(`error.${stopped}`) })}</p>}
      {submit.error !== null && <div className="mt-3"><ApiErrorState error={submit.error}/></div>}
    </>}
    {actionIds.length > 0 && <div className="mt-6"><h3 className="m-0 mb-3 font-display text-base font-bold">{t('centre.office.toApprove')}</h3><ApprovalList ids={actionIds}/></div>}
  </Section>;
}
