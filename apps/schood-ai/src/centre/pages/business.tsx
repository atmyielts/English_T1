import { useState, type FormEvent } from 'react';
import { RefreshCw, Send, Sparkles } from 'lucide-react';
import { ApiErrorState, Badge, Button, Card, CreditCost, EmptyState, Field, PageHeader, TextInput, useT } from '../../core/index.ts';
import { CentreGate, Loaded, Section, Select, Stat, Table, Toggle, useCentre, useCentreApi, useFormat, useLoad, useSubmit } from '../kit.tsx';

// C6 insights, C10 the Monday owner brief and C9 reselling the assistant.

interface InsightGroup { id: string; name: string; level: string | null; size: number; shown: boolean; topics: { topic: string; questions: number; students: number }[]; weak_spots: { tag: string; open: number; total: number }[] | null }

export function InsightsPage() {
  const t = useT(), call = useCentreApi(), { manager } = useCentre();
  const [period, setPeriod] = useState(new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 7));
  const state = useLoad<{ groups: InsightGroup[]; computed_at: string | null; min_group: number; min_topic_students: number }>('insights', { period, weak: '1' });
  const refresh = useSubmit(), f = useFormat();
  return <CentreGate roles={['owner', 'admin', 'teacher']}>
    <PageHeader title={t('centre.insights.title')} lead={t('centre.insights.lead')} actions={manager && <Button variant="secondary" disabled={refresh.busy} onClick={() => void refresh.run(async () => { await call('insights', { method: 'POST', body: { period } }); await state.reload(); })} icon={<RefreshCw size={16} aria-hidden="true"/>}>{refresh.busy ? t('centre.common.working') : t('centre.insights.refresh')}</Button>}/>
    <div className="mb-4 flex flex-wrap items-end gap-3"><Field label={t('centre.insights.month')}>{(id) => <TextInput id={id} type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="w-44"/>}</Field></div>
    {refresh.error !== null && <div className="mb-4"><ApiErrorState error={refresh.error}/></div>}
    <Loaded state={state}>{(data) => <>
      <p className="m-0 mb-4 text-sm text-gray-700">{t('centre.insights.privacy', { group: data.min_group, students: data.min_topic_students })} {data.computed_at && t('centre.insights.counted', { date: f.dateTime(data.computed_at) })}</p>
      {!data.groups.length ? <EmptyState title={t('centre.insights.noGroups')}/> : <div className="grid gap-4 md:grid-cols-2">{data.groups.map((group) => {
        const max = Math.max(1, ...group.topics.map((topic) => topic.students));
        return <Card key={group.id}>
          <h2 className="m-0 font-display text-lg font-bold">{group.name}</h2>
          <p className="m-0 text-xs text-gray-600">{t('centre.groups.members', { count: group.size })}{group.level ? ` · ${group.level}` : ''}</p>
          {!group.shown ? <p className="m-0 mt-3 text-sm text-gray-700">{t('centre.insights.tooSmall', { count: data.min_group })}</p> : !group.topics.length ? <p className="m-0 mt-3 text-sm text-gray-700">{t('centre.insights.noTopics')}</p> :
            <ul className="m-0 mt-3 grid list-none gap-2 p-0">{group.topics.map((topic) => <li key={topic.topic}>
              <div className="flex justify-between gap-2 text-sm"><span>{t(`centre.topic.${topic.topic}`)}</span><span className="text-gray-600">{t('centre.insights.students', { count: topic.students })} · {t('centre.insights.questions', { count: topic.questions })}</span></div>
              <div className="mt-1 h-2 rounded-full bg-cream-deep" aria-hidden="true"><div className="h-2 rounded-full bg-gradient-to-r from-lime to-sky-ai" style={{ width: `${(topic.students / max) * 100}%` }}/></div>
            </li>)}</ul>}
          {group.weak_spots && group.weak_spots.length > 0 && <div className="mt-4"><p className="m-0 text-sm font-semibold">{t('centre.insights.weakSpots')}</p><ul className="m-0 mt-1 flex list-none flex-wrap gap-2 p-0">{group.weak_spots.map((spot) => <li key={spot.tag}><Badge tone={spot.open ? 'warn' : 'neutral'}>{spot.tag} · {spot.open}/{spot.total}</Badge></li>)}</ul></div>}
        </Card>;
      })}</div>}
    </>}</Loaded>
  </CentreGate>;
}

