import { useState, type FormEvent } from 'react';
import { Check, Eye, Plus, Share2, Sparkles, Trash2 } from 'lucide-react';
import { ApiErrorState, Badge, Button, Card, CreditCost, Dialog, EmptyState, Field, PageHeader, TextArea, TextInput, useT } from '../../core/index.ts';
import { CentreGate, Loaded, newKey, Section, Select, Tabs, useCentre, useCentreApi, useFormat, useLoad, useSubmit } from '../kit.tsx';

// C16 lesson observation coach: an observer's notes or a lesson plan become
// feedback against the centre's own standards, shared with the teacher after the
// observer reviews it, and tracked across the school term.

interface Standard { key: string; title: string; description: string }
interface Rating { key: string; rating: number; evidence: string[]; evidence_checked: boolean; comment: string }
interface Observation {
  id: string; teacher: { id: string; name: string | null }; observer: { id: string; name: string | null } | null; lesson_date: string; term: string; source: 'notes' | 'plan';
  feedback: { summary: string; ratings: Rating[]; strengths: string[]; next_steps: string[] } | null; status: 'draft' | 'shared' | 'acknowledged'; teacher_comment: string | null;
}
interface ObservationList { observations: Observation[]; term: string; standards: Standard[]; is_manager: boolean }
interface Progress { term: string; observations: number; standards: { key: string; title: string; average: number | null; first: number | null; last: number | null; count: number }[] }

export function ObservationsPage() {
  const t = useT(), { manager } = useCentre();
  const [tab, setTab] = useState<'list' | 'progress' | 'standards'>('list');
  return <CentreGate roles={['owner', 'admin', 'teacher']}>
    <PageHeader title={t('centre.observe.title')} lead={t('centre.observe.lead')}/>
    <Tabs label={t('centre.observe.title')} active={tab} onChange={setTab} tabs={[{ key: 'list', label: t('centre.observe.list') }, { key: 'progress', label: t('centre.observe.progress') }, ...(manager ? [{ key: 'standards' as const, label: t('centre.observe.standards') }] : [])]}/>
    {tab === 'list' ? <List/> : tab === 'progress' ? <ProgressView/> : <Standards/>}
  </CentreGate>;
}

function List() {
  const t = useT(), f = useFormat(), call = useCentreApi(), { me } = useCentre();
  const state = useLoad<ObservationList>('observations');
  const [creating, setCreating] = useState(false), [open, setOpen] = useState<Observation | null>(null);
  return <Loaded state={state}>{(data) => <>
    <div className="mb-4"><Button onClick={() => setCreating(true)} icon={<Plus size={16} aria-hidden="true"/>}>{t('centre.observe.new')}</Button></div>
    {!data.observations.length ? <EmptyState title={t('centre.observe.none')}/> : <div className="grid gap-3 md:grid-cols-2">{data.observations.map((row) => <Card key={row.id} className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2"><div><p className="m-0 font-semibold">{row.teacher.name ?? '—'}</p><p className="m-0 text-xs text-gray-600">{f.date(row.lesson_date)} · {row.term} · {t(`centre.observe.source.${row.source}`)}</p></div><Badge tone={row.status === 'acknowledged' ? 'lime' : row.status === 'shared' ? 'sky' : 'neutral'}>{t(`centre.observe.status.${row.status}`)}</Badge></div>
      {row.feedback && <p className="m-0 line-clamp-3 text-sm text-gray-700">{row.feedback.summary}</p>}
      <div><Button size="sm" variant="secondary" onClick={() => setOpen(row)} icon={<Eye size={14} aria-hidden="true"/>}>{t('centre.common.open')}</Button></div>
    </Card>)}</div>}
    {creating && <NewObservation standards={data.standards} onClose={() => setCreating(false)} onCreated={(row) => { setCreating(false); setOpen(row); void state.reload(); }}/>}
    {open && <ObservationDialog row={open} standards={data.standards} mine={open.teacher.id === me.user.id} canShare={data.is_manager || open.observer?.id === me.user.id} onClose={() => setOpen(null)} onChanged={(row) => { setOpen(row); void state.reload(); }} call={call}/>}
  </>}</Loaded>;
}

