import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Eye, Headphones, Lock, Play, Square, XCircle } from 'lucide-react';
import { Badge, Button, Card, CreditCost, EmptyState, Eyebrow, navigate, SparkMark, Thinking } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { useAction, useEngage } from '../api.ts';
import { EngageError, Loaded, Notice, Page } from '../ui.tsx';

// /stories, /stories/:arc and /stories/:arc/:episode (E8). One new episode a day: the
// next opens on the day after the current one is passed. Each episode is a listening
// check (the device reads the dialogue aloud) and a reading check; the first pass is a
// verified learning event. Episodes without authored text can be written by AI inside
// the arc, for the credits shown, and are checked before they appear.

interface ArcView {
  key: string; title: string; lead: string; levels: string; episodes: number; unlocked: number; passed: number; started: boolean;
  current: { key: string; index: number; title: string; level: string; passed: boolean };
  list: { key: string; index: number; title: string; level: string; authored: boolean; locked: boolean; passed: boolean }[];
}
interface Question { id: string; mode: 'reading' | 'listening'; prompt: string; options: { id: string; text: string }[] }
interface EpisodeView {
  arc: string; arc_title: string; key: string; index: number; episodes: number; level: string; title: string; minutes: number; passed: boolean; xp: number; written: boolean;
  beat?: string; credit_key?: string; authored?: boolean; opening?: string | null; scene?: string; listen?: { speaker: string; line: string }[]; questions?: Question[];
  choice?: { prompt: string; options: { id: string; label: string }[]; chosen: string | null } | null; words?: { en: string; uz: string; ru: string }[]; cliffhanger?: string | null; next_unlocks?: string | null;
}
interface AnswerView { correct: number; total: number; passed: boolean; first_pass: boolean; results: { id: string; chosen: string; correct: string; right: boolean }[]; cliffhanger: string | null; xp: number; next_unlocks: string | null }

function useSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  const speak = (lines: { speaker: string; line: string }[]) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith('en'));
    const speakers = [...new Set(lines.map((entry) => entry.speaker))];
    lines.forEach((entry, index) => {
      const utterance = new SpeechSynthesisUtterance(entry.line);
      utterance.lang = 'en-GB';
      utterance.rate = 0.92;
      const voice = voices[speakers.indexOf(entry.speaker) % Math.max(1, voices.length)];
      if (voice) utterance.voice = voice;
      if (index === lines.length - 1) utterance.onend = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    });
    setSpeaking(true);
  };
  const stop = () => { if (supported) window.speechSynthesis.cancel(); setSpeaking(false); };
  return { supported, speaking, speak, stop };
}

