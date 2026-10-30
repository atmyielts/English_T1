import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardCheck, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { CefrLevel, PlacementTest } from '../../../../../packages/ai-core/src/centre/placement.ts';
import { ApiError, ApiErrorState, Badge, Button, Card, CreditCost, EmptyState, Field, getPage, LoadingState, PageHeader, TextArea, TextInput, useLocation, useT } from '../../core/index.ts';
import { CEFR, CentreGate, LEVEL, Loaded, newKey, Section, Select, Table, Tabs, useCentre, useCentreApi, useFormat, useLoad, useSubmit } from '../kit.tsx';

// C5 placement tests: the builder (checked keys, a teacher approves before anyone
// takes it), attempts with the objective score, AI marks for writing and speaking
// with evidence, the teacher's confirmed level and the report; and the test screen
// for students.

interface TestRow { id: string; title: string; status: 'draft' | 'approved' | 'archived'; revision: number; updated_at: string; attempts: number }
interface PublicItem { id: string; type: 'mcq' | 'gap'; prompt: string; options: string[] | null }
interface PublicSection { id: string; title: string; kind: 'objective' | 'writing' | 'speaking'; instructions: string | null; prompt: string | null; min_words: number | null; items: PublicItem[] }
interface PublicTest { title: string; from_level: string; to_level: string; minutes: number | null; instructions: string | null; sections: PublicSection[] }
interface Mark { level: string; criteria: { name: string; score: number; note: string }[]; evidence: string[]; evidence_checked: boolean; comment: string; top_fixes: string[]; kind: string }
interface Attempt {
  id: string; test_page_id: string | null; channel: string; status: 'in_progress' | 'submitted' | 'marked' | 'reviewed'; prospect?: Record<string, string | null>; taker_user_id?: string | null;
  answers: Record<string, string | number>; objective: { correct: number; total: number; percent: number; level: string | null; ceiling: string | null; by_level: Record<string, { correct: number; total: number }> } | null;
  ai_marks: Record<string, Mark | string> | null; level: string | null; report: { level_label: string; teacher_note: string | null; objective: { percent: number; correct: number; total: number } | null; productive: { title: string; mark: Mark | null }[] } | null;
  submitted_at: string | null; created_at: string;
}

const blankTest = (): PlacementTest => ({
  title: '', from_level: 'a1', to_level: 'b2', minutes: 30,
  sections: [{ id: 'grammar', title: 'Grammar and vocabulary', kind: 'objective', items: [{ id: 'q1', type: 'mcq', level: 'a1', prompt: '', options: ['', '', ''], answer: 0 }] }],
  bands: [{ level: 'a1', min_percent: 0 }, { level: 'a2', min_percent: 35 }, { level: 'b1', min_percent: 60 }, { level: 'b2', min_percent: 85 }],
});

export function PlacementPage() {
  const t = useT(), { query } = useLocation();
  const [tab, setTab] = useState<'tests' | 'attempts'>('tests');
  return <CentreGate roles={['owner', 'admin', 'teacher']}>
    <PageHeader title={t('centre.placement.title')} lead={t('centre.placement.lead')}/>
    <Tabs label={t('centre.placement.title')} active={tab} onChange={setTab} tabs={[{ key: 'tests', label: t('centre.placement.tests') }, { key: 'attempts', label: t('centre.placement.attempts') }]}/>
    {tab === 'tests' ? <Tests initial={query.get('test')}/> : <Attempts/>}
  </CentreGate>;
}

/** What the key check of an AI draft found (centre/placement-draft-review). */
interface DraftReview { dropped: number; asked: number; agreed: number; disagreements: { item: string; key: string; solver: string; reason: string | null }[]; unanswered: string[] }

