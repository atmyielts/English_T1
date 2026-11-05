import { useState } from 'react';
import { BrainCircuit, CalendarPlus, Check, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Eyebrow, Field, TextInput, useI18n } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { useAction, useEngage, type DateItem } from '../api.ts';
import { EngageError, Loaded, Page, selectClass } from '../ui.tsx';

// /progress/coach (E9): what the coach remembers. Dated goals (an exam, an interview)
// with check-ins before and after, the weak spot from the last three weeks, and the
// journeys in progress. Every coach and tutor chat reads the same facts as context.

interface MemoryView { dates: DateItem[]; past: DateItem[]; weak_spot: string | null; streak: number; active_days_last_21: number; journeys: { journey: string; chapter: number }[] }
const KINDS = ['exam', 'interview', 'presentation', 'deadline', 'other'] as const;

function DateRow({ item, onChange }: { item: DateItem; onChange: () => void }) {
  const t = useT(), { date } = useI18n(), action = useAction();
  const [result, setResult] = useState('');
  const past = item.days_left < 0;
  const update = async (body: Record<string, unknown>) => { if (await action.run('date-update', { id: item.id, ...body }, item.id)) onChange(); };
  return <li className="flex flex-col gap-2 rounded-2xl border border-navy-line/30 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="m-0 font-semibold">{item.title}</p>
        <p className="m-0 text-sm text-gray-600">{t(`engage.memory.kind.${item.kind}`)} · {date(`${item.on_date}T12:00:00Z`, { dateStyle: 'full' })}{item.at_time ? ` · ${item.at_time}` : ''}</p>
      </div>
      {item.done ? <Badge tone="lime"><Check size={12} aria-hidden="true"/>{item.result ?? t('engage.memory.done')}</Badge>
        : <Badge tone={item.days_left <= 3 ? 'warn' : 'neutral'}>{item.days_left === 0 ? t('engage.memory.today') : item.days_left > 0 ? t('engage.memory.inDays', { count: item.days_left }) : t('engage.memory.past')}</Badge>}
    </div>
    {!item.done && <div className="flex flex-wrap items-end gap-2">
      {past && <div className="min-w-0 flex-1"><Field label={t('engage.memory.result')}>{(id) => <TextInput id={id} value={result} maxLength={120} placeholder={t('engage.memory.resultHint')} onChange={(event) => setResult(event.target.value)}/>}</Field></div>}
      <Button size="sm" variant="secondary" disabled={action.busy !== null} onClick={() => void update({ done: true, ...(result.trim() ? { result: result.trim() } : {}) })} icon={<Check size={14} aria-hidden="true"/>}>{t('engage.memory.markDone')}</Button>
      <Button size="sm" variant="ghost" disabled={action.busy !== null} onClick={() => void update({ delete: true })} icon={<Trash2 size={14} aria-hidden="true"/>}>{t('engage.memory.remove')}</Button>
    </div>}
    {action.error !== null && <EngageError error={action.error}/>}
  </li>;
}

function AddDate({ onAdded }: { onAdded: () => void }) {
  const t = useT(), action = useAction();
  const [form, setForm] = useState({ kind: 'exam', title: '', on_date: '', at_time: '' });
  const add = async () => {
    if (await action.run('date-add', { kind: form.kind, title: form.title.trim(), on_date: form.on_date, ...(form.at_time ? { at_time: form.at_time } : {}) })) { setForm({ kind: 'exam', title: '', on_date: '', at_time: '' }); onAdded(); }
  };
  return <Card className="flex flex-col gap-3">
    <Eyebrow icon={<CalendarPlus size={14} aria-hidden="true"/>}>{t('engage.memory.add')}</Eyebrow>
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void add(); }}>
      <Field label={t('engage.memory.kind')}>{(id) => <select id={id} className={selectClass} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>{KINDS.map((kind) => <option key={kind} value={kind}>{t(`engage.memory.kind.${kind}`)}</option>)}</select>}</Field>
      <Field label={t('engage.memory.what')}>{(id) => <TextInput id={id} required maxLength={80} value={form.title} placeholder={t('engage.memory.whatHint')} onChange={(event) => setForm({ ...form, title: event.target.value })}/>}</Field>
      <Field label={t('engage.memory.when')}>{(id) => <TextInput id={id} required type="date" min={new Date().toISOString().slice(0, 10)} value={form.on_date} onChange={(event) => setForm({ ...form, on_date: event.target.value })}/>}</Field>
      <Field label={t('engage.memory.time')}>{(id) => <TextInput id={id} type="time" value={form.at_time} onChange={(event) => setForm({ ...form, at_time: event.target.value })}/>}</Field>
      <div className="sm:col-span-2"><Button type="submit" disabled={action.busy !== null || !form.title.trim() || !form.on_date}>{t('engage.memory.save')}</Button></div>
    </form>
    {action.error !== null && <EngageError error={action.error}/>}
  </Card>;
}

export function MemoryPage() {
  const t = useT();
  const view = useEngage<MemoryView>('memory');
  return <Page eyebrow={<Eyebrow icon={<BrainCircuit size={14} aria-hidden="true"/>}>{t('engage.memory.eyebrow')}</Eyebrow>} title={t('engage.memory.title')} lead={t('engage.memory.lead')}>
    <Loaded {...view}>{(data) => <>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <Eyebrow>{t('engage.memory.weak')}</Eyebrow>
          <p className="m-0 text-sm text-gray-800">{data.weak_spot ? t('engage.memory.weakSpot', { skill: data.weak_spot }) : t('engage.memory.noWeak')}</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <Eyebrow>{t('engage.memory.habit')}</Eyebrow>
          <p className="m-0 text-sm text-gray-800">{t('engage.memory.habitLine', { days: data.active_days_last_21, streak: data.streak })}</p>
        </Card>
      </div>
      <AddDate onAdded={() => void view.reload()}/>
      <section aria-labelledby="engage-dates" className="flex flex-col gap-3">
        <h2 id="engage-dates" className="m-0 font-display text-xl font-bold">{t('engage.memory.upcoming')}</h2>
        {data.dates.length ? <ul className="m-0 flex list-none flex-col gap-2 p-0">{data.dates.map((item) => <DateRow key={item.id} item={item} onChange={() => void view.reload()}/>)}</ul>
          : <EmptyState title={t('engage.memory.empty')} lead={t('engage.memory.emptyLead')}/>}
      </section>
      {data.past.length > 0 && <section aria-labelledby="engage-past" className="flex flex-col gap-3">
        <h2 id="engage-past" className="m-0 font-display text-lg font-bold">{t('engage.memory.pastTitle')}</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">{data.past.map((item) => <DateRow key={item.id} item={item} onChange={() => void view.reload()}/>)}</ul>
      </section>}
    </>}</Loaded>
  </Page>;
}