function NewObservation({ standards, onClose, onCreated }: { standards: Standard[]; onClose(): void; onCreated(row: Observation): void }) {
  const t = useT(), call = useCentreApi(), { me } = useCentre();
  const people = useLoad<{ members: { user_id: string; name: string | null; role: string; status: string }[] }>('members');
  const [form, setForm] = useState({ teacher_id: '', lesson_date: new Date().toISOString().slice(0, 10), source: 'notes' as 'notes' | 'plan', input: '' });
  const submit = useSubmit();
  const [key] = useState(newKey);
  const teachers = (people.data?.members ?? []).filter((m) => ['owner', 'admin', 'teacher'].includes(m.role) && m.status === 'active');
  const create = (event: FormEvent) => { event.preventDefault(); void submit.run(async () => { const result = await call<{ observation: Observation }>('observations', { method: 'POST', idempotencyKey: key, body: form }); onCreated(result.observation); }); };
  return <Dialog open title={t('centre.observe.new')} onClose={onClose} closeLabel={t('centre.common.close')}>
    <form onSubmit={create} className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
      <Select label={t('centre.observe.teacher')} value={form.teacher_id} onChange={(teacher_id) => setForm({ ...form, teacher_id, source: teacher_id === me.user.id ? 'plan' : form.source })} options={[{ value: '', label: t('centre.observe.pickTeacher') }, ...teachers.map((m) => ({ value: m.user_id, label: m.name ?? '—' }))]}/>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('centre.observe.date')}>{(id) => <TextInput id={id} type="date" required value={form.lesson_date} onChange={(event) => setForm({ ...form, lesson_date: event.target.value })}/>}</Field>
        <Select label={t('centre.observe.from')} value={form.source} onChange={(source) => setForm({ ...form, source })} options={[{ value: 'notes', label: t('centre.observe.source.notes') }, { value: 'plan', label: t('centre.observe.source.plan') }]}/>
      </div>
      <Field label={form.source === 'notes' ? t('centre.observe.notes') : t('centre.observe.plan')} hint={t('centre.observe.inputHint', { count: standards.length })}>{(id) => <TextArea id={id} rows={8} required minLength={20} maxLength={20000} value={form.input} onChange={(event) => setForm({ ...form, input: event.target.value })}/>}</Field>
      {submit.error !== null && <ApiErrorState error={submit.error}/>}
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" variant="spark" disabled={submit.busy || !form.teacher_id} icon={<Sparkles size={16} aria-hidden="true"/>}>{submit.busy ? t('centre.common.drafting') : t('centre.observe.make')}</Button><CreditCost creditKey="observation.feedback"/></div>
    </form>
  </Dialog>;
}

function ObservationDialog({ row, standards, mine, canShare, onClose, onChanged, call }: { row: Observation; standards: Standard[]; mine: boolean; canShare: boolean; onClose(): void; onChanged(row: Observation): void; call: ReturnType<typeof useCentreApi> }) {
  const t = useT();
  const [comment, setComment] = useState('');
  const act = useSubmit();
  const title = (key: string) => standards.find((entry) => entry.key === key)?.title ?? key;
  return <Dialog open title={t('centre.observe.feedbackFor', { name: row.teacher.name ?? '' })} onClose={onClose} closeLabel={t('centre.common.close')}>
    <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1 text-sm">
      {row.feedback && <>
        <p className="m-0 leading-6">{row.feedback.summary}</p>
        <ul className="m-0 grid list-none gap-2 p-0">{row.feedback.ratings.map((rating) => <li key={rating.key} className="rounded-2xl border border-navy-line/30 bg-white p-3">
          <p className="m-0 flex items-center justify-between gap-2 font-semibold">{title(rating.key)}<Badge tone={rating.rating >= 3 ? 'lime' : 'warn'}>{t('centre.observe.rating', { rating: rating.rating })}</Badge></p>
          <p className="m-0 mt-1">{rating.comment}</p>
          {rating.evidence.length > 0 && <p className="m-0 mt-1 text-gray-600">{rating.evidence.map((quote) => `“${quote}”`).join(' · ')}</p>}
        </li>)}</ul>
        {row.feedback.strengths.length > 0 && <div><p className="m-0 font-semibold">{t('centre.observe.strengths')}</p><ul className="m-0 list-disc pl-5">{row.feedback.strengths.map((entry) => <li key={entry}>{entry}</li>)}</ul></div>}
        <div><p className="m-0 font-semibold">{t('centre.observe.nextSteps')}</p><ul className="m-0 list-disc pl-5">{row.feedback.next_steps.map((entry) => <li key={entry}>{entry}</li>)}</ul></div>
      </>}
      {row.teacher_comment && <p className="m-0 rounded-2xl bg-cream-soft p-3"><strong>{t('centre.observe.teacherComment')}:</strong> {row.teacher_comment}</p>}
      {act.error !== null && <ApiErrorState error={act.error}/>}
      {row.status === 'draft' && canShare && <div><Button disabled={act.busy} onClick={() => void act.run(async () => onChanged((await call<{ observation: Observation }>('observations', { method: 'PATCH', body: { id: row.id, share: true } })).observation))} icon={<Share2 size={16} aria-hidden="true"/>}>{t('centre.observe.share')}</Button><p className="m-0 mt-1 text-xs text-gray-600">{t('centre.observe.shareHint')}</p></div>}
      {row.status === 'shared' && mine && <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void act.run(async () => onChanged((await call<{ observation: Observation }>('observations', { method: 'PATCH', body: { id: row.id, acknowledge: true, comment: comment.trim() || null } })).observation)); }}>
        <label htmlFor="ack-comment" className="font-semibold">{t('centre.observe.yourComment')}</label>
        <TextArea id="ack-comment" rows={2} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)}/>
        <div><Button type="submit" disabled={act.busy} icon={<Check size={16} aria-hidden="true"/>}>{t('centre.observe.acknowledge')}</Button></div>
      </form>}
    </div>
  </Dialog>;
}

