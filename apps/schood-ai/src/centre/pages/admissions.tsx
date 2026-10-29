import { useEffect, useState, type FormEvent } from 'react';
import { Bot, Link2Off, Plus, Send, Trash2, UserRound } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, LoadingState, PageHeader, TextArea, TextInput } from '../../core/index.ts';
import { ApiErrorState, ApprovalList, CentreGate, CopyField, Loaded, Section, Select, Table, Tabs, Toggle, useCentreApi, useFormat, useLoad, useSubmit, useT } from '../kit.tsx';

// C8 AI Admissions Agent: the centre's own Telegram bot and website chat answer
// from the FAQ and price list, run the placement test, book trial lessons within
// the owner's rules and hand over to a person. Conversations and bookings here.

interface Price { course: string; price: number; currency: 'UZS' | 'USD'; period: 'month' | 'course' | 'lesson' | 'other'; note: string | null }
interface Slot { weekday: number; start: string; capacity: number }
interface Booking { mode: 'approve' | 'auto'; duration_minutes: number; min_notice_hours: number; max_days_ahead: number; require_phone: boolean; slots: Slot[] }
interface Config {
  enabled: boolean; bot: { connected: boolean; username: string | null; hint: string | null };
  faq: { q: string; a: string }[]; prices: Price[]; booking: Partial<Booking>; handover: { message?: Record<string, string>; notify_user_ids?: string[] }; greeting: Record<string, string>;
  placement_page_id: string | null; ready: { secrets: boolean; webhook_url: boolean }; staff_chats: { user_id: string; name: string | null; linked_at: string }[];
}
interface Thread { id: string; channel: 'telegram' | 'widget'; contact: Record<string, string | number | null>; language: string; status: string; last_message_at: string }
interface ThreadDetail { thread: Thread; messages: { id: number; role: string; content: string; created_at: string }[]; bookings: { id: string; starts_at: string; status: string }[] }
interface BookingRow { id: string; starts_at: string; status: string; mode: string; contact: Record<string, string | null> }
const LANGS = ['uz', 'ru', 'en'] as const;
const DEFAULT_BOOKING: Booking = { mode: 'approve', duration_minutes: 60, min_notice_hours: 12, max_days_ahead: 14, require_phone: true, slots: [] };

export function AdmissionsPage() {
  const t = useT();
  const [tab, setTab] = useState<'setup' | 'conversations' | 'bookings'>('setup');
  return <CentreGate roles={['owner', 'admin']}>
    <PageHeader title={t('centre.admissions.title')} lead={t('centre.admissions.lead')}/>
    <Tabs label={t('centre.admissions.title')} active={tab} onChange={setTab} tabs={[{ key: 'setup', label: t('centre.admissions.setup') }, { key: 'conversations', label: t('centre.admissions.conversations') }, { key: 'bookings', label: t('centre.admissions.bookings') }]}/>
    {tab === 'setup' ? <Setup/> : tab === 'conversations' ? <Conversations/> : <Bookings/>}
  </CentreGate>;
}

