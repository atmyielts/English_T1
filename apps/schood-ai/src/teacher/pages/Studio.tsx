import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Camera, ClipboardCheck, FileText, Gamepad2, Library, Megaphone, MessageSquareText, Send, Store, Users, Wand2, X } from 'lucide-react';
import { creditPrice } from '../../../../../packages/ai-core/src/mod.ts';
import { ADMISSION_MATH_TOPICS, CEFR_LEVELS, EXAM_TARGETS, MATERIAL_KINDS, materialCredit, satDomainLabel, type MaterialBrief, type MaterialGroup, type MaterialKindSpec, type SatOfficialDomain } from '../../../../../packages/ai-core/src/materials/mod.ts';
import {
  ApiErrorState, Badge, Button, Card, EmptyState, Eyebrow, Field, Link, LoadingState, PageHeader, PlanGate, SparkMark, TextArea, TextInput,
  navigate, useI18n, useLocation, useT, useWorkspace,
} from '../../core/index.ts';
import { TeacherCost } from '../Cost.tsx';
import { academyGroups, createMaterial, imageDataUrl, listMaterials, weakSpots, type AcademyGroup, type MaterialSummary, type WeakSpot } from '../api.ts';
import { pendingImages, takeBriefDraft } from '../state.ts';

// T1 Materials Studio: a brief (kind, level, topic, exam format, length, language,
// a group's weak spots, three levels at once) becomes a checked draft. The cost is
// shown before anything runs; the function charges exactly that.

const GROUPS: readonly MaterialGroup[] = ['general', 'exam', 'planning', 'textbook'];
const KINDS_BY_GROUP = (group: MaterialGroup) => Object.values(MATERIAL_KINDS).filter((kind) => kind.group === group);
const IELTS_BANDS = ['4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9'];
const TOEFL_BANDS = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6'];
const SAT_TARGETS = ['1000', '1100', '1200', '1300', '1400', '1500'];
const selectClass = 'min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy';

function levelChoices(kind: MaterialKindSpec): { value: string; label: string }[] {
  if (kind.exam === 'ielts') return [...CEFR_LEVELS.map((level) => ({ value: level, label: level })), ...IELTS_BANDS.map((band) => ({ value: `band:${band}`, label: `IELTS ${band}` }))];
  if (kind.exam === 'toefl_2026') return [...CEFR_LEVELS.map((level) => ({ value: level, label: level })), ...TOEFL_BANDS.map((band) => ({ value: `band:${band}`, label: `TOEFL ${band}` }))];
  if (kind.exam === 'sat') return SAT_TARGETS.map((score) => ({ value: `band:${score}`, label: `SAT ${score}` }));
  if (kind.exam === 'admission_math') return ['1', '2', '3'].map((value) => ({ value: `band:${value}`, label: value }));
  if (kind.exam === 'multilevel') return ['B1', 'B2', 'C1'].map((level) => ({ value: level, label: level }));
  return CEFR_LEVELS.map((level) => ({ value: level, label: level }));
}

