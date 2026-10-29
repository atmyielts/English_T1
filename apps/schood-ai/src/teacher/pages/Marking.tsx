import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Download, Mic, Plus, ShieldQuestion, Square, Trash2, Wand2 } from 'lucide-react';
import {
  ApiError, ApiErrorState, Badge, Button, Card, CreditCost, EmptyState, Field, Link, LoadingState, PageHeader, PlanGate, TextArea, TextInput, navigate, useI18n, useT, useWorkspace,
} from '../../core/index.ts';
import {
  addScript, base64Of, createBatch, deleteScript, getBatch, imageDataUrl, listBatches, markRecording, markScript, saveScript, scriptSignals,
  type BatchView, type Rubric, type ScriptView,
} from '../api.ts';
import { StatusBadge } from './Studio.tsx';

// T3 marking assistant, T14 speaking marking and T15 writing signals. A batch is one
// task and one rubric; scripts come typed, pasted, photographed or recorded (or as a
// typed transcript while no speech provider is set up). AI marks are a draft per
// criterion with quoted evidence, comments and the top three fixes; the teacher
// changes what they disagree with and confirms. Only confirmed marks are exported.

const selectClass = 'min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900';

export function MarkingPage() {
  const t = useT(), workspace = useWorkspace(), { locale } = useI18n();
  const [data, setData] = useState<Awaited<ReturnType<typeof listBatches>> | null>(null), [error, setError] = useState<unknown>(null);
  const [title, setTitle] = useState(''), [rubric, setRubric] = useState('ielts_task2'), [task, setTask] = useState(''), [level, setLevel] = useState(''), [language, setLanguage] = useState<string>(locale);
  const [busy, setBusy] = useState(false), [createError, setCreateError] = useState<unknown>(null);
  useEffect(() => { listBatches(workspace.workspaceId).then(setData).catch(setError); }, [workspace.workspaceId]);
  const create = async () => {
    setBusy(true); setCreateError(null);
    try { const batch = await createBatch(workspace.workspaceId, { title: title.trim(), rubric, task: task.trim() || undefined, level: level.trim() || undefined, feedback_language: language }); navigate(`/studio/marking/${batch.id}`); }
    catch (cause) { setCreateError(cause); } finally { setBusy(false); }
  };
  return <>
    <PageHeader title={t('teacher.marking.title')} lead={t('teacher.marking.lead')}/>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section aria-label={t('teacher.marking.batches')}>
        {error ? <ApiErrorState error={error}/> : !data ? <LoadingState/> : !data.batches.length ? <EmptyState title={t('teacher.marking.none')} lead={t('teacher.marking.noneLead')}/> :
          <ul className="m-0 grid list-none gap-3 p-0">{data.batches.map((batch) => <li key={batch.id}><Link to={`/studio/marking/${batch.id}`} className="block rounded-3xl border border-navy-line bg-white p-4 text-gray-900 no-underline hover:bg-cream-soft">
            <span className="flex flex-wrap items-center gap-2"><strong className="min-w-0 flex-1">{batch.title}</strong><Badge>{data.rubrics.find((entry) => entry.id === batch.rubric)?.label ?? batch.rubric}</Badge></span>
            <span className="mt-1 block text-sm text-gray-700">{t('teacher.marking.counts', { scripts: batch.scripts, confirmed: batch.confirmed })}</span>
          </Link></li>)}</ul>}
      </section>
      <Card as="div"><h2 className="m-0 mb-3 font-display text-lg font-bold">{t('teacher.marking.new')}</h2>
        <PlanGate feature="T3"><form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void create(); }}>
          <Field label={t('teacher.marking.batchTitle')}>{(id) => <TextInput id={id} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} placeholder={t('teacher.marking.batchPlaceholder')}/>}</Field>
          <Field label={t('teacher.marking.rubric')} hint={data?.rubrics.find((entry) => entry.id === rubric)?.schood ? t('teacher.marking.schoodRubric') : undefined}>{(id) => <select id={id} className={selectClass} value={rubric} onChange={(event) => setRubric(event.target.value)}>
            {(data?.rubrics ?? []).map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · {t(`teacher.marking.mode.${entry.mode}`)}</option>)}
          </select>}</Field>
          <Field label={t('teacher.marking.task')} hint={t('teacher.marking.taskHint')}>{(id) => <TextArea id={id} rows={3} value={task} onChange={(event) => setTask(event.target.value)} maxLength={6000}/>}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('teacher.marking.level')}>{(id) => <TextInput id={id} value={level} onChange={(event) => setLevel(event.target.value)} maxLength={20} placeholder="B2"/>}</Field>
            <Field label={t('teacher.marking.feedbackLanguage')}>{(id) => <select id={id} className={selectClass} value={language} onChange={(event) => setLanguage(event.target.value)}>{(['uz', 'ru', 'en'] as const).map((entry) => <option key={entry} value={entry}>{t(`teacher.lang.${entry}`)}</option>)}</select>}</Field>
          </div>
          <Button type="submit" disabled={busy || !title.trim()} icon={<Plus size={16} aria-hidden="true"/>}>{t('teacher.marking.create')}</Button>
          {createError !== null && <ApiErrorState error={createError}/>}
        </form></PlanGate>
      </Card>
    </div>
  </>;
}

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export function BatchPage({ params }: { params: Record<string, string> }) {
  const t = useT(), workspace = useWorkspace();
  const [data, setData] = useState<{ batch: BatchView; rubric: Rubric | null; scripts: ScriptView[] } | null>(null), [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false), [runError, setRunError] = useState<unknown>(null);
  const photos = useRef(new Map<string, string[]>());
  const load = useCallback(() => { getBatch(workspace.workspaceId, params.id).then(setData).catch(setError); }, [params.id, workspace.workspaceId]);
  useEffect(load, [load]);
  if (error) return <ApiErrorState error={error} onRetry={load}/>;
  if (!data || !data.rubric) return <LoadingState/>;
  const { batch, rubric, scripts } = data;
  const replace = (script: ScriptView) => setData({ ...data, scripts: data.scripts.some((entry) => entry.id === script.id) ? data.scripts.map((entry) => (entry.id === script.id ? script : entry)) : [...data.scripts, script] });
  const toMark = scripts.filter((script) => (script.status === 'new' || script.status === 'failed') && (script.text || photos.current.has(script.id)));
  const markAll = async () => {
    setRunning(true); setRunError(null);
    for (const script of toMark) {
      try { const result = await markScript(workspace.workspaceId, script.id, photos.current.get(script.id)); replace(result.script); photos.current.delete(script.id); }
      catch (cause) { setRunError(cause); if (cause instanceof ApiError && ['insufficient_credits', 'budget_exhausted', 'capped', 'plan_required', 'ai_disabled', 'ai_unavailable'].includes(cause.code)) break; }
    }
    setRunning(false);
    load();
  };
  const download = () => {
    const confirmed = scripts.filter((script) => script.final);
    const header = ['student', ...rubric.criteria.map((criterion) => criterion.name), 'overall', 'comments'];
    const rows = confirmed.map((script) => [script.student_label, ...rubric.criteria.map((criterion) => script.final!.marks[criterion.id] ?? ''), script.final!.overall.value, script.final!.comments]);
    const url = URL.createObjectURL(new Blob([[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `${batch.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}-marks.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const confirmedCount = scripts.filter((script) => script.status === 'confirmed').length;
  return <>
    <PageHeader eyebrow={<Link to="/studio/marking" className="text-sm text-gray-700">{t('teacher.marking.title')}</Link>} title={batch.title} lead={`${rubric.label}${batch.level ? ` · ${batch.level}` : ''}${rubric.schood ? ` · ${t('teacher.marking.schoodRubric')}` : ''}`}
      actions={<>{confirmedCount > 0 && <Button variant="secondary" onClick={download} icon={<Download size={16} aria-hidden="true"/>}>{t('teacher.marking.csv', { count: confirmedCount })}</Button>}</>}/>
    {batch.task && <p className="mb-4 whitespace-pre-wrap rounded-3xl border border-navy-line bg-white p-4 text-sm">{batch.task}</p>}
    <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <AddScript batch={batch} rubric={rubric} onAdded={(script, images) => { if (images?.length) photos.current.set(script.id, images); replace(script); }}/>
      <section className="grid content-start gap-4" aria-label={t('teacher.marking.scripts')}>
        <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-navy-line bg-white p-3">
          <Button variant="spark" onClick={() => void markAll()} disabled={running || !toMark.length} icon={<Wand2 size={16} aria-hidden="true"/>}>{running ? t('teacher.marking.running') : t('teacher.marking.markAll', { count: toMark.length })}</Button>
          <CreditCost creditKey={rubric.mode === 'speaking' ? 'speaking.marking' : 'marking.script'}/><span className="text-xs text-gray-600">{t('teacher.marking.perScript')}</span>
        </div>
        {runError !== null && <ApiErrorState error={runError}/>}
        {!scripts.length ? <EmptyState title={t('teacher.marking.noScripts')}/> : scripts.map((script) => <ScriptCard key={script.id} script={script} rubric={rubric} workspaceId={workspace.workspaceId} onChange={replace} onDelete={() => setData({ ...data, scripts: data.scripts.filter((entry) => entry.id !== script.id) })}/>)}
      </section>
    </div>
  </>;
}

function AddScript({ batch, rubric, onAdded }: { batch: BatchView; rubric: Rubric; onAdded(script: ScriptView, images?: string[]): void }) {
  const t = useT(), workspace = useWorkspace();
  const sources = rubric.mode === 'speaking' ? ['transcript', 'recording'] as const : ['typed', 'pasted', 'photo'] as const;
  const [source, setSource] = useState<ScriptView['source']>(sources[0]), [label, setLabel] = useState(''), [text, setText] = useState(''), [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  const [recording, setRecording] = useState<MediaRecorder | null>(null), [audio, setAudio] = useState<Blob | null>(null);
  const pasted = useRef(0), started = useRef<number | null>(null);
  const audioUrl = useMemo(() => (audio ? URL.createObjectURL(audio) : null), [audio]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  const reset = () => { setLabel(''); setText(''); setImages([]); setAudio(null); pasted.current = 0; started.current = null; };
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (source === 'recording') {
        if (!audio) return;
        const result = await markRecording(workspace.workspaceId, { batch_id: batch.id, student_label: label.trim(), mime: audio.type || 'audio/webm', audio: await base64Of(audio) });
        onAdded(result.script);
      } else {
        const typingMs = started.current ? Date.now() - started.current : 0;
        const script = await addScript(workspace.workspaceId, { batch_id: batch.id, student_label: label.trim(), source, ...(source === 'photo' ? {} : { text }), ...(source === 'typed' || source === 'pasted' ? { meta: { pasted_chars: pasted.current, ...(typingMs ? { typing_ms: typingMs } : {}) } } : {}) });
        onAdded(script, images);
      }
      reset();
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  const record = async () => {
    if (recording) { recording.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream), chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = () => { stream.getTracks().forEach((track) => track.stop()); setAudio(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })); setRecording(null); };
      recorder.start();
      setRecording(recorder);
    } catch { setError(new ApiError(0, 'microphone', 'Microphone unavailable')); }
  };
  const ready = label.trim() && (source === 'photo' ? images.length > 0 : source === 'recording' ? !!audio : text.trim().length >= 20);
  return <Card as="div" className="content-start">
    <h2 className="m-0 mb-3 font-display text-lg font-bold">{t('teacher.marking.add')}</h2>
    <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div role="radiogroup" aria-label={t('teacher.marking.source')} className="flex flex-wrap gap-2">{sources.map((entry) => <button key={entry} type="button" role="radio" aria-checked={source === entry} onClick={() => setSource(entry)}
        className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${source === entry ? 'border-navy bg-navy text-white' : 'border-navy-line/40 bg-white'}`}>{t(`teacher.marking.from.${entry}`)}</button>)}</div>
      <Field label={t('teacher.marking.student')} hint={t('teacher.marking.studentHint')}>{(id) => <TextInput id={id} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} required/>}</Field>
      {(source === 'typed' || source === 'pasted' || source === 'transcript') && <Field label={source === 'transcript' ? t('teacher.marking.transcript') : t('teacher.marking.text')}>{(id) => <TextArea id={id} rows={8} value={text} maxLength={20000}
        onPaste={(event) => { pasted.current += event.clipboardData.getData('text').length; }} onKeyDown={() => { started.current ??= Date.now(); }} onChange={(event) => setText(event.target.value)}/>}</Field>}
      {source === 'photo' && <div className="grid gap-2">
        <label className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-full border border-navy-line bg-white px-4 text-sm font-semibold"><Camera size={16} aria-hidden="true"/>{t('teacher.marking.addPhoto')}
          <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file && images.length < 3) setImages([...images, await imageDataUrl(file)]); }}/></label>
        {images.length > 0 && <p className="m-0 text-xs text-gray-700">{t('teacher.marking.photos', { count: images.length })}</p>}
      </div>}
      {source === 'recording' && <div className="grid gap-2">
        <Button variant={recording ? 'danger' : 'secondary'} onClick={() => void record()} icon={recording ? <Square size={16} aria-hidden="true"/> : <Mic size={16} aria-hidden="true"/>}>{recording ? t('teacher.marking.stop') : audio ? t('teacher.marking.recordAgain') : t('teacher.marking.record')}</Button>
        <label className="text-xs text-gray-700">{t('teacher.marking.orUpload')} <input type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) setAudio(file); }}/></label>
        {audioUrl && <audio controls src={audioUrl} className="w-full"/>}
        <p className="m-0 text-xs text-gray-600">{t('teacher.marking.speechNote')}</p>
      </div>}
      <Button type="submit" disabled={busy || !ready}>{busy ? t('teacher.marking.adding') : source === 'recording' ? t('teacher.marking.markRecording') : t('teacher.marking.addScript')}</Button>
      {error !== null && (error instanceof ApiError && error.code === 'ai_unavailable' && source === 'recording' ? <p role="alert" className="m-0 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">{t('teacher.marking.speechUnavailable')}</p> : <ApiErrorState error={error}/>)}
    </form>
  </Card>;
}