function Tests({ initial }: { initial: string | null }) {
  const t = useT(), f = useFormat(), call = useCentreApi(), { workspaceId } = useCentre();
  const state = useLoad<{ tests: TestRow[] }>('placement-tests');
  const [editing, setEditing] = useState<{ id: string | null; revision: number; test: PlacementTest } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [review, setReview] = useState<DraftReview | null>(null);
  const open = useSubmit(), change = useSubmit();
  const load = (row: { id: string }) => open.run(async () => {
    const [page, flagged] = await Promise.all([
      getPage(row.id, workspaceId),
      call<{ review: DraftReview | null }>('placement-draft-review', { query: { id: row.id } }).catch(() => ({ review: null })),
    ]);
    setReview(flagged.review);
    setEditing({ id: row.id, revision: page.revision, test: page.material as PlacementTest });
  });
  useEffect(() => { if (initial) void load({ id: initial }); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  if (editing) return <Builder start={editing} review={review} onDone={() => { setEditing(null); setReview(null); void state.reload(); }}/>;
  if (drafting) return <DraftForm onCancel={() => setDrafting(false)} onDrafted={(result) => { setDrafting(false); setReview(result.review); setEditing({ id: result.page_id, revision: result.revision, test: result.test }); void state.reload(); }}/>;
  return <Section title={t('centre.placement.tests')} lead={t('centre.placement.testsLead')} actions={<div className="flex flex-wrap gap-2">
    <Button variant="spark" onClick={() => setDrafting(true)} icon={<Sparkles size={16} aria-hidden="true"/>}>{t('centre.placement.draft')}</Button>
    <Button variant="secondary" onClick={() => { setReview(null); setEditing({ id: null, revision: 0, test: blankTest() }); }} icon={<Plus size={16} aria-hidden="true"/>}>{t('centre.placement.new')}</Button>
  </div>}>
    {(open.error !== null || change.error !== null) && <div className="mb-3"><ApiErrorState error={open.error ?? change.error}/></div>}
    <Loaded state={state}>{(data) => <Table caption={t('centre.placement.tests')} rows={data.tests} rowKey={(row) => row.id} empty={t('centre.placement.noTests')} columns={[
      { key: 'title', label: t('centre.placement.testTitle'), render: (row) => <span className="font-semibold">{row.title}</span> },
      { key: 'status', label: t('centre.people.status'), render: (row) => <Badge tone={row.status === 'approved' ? 'lime' : 'neutral'}>{t(`centre.placement.status.${row.status}`)}</Badge> },
      { key: 'attempts', label: t('centre.placement.attempts'), render: (row) => f.number(row.attempts) },
      { key: 'updated', label: t('centre.admin.when'), render: (row) => f.date(row.updated_at) },
      { key: 'actions', label: <span className="sr-only">{t('centre.people.actions')}</span>, render: (row) => <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={open.busy} onClick={() => void load(row)}>{t('centre.common.edit')}</Button>
        {row.status === 'draft' && <Button size="sm" disabled={change.busy} onClick={() => void change.run(async () => { await call('placement-tests', { method: 'PATCH', body: { id: row.id, expected_revision: row.revision, status: 'approved' } }); await state.reload(); })} icon={<CheckCircle2 size={14} aria-hidden="true"/>}>{t('centre.placement.approve')}</Button>}
        {row.status === 'approved' && <Button size="sm" variant="ghost" disabled={change.busy} onClick={() => void change.run(async () => { await call('placement-tests', { method: 'PATCH', body: { id: row.id, expected_revision: row.revision, status: 'archived' } }); await state.reload(); })}>{t('centre.placement.archive')}</Button>}
      </div> },
    ]}/>}</Loaded>
  </Section>;
}

function DraftForm({ onCancel, onDrafted }: { onCancel(): void; onDrafted(result: { page_id: string; revision: number; test: PlacementTest; review: DraftReview }): void }) {
  const t = useT(), call = useCentreApi(), { refresh } = useCentre();
  const [form, setForm] = useState({ title: '', from: 'a1' as CefrLevel, to: 'b1' as CefrLevel, perLevel: '6', writing: true, speaking: false, focus: '' });
  const key = useRef(newKey());
  const submit = useSubmit();
  const levelOptions = CEFR.map((code) => ({ value: code, label: LEVEL[code] }));
  const reversed = CEFR.indexOf(form.from) > CEFR.indexOf(form.to);
  const go = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(async () => {
      const result = await call<{ page_id: string; revision: number; test: PlacementTest; review: DraftReview }>('placement-generate', {
        method: 'POST', idempotencyKey: key.current,
        body: { title: form.title.trim() || undefined, from_level: form.from, to_level: form.to, per_level: Number(form.perLevel), writing: form.writing, speaking: form.speaking, focus: form.focus.trim() || undefined },
      });
      key.current = newKey();
      void refresh(); // the pooled credit balance in the header
      onDrafted(result);
    });
  };
  return <Section title={t('centre.placement.draftTitle')} lead={t('centre.placement.draftLead')}>
    <form onSubmit={go} className="grid gap-4 md:max-w-2xl">
      <Field label={t('centre.placement.testTitle')} hint={t('centre.placement.draftTitleHint')}>{(id) => <TextInput id={id} maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/>}</Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label={t('centre.placement.from')} value={form.from} onChange={(value) => setForm({ ...form, from: value })} options={levelOptions}/>
        <Select label={t('centre.placement.to')} value={form.to} onChange={(value) => setForm({ ...form, to: value })} options={levelOptions}/>
        <Field label={t('centre.placement.perLevel')}>{(id) => <TextInput id={id} type="number" min={3} max={10} required value={form.perLevel} onChange={(event) => setForm({ ...form, perLevel: event.target.value })}/>}</Field>
      </div>
      {reversed && <p className="m-0 text-sm text-amber-900" role="alert">{t('centre.placement.reversed')}</p>}
      <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0"><legend className="mb-1 text-sm font-semibold text-gray-800">{t('centre.placement.draftTasks')}</legend>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.writing} onChange={(event) => setForm({ ...form, writing: event.target.checked })}/>{t('centre.placement.kind.writing')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.speaking} onChange={(event) => setForm({ ...form, speaking: event.target.checked })}/>{t('centre.placement.kind.speaking')}</label>
      </fieldset>
      <Field label={t('centre.placement.draftFocus')} hint={t('centre.placement.draftFocusHint')}>{(id) => <TextArea id={id} rows={2} maxLength={300} value={form.focus} onChange={(event) => setForm({ ...form, focus: event.target.value })}/>}</Field>
      <p className="m-0 text-sm text-gray-700">{t('centre.placement.draftChecks')}</p>
      <CreditCost creditKey="placement.generate"/>
      {submit.error !== null && <ApiErrorState error={submit.error}/>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="spark" disabled={submit.busy || reversed} icon={<Sparkles size={16} aria-hidden="true"/>}>{submit.busy ? t('centre.placement.drafting') : t('centre.placement.draft')}</Button>
        <Button variant="ghost" disabled={submit.busy} onClick={onCancel}>{t('centre.common.cancel')}</Button>
      </div>
    </form>
  </Section>;
}

function DraftReviewNote({ review }: { review: DraftReview }) {
  const t = useT();
  const clean = review.disagreements.length === 0 && review.unanswered.length === 0;
  return <div role="status" className={`rounded-3xl border p-4 text-sm ${clean ? 'border-navy-line bg-lime-soft/40' : 'border-amber-300 bg-amber-50'}`}>
    <p className="m-0 font-semibold">{t('centre.placement.reviewTitle')}</p>
    <p className="m-0 mt-1">{t('centre.placement.reviewSummary', { agreed: review.agreed, asked: review.asked })}</p>
    {review.dropped > 0 && <p className="m-0 mt-1">{t('centre.placement.reviewDropped', { count: review.dropped })}</p>}
    {review.disagreements.length > 0 && <ul className="m-0 mt-2 grid list-disc gap-1 pl-5">{review.disagreements.map((entry) => <li key={entry.item}>
      {t('centre.placement.reviewDisagree', { item: entry.item, key: entry.key, solver: entry.solver })}{entry.reason ? ` ${entry.reason}` : ''}
    </li>)}</ul>}
    {review.unanswered.length > 0 && <p className="m-0 mt-1">{t('centre.placement.reviewUnanswered', { items: review.unanswered.join(', ') })}</p>}
    <p className="m-0 mt-2 text-gray-700">{t('centre.placement.reviewApprove')}</p>
  </div>;
}

function Builder({ start, review, onDone }: { start: { id: string | null; revision: number; test: PlacementTest }; review: DraftReview | null; onDone(): void }) {
  const t = useT(), call = useCentreApi();
  const [test, setTest] = useState<PlacementTest>(start.test);
  const [problems, setProblems] = useState<string[]>([]);
  const submit = useSubmit();
  const levelOptions = CEFR.map((code) => ({ value: code, label: LEVEL[code] }));
  type Section = PlacementTest['sections'][number];
  const setSection = (index: number, patch: Partial<Section>) => setTest({ ...test, sections: test.sections.map((sec, at) => (at === index ? { ...sec, ...patch } : sec)) });
  const nextId = (prefix: string) => { const used = new Set([...test.sections.map((sec) => sec.id), ...test.sections.flatMap((sec) => (sec.items ?? []).map((entry) => entry.id))]); let n = 1; while (used.has(`${prefix}${n}`)) n++; return `${prefix}${n}`; };
  const save = (event: FormEvent) => {
    event.preventDefault();
    setProblems([]);
    void submit.run(async () => {
      try {
        if (start.id) await call('placement-tests', { method: 'PATCH', body: { id: start.id, expected_revision: start.revision, material: test } });
        else await call('placement-tests', { method: 'POST', body: { material: test } });
        onDone();
      } catch (cause) {
        if (cause instanceof ApiError && cause.code === 'test_problems') { setProblems((cause.details.problems as string[]) ?? []); return; }
        throw cause;
      }
    });
  };
  return <form onSubmit={save} className="grid gap-6">
    {review && <DraftReviewNote review={review}/>}
    <Section title={start.id ? t('centre.placement.edit') : t('centre.placement.new')} lead={t('centre.placement.builderLead')}>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <Field label={t('centre.placement.testTitle')}>{(id) => <TextInput id={id} required minLength={3} maxLength={160} value={test.title} onChange={(event) => setTest({ ...test, title: event.target.value })}/>}</Field>
        <Select label={t('centre.placement.from')} value={test.from_level} onChange={(value) => setTest({ ...test, from_level: value as CefrLevel })} options={levelOptions}/>
        <Select label={t('centre.placement.to')} value={test.to_level} onChange={(value) => setTest({ ...test, to_level: value as CefrLevel })} options={levelOptions}/>
        <Field label={t('centre.placement.minutes')}>{(id) => <TextInput id={id} type="number" min={5} max={180} value={String(test.minutes ?? 30)} onChange={(event) => setTest({ ...test, minutes: Number(event.target.value) })}/>}</Field>
      </div>
      <div className="mt-3"><Field label={t('centre.placement.instructions')}>{(id) => <TextArea id={id} rows={2} maxLength={1200} value={test.instructions ?? ''} onChange={(event) => setTest({ ...test, instructions: event.target.value || undefined })}/>}</Field></div>
    </Section>
    {test.sections.map((sec, index) => <Section key={index} title={sec.title || t('centre.placement.section')} actions={<Button size="sm" variant="ghost" onClick={() => setTest({ ...test, sections: test.sections.filter((_, at) => at !== index) })} icon={<Trash2 size={14} aria-hidden="true"/>}>{t('centre.common.remove')}</Button>}>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <Field label={t('centre.placement.sectionTitle')}>{(id) => <TextInput id={id} required maxLength={120} value={sec.title} onChange={(event) => setSection(index, { title: event.target.value })}/>}</Field>
        <Select label={t('centre.placement.sectionKind')} value={sec.kind} onChange={(kind) => setSection(index, kind === 'objective' ? { kind, items: sec.items?.length ? sec.items : [], prompt: undefined } : { kind, items: undefined, prompt: sec.prompt ?? '' })} options={(['objective', 'writing', 'speaking'] as const).map((kind) => ({ value: kind, label: t(`centre.placement.kind.${kind}`) }))}/>
      </div>
      {sec.kind === 'objective' ? <div className="mt-4 grid gap-3">
        {(sec.items ?? []).map((entry, at) => {
          const setItem = (patch: Partial<typeof entry>) => setSection(index, { items: (sec.items ?? []).map((item, n) => (n === at ? { ...item, ...patch } : item)) });
          return <div key={entry.id} className="rounded-2xl border border-navy-line/30 bg-white p-3">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Select label={t('centre.placement.itemType')} value={entry.type} onChange={(type) => setItem(type === 'mcq' ? { type, options: entry.options ?? ['', '', ''], answer: entry.answer ?? 0, accept: undefined } : { type, options: undefined, answer: undefined, accept: entry.accept ?? [''] })} options={[{ value: 'mcq', label: t('centre.placement.mcq') }, { value: 'gap', label: t('centre.placement.gap') }]}/>
              <Select label={t('centre.placement.itemLevel')} value={entry.level} onChange={(value) => setItem({ level: value as CefrLevel })} options={levelOptions}/>
              <div className="self-end"><Button size="sm" variant="ghost" onClick={() => setSection(index, { items: (sec.items ?? []).filter((_, n) => n !== at) })} aria-label={t('centre.common.remove')} icon={<Trash2 size={14} aria-hidden="true"/>}/></div>
            </div>
            <div className="mt-3"><Field label={t('centre.placement.prompt', { n: at + 1 })} hint={entry.type === 'gap' ? t('centre.placement.gapHint') : undefined}>{(id) => <TextInput id={id} required maxLength={600} value={entry.prompt} onChange={(event) => setItem({ prompt: event.target.value })}/>}</Field></div>
            {entry.type === 'mcq' ? <fieldset className="m-0 mt-3 grid gap-2 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('centre.placement.options')}</legend>
              {(entry.options ?? []).map((option, n) => <div key={n} className="flex items-center gap-2">
                <input type="radio" name={`key-${entry.id}`} checked={entry.answer === n} onChange={() => setItem({ answer: n })} aria-label={t('centre.placement.isKey', { letter: String.fromCharCode(65 + n) })}/>
                <span className="w-5 text-sm font-semibold">{String.fromCharCode(65 + n)}</span>
                <label className="sr-only" htmlFor={`${entry.id}-o${n}`}>{t('centre.placement.option', { letter: String.fromCharCode(65 + n) })}</label>
                <TextInput id={`${entry.id}-o${n}`} required maxLength={200} value={option} onChange={(event) => setItem({ options: (entry.options ?? []).map((value, m) => (m === n ? event.target.value : value)) })}/>
                {(entry.options ?? []).length > 2 && <Button size="sm" variant="ghost" onClick={() => setItem({ options: (entry.options ?? []).filter((_, m) => m !== n), answer: (entry.answer ?? 0) >= n && (entry.answer ?? 0) > 0 ? (entry.answer ?? 0) - 1 : entry.answer })} aria-label={t('centre.common.remove')} icon={<Trash2 size={12} aria-hidden="true"/>}/>}
              </div>)}
              {(entry.options ?? []).length < 6 && <div><Button size="sm" variant="secondary" onClick={() => setItem({ options: [...(entry.options ?? []), ''] })}>{t('centre.placement.addOption')}</Button></div>}
            </fieldset> : <div className="mt-3"><Field label={t('centre.placement.accept')} hint={t('centre.placement.acceptHint')}>{(id) => <TextInput id={id} required value={(entry.accept ?? []).join(' | ')} onChange={(event) => setItem({ accept: event.target.value.split('|').map((value) => value.trim()).filter(Boolean).slice(0, 8) })}/>}</Field></div>}
          </div>;
        })}
        <div><Button size="sm" variant="secondary" onClick={() => setSection(index, { items: [...(sec.items ?? []), { id: nextId('q'), type: 'mcq', level: test.from_level, prompt: '', options: ['', '', ''], answer: 0 }] })} icon={<Plus size={14} aria-hidden="true"/>}>{t('centre.placement.addItem')}</Button></div>
      </div> : <div className="mt-4 grid gap-3 md:grid-cols-[3fr_1fr]">
        <Field label={t('centre.placement.task')}>{(id) => <TextArea id={id} rows={3} required minLength={10} maxLength={1200} value={sec.prompt ?? ''} onChange={(event) => setSection(index, { prompt: event.target.value })}/>}</Field>
        <Field label={t('centre.placement.minWords')}>{(id) => <TextInput id={id} type="number" min={0} max={600} value={String(sec.min_words ?? 0)} onChange={(event) => setSection(index, { min_words: Number(event.target.value) })}/>}</Field>
      </div>}
    </Section>)}
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setTest({ ...test, sections: [...test.sections, { id: nextId('s'), title: '', kind: 'objective', items: [] }] })} icon={<Plus size={14} aria-hidden="true"/>}>{t('centre.placement.addSection')}</Button>
      <Button variant="secondary" onClick={() => setTest({ ...test, sections: [...test.sections, { id: nextId('w'), title: t('centre.placement.kind.writing'), kind: 'writing', prompt: '', min_words: 60 }] })}>{t('centre.placement.addWriting')}</Button>
    </div>
    <Section title={t('centre.placement.bands')} lead={t('centre.placement.bandsLead')}>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">{test.bands.map((band, index) => <li key={index} className="flex items-end gap-2">
        <Select label={t('centre.placement.level')} value={band.level} onChange={(value) => setTest({ ...test, bands: test.bands.map((entry, at) => (at === index ? { ...entry, level: value as CefrLevel } : entry)) })} options={levelOptions}/>
        <Field label={t('centre.placement.minPercent')}>{(id) => <TextInput id={id} type="number" min={0} max={100} value={String(band.min_percent)} onChange={(event) => setTest({ ...test, bands: test.bands.map((entry, at) => (at === index ? { ...entry, min_percent: Number(event.target.value) } : entry)) })}/>}</Field>
        <Button size="sm" variant="ghost" onClick={() => setTest({ ...test, bands: test.bands.filter((_, at) => at !== index) })} aria-label={t('centre.common.remove')} icon={<Trash2 size={14} aria-hidden="true"/>}/>
      </li>)}</ul>
      {test.bands.length < 7 && <div className="mt-2"><Button size="sm" variant="secondary" onClick={() => setTest({ ...test, bands: [...test.bands, { level: 'c1', min_percent: 95 }] })}>{t('centre.placement.addBand')}</Button></div>}
    </Section>
    {problems.length > 0 && <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-3"><p className="m-0 mb-2 text-sm font-semibold text-amber-900">{t('centre.placement.problems')}</p><ul className="m-0 list-disc pl-5 text-sm text-amber-950">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}
    {submit.error !== null && <ApiErrorState error={submit.error}/>}
    <div className="flex gap-2"><Button type="submit" disabled={submit.busy}>{submit.busy ? t('centre.common.working') : t('centre.placement.saveDraft')}</Button><Button variant="ghost" onClick={onDone}>{t('centre.common.cancel')}</Button></div>
  </form>;
}

