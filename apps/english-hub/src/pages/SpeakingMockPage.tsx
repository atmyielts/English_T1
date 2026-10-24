import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { L1Why } from '../components/L1Why';
import { formatClock, SpeakOrType } from '../components/SpeakOrType';
import { useI18n, useT } from '../i18n';
import { ApiError } from '../lib/api';
import { handbookTopicHref } from '../lib/handbookSearch';
import {
  finishMock,
  getMockOverview,
  startMock,
  type MockAllowance,
  type MockAnswerInput,
  type MockCriterion,
  type MockPractice,
  type MockQuestions,
  type MockResult,
  type MockSession,
} from '../lib/practice';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, Loading, PageHeader, Panel, useErrorMessage } from '../ui/kit';
import '../components/practice.css';
import { ShareCardButton } from '../components/ShareCardButton';

const CRITERIA: MockCriterion[] = ['fluency', 'lexical', 'grammar', 'pronunciation'];

const practiceHref = (practice: MockPractice, topic: string | null): string => {
  switch (practice) {
    case 'roleplay': return '/roleplay';
    case 'vocabulary': return '/vocabulary';
    case 'grammar': return topic ? handbookTopicHref(topic) : '/grammar';
    default: return '/speaking';
  }
};

const bandText = (band: number | null): string => (band === null ? '—' : band.toFixed(1));