function Setup() {
  const t = useT(), call = useCentreApi();
  const state = useLoad<{ admissions: Config }>('admissions');
  const tests = useLoad<{ tests: { id: string; title: string; status: string }[] }>('placement-tests');
  const [draft, setDraft] = useState<Config | null>(null), [token, setToken] = useState(''), [staffLink, setStaffLink] = useState<{ code: string; link: string } | null>(null);
  const save = useSubmit(), bot = useSubmit(), enable = useSubmit(), staff = useSubmit();
  return <Loaded state={state}>{({ admissions: saved }) => {
    const current = draft ?? saved;
    const booking: Booking = { ...DEFAULT_BOOKING, ...current.booking };
    const update = (patch: Partial<Config>) => setDraft({ ...current, ...patch });
    const setBooking = (patch: Partial<Booking>) => update({ booking: { ...booking, ...patch } });
    const persist = (event: FormEvent) => {
      event.preventDefault();
      void save.run(async () => {
        const result = await call<{ admissions: Config }>('admissions', { method: 'PATCH', body: { faq: current.faq, prices: current.prices.map((row) => ({ ...row, note: row.note || null })), booking, greeting: current.greeting, handover: { message: current.handover.message ?? {} }, placement_page_id: current.placement_page_id } });
        state.setData(result); setDraft(null);
      });
    };
    return <div className="grid gap-6">
      <Section title={t('centre.admissions.agent')} lead={t('centre.admissions.agentLead')}>
        <Toggle label={t('centre.admissions.enabled')} description={t('centre.admissions.enabledHint')} checked={saved.enabled} disabled={enable.busy} onChange={(on) => void enable.run(async () => state.setData(await call('admissions', { method: 'PATCH', body: { enabled: on } })))}/>
        {enable.error !== null && <ApiErrorState error={enable.error}/>}
      </Section>
      <Section title={t('centre.admissions.bot')} lead={t('centre.admissions.botLead')}>
        {saved.bot.connected ? <div className="flex flex-col gap-3">
          <p className="m-0 inline-flex items-center gap-2 text-sm"><Bot size={16} aria-hidden="true"/><strong>@{saved.bot.username}</strong><span className="text-gray-600">…{saved.bot.hint}</span><Badge tone="lime">{t('centre.admissions.connected')}</Badge></p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={staff.busy} onClick={() => void staff.run(async () => setStaffLink(await call('admissions-staff-code', { method: 'POST', body: {} })))}>{t('centre.admissions.linkMe')}</Button>
            <Button variant="danger" disabled={bot.busy} onClick={() => { if (confirm(t('centre.admissions.disconnectConfirm'))) void bot.run(async () => state.setData(await call('admissions-bot', { method: 'DELETE', body: {} }))); }} icon={<Link2Off size={16} aria-hidden="true"/>}>{t('centre.admissions.disconnect')}</Button>
          </div>
          {staffLink && <div className="grid gap-3 md:grid-cols-2"><CopyField label={t('centre.admissions.staffLink')} value={staffLink.link}/><CopyField label={t('centre.admissions.staffCode')} value={`/staff ${staffLink.code}`}/></div>}
          {saved.staff_chats.length > 0 && <p className="m-0 text-sm text-gray-700">{t('centre.admissions.staffLinked', { names: saved.staff_chats.map((row) => row.name ?? '—').join(', ') })}</p>}
        </div> : <form className="grid gap-3 md:max-w-xl" onSubmit={(event) => { event.preventDefault(); void bot.run(async () => { state.setData(await call('admissions-bot', { method: 'POST', body: { token: token.trim() } })); setToken(''); }); }}>
          <ol className="m-0 list-decimal space-y-1 pl-5 text-sm text-gray-700"><li>{t('centre.admissions.step1')}</li><li>{t('centre.admissions.step2')}</li><li>{t('centre.admissions.step3')}</li></ol>
          <Field label={t('centre.admissions.token')} hint={t('centre.admissions.tokenHint')}>{(id) => <TextInput id={id} type="password" autoComplete="off" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} required/>}</Field>
          {(!saved.ready.secrets || !saved.ready.webhook_url) && <p className="m-0 text-sm text-amber-900">{t('centre.admissions.notReady')}</p>}
          <div><Button type="submit" disabled={bot.busy || !token.trim() || !saved.ready.secrets || !saved.ready.webhook_url}>{bot.busy ? t('centre.common.working') : t('centre.admissions.connect')}</Button></div>
        </form>}
        {(bot.error !== null || staff.error !== null) && <div className="mt-3"><ApiErrorState error={bot.error ?? staff.error}/></div>}
      </Section>
      <form onSubmit={persist} className="grid gap-6">
        <Section title={t('centre.admissions.faq')} lead={t('centre.admissions.faqLead')} actions={<Button size="sm" variant="secondary" onClick={() => update({ faq: [...current.faq, { q: '', a: '' }] })} icon={<Plus size={14} aria-hidden="true"/>}>{t('centre.common.add')}</Button>}>
          {!current.faq.length ? <EmptyState title={t('centre.admissions.noFaq')}/> : <ul className="m-0 grid list-none gap-3 p-0">{current.faq.map((row, index) => <li key={index} className="grid gap-2 rounded-2xl border border-navy-line/30 bg-white p-3 md:grid-cols-[1fr_2fr_auto]">
            <Field label={t('centre.admissions.question')}>{(id) => <TextInput id={id} value={row.q} maxLength={200} required onChange={(event) => update({ faq: current.faq.map((entry, at) => (at === index ? { ...entry, q: event.target.value } : entry)) })}/>}</Field>
            <Field label={t('centre.admissions.answer')}>{(id) => <TextArea id={id} rows={2} value={row.a} maxLength={1500} required onChange={(event) => update({ faq: current.faq.map((entry, at) => (at === index ? { ...entry, a: event.target.value } : entry)) })}/>}</Field>
            <div className="self-end"><Button size="sm" variant="ghost" onClick={() => update({ faq: current.faq.filter((_, at) => at !== index) })} aria-label={t('centre.common.remove')} icon={<Trash2 size={14} aria-hidden="true"/>}/></div>
          </li>)}</ul>}
        </Section>
        <Section title={t('centre.admissions.prices')} lead={t('centre.admissions.pricesLead')} actions={<Button size="sm" variant="secondary" onClick={() => update({ prices: [...current.prices, { course: '', price: 0, currency: 'UZS', period: 'month', note: null }] })} icon={<Plus size={14} aria-hidden="true"/>}>{t('centre.common.add')}</Button>}>
          {!current.prices.length ? <EmptyState title={t('centre.admissions.noPrices')}/> : <ul className="m-0 grid list-none gap-3 p-0">{current.prices.map((row, index) => {
            const set = (patch: Partial<Price>) => update({ prices: current.prices.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)) });
            return <li key={index} className="grid gap-2 rounded-2xl border border-navy-line/30 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_2fr_auto]">
              <Field label={t('centre.admissions.course')}>{(id) => <TextInput id={id} value={row.course} maxLength={120} required onChange={(event) => set({ course: event.target.value })}/>}</Field>
              <Field label={t('centre.admissions.price')}>{(id) => <TextInput id={id} inputMode="numeric" value={String(row.price)} onChange={(event) => set({ price: Number(event.target.value.replace(/[^0-9]/g, '') || 0) })}/>}</Field>
              <Select label={t('centre.admissions.currency')} value={row.currency} onChange={(currency) => set({ currency })} options={[{ value: 'UZS', label: 'UZS' }, { value: 'USD', label: 'USD' }]}/>
              <Select label={t('centre.admissions.per')} value={row.period} onChange={(period) => set({ period })} options={(['month', 'course', 'lesson', 'other'] as const).map((value) => ({ value, label: t(`centre.admissions.period.${value}`) }))}/>
              <Field label={t('centre.admissions.note')}>{(id) => <TextInput id={id} value={row.note ?? ''} maxLength={200} onChange={(event) => set({ note: event.target.value })}/>}</Field>
              <div className="self-end"><Button size="sm" variant="ghost" onClick={() => update({ prices: current.prices.filter((_, at) => at !== index) })} aria-label={t('centre.common.remove')} icon={<Trash2 size={14} aria-hidden="true"/>}/></div>
            </li>;
          })}</ul>}
        </Section>
        <Section title={t('centre.admissions.rules')} lead={t('centre.admissions.rulesLead')}>
          <div className="grid gap-4 md:grid-cols-2">
            <Select label={t('centre.admissions.mode')} value={booking.mode} onChange={(mode) => setBooking({ mode })} hint={t(`centre.admissions.modeHint.${booking.mode}`)} options={[{ value: 'approve', label: t('centre.admissions.modeApprove') }, { value: 'auto', label: t('centre.admissions.modeAuto') }]}/>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('centre.admissions.duration')}>{(id) => <TextInput id={id} type="number" min={20} max={240} value={String(booking.duration_minutes)} onChange={(event) => setBooking({ duration_minutes: Number(event.target.value) })}/>}</Field>
              <Field label={t('centre.admissions.notice')}>{(id) => <TextInput id={id} type="number" min={0} max={168} value={String(booking.min_notice_hours)} onChange={(event) => setBooking({ min_notice_hours: Number(event.target.value) })}/>}</Field>
              <Field label={t('centre.admissions.ahead')}>{(id) => <TextInput id={id} type="number" min={1} max={60} value={String(booking.max_days_ahead)} onChange={(event) => setBooking({ max_days_ahead: Number(event.target.value) })}/>}</Field>
            </div>
          </div>
          <Toggle label={t('centre.admissions.requirePhone')} checked={booking.require_phone} onChange={(on) => setBooking({ require_phone: on })}/>
          <p className="m-0 mb-2 mt-2 text-sm font-semibold text-gray-800">{t('centre.admissions.slots')}</p>
          <ul className="m-0 grid list-none gap-2 p-0">{booking.slots.map((slot, index) => <li key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
            <Select label={t('centre.admissions.weekday')} value={String(slot.weekday)} onChange={(value) => setBooking({ slots: booking.slots.map((entry, at) => (at === index ? { ...entry, weekday: Number(value) } : entry)) })} options={[1, 2, 3, 4, 5, 6, 7].map((day) => ({ value: String(day), label: t(`centre.weekday.${day}`) }))}/>
            <Field label={t('centre.admissions.start')}>{(id) => <TextInput id={id} type="time" value={slot.start} onChange={(event) => setBooking({ slots: booking.slots.map((entry, at) => (at === index ? { ...entry, start: event.target.value } : entry)) })}/>}</Field>
            <Field label={t('centre.admissions.capacity')}>{(id) => <TextInput id={id} type="number" min={1} max={50} value={String(slot.capacity)} onChange={(event) => setBooking({ slots: booking.slots.map((entry, at) => (at === index ? { ...entry, capacity: Number(event.target.value) } : entry)) })}/>}</Field>
            <Button size="sm" variant="ghost" onClick={() => setBooking({ slots: booking.slots.filter((_, at) => at !== index) })} aria-label={t('centre.common.remove')} icon={<Trash2 size={14} aria-hidden="true"/>}/>
          </li>)}</ul>
          <div className="mt-2"><Button size="sm" variant="secondary" onClick={() => setBooking({ slots: [...booking.slots, { weekday: 1, start: '10:00', capacity: 3 }] })} icon={<Plus size={14} aria-hidden="true"/>}>{t('centre.admissions.addSlot')}</Button></div>
        </Section>
        <Section title={t('centre.admissions.texts')}>
          <div className="grid gap-4 md:grid-cols-2">
            {LANGS.map((lang) => <Field key={`g-${lang}`} label={t('centre.style.greeting', { language: t(`centre.lang.${lang}`) })}>{(id) => <TextArea id={id} rows={2} maxLength={600} value={current.greeting[lang] ?? ''} onChange={(event) => update({ greeting: { ...current.greeting, [lang]: event.target.value } })}/>}</Field>)}
            {LANGS.map((lang) => <Field key={`h-${lang}`} label={t('centre.admissions.handoverText', { language: t(`centre.lang.${lang}`) })}>{(id) => <TextArea id={id} rows={2} maxLength={400} value={current.handover.message?.[lang] ?? ''} onChange={(event) => update({ handover: { ...current.handover, message: { ...(current.handover.message ?? {}), [lang]: event.target.value } } })}/>}</Field>)}
            <Select label={t('centre.admissions.placement')} value={current.placement_page_id ?? ''} onChange={(value) => update({ placement_page_id: value || null })} options={[{ value: '', label: t('centre.admissions.noPlacement') }, ...(tests.data?.tests ?? []).filter((test) => test.status === 'approved').map((test) => ({ value: test.id, label: test.title }))]}/>
          </div>
        </Section>
        {save.error !== null && <ApiErrorState error={save.error}/>}
        <div className="flex items-center gap-3"><Button type="submit" disabled={save.busy || !draft}>{save.busy ? t('centre.common.working') : t('centre.common.save')}</Button>{save.done && <span role="status" className="text-sm text-green-800">{t('centre.common.saved')}</span>}</div>
      </form>
      <Section title={t('centre.admissions.waiting')} lead={t('centre.admissions.waitingLead')}><ApprovalList kinds={['centre_book_trial']}/></Section>
    </div>;
  }}</Loaded>;
}

