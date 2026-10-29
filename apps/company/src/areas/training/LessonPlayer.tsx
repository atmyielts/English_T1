// Lesson player (/w/:org/learn/:track/:lesson): phrases, words, a model dialogue
// read aloud, exercises checked by the server, then the workplace mission.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { LevelBadge, ListenButton, Loading, RateToggle, readLocal, useLoad, useLocalized, useMinutes, useRate, writeLocal, type Localized } from './lib.tsx';
import { canSpeak, speak, stopSpeaking } from './speech.ts';

interface Phrase { en: string; ru: string; uz: string; note?: string }
type PublicExercise =
  | { id: string; kind: 'choice'; prompt: string | null; items: { q: string; options: string[] }[] }
  | { id: string; kind: 'gap'; prompt: string | null; bank: string[] | null; items: { text: string }[] }
  | { id: string; kind: 'order'; prompt: string | null; lines: string[] }
  | { id: string; kind: 'match'; prompt: string | null; left: string[]; right: string[] };
interface LessonView {
  track: { code: string; title: Localized; lessons: number };
  position: number; next: string | null; previous: string | null;
  lesson: {
    code: string; stage: string; level: string; title: Localized; goal: Localized; phrases: Phrase[]; words: Phrase[];
    dialogue: { setting: Localized; lines: { speaker: string; text: string }[] };
    exercises: PublicExercise[];
    mission: { kind: 'roleplay' | 'writing'; code: string; title: Localized | null; brief: Localized };
  };
  progress: { status: string; score: number | null; attempts: number; minutes: number; step: string | null } | null;
  pass_score: number;
}
interface CheckResult {
  results: { id: string; correct: number; total: number; items: { ok: boolean; expected: string }[] }[];
  correct: number; total: number; score: number; passed: boolean; first_completion: boolean; best: number; status: string; next: string | null; pass_score: number;
}
type Answers = Record<string, unknown[]>;

const STEPS = ['phrases', 'words', 'dialogue', 'exercises', 'mission'] as const;
type Step = (typeof STEPS)[number];
type Translation = 'ru' | 'uz' | 'off';

function useTranslation(): [Translation, (value: Translation) => void] {
  const { locale } = useI18n();
  const [value, setValue] = useState<Translation>(() => readLocal<Translation>('training.translation', locale === 'uz' ? 'uz' : locale === 'ru' ? 'ru' : 'off'));
  return [value, (next) => { setValue(next); writeLocal('training.translation', next); }];
}

export function LessonPlayer({ track, lesson }: { track: string; lesson: string }) {
  const t = useAppT();
  const { org } = useWorkspace();
  const { data, error, reload } = useLoad<LessonView>(`orgs/${org.id}/learn/${lesson}`);
  if (!data) return <Loading error={error}/>;
  if (data.track.code !== track) return <p className="error" role="alert">{t('training.lesson.notFound')}</p>;
  return <Player key={lesson} org={org.id} view={data} reload={reload}/>;
}

