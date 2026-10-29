import { useRef, useState } from 'react';
import { Flame } from 'lucide-react';
import { Answer, Badge, Button, CreditCost, Field, LoadingState, TextArea, TextInput, Thinking, useT } from '../../core/index.ts';
import { ConsentGate, Failure, ListenButton, Mcq, Section, SpeechInput, ToolHeader, options, useLearnerApi, useLoad, useRun, type McqResult, type Spoken } from '../kit.tsx';

// L13 pronunciation, L6 words from my texts, L10 graded reading, L9 photo explain.

// --- L13 --------------------------------------------------------------------------------
interface Today { day: string; sentences: { id: string; text: string; focus: string; level: string }[]; done: Record<string, number>; goal: number; pass: number; streak: number }
interface Check { sentence_id: string; heard: string; score: number; passed: boolean; words: { word: string; status: 'ok' | 'missed' | 'changed'; heard: string | null }[]; pauses: number | null; tips: { word: string; tip: string }[]; encouragement: string | null; streak: number }

export function PronouncePage() {
  const t = useT(), call = useLearnerApi();
  const today = useLoad(() => call<Today>('pronunciation'));
  const speech = useLoad(() => call<{ speech: { stt: boolean } }>('speech-status'));
  const [results, setResults] = useState<Record<string, Check>>({});
  const check = useRun<Check>();
  const submit = async (id: string, spoken: Spoken) => {
    const out = await check.run(() => call('pronunciation-check', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { sentence_id: id, ...(spoken.audio ? { audio: spoken.audio.data, mime: spoken.audio.mime } : { transcript: spoken.text }) } }));
    if (out) { setResults((current) => ({ ...current, [id]: out })); today.reload(); }
  };
  const data = today.data;
  const passed = data ? Object.values(data.done).filter((score) => score >= data.pass).length : 0;
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.pronounce')} lead={t('learner.pronounce.lead')} creditKey="pronunciation.drill"/>
    {today.loading && !data && <LoadingState/>}
    <Failure error={today.error} onRetry={today.reload}/>
    {data && <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3"><Badge tone="lime"><Flame size={14} aria-hidden="true"/>{t('learner.pronounce.streak', { count: data.streak })}</Badge><span className="text-sm text-gray-700">{t('learner.pronounce.goal', { done: Math.min(passed, data.goal), goal: data.goal })}</span></div>
      <p className="m-0 text-xs text-gray-600">{t('learner.pronounce.how')}</p>
      {data.sentences.map((sentence) => {
        const result = results[sentence.id], best = data.done[sentence.id];
        return <Section key={sentence.id} title={<span className="flex flex-wrap items-center gap-2">{t(`learner.pronounce.focus.${sentence.focus}`)}<Badge>{sentence.level}</Badge>{best !== undefined && <Badge tone={best >= data.pass ? 'lime' : 'warn'}>{best}%</Badge>}</span>}>
          <p className="m-0 font-display text-lg">{sentence.text} <ListenButton text={sentence.text}/></p>
          <SpeechInput server={!!speech.data?.speech.stt} maxSeconds={20} onDone={(spoken) => void submit(sentence.id, spoken)} disabled={check.busy} label={t('learner.pronounce.typeLabel')}/>
          {result && <div className="grid gap-2" aria-live="polite">
            <p className="m-0 flex flex-wrap gap-1 text-base">{result.words.map((word, index) => <span key={index} className={`rounded px-1 ${word.status === 'ok' ? 'bg-green-50 text-green-900' : word.status === 'changed' ? 'bg-amber-100 text-amber-900' : 'bg-red-50 text-red-800 line-through'}`} title={word.heard ? t('learner.pronounce.heardAs', { word: word.heard }) : undefined}>{word.word}</span>)}</p>
            <p className="m-0 text-sm"><strong>{result.score}%</strong> {result.passed ? t('learner.pronounce.passed') : t('learner.pronounce.again')}{result.pauses ? ` · ${t('learner.pronounce.pauses', { count: result.pauses })}` : ''}</p>
            {result.tips.length > 0 && <ul className="m-0 pl-5 text-sm">{result.tips.map((tip) => <li key={tip.word}><strong>{tip.word}</strong>: {tip.tip}</li>)}</ul>}
          </div>}
        </Section>;
      })}
      <Failure error={check.error}/>
    </div>}
  </ConsentGate>;
}