const SIGNAL_LABEL = (signal: string) => `teacher.signal.${signal}`;

function ScriptCard({ script, rubric, workspaceId, onChange, onDelete }: { script: ScriptView; rubric: Rubric; workspaceId: string | null; onChange(script: ScriptView): void; onDelete(): void }) {
  const t = useT();
  const base = script.final ?? (script.draft ? { marks: Object.fromEntries(script.draft.criteria.map((entry) => [entry.id, entry.mark])), comments: script.draft.comments, fixes: script.draft.fixes } : null);
  const [marks, setMarks] = useState<Record<string, number>>(base?.marks ?? {}), [comments, setComments] = useState(base?.comments ?? ''), [fixes, setFixes] = useState<string[]>(base?.fixes ?? []);
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [open, setOpen] = useState(script.status !== 'confirmed');
  useEffect(() => { const next = script.final ?? (script.draft ? { marks: Object.fromEntries(script.draft.criteria.map((entry) => [entry.id, entry.mark])), comments: script.draft.comments, fixes: script.draft.fixes } : null); setMarks(next?.marks ?? {}); setComments(next?.comments ?? ''); setFixes(next?.fixes ?? []); }, [script]);
  const act = async (work: () => Promise<ScriptView>) => { setBusy(true); setError(null); try { onChange(await work()); } catch (cause) { setError(cause); } finally { setBusy(false); } };
  return <article className="overflow-hidden rounded-3xl border border-navy-line bg-white">
    <header className="flex flex-wrap items-center gap-2 border-b border-navy-line/20 bg-cream-soft px-4 py-3">
      <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold" aria-expanded={open} onClick={() => setOpen(!open)}>{script.student_label}</button>
      <Badge>{t(`teacher.marking.from.${script.source}`)}</Badge><StatusBadge status={script.status === 'confirmed' ? 'approved' : script.status === 'marked' ? 'ready' : script.status === 'marking' ? 'generating' : script.status === 'failed' ? 'failed' : 'requested'}/>
      {(script.final ?? script.draft) && <span className="text-sm font-semibold tabular-nums">{(script.final ?? script.draft)!.overall.value} <span className="text-xs font-normal text-gray-600">({(script.final ?? script.draft)!.overall.scale})</span></span>}
    </header>
    {open && <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div className="min-w-0">
        <h3 className="m-0 mb-2 text-sm font-semibold">{script.source === 'recording' || script.source === 'transcript' ? t('teacher.marking.transcript') : t('teacher.marking.text')}</h3>
        {script.text ? <p className="m-0 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-cream-soft/60 p-3 text-sm leading-6">{script.text}</p> : <p className="m-0 text-sm text-gray-600">{t('teacher.marking.photoPending')}</p>}
        {script.draft?.transcript_note && <p className="m-0 mt-2 text-xs text-gray-600">{script.draft.transcript_note}</p>}
        {rubric.mode === 'writing' && script.text && <div className="mt-3 grid gap-2">
          <Button size="sm" variant="secondary" disabled={busy} icon={<ShieldQuestion size={14} aria-hidden="true"/>} onClick={() => void act(async () => (await scriptSignals(workspaceId, script.id)).script)}>{script.signals ? t('teacher.signal.again') : t('teacher.signal.check')}</Button>
          <CreditCost creditKey="writing.signal"/>
          {script.signals && <Signals signals={script.signals}/>}
        </div>}
      </div>
      <div className="grid content-start gap-3">
        {!script.draft && script.status !== 'confirmed' ? <p className="m-0 text-sm text-gray-700">{script.status === 'failed' ? t('teacher.marking.failed') : t('teacher.marking.notMarked')}</p> : <>
          <p className="m-0 text-xs text-gray-600">{script.status === 'confirmed' ? t('teacher.marking.confirmedNote') : t('teacher.marking.draftNote')}</p>
          {rubric.criteria.map((criterion) => {
            const draft = script.draft?.criteria.find((entry) => entry.id === criterion.id);
            return <div key={criterion.id} className="rounded-2xl border border-navy-line/20 p-3">
              <div className="flex items-center gap-2"><label htmlFor={`${script.id}-${criterion.id}`} className="min-w-0 flex-1 text-sm font-semibold">{criterion.name}</label>
                <input id={`${script.id}-${criterion.id}`} type="number" min={0} max={criterion.max} step={criterion.step} value={marks[criterion.id] ?? ''} onChange={(event) => setMarks({ ...marks, [criterion.id]: Number(event.target.value) })} className="w-20 rounded-xl border border-gray-300 px-2 py-1 text-right text-sm tabular-nums"/>
                <span className="text-xs text-gray-600">/ {criterion.max}</span></div>
              {draft && <p className="m-0 mt-1 text-sm text-gray-700">{draft.comment}</p>}
              {draft?.evidence.length ? <ul className="m-0 mt-1 pl-5 text-xs italic text-gray-600">{draft.evidence.map((quote, index) => <li key={index}>“{quote}”</li>)}</ul> : null}
            </div>;
          })}
          <Field label={t('teacher.marking.comments')}>{(id) => <TextArea id={id} rows={3} value={comments} onChange={(event) => setComments(event.target.value)} maxLength={2000}/>}</Field>
          <fieldset className="m-0 grid gap-2 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('teacher.marking.fixes')}</legend>
            {[0, 1, 2].map((index) => <TextInput key={index} aria-label={t('teacher.marking.fix', { number: index + 1 })} value={fixes[index] ?? ''} onChange={(event) => { const next = [...fixes]; next[index] = event.target.value; setFixes(next); }}/>)}
          </fieldset>
          {script.draft?.level_estimate && <p className="m-0 text-xs text-gray-600">{t('teacher.marking.level', { level: script.draft.level_estimate })}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || rubric.criteria.some((criterion) => !Number.isFinite(marks[criterion.id]))} icon={<Check size={16} aria-hidden="true"/>} onClick={() => void act(() => saveScript(workspaceId, { id: script.id, final: { marks, comments, fixes: fixes.filter(Boolean) }, confirm: true }))}>{script.status === 'confirmed' ? t('teacher.marking.update') : t('teacher.marking.confirm')}</Button>
            {script.status !== 'confirmed' && <Button variant="secondary" disabled={busy} onClick={() => void act(async () => (await markScript(workspaceId, script.id)).script)}>{t('teacher.marking.remark')}</Button>}
          </div>
        </>}
        {script.status !== 'confirmed' && <Button size="sm" variant="ghost" disabled={busy} icon={<Trash2 size={14} aria-hidden="true"/>} onClick={async () => { setBusy(true); try { await deleteScript(workspaceId, script.id); onDelete(); } catch (cause) { setError(cause); } finally { setBusy(false); } }}>{t('teacher.marking.remove')}</Button>}
        {error !== null && <ApiErrorState error={error}/>}
      </div>
    </div>}
  </article>;
}

