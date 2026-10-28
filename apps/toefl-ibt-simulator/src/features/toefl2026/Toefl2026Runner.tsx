import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppT } from '../../i18n';
import { audioPlaybackEvent } from '../../lib/platformClient';
import {
  AcademicPassage,
  BuildSentence,
  buildSentenceAnswered,
  ChoiceQuestion,
  choiceAnswered,
  CompleteWords,
  completeWordsAnswered,
  DailyText,
  DiscussionTask,
  EmailTask,
  PlayOnceAudio,
} from './renderers';
import { SpeakingItem } from './SpeakingItem';
import { canRecognize } from './speech';
import { isRecord, TASK_TYPE_DISCUSSION, TOEFL_2026_TIMING } from './tasks';
import './toefl2026.css';

type Json = Record<string, unknown>;
export type RunnerUnit = {
  id: string;
  partId: string;
  partName?: string | null;
  partOrder?: number | null;
  type: string;
  data: Json;
  displayOrder: number;
  metadata?: Json | null;
};
type SectionRow = { id: string; name: string; display_order: number; metadata: Json | null };

type ScreenKind = 'reading' | 'listening' | 'bs' | 'email' | 'discussion' | 'speaking';
type Screen = { key: string; kind: ScreenKind; group: string; stimulus: RunnerUnit | null; questions: RunnerUnit[] };

const lsGet = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const lsSet = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
};

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const buildScreens = (units: RunnerUnit[]): Screen[] => {
  const parts = new Map<string, RunnerUnit[]>();
  const order: string[] = [];
  const sorted = [...units].sort((a, b) => (a.partOrder ?? 0) - (b.partOrder ?? 0) || a.displayOrder - b.displayOrder);
  for (const u of sorted) {
    if (!parts.has(u.partId)) { parts.set(u.partId, []); order.push(u.partId); }
    parts.get(u.partId)!.push(u);
  }
  const screens: Screen[] = [];
  for (const partId of order) {
    const list = parts.get(partId)!;
    const questions = list.filter((u) => u.type.startsWith('question_'));
    const audio = list.find((u) => u.type === 'audio') ?? null;
    const passage = list.find((u) => u.type === 'reading_passage') ?? null;
    const bs = questions.filter((u) => u.type === 'question_build_sentence');
    const speaking = questions.filter((u) => u.type === 'question_speaking_repeat' || u.type === 'question_speaking_interview');
    if (bs.length) {
      bs.forEach((u) => screens.push({ key: u.id, kind: 'bs', group: `bs:${partId}`, stimulus: null, questions: [u] }));
    } else if (speaking.length) {
      speaking.forEach((u) => screens.push({ key: u.id, kind: 'speaking', group: `speaking:${partId}`, stimulus: null, questions: [u] }));
    } else if (questions.length === 1 && questions[0].type === 'question_text') {
      const taskType = String(questions[0].data.task_type ?? '');
      screens.push({ key: questions[0].id, kind: taskType === TASK_TYPE_DISCUSSION ? 'discussion' : 'email', group: `text:${partId}`, stimulus: null, questions });
    } else if (audio) {
      screens.push({ key: partId, kind: 'listening', group: `part:${partId}`, stimulus: audio, questions });
    } else if (questions.length) {
      screens.push({ key: partId, kind: 'reading', group: `part:${partId}`, stimulus: passage, questions });
    }
  }
  return screens;
};

const unitAnswered = (u: RunnerUnit, value: unknown): boolean => {
  if (value == null) return false;
  if (u.type === 'question_single_choice') return choiceAnswered(value);
  if (u.type === 'question_complete_words') { const c = completeWordsAnswered(u.data, value); return c.done === c.total && c.total > 0; }
  if (u.type === 'question_build_sentence') return buildSentenceAnswered(value);
  if (u.type === 'question_text') return isRecord(value) && String(value.text ?? '').trim().length > 0;
  if (u.type.startsWith('question_speaking')) return isRecord(value) && typeof value.transcript === 'string';
  return false;
};

/** Counts scorable items the way ETS counts them (each Complete the Words blank is one item). */
const itemCount = (u: RunnerUnit): number =>
  u.type === 'question_complete_words' ? (Array.isArray(u.data.blanks) ? (u.data.blanks as unknown[]).length : 0) : 1;