function Attempts() {
  const t = useT(), f = useFormat();
  const state = useLoad<{ attempts: Attempt[] }>('placement-attempts');
  const [open, setOpen] = useState<string | null>(null);
  if (open) return <Review id={open} onBack={() => { setOpen(null); void state.reload(); }}/>;
  return <Section title={t('centre.placement.attempts')} lead={t('centre.placement.attemptsLead')}>
    <Loaded state={state}>{(data) => <Table caption={t('centre.placement.attempts')} rows={data.attempts} rowKey={(row) => row.id} empty={t('centre.placement.noAttempts')} columns={[
      { key: 'who', label: t('centre.people.name'), render: (row) => <span className="font-semibold">{row.prospect?.name ?? (row.taker_user_id ? t('role.student') : t('centre.placement.prospect'))}</span> },
      { key: 'channel', label: t('centre.placement.channel'), render: (row) => t(`centre.placement.channels.${row.channel}`) },
      { key: 'score', label: t('centre.placement.score'), render: (row) => row.objective ? `${row.objective.correct}/${row.objective.total} · ${row.objective.percent}%` : '—' },
      { key: 'level', label: t('centre.placement.level'), render: (row) => (row.level ? LEVEL[row.level] : '—') },
      { key: 'status', label: t('centre.people.status'), render: (row) => <Badge tone={row.status === 'reviewed' ? 'lime' : row.status === 'in_progress' ? 'neutral' : 'sky'}>{t(`centre.placement.attemptStatus.${row.status}`)}</Badge> },
      { key: 'when', label: t('centre.admin.when'), render: (row) => f.dateTime(row.submitted_at ?? row.created_at) },
      { key: 'open', label: <span className="sr-only">{t('centre.people.actions')}</span>, render: (row) => row.status !== 'in_progress' && <Button size="sm" variant="secondary" onClick={() => setOpen(row.id)}>{t('centre.placement.review')}</Button> },
    ]}/>}</Loaded>
  </Section>;
}