function Signals({ signals }: { signals: NonNullable<ScriptView['signals']> }) {
  const t = useT();
  return <section className="rounded-2xl border border-navy-line/30 bg-cream-soft/60 p-3 text-sm" aria-label={t('teacher.signal.title')}>
    <p className="m-0 font-semibold">{t('teacher.signal.title')}</p>
    <p className="m-0 mt-1 text-xs text-gray-700">{t('teacher.signal.rule')}</p>
    {signals.signals.length ? <ul className="m-0 mt-2 grid list-none gap-1 p-0">{signals.signals.map((signal, index) => <li key={index} className="flex flex-wrap items-center gap-2">
      <span>{t(SIGNAL_LABEL(signal.signal))}{signal.severity === 'review' ? ` · ${t('teacher.signal.checkChip')}` : ''}</span>
      {typeof signal.detail.matching === 'string' && <span className="text-xs text-gray-600">({signal.detail.matching})</span>}
      {typeof signal.detail.quote === 'string' && <span className="text-xs italic text-gray-600">“{signal.detail.quote}”</span>}
    </li>)}</ul> : <p className="m-0 mt-2 text-gray-700">{t('teacher.signal.none')}</p>}
    <p className="m-0 mt-3 font-semibold">{t('teacher.signal.explain')}</p>
    <ol className="m-0 mt-1 pl-5">{signals.explain_it.map((question, index) => <li key={index}>{question}</li>)}</ol>
  </section>;
}