function Reader({ episode, onDone }: { episode: EpisodeView; onDone: () => void }) {
  const t = useT(), action = useAction(), speech = useSpeech();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState<string | null>(episode.choice?.chosen ?? null);
  const [showDialogue, setShowDialogue] = useState(!speech.supported);
  const [result, setResult] = useState<AnswerView | null>(null);
  const paragraphs = useMemo(() => (episode.scene ?? '').split(/\n\s*\n/).filter(Boolean), [episode.scene]);
  const questions = episode.questions ?? [];
  const submit = async () => {
    const answer = await action.run<AnswerView>('story-answer', { arc: episode.arc, episode: episode.key, answers, ...(choice ? { choice } : {}) });
    if (answer) setResult(answer);
  };
  const resultFor = (id: string) => result?.results.find((entry) => entry.id === id);
  const group = (mode: Question['mode']) => questions.filter((question) => question.mode === mode);
  const renderQuestion = (question: Question) => {
    const graded = resultFor(question.id);
    return <fieldset key={question.id} className="m-0 flex flex-col gap-2 rounded-2xl border border-navy-line/30 bg-white p-3">
      <legend className="px-1 text-sm font-semibold">{question.prompt}</legend>
      {question.options.map((option) => {
        const tone = graded ? option.id === graded.correct ? 'border-green-600 bg-green-50' : option.id === graded.chosen ? 'border-red-400 bg-red-50' : 'border-transparent' : 'border-transparent';
        return <label key={option.id} className={`flex items-start gap-2 rounded-xl border px-2 py-1.5 text-sm ${tone}`}>
          <input type="radio" name={`q-${question.id}`} value={option.id} disabled={!!result} checked={answers[question.id] === option.id} onChange={() => setAnswers({ ...answers, [question.id]: option.id })} className="mt-1"/>
          <span>{option.text}</span>
        </label>;
      })}
      {graded && <p className="m-0 inline-flex items-center gap-1 text-xs font-semibold">{graded.right ? <><CheckCircle2 size={14} className="text-green-700" aria-hidden="true"/>{t('engage.story.right')}</> : <><XCircle size={14} className="text-red-700" aria-hidden="true"/>{t('engage.story.wrong')}</>}</p>}
    </fieldset>;
  };
  return <div className="flex flex-col gap-5">
    <Card className="flex flex-col gap-3">
      <Eyebrow icon={<Headphones size={14} aria-hidden="true"/>}>{t('engage.story.listen')}</Eyebrow>
      <p className="m-0 text-sm text-gray-700">{speech.supported ? t('engage.story.listenLead') : t('engage.story.noSpeech')}</p>
      {speech.supported && <div className="flex flex-wrap gap-2">
        {speech.speaking ? <Button size="sm" variant="secondary" onClick={speech.stop} icon={<Square size={14} aria-hidden="true"/>}>{t('engage.story.stop')}</Button>
          : <Button size="sm" onClick={() => speech.speak(episode.listen ?? [])} icon={<Play size={14} aria-hidden="true"/>}>{t('engage.story.play')}</Button>}
        <Button size="sm" variant="ghost" onClick={() => setShowDialogue((open) => !open)} icon={<Eye size={14} aria-hidden="true"/>}>{showDialogue ? t('engage.story.hideText') : t('engage.story.showText')}</Button>
      </div>}
      {showDialogue && <dl className="m-0 grid gap-1 text-sm">{(episode.listen ?? []).map((entry, index) => <div key={index} className="flex gap-2"><dt className="shrink-0 font-semibold">{entry.speaker}:</dt><dd className="m-0">{entry.line}</dd></div>)}</dl>}
      <div className="flex flex-col gap-2">{group('listening').map(renderQuestion)}</div>
    </Card>
    <Card className="flex flex-col gap-3">
      <Eyebrow icon={<BookOpen size={14} aria-hidden="true"/>}>{t('engage.story.read')}</Eyebrow>
      {episode.opening && <p className="m-0 italic text-gray-700">{episode.opening}</p>}
      <div className="flex flex-col gap-3 font-serif text-base leading-8 text-gray-900">{paragraphs.map((paragraph, index) => <p key={index} className="m-0">{paragraph}</p>)}</div>
      {!!episode.words?.length && <details className="rounded-2xl border border-navy-line/30 bg-cream-soft p-3 text-sm">
        <summary className="cursor-pointer font-semibold">{t('engage.story.words')}</summary>
        <table className="mt-2 w-full text-left"><thead><tr><th scope="col">English</th><th scope="col">O‘zbekcha</th><th scope="col">Русский</th></tr></thead>
          <tbody>{episode.words.map((word) => <tr key={word.en}><td>{word.en}</td><td>{word.uz}</td><td>{word.ru}</td></tr>)}</tbody></table>
      </details>}
      <div className="flex flex-col gap-2">{group('reading').map(renderQuestion)}</div>
    </Card>
    {episode.choice && <Card className="flex flex-col gap-2">
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 font-semibold">{episode.choice.prompt}</legend>
        {episode.choice.options.map((option) => <label key={option.id} className="flex items-start gap-2 text-sm"><input type="radio" name="choice" disabled={!!result} checked={choice === option.id} onChange={() => setChoice(option.id)} className="mt-1"/><span>{option.label}</span></label>)}
      </fieldset>
      <p className="m-0 text-xs text-gray-600">{t('engage.story.choiceNote')}</p>
    </Card>}
    {action.error !== null && <EngageError error={action.error}/>}
    {!result ? <div><Button disabled={action.busy !== null || questions.some((question) => !answers[question.id])} onClick={() => void submit()}>{t('engage.story.check')}</Button></div>
      : <Card className={`flex flex-col gap-3 ${result.passed ? 'bg-lime-soft/40' : 'bg-cream-soft'}`}>
        <p className="m-0 font-display text-xl font-bold">{t(result.passed ? 'engage.story.passed' : 'engage.story.notYet', { correct: result.correct, total: result.total })}</p>
        {result.first_pass && <p className="m-0 text-sm">{t('engage.story.xp', { xp: result.xp })}</p>}
        {result.cliffhanger && <p className="m-0 border-l-4 border-navy pl-3 text-base italic">{result.cliffhanger}</p>}
        {result.next_unlocks && <p className="m-0 text-sm text-gray-700">{t('engage.story.tomorrow')}</p>}
        <div className="flex flex-wrap gap-2">
          {!result.passed && <Button size="sm" variant="secondary" onClick={() => { setResult(null); setAnswers({}); }}>{t('engage.story.retry')}</Button>}
          <Button size="sm" variant="ghost" onClick={onDone}>{t('engage.story.back')}</Button>
        </div>
      </Card>}
  </div>;
}

