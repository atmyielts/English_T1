import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BookOpenCheck, CheckCircle2, Pause, Play, RotateCcw, Send, Sparkles } from 'lucide-react';
import { quoteCredits } from '../../../../../packages/ai-core/src/mod.ts';
import { Badge, Button, Card, Field, Link, navigate, PageHeader, TextArea, TextInput, Thinking } from '../../core/index.ts';
import { ApiErrorState, ApprovalList, CEFR, CentreGate, LEVEL, Loaded, newKey, Section, Select, Table, useCentre, useCentreApi, useFormat, useLoad, useSubmit, useT } from '../kit.tsx';

// C12 curriculum in a box: plan a multi-level course, generate it unit by unit
// (each unit is one job; the screen runs the next one until all are done), the
// methodologist reviews every unit, then it is published to the centre library and,
// after Approve & run, to Academy Courses.

interface Unit { id: string; position: number; level: string; title: string; status: string; review_notes: string | null; page_ids: string[]; verification: string[] | null; content: { can_do?: string[]; lessons?: { title: string; minutes: number; aims: string[]; stages: { name: string; minutes: number; activity: string }[]; homework: string }[]; test?: { prompt: string; options: string[]; answer: number }[] } | null }
interface Curriculum { id: string; title: string; status: string; brief: Record<string, unknown>; published_at: string | null; created_at: string; progress: { total: number; ready: number; approved: number; failed: number; generating: number }; units?: Unit[]; cost: { outline: number; per_unit: number } }
const TRACKS = ['general', 'ielts', 'multilevel', 'exam_other', 'kids'] as const;

export function CurriculumPage() {
  return <CentreGate roles={['owner', 'admin', 'teacher']}><CurriculumList/></CentreGate>;
}

