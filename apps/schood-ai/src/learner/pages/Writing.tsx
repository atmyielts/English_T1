import { useState, type ReactNode } from 'react';
import { Badge, Button, Field, TextArea, TextInput, Thinking, useLocation, useT } from '../../core/index.ts';
import { ConsentGate, Failure, Quote, Section, ToolHeader, options, useLearnerApi, useLoad, useRun, Cost } from '../kit.tsx';

// L3 writing coach with model answers, L11 essay ladder and L8 application essays.

const WRITING_EXAMS = ['ielts_task2', 'ielts_task1', 'toefl_email', 'toefl_discussion', 'multilevel_task11', 'multilevel_task12', 'multilevel_part2', 'general'] as const;
const words = (text: string) => (text.match(/[\p{L}\p{N}’']+/gu) ?? []).length;
interface Feedback {
  exam: string; scale: { label: string; max: number }; overall: number; cefr: string | null; words: number; summary: string; strengths: string[]; next_steps: string[];
  criteria: { key: string; name: string; score: number; max: number; comment: string }[];
  line_comments: { quote: string; issue: string; suggestion: string }[];
  rewrite: { original: string; improved: string; why: string } | null;
}
interface WritingItem { id: string; input: { draft: string; exam: string }; feedback: Feedback; model_answer?: { label: 'model'; text: string; notes: string[] } }
interface Ladder { id: string; original: string; rungs: { level: string; text: string; changes: { what: string; why: string }[] }[] }

function Highlighted({ text, quotes }: { text: string; quotes: string[] }) {
  const marks = quotes.map((quote) => ({ quote, at: text.toLowerCase().indexOf(quote.toLowerCase()) })).filter((entry) => entry.at >= 0).sort((a, b) => a.at - b.at);
  const parts: ReactNode[] = [];
  let cursor = 0;
  marks.forEach((mark, index) => {
    if (mark.at < cursor) return;
    parts.push(text.slice(cursor, mark.at), <mark key={index} className="rounded bg-lime-soft px-0.5">{text.slice(mark.at, mark.at + mark.quote.length)}</mark>);
    cursor = mark.at + mark.quote.length;
  });
  parts.push(text.slice(cursor));
  return <p className="m-0 whitespace-pre-wrap text-sm leading-7 text-gray-900">{parts}</p>;
}

export function WritePage() {
  const t = useT(), call = useLearnerApi(), { query } = useLocation();
  const initial = WRITING_EXAMS.includes(query.get('exam') as never) ? query.get('exam')! : 'ielts_task2';
  const [exam, setExam] = useState(initial), [prompt, setPrompt] = useState(''), [draft, setDraft] = useState('');
  const [tab, setTab] = useState<'feedback' | 'ladder'>('feedback');
  const feedback = useRun<{ writing: WritingItem }>();
  const model = useRun<{ writing: WritingItem }>();
  const ladder = useRun<{ ladder: Ladder }>();
  const history = useLoad(() => call<{ items: { id: string; kind: string; exam: string; overall: number | null; excerpt: string; created_at: string }[] }>('writing'), String(feedback.data?.writing.id ?? ''));
  const item = model.data?.writing ?? feedback.data?.writing;
  const send = () => feedback.run(() => call('writing-feedback', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { exam, task_prompt: prompt || undefined, draft } }));
  const open = async (id: string) => { const out = await call<{ item: WritingItem & { kind: string } }>('writing', { query: { id } }).catch(() => null); if (out?.item.kind === 'writing') { feedback.set({ writing: out.item }); model.set(null); setTab('feedback'); } };
  const fb = item?.feedback;
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.write')} lead={t('learner.write.lead')} creditKey={tab === 'ladder' ? 'writing.ladder' : 'writing.feedback'}/>
    <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label={t('learner.tool.write')}>
      {(['feedback', 'ladder'] as const).map((value) => <Button key={value} role="tab" aria-selected={tab === value} variant={tab === value ? 'primary' : 'secondary'} size="sm" onClick={() => setTab(value)}>{t(`learner.write.tab.${value}`)}</Button>)}
    </div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Section title={t('learner.write.your')}>
        <Field label={t('learner.exam')}>{(id) => <select id={id} value={exam} onChange={(event) => setExam(event.target.value)} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">{options(t, WRITING_EXAMS, 'learner.write.exam')}</select>}</Field>
        <Field label={t('learner.write.prompt')}>{(id) => <TextArea id={id} rows={3} value={prompt} maxLength={3000} onChange={(event) => setPrompt(event.target.value)}/>}</Field>
        <Field label={t('learner.write.draft')} hint={t('learner.write.count', { count: words(draft) })}>{(id) => <TextArea id={id} rows={12} value={draft} maxLength={12000} onChange={(event) => setDraft(event.target.value)}/>}</Field>
        <div className="flex flex-wrap gap-2">
          {tab === 'feedback'
            ? <Button variant="spark" disabled={words(draft) < 20 || feedback.busy} onClick={() => void send()}>{feedback.busy ? t('chat.thinking') : t('learner.write.check')}</Button>
            : <Button variant="spark" disabled={words(draft) < 40 || ladder.busy} onClick={() => void ladder.run(() => call('essay-ladder', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: item && item.input.draft === draft ? { id: item.id } : { exam, draft } }))}>{ladder.busy ? t('chat.thinking') : t('learner.write.ladderGo')}</Button>}
        </div>
        <Failure error={tab === 'feedback' ? feedback.error : ladder.error}/>
        {history.data && history.data.items.length > 0 && <div className="border-t border-navy-line/20 pt-3">
          <h3 className="m-0 text-sm font-semibold">{t('learner.write.history')}</h3>
          <ul className="mb-0 mt-2 grid list-none gap-1 p-0">{history.data.items.filter((entry) => entry.kind === 'writing').slice(0, 6).map((entry) => <li key={entry.id}>
            <button type="button" onClick={() => void open(entry.id)} className="min-h-11 w-full rounded-xl bg-white/70 px-3 py-2 text-left text-sm hover:bg-white">{t(`learner.write.exam.${entry.exam}`)} · {entry.overall ?? '–'} · <span className="text-gray-600">{entry.excerpt}</span></button>
          </li>)}</ul>
        </div>}
      </Section>
      {tab === 'feedback' ? <div className="grid content-start gap-4">
        {feedback.busy && <Thinking label={t('learner.write.marking')}/>}
        {fb && item ? <>
          <Section title={t('learner.write.result')}>
            <div className="flex flex-wrap items-baseline gap-3"><span className="font-display text-4xl font-bold">{fb.overall}</span><span className="text-sm text-gray-700">{fb.scale.label} / {fb.scale.max}</span>{fb.cefr && <Badge tone="sky">CEFR {fb.cefr}</Badge>}<Badge>{t('learner.write.count', { count: fb.words })}</Badge></div>
            <p className="m-0 text-sm leading-6">{fb.summary}</p>
            <ul className="m-0 grid gap-2 p-0">{fb.criteria.map((criterion) => <li key={criterion.key} className="list-none rounded-2xl bg-white/80 p-3 text-sm"><strong>{criterion.name}: {criterion.score}/{criterion.max}</strong><br/>{criterion.comment}</li>)}</ul>
            <p className="m-0 text-xs text-gray-600">{t('learner.write.estimate')}</p>
          </Section>
          {fb.line_comments.length > 0 && <Section title={t('learner.write.lines')}>
            <Highlighted text={item.input.draft} quotes={fb.line_comments.map((entry) => entry.quote)}/>
            <ul className="m-0 grid gap-2 list-disc pl-5 text-sm">{fb.line_comments.map((entry, index) => <li key={index}><Quote>{entry.quote}</Quote> — {entry.issue} <strong>→ {entry.suggestion}</strong></li>)}</ul>
          </Section>}
          {fb.rewrite && <Section title={t('learner.write.rewrite')}><p className="m-0 text-sm text-gray-700"><s>{fb.rewrite.original}</s></p><p className="m-0 text-sm font-semibold">{fb.rewrite.improved}</p><p className="m-0 text-xs text-gray-600">{fb.rewrite.why}</p></Section>}
          {fb.next_steps.length > 0 && <Section title={t('learner.write.next')}><ul className="m-0 list-disc pl-5 text-sm">{fb.next_steps.map((step) => <li key={step}>{step}</li>)}</ul></Section>}
          <Section title={t('learner.write.model')}>
            {item.model_answer ? <><Badge tone="warn">{t('learner.write.modelLabel')}</Badge><p className="m-0 whitespace-pre-wrap text-sm leading-7">{item.model_answer.text}</p><ul className="m-0 list-disc pl-5 text-sm">{item.model_answer.notes.map((note) => <li key={note}>{note}</li>)}</ul></>
              : <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={model.busy} onClick={() => void model.run(() => call('writing-model', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { id: item.id } }))}>{t('learner.write.modelGo')}</Button><Cost creditKey="writing.model"/></div>}
            <Failure error={model.error}/>
          </Section>
        </> : !feedback.busy && <p className="m-0 rounded-3xl border border-dashed border-navy-line/40 bg-white/60 p-6 text-sm text-gray-700">{t('learner.write.empty')}</p>}
      </div> : <div className="grid content-start gap-4">
        {ladder.busy && <Thinking label={t('learner.write.laddering')}/>}
        {ladder.data ? <>
          <p className="m-0 text-sm text-gray-700">{t('learner.write.ladderNote')}</p>
          {ladder.data.ladder.rungs.map((rung) => <Section key={rung.level} title={t('learner.write.rung', { level: rung.level })}>
            <Badge tone="warn">{t('learner.write.modelLabel')}</Badge>
            <p className="m-0 whitespace-pre-wrap text-sm leading-7">{rung.text}</p>
            {rung.changes.length > 0 && <ul className="m-0 list-disc pl-5 text-sm text-gray-700">{rung.changes.map((change, index) => <li key={index}><strong>{change.what}</strong> — {change.why}</li>)}</ul>}
          </Section>)}
        </> : !ladder.busy && <p className="m-0 rounded-3xl border border-dashed border-navy-line/40 bg-white/60 p-6 text-sm text-gray-700">{t('learner.write.ladderEmpty')}</p>}
      </div>}
    </div>
  </ConsentGate>;
}

// --- L8 ---------------------------------------------------------------------------------
const ESSAY_KINDS = ['personal_statement', 'motivation_letter', 'scholarship_essay', 'cv', 'cover_letter'] as const;
interface EssayReview { overall: string; words: number; word_limit: number | null; structure: { part: string; status: string; comment: string }[]; strengths: string[]; issues: { issue: string; why: string; fix: string }[]; line_edits: { quote: string; suggestion: string; why: string }[]; questions: string[]; next_draft: string[] }

export function EssaysPage() {
  const t = useT(), call = useLearnerApi();
  const [kind, setKind] = useState<string>('personal_statement'), [target, setTarget] = useState(''), [limit, setLimit] = useState(''), [text, setText] = useState('');
  const review = useRun<{ essay: EssayReview }>();
  const tone = (status: string) => (status === 'strong' ? 'lime' : status === 'ok' ? 'sky' : status === 'missing' ? 'danger' : 'warn') as 'lime' | 'sky' | 'danger' | 'warn';
  const essay = review.data?.essay;
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.essays')} lead={t('learner.essays.lead')} creditKey="essay.review"/>
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t('learner.essays.yours')}>
        <Field label={t('learner.essays.kind')}>{(id) => <select id={id} value={kind} onChange={(event) => setKind(event.target.value)} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">{options(t, ESSAY_KINDS, 'learner.essays.kind')}</select>}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('learner.essays.target')}>{(id) => <TextInput id={id} value={target} maxLength={200} onChange={(event) => setTarget(event.target.value)}/>}</Field>
          <Field label={t('learner.essays.limit')}>{(id) => <TextInput id={id} inputMode="numeric" value={limit} onChange={(event) => setLimit(event.target.value.replace(/\D/g, ''))}/>}</Field>
        </div>
        <Field label={t('learner.essays.text')} hint={t('learner.write.count', { count: words(text) })}>{(id) => <TextArea id={id} rows={14} value={text} maxLength={15000} onChange={(event) => setText(event.target.value)}/>}</Field>
        <p className="m-0 text-xs text-gray-600">{t('learner.essays.never')}</p>
        <div><Button variant="spark" disabled={words(text) < 50 || review.busy} onClick={() => void review.run(() => call('essay-review', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { kind, text, target: target || undefined, word_limit: limit ? Number(limit) : undefined } }))}>{review.busy ? t('chat.thinking') : t('learner.essays.go')}</Button></div>
        <Failure error={review.error}/>
      </Section>
      <div className="grid content-start gap-4">
        {review.busy && <Thinking label={t('learner.essays.reading')}/>}
        {essay ? <>
          <Section title={t('learner.essays.overall')}><p className="m-0 text-sm leading-6">{essay.overall}</p>{essay.word_limit && <Badge tone={essay.words > essay.word_limit ? 'warn' : 'lime'}>{essay.words} / {essay.word_limit}</Badge>}</Section>
          <Section title={t('learner.essays.structure')}><ul className="m-0 grid list-none gap-2 p-0">{essay.structure.map((part) => <li key={part.part} className="rounded-2xl bg-white/80 p-3 text-sm"><span className="flex items-center gap-2 font-semibold">{part.part}<Badge tone={tone(part.status)}>{t(`learner.essays.status.${part.status}`)}</Badge></span>{part.comment}</li>)}</ul></Section>
          {essay.issues.length > 0 && <Section title={t('learner.essays.issues')}><ul className="m-0 list-disc pl-5 text-sm">{essay.issues.map((issue, index) => <li key={index}><strong>{issue.issue}</strong> — {issue.why} <em>{issue.fix}</em></li>)}</ul></Section>}
          {essay.line_edits.length > 0 && <Section title={t('learner.essays.edits')}><ul className="m-0 list-disc pl-5 text-sm">{essay.line_edits.map((edit, index) => <li key={index}><Quote>{edit.quote}</Quote> → {edit.suggestion} <span className="text-gray-600">({edit.why})</span></li>)}</ul></Section>}
          {essay.questions.length > 0 && <Section title={t('learner.essays.questions')}><ul className="m-0 list-disc pl-5 text-sm">{essay.questions.map((question) => <li key={question}>{question}</li>)}</ul></Section>}
        </> : !review.busy && <p className="m-0 rounded-3xl border border-dashed border-navy-line/40 bg-white/60 p-6 text-sm text-gray-700">{t('learner.essays.empty')}</p>}
      </div>
    </div>
  </ConsentGate>;
}