// --- L6 ---------------------------------------------------------------------------------
interface WordList { id: string; level: string; title: string | null; words: { word: string; pos?: string; level: string | null; definition: string; meaning_uz: string; meaning_ru: string; example: string }[]; saved: number[] }

/** Shrinks a photo in the browser so it fits the upload limit on a weak connection. */
export async function photoData(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function WordsPage() {
  const t = useT(), call = useLearnerApi();
  const [text, setText] = useState(''), [image, setImage] = useState<string | null>(null), [picked, setPicked] = useState<Set<number>>(new Set());
  const list = useRun<{ list: WordList }>(), save = useRun<{ saved: number[]; added: number; already: number }>();
  const file = useRef<HTMLInputElement>(null);
  const go = () => list.run(() => call<{ list: WordList }>('words', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: image ? { image } : { text } }).then((out) => { setPicked(new Set(out.list.words.map((_word, index) => index))); return out; }));
  const words = list.data?.list;
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.words')} lead={t('learner.words.lead')} creditKey={image ? 'words.from_photo' : 'words.from_text'}/>
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t('learner.words.source')}>
        <Field label={t('learner.words.text')}>{(id) => <TextArea id={id} rows={8} value={text} maxLength={6000} disabled={!!image} onChange={(event) => setText(event.target.value)}/>}</Field>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={file} type="file" accept="image/*" capture="environment" className="sr-only" id="words-photo" onChange={async (event) => { const chosen = event.target.files?.[0]; if (chosen) setImage(await photoData(chosen)); }}/>
          <label htmlFor="words-photo" className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-navy-line bg-white px-4 text-sm font-semibold">{t('learner.words.photo')}</label>
          {image && <><img src={image} alt={t('learner.words.photoAlt')} className="h-16 w-16 rounded-xl object-cover"/><Button variant="ghost" size="sm" onClick={() => setImage(null)}>{t('learner.words.removePhoto')}</Button></>}
        </div>
        <div><Button variant="spark" disabled={(!image && text.trim().split(/\s+/).length < 10) || list.busy} onClick={() => void go()}>{list.busy ? t('chat.thinking') : t('learner.words.go')}</Button></div>
        <Failure error={list.error}/>
      </Section>
      <div className="grid content-start gap-3">
        {list.busy && <Thinking label={t('learner.words.finding')}/>}
        {words ? <Section title={words.title ?? t('learner.words.found', { count: words.words.length })}>
          <ul className="m-0 grid list-none gap-2 p-0">{words.words.map((word, index) => <li key={word.word} className="rounded-2xl bg-white/85 p-3 text-sm">
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={picked.has(index)} onChange={(event) => setPicked((current) => { const next = new Set(current); if (event.target.checked) next.add(index); else next.delete(index); return next; })}/>
              <span><strong>{word.word}</strong>{word.pos ? ` (${word.pos})` : ''} {word.level && <Badge>{word.level}</Badge>}{(save.data?.saved ?? words.saved).includes(index) && <Badge tone="lime">{t('learner.words.inNotebook')}</Badge>}<br/>{word.definition}<br/><span className="text-gray-700">uz: {word.meaning_uz} · ru: {word.meaning_ru}</span><br/><em className="text-gray-600">{word.example}</em></span></label>
          </li>)}</ul>
          <div className="flex flex-wrap items-center gap-3"><Button disabled={!picked.size || save.busy} onClick={() => void save.run(() => call('words-save', { method: 'POST', body: { id: words.id, indices: [...picked] } }))}>{t('learner.words.save', { count: picked.size })}</Button>
            {save.data && <span role="status" className="text-sm">{t('learner.words.saved', { added: save.data.added, already: save.data.already })}</span>}</div>
          <p className="m-0 text-xs text-gray-600">{t('learner.words.notebook')}</p>
          <Failure error={save.error}/>
        </Section> : !list.busy && <p className="m-0 rounded-3xl border border-dashed border-navy-line/40 bg-white/60 p-6 text-sm text-gray-700">{t('learner.words.empty')}</p>}
      </div>
    </div>
  </ConsentGate>;
}