// --- C10 Monday brief ---------------------------------------------------------------------------

interface Brief { id: string; week: string; status: string; source: string; snapshot_at: string | null; text: string; suggestions: { title: string; why: string; area: string }[]; deliveries: { user_id: string; status: string; channel: string | null; at: string; retry_at?: string }[]; created_at: string }
interface BriefView { settings: { enabled: boolean; recipients: string[]; hour: number }; week: string; briefs: Brief[]; academy_as_of: string | null; managers: { user_id: string; name: string | null; role: string; centre_bot: boolean; schood_bot: boolean }[] }

export function BriefPage() {
  const t = useT(), f = useFormat(), call = useCentreApi();
  const state = useLoad<BriefView>('brief');
  const save = useSubmit(), build = useSubmit();
  const [draft, setDraft] = useState<BriefView['settings'] | null>(null);
  return <CentreGate roles={['owner', 'admin']}>
    <PageHeader title={t('centre.brief.title')} lead={t('centre.brief.lead')}/>
    <Loaded state={state}>{(data) => {
      const settings = draft ?? data.settings;
      const names = new Map(data.managers.map((m) => [m.user_id, m.name]));
      return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Section title={t('centre.brief.settings')}>
          <form className="grid gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void save.run(async () => { await call('brief', { method: 'PATCH', body: settings }); setDraft(null); await state.reload(); }); }}>
            <Toggle label={t('centre.brief.enabled')} description={t('centre.brief.enabledHint')} checked={settings.enabled} onChange={(enabled) => setDraft({ ...settings, enabled })}/>
            <Select label={t('centre.brief.hour')} value={String(settings.hour)} onChange={(value) => setDraft({ ...settings, hour: Number(value) })} options={[8, 9, 10, 11, 12].map((hour) => ({ value: String(hour), label: `${hour}:00` }))}/>
            <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('centre.brief.recipients')}</legend>
              <ul className="m-0 grid list-none gap-2 p-0">{data.managers.map((m) => <li key={m.user_id}><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={settings.recipients.includes(m.user_id)} onChange={() => setDraft({ ...settings, recipients: settings.recipients.includes(m.user_id) ? settings.recipients.filter((id) => id !== m.user_id) : [...settings.recipients, m.user_id].slice(0, 5) })}/>
                <span><span className="font-semibold">{m.name ?? '—'}</span> <span className="text-gray-600">{t(`role.${m.role}`)}</span><span className="block text-xs text-gray-600">{m.centre_bot ? t('centre.brief.viaCentreBot') : m.schood_bot ? t('centre.brief.viaSchoodBot') : t('centre.brief.noTelegram')}</span></span>
              </label></li>)}</ul>
              <p className="m-0 mt-2 text-xs text-gray-600">{t('centre.brief.recipientsHint')}</p>
            </fieldset>
            {save.error !== null && <ApiErrorState error={save.error}/>}
            <div><Button type="submit" disabled={save.busy || !draft}>{t('centre.common.save')}</Button></div>
          </form>
          <p className="m-0 mt-4 text-xs text-gray-600">{data.academy_as_of ? t('centre.brief.dataAsOf', { date: f.dateTime(data.academy_as_of) }) : t('centre.brief.noData')}</p>
        </Section>
        <div className="grid content-start gap-4">
          <Card className="flex flex-wrap items-center gap-3">
            <Button variant="spark" disabled={build.busy} onClick={() => void build.run(async () => { await call('brief', { method: 'POST', body: {} }); await state.reload(); })} icon={<Sparkles size={16} aria-hidden="true"/>}>{build.busy ? t('centre.common.working') : t('centre.brief.preview')}</Button>
            <Button variant="secondary" disabled={build.busy} onClick={() => void build.run(async () => { await call('brief', { method: 'POST', body: { send: true } }); await state.reload(); })} icon={<Send size={16} aria-hidden="true"/>}>{t('centre.brief.sendNow')}</Button>
            <CreditCost creditKey="owner.brief"/>
            {build.error !== null && <div className="w-full"><ApiErrorState error={build.error}/></div>}
          </Card>
          {!data.briefs.length ? <EmptyState title={t('centre.brief.none')}/> : data.briefs.map((brief) => <Card key={brief.id}>
            <div className="mb-2 flex flex-wrap items-center gap-2"><strong>{brief.week}</strong><Badge tone={brief.status === 'sent' ? 'lime' : brief.status === 'failed' ? 'warn' : 'neutral'}>{t(`centre.brief.status.${brief.status}`)}</Badge><span className="text-xs text-gray-600">{brief.source === 'live' ? t('centre.brief.live') : brief.source === 'snapshot' ? t('centre.brief.snapshot', { date: f.dateTime(brief.snapshot_at) }) : t('centre.brief.noAcademy')}</span></div>
            <p className="m-0 whitespace-pre-wrap text-sm leading-6">{brief.text}</p>
            <ol className="m-0 mt-3 grid list-decimal gap-1 pl-5 text-sm">{brief.suggestions.map((entry) => <li key={entry.title}><strong>{entry.title}</strong> — {entry.why}</li>)}</ol>
            {brief.deliveries.length > 0 && <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">{brief.deliveries.map((entry) => <li key={entry.user_id}><Badge tone={entry.status === 'sent' ? 'lime' : entry.status === 'deferred' ? 'sky' : 'warn'}>{names.get(entry.user_id) ?? '—'}: {t(`centre.brief.delivery.${entry.status}`)}</Badge></li>)}</ul>}
          </Card>)}
        </div>
      </div>;
    }}</Loaded>
  </CentreGate>;
}