export function StudioPage({ initialGroup }: { initialGroup?: MaterialGroup }) {
  const t = useT(), { locale } = useI18n(), workspace = useWorkspace(), { query } = useLocation();
  const restored = useMemo(() => takeBriefDraft(), []);
  const [group, setGroup] = useState<MaterialGroup>(() => (restored ? MATERIAL_KINDS[restored.kind]?.group : null) ?? initialGroup ?? (GROUPS.includes(query.get('group') as MaterialGroup) ? query.get('group') as MaterialGroup : 'general'));
  const [kindId, setKindId] = useState<string>(restored?.kind ?? KINDS_BY_GROUP(group)[0].kind);
  const kind = MATERIAL_KINDS[kindId] ?? KINDS_BY_GROUP(group)[0];
  const [level, setLevel] = useState(restored?.level ?? 'B1');
  const [topic, setTopic] = useState(restored?.topic ?? '');
  const [language, setLanguage] = useState<MaterialBrief['instruction_language']>(restored?.instruction_language ?? (locale === 'en' ? 'en' : locale));
  const [length, setLength] = useState<MaterialBrief['length']>(restored?.length ?? 'standard');
  const [questions, setQuestions] = useState(restored?.questions ? String(restored.questions) : '');
  const [notes, setNotes] = useState(restored?.notes ?? '');
  const [variants, setVariants] = useState(!!restored?.variants);
  const [section, setSection] = useState(restored?.exam?.section ?? '');
  const [task, setTask] = useState(restored?.exam?.task ?? '');
  const [domain, setDomain] = useState(restored?.exam?.domain ?? '');
  const [topics, setTopics] = useState<string[]>(restored?.exam?.topics ?? []);
  const [groups, setGroups] = useState<AcademyGroup[] | null>(null), [groupsUnavailable, setGroupsUnavailable] = useState(false);
  const [classroom, setClassroom] = useState(''), [spots, setSpots] = useState<WeakSpot[] | null>(null);
  const [images, setImages] = useState<string[]>([]), [pageText, setPageText] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  const requestKey = useRef<string | null>(null);

  // Keep the kind valid when the group changes, and the level valid for the kind.
  useEffect(() => { if (MATERIAL_KINDS[kindId]?.group !== group) setKindId(KINDS_BY_GROUP(group)[0].kind); }, [group, kindId]);
  useEffect(() => {
    const choices = levelChoices(kind);
    if (!choices.some((choice) => choice.value === level)) setLevel(choices.find((choice) => choice.value === 'B1' || choice.value === 'band:6' || choice.value === 'band:1200' || choice.value === 'band:2')?.value ?? choices[0].value);
    const targets = kind.exam ? EXAM_TARGETS[kind.exam] : null;
    if (kind.kind === 'toefl_2026' || kind.kind === 'multilevel') {
      const nextSection = targets!.sections.includes(section) ? section : targets!.sections[0];
      setSection(nextSection);
      const tasks = targets!.tasks?.[nextSection] ?? [];
      if (!tasks.includes(task)) setTask(tasks[0] ?? '');
    }
    if (kind.kind === 'ielts_writing' && !['task1', 'task2'].includes(task)) setTask('task2');
    if (kind.kind === 'sat_reading_writing' && !EXAM_TARGETS.sat.tasks!.reading_writing.includes(domain)) setDomain(EXAM_TARGETS.sat.tasks!.reading_writing[0]);
    if (kind.kind === 'sat_math' && !EXAM_TARGETS.sat.tasks!.math.includes(domain)) setDomain(EXAM_TARGETS.sat.tasks!.math[0]);
    if (!kind.variants) setVariants(false);
  }, [kind, level, section, task, domain]);
  useEffect(() => {
    if (!workspace.me) return;
    academyGroups(workspace.workspaceId).then((result) => { setGroups(result.groups); setGroupsUnavailable(result.unavailable); }).catch(() => { setGroups([]); setGroupsUnavailable(true); });
  }, [workspace.me, workspace.workspaceId]);
  useEffect(() => {
    setSpots(null);
    const picked = groups?.find((entry) => `${entry.academy_id}:${entry.classroom_id}` === classroom);
    if (!picked) return;
    weakSpots(workspace.workspaceId, picked.academy_id, picked.classroom_id).then((result) => setSpots(result.spots)).catch(() => setSpots([]));
  }, [classroom, groups, workspace.workspaceId]);

  const exam = useMemo((): MaterialBrief['exam'] => {
    if (!kind.exam) return undefined;
    if (kind.kind === 'ielts_writing') return { format: 'ielts', section: 'writing', task };
    if (kind.kind === 'toefl_2026' || kind.kind === 'multilevel') return { format: kind.exam, section, task };
    if (kind.exam === 'sat') return { format: 'sat', domain };
    if (kind.exam === 'admission_math') return { format: 'admission_math', ...(topics.length ? { topics } : {}) };
    return { format: kind.exam };
  }, [kind, task, section, domain, topics]);
  const brief: MaterialBrief = { kind: kind.kind, level, topic: topic.trim(), instruction_language: language, length, ...(questions ? { questions: Number(questions) } : {}), ...(exam ? { exam } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), ...(variants ? { variants: true } : {}) };
  const credit = materialCredit(brief);
  const feature = creditPrice(credit.key).feature;
  const pickedGroup = groups?.find((entry) => `${entry.academy_id}:${entry.classroom_id}` === classroom);
  const ready = topic.trim().length >= 2 && (!kind.vision || images.length > 0 || pageText.trim().length > 20);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    requestKey.current ??= crypto.randomUUID();
    try {
      const job = await createMaterial(workspace.workspaceId, {
        brief, ...(pickedGroup ? { academy: { academy_id: pickedGroup.academy_id, classroom_id: pickedGroup.classroom_id, classroom_name: pickedGroup.name } } : {}),
        ...(images.length ? { images } : {}), ...(pageText.trim() ? { page_text: pageText.trim() } : {}),
      }, requestKey.current);
      if (images.length) pendingImages.set(job.id, images);
      requestKey.current = null;
      navigate(`/studio/m/${job.id}`);
    } catch (cause) { setError(cause); requestKey.current = null; } finally { setBusy(false); }
  };

  return <>
    <PageHeader eyebrow={<Eyebrow icon={<SparkMark size={18}/>}>{t('teacher.studio.eyebrow')}</Eyebrow>} title={t('teacher.studio.title')} lead={t('teacher.studio.lead')}
      actions={<Link to="/library" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-navy-line bg-white px-4 text-sm font-semibold text-gray-900 no-underline"><Library size={16} aria-hidden="true"/>{t('teacher.studio.library')}</Link>}/>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card as="div" className="min-w-0">
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-5" aria-label={t('teacher.studio.brief')}>
          <div role="radiogroup" aria-label={t('teacher.studio.group')} className="flex flex-wrap gap-2">
            {GROUPS.map((entry) => <button key={entry} type="button" role="radio" aria-checked={group === entry} onClick={() => setGroup(entry)}
              className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${group === entry ? 'border-navy bg-navy text-white' : 'border-navy-line bg-white text-gray-900 hover:bg-cream-soft'}`}>{t(`teacher.group.${entry}`)}</button>)}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('teacher.studio.kind')} hint={t(`teacher.kindHint.${kind.kind}`)}>{(id) => <select id={id} className={selectClass} value={kind.kind} onChange={(event) => setKindId(event.target.value)}>
              {KINDS_BY_GROUP(group).map((entry) => <option key={entry.kind} value={entry.kind}>{t(`teacher.kind.${entry.kind}`)}</option>)}
            </select>}</Field>
            <Field label={t('teacher.studio.level')}>{(id) => <select id={id} className={selectClass} value={level} onChange={(event) => setLevel(event.target.value)}>
              {levelChoices(kind).map((choice) => <option key={choice.value} value={choice.value}>{kind.exam === 'admission_math' ? t(`teacher.studio.difficulty.${choice.label}`) : choice.label}</option>)}
            </select>}</Field>
          </div>
          {(kind.kind === 'toefl_2026' || kind.kind === 'multilevel') && <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('teacher.studio.section')}>{(id) => <select id={id} className={selectClass} value={section} onChange={(event) => setSection(event.target.value)}>{EXAM_TARGETS[kind.exam!].sections.map((entry) => <option key={entry} value={entry}>{t(`teacher.section.${entry}`)}</option>)}</select>}</Field>
            <Field label={t('teacher.studio.task')}>{(id) => <select id={id} className={selectClass} value={task} onChange={(event) => setTask(event.target.value)}>{(EXAM_TARGETS[kind.exam!].tasks?.[section] ?? []).map((entry) => <option key={entry} value={entry}>{t(`teacher.task.${entry}`)}</option>)}</select>}</Field>
          </div>}
          {kind.kind === 'ielts_writing' && <Field label={t('teacher.studio.task')}>{(id) => <select id={id} className={selectClass} value={task} onChange={(event) => setTask(event.target.value)}><option value="task1">{t('teacher.task.task1')}</option><option value="task2">{t('teacher.task.task2')}</option></select>}</Field>}
          {kind.exam === 'sat' && <Field label={t('teacher.studio.domain')}>{(id) => <select id={id} className={selectClass} value={domain} onChange={(event) => setDomain(event.target.value)}>{(EXAM_TARGETS.sat.tasks?.[kind.kind === 'sat_math' ? 'math' : 'reading_writing'] ?? []).map((entry) => <option key={entry} value={entry}>{satDomainLabel(entry as SatOfficialDomain)}</option>)}</select>}</Field>}
          {kind.exam === 'admission_math' && <fieldset className="m-0 border-0 p-0"><legend className="mb-2 text-sm font-semibold">{t('teacher.studio.topics')}</legend>
            <div className="flex max-h-52 flex-wrap gap-2 overflow-y-auto rounded-2xl border border-navy-line/30 p-2">{ADMISSION_MATH_TOPICS.map((entry) => {
              const on = topics.includes(entry.code);
              return <label key={entry.code} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs ${on ? 'border-navy bg-lime-soft font-semibold' : 'border-navy-line/40 bg-white'}`}>
                <input type="checkbox" className="h-4 w-4" checked={on} onChange={() => setTopics(on ? topics.filter((code) => code !== entry.code) : [...topics, entry.code].slice(0, 12))}/>{entry.names[locale] ?? entry.names.en}
              </label>;
            })}</div>
            <p className="m-0 mt-1 text-xs text-gray-600">{t('teacher.studio.topicsHint')}</p>
          </fieldset>}
          <Field label={t('teacher.studio.topic')} hint={t('teacher.studio.topicHint')}>{(id) => <TextInput id={id} value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={200} required placeholder={t('teacher.studio.topicPlaceholder')}/>}</Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t('teacher.studio.language')}>{(id) => <select id={id} className={selectClass} value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>{(['uz', 'ru', 'en'] as const).map((entry) => <option key={entry} value={entry}>{t(`teacher.lang.${entry}`)}</option>)}</select>}</Field>
            <Field label={t('teacher.studio.length')}>{(id) => <select id={id} className={selectClass} value={length} onChange={(event) => setLength(event.target.value as typeof length)}>{(['short', 'standard', 'long'] as const).map((entry) => <option key={entry} value={entry}>{t(`teacher.length.${entry}`, { count: kind.count[entry] })}</option>)}</select>}</Field>
            {kind.questionTypes.length > 0 && <Field label={t('teacher.studio.questions')} hint={t('teacher.studio.questionsHint', { count: kind.count[length] })}>{(id) => <TextInput id={id} type="number" min={1} max={60} value={questions} onChange={(event) => setQuestions(event.target.value)}/>}</Field>}
          </div>
          {kind.vision && <fieldset className="m-0 grid gap-3 rounded-2xl border border-navy-line/30 p-3">
            <legend className="px-1 text-sm font-semibold">{t('teacher.studio.page')}</legend>
            <label className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-full border border-navy-line bg-white px-4 text-sm font-semibold">
              <Camera size={16} aria-hidden="true"/>{t('teacher.studio.addPhoto')}
              <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file && images.length < 2) setImages([...images, await imageDataUrl(file)]); }}/>
            </label>
            {images.length > 0 && <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{images.map((image, index) => <li key={index} className="relative"><img src={image} alt={t('teacher.studio.photoAlt', { number: index + 1 })} className="h-24 w-20 rounded-xl border border-navy-line object-cover"/>
              <button type="button" aria-label={t('teacher.studio.removePhoto', { number: index + 1 })} onClick={() => setImages(images.filter((_, i) => i !== index))} className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-navy-line bg-white"><X size={14} aria-hidden="true"/></button></li>)}</ul>}
            <Field label={t('teacher.studio.pageText')} hint={t('teacher.studio.pageTextHint')}>{(id) => <TextArea id={id} rows={3} value={pageText} onChange={(event) => setPageText(event.target.value)} maxLength={12000}/>}</Field>
          </fieldset>}
          <Field label={t('teacher.studio.notes')} hint={t('teacher.studio.notesHint')}>{(id) => <TextArea id={id} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1500}/>}</Field>
          {groups !== null && (groups.length > 0 || groupsUnavailable) && <div className="grid gap-2">
            <Field label={t('teacher.studio.group.label')} hint={groupsUnavailable ? t('teacher.studio.group.unavailable') : t('teacher.studio.group.hint')}>{(id) => <select id={id} className={selectClass} value={classroom} onChange={(event) => setClassroom(event.target.value)} disabled={!groups.length}>
              <option value="">{t('teacher.studio.group.none')}</option>
              {groups.map((entry) => <option key={`${entry.academy_id}:${entry.classroom_id}`} value={`${entry.academy_id}:${entry.classroom_id}`}>{entry.name} · {entry.academy_name}</option>)}
            </select>}</Field>
            {pickedGroup && (spots === null ? <LoadingState label={t('teacher.studio.group.loading')}/> : spots.length ? <div className="flex flex-wrap gap-2" aria-label={t('teacher.studio.group.spots')}>{spots.map((spot) => <Badge key={spot.tag} tone="sky">{spot.label}</Badge>)}</div> : <p className="m-0 text-xs text-gray-600">{t('teacher.studio.group.noSpots')}</p>)}
          </div>}
          {kind.variants && <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-navy-line/30 p-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={variants} onChange={(event) => setVariants(event.target.checked)}/>
            <span><span className="block text-sm font-semibold">{t('teacher.studio.variants')}</span><span className="block text-xs text-gray-600">{t('teacher.studio.variantsHint')}</span></span>
          </label>}
          <PlanGate feature={feature}>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="spark" disabled={!ready || busy} icon={<Wand2 size={16} aria-hidden="true"/>}>{busy ? t('teacher.studio.starting') : t('teacher.studio.generate')}</Button>
              <TeacherCost creditKey={credit.key} addOns={credit.addOns}/>
              <span className="text-xs text-gray-600">{t('teacher.studio.reviewNote')}</span>
            </div>
          </PlanGate>
          {error !== null && <ApiErrorState error={error} onRetry={() => void submit()}/>}
        </form>
      </Card>
      <aside className="grid content-start gap-4">
        <RecentJobs/>
        <Card as="div"><h2 className="m-0 mb-3 font-display text-lg font-bold">{t('teacher.studio.tools')}</h2>
          <ul className="m-0 grid list-none gap-1 p-0">{([
            ['/studio/marking', 'teacher.nav.marking', ClipboardCheck], ['/studio/quizzes', 'teacher.nav.quiz', Gamepad2], ['/studio/feedback', 'teacher.nav.feedback', MessageSquareText],
            ['/studio/channel', 'teacher.nav.channel', Send], ['/studio/market', 'teacher.nav.market', Store], ['/studio/brand', 'teacher.nav.brand', Megaphone], ['/play', 'teacher.nav.play', Users],
          ] as const).map(([to, label, Icon]) => <li key={to}><Link to={to} className="flex min-h-10 items-center gap-2 rounded-2xl px-2 text-sm font-medium text-gray-900 no-underline hover:bg-cream-soft"><Icon size={16} aria-hidden="true"/>{t(label)}</Link></li>)}</ul>
        </Card>
      </aside>
    </div>
  </>;
}

