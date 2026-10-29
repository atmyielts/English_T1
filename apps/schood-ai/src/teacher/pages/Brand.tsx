import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Copy, Plus, Trash2, Wand2 } from 'lucide-react';
import { ApiErrorState, Badge, Button, Card, EmptyState, Field, LoadingState, PageHeader, PlanGate, TextArea, TextInput, useI18n, useT, useWorkspace } from '../../core/index.ts';
import { TeacherCost } from '../Cost.tsx';
import { addResult, deleteResult, getBrand, saveBrand, writeBrand, type BrandProfileView, type TutorResultView } from '../api.ts';

// T13 tutor brand kit: your profile and your students' real results, then course
// landing text and Instagram, Telegram and results posts written only from them. A
// student is named only with consent, and any number the text uses that you never
// entered is flagged before you copy it.

const selectClass = 'min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900';

export default function BrandPage() {
  const t = useT(), workspace = useWorkspace();
  const [data, setData] = useState<{ profile: BrandProfileView | null; results: TutorResultView[] } | null>(null), [error, setError] = useState<unknown>(null);
  const load = useCallback(() => { getBrand(workspace.workspaceId).then(setData).catch(setError); }, [workspace.workspaceId]);
  useEffect(load, [load]);
  return <>
    <PageHeader title={t('teacher.brand.title')} lead={t('teacher.brand.lead')}/>
    <PlanGate feature="T13">
      {error ? <ApiErrorState error={error} onRetry={load}/> : !data ? <LoadingState/> : <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6"><Profile profile={data.profile} onSaved={load}/><Results results={data.results} onChange={load}/></div>
        <Writer results={data.results} hasProfile={!!data.profile}/>
      </div>}
    </PlanGate>
  </>;
}

function Profile({ profile, onSaved }: { profile: BrandProfileView | null; onSaved(): void }) {
  const t = useT(), workspace = useWorkspace();
  const [form, setForm] = useState({ display_name: profile?.display_name ?? workspace.me?.user.name ?? '', subjects: profile?.subjects ?? '', city: profile?.city ?? '', experience_years: profile?.experience_years?.toString() ?? '', format: profile?.format ?? '', contact: profile?.contact ?? '', about: profile?.about ?? '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [saved, setSaved] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => { setForm({ ...form, [key]: event.target.value }); setSaved(false); };
  return <Card as="div"><h2 className="m-0 mb-3 font-display text-lg font-bold">{t('teacher.brand.profile')}</h2>
    <form className="grid gap-3" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(null);
      try { await saveBrand(workspace.workspaceId, { ...form, experience_years: form.experience_years ? Number(form.experience_years) : null }); setSaved(true); onSaved(); } catch (cause) { setError(cause); } finally { setBusy(false); }
    }}>
      <Field label={t('teacher.brand.name')}>{(id) => <TextInput id={id} value={form.display_name} onChange={set('display_name')} required maxLength={120}/>}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('teacher.brand.subjects')}>{(id) => <TextInput id={id} value={form.subjects} onChange={set('subjects')} maxLength={300}/>}</Field>
        <Field label={t('teacher.brand.city')}>{(id) => <TextInput id={id} value={form.city} onChange={set('city')} maxLength={120}/>}</Field>
        <Field label={t('teacher.brand.years')}>{(id) => <TextInput id={id} type="number" min={0} max={60} value={form.experience_years} onChange={set('experience_years')}/>}</Field>
        <Field label={t('teacher.brand.format')} hint={t('teacher.brand.formatHint')}>{(id) => <TextInput id={id} value={form.format} onChange={set('format')} maxLength={300}/>}</Field>
      </div>
      <Field label={t('teacher.brand.contact')}>{(id) => <TextInput id={id} value={form.contact} onChange={set('contact')} maxLength={300}/>}</Field>
      <Field label={t('teacher.brand.about')}>{(id) => <TextArea id={id} rows={3} value={form.about} onChange={set('about')} maxLength={2000}/>}</Field>
      <div className="flex items-center gap-3"><Button type="submit" disabled={busy || !form.display_name.trim()}>{t('teacher.editor.save')}</Button>{saved && <span className="text-sm text-gray-700" role="status">{t('teacher.brand.saved')}</span>}</div>
      {error !== null && <ApiErrorState error={error}/>}
    </form>
  </Card>;
}