// --- L10 --------------------------------------------------------------------------------
interface Reading { id: string; topic: string; level: string; title: string; text: string; questions: { prompt: string; options: string[] }[]; words: { word: string; meaning_en: string; meaning_uz: string; meaning_ru: string }[]; result: { items: { choice: number; answer_index: number; correct: boolean; explanation: string }[]; correct: number; total: number; score: number } | null }

export function ReadingPage() {
  const t = useT(), call = useLearnerApi();
  const [topic, setTopic] = useState(''), [level, setLevel] = useState(''), [length, setLength] = useState('short'), [answers, setAnswers] = useState<number[]>([]);
  const reading = useRun<{ reading: Reading }>(), check = useRun<{ reading: Reading }>(), save = useRun<{ added: number }>();
  const current = check.data?.reading ?? reading.data?.reading;
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.reading')} lead={t('learner.reading.lead')} creditKey="reading.graded"/>
    <Section title={t('learner.reading.new')} className="mb-6">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_10rem]">
        <Field label={t('learner.reading.topic')}>{(id) => <TextInput id={id} value={topic} maxLength={120} onChange={(event) => setTopic(event.target.value)}/>}</Field>
        <Field label={t('learner.level')}>{(id) => <select id={id} value={level} onChange={(event) => setLevel(event.target.value)} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm"><option value="">{t('learner.reading.myLevel')}</option>{['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((value) => <option key={value}>{value}</option>)}</select>}</Field>
        <Field label={t('learner.reading.length')}>{(id) => <select id={id} value={length} onChange={(event) => setLength(event.target.value)} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">{options(t, ['short', 'medium'], 'learner.reading.length')}</select>}</Field>
      </div>
      <div><Button variant="spark" disabled={!topic.trim() || reading.busy} onClick={() => void reading.run(() => call<{ reading: Reading }>('reading', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { topic, level: level || undefined, length } }).then((out) => { setAnswers([]); check.set(null); return out; }))}>{reading.busy ? t('chat.thinking') : t('learner.reading.go')}</Button></div>
      <Failure error={reading.error}/>
    </Section>
    {reading.busy && <Thinking label={t('learner.reading.writing')}/>}
    {current && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <Section title={<span className="flex items-center gap-2">{current.title}<Badge>{current.level}</Badge></span>}><div className="text-base leading-8"><Answer text={current.text}/></div></Section>
      <div className="grid content-start gap-3">
        {current.questions.map((question, index) => <Mcq key={index} index={index} prompt={question.prompt} options={question.options} disabled={!!current.result}
          result={current.result ? { ...current.result.items[index] } as McqResult : answers[index] !== undefined ? { choice: answers[index], correct: false, answer_index: null } : null}
          onAnswer={(choice) => setAnswers((list) => { const next = [...list]; next[index] = choice; return next; })}/>)}
        {!current.result && <Button disabled={answers.filter((value) => value !== undefined).length < current.questions.length || check.busy} onClick={() => void check.run(() => call('reading-check', { method: 'POST', body: { id: current.id, answers } }))}>{t('learner.reading.check')}</Button>}
        {current.result && <p role="status" className="m-0 font-semibold">{t('learner.reading.score', { correct: current.result.correct, total: current.result.total })}</p>}
        {current.words.length > 0 && <Section title={t('learner.reading.words')}>
          <ul className="m-0 pl-5 text-sm">{current.words.map((word) => <li key={word.word}><strong>{word.word}</strong> — {word.meaning_en} · {word.meaning_uz} · {word.meaning_ru}</li>)}</ul>
          <div><Button variant="secondary" size="sm" disabled={save.busy || !!save.data} onClick={() => void save.run(() => call('words-save', { method: 'POST', body: { id: current.id, kind: 'reading', indices: current.words.map((_word, index) => index) } }))}>{save.data ? t('learner.words.saved', { added: save.data.added, already: 0 }) : t('learner.reading.saveWords')}</Button></div>
        </Section>}
        <Failure error={check.error ?? save.error}/>
      </div>
    </div>}
  </ConsentGate>;
}