function RecentJobs() {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n();
  const [rows, setRows] = useState<MaterialSummary[] | null>(null), [error, setError] = useState<unknown>(null);
  useEffect(() => { listMaterials(workspace.workspaceId).then(setRows).catch(setError); }, [workspace.workspaceId]);
  return <Card as="div"><h2 className="m-0 mb-3 font-display text-lg font-bold">{t('teacher.studio.recent')}</h2>
    {error ? <ApiErrorState error={error}/> : !rows ? <LoadingState/> : !rows.length ? <EmptyState title={t('teacher.studio.noneYet')} lead={t('teacher.studio.noneYetLead')}/> :
      <ul className="m-0 grid list-none gap-2 p-0">{rows.slice(0, 12).map((row) => <li key={row.id}>
        <Link to={row.status === 'approved' && row.page_id ? `/studio/page/${row.page_id}` : `/studio/m/${row.id}`} className="block rounded-2xl border border-navy-line/30 bg-white p-3 text-gray-900 no-underline hover:bg-cream-soft">
          <span className="flex items-center gap-2"><FileText size={14} aria-hidden="true"/><strong className="min-w-0 flex-1 truncate text-sm">{row.title ?? t(`teacher.kind.${row.kind}`)}</strong><StatusBadge status={row.status}/></span>
          <span className="mt-1 block text-xs text-gray-600">{t(`teacher.kind.${row.kind}`)}{row.level ? ` · ${row.level.replace('band:', '')}` : ''} · {date(row.created_at, { dateStyle: 'medium' })}{row.issues ? ` · ${t('teacher.studio.issues', { count: row.issues })}` : ''}</span>
        </Link>
      </li>)}</ul>}
    <Link to="/library" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-900 underline underline-offset-2"><BookOpen size={14} aria-hidden="true"/>{t('teacher.studio.allInLibrary')}</Link>
  </Card>;
}

export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const tone = status === 'approved' ? 'lime' : status === 'ready' ? 'sky' : status === 'failed' || status === 'rejected' ? 'warn' : 'neutral';
  return <Badge tone={tone}>{t(`teacher.status.${status}`)}</Badge>;
}

export default function Studio() { return <StudioPage/>; }
export function PlannerStudio() { return <StudioPage initialGroup="planning"/>; }
export function TextbookStudio() { return <StudioPage initialGroup="textbook"/>; }