function Results({ results, onChange }: { results: TutorResultView[]; onChange(): void }) {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n();
  const [form, setForm] = useState({ student_label: '', exam: '', score: '', previous_score: '', achieved_on: '', note: '', consent: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  return <Card as="div"><h2 className="m-0 mb-1 font-display text-lg font-bold">{t('teacher.brand.results')}</h2><p className="m-0 mb-3 text-sm text-gray-700">{t('teacher.brand.resultsLead')}</p>
    {results.length ? <ul className="m-0 mb-4 grid list-none gap-2 p-0">{results.map((result) => <li key={result.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-navy-line/20 p-3 text-sm">
      <strong>{result.student_label}</strong>{!result.consent && <Badge tone="warn">{t('teacher.brand.noConsent')}</Badge>}
      <span className="min-w-0 flex-1">{result.exam}: {result.previous_score ? `${result.previous_score} → ` : ''}{result.score} · {date(result.achieved_on, { dateStyle: 'medium' })}</span>
      <button type="button" aria-label={t('teacher.brand.removeResult', { name: result.student_label })} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-navy-line/40" onClick={async () => { try { await deleteResult(workspace.workspaceId, result.id); onChange(); } catch (cause) { setError(cause); } }}><Trash2 size={14} aria-hidden="true"/></button>
    </li>)}</ul> : <EmptyState title={t('teacher.brand.noResults')}/>}
    <form className="grid gap-3" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(null);
      try { await addResult(workspace.workspaceId, { ...form, previous_score: form.previous_score || undefined, note: form.note || undefined }); setForm({ student_label: '', exam: '', score: '', previous_score: '', achieved_on: '', note: '', consent: false }); onChange(); } catch (cause) { setError(cause); } finally { setBusy(false); }
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('teacher.brand.student')} hint={t('teacher.brand.studentHint')}>{(id) => <TextInput id={id} value={form.student_label} onChange={(event) => setForm({ ...form, student_label: event.target.value })} maxLength={60} required/>}</Field>
        <Field label={t('teacher.brand.exam')}>{(id) => <TextInput id={id} value={form.exam} onChange={(event) => setForm({ ...form, exam: event.target.value })} maxLength={60} required placeholder="IELTS Academic"/>}</Field>
        <Field label={t('teacher.brand.score')}>{(id) => <TextInput id={id} value={form.score} onChange={(event) => setForm({ ...form, score: event.target.value })} maxLength={20} required/>}</Field>
        <Field label={t('teacher.brand.previous')}>{(id) => <TextInput id={id} value={form.previous_score} onChange={(event) => setForm({ ...form, previous_score: event.target.value })} maxLength={20}/>}</Field>
        <Field label={t('teacher.brand.date')}>{(id) => <TextInput id={id} type="date" value={form.achieved_on} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setForm({ ...form, achieved_on: event.target.value })} required/>}</Field>
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })}/><span>{t('teacher.brand.consent')}</span></label>
      <Button type="submit" variant="secondary" disabled={busy} icon={<Plus size={16} aria-hidden="true"/>}>{t('teacher.brand.addResult')}</Button>
      {error !== null && <ApiErrorState error={error}/>}
    </form>
  </Card>;
}