/** Estimated bands, priorities and fixes for one mock. */
export const MockResultView = ({ result }: { result: MockResult }) => {
  const t = useT();
  return (
    <div className="en-stack">
      <div className="en-bands">
        <div className="en-band is-overall">
          <small>{t('mock.result.overall')}</small>
          <strong>{bandText(result.overall)}</strong>
        </div>
        {CRITERIA.map((criterion) => (
          <div key={criterion} className="en-band">
            <small>{t(`mock.criterion.${criterion}`)}{criterion === 'pronunciation' && result.bands.pronunciation !== null ? ` (${t('mock.result.rough')})` : ''}</small>
            <strong>{result.bands[criterion] === null ? <span style={{ fontSize: '1rem' }}>{t('mock.result.notAssessed')}</span> : bandText(result.bands[criterion])}</strong>
            {result.comments[criterion] ? <p lang="en">{result.comments[criterion]}</p> : null}
          </div>
        ))}
      </div>
      <p className="hint" style={{ margin: 0 }}>{t('mock.estimateNote')} {t('mock.pronNote')}</p>

      <div className="en-stack" style={{ gap: '.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('mock.result.priorities')}</h3>
        <ol className="en-list" style={{ paddingLeft: '1.2rem' }}>
          {result.priorities.map((priority, index) => (
            <li key={index} className="en-stack" style={{ gap: '.3rem' }}>
              <span><strong>{t(`mock.criterion.${priority.criterion}`)}:</strong> <span lang="en">{priority.text}</span></span>
              <span><Link className="en-button-quiet" to={practiceHref(priority.practice, priority.topic)}>{t(`mock.practice.${priority.practice}`)}</Link></span>
            </li>
          ))}
        </ol>
      </div>

      {result.fixes.length ? (
        <div className="en-stack" style={{ gap: '.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('mock.result.fixes')}</h3>
          <ul className="en-list">
            {result.fixes.map((fix, index) => (
              <li key={index} className="en-stack" style={{ gap: '.3rem' }}>
                <span className="en-diff" lang="en"><del>{fix.said}</del> <span aria-hidden="true">→</span> <ins>{fix.better}</ins></span>
                {fix.why ? <span className="hint" lang="en">{fix.why}</span> : null}
                <L1Why noteId={fix.l1} original={fix.said} corrected={fix.better} explanation={fix.why} topic={fix.topic} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

type Answer = { text: string; seconds: number };
type Step = { kind: 'part1'; index: number } | { kind: 'part2' } | { kind: 'part3'; index: number };

const stepsFor = (questions: MockQuestions): Step[] => [
  ...questions.part1.map((_, index) => ({ kind: 'part1' as const, index })),
  { kind: 'part2' as const },
  ...questions.part3.map((_, index) => ({ kind: 'part3' as const, index })),
];

const stepKey = (step: Step): string => (step.kind === 'part2' ? 'p2' : `${step.kind === 'part1' ? 'p1' : 'p3'}-${step.index}`);

const STORE_PREFIX = 'english-hub:speaking-mock:v1:';
const readAnswers = (id: string): Record<string, Answer> => {
  try {
    const raw = window.sessionStorage.getItem(STORE_PREFIX + id);
    return raw ? (JSON.parse(raw) as Record<string, Answer>) : {};
  } catch {
    return {};
  }
};
const writeAnswers = (id: string, value: Record<string, Answer> | null) => {
  try {
    if (value) window.sessionStorage.setItem(STORE_PREFIX + id, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORE_PREFIX + id);
  } catch {
    // Storage may be blocked; answers stay in this tab.
  }
};

const toInput = (answer: Answer | undefined): MockAnswerInput => ({
  text: answer?.text ?? '',
  mode: (answer?.seconds ?? 0) > 0 ? 'speech' : 'typed',
  seconds: (answer?.seconds ?? 0) > 0 ? answer!.seconds : null,
});

/** The running mock: one question at a time, the cue card with its timers, then scoring. */
const MockRunner = ({
  mock,
  prepSeconds,
  talkSeconds,
  onScored,
}: {
  mock: MockSession & { questions: MockQuestions };
  prepSeconds: number;
  talkSeconds: number;
  onScored: (result: MockResult) => void;
}) => {
  const t = useT();
  const errorText = useErrorMessage();
  const steps = stepsFor(mock.questions);
  const [position, setPosition] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => readAnswers(mock.id));
  const [prepLeft, setPrepLeft] = useState(prepSeconds);
  const [talking, setTalking] = useState(false);
  const [notes, setNotes] = useState('');
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const step = steps[position]!;
  const key = stepKey(step);
  const answer = answers[key] ?? { text: '', seconds: 0 };
  const question = step.kind === 'part1' ? mock.questions.part1[step.index]!.question : step.kind === 'part3' ? mock.questions.part3[step.index]! : mock.questions.part2.prompt;

  useEffect(() => { writeAnswers(mock.id, answers); }, [mock.id, answers]);
  useEffect(() => () => stopSpeaking(), []);

  // The examiner reads each question; focus moves to it for keyboard and screen-reader users.
  useEffect(() => {
    headingRef.current?.focus();
    if (canSpeak() && step.kind !== 'part2') void speak(question, { rate: 0.95 });
    // Once per question, when it is shown.
  }, [position]);

  // Part 2: one minute to prepare, then the talk starts.
  useEffect(() => {
    if (step.kind !== 'part2' || talking) return;
    if (prepLeft <= 0) {
      setTalking(true);
      return;
    }
    const timer = window.setTimeout(() => setPrepLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [step.kind, talking, prepLeft]);

  const update = (patch: Partial<Answer>) => setAnswers((current) => ({ ...current, [key]: { ...(current[key] ?? { text: '', seconds: 0 }), ...patch } }));

  const submit = async () => {
    stopSpeaking();
    setScoring(true);
    setError(null);
    try {
      const response = await finishMock(mock.id, {
        part1: mock.questions.part1.map((_, index) => toInput(answers[`p1-${index}`])),
        part2: toInput(answers.p2),
        part3: mock.questions.part3.map((_, index) => toInput(answers[`p3-${index}`])),
      });
      writeAnswers(mock.id, null);
      onScored(response.result);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === 'english_ai_unavailable' ? cause.message : errorText(cause));
    } finally {
      setScoring(false);
    }
  };

  const partTitle = step.kind === 'part1' ? t('mock.part1.title') : step.kind === 'part2' ? t('mock.part2.title') : t('mock.part3.title');
  const isLast = position === steps.length - 1;

  return (
    <Panel>
      <div className="en-stack">
        <ol className="en-mock-steps" aria-label={partTitle}>
          {(['part1', 'part2', 'part3'] as const).map((part) => (
            <li key={part} aria-current={step.kind === part ? 'step' : undefined}>{t(`mock.${part}.title`)}</li>
          ))}
        </ol>
        <p className="hint" style={{ margin: 0 }}>{t('mock.questionOf', { current: position + 1, total: steps.length })}</p>

        {step.kind === 'part2' ? (
          <div className="en-mock-card">
            <h2 ref={headingRef} tabIndex={-1} className="en-mock-question" lang="en">{mock.questions.part2.prompt}</h2>
            <p style={{ margin: '.5rem 0 0' }}>{t('mock.part2.youShouldSay')}</p>
            <ul lang="en">{mock.questions.part2.points.map((point) => <li key={point}>{point}</li>)}</ul>
          </div>
        ) : (
          <div className="en-stack" style={{ gap: '.4rem' }}>
            <h2 ref={headingRef} tabIndex={-1} className="en-mock-question" lang="en">{question}</h2>
            <p className="hint" style={{ margin: 0 }}>{step.kind === 'part1' ? t('mock.part1.hint') : t('mock.part3.hint')}</p>
            {canSpeak() ? <span><button type="button" className="quiet" onClick={() => void speak(question, { rate: 0.95 })}>▶ {t('mock.readQuestion')}</button></span> : null}
          </div>
        )}

        {step.kind === 'part2' && !talking ? (
          <div className="en-stack">
            <p className="en-speak-timer" role="timer" aria-live="off">{t('mock.part2.prep', { time: formatClock(prepLeft) })}</p>
            <p className="hint" style={{ margin: 0 }}>{t('mock.part2.prepHint')}</p>
            <label className="en-stack" style={{ gap: '.35rem' }}>
              {t('mock.part2.notes')}
              <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} lang="en" />
            </label>
            <div className="en-actions"><button type="button" onClick={() => setTalking(true)}>{t('mock.part2.skipPrep')}</button></div>
          </div>
        ) : (
          <>
            {step.kind === 'part2' ? (
              <p className="hint" style={{ margin: 0 }}>
                {t('mock.part2.talk')} {answer.seconds > 0 ? t('mock.part2.timeLeft', { time: formatClock(Math.max(0, talkSeconds - answer.seconds)) }) : null}
              </p>
            ) : null}
            <SpeakOrType
              key={key}
              id={`mock-${key}`}
              label={t('speak.label')}
              value={answer.text}
              onChange={(text) => update({ text })}
              onSeconds={(seconds) => update({ seconds })}
              spokenSeconds={answer.seconds}
              maxSeconds={step.kind === 'part2' ? talkSeconds : 180}
              rows={step.kind === 'part2' ? 6 : 3}
              autoStart={step.kind === 'part2' && answer.seconds === 0 && !answer.text}
              disabled={scoring}
            />
          </>
        )}

        {error ? <div className="error" role="alert">{error}</div> : null}

        <div className="en-actions">
          {position > 0 ? <button type="button" className="quiet" disabled={scoring} onClick={() => setPosition(position - 1)}>{t('mock.back')}</button> : null}
          {isLast ? (
            <button type="button" disabled={scoring} onClick={() => void submit()}>{scoring ? t('mock.scoring') : t('mock.submit')}</button>
          ) : (
            <button type="button" disabled={scoring || (step.kind === 'part2' && !talking)} onClick={() => { stopSpeaking(); setPosition(position + 1); }}>{t('mock.next')}</button>
          )}
        </div>
      </div>
    </Panel>
  );
};

const allowanceLine = (allowance: MockAllowance, t: ReturnType<typeof useT>): string => {
  if (allowance.per === 'week') return allowance.left > 0 ? t('mock.allowance.free', { count: allowance.left }) : t('mock.allowance.freeUsed');
  return allowance.left > 0 ? t('mock.allowance.owner', { count: allowance.left }) : t('mock.allowance.ownerUsed');
};

/** IELTS-style speaking mock (/speaking-mock): start, run, results and history. */
export const SpeakingMockPage = () => {
  const t = useT();
  const { date } = useI18n();
  const { pricingHref } = useEnglish();
  const errorText = useErrorMessage();
  const overview = useResource((signal) => getMockOverview(signal), []);
  const [running, setRunning] = useState<(MockSession & { questions: MockQuestions }) | null>(null);
  const [result, setResult] = useState<MockResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = overview.data;

  const begin = async () => {
    setStarting(true);
    setError(null);
    try {
      const response = await startMock();
      if (response.mock.questions) setRunning({ ...response.mock, questions: response.mock.questions });
    } catch (cause) {
      setError(cause instanceof ApiError && (cause.code === 'speaking_mock_limit_reached' || cause.code === 'english_ai_unavailable') ? cause.message : errorText(cause));
    } finally {
      setStarting(false);
    }
  };

  const header = (
    <PageHeader
      back={{ to: '/speaking', label: t('roleplay.back') }}
      eyebrow={t('mock.eyebrow')}
      title={t('mock.title')}
      lead={t('mock.lead')}
      actions={<Link className="en-button-quiet" to="/roleplay">{t('practice.links.roleplay')}</Link>}
    />
  );

  if (result) {
    return (
      <>
        {header}
        <Panel title={t('mock.result.title')}>
          <MockResultView result={result} />
          <div className="en-actions" style={{ marginTop: '1rem' }}>
            <button type="button" onClick={() => { setResult(null); overview.reload(); }}>{t('mock.result.again')}</button>
            {result.overall !== null ? <ShareCardButton card={{ kind: 'exam', label: t('social.card.exam.label'), big: bandText(result.overall), headline: t('social.card.mock.headline', { band: bandText(result.overall) }), detail: t('social.card.exam.detail') }} /> : null}
          </div>
        </Panel>
      </>
    );
  }

  if (running) {
    return (
      <>
        {header}
        <MockRunner
          mock={running}
          prepSeconds={data?.prep_seconds ?? 60}
          talkSeconds={data?.talk_seconds ?? 120}
          onScored={(scored) => { setRunning(null); setResult(scored); window.scrollTo({ top: 0 }); }}
        />
      </>
    );
  }

  const open = data?.in_progress?.questions ? data.in_progress : null;

  return (
    <>
      {header}
      {overview.loading && !data ? <Panel><Loading lines={5} /></Panel> : null}
      {overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : null}
      {data ? (
        <div className="en-grid-2">
          <Panel title={t('mock.title')}>
            <div className="en-stack">
              <ul className="en-list" style={{ paddingLeft: '1.1rem', listStyle: 'disc' }}>
                <li>{t('mock.part1.title')}</li>
                <li>{t('mock.part2.title')}</li>
                <li>{t('mock.part3.title')}</li>
              </ul>
              <p className="hint" style={{ margin: 0 }}>{t('mock.estimateNote')}</p>
              <p className="hint" style={{ margin: 0 }}>{t('mock.pronNote')}</p>
              {!data.ai_available ? <p className="en-explain" role="status">{t('mock.aiOff')}</p> : (
                <p className={data.allowance.left > 0 || open ? 'hint' : 'en-explain'} role="status" style={{ margin: 0 }}>
                  {allowanceLine(data.allowance, t)}
                  {data.allowance.per === 'week' && data.allowance.left === 0 ? <> <a href={pricingHref('speaking')}>{t('locked.cta')}</a></> : null}
                </p>
              )}
              {error ? <div className="error" role="alert">{error}</div> : null}
              <div className="en-actions">
                {open ? (
                  <button type="button" className="is-large" onClick={() => setRunning({ ...open, questions: open.questions! })}>{t('mock.resume')}</button>
                ) : (
                  <button type="button" className="is-large" disabled={!data.ai_available || !data.allowance.allowed || starting} onClick={() => void begin()}>
                    {starting ? t('mock.starting') : t('mock.start')}
                  </button>
                )}
              </div>
            </div>
          </Panel>

          <Panel title={t('mock.history.title')}>
            {data.history.length === 0 ? <EmptyState title={t('mock.history.empty')} /> : (
              <ul className="en-list">
                {data.history.map((entry) => (
                  <li key={entry.id}>
                    <details>
                      <summary style={{ cursor: 'pointer' }}>
                        <strong>{t('mock.history.band', { band: entry.overall.toFixed(1) })}</strong>
                        {' · '}{date(entry.finished_at, { dateStyle: 'medium' })}
                        {entry.cue_card ? <span className="hint" lang="en" style={{ display: 'block' }}>{entry.cue_card}</span> : null}
                      </summary>
                      {entry.result ? <div style={{ marginTop: '.75rem' }}><MockResultView result={entry.result} /></div> : null}
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
    </>
  );
};
