import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { ApiError } from '../../lib/api';
import {
  type ExamSection,
  itemKeys,
  type MockResult,
  type MockView,
  type OpenSection,
  openExamSection,
  readDraft,
  type SectionResult,
  submitExamSection,
  writeDraft,
} from '../../lib/exam';
import { Loading, Panel, useErrorMessage } from '../../ui/kit';
import { SectionResultView } from './ExamResults';
import { ListeningSection, ReadingSection } from './ObjectiveSections';
import { type SpeakingDraft, SpeakingSection, type WritingDraft, WritingSection } from './ProductiveSections';
import { TimerBar, useCountdown } from './parts';

type Timing = { seconds: Record<ExamSection, number>; speaking_talk: number[]; speaking_prep: number[] };

type Draft = {
  objective: Record<string, string>;
  plays: Record<string, number>;
  writing: WritingDraft;
  speaking: SpeakingDraft;
};

const emptyDraft = (): Draft => ({
  objective: {},
  plays: {},
  writing: { task11: '', task12: '', part2: '' },
  speaking: Array.from({ length: 8 }, () => ({ text: '', seconds: 0 })),
});

/** One open section: its content, the clock and the hand-in. */
const SectionRunner = ({ open, timing, onDone }: { open: OpenSection; timing: Timing; onDone: (response: { section_result: SectionResult; finished: boolean; result: MockResult | null }) => void }) => {
  const t = useT();
  const errorText = useErrorMessage();
  const draftKey = `${open.mock_id}:${open.section}`;
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft(), ...readDraft<Partial<Draft>>(draftKey, {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => { writeDraft(draftKey, draft); }, [draftKey, draft]);

  const answersFor = (current: Draft): unknown => {
    if (open.section === 'writing') return current.writing;
    if (open.section === 'speaking') {
      return current.speaking.map((answer) => ({ text: answer.text, mode: answer.seconds > 0 ? 'speech' : 'typed', seconds: answer.seconds > 0 ? answer.seconds : null }));
    }
    return current.objective;
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await submitExamSection(open.mock_id, open.section, answersFor(draftRef.current));
      writeDraft(draftKey, null);
      onDone(response);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status >= 400 && cause.status < 600 && cause.message.length < 200 ? cause.message : errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const left = useCountdown(open.started_at, open.seconds, () => { void submit(); });
  const unanswered = open.section === 'reading' || open.section === 'listening'
    ? open.content.parts.flatMap(itemKeys).filter((key) => !(draft.objective[key] ?? '').trim()).length
    : 0;

  const setObjective = (key: string, value: string) => setDraft((current) => ({ ...current, objective: { ...current.objective, [key]: value } }));

  return (
    <div className="en-stack">
      <TimerBar left={left} label={t(`exam.section.${open.section}`)} onSubmit={() => void submit()} busy={busy} submitLabel={t('exam.submitSection')} />
      {error ? <div className="error" role="alert">{error}</div> : null}
      {open.section === 'reading' ? <ReadingSection parts={open.content.parts} answers={draft.objective} onAnswer={setObjective} result={null} /> : null}
      {open.section === 'listening' ? (
        <ListeningSection
          parts={open.content.parts}
          answers={draft.objective}
          onAnswer={setObjective}
          plays={draft.plays}
          onPlayed={(id) => setDraft((current) => ({ ...current, plays: { ...current.plays, [id]: (current.plays[id] ?? 0) + 1 } }))}
          result={null}
        />
      ) : null}
      {open.section === 'writing' ? (
        <WritingSection content={open.content} draft={draft.writing} disabled={busy} onChange={(task, text) => setDraft((current) => ({ ...current, writing: { ...current.writing, [task]: text } }))} />
      ) : null}
      {open.section === 'speaking' ? (
        <SpeakingSection
          content={open.content}
          draft={draft.speaking}
          talkSeconds={timing.speaking_talk}
          prepSeconds={timing.speaking_prep}
          disabled={busy}
          onFinished={() => void submit()}
          onChange={(index, patch) => setDraft((current) => ({ ...current, speaking: current.speaking.map((answer, i) => (i === index ? { ...answer, ...patch } : answer)) }))}
        />
      ) : null}
      {open.section !== 'speaking' ? (
        <div className="en-actions">
          {unanswered ? <span className="hint">{t('exam.unanswered', { count: unanswered })}</span> : null}
          <button type="button" disabled={busy} onClick={() => void submit()}>{busy ? t('exam.submitting') : t('exam.submitSection')}</button>
        </div>
      ) : null}
    </div>
  );
};

/**
 * A mock from start to finish: sections in the exam's order (listening,
 * reading, writing, speaking), each opened when the learner is ready, then the
 * section result, then the next one.
 */
export const ExamRunner = ({ mock, timing, onFinished, onLeave }: { mock: MockView; timing: Timing; onFinished: (result: MockResult) => void; onLeave: () => void }) => {
  const t = useT();
  const errorText = useErrorMessage();
  const [done, setDone] = useState<Partial<Record<ExamSection, { score: number | null }>>>(() =>
    Object.fromEntries(mock.sections.filter((entry) => entry.done).map((entry) => [entry.section, { score: entry.score }])));
  const [open, setOpen] = useState<OpenSection | null>(null);
  const [opening, setOpening] = useState(false);
  const [last, setLast] = useState<{ result: SectionResult; open: OpenSection } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const next = mock.sections.find((entry) => !done[entry.section])?.section ?? null;

  const begin = async (section: ExamSection) => {
    setOpening(true);
    setError(null);
    try {
      setOpen(await openExamSection(mock.id, section));
      setLast(null);
      window.scrollTo({ top: 0 });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setOpening(false);
    }
  };

  const steps = (
    <ol className="en-exam-steps" aria-label={t('exam.runner.sections')}>
      {mock.sections.map((entry) => (
        <li key={entry.section} className={done[entry.section] ? 'is-done' : ''} aria-current={open?.section === entry.section ? 'step' : undefined}>
          {t(`exam.section.${entry.section}`)}{done[entry.section]?.score !== undefined && done[entry.section]?.score !== null ? ` · ${done[entry.section]!.score}` : ''}
        </li>
      ))}
    </ol>
  );

  if (open) {
    return (
      <div className="en-stack">
        {steps}
        <SectionRunner
          key={`${open.mock_id}:${open.section}`}
          open={open}
          timing={timing}
          onDone={(response) => {
            setDone((current) => ({ ...current, [open.section]: { score: response.section_result.score } }));
            setLast({ result: response.section_result, open });
            setOpen(null);
            window.scrollTo({ top: 0 });
            if (response.finished && response.result) onFinished(response.result);
          }}
        />
      </div>
    );
  }

  const intro = next ? (
    <Panel title={t('exam.runner.next', { section: t(`exam.section.${next}`) })}>
      <div className="en-stack">
        <p style={{ margin: 0 }}>{t(`exam.intro.${next}`)}</p>
        <p className="hint" style={{ margin: 0 }}>{t('exam.runner.time', { minutes: Math.round(timing.seconds[next] / 60) })}</p>
        <p className="hint" style={{ margin: 0 }}>{t('exam.styleNote')}</p>
        {error ? <div className="error" role="alert">{error}</div> : null}
        <div className="en-actions">
          <button type="button" className="is-large" disabled={opening} onClick={() => void begin(next)}>{opening ? t('exam.opening') : t('exam.runner.start')}</button>
          <button type="button" className="quiet" onClick={onLeave}>{t('exam.runner.later')}</button>
        </div>
      </div>
    </Panel>
  ) : null;

  return (
    <div className="en-stack">
      {steps}
      {last ? (
        <Panel title={t('exam.runner.sectionDone', { section: t(`exam.section.${last.result.section}`) })}>
          <SectionResultView result={last.result} />
          {last.open.section === 'reading' ? <details style={{ marginTop: '1rem' }}><summary style={{ cursor: 'pointer' }}>{t('exam.review.title')}</summary><ReadingSection parts={last.open.content.parts} answers={Object.fromEntries((last.result.objective?.items ?? []).map((item) => [item.id, item.given]))} onAnswer={() => undefined} result={last.result} /></details> : null}
          {last.open.section === 'listening' ? <details style={{ marginTop: '1rem' }}><summary style={{ cursor: 'pointer' }}>{t('exam.review.title')}</summary><ListeningSection parts={last.open.content.parts} answers={Object.fromEntries((last.result.objective?.items ?? []).map((item) => [item.id, item.given]))} onAnswer={() => undefined} plays={{}} onPlayed={() => undefined} result={last.result} /></details> : null}
        </Panel>
      ) : null}
      {intro ?? (last ? null : <Panel><Loading lines={3} /></Panel>)}
    </div>
  );
};