function Conversations() {
  const t = useT(), f = useFormat(), call = useCentreApi();
  const [status, setStatus] = useState<'' | 'open' | 'handed_over' | 'booked' | 'closed'>('handed_over');
  const list = useLoad<{ threads: Thread[] }>('admissions-threads', { status: status || undefined });
  const [selected, setSelected] = useState<string | null>(null), [detail, setDetail] = useState<ThreadDetail | null>(null), [reply, setReply] = useState('');
  const send = useSubmit(), change = useSubmit();
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let live = true;
    const load = () => call<ThreadDetail>('admissions-threads', { query: { id: selected } }).then((result) => { if (live) setDetail(result); }).catch(() => undefined);
    void load();
    const timer = setInterval(load, 15_000);
    return () => { live = false; clearInterval(timer); };
  }, [selected, call]);
  const who = (thread: Thread) => String(thread.contact.name ?? thread.contact.telegram ?? (thread.channel === 'widget' ? t('centre.admissions.websiteVisitor') : t('centre.admissions.telegramUser')));
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
    <Section title={t('centre.admissions.conversations')} actions={<Select label={t('centre.people.status')} value={status} onChange={setStatus} options={[{ value: '', label: t('centre.people.filterAll') }, ...(['handed_over', 'open', 'booked', 'closed'] as const).map((value) => ({ value, label: t(`centre.admissions.status.${value}`) }))]}/>}>
      <Loaded state={list}>{(data) => !data.threads.length ? <EmptyState title={t('centre.admissions.noConversations')}/> : <ul className="m-0 grid list-none gap-2 p-0">{data.threads.map((thread) => <li key={thread.id}>
        <button type="button" onClick={() => setSelected(thread.id)} aria-pressed={selected === thread.id} className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm ${selected === thread.id ? 'border-navy bg-cream-soft' : 'border-navy-line/30 bg-white hover:bg-cream-soft'}`}>
          <span className="min-w-0"><span className="block truncate font-semibold">{who(thread)}</span><span className="text-xs text-gray-600">{t(`centre.admissions.channel.${thread.channel}`)} · {f.dateTime(thread.last_message_at)}</span></span>
          <Badge tone={thread.status === 'handed_over' ? 'warn' : thread.status === 'booked' ? 'lime' : 'neutral'}>{t(`centre.admissions.status.${thread.status}`)}</Badge>
        </button>
      </li>)}</ul>}</Loaded>
    </Section>
    <Card>
      {!selected ? <EmptyState title={t('centre.admissions.pick')}/> : !detail ? <LoadingState/> : <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 inline-flex items-center gap-2 font-display text-lg font-bold"><UserRound size={18} aria-hidden="true"/>{who(detail.thread)}</h2>
          <div className="flex gap-2">
            {detail.thread.status !== 'open' && <Button size="sm" variant="secondary" disabled={change.busy} onClick={() => void change.run(async () => { await call('admissions-threads', { method: 'PATCH', body: { id: detail.thread.id, status: 'open' } }); setDetail({ ...detail, thread: { ...detail.thread, status: 'open' } }); await list.reload(); })}>{t('centre.admissions.backToAgent')}</Button>}
            {detail.thread.status !== 'closed' && <Button size="sm" variant="ghost" disabled={change.busy} onClick={() => void change.run(async () => { await call('admissions-threads', { method: 'PATCH', body: { id: detail.thread.id, status: 'closed' } }); setDetail({ ...detail, thread: { ...detail.thread, status: 'closed' } }); await list.reload(); })}>{t('centre.admissions.close')}</Button>}
          </div>
        </div>
        {Object.entries(detail.thread.contact).filter(([, value]) => value !== null && value !== '').length > 0 && <p className="m-0 text-sm text-gray-700">{Object.entries(detail.thread.contact).filter(([key, value]) => value !== null && value !== '' && key !== 'confirmation_sent').map(([key, value]) => `${t(`centre.admissions.contact.${key}`)}: ${value}`).join(' · ')}</p>}
        <ol className="m-0 grid max-h-[28rem] list-none gap-2 overflow-y-auto p-0" aria-live="polite">{detail.messages.map((message) => <li key={message.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.role === 'prospect' ? 'justify-self-start bg-cream-soft' : message.role === 'staff' ? 'justify-self-end bg-navy text-white' : 'justify-self-end border border-navy-line/30 bg-white'}`}>
          <span className="block text-[0.7rem] font-semibold uppercase tracking-wider opacity-70">{t(`centre.admissions.role.${message.role}`)} · {f.dateTime(message.created_at)}</span>
          <span className="whitespace-pre-wrap break-words">{message.content}</span>
        </li>)}</ol>
        <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); void send.run(async () => { await call('admissions-reply', { method: 'POST', body: { thread_id: detail.thread.id, text: reply } }); setReply(''); setDetail(await call<ThreadDetail>('admissions-threads', { query: { id: detail.thread.id } })); }); }}>
          <label htmlFor="staff-reply" className="text-sm font-semibold">{t('centre.admissions.reply')}</label>
          <TextArea id="staff-reply" rows={3} value={reply} maxLength={4000} onChange={(event) => setReply(event.target.value)} required/>
          <p className="m-0 text-xs text-gray-600">{t('centre.admissions.replyHint')}</p>
          <div><Button type="submit" disabled={send.busy || !reply.trim()} icon={<Send size={16} aria-hidden="true"/>}>{t('centre.admissions.send')}</Button></div>
          {(send.error !== null || change.error !== null) && <ApiErrorState error={send.error ?? change.error}/>}
        </form>
      </div>}
    </Card>
  </div>;
}