function Writer({ results, hasProfile }: { results: TutorResultView[]; hasProfile: boolean }) {
  const t = useT(), { locale } = useI18n(), workspace = useWorkspace();
  const [kind, setKind] = useState('instagram'), [language, setLanguage] = useState<string>(locale), [picked, setPicked] = useState<string[]>([]);
  const [course, setCourse] = useState({ title: '', level: '', schedule: '', price: '', starts: '' });
  const [out, setOut] = useState<Awaited<ReturnType<typeof writeBrand>> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [copied, setCopied] = useState(false);
  return <Card as="div" className="content-start"><h2 className="m-0 mb-3 font-display text-lg font-bold">{t('teacher.brand.write')}</h2>
    {!hasProfile ? <p className="m-0 text-sm text-gray-700">{t('teacher.brand.profileFirst')}</p> : <form className="grid gap-3" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(null);
      try { setOut(await writeBrand(workspace.workspaceId, { kind, language, ...(picked.length ? { result_ids: picked } : {}), ...(Object.values(course).some(Boolean) ? { course } : {}) })); } catch (cause) { setError(cause); } finally { setBusy(false); }
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('teacher.brand.kind')}>{(id) => <select id={id} className={selectClass} value={kind} onChange={(event) => setKind(event.target.value)}>{['landing', 'instagram', 'telegram', 'results'].map((entry) => <option key={entry} value={entry}>{t(`teacher.brand.kind.${entry}`)}</option>)}</select>}</Field>
        <Field label={t('teacher.studio.language')}>{(id) => <select id={id} className={selectClass} value={language} onChange={(event) => setLanguage(event.target.value)}>{['uz', 'ru', 'en'].map((entry) => <option key={entry} value={entry}>{t(`teacher.lang.${entry}`)}</option>)}</select>}</Field>
      </div>
      {results.length > 0 && <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('teacher.brand.useResults')}</legend><div className="flex flex-wrap gap-2">{results.map((result) => {
        const on = picked.includes(result.id);
        return <label key={result.id} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs ${on ? 'border-navy bg-lime-soft font-semibold' : 'border-navy-line/40 bg-white'}`}>
          <input type="checkbox" className="h-4 w-4" checked={on} onChange={() => setPicked(on ? picked.filter((entry) => entry !== result.id) : [...picked, result.id].slice(0, 12))}/>{result.consent ? result.student_label : t('teacher.brand.aStudent')} · {result.score}</label>;
      })}</div></fieldset>}
      {(kind === 'landing' || kind === 'instagram' || kind === 'telegram') && <fieldset className="m-0 grid gap-2 rounded-2xl border border-navy-line/30 p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">{t('teacher.brand.course')}</legend>
        {(['title', 'level', 'schedule', 'price', 'starts'] as const).map((key) => <TextInput key={key} aria-label={t(`teacher.brand.course.${key}`)} placeholder={t(`teacher.brand.course.${key}`)} value={course[key]} onChange={(event) => setCourse({ ...course, [key]: event.target.value })} maxLength={key === 'schedule' ? 200 : 120}/>)}
        <p className="m-0 text-xs text-gray-600 sm:col-span-2">{t('teacher.brand.courseHint')}</p>
      </fieldset>}
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" variant="spark" disabled={busy} icon={<Wand2 size={16} aria-hidden="true"/>}>{busy ? t('teacher.brand.writing') : t('teacher.brand.writeButton')}</Button><TeacherCost creditKey="brand.post"/></div>
      {error !== null && <ApiErrorState error={error}/>}
    </form>}
    {out && <section className="mt-4 grid gap-2" aria-live="polite">
      {out.flags && <p role="alert" className="m-0 flex gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true"/>{t('teacher.brand.flagged', { numbers: out.flags.invented_numbers.join(', ') })}</p>}
      <TextArea aria-label={t('teacher.brand.result')} rows={10} value={out.text} onChange={(event) => setOut({ ...out, text: event.target.value })}/>
      {out.hashtags.length > 0 && <p className="m-0 text-sm text-gray-700">{out.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ')}</p>}
      <Button size="sm" variant="ghost" icon={<Copy size={14} aria-hidden="true"/>} onClick={async () => { try { await navigator.clipboard.writeText(`${out.text}${out.hashtags.length ? `\n\n${out.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ')}` : ''}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } }}>{copied ? t('teacher.common.copied') : t('teacher.common.copy')}</Button>
    </section>}
  </Card>;
}