function Episode({ arc, episodeKey }: { arc: string; episodeKey?: string }) {
  const t = useT(), action = useAction();
  const view = useEngage<{ episode: EpisodeView }>('story', { arc, episode: episodeKey });
  const fill = async (episode: EpisodeView) => { const next = await action.run<{ episode: EpisodeView }>('story-fill', { arc, episode: episode.key }); if (next) view.setData(next); };
  return <Loaded {...view}>{({ episode }) => <Page eyebrow={<Eyebrow>{episode.arc_title} · {t('engage.story.episode', { index: episode.index, total: episode.episodes })}</Eyebrow>}
    title={episode.title} lead={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone="sky">{episode.level}</Badge><span>{t('engage.story.minutes', { count: episode.minutes })}</span>{episode.passed && <Badge tone="lime">{t('engage.story.passedBadge')}</Badge>}{episode.authored === false && <Badge>{t('engage.story.aiWritten')}</Badge>}</span>}>
    {!episode.written ? <Card className="flex flex-col gap-3">
      <p className="m-0 text-sm text-gray-700">{t('engage.story.beat')}</p>
      <p className="m-0 border-l-4 border-navy-line/40 pl-3 italic">{episode.beat}</p>
      <div className="flex flex-wrap items-center gap-3">
        {action.busy ? <Thinking label={t('engage.story.writing')}/> : <Button variant="spark" onClick={() => void fill(episode)} icon={<SparkMark size={18}/>}>{t('engage.story.write')}</Button>}
        <CreditCost creditKey="story.episode"/>
      </div>
      <p className="m-0 text-xs text-gray-600">{t('engage.story.writeNote')}</p>
      {action.error !== null && <EngageError error={action.error}/>}
    </Card> : <Reader episode={episode} onDone={() => navigate(`/stories/${arc}`)}/>}
  </Page>}</Loaded>;
}

function Arc({ arcKey }: { arcKey: string }) {
  const t = useT();
  const view = useEngage<{ arcs: ArcView[] }>('stories');
  return <Loaded {...view}>{(data) => {
    const arc = data.arcs.find((entry) => entry.key === arcKey);
    if (!arc) return <EmptyState title={t('engage.story.missing')}/>;
    return <Page eyebrow={<Eyebrow icon={<BookOpen size={14} aria-hidden="true"/>}>{t('engage.story.eyebrow')}</Eyebrow>} title={arc.title} lead={arc.lead}
      actions={<Button onClick={() => navigate(`/stories/${arc.key}/${arc.current.key}`)} icon={<ArrowRight size={16} aria-hidden="true"/>}>{arc.current.passed ? t('engage.story.reread') : t('engage.story.continue', { index: arc.current.index })}</Button>}>
      {arc.current.passed && arc.unlocked < arc.episodes && <Notice>{t('engage.story.tomorrow')}</Notice>}
      <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {arc.list.map((episode) => <li key={episode.key}>
          <button type="button" disabled={episode.locked} onClick={() => navigate(`/stories/${arc.key}/${episode.key}`)}
            className="flex w-full items-center gap-3 rounded-2xl border border-navy-line/30 bg-white p-3 text-left text-sm hover:bg-cream-soft disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">
            <span className="w-6 shrink-0 text-right font-display font-bold">{episode.index}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{episode.title}</span><span className="text-xs text-gray-600">{episode.level}{episode.authored ? '' : ` · ${t('engage.story.aiOnRequest')}`}</span></span>
            {episode.locked ? <Lock size={14} aria-label={t('engage.story.locked')}/> : episode.passed ? <CheckCircle2 size={16} className="text-green-700" aria-label={t('engage.story.passedBadge')}/> : null}
          </button>
        </li>)}
      </ol>
    </Page>;
  }}</Loaded>;
}

export function StoriesPage({ params }: { params: Record<string, string> }) {
  const t = useT();
  const view = useEngage<{ arcs: ArcView[] }>(params.arc ? null : 'stories');
  if (params.arc && params.episode) return <Episode arc={params.arc} episodeKey={params.episode}/>;
  if (params.arc) return <Arc arcKey={params.arc}/>;
  return <Page eyebrow={<Eyebrow icon={<BookOpen size={14} aria-hidden="true"/>}>{t('engage.story.eyebrow')}</Eyebrow>} title={t('engage.story.title')} lead={t('engage.story.lead')}>
    <Loaded {...view}>{(data) => <div className="grid gap-4 md:grid-cols-2">
      {data.arcs.map((arc) => <Card key={arc.key} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2"><Badge tone="sky">{arc.levels}</Badge><Badge>{t('engage.story.count', { count: arc.episodes })}</Badge>{arc.started && <Badge tone="lime">{t('engage.story.progress', { passed: arc.passed, total: arc.episodes })}</Badge>}</div>
        <h2 className="m-0 font-display text-2xl font-bold">{arc.title}</h2>
        <p className="m-0 flex-1 text-sm text-gray-700">{arc.lead}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate(`/stories/${arc.key}/${arc.current.key}`)}>{arc.started ? t('engage.story.continue', { index: arc.current.index }) : t('engage.story.begin')}</Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/stories/${arc.key}`)}>{t('engage.story.all')}</Button>
        </div>
      </Card>)}
    </div>}</Loaded>
  </Page>;
}