function Player({ org, view, reload }: { org: string; view: LessonView; reload: () => Promise<void> }) {
  const t = useAppT(), pick = useLocalized();
  const { member } = useWorkspace();
  const { lesson } = view;
  const initial = (STEPS as readonly string[]).includes(view.progress?.step ?? '') ? view.progress!.step as Step : view.progress?.step === 'results' ? 'exercises' : 'phrases';
  const [step, setStep] = useState<Step>(initial);
  const [translation, setTranslation] = useTranslation();
  const [rate, setRate] = useRate();
  const heading = useRef<HTMLHeadingElement>(null);

  // Remember the step for "Continue" (members only; staff browse without saving).
  useEffect(() => {
    if (member) void api(`orgs/${org}/learn/${lesson.code}/start`, { method: 'POST', body: { step: step === 'mission' ? 'results' : step } }).catch(() => undefined);
  }, [step]);
  useEffect(() => () => stopSpeaking(), []);

  const go = (next: Step) => { stopSpeaking(); setStep(next); heading.current?.focus(); };
  const index = STEPS.indexOf(step);
  const translate = (item: Phrase) => translation === 'off' ? '' : item[translation];

  return <div className="training-page training-player">
    <p className="training-crumbs"><Link to={`/w/${org}/learn?track=${view.track.code}`}>{pick(view.track.title)}</Link> · {t('training.lesson.position', { n: view.position, total: view.track.lessons })}</p>
    <header className="training-head">
      <h1>{pick(lesson.title)}</h1>
      <p>{pick(lesson.goal)}</p>
      <p className="training-lesson-meta"><LevelBadge level={lesson.level}/> <span className="company-badge">{t(`training.stage.${lesson.stage}` as AppKey)}</span>
        {view.progress?.status === 'completed' && <span className="company-badge good">{t('training.lesson.statusDone', { score: view.progress.score ?? 0 })}</span>}
      </p>
    </header>

    <nav className="training-steps" aria-label={t('training.lesson.steps')}>
      <ol>
        {STEPS.map((name, position) => <li key={name}>
          <button type="button" className={name === step ? '' : 'quiet'} aria-current={name === step ? 'step' : undefined} onClick={() => go(name)}>
            <span aria-hidden="true">{position + 1}</span> {t(`training.step.${name}` as AppKey)}
          </button>
        </li>)}
      </ol>
    </nav>

    <section className="training-card" aria-labelledby="training-step-title">
      <h2 id="training-step-title" ref={heading} tabIndex={-1}>{t(`training.step.${step}` as AppKey)}</h2>
      {(step === 'phrases' || step === 'words' || step === 'dialogue') && <div className="training-options">
        <label>{t('training.lesson.translation')}
          <select value={translation} onChange={(event) => setTranslation(event.target.value as Translation)}>
            <option value="ru">Русский</option><option value="uz">O‘zbekcha</option><option value="off">{t('training.lesson.translationOff')}</option>
          </select>
        </label>
        <RateToggle rate={rate} onChange={setRate}/>
        {!canSpeak() && <p className="hint">{t('training.listen.unavailable')}</p>}
      </div>}

      {step === 'phrases' && <ul className="training-phrases">
        {lesson.phrases.map((phrase) => <li key={phrase.en}>
          <div><strong lang="en">{phrase.en}</strong>{translate(phrase) && <span lang={translation}>{translate(phrase)}</span>}</div>
          <ListenButton text={phrase.en} rate={rate}/>
        </li>)}
      </ul>}

      {step === 'words' && <ul className="training-words">
        {lesson.words.map((word) => <li key={word.en}>
          <strong lang="en">{word.en}</strong>
          {word.note && <span className="hint" lang="en">{word.note}</span>}
          {translate(word) && <span lang={translation}>{translate(word)}</span>}
          <ListenButton text={word.en} rate={rate}/>
        </li>)}
      </ul>}

      {step === 'dialogue' && <Dialogue lines={lesson.dialogue.lines} setting={pick(lesson.dialogue.setting)} rate={rate}/>}

      {step === 'exercises' && <Exercises org={org} view={view} onDone={() => void reload()} onMission={() => go('mission')}/>}

      {step === 'mission' && <Mission org={org} view={view}/>}
    </section>

    <div className="company-actions training-step-nav">
      {index > 0 && <button type="button" className="quiet" onClick={() => go(STEPS[index - 1])}>← {t(`training.step.${STEPS[index - 1]}` as AppKey)}</button>}
      {index < STEPS.length - 1 && <button type="button" onClick={() => go(STEPS[index + 1])}>{t(`training.step.${STEPS[index + 1]}` as AppKey)} →</button>}
    </div>
  </div>;
}

function Dialogue({ lines, setting, rate }: { lines: { speaker: string; text: string }[]; setting: string; rate: number }) {
  const t = useAppT();
  const [current, setCurrent] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const stopped = useRef(false);
  const speakers = useMemo(() => [...new Set(lines.map((line) => line.speaker))], [lines]);
  useEffect(() => () => { stopped.current = true; stopSpeaking(); }, []);
  async function playAll(from = 0) {
    stopped.current = false;
    for (let index = from; index < lines.length; index++) {
      if (stopped.current) break;
      setCurrent(index);
      await speak(lines[index].text, { rate, voice: speakers.indexOf(lines[index].speaker) });
    }
    setCurrent(null);
  }
  const stop = () => { stopped.current = true; stopSpeaking(); setCurrent(null); };
  return <>
    <p>{setting}</p>
    <div className="company-actions">
      {canSpeak() && (current === null
        ? <button type="button" onClick={() => void playAll()}>▶ {t('training.dialogue.play')}</button>
        : <button type="button" onClick={stop}>■ {t('training.dialogue.stop')}</button>)}
      <label className="check"><input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)}/>{t('training.dialogue.hide')}</label>
    </div>
    <ol className="training-dialogue" aria-live="off">
      {lines.map((line, index) => <li key={index} className={`${index === current ? 'is-playing ' : ''}speaker-${speakers.indexOf(line.speaker) % 3}`}>
        <strong>{line.speaker}</strong>
        <span lang="en" className={hidden && index !== current ? 'training-blur' : ''} aria-hidden={hidden && index !== current ? true : undefined}>{line.text}</span>
        {canSpeak() && <button type="button" className="quiet training-listen" aria-label={t('training.listen.aria', { text: line.text.slice(0, 60) })} onClick={() => { stop(); setCurrent(index); void speak(line.text, { rate, voice: speakers.indexOf(line.speaker) }).then(() => setCurrent(null)); }}>▶</button>}
      </li>)}
    </ol>
  </>;
}

