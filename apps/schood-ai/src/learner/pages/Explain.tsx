import { useEffect, useState } from 'react';
import { Answer, Button, Field, TextArea, TextInput, Thinking, useLocation, useT } from '../../core/index.ts';
import { ConsentGate, Failure, Mcq, Section, ToolHeader, useLearnerApi, useRun, options, type McqResult } from '../kit.tsx';

// L2 Explain my mistake. Opened from a Schood results screen as
// /explain?source=<app>&session=<id>&item=<id> (ids only), or with a pasted question.

const EXAMS = ['general', 'ielts', 'toefl', 'sat', 'multilevel', 'itep', 'admission'] as const;
interface Explanation { id: string; correct_answer: string; why_wrong: string; rule: string; tip: string; similar: { prompt: string; options: string[] }[]; results: Record<string, McqResult> }
interface Source { found: boolean; exam: string; item?: { question: string; options: string[]; my_answer: string | null; correct_answer: string | null; part: string | null } }

export function ExplainPage() {
  const t = useT(), call = useLearnerApi(), { query } = useLocation();
  const [question, setQuestion] = useState(''), [mine, setMine] = useState(''), [correct, setCorrect] = useState(''), [choices, setChoices] = useState(''), [exam, setExam] = useState<string>('general');
  const [loaded, setLoaded] = useState<'none' | 'loading' | 'found' | 'missing'>('none');
  const result = useRun<{ explanation: Explanation; credits: number }>();
  const source = query.get('source'), session = query.get('session'), item = query.get('item');
  useEffect(() => {
    if (!source) return;
    setLoaded('loading');
    call<Source>('explain-source', { query: { source, session: session ?? '', item: item ?? '' } }).then((out) => {
      setExam(out.exam);
      if (out.found && out.item) {
        setQuestion(out.item.part ? `${out.item.part}: ${out.item.question}` : out.item.question);
        setChoices(out.item.options.join('\n'));
        setMine(out.item.my_answer ?? ''); setCorrect(out.item.correct_answer ?? '');
        setLoaded('found');
      } else setLoaded('missing');
    }).catch(() => setLoaded('missing'));
  }, [source, session, item, call]);

  const ask = () => result.run(() => call('explain', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: {
    question, my_answer: mine || undefined, correct_answer: correct || undefined, exam,
    options: choices.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 6),
    source: source ? { app: source, session, item } : undefined,
  } }));
  const answer = async (index: number, choice: number) => {
    const explanation = result.data?.explanation;
    if (!explanation) return;
    const out = await call<McqResult>('explain-answer', { method: 'POST', body: { id: explanation.id, item: index, choice } }).catch(() => null);
    if (out) result.set({ ...result.data!, explanation: { ...explanation, results: { ...explanation.results, [index]: out } } });
  };
  const explanation = result.data?.explanation;
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.explain')} lead={t('learner.explain.lead')} creditKey="explain.mistake"/>
    {loaded === 'loading' && <Thinking label={t('learner.explain.loading')}/>}
    {loaded === 'found' && <p className="mt-0 rounded-2xl bg-lime-soft p-3 text-sm">{t('learner.explain.loaded')}</p>}
    {loaded === 'missing' && <p className="mt-0 rounded-2xl bg-cream-soft p-3 text-sm">{t('learner.explain.paste')}</p>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <Section title={t('learner.explain.form')}>
        <Field label={t('learner.explain.question')}>{(id) => <TextArea id={id} rows={5} value={question} maxLength={3000} onChange={(event) => setQuestion(event.target.value)}/>}</Field>
        <Field label={t('learner.explain.options')} hint={t('learner.explain.optionsHint')}>{(id) => <TextArea id={id} rows={3} value={choices} onChange={(event) => setChoices(event.target.value)}/>}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('learner.explain.mine')}>{(id) => <TextInput id={id} value={mine} maxLength={500} onChange={(event) => setMine(event.target.value)}/>}</Field>
          <Field label={t('learner.explain.correct')}>{(id) => <TextInput id={id} value={correct} maxLength={500} onChange={(event) => setCorrect(event.target.value)}/>}</Field>
        </div>
        <Field label={t('learner.exam')}>{(id) => <select id={id} value={exam} onChange={(event) => setExam(event.target.value)} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">{options(t, EXAMS, 'learner.exam')}</select>}</Field>
        <div><Button variant="spark" onClick={() => void ask()} disabled={!question.trim() || result.busy}>{result.busy ? t('chat.thinking') : t('learner.explain.go')}</Button></div>
        <Failure error={result.error} onRetry={() => void ask()}/>
      </Section>
      <div className="grid content-start gap-4">
        {result.busy && <Thinking label={t('learner.explain.thinking')}/>}
        {explanation ? <>
          <Section title={t('learner.explain.why')}>
            {explanation.correct_answer && <p className="m-0 text-sm"><strong>{t('learner.explain.answer')}:</strong> {explanation.correct_answer}</p>}
            <Answer text={explanation.why_wrong}/>
          </Section>
          <Section title={t('learner.explain.rule')}><Answer text={explanation.rule}/>{explanation.tip && <p className="m-0 text-sm text-gray-700"><strong>{t('learner.explain.tip')}:</strong> {explanation.tip}</p>}</Section>
          {explanation.similar.length > 0 && <Section title={t('learner.explain.try')}>
            {explanation.similar.map((entry, index) => <Mcq key={index} index={index} prompt={entry.prompt} options={entry.options} result={explanation.results[index] ?? null} onAnswer={(choice) => void answer(index, choice)}/>)}
          </Section>}
        </> : !result.busy && <p className="m-0 rounded-3xl border border-dashed border-navy-line/40 bg-white/60 p-6 text-sm text-gray-700">{t('learner.explain.empty')}</p>}
      </div>
    </div>
  </ConsentGate>;
}
