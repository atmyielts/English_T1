import { useCallback, useEffect, useRef, useState } from 'react';
import { translate } from '../../i18n';
import {
  type StudentAssessment,
  studentAssessmentCommand,
  studentAssessments,
} from '../../lib/assessmentServices';
import { AssessmentReportView } from './AssessmentReportView';
import './assessments.css';

export function StudentAssessmentsView(
  { academyId, academyName, formatDate }: {
    academyId: string;
    academyName: string;
    formatDate: (value: string | null | undefined) => string;
  },
) {
  const [list, setList] = useState<StudentAssessment[]>([]);
  const [active, setActive] = useState<StudentAssessment | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [dirty, setDirty] = useState(false);
  const answerRef = useRef(answers);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const serverOffset = useRef(0);
  const autoSubmitted = useRef('');
  const dirtyRef = useRef(false);
  const load = useCallback(async () => {
    const result = await studentAssessments(academyId);
    setList(result.candidates);
    setActive((current) =>
      current ? result.candidates.find((item) => item.id === current.id) ?? current : null
    );
  }, [academyId]);
  useEffect(() => {
    let live = true;
    studentAssessments(academyId).then((result) => {
      if (live) setList(result.candidates);
    }).catch((err: Error) => {
      if (live) setError(err.message);
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [academyId]);
  const send = useCallback(
    (command: string, id: string, snapshot?: Record<string, string | number>) => {
      const next = queue.current.catch(() => undefined).then(() =>
        studentAssessmentCommand(academyId, command, {
          candidate_id: id,
          ...(snapshot ? { answers: snapshot } : {}),
        })
      );
      queue.current = next;
      return next;
    },
    [academyId],
  );
  const submit = useCallback(async (id: string) => {
    setBusy(true);
    setError('');
    try {
      const result = await send('submit', id, answerRef.current);
      setActive(result.candidate);
      setDirty(false);
      dirtyRef.current = false;
      setNotice(
        translate('Your answers have been submitted. Your teacher will review the report.'),
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : translate('Unable to submit. Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  }, [load, send]);
  useEffect(() => {
    if (!active || active.status !== 'in_progress' || !active.expires_at) return;
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((Date.parse(active.expires_at!) - Date.now() - serverOffset.current) / 1000),
      );
      setRemaining(left);
      if (left === 0 && autoSubmitted.current !== active.id) {
        autoSubmitted.current = active.id;
        void submit(active.id);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [active, submit]);
  useEffect(() => {
    if (!dirty || active?.status !== 'in_progress') return;
    const snapshot = answers, id = active.id;
    const timer = window.setTimeout(() => {
      void send('save', id, snapshot).then(() => {
        if (answerRef.current === snapshot) {
          setDirty(false);
          dirtyRef.current = false;
          setNotice(translate('Answers saved'));
        }
      }).catch(() =>
        setError(
          translate(
            'Answers could not be saved. Check your connection and save again before time ends.',
          ),
        )
      );
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [answers, dirty, active, send]);
  // Save at least every five seconds even during continuous typing; requests remain serialized.
  useEffect(() => {
    if (active?.status !== 'in_progress') return;
    const timer = window.setInterval(() => {
      if (!dirtyRef.current) return;
      const snapshot = answerRef.current;
      void send('save', active.id, snapshot).then(() => {
        if (answerRef.current === snapshot) {
          setDirty(false);
          dirtyRef.current = false;
          setNotice(translate('Answers saved'));
          setError('');
        }
      }).catch(() =>
        setError(
          translate(
            'Answers could not be saved. Check your connection and save again before time ends.',
          ),
        )
      );
    }, 5000);
    return () => window.clearInterval(timer);
  }, [active, send]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const open = async (candidate: StudentAssessment) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (candidate.status === 'released' || ['submitted', 'reviewed'].includes(candidate.status)) {
        setActive(candidate);
        return;
      }
      const result = await send(
        candidate.status === 'in_progress' ? 'resume' : 'start',
        candidate.id,
      );
      serverOffset.current = Date.parse(result.server_time) - Date.now();
      setActive(result.candidate);
      const restored = result.candidate.answers ?? {};
      answerRef.current = restored;
      setAnswers(restored);
      setDirty(false);
      dirtyRef.current = false;
      autoSubmitted.current = '';
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : translate('Unable to open assessment. Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  };
  const change = (id: string, value: string | number) => {
    const next = { ...answerRef.current, [id]: value };
    answerRef.current = next;
    setAnswers(next);
    setDirty(true);
    dirtyRef.current = true;
    setNotice('');
  };
  return (
    <div className='assessment-services'>
      <header className='assessment-intro'>
        <span className='assessment-eyebrow'>{translate('My assessments')}</span>
        <h2>{translate('Show what you know. Find your next step.')}</h2>
        <p>
          {translate(
            'Your center’s assessments and shared reports are kept together here. A placement assessment helps choose your starting point; it is not a pass or fail.',
          )}
        </p>
      </header>
      {error && <p className='assessment-error' role='alert'>{translate(error)}</p>}
      {notice && <p className='assessment-notice' role='status'>{notice}</p>}
      {active?.status !== 'in_progress' && (
        <button
          className='secondary-btn'
          disabled={busy}
          onClick={() => {
            setError('');
            void load().catch((err: Error) => setError(err.message));
          }}
        >
          {translate('Refresh')}
        </button>
      )}
      {loading
        ? <p role='status'>{translate('Loading assessments…')}</p>
        : active?.status === 'in_progress'
        ? (
          <section className='assessment-form'>
            <header className='assessment-timer'>
              <div>
                <h3>{active.run.title}</h3>
                <span>{translate('Candidate')} {active.candidate_code}</span>
              </div>
              <strong role='timer' aria-label={translate('Time remaining')}>
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
              </strong>
            </header>
            <p>{active.run.instructions}</p>
            <p className='assessment-caution'>
              {translate(
                'Answers save automatically while you are connected. When time ends, only answers received before the deadline count. Contact your center if you need an accommodation before starting.',
              )}
            </p>
            {(active.items ?? []).map((item, index) => (
              <fieldset className='assessment-question' key={item.id}>
                <legend>{translate('Question')} {index + 1} · {translate(item.skill)}</legend>
                {item.passage && <p className='assessment-passage'>{item.passage}</p>}
                <p>
                  <strong>{item.prompt}</strong>
                </p>
                {item.media_url && (
                  <audio controls preload='none' src={item.media_url}>
                    {translate('Your browser cannot play this audio.')}
                  </audio>
                )}
                {item.kind === 'choice'
                  ? (
                    <div className='assessment-answer-options'>
                      {item.options.map((option, i) => (
                        <label className='assessment-check' key={i}>
                          <input
                            type='radio'
                            name={item.id}
                            value={i}
                            disabled={busy || remaining === 0}
                            checked={answers[item.id] === i}
                            onChange={() => change(item.id, i)}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  )
                  : item.kind === 'written'
                  ? (
                    <textarea
                      className='input'
                      aria-label={`${translate('Your answer')} ${index + 1}`}
                      maxLength={10000}
                      rows={6}
                      disabled={busy || remaining === 0}
                      value={answers[item.id] ?? ''}
                      onChange={(e) => change(item.id, e.target.value)}
                    />
                  )
                  : (
                    <p className='muted'>
                      {translate(
                        'Your teacher will complete this interview and record the evidence. Follow the instructions from your center.',
                      )}
                    </p>
                  )}
              </fieldset>
            ))}
            <div className='assessment-actions'>
              <span role='status'>{translate(dirty ? 'Unsaved changes' : 'Answers saved')}</span>
              <button
                className='secondary-btn'
                disabled={busy || remaining === 0}
                onClick={() => {
                  const snapshot = answerRef.current;
                  void send('save', active.id, snapshot).then(() => {
                    if (answerRef.current === snapshot) {
                      setDirty(false);
                      dirtyRef.current = false;
                    }
                    setNotice(translate('Answers saved'));
                  }).catch(() =>
                    setError(
                      translate(
                        'Answers could not be saved. Check your connection and save again before time ends.',
                      ),
                    )
                  );
                }}
              >
                {translate('Save answers')}
              </button>
              <button
                className='primary-btn'
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      translate('Submit your answers? You cannot change them after submission.'),
                    )
                  ) void submit(active.id);
                }}
              >
                {translate('Submit assessment')}
              </button>
            </div>
          </section>
        )
        : (
          <>
            <div className='assessment-session-list'>
              {list.map((candidate) => (
                <article className='assessment-form' key={candidate.id}>
                  <h3>{candidate.run.title}</h3>
                  <p>
                    {formatDate(candidate.run.starts_at)} · {candidate.duration_minutes}{' '}
                    {translate('min')} · {candidate.run.room}
                  </p>
                  <p>{translate('Candidate')} {candidate.candidate_code}</p>
                  {candidate.status === 'invited' && (
                    <p>
                      {translate(
                        'Check the session time and instructions before starting. Your timer starts when you press Start assessment.',
                      )}
                    </p>
                  )}
                  <button
                    className='primary-btn'
                    disabled={busy ||
                      (candidate.status === 'invited' && candidate.run.status !== 'open')}
                    onClick={() => void open(candidate)}
                  >
                    {translate(
                      candidate.status === 'released'
                        ? 'View report'
                        : candidate.status === 'in_progress'
                        ? 'Continue assessment'
                        : candidate.status === 'invited'
                        ? 'Start assessment'
                        : 'Awaiting teacher review',
                    )}
                  </button>
                </article>
              ))}
            </div>
            {!list.length && (
              <p className='assessment-empty'>
                {translate(
                  'No assessments assigned yet. Your center will register you when your placement or next progress check is ready.',
                )}
              </p>
            )}
            {active?.status === 'released' && active.report && active.summary && (
              <AssessmentReportView
                academy={academyName}
                name={active.learner_name}
                code={active.candidate_code}
                title={active.run.title}
                report={active.report}
                summary={active.summary}
                date={formatDate(active.released_at)}
              />
            )}
            {active && ['submitted', 'reviewed'].includes(active.status) && (
              <p className='assessment-notice'>
                {translate(
                  'Your answers are with your teacher. Your report will appear here after it has been reviewed and shared.',
                )}
              </p>
            )}
          </>
        )}
    </div>
  );
}