function emptyAnswers(exercises: PublicExercise[]): Answers {
  return Object.fromEntries(exercises.map((exercise) => [exercise.id,
    exercise.kind === 'order' ? [...exercise.lines]
      : exercise.kind === 'match' ? exercise.left.map(() => '')
      : exercise.items.map(() => exercise.kind === 'choice' ? null : '')]));
}

function Exercises({ org, view, onDone, onMission }: { org: string; view: LessonView; onDone: () => void; onMission: () => void }) {
  const t = useAppT(), problem = useErrorText();
  const { member } = useWorkspace();
  const { lesson } = view;
  const draftKey = `training.answers.${lesson.code}`;
  const [answers, setAnswers] = useState<Answers>(() => ({ ...emptyAnswers(lesson.exercises), ...readLocal<Answers>(draftKey, {}) }));
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const minutes = useMinutes();
  const summary = useRef<HTMLDivElement>(null);
  const update = (id: string, value: unknown[]) => {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    writeLocal(draftKey, next);
  };
  const resultOf = (id: string) => result?.results.find((entry) => entry.id === id);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!member) { setError(t('training.notMember')); return; }
    setBusy(true); setError('');
    try {
      const checked = await api<CheckResult>(`orgs/${org}/learn/${lesson.code}/check`, { method: 'POST', body: { answers, minutes: minutes.take() } });
      setResult(checked);
      if (checked.passed) writeLocal(draftKey, null);
      onDone();
      queueMicrotask(() => summary.current?.focus());
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  function retry() {
    setResult(null);
    const fresh = emptyAnswers(lesson.exercises);
    setAnswers(fresh);
    writeLocal(draftKey, null);
  }

  return <form onSubmit={submit} className="training-exercises" noValidate>
    <p className="hint">{t('training.exercise.lead', { score: view.pass_score })}</p>
    {lesson.exercises.map((exercise, number) => <fieldset key={exercise.id} className="training-exercise">
      <legend>{number + 1}. {t(`training.exercise.${exercise.kind}` as AppKey)}</legend>
      {exercise.prompt && <p lang="en">{exercise.prompt}</p>}
      <ExerciseBody exercise={exercise} value={answers[exercise.id] ?? []} onChange={(value) => update(exercise.id, value)} result={resultOf(exercise.id)} disabled={Boolean(result)}/>
      {resultOf(exercise.id) && <p className="training-score-line">{t('training.exercise.score', { correct: resultOf(exercise.id)!.correct, total: resultOf(exercise.id)!.total })}</p>}
    </fieldset>)}
    {error && <p className="error" role="alert">{error}</p>}
    {!result ? <button disabled={busy}>{busy ? t('training.exercise.checking') : t('training.exercise.check')}</button>
      : <div ref={summary} tabIndex={-1} className={result.passed ? 'notice' : 'error'} role="status">
        <p><strong>{t('training.exercise.result', { score: result.score, correct: result.correct, total: result.total })}</strong></p>
        <p>{result.passed ? (result.first_completion ? t('training.exercise.passedFirst') : t('training.exercise.passed')) : t('training.exercise.failed', { score: result.pass_score })}</p>
        <div className="company-actions">
          <button type="button" className="quiet" onClick={retry}>{t('training.exercise.retry')}</button>
          <button type="button" onClick={onMission}>{t('training.exercise.toMission')}</button>
          {result.next && <Link className="button-link quiet" to={`/w/${org}/learn/${view.track.code}/${result.next}`}>{t('training.lesson.next')}</Link>}
        </div>
      </div>}
  </form>;
}

function Mark({ ok, expected }: { ok: boolean; expected: string }) {
  const t = useAppT();
  return ok ? <span className="training-mark good">✓ <span className="visually-hidden">{t('training.exercise.correct')}</span></span>
    : <span className="training-mark bad">✗ {t('training.exercise.answer')} <strong lang="en">{expected}</strong></span>;
}

