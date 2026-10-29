// The test page shared by candidates (/t/:token) and staff (/w/:org/test/:id):
// one section at a time, adaptive stages, reading texts, listening with browser
// speech (two plays), writing with a word count, speaking with speech recognition
// or typing. Answers autosave; the timer follows the server's deadline; integrity
// signals (tab hidden, copy, paste, fullscreen exits, seconds per section) are sent
// with every save.
import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { canRecognize, canSpeak, listen, speakLines, stopSpeaking, type Listener } from './speech.ts';
import type { AnswerValue, AttemptView, Choice, PublicSection, SpokenAnswer } from './types.ts';
import { clock, skillText, useHiringError } from './ui.tsx';

export interface IntegrityState {
  tab_hidden: number; paste: number; copy: number; fullscreen_exit: number;
  section_seconds: Record<string, number>; plays: Record<string, number>;
}
export interface RunnerBody { answers: Record<string, AnswerValue>; integrity: IntegrityState }
export interface Transport {
  /** Autosave; returns a view only when the attempt has ended meanwhile. */
  save: (body: RunnerBody) => Promise<AttemptView | null>;
  next: (body: RunnerBody) => Promise<AttemptView>;
  submit: (body: RunnerBody) => Promise<AttemptView>;
}

const MAX_PLAYS = 2;
const store = {
  read<T>(key: string, fallback: T): T {
    try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
  },
  write(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: keep in memory */ }
  },
};

function editableIds(section: PublicSection | null): string[] {
  if (!section) return [];
  if (section.items) return section.items.map((item) => item.id);
  if (section.passages) return section.passages.flatMap((passage) => passage.questions.map((question) => question.id));
  return (section.tasks ?? []).map((task) => task.id);
}

const answered = (value: AnswerValue | undefined) =>
  typeof value === 'number' ? true : typeof value === 'string' ? value.trim().length > 0 : !!value && value.transcript.trim().length > 0;