function Review({ id, onBack }: { id: string; onBack(): void }) {
  const t = useT(), call = useCentreApi();
  const state = useLoad<{ attempt: Attempt; test: PublicTest | null; key: Record<string, { answer?: number; accept?: string[] }> | null }>('placement-attempts', { id });
  const mark = useSubmit(), review = useSubmit();
  const [level, setLevel] = useState<string | null>(null), [note, setNote] = useState('');
  return <Loaded state={state}>{({ attempt, test, key }) => {
    const marks = (attempt.ai_marks ?? {}) as Record<string, Mark>;
    const chosen = level ?? attempt.level ?? attempt.objective?.level ?? 'a1';
    return <div className="grid gap-6">
      <div><Button variant="ghost" onClick={onBack}>← {t('centre.placement.attempts')}</Button></div>
      {attempt.objective && <Section title={t('centre.placement.objective')}>
        <p className="m-0 text-sm">{t('centre.placement.objectiveLine', { correct: attempt.objective.correct, total: attempt.objective.total, percent: attempt.objective.percent, level: attempt.objective.level ? LEVEL[attempt.objective.level] : '—' })}</p>
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">{Object.entries(attempt.objective.by_level).map(([code, row]) => <li key={code}><Badge>{LEVEL[code]}: {row.correct}/{row.total}</Badge></li>)}</ul>
        {test && key && <ol className="m-0 mt-4 grid list-decimal gap-1 pl-5 text-sm">{test.sections.flatMap((sec) => sec.items).map((entry) => {
          const given = attempt.answers[entry.id], right = key[entry.id];
          const shown = entry.type === 'mcq' ? (typeof given === 'number' ? String.fromCharCode(65 + given) : '—') : String(given ?? '—');
          const ok = entry.type === 'mcq' ? given === right?.answer : (right?.accept ?? []).some((value) => value.toLowerCase() === String(given ?? '').trim().toLowerCase().replace(/[.!?]+$/, ''));
          return <li key={entry.id}><span className={ok ? 'text-green-800' : 'text-red-700'}>{shown}</span> <span className="text-gray-600">· {entry.prompt}</span></li>;
        })}</ol>}
      </Section>}
      {test?.sections.filter((sec) => sec.kind !== 'objective').map((sec) => <Section key={sec.id} title={sec.title} lead={sec.prompt}>
        <p className="m-0 whitespace-pre-wrap rounded-2xl bg-cream-soft p-3 text-sm leading-6">{String(attempt.answers[sec.id] ?? t('centre.placement.noAnswer'))}</p>
        {marks[sec.id] && <div className="mt-3 grid gap-2 text-sm">
          <p className="m-0"><Badge tone="sky">{t('centre.placement.aiSuggests', { level: LEVEL[marks[sec.id].level] })}</Badge></p>
          <ul className="m-0 list-disc pl-5">{marks[sec.id].criteria.map((row) => <li key={row.name}><strong>{row.name}</strong>: {row.score}/5 — {row.note}</li>)}</ul>
          {marks[sec.id].evidence.length > 0 && <p className="m-0 text-gray-700">{t('centre.placement.evidence')}: {marks[sec.id].evidence.map((quote) => `“${quote}”`).join(' · ')}</p>}
          <p className="m-0">{marks[sec.id].comment}</p>
          {marks[sec.id].top_fixes.length > 0 && <p className="m-0 text-gray-700">{t('centre.placement.fixes')}: {marks[sec.id].top_fixes.join('; ')}</p>}
        </div>}
      </Section>)}
      {test?.sections.some((sec) => sec.kind !== 'objective') && attempt.status !== 'reviewed' && <div className="flex flex-wrap items-center gap-3">
        <Button variant="spark" disabled={mark.busy} onClick={() => void mark.run(async () => { await call('placement-mark', { method: 'POST', body: { attempt_id: attempt.id } }); await state.reload(); })} icon={<Sparkles size={16} aria-hidden="true"/>}>{mark.busy ? t('centre.common.working') : t('centre.placement.markAi')}</Button>
        <CreditCost creditKey="placement.mark"/>
        {mark.error !== null && <ApiErrorState error={mark.error}/>}
      </div>}
      <Section title={attempt.status === 'reviewed' ? t('centre.placement.report') : t('centre.placement.confirm')} lead={attempt.status === 'reviewed' ? undefined : t('centre.placement.confirmLead')}>
        {attempt.status === 'reviewed' && attempt.report ? <p className="m-0 text-sm">{t('centre.placement.reportLine', { level: attempt.report.level_label })}{attempt.report.teacher_note ? ` — ${attempt.report.teacher_note}` : ''}</p> :
          <form className="grid gap-3 md:max-w-xl" onSubmit={(event) => { event.preventDefault(); void review.run(async () => { await call('placement-review', { method: 'POST', body: { attempt_id: attempt.id, level: chosen, note: note.trim() || null } }); await state.reload(); }); }}>
            <Select label={t('centre.placement.level')} value={chosen} onChange={setLevel} options={CEFR.map((code) => ({ value: code, label: LEVEL[code] }))}/>
            <Field label={t('centre.placement.teacherNote')}>{(fieldId) => <TextArea id={fieldId} rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)}/>}</Field>
            {review.error !== null && <ApiErrorState error={review.error}/>}
            <div><Button type="submit" disabled={review.busy} icon={<ClipboardCheck size={16} aria-hidden="true"/>}>{t('centre.placement.confirmLevel')}</Button></div>
          </form>}
      </Section>
    </div>;
  }}</Loaded>;
}