function ExerciseBody({ exercise, value, onChange, result, disabled }: { exercise: PublicExercise; value: unknown[]; onChange: (value: unknown[]) => void; result?: CheckResult['results'][number]; disabled: boolean }) {
  const t = useAppT();
  const set = (index: number, item: unknown) => onChange(value.map((entry, position) => position === index ? item : entry));
  switch (exercise.kind) {
    case 'choice':
      return <ol className="training-items">
        {exercise.items.map((item, index) => <li key={index}>
          <fieldset className="training-choice">
            <legend lang="en">{item.q}</legend>
            {item.options.map((option, choice) => <label key={choice} className="check">
              <input type="radio" name={`${exercise.id}-${index}`} checked={value[index] === choice} disabled={disabled} onChange={() => set(index, choice)}/>
              <span lang="en">{option}</span>
            </label>)}
          </fieldset>
          {result && <Mark {...result.items[index]}/>}
        </li>)}
      </ol>;
    case 'gap':
      return <>
        {exercise.bank && <p className="training-bank" lang="en"><span className="hint">{t('training.exercise.bank')}</span> {exercise.bank.map((word) => <span key={word} className="company-badge">{word}</span>)}</p>}
        <ol className="training-items">
          {exercise.items.map((item, index) => {
            const [before, after] = item.text.split('___');
            return <li key={index}>
              <label className="training-gap" lang="en">
                <span>{before}</span>
                <input value={String(value[index] ?? '')} disabled={disabled} autoComplete="off" autoCapitalize="off" spellCheck={false}
                  aria-label={t('training.exercise.gapLabel', { n: index + 1 })} onChange={(event) => set(index, event.target.value)}/>
                <span>{after}</span>
              </label>
              {result && <Mark {...result.items[index]}/>}
            </li>;
          })}
        </ol>
      </>;
    case 'order': {
      const lines = value as string[];
      const move = (from: number, to: number) => {
        if (to < 0 || to >= lines.length) return;
        const next = [...lines];
        [next[from], next[to]] = [next[to], next[from]];
        onChange(next);
      };
      return <ol className="training-order">
        {lines.map((line, index) => <li key={line}>
          <span lang="en">{line}</span>
          {!disabled && <span className="training-order-buttons">
            <button type="button" className="quiet" disabled={index === 0} aria-label={t('training.exercise.up', { line: line.slice(0, 40) })} onClick={() => move(index, index - 1)}>↑</button>
            <button type="button" className="quiet" disabled={index === lines.length - 1} aria-label={t('training.exercise.down', { line: line.slice(0, 40) })} onClick={() => move(index, index + 1)}>↓</button>
          </span>}
          {result && <Mark {...result.items[index]}/>}
        </li>)}
      </ol>;
    }
    case 'match':
      return <ol className="training-items">
        {exercise.left.map((left, index) => <li key={left}>
          <label className="training-match">
            <span lang="en">{left}</span>
            <select value={String(value[index] ?? '')} disabled={disabled} onChange={(event) => set(index, event.target.value)}>
              <option value="">{t('training.exercise.choose')}</option>
              {exercise.right.map((right) => <option key={right} value={right} lang="en">{right}</option>)}
            </select>
          </label>
          {result && <Mark {...result.items[index]}/>}
        </li>)}
      </ol>;
  }
}

function Mission({ org, view }: { org: string; view: LessonView }) {
  const t = useAppT(), pick = useLocalized();
  const { mission } = view.lesson;
  const to = mission.kind === 'roleplay' ? `/w/${org}/roleplay?scenario=${mission.code}` : `/w/${org}/writing?template=${mission.code}`;
  return <div className="training-mission">
    <p className="eyebrow">{t(`training.mission.${mission.kind}` as AppKey)}</p>
    {mission.title && <h3>{pick(mission.title)}</h3>}
    <p>{pick(mission.brief)}</p>
    <div className="company-actions">
      <Link className="button-link" to={to}>{mission.kind === 'roleplay' ? t('training.mission.startRoleplay') : t('training.mission.startWriting')}</Link>
      {view.next && <Link className="button-link quiet" to={`/w/${org}/learn/${view.track.code}/${view.next}`}>{t('training.lesson.next')}</Link>}
      <Link className="button-link quiet" to={`/w/${org}/learn?track=${view.track.code}`}>{t('training.lesson.backToTrack')}</Link>
    </div>
  </div>;
}