function Bookings() {
  const t = useT(), f = useFormat(), call = useCentreApi();
  const state = useLoad<{ bookings: BookingRow[] }>('bookings');
  const cancel = useSubmit();
  return <Section title={t('centre.admissions.bookings')} lead={t('centre.admissions.bookingsLead')}>
    <Loaded state={state}>{(data) => <Table caption={t('centre.admissions.bookings')} rows={data.bookings} rowKey={(row) => row.id} empty={t('centre.admissions.noBookings')} columns={[
      { key: 'when', label: t('centre.admin.when'), render: (row) => f.dateTime(row.starts_at) },
      { key: 'who', label: t('centre.people.name'), render: (row) => <span><span className="font-semibold">{row.contact.name ?? '—'}</span>{row.contact.phone && <span className="block text-xs text-gray-600">{row.contact.phone}</span>}</span> },
      { key: 'mode', label: t('centre.admissions.mode'), render: (row) => t(`centre.admissions.bookingMode.${row.mode}`) },
      { key: 'status', label: t('centre.people.status'), render: (row) => <Badge tone={row.status === 'synced' ? 'lime' : row.status === 'cancelled' ? 'neutral' : 'sky'}>{t(`centre.admissions.bookingStatus.${row.status}`)}</Badge> },
      { key: 'cancel', label: <span className="sr-only">{t('centre.people.actions')}</span>, render: (row) => ['requested', 'confirmed'].includes(row.status) && <Button size="sm" variant="danger" disabled={cancel.busy} onClick={() => void cancel.run(async () => { await call('bookings', { method: 'DELETE', body: { id: row.id } }); await state.reload(); })}>{t('centre.common.cancel')}</Button> },
    ]}/>}</Loaded>
    {cancel.error !== null && <div className="mt-3"><ApiErrorState error={cancel.error}/></div>}
  </Section>;
}