// --- L9 ---------------------------------------------------------------------------------
interface Photo { id: string; problem: string; hints: string[]; revealed: boolean; solution: { steps: { text: string }[]; answer: string } | null }
export function PhotoPage() {
  const t = useT(), call = useLearnerApi();
  const [image, setImage] = useState<string | null>(null), [subject, setSubject] = useState('maths'), [note, setNote] = useState(''), [shown, setShown] = useState(1);
  const photo = useRun<{ photo: Photo }>(), solve = useRun<{ photo: Photo }>();
  const current = solve.data?.photo ?? photo.data?.photo;
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.photo')} lead={t('learner.photo.lead')} creditKey="photo.explain"/>
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t('learner.photo.take')}>
        <input type="file" accept="image/*" capture="environment" id="photo-input" className="sr-only" onChange={async (event) => { const chosen = event.target.files?.[0]; if (chosen) setImage(await photoData(chosen)); }}/>
        <label htmlFor="photo-input" className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-full border border-navy-line bg-white px-4 text-sm font-semibold">{t('learner.photo.choose')}</label>
        {image && <img src={image} alt={t('learner.photo.preview')} className="max-h-72 w-full rounded-2xl object-contain"/>}
        <Field label={t('learner.photo.subject')}>{(id) => <select id={id} value={subject} onChange={(event) => setSubject(event.target.value)} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">{options(t, ['maths', 'english', 'other'], 'learner.photo.subject')}</select>}</Field>
        <Field label={t('learner.photo.note')}>{(id) => <TextInput id={id} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)}/>}</Field>
        <div><Button variant="spark" disabled={!image || photo.busy} onClick={() => void photo.run(() => call<{ photo: Photo }>('photo-explain', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { image, subject, note: note || undefined } }).then((out) => { setShown(1); solve.set(null); return out; }))}>{photo.busy ? t('chat.thinking') : t('learner.photo.go')}</Button></div>
        <Failure error={photo.error}/>
      </Section>
      <div className="grid content-start gap-3">
        {photo.busy && <Thinking label={t('learner.photo.reading')}/>}
        {current && <>
          <Section title={t('learner.photo.problem')}><Answer text={current.problem}/></Section>
          <Section title={t('learner.photo.hints')}>
            <ol className="m-0 grid gap-2 pl-5 text-sm">{current.hints.slice(0, shown).map((hint, index) => <li key={index}><Answer text={hint}/></li>)}</ol>
            <div className="flex flex-wrap gap-2">
              {shown < current.hints.length && <Button variant="secondary" size="sm" onClick={() => setShown((value) => value + 1)}>{t('learner.photo.nextHint')}</Button>}
              {!current.revealed && <Button size="sm" disabled={solve.busy} onClick={() => void solve.run(() => call('photo-solution', { method: 'POST', body: { id: current.id } }))}>{t('learner.photo.solution')}</Button>}
            </div>
            <Failure error={solve.error}/>
          </Section>
          {current.solution && <Section title={t('learner.photo.worked')}><ol className="m-0 grid gap-2 pl-5 text-sm">{current.solution.steps.map((step, index) => <li key={index}><Answer text={step.text}/></li>)}</ol><p className="m-0 font-semibold"><Answer text={current.solution.answer}/></p></Section>}
        </>}
        {!current && !photo.busy && <p className="m-0 rounded-3xl border border-dashed border-navy-line/40 bg-white/60 p-6 text-sm text-gray-700">{t('learner.photo.empty')}</p>}
        <CreditCost creditKey="photo.explain"/>
      </div>
    </div>
  </ConsentGate>;
}