// --- Taking a test (students and staff) -----------------------------------------------------

export function TakePlacementPage({ params }: { params: Record<string, string> }) {
  return <CentreGate><Take id={params.id}/></CentreGate>;
}

function Take({ id }: { id: string }) {
  const t = useT(), call = useCentreApi(), { isCentre } = useCentre();
  const testState = useLoad<{ id: string; test: PublicTest }>(isCentre ? 'placement-test' : null, { id });
  const [attempt, setAttempt] = useState<Attempt | null>(null), [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [restoring, setRestoring] = useState(true);
  const submit = useSubmit(), begin = useSubmit();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    call<{ attempts: Attempt[] }>('placement-available').then((result) => {
      const open = result.attempts.find((row) => row.test_page_id === id && row.status !== 'reviewed') ?? result.attempts.find((row) => row.test_page_id === id);
      if (open) { setAttempt(open); setAnswers(open.answers); }
    }).catch(() => undefined).finally(() => setRestoring(false));
  }, [call, id]);
  const change = (key: string, value: string | number) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    clearTimeout(timer.current);
    if (attempt) timer.current = setTimeout(() => { void call('placement-answer', { method: 'POST', body: { attempt_id: attempt.id, answers: next } }).catch(() => undefined); }, 1200);
  };
  if (testState.error) return <ApiErrorState error={testState.error}/>;
  if (!testState.data || restoring) return <LoadingState/>;
  const test = testState.data.test;
  if (attempt && attempt.status !== 'in_progress') return <Card className="max-w-2xl">
    <CheckCircle2 size={24} className="text-green-700" aria-hidden="true"/>
    <h1 className="m-0 mt-2 font-display text-2xl font-bold">{test.title}</h1>
    {attempt.status === 'reviewed' && attempt.report ? <p className="m-0 mt-2 text-base">{t('centre.take.result', { level: attempt.report.level_label })}{attempt.report.teacher_note ? ` ${attempt.report.teacher_note}` : ''}</p> : <p className="m-0 mt-2 text-sm text-gray-700">{t('centre.take.handedIn')}</p>}
  </Card>;
  if (!attempt) return <Card className="max-w-2xl">
    <h1 className="m-0 font-display text-2xl font-bold">{test.title}</h1>
    <p className="m-0 mt-2 text-sm text-gray-700">{t('centre.take.intro', { minutes: test.minutes ?? 30, count: test.sections.reduce((n, sec) => n + sec.items.length, 0) })}</p>
    {test.instructions && <p className="m-0 mt-2 text-sm">{test.instructions}</p>}
    {begin.error !== null && <div className="mt-3"><ApiErrorState error={begin.error}/></div>}
    <div className="mt-4"><Button disabled={begin.busy} onClick={() => void begin.run(async () => { const result = await call<{ attempt: Attempt }>('placement-start', { method: 'POST', body: { page_id: id } }); setAttempt(result.attempt); })}>{t('centre.take.start')}</Button></div>
  </Card>;
  return <form className="grid max-w-3xl gap-6" onSubmit={(event) => { event.preventDefault(); if (!confirm(t('centre.take.confirm'))) return; void submit.run(async () => { await call('placement-answer', { method: 'POST', body: { attempt_id: attempt.id, answers } }); const result = await call<{ attempt: Attempt }>('placement-submit', { method: 'POST', body: { attempt_id: attempt.id } }); setAttempt(result.attempt); }); }}>
    <PageHeader title={test.title} lead={test.instructions ?? undefined}/>
    {test.sections.map((sec) => <Card key={sec.id}>
      <h2 className="m-0 font-display text-lg font-bold">{sec.title}</h2>
      {sec.instructions && <p className="m-0 mt-1 text-sm text-gray-700">{sec.instructions}</p>}
      {sec.kind === 'objective' ? <ol className="m-0 mt-4 grid list-decimal gap-5 pl-5">{sec.items.map((entry) => <li key={entry.id}>
        {entry.type === 'mcq' ? <fieldset className="m-0 border-0 p-0"><legend className="mb-2 text-sm font-semibold">{entry.prompt}</legend>
          <div className="grid gap-2">{(entry.options ?? []).map((option, n) => <label key={n} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-3 text-sm ${answers[entry.id] === n ? 'border-navy bg-cream-soft' : 'border-navy-line/30 bg-white'}`}>
            <input type="radio" name={entry.id} checked={answers[entry.id] === n} onChange={() => change(entry.id, n)}/>{String.fromCharCode(65 + n)}. {option}
          </label>)}</div>
        </fieldset> : <Field label={entry.prompt}>{(fieldId) => <TextInput id={fieldId} maxLength={120} value={String(answers[entry.id] ?? '')} onChange={(event) => change(entry.id, event.target.value)} autoComplete="off"/>}</Field>}
      </li>)}</ol> : <div className="mt-3 grid gap-2">
        <p className="m-0 text-sm">{sec.prompt}</p>
        <label htmlFor={`answer-${sec.id}`} className="sr-only">{sec.title}</label>
        <TextArea id={`answer-${sec.id}`} rows={8} maxLength={6000} value={String(answers[sec.id] ?? '')} onChange={(event) => change(sec.id, event.target.value)}/>
        <p className="m-0 text-xs text-gray-600">{t('centre.take.words', { count: String(answers[sec.id] ?? '').trim().split(/\s+/).filter(Boolean).length, min: sec.min_words ?? 0 })}{sec.kind === 'speaking' ? ` · ${t('centre.take.speakingHint')}` : ''}</p>
      </div>}
    </Card>)}
    {submit.error !== null && <ApiErrorState error={submit.error}/>}
    <div><Button type="submit" disabled={submit.busy}>{submit.busy ? t('centre.common.working') : t('centre.take.submit')}</Button></div>
    {!test.sections.length && <EmptyState/>}
  </form>;
}