// --- C9 resell ------------------------------------------------------------------------------------

interface ResellView {
  resell: { enabled: boolean; price_uzs: number | null; period_days: number; gate_access: boolean; student_budget: number | null; note: string | null; wholesale_rate_uzs: number };
  month: { period: string; active_students: number; estimate_uzs: number };
  students: { user_id: string; name: string | null; active: boolean; since: string | null; paid_until: string | null; budget: number | null }[];
  ledger: { id: string; period: string; active_students: number; rate_uzs: number; amount_uzs: number; status: string; invoice_ref: string | null }[];
}

export function ResellPage() {
  const t = useT(), f = useFormat(), call = useCentreApi();
  const state = useLoad<ResellView>('resell');
  const save = useSubmit(), change = useSubmit();
  const [draft, setDraft] = useState<ResellView['resell'] | null>(null), [paidUntil, setPaidUntil] = useState('');
  return <CentreGate roles={['owner', 'admin']}>
    <PageHeader title={t('centre.resell.title')} lead={t('centre.resell.lead')}/>
    <Loaded state={state}>{(data) => {
      const settings = draft ?? data.resell;
      return <div className="grid gap-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label={t('centre.resell.active')} value={f.number(data.month.active_students)} hint={data.month.period}/>
          <Stat label={t('centre.resell.wholesale')} value={f.money(data.month.estimate_uzs)} hint={t('centre.resell.rate', { rate: f.number(data.resell.wholesale_rate_uzs) })}/>
          <Stat label={t('centre.resell.yourPrice')} value={settings.price_uzs === null ? '—' : f.money(settings.price_uzs)} hint={t('centre.resell.perDays', { count: settings.period_days })}/>
        </div>
        <Section title={t('centre.resell.settings')} lead={t('centre.resell.settingsLead')}>
          <form className="grid gap-3 md:max-w-2xl" onSubmit={(event: FormEvent) => { event.preventDefault(); void save.run(async () => { await call('resell', { method: 'PATCH', body: { enabled: settings.enabled, price_uzs: settings.price_uzs, period_days: settings.period_days, gate_access: settings.gate_access, student_budget: settings.student_budget, note: settings.note } }); setDraft(null); await state.reload(); }); }}>
            <Toggle label={t('centre.resell.enabled')} checked={settings.enabled} onChange={(enabled) => setDraft({ ...settings, enabled })}/>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={t('centre.resell.price')}>{(id) => <TextInput id={id} inputMode="numeric" value={settings.price_uzs === null ? '' : String(settings.price_uzs)} onChange={(event) => setDraft({ ...settings, price_uzs: event.target.value ? Number(event.target.value.replace(/[^0-9]/g, '')) : null })}/>}</Field>
              <Field label={t('centre.resell.period')}>{(id) => <TextInput id={id} type="number" min={1} max={366} value={String(settings.period_days)} onChange={(event) => setDraft({ ...settings, period_days: Number(event.target.value) })}/>}</Field>
              <Field label={t('centre.resell.budget')} hint={t('centre.people.emptyNoLimit')}>{(id) => <TextInput id={id} inputMode="numeric" value={settings.student_budget === null ? '' : String(settings.student_budget)} onChange={(event) => setDraft({ ...settings, student_budget: event.target.value ? Number(event.target.value.replace(/[^0-9]/g, '')) : null })}/>}</Field>
            </div>
            <Toggle label={t('centre.resell.gate')} description={t('centre.resell.gateHint')} checked={settings.gate_access} onChange={(gate_access) => setDraft({ ...settings, gate_access })}/>
            {save.error !== null && <ApiErrorState error={save.error}/>}
            <div><Button type="submit" disabled={save.busy || !draft}>{t('centre.common.save')}</Button></div>
            <p className="m-0 text-xs text-gray-600">{t('centre.resell.money')}</p>
          </form>
        </Section>
        <Section title={t('centre.resell.students')} actions={<Field label={t('centre.resell.paidUntil')}>{(id) => <TextInput id={id} type="date" value={paidUntil} onChange={(event) => setPaidUntil(event.target.value)}/>}</Field>}>
          {change.error !== null && <div className="mb-3"><ApiErrorState error={change.error}/></div>}
          <Table caption={t('centre.resell.students')} rows={data.students} rowKey={(row) => row.user_id} empty={t('centre.resell.noStudents')} columns={[
            { key: 'name', label: t('centre.people.name'), render: (row) => <span className="font-semibold">{row.name ?? '—'}</span> },
            { key: 'state', label: t('centre.people.status'), render: (row) => <Badge tone={row.active ? 'lime' : 'neutral'}>{row.active ? t('centre.resell.on') : t('centre.resell.off')}</Badge> },
            { key: 'paid', label: t('centre.resell.paidUntil'), render: (row) => f.date(row.paid_until) },
            { key: 'budget', label: t('centre.people.budget'), render: (row) => (row.budget === null ? t('centre.people.noLimit') : f.number(row.budget)) },
            { key: 'toggle', label: <span className="sr-only">{t('centre.people.actions')}</span>, render: (row) => <Button size="sm" variant={row.active ? 'secondary' : 'primary'} disabled={change.busy || (!row.active && !data.resell.enabled)} onClick={() => void change.run(async () => { await call('resell-students', { method: 'POST', body: { user_ids: [row.user_id], active: !row.active, paid_until: paidUntil || null } }); await state.reload(); })}>{row.active ? t('centre.resell.turnOff') : t('centre.resell.turnOn')}</Button> },
          ]}/>
        </Section>
        <Section title={t('centre.resell.ledger')} lead={t('centre.resell.ledgerLead')}>
          <Table caption={t('centre.resell.ledger')} rows={data.ledger} rowKey={(row) => row.id} empty={t('centre.resell.noLedger')} columns={[
            { key: 'period', label: t('centre.byok.period'), render: (row) => row.period },
            { key: 'students', label: t('centre.resell.active'), render: (row) => f.number(row.active_students) },
            { key: 'amount', label: t('centre.resell.amount'), render: (row) => `${f.money(row.amount_uzs)} (${f.number(row.rate_uzs)} × ${row.active_students})` },
            { key: 'status', label: t('centre.people.status'), render: (row) => <Badge>{t(`centre.ledger.${row.status}`)}{row.invoice_ref ? ` · ${row.invoice_ref}` : ''}</Badge> },
          ]}/>
        </Section>
      </div>;
    }}</Loaded>
  </CentreGate>;
}
