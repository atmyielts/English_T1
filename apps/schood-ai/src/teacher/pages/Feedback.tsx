import { useState } from 'react';
import { Copy, Plus, Trash2, Wand2 } from 'lucide-react';
import { ApiError, ApiErrorState, Button, Card, Field, PageHeader, PlanGate, TextArea, TextInput, useI18n, useT, useWorkspace } from '../../core/index.ts';
import { TeacherCost } from '../Cost.tsx';
import { writeFeedback } from '../api.ts';

// T4 feedback and report writer: one comment per student from the teacher's own
// marks and notes, in Uzbek, Russian or English. 1 credit per comment; the teacher
// edits and copies them. Nothing is sent from here.

interface Row { id: string; student: string; marks: string; notes: string; comment: string | null; error: unknown }
const blank = (): Row => ({ id: crypto.randomUUID(), student: '', marks: '', notes: '', comment: null, error: null });
const selectClass = 'min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900';
/** "Reading 6.5; Writing 6" → [{what, mark}] */
const parseMarks = (value: string) => value.split(/[;\n]/).map((part) => part.trim()).filter(Boolean).slice(0, 20).map((part) => {
  const match = /^(.*?)[\s:=-]+([0-9][0-9.,/%]*\s*\w{0,6})$/.exec(part);
  return match ? { what: match[1].trim().slice(0, 120) || part.slice(0, 120), mark: match[2].trim().slice(0, 40) } : { what: part.slice(0, 120), mark: '—' };
});

export default function FeedbackPage() {
  const t = useT(), { locale } = useI18n(), workspace = useWorkspace();
  const [purpose, setPurpose] = useState('report_card'), [language, setLanguage] = useState<string>(locale), [tone, setTone] = useState('warm'), [words, setWords] = useState('90');
  const [rows, setRows] = useState<Row[]>([blank()]), [running, setRunning] = useState(false), [copied, setCopied] = useState<string | null>(null);
  const update = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const ready = rows.filter((row) => row.student.trim() && (row.marks.trim() || row.notes.trim()));
  const run = async () => {
    setRunning(true);
    for (const row of ready.filter((entry) => !entry.comment)) {
      try {
        const result = await writeFeedback(workspace.workspaceId, { purpose, language, tone, words: Number(words), student_label: row.student.trim(), marks: parseMarks(row.marks), ...(row.notes.trim() ? { notes: row.notes.trim() } : {}) });
        update(row.id, { comment: result.comment, error: null });
      } catch (cause) {
        update(row.id, { error: cause });
        if (cause instanceof ApiError && ['insufficient_credits', 'budget_exhausted', 'capped', 'plan_required', 'ai_disabled', 'ai_unavailable'].includes(cause.code)) break;
      }
    }
    setRunning(false);
  };
  const pending = ready.filter((row) => !row.comment).length;
  return <>
    <PageHeader title={t('teacher.feedback.title')} lead={t('teacher.feedback.lead')}/>
    <PlanGate feature="T4">
      <Card as="div" className="mb-4 grid gap-3 md:grid-cols-4">
        <Field label={t('teacher.feedback.purpose')}>{(id) => <select id={id} className={selectClass} value={purpose} onChange={(event) => setPurpose(event.target.value)}>{['report_card', 'term_summary', 'individual'].map((entry) => <option key={entry} value={entry}>{t(`teacher.feedback.purpose.${entry}`)}</option>)}</select>}</Field>
        <Field label={t('teacher.studio.language')}>{(id) => <select id={id} className={selectClass} value={language} onChange={(event) => setLanguage(event.target.value)}>{['uz', 'ru', 'en'].map((entry) => <option key={entry} value={entry}>{t(`teacher.lang.${entry}`)}</option>)}</select>}</Field>
        <Field label={t('teacher.feedback.tone')}>{(id) => <select id={id} className={selectClass} value={tone} onChange={(event) => setTone(event.target.value)}>{['warm', 'neutral', 'formal'].map((entry) => <option key={entry} value={entry}>{t(`teacher.feedback.tone.${entry}`)}</option>)}</select>}</Field>
        <Field label={t('teacher.feedback.words')}>{(id) => <TextInput id={id} type="number" min={30} max={300} value={words} onChange={(event) => setWords(event.target.value)}/>}</Field>
      </Card>
      <ol className="m-0 grid list-none gap-3 p-0">{rows.map((row, index) => <li key={row.id}><Card as="div" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-3">
          <div className="flex items-end gap-2">
            <div className="flex-1"><Field label={t('teacher.feedback.student', { number: index + 1 })}>{(id) => <TextInput id={id} value={row.student} maxLength={80} onChange={(event) => update(row.id, { student: event.target.value, comment: null })}/>}</Field></div>
            <button type="button" aria-label={t('teacher.feedback.remove')} disabled={rows.length <= 1} onClick={() => setRows(rows.filter((entry) => entry.id !== row.id))} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-navy-line/40 disabled:opacity-40"><Trash2 size={16} aria-hidden="true"/></button>
          </div>
          <Field label={t('teacher.feedback.marks')} hint={t('teacher.feedback.marksHint')}>{(id) => <TextArea id={id} rows={2} value={row.marks} onChange={(event) => update(row.id, { marks: event.target.value, comment: null })}/>}</Field>
          <Field label={t('teacher.feedback.notes')}>{(id) => <TextArea id={id} rows={2} value={row.notes} maxLength={2000} onChange={(event) => update(row.id, { notes: event.target.value, comment: null })}/>}</Field>
        </div>
        <div className="grid content-start gap-2">
          {row.comment !== null ? <>
            <Field label={t('teacher.feedback.comment')}>{(id) => <TextArea id={id} rows={6} value={row.comment ?? ''} onChange={(event) => update(row.id, { comment: event.target.value })}/>}</Field>
            <Button size="sm" variant="ghost" icon={<Copy size={14} aria-hidden="true"/>} onClick={async () => { try { await navigator.clipboard.writeText(row.comment ?? ''); setCopied(row.id); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ } }}>{copied === row.id ? t('teacher.common.copied') : t('teacher.common.copy')}</Button>
          </> : <p className="m-0 text-sm text-gray-600">{t('teacher.feedback.empty')}</p>}
          {row.error !== null && <ApiErrorState error={row.error}/>}
        </div>
      </Card></li>)}</ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon={<Plus size={16} aria-hidden="true"/>} onClick={() => setRows([...rows, blank()])} disabled={rows.length >= 40}>{t('teacher.feedback.add')}</Button>
        <Button variant="spark" icon={<Wand2 size={16} aria-hidden="true"/>} disabled={running || !pending} onClick={() => void run()}>{running ? t('teacher.feedback.writing') : t('teacher.feedback.write', { count: pending })}</Button>
        <TeacherCost creditKey="feedback.comment"/><span className="text-xs text-gray-600">{t('teacher.feedback.each')}</span>
      </div>
    </PlanGate>
  </>;
}