function ProgressView() {
  const t = useT(), { manager, me } = useCentre();
  const people = useLoad<{ members: { user_id: string; name: string | null; role: string }[] }>(manager ? 'members' : null);
  const [teacher, setTeacher] = useState(me.user.id);
  const list = useLoad<ObservationList>('observations');
  const [term, setTerm] = useState<string | null>(null);
  const chosenTerm = term ?? list.data?.term ?? '';
  const state = useLoad<Progress>(chosenTerm ? 'observation-progress' : null, { teacher_id: teacher, term: chosenTerm });
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-end gap-3">
      {manager && <Select label={t('centre.observe.teacher')} value={teacher} onChange={setTeacher} options={(people.data?.members ?? []).filter((m) => ['owner', 'admin', 'teacher'].includes(m.role)).map((m) => ({ value: m.user_id, label: m.name ?? '—' }))}/>}
      <Field label={t('centre.observe.term')} hint={t('centre.observe.termHint')}>{(id) => <TextInput id={id} value={chosenTerm} pattern="\d{4}-T[1-4]" onChange={(event) => setTerm(event.target.value)} className="w-32"/>}</Field>
    </div>
    <Loaded state={state}>{(data) => !data.observations ? <EmptyState title={t('centre.observe.noProgress')}/> : <Section title={t('centre.observe.progressFor', { term: data.term, count: data.observations })}>
      <ul className="m-0 grid list-none gap-3 p-0">{data.standards.map((row) => <li key={row.key}>
        <div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{row.title}</span><span className="text-gray-700">{row.average === null ? '—' : t('centre.observe.trend', { first: row.first ?? '—', last: row.last ?? '—', average: row.average })}</span></div>
        <div className="mt-1 h-2 rounded-full bg-cream-deep" aria-hidden="true"><div className="h-2 rounded-full bg-navy" style={{ width: `${((row.average ?? 0) / 4) * 100}%` }}/></div>
      </li>)}</ul>
    </Section>}</Loaded>
  </div>;
}

function Standards() {
  const t = useT(), call = useCentreApi();
  const state = useLoad<{ standards: Standard[]; custom: boolean }>('observation-standards');
  const [draft, setDraft] = useState<Standard[] | null>(null);
  const submit = useSubmit();
  return <Loaded state={state}>{(data) => {
    const list = draft ?? data.standards;
    const set = (index: number, patch: Partial<Standard>) => setDraft(list.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)));
    return <Section title={t('centre.observe.standards')} lead={data.custom ? t('centre.observe.standardsCustom') : t('centre.observe.standardsDefault')}>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void submit.run(async () => { state.setData({ ...(await call<{ standards: Standard[] }>('observation-standards', { method: 'PUT', body: { standards: list } })), custom: true }); setDraft(null); }); }}>
        {list.map((entry, index) => <div key={index} className="grid gap-2 rounded-2xl border border-navy-line/30 bg-white p-3 md:grid-cols-[1fr_2fr_3fr_auto]">
          <Field label={t('centre.observe.key')}>{(id) => <TextInput id={id} required pattern="[a-z][a-z0-9_]{1,30}" value={entry.key} onChange={(event) => set(index, { key: event.target.value.toLowerCase() })}/>}</Field>
          <Field label={t('centre.observe.standardTitle')}>{(id) => <TextInput id={id} required maxLength={80} value={entry.title} onChange={(event) => set(index, { title: event.target.value })}/>}</Field>
          <Field label={t('centre.observe.description')}>{(id) => <TextInput id={id} required maxLength={400} value={entry.description} onChange={(event) => set(index, { description: event.target.value })}/>}</Field>
          <div className="self-end"><Button size="sm" variant="ghost" onClick={() => setDraft(list.filter((_, at) => at !== index))} aria-label={t('centre.common.remove')} icon={<Trash2 size={14} aria-hidden="true"/>}/></div>
        </div>)}
        <div className="flex flex-wrap gap-2">
          {list.length < 12 && <Button variant="secondary" onClick={() => setDraft([...list, { key: `standard_${list.length + 1}`, title: '', description: '' }])} icon={<Plus size={14} aria-hidden="true"/>}>{t('centre.common.add')}</Button>}
          <Button type="submit" disabled={submit.busy || !draft || draft.length === 1}>{t('centre.common.save')}</Button>
        </div>
        {submit.error !== null && <ApiErrorState error={submit.error}/>}
      </form>
    </Section>;
  }}</Loaded>;
}