const words = (text: string) => (text.trim().match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;

export function TestRunner({ initial, transport, storageKey, onDone }: { initial: AttemptView; transport: Transport; storageKey: string; onDone: (view: AttemptView) => void }) {
  const t = useAppT(), problem = useHiringError();
  const [view, setView] = useState(initial);
  const draftKey = `${storageKey}:draft:${initial.id}`, integrityKey = `${storageKey}:integrity:${initial.id}`;
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => {
    const draft = store.read<Record<string, AnswerValue>>(draftKey, {});
    const ids = new Set(editableIds(initial.section));
    return { ...initial.answers, ...Object.fromEntries(Object.entries(draft).filter(([id]) => ids.has(id))) };
  });
  const integrity = useRef<IntegrityState>(store.read(integrityKey, { tab_hidden: 0, paste: 0, copy: 0, fullscreen_exit: 0, section_seconds: {}, plays: {} }));
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'unanswered' | 'submit' | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(() => Date.now());
  const [announce, setAnnounce] = useState('');
  const dirty = useRef(false), chain = useRef<Promise<unknown>>(Promise.resolve()), finished = useRef(false);
  const sectionStart = useRef(Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const offset = useMemo(() => Date.parse(view.now) - Date.now(), [view.now]);
  const remaining = Math.round((Date.parse(view.deadline_at) - (tick + offset)) / 1000);
  const section = view.section;
  const ids = useMemo(() => editableIds(section), [section]);

  const finish = useCallback((next: AttemptView) => {
    if (finished.current) return;
    finished.current = true;
    stopSpeaking();
    try { localStorage.removeItem(draftKey); localStorage.removeItem(integrityKey); } catch { /* nothing to clean */ }
    onDone(next);
  }, [draftKey, integrityKey, onDone]);

  const body = useCallback((): RunnerBody => {
    const skill = view.sections[view.current]?.skill;
    const seconds = { ...integrity.current.section_seconds };
    if (skill) seconds[skill] = (seconds[skill] ?? 0) + Math.round((Date.now() - sectionStart.current) / 1000);
    return {
      answers: Object.fromEntries(Object.entries(answers).filter(([id]) => ids.includes(id))),
      integrity: { ...integrity.current, section_seconds: seconds },
    };
  }, [answers, ids, view.current, view.sections]);

  const save = useCallback(() => {
    if (finished.current) return chain.current;
    const payload = body();
    dirty.current = false;
    setSaveState('saving');
    chain.current = chain.current.then(async () => {
      try {
        const ended = await transport.save(payload);
        setSaveState('saved');
        if (ended && ended.status !== 'started') finish(ended);
      } catch {
        dirty.current = true;
        setSaveState('error');
      }
    });
    return chain.current;
  }, [body, transport, finish]);

  // Keep a local draft and autosave shortly after each change.
  useEffect(() => {
    store.write(draftKey, answers);
    if (!dirty.current) return;
    const timer = setTimeout(() => void save(), 1200);
    return () => clearTimeout(timer);
  }, [answers, draftKey, save]);
  // Retry failed saves and keep the clock moving.
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(Date.now());
      if (dirty.current && saveState === 'error') void save();
    }, 1000);
    return () => clearInterval(timer);
  }, [save, saveState]);

  const bump = useCallback((key: 'tab_hidden' | 'paste' | 'copy' | 'fullscreen_exit') => {
    integrity.current = { ...integrity.current, [key]: integrity.current[key] + 1 };
    store.write(integrityKey, integrity.current);
    dirty.current = true;
  }, [integrityKey]);

  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') { bump('tab_hidden'); void save(); } };
    const copy = () => bump('copy');
    const paste = () => bump('paste');
    let full = !!document.fullscreenElement;
    const fullscreen = () => { if (full && !document.fullscreenElement) bump('fullscreen_exit'); full = !!document.fullscreenElement; };
    const leaving = (event: BeforeUnloadEvent) => { if (dirty.current && !finished.current) event.preventDefault(); };
    document.addEventListener('visibilitychange', hidden);
    document.addEventListener('copy', copy);
    document.addEventListener('paste', paste);
    document.addEventListener('fullscreenchange', fullscreen);
    addEventListener('beforeunload', leaving);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      document.removeEventListener('copy', copy);
      document.removeEventListener('paste', paste);
      document.removeEventListener('fullscreenchange', fullscreen);
      removeEventListener('beforeunload', leaving);
    };
  }, [bump, save]);

  const move = useCallback(async (kind: 'next' | 'submit') => {
    setBusy(true); setError(''); setConfirm(null);
    try {
      await chain.current;
      const payload = body();
      const next = await (kind === 'next' ? transport.next(payload) : transport.submit(payload));
      integrity.current = { ...integrity.current, section_seconds: payload.integrity.section_seconds };
      store.write(integrityKey, integrity.current);
      dirty.current = false;
      if (next.status !== 'started') { finish(next); return; }
      sectionStart.current = Date.now();
      setView(next);
      setAnswers((current) => ({ ...current, ...next.answers }));
      setSaveState('idle');
      scrollTo(0, 0);
      queueMicrotask(() => heading.current?.focus());
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }, [body, transport, integrityKey, finish, problem]);

  // Time is up: submit what we have (the server accepts it during a short grace period).
  useEffect(() => {
    if (remaining === 300) setAnnounce(t('hiring.run.fiveMinutes'));
    if (remaining === 60) setAnnounce(t('hiring.run.oneMinute'));
    if (remaining <= 0 && !busy && !finished.current) void move('submit');
  }, [remaining <= 0, remaining === 300, remaining === 60]); // eslint-disable-line react-hooks/exhaustive-deps

  const setAnswer = (id: string, value: AnswerValue) => {
    dirty.current = true;
    setAnswers((current) => ({ ...current, [id]: value }));
  };
  const played = (id: string) => Math.max(view.plays[id] ?? 0, integrity.current.plays[id] ?? 0);
  const onPlay = (id: string) => {
    integrity.current = { ...integrity.current, plays: { ...integrity.current.plays, [id]: played(id) + 1 } };
    store.write(integrityKey, integrity.current);
    dirty.current = true;
    void save();
  };

  if (!section) return <p role="status">{t('app.loading')}</p>;
  const lastSection = view.current === view.sections.length - 1;
  const lastStage = !section.items || (section.stage ?? 1) >= (section.stages ?? 1);
  const isLast = lastSection && lastStage;
  const missing = ids.filter((id) => !answered(answers[id])).length;
  const go = () => {
    if (missing && !confirm) { setConfirm('unanswered'); return; }
    if (isLast && confirm !== 'submit') { setConfirm('submit'); return; }
    void move(isLast ? 'submit' : 'next');
  };

  return <div className="hiring-run">
    <div className="hiring-run-bar">
      <ol className="hiring-steps" aria-label={t('hiring.run.sections')}>
        {view.sections.map((entry, index) => <li key={entry.skill} className={entry.status} aria-current={index === view.current ? 'step' : undefined}>
          <span>{skillText(t, entry.skill)}</span>
        </li>)}
      </ol>
      <div className="hiring-run-meta">
        <span className={`hiring-timer${remaining <= 300 ? ' low' : ''}`}>
          <span className="visually-hidden">{t('hiring.run.timeLeft')}</span>
          <span aria-hidden="true">⏱ </span>{remaining <= 0 ? t('hiring.run.timeUp') : clock(remaining)}
        </span>
        <span className={`hiring-save ${saveState}`} role="status">{saveState === 'saving' ? t('hiring.run.saving') : saveState === 'saved' ? t('hiring.run.saved') : saveState === 'error' ? t('hiring.run.saveFailed') : ''}</span>
        {typeof document !== 'undefined' && document.fullscreenEnabled && !document.fullscreenElement && <button type="button" className="quiet hiring-small" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>{t('hiring.run.fullscreen')}</button>}
      </div>
    </div>
    <p className="visually-hidden" role="status" aria-live="assertive">{announce}</p>

    <section className="hiring-section" aria-labelledby="hiring-section-title">
      <p className="eyebrow">{t('hiring.run.section', { index: view.current + 1, total: view.sections.length })}{section.items ? ` · ${t('hiring.run.stage', { stage: section.stage ?? 1, stages: section.stages ?? 1 })}` : ''}</p>
      <h1 id="hiring-section-title" ref={heading} tabIndex={-1}>{skillText(t, section.skill)}</h1>
      <p className="hiring-instruction">{t(`hiring.run.intro.${section.skill}` as AppKey)}</p>

      {section.items && <div className="hiring-questions">
        {section.items.map((item, index) => <ChoiceQuestion key={item.id} item={item} number={index + 1} value={answers[item.id]} onChange={(value) => setAnswer(item.id, value)}/>)}
      </div>}

      {section.passages?.map((passage) => <div key={passage.id} className="hiring-passage-block">
        {passage.text !== undefined
          ? <article className="hiring-passage" aria-label={passage.title}>
            <h2>{passage.title}</h2>
            {passage.text.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </article>
          : <ListeningPlayer title={passage.title} lines={passage.lines ?? []} played={played(passage.id)} onPlay={() => onPlay(passage.id)}/>}
        <div className="hiring-questions">
          {passage.questions.map((question, index) => <ChoiceQuestion key={question.id} item={question} number={index + 1} value={answers[question.id]} onChange={(value) => setAnswer(question.id, value)}/>)}
        </div>
      </div>)}

      {section.tasks?.map((task, index) => section.skill === 'writing'
        ? <WritingTask key={task.id} number={index + 1} task={task} value={typeof answers[task.id] === 'string' ? answers[task.id] as string : ''} onChange={(value) => setAnswer(task.id, value)}/>
        : <SpeakingTask key={task.id} number={index + 1} task={task} value={typeof answers[task.id] === 'object' ? answers[task.id] as SpokenAnswer : null} onChange={(value) => setAnswer(task.id, value)}/>)}

      {confirm && <div className="hiring-confirm" role="alertdialog" aria-labelledby="hiring-confirm-text">
        <p id="hiring-confirm-text">{confirm === 'unanswered' ? t('hiring.run.unanswered', { count: missing }) : t('hiring.run.submitConfirm')}</p>
        <div className="company-actions">
          <button type="button" disabled={busy} onClick={() => {
            if (confirm === 'unanswered' && isLast) setConfirm('submit');
            else void move(isLast ? 'submit' : 'next');
          }}>{confirm === 'submit' ? t('hiring.run.submit') : t('hiring.run.confirmContinue')}</button>
          <button type="button" className="quiet" onClick={() => setConfirm(null)}>{t('hiring.run.goBack')}</button>
        </div>
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
      {!confirm && <div className="hiring-run-actions">
        <button type="button" disabled={busy} onClick={go}>{busy ? t('hiring.run.working') : isLast ? t('hiring.run.submit') : lastStage ? t('hiring.run.nextSection') : t('hiring.run.next')}</button>
        <span className="hiring-muted">{t('hiring.run.answered', { done: ids.length - missing, total: ids.length })}</span>
      </div>}
    </section>
  </div>;
}

/** The prompt with its gap drawn as a line. */
function Prompt({ text }: { text: string }) {
  const parts = text.split('___');
  if (parts.length === 1) return <>{text}</>;
  return <>{parts.map((part, index) => <React.Fragment key={index}>{part}{index < parts.length - 1 && <span className="hiring-gap" aria-label="—">&nbsp;</span>}</React.Fragment>)}</>;
}

function ChoiceQuestion({ item, number, value, onChange }: { item: Choice; number: number; value: AnswerValue | undefined; onChange: (value: number) => void }) {
  const t = useAppT();
  return <fieldset className="hiring-choice">
    <legend><span className="hiring-number">{t('hiring.run.question', { n: number })}</span> <Prompt text={item.prompt}/></legend>
    <div className="hiring-options">
      {item.options.map((option, index) => <label key={index} className={value === index ? 'chosen' : ''}>
        <input type="radio" name={item.id} checked={value === index} onChange={() => onChange(index)}/>
        <span>{option}</span>
      </label>)}
    </div>
  </fieldset>;
}

function ListeningPlayer({ title, lines, played, onPlay }: { title: string; lines: { speaker: string; text: string }[]; played: number; onPlay: () => void }) {
  const t = useAppT();
  const [playing, setPlaying] = useState(false);
  const stopped = useRef(false);
  useEffect(() => () => { stopped.current = true; stopSpeaking(); }, []);
  const left = Math.max(0, MAX_PLAYS - played);
  if (!canSpeak()) {
    return <article className="hiring-passage hiring-script" aria-label={title}>
      <h2>{title}</h2>
      <p className="hint">{t('hiring.run.noAudio')}</p>
      {lines.map((line, index) => <p key={index}><strong>{line.speaker}:</strong> {line.text}</p>)}
    </article>;
  }
  const speakers = [...new Set(lines.map((line) => line.speaker))];
  return <div className="hiring-player">
    <h2>{title}</h2>
    <p className="hint">{t('hiring.run.speakers', { names: speakers.join(', ') })}</p>
    <div className="company-actions">
      <button type="button" disabled={playing || left === 0} onClick={() => {
        stopped.current = false;
        setPlaying(true);
        onPlay();
        void speakLines(lines, () => stopped.current).finally(() => setPlaying(false));
      }}>{playing ? t('hiring.run.playing') : played ? t('hiring.run.playAgain') : t('hiring.run.play')}</button>
      {playing && <button type="button" className="quiet" onClick={() => { stopped.current = true; stopSpeaking(); setPlaying(false); }}>{t('hiring.run.stopAudio')}</button>}
      <span className={`company-badge ${left ? '' : 'warn'}`} role="status">{left ? t('hiring.run.playsLeft', { count: left }) : t('hiring.run.noPlays')}</span>
    </div>
    {playing && <div className="hiring-wave" aria-hidden="true"><i/><i/><i/><i/><i/></div>}
  </div>;
}

function TaskCard({ number, task, children, label }: { number: number; task: { prompt: string; points: string[] }; children: ReactNode; label: string }) {
  const t = useAppT();
  return <div className="hiring-task">
    <h2>{label} {number}</h2>
    <p className="hiring-task-prompt">{task.prompt}</p>
    {task.points.length > 0 && <>
      <p className="hiring-task-points-label">{t('hiring.run.points')}</p>
      <ul className="hiring-task-points">{task.points.map((point) => <li key={point}>{point}</li>)}</ul>
    </>}
    {children}
  </div>;
}

function WritingTask({ number, task, value, onChange }: { number: number; task: { id: string; prompt: string; points: string[]; target: number }; value: string; onChange: (value: string) => void }) {
  const t = useAppT();
  const count = words(value);
  return <TaskCard number={number} task={task} label={t('hiring.run.task')}>
    <label>{t('hiring.run.writeHere')}
      <textarea className="hiring-writing" rows={12} maxLength={6000} spellCheck={false} autoCorrect="off" autoCapitalize="sentences" value={value} onChange={(event) => onChange(event.target.value)}/>
    </label>
    <p className={`hiring-count${count >= task.target ? ' ok' : ''}`} aria-live="polite">{t('hiring.run.wordCount', { count })} · {t('hiring.run.wordTarget', { count: task.target })}</p>
  </TaskCard>;
}

function SpeakingTask({ number, task, value, onChange }: { number: number; task: { id: string; prompt: string; points: string[]; target: number }; value: SpokenAnswer | null; onChange: (value: SpokenAnswer) => void }) {
  const t = useAppT();
  const supported = canRecognize();
  const [mode, setMode] = useState<'speech' | 'typed'>(value?.mode ?? (supported ? 'speech' : 'typed'));
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState('');
  const listener = useRef<Listener | null>(null);
  const transcript = value?.transcript ?? '';
  useEffect(() => () => listener.current?.stop(), []);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  const start = (keep: boolean) => {
    setProblem('');
    setSeconds(keep ? seconds : 0);
    const started = listen({
      onText: (text) => onChange({ transcript: text, mode: 'speech' }),
      onEnd: (error) => {
        setRecording(false);
        listener.current = null;
        if (error && error !== 'no-speech' && error !== 'aborted') setProblem(t('hiring.run.micError', { error }));
      },
    }, keep ? transcript : '');
    if (!started) { setMode('typed'); return; }
    if (!keep) onChange({ transcript: '', mode: 'speech' });
    listener.current = started;
    setRecording(true);
  };
  return <TaskCard number={number} task={task} label={t('hiring.run.speakingTask')}>
    <p className="hint">{t('hiring.run.speakFor', { seconds: task.target })} · {t('hiring.run.transcriptBased')}</p>
    {mode === 'speech' ? <div className="hiring-speak">
      <div className="company-actions">
        {recording
          ? <button type="button" onClick={() => listener.current?.stop()}>{t('hiring.run.stop')}</button>
          : <button type="button" onClick={() => start(false)}>{transcript ? t('hiring.run.recordAgain') : t('hiring.run.record')}</button>}
        {!recording && transcript && <button type="button" className="quiet" onClick={() => start(true)}>{t('hiring.run.continueSpeaking')}</button>}
        {!recording && <button type="button" className="quiet" onClick={() => { setMode('typed'); onChange({ transcript, mode: 'typed' }); }}>{t('hiring.run.typeInstead')}</button>}
        {recording && <span className="hiring-rec" role="status"><i aria-hidden="true"/> {t('hiring.run.recording')} {clock(seconds)}</span>}
      </div>
      <div className="hiring-transcript" aria-live="polite">
        <span className="hiring-task-points-label">{t('hiring.run.transcript')}</span>
        <p>{transcript || <span className="hiring-muted">{t('hiring.run.transcriptEmpty')}</span>}</p>
      </div>
      {problem && <p className="error" role="alert">{problem}</p>}
    </div> : <div className="hiring-speak">
      {!supported && <p className="hint">{t('hiring.run.noRecognition')}</p>}
      <label>{t('hiring.run.typed')}
        <textarea rows={6} maxLength={6000} value={transcript} onChange={(event) => onChange({ transcript: event.target.value, mode: 'typed' })}/>
      </label>
      <p className="hiring-count">{t('hiring.run.wordCount', { count: words(transcript) })}</p>
      {supported && <button type="button" className="quiet" onClick={() => setMode('speech')}>{t('hiring.run.useMic')}</button>}
    </div>}
  </TaskCard>;
}