export const Toefl2026Runner: React.FC<{
  sessionId: string;
  section: SectionRow;
  sections: SectionRow[];
  units: RunnerUnit[];
  answers: Record<string, unknown>;
  onAnswer: (unit: RunnerUnit, value: unknown, immediate?: boolean) => void;
  onSubmit: () => void;
  submitting: boolean;
  readOnly: boolean;
  timeLeftSeconds: number | null;
  isLastSection: boolean;
  accessToken: string | null;
  isCandidate: boolean;
  onLeave: () => void;
  banners?: React.ReactNode;
  experienceName?: string | null;
}> = ({ sessionId, section, sections, units, answers, onAnswer, onSubmit, submitting, readOnly, timeLeftSeconds, isLastSection, accessToken, isCandidate, onLeave, banners, experienceName }) => {
  const t = useAppT();
  const meta = (section.metadata ?? {}) as Json;
  const sectionType = String(meta.type ?? '');
  const isPractice = typeof meta.practice_task === 'string';
  const moduleRole = String(meta.toefl_module ?? '');
  const screens = useMemo(() => buildScreens(units), [units]);
  const posKey = `toefl26:pos:${sessionId}:${section.id}`;
  const [index, setIndex] = useState<number>(() => Math.min(lsGet<number>(posKey, 0), Math.max(0, screens.length)));
  const listenedKey = `toefl26:listened:${sessionId}:${section.id}`;
  const [listened, setListened] = useState<Record<string, true>>(() => lsGet(listenedKey, {}));
  const [gestureGiven, setGestureGiven] = useState(false);
  const [recordings, setRecordings] = useState<Array<{ id: string; url: string; label: string }>>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [showText, setShowText] = useState(true);
  const sttSupported = useMemo(() => canRecognize(), []);
  const atEnd = index >= screens.length;
  const screen = atEnd ? null : screens[index];

  useEffect(() => { lsSet(posKey, index); }, [index, posKey]);
  useEffect(() => { lsSet(listenedKey, listened); }, [listened, listenedKey]);
  useEffect(() => { if (index > screens.length) setIndex(screens.length); }, [index, screens.length]);
  useEffect(() => { window.scrollTo?.(0, 0); setShowText(true); }, [index]);

  // Writing task timers (full test only): Build a Sentence block, Email, Academic Discussion.
  const groupSeconds = useCallback((s: Screen | null): number | null => {
    if (!s || isPractice || sectionType !== 'writing') return null;
    if (s.kind === 'bs') return TOEFL_2026_TIMING.writing.build_sentence_seconds;
    const v = Number(s.questions[0]?.data.task_seconds);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [isPractice, sectionType]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const groupLimit = groupSeconds(screen);
  const groupStartKey = screen ? `toefl26:task:${sessionId}:${screen.group}` : '';
  const groupStart = useMemo(() => {
    if (!screen || groupLimit == null) return null;
    const existing = lsGet<number | null>(groupStartKey, null);
    if (existing) return existing;
    const started = Date.now();
    lsSet(groupStartKey, started);
    return started;
  }, [groupStartKey, groupLimit, screen]);
  const taskLeft = groupStart != null && groupLimit != null ? Math.max(0, groupLimit - Math.floor((now - groupStart) / 1000)) : null;

  const nextGroupIndex = useCallback((from: number) => {
    const group = screens[from]?.group;
    let i = from;
    while (i < screens.length && screens[i].group === group) i += 1;
    return i;
  }, [screens]);

  useEffect(() => {
    if (taskLeft !== 0 || !screen) return;
    setNotice(t('runner.time_up'));
    setIndex(nextGroupIndex(index));
  }, [taskLeft, screen, index, nextGroupIndex, t]);

  const canGoBack = (() => {
    if (index === 0 || readOnly) return false;
    if (sectionType === 'listening' || sectionType === 'speaking') return false;
    if (sectionType === 'writing') {
      if (atEnd || screen?.kind !== 'bs') return false;
      return screens[index - 1]?.group === screen.group;
    }
    return true;
  })();

  const listeningLocked = screen?.kind === 'listening' && !listened[screen.key] && !(screen.stimulus?.data.locked === true);
  const goNext = () => { setNotice(null); setIndex((i) => Math.min(screens.length, i + 1)); };

  const audioEvent = (unitId: string, event: 'start' | 'end', duration: number | null) => {
    if (!accessToken) return;
    void audioPlaybackEvent(accessToken, { session_id: sessionId, content_unit_id: unitId, event, duration_seconds: duration }).catch(() => undefined);
  };

  const totals = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const s of screens) for (const q of s.questions) {
      if (q.type === 'question_complete_words') {
        const c = completeWordsAnswered(q.data, answers[q.id]);
        done += c.done;
        total += c.total;
      } else {
        total += itemCount(q);
        if (unitAnswered(q, answers[q.id])) done += 1;
      }
    }
    return { done, total };
  }, [screens, answers]);

  const sectionLabel = sectionType === 'reading' ? t('section.reading') : sectionType === 'listening' ? t('section.listening') : sectionType === 'writing' ? t('section.writing') : sectionType === 'speaking' ? t('section.speaking') : section.name;
  const moduleLabel = moduleRole === 'router' ? t('section.module_router') : moduleRole === 'second' ? t('section.module_second') : null;
  let qNumber = 0;
  const numberFor = (s: Screen, u: RunnerUnit) => {
    qNumber = 0;
    for (let i = 0; i < screens.length; i += 1) {
      for (const q of screens[i].questions) {
        if (q.type === 'question_single_choice') qNumber += 1;
        if (screens[i] === s && q.id === u.id) return qNumber;
      }
    }
    return qNumber;
  };

  const renderQuestions = (s: Screen) => s.questions.map((q) => {
    if (q.type === 'question_complete_words') {
      return <CompleteWords key={q.id} data={q.data} value={answers[q.id]} readOnly={readOnly} onChange={(v) => onAnswer(q, v)} />;
    }
    if (q.type === 'question_single_choice') {
      return <ChoiceQuestion key={q.id} id={q.id} data={q.data} number={numberFor(s, q)} value={answers[q.id]} readOnly={readOnly} onChange={(v) => onAnswer(q, v)} />;
    }
    return null;
  });

  const body = (() => {
    if (!screen) {
      return (
        <div className="t26-card t26-end" data-testid="section-end">
          <h2>{t('runner.section_done_title')}</h2>
          <p>{t('runner.section_done_body', { done: totals.done, total: totals.total })}</p>
          {totals.done < totals.total ? <p className="t26-warn">{t('runner.unanswered_warning')}</p> : null}
          {recordings.length > 0 ? (
            <div className="t26-recordings">
              <p className="t26-strong">{t('speak.my_answers')}</p>
              {recordings.map((r) => (
                <div key={r.id} className="t26-recording"><span>{r.label}</span><audio controls src={r.url} preload="none" /></div>
              ))}
            </div>
          ) : null}
          <button type="button" className="t26-button" disabled={submitting} onClick={onSubmit} data-testid="submit-section">
            {submitting ? t('runner.saving') : isLastSection ? t('runner.finish_test') : t('runner.submit_section')}
          </button>
        </div>
      );
    }
    if (screen.kind === 'bs') {
      const q = screen.questions[0];
      return <BuildSentence key={q.id} data={q.data} value={answers[q.id]} readOnly={readOnly} onChange={(v) => onAnswer(q, v)} />;
    }
    if (screen.kind === 'email' || screen.kind === 'discussion') {
      const q = screen.questions[0];
      const Task = screen.kind === 'email' ? EmailTask : DiscussionTask;
      return <Task key={q.id} data={q.data} value={answers[q.id]} readOnly={readOnly} onChange={(v) => onAnswer(q, v)} />;
    }
    if (screen.kind === 'speaking') {
      const q = screen.questions[0];
      const first = !gestureGiven;
      return (
        <>
          {!sttSupported ? <div className="t26-warn" role="alert">{t('speak.no_stt')}</div> : null}
          <SpeakingItem
            key={q.id}
            unitId={q.id}
            type={q.type}
            data={q.data}
            value={answers[q.id]}
            readOnly={readOnly}
            needsGesture={first}
            onAnswer={(a) => { setGestureGiven(true); onAnswer(q, a, true); }}
            onRecording={(url) => {
              setGestureGiven(true);
              if (url) setRecordings((list) => [...list, { id: q.id, url, label: `${String(q.data.index ?? '')}. ${q.type === 'question_speaking_repeat' ? t('task.listen_repeat') : t('task.take_interview')}` }]);
            }}
            onAudioEvent={(e, d) => { setGestureGiven(true); audioEvent(q.id, e, d); }}
            onDone={goNext}
          />
          {isRecord(answers[q.id]) ? <button type="button" className="t26-button" onClick={goNext}>{t('common.next')}</button> : null}
        </>
      );
    }
    if (screen.kind === 'listening') {
      const audio = screen.stimulus!;
      const done = !listeningLocked;
      const speakers = Array.isArray(audio.data.speakers) ? (audio.data.speakers as unknown[]).length : 1;
      return (
        <div className="t26-listening" data-testid="listening-screen">
          <div className="t26-card t26-speakers">
            <span className="t26-people" aria-hidden="true">{Array.from({ length: Math.max(1, speakers) }, (_, i) => <span key={i} className="t26-person" />)}</span>
            <p>{String(audio.data.context ?? t('listen.once'))}</p>
            <PlayOnceAudio
              key={audio.id}
              url={typeof audio.data.url === 'string' ? audio.data.url : null}
              locked={audio.data.locked === true || Boolean(listened[screen.key])}
              autoStart
              onStart={(d) => audioEvent(audio.id, 'start', d)}
              onEnded={() => { audioEvent(audio.id, 'end', null); setListened((m) => ({ ...m, [screen.key]: true })); }}
            />
          </div>
          {done ? <div className="t26-questions">{renderQuestions(screen)}</div> : <p className="t26-muted">{t('listen.questions_after')}</p>}
        </div>
      );
    }
    // reading
    const stimulus = screen.stimulus;
    const isAcademic = stimulus && stimulus.data.toefl_stimulus === 'academic_passage';
    return (
      <div className={stimulus ? 't26-split' : ''} data-testid="reading-screen">
        {stimulus ? (
          <div className="t26-split-text">
            <button type="button" className="t26-link-button t26-mobile-only" onClick={() => setShowText((v) => !v)} aria-expanded={showText}>
              {showText ? t('runner.hide_text') : t('runner.show_text')}
            </button>
            {showText ? (isAcademic ? <AcademicPassage data={stimulus.data} /> : <DailyText data={stimulus.data} />) : null}
          </div>
        ) : null}
        <div className="t26-questions">{renderQuestions(screen)}</div>
      </div>
    );
  })();

  const firstOfSection = sections.findIndex((s) => s.id === section.id) + 1;
  const sectionTime = timeLeftSeconds != null ? clock(timeLeftSeconds) : '--:--';
  const lowTime = timeLeftSeconds != null && timeLeftSeconds <= 60;
  const nextDisabled = submitting || listeningLocked || (screen?.kind === 'speaking' && !isRecord(answers[screen.questions[0].id]));
  const nextRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="t26-root" data-testid="toefl2026-runner" data-section={sectionType}>
      {banners}
      <header className="t26-top">
        <div className="t26-top-title">
          <span className="t26-brand">TOEFL iBT</span>
          <span className="t26-top-section">{sectionLabel}{moduleLabel ? ` · ${moduleLabel}` : ''}</span>
          <span className="t26-top-sub t26-desktop-only">{experienceName ?? ''}</span>
        </div>
        <div className="t26-top-timers">
          {taskLeft != null ? <span className="t26-timer" title={t('runner.task_time')}>{t('runner.task_time')}: {clock(taskLeft)}</span> : null}
          <span className={`t26-timer${lowTime ? ' is-low' : ''}`} title={t('runner.section_time')} data-testid="section-timer">{sectionTime}</span>
        </div>
        <div className="t26-top-actions">
          {isCandidate ? <button type="button" className="t26-button-secondary" onClick={onLeave}>{t('runner.leave')}</button> : null}
          {canGoBack ? <button type="button" className="t26-button-secondary" onClick={() => { setNotice(null); setIndex((i) => Math.max(0, i - 1)); }}>{t('common.back')}</button> : null}
          {!atEnd ? (
            <button ref={nextRef} type="button" className="t26-button" disabled={nextDisabled} onClick={goNext} data-testid="next">
              {t('common.next')}
            </button>
          ) : null}
        </div>
      </header>
      <div className="t26-progress" aria-hidden="true"><span style={{ width: `${screens.length ? Math.round((Math.min(index, screens.length) / screens.length) * 100) : 0}%` }} /></div>
      <main className="t26-main">
        {notice ? <div className="t26-notice" role="status">{notice}</div> : null}
        {moduleRole === 'second' && index === 0 ? <p className="t26-muted">{t('runner.adaptive_note')}</p> : null}
        {(sectionType === 'listening' || sectionType === 'speaking') && index === 0 ? <p className="t26-muted">{t('runner.no_back')}</p> : null}
        {body}
      </main>
      <footer className="t26-foot">
        <span>{t('runner.screen_of', { current: Math.min(index + 1, screens.length), total: screens.length })}</span>
        <span>{t('runner.answered', { done: totals.done, total: totals.total })}</span>
        <span className="t26-desktop-only">{sectionLabel} {firstOfSection}/{sections.length}</span>
      </footer>
    </div>
  );
};