function CurriculumList() {
  const t = useT(), f = useFormat(), call = useCentreApi(), { manager } = useCentre();
  const state = useLoad<{ curricula: Curriculum[] }>('curricula');
  const [form, setForm] = useState({ title: '', levels: ['a1', 'a2'] as string[], units: '4', lessons: '2', track: 'general', language: 'uz', minutes: '90', notes: '' });
  const submit = useSubmit();
  const [key, setKey] = useState(newKey);
  const units = form.levels.length * Number(form.units || 0);
  const cost = quoteCredits('curriculum.outline').credits + units * quoteCredits('curriculum.unit').credits;
  const create = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(async () => {
      const result = await call<{ curriculum: Curriculum }>('curricula', { method: 'POST', idempotencyKey: key, body: { title: form.title, levels: form.levels, units_per_level: Number(form.units), lessons_per_unit: Number(form.lessons), track: form.track, language: form.language, minutes: Number(form.minutes), notes: form.notes.trim() || null } });
      setKey(newKey()); navigate(`/centre/curriculum/${result.curriculum.id}`);
    });
  };
  return <>
    <PageHeader title={t('centre.curriculum.title')} lead={t('centre.curriculum.lead')}/>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Section title={t('centre.curriculum.list')}>
        <Loaded state={state}>{(data) => <Table caption={t('centre.curriculum.list')} rows={data.curricula} rowKey={(row) => row.id} empty={t('centre.curriculum.none')} columns={[
          { key: 'title', label: t('centre.placement.testTitle'), render: (row) => <Link to={`/centre/curriculum/${row.id}`} className="font-semibold text-gray-900 underline underline-offset-2">{row.title}</Link> },
          { key: 'progress', label: t('centre.curriculum.progress'), render: (row) => t('centre.curriculum.progressLine', { approved: row.progress.approved, ready: row.progress.ready, total: row.progress.total }) },
          { key: 'status', label: t('centre.people.status'), render: (row) => <Badge tone={row.status === 'published' ? 'lime' : row.status === 'failed' ? 'warn' : 'neutral'}>{t(`centre.curriculum.status.${row.status}`)}</Badge> },
          { key: 'date', label: t('centre.admin.when'), render: (row) => f.date(row.created_at) },
        ]}/>}</Loaded>
      </Section>
      {manager && <Section title={t('centre.curriculum.new')} lead={t('centre.curriculum.newLead')}>
        <form onSubmit={create} className="grid gap-3">
          <Field label={t('centre.placement.testTitle')}>{(id) => <TextInput id={id} required maxLength={160} placeholder={t('centre.curriculum.titleExample')} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/>}</Field>
          <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('centre.curriculum.levels')}</legend>
            <div className="flex flex-wrap gap-2">{CEFR.map((code) => <label key={code} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${form.levels.includes(code) ? 'border-navy bg-navy text-white' : 'border-navy-line bg-white'}`}>
              <input type="checkbox" className="sr-only" checked={form.levels.includes(code)} onChange={() => setForm({ ...form, levels: form.levels.includes(code) ? form.levels.filter((entry) => entry !== code) : [...form.levels, code].slice(0, 6) })}/>{LEVEL[code]}
            </label>)}</div>
          </fieldset>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('centre.curriculum.unitsPerLevel')}>{(id) => <TextInput id={id} type="number" min={1} max={12} value={form.units} onChange={(event) => setForm({ ...form, units: event.target.value })}/>}</Field>
            <Field label={t('centre.curriculum.lessonsPerUnit')}>{(id) => <TextInput id={id} type="number" min={1} max={6} value={form.lessons} onChange={(event) => setForm({ ...form, lessons: event.target.value })}/>}</Field>
            <Field label={t('centre.curriculum.minutes')}>{(id) => <TextInput id={id} type="number" min={30} max={180} value={form.minutes} onChange={(event) => setForm({ ...form, minutes: event.target.value })}/>}</Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label={t('centre.curriculum.track')} value={form.track} onChange={(track) => setForm({ ...form, track })} options={TRACKS.map((track) => ({ value: track, label: t(`centre.curriculum.tracks.${track}`) }))}/>
            <Select label={t('centre.style.language')} value={form.language} onChange={(language) => setForm({ ...form, language })} options={['uz', 'ru', 'en'].map((lang) => ({ value: lang, label: t(`centre.lang.${lang}`) }))}/>
          </div>
          <Field label={t('centre.curriculum.notes')}>{(id) => <TextArea id={id} rows={2} maxLength={1500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/>}</Field>
          <p className="m-0 text-sm text-gray-700">{t('centre.curriculum.cost', { units, credits: cost })}</p>
          {submit.error !== null && <ApiErrorState error={submit.error}/>}
          <div><Button type="submit" variant="spark" disabled={submit.busy || !form.levels.length} icon={<Sparkles size={16} aria-hidden="true"/>}>{submit.busy ? t('centre.curriculum.planning') : t('centre.curriculum.plan')}</Button></div>
        </form>
      </Section>}
    </div>
  </>;
}

export function CurriculumDetailPage({ params }: { params: Record<string, string> }) {
  return <CentreGate roles={['owner', 'admin', 'teacher']}><Detail id={params.id}/></CentreGate>;
}

function Detail({ id }: { id: string }) {
  const t = useT(), call = useCentreApi(), { manager } = useCentre();
  const state = useLoad<{ curriculum: Curriculum }>('curricula', { id });
  const [running, setRunning] = useState(false), [runError, setRunError] = useState<unknown>(null), [open, setOpen] = useState<string | null>(null), [actionId, setActionId] = useState<string | null>(null);
  const stop = useRef(false);
  const publish = useSubmit(), review = useSubmit(), retry = useSubmit();
  useEffect(() => () => { stop.current = true; }, []);
  const runAll = async () => {
    setRunning(true); setRunError(null); stop.current = false;
    try {
      for (let i = 0; i < 200 && !stop.current; i++) {
        const result = await call<{ curriculum: Curriculum; done: boolean }>('curriculum-run', { method: 'POST', body: { id }, timeoutMs: 120_000 });
        state.setData({ curriculum: result.curriculum });
        if (result.done) break;
      }
    } catch (cause) { setRunError(cause); } finally { setRunning(false); }
  };
  return <Loaded state={state}>{({ curriculum }) => {
    const units = (curriculum.units ?? []).sort((a, b) => a.position - b.position);
    const waiting = units.some((unit) => ['pending', 'changes_requested', 'generating'].includes(unit.status));
    const allApproved = units.length > 0 && units.every((unit) => unit.status === 'approved');
    return <>
      <PageHeader title={curriculum.title} lead={t('centre.curriculum.detailLead', { approved: curriculum.progress.approved, total: curriculum.progress.total })} actions={<Badge tone={curriculum.status === 'published' ? 'lime' : 'neutral'}>{t(`centre.curriculum.status.${curriculum.status}`)}</Badge>}/>
      {manager && curriculum.status !== 'published' && <Card className="mb-6 flex flex-wrap items-center gap-3">
        {running ? <><Thinking label={t('centre.curriculum.generating', { ready: curriculum.progress.ready, total: curriculum.progress.total })}/><Button variant="secondary" onClick={() => { stop.current = true; }} icon={<Pause size={16} aria-hidden="true"/>}>{t('centre.curriculum.pause')}</Button></>
          : waiting ? <><Button variant="spark" onClick={() => void runAll()} icon={<Play size={16} aria-hidden="true"/>}>{t('centre.curriculum.generate')}</Button><span className="text-sm text-gray-700">{t('centre.curriculum.perUnit', { credits: curriculum.cost.per_unit })}</span></>
          : allApproved ? <><Button disabled={publish.busy} onClick={() => void publish.run(async () => { const result = await call<{ curriculum: Curriculum; action_id: string | null }>('curriculum-publish', { method: 'POST', body: { id, to_academy: true } }); state.setData({ curriculum: result.curriculum }); setActionId(result.action_id); })} icon={<Send size={16} aria-hidden="true"/>}>{t('centre.curriculum.publish')}</Button><span className="text-sm text-gray-700">{t('centre.curriculum.publishHint')}</span></>
          : <span className="text-sm text-gray-700">{t('centre.curriculum.reviewAll')}</span>}
        {(runError !== null || publish.error !== null) && <div className="w-full"><ApiErrorState error={runError ?? publish.error}/></div>}
      </Card>}
      {actionId && <Section title={t('centre.curriculum.toAcademy')} className="mb-6"><ApprovalList ids={[actionId]}/></Section>}
      <div className="grid gap-3">{units.map((unit) => <Card key={unit.id}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0"><p className="m-0 text-xs font-semibold uppercase tracking-wider text-gray-600">{LEVEL[unit.level] ?? unit.level} · {t('centre.curriculum.unit', { n: unit.position })}</p><h2 className="m-0 font-display text-lg font-bold">{unit.title}</h2></div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={unit.status === 'approved' ? 'lime' : unit.status === 'failed' || unit.status === 'changes_requested' ? 'warn' : unit.status === 'ready' ? 'sky' : 'neutral'}>{t(`centre.curriculum.unitStatus.${unit.status}`)}</Badge>
            {unit.content?.lessons && <Button size="sm" variant="secondary" onClick={() => setOpen(open === unit.id ? null : unit.id)} aria-expanded={open === unit.id}>{open === unit.id ? t('centre.common.hide') : t('centre.common.open')}</Button>}
            {unit.status === 'failed' && manager && <Button size="sm" variant="secondary" disabled={retry.busy} onClick={() => void retry.run(async () => { await call('curriculum-retry', { method: 'POST', body: { unit_id: unit.id } }); await state.reload(); })} icon={<RotateCcw size={14} aria-hidden="true"/>}>{t('approvals.retry')}</Button>}
            {unit.page_ids[0] && <Link to={`/library/${unit.page_ids[0]}`} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-navy-line bg-white px-3 text-xs font-semibold no-underline"><BookOpenCheck size={14} aria-hidden="true"/>{t('nav.library')}</Link>}
          </div>
        </div>
        {unit.verification && unit.verification.length > 0 && <ul className="m-0 mt-2 list-disc pl-5 text-sm text-amber-900">{unit.verification.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
        {unit.review_notes && <p className="m-0 mt-2 text-sm text-gray-700"><strong>{t('centre.curriculum.notesFrom')}:</strong> {unit.review_notes}</p>}
        {open === unit.id && unit.content?.lessons && <UnitView unit={unit}/>}
        {['ready', 'approved', 'changes_requested'].includes(unit.status) && curriculum.status !== 'published' && <UnitReview unit={unit} busy={review.busy} onDecide={(decision, notes) => void review.run(async () => { const result = await call<{ curriculum: Curriculum }>('curriculum-review', { method: 'POST', body: { unit_id: unit.id, decision, notes } }); state.setData({ curriculum: { ...result.curriculum } }); })}/>}
      </Card>)}</div>
      {review.error !== null && <div className="mt-3"><ApiErrorState error={review.error}/></div>}
    </>;
  }}</Loaded>;
}

function UnitView({ unit }: { unit: Unit }) {
  const t = useT();
  const content = unit.content!;
  return <div className="mt-4 grid gap-4 text-sm">
    {content.can_do && <ul className="m-0 list-disc pl-5">{content.can_do.map((aim) => <li key={aim}>{aim}</li>)}</ul>}
    {content.lessons?.map((lesson, index) => <div key={index} className="rounded-2xl bg-cream-soft p-3">
      <p className="m-0 font-semibold">{t('centre.curriculum.lesson', { n: index + 1 })}: {lesson.title} · {lesson.minutes}′</p>
      <ol className="m-0 mt-2 grid list-decimal gap-1 pl-5">{lesson.stages.map((stage, at) => <li key={at}><strong>{stage.name}</strong> ({stage.minutes}′): {stage.activity}</li>)}</ol>
      <p className="m-0 mt-2"><strong>{t('centre.curriculum.homework')}:</strong> {lesson.homework}</p>
    </div>)}
    {content.test && <div><p className="m-0 font-semibold">{t('centre.curriculum.test', { count: content.test.length })}</p><ol className="m-0 mt-1 list-decimal pl-5">{content.test.map((item, index) => <li key={index}>{item.prompt} <span className="text-gray-600">({item.options.map((option, at) => `${String.fromCharCode(65 + at)}${at === item.answer ? '✓' : ''} ${option}`).join(' · ')})</span></li>)}</ol></div>}
  </div>;
}

function UnitReview({ unit, busy, onDecide }: { unit: Unit; busy: boolean; onDecide(decision: 'approve' | 'changes', notes: string | null): void }) {
  const t = useT();
  const [notes, setNotes] = useState('');
  if (unit.status === 'approved') return <p className="m-0 mt-3 inline-flex items-center gap-2 text-sm text-green-800"><CheckCircle2 size={16} aria-hidden="true"/>{t('centre.curriculum.approved')}</p>;
  if (unit.status === 'changes_requested') return <p className="m-0 mt-3 text-sm text-amber-900">{t('centre.curriculum.waitingRedo')}</p>;
  return <div className="mt-4 grid gap-2 md:max-w-xl">
    <label htmlFor={`notes-${unit.id}`} className="text-sm font-semibold">{t('centre.curriculum.reviewNotes')}</label>
    <TextArea id={`notes-${unit.id}`} rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)}/>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onClick={() => onDecide('approve', notes.trim() || null)} icon={<CheckCircle2 size={14} aria-hidden="true"/>}>{t('centre.curriculum.approveUnit')}</Button>
      <Button size="sm" variant="secondary" disabled={busy || !notes.trim()} onClick={() => onDecide('changes', notes.trim())}>{t('centre.curriculum.requestChanges')}</Button>
    </div>
  </div>;
}
