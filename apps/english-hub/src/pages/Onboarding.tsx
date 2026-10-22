import { useEffect, useState } from 'react';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { edge } from '../lib/api';
import { saveOnboarding } from '../lib/hub';
import { CEFR_LEVELS, isCefr, type CefrLevel } from '../lib/skills';
import { speak, canSpeak } from '../lib/speech';
import { ErrorState, Loading, PageHeader, Panel } from '../ui/kit';

const GOALS = ['everyday', 'work', 'study_abroad', 'exam', 'travel', 'school'] as const;
type Goal = (typeof GOALS)[number];
const MINUTES = [10, 20, 30, 45] as const;
const SELF_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
const ROUNDS = 3;

type Question = {
  skill: 'reading' | 'writing' | 'listening' | 'grammar';
  prompt: string;
  passage: string;
  choices: string[];
  expected_answer_pattern: string;
};

type RoundResponse = { finalized: false; ai_status: string; questions: Question[] };
type FinalResponse = {
  finalized: true;
  ai_status: string;
  overall_level: string;
  per_skill: Record<string, { level: string; evidence: string }>;
  narrative: string;
  next_steps: string[];
};

type Step = 'goal' | 'level-choice' | 'test' | 'self' | 'result';

/** First-run flow: goal and daily time, then a placement test or a self-chosen level. */
export const Onboarding = ({ onDone, retake = false }: { onDone?: () => void; retake?: boolean } = {}) => {
  const t = useT();
  const { refreshOnboarding, displayName } = useEnglish();
  const [step, setStep] = useState<Step>('goal');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [target, setTarget] = useState<CefrLevel>('B2');
  const [minutes, setMinutes] = useState<number>(20);

  const [round, setRound] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [history, setHistory] = useState<Array<{ question: Question; answer: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [testUnavailable, setTestUnavailable] = useState(false);
  const [result, setResult] = useState<FinalResponse | null>(null);
  const [selfLevel, setSelfLevel] = useState<CefrLevel | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, round]);

  const toggleGoal = (goal: Goal) =>
    setGoals((current) => (current.includes(goal) ? current.filter((entry) => entry !== goal) : [...current, goal].slice(-2)));

  const finish = async (level: CefrLevel, perSkill: Record<string, { level: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const per: Record<string, { level: CefrLevel }> = {};
      for (const [skill, entry] of Object.entries(perSkill)) {
        const value = entry.level?.toUpperCase();
        if (isCefr(value)) per[skill] = { level: value as CefrLevel };
      }
      await saveOnboarding({
        goal: { goal_keys: goals.length ? goals : ['everyday'], target_cefr: target, daily_time_minutes: minutes },
        placement: { overall_level: level, per_skill: per },
      });
      await refreshOnboarding();
      onDone?.();
    } catch (cause) {
      setError(cause);
      setBusy(false);
    }
  };

  const loadRound = async (nextRound: number, nextHistory: Array<{ question: Question; answer: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await edge<RoundResponse | FinalResponse>('hub', '/ai/placement-test', {
        body: { round: nextRound, history: nextHistory, finalize: nextRound >= ROUNDS },
      });
      if (response.ai_status !== 'ok') {
        setTestUnavailable(true);
        setStep('self');
        return;
      }
      if (response.finalized) {
        setResult(response);
        setStep('result');
        return;
      }
      if (!response.questions.length) {
        setTestUnavailable(true);
        setStep('self');
        return;
      }
      setQuestions(response.questions);
      setAnswers(response.questions.map(() => ''));
      setRound(nextRound);
      setStep('test');
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const submitRound = () => {
    const nextHistory = [...history, ...questions.map((question, index) => ({ question, answer: answers[index] ?? '' }))];
    setHistory(nextHistory);
    void loadRound(round + 1, nextHistory);
  };

  const stepIndex = step === 'goal' ? 0 : step === 'result' ? 2 : 1;

  return (
    <div className="en-stack">
      <PageHeader
        eyebrow={t('onboarding.eyebrow')}
        title={retake ? t('onboarding.retakeTitle') : displayName ? t('onboarding.titleNamed', { name: displayName }) : t('onboarding.title')}
        lead={retake ? t('onboarding.retakeLead') : t('onboarding.lead')}
      />
      <ol className="en-steps" aria-label={t('onboarding.progress')}>
        {[t('onboarding.step.goal'), t('onboarding.step.level'), t('onboarding.step.start')].map((label, index) => (
          <li key={label} className={index === stepIndex ? 'is-current' : index < stepIndex ? 'is-done' : ''} aria-current={index === stepIndex ? 'step' : undefined}>
            <span>{index < stepIndex ? '✓' : index + 1}</span>{label}
          </li>
        ))}
      </ol>

      {step === 'goal' ? (
        <Panel title={t('onboarding.goal.title')}>
          <p>{t('onboarding.goal.body')}</p>
          <div className="en-choice-grid">
            {GOALS.map((goal) => (
              <button key={goal} type="button" className="en-choice" aria-pressed={goals.includes(goal)} onClick={() => toggleGoal(goal)}>
                <strong>{t(`goal.${goal}`)}</strong>
                <span>{t(`goal.${goal}.hint`)}</span>
              </button>
            ))}
          </div>
          <div className="en-grid-2">
            <div className="en-stack">
              <h3>{t('onboarding.target.title')}</h3>
              <div className="en-segmented" role="radiogroup" aria-label={t('onboarding.target.title')}>
                {(['A2', 'B1', 'B2', 'C1', 'C2'] as CefrLevel[]).map((level) => (
                  <button key={level} type="button" role="radio" aria-checked={target === level} className={target === level ? 'is-on' : 'quiet'} onClick={() => setTarget(level)}>
                    {level}
                  </button>
                ))}
              </div>
              <p className="hint">{t(`level.${target}.can`)}</p>
            </div>
            <div className="en-stack">
              <h3>{t('onboarding.minutes.title')}</h3>
              <div className="en-segmented" role="radiogroup" aria-label={t('onboarding.minutes.title')}>
                {MINUTES.map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={minutes === value} className={minutes === value ? 'is-on' : 'quiet'} onClick={() => setMinutes(value)}>
                    {t('common.minutesShort', { count: value })}
                  </button>
                ))}
              </div>
              <p className="hint">{t('onboarding.minutes.hint')}</p>
            </div>
          </div>
          <div className="en-actions">
            <button type="button" className="is-large" onClick={() => setStep('level-choice')}>{t('common.continue')}</button>
          </div>
        </Panel>
      ) : null}

      {step === 'level-choice' ? (
        <div className="en-grid-cards">
          <section className="en-panel en-tone-lime">
            <h2>{t('onboarding.test.title')}</h2>
            <p>{t('onboarding.test.body')}</p>
            <div className="en-actions">
              <button type="button" disabled={busy} onClick={() => void loadRound(0, [])}>
                {busy ? t('onboarding.test.preparing') : t('onboarding.test.start')}
              </button>
            </div>
            {busy ? <Loading lines={2} label={t('onboarding.test.preparing')} /> : null}
            {error ? <ErrorState error={error} onRetry={() => void loadRound(0, [])} /> : null}
          </section>
          <Panel title={t('onboarding.self.title')}>
            <p>{t('onboarding.self.body')}</p>
            <div className="en-actions">
              <button type="button" className="quiet" onClick={() => setStep('self')}>{t('onboarding.self.cta')}</button>
            </div>
          </Panel>
          <div className="en-actions">
            <button type="button" className="is-link" onClick={() => setStep('goal')}>← {t('common.back')}</button>
          </div>
        </div>
      ) : null}

      {step === 'test' ? (
        <Panel title={t('onboarding.test.round', { round: round + 1, total: ROUNDS })} aside={<span>{t('onboarding.test.noPressure')}</span>}>
          {questions.map((question, index) => (
            <div key={`${round}-${index}`} className="en-question">
              <p className="eyebrow">{t(`skill.${question.skill}`)}</p>
              {question.skill === 'listening' && question.passage ? (
                <div className="en-row">
                  <button type="button" className="quiet" onClick={() => speak(question.passage)} disabled={!canSpeak()}>
                    ▶ {t('onboarding.test.play')}
                  </button>
                  {!canSpeak() ? <span className="hint">{t('onboarding.test.noAudio')}</span> : null}
                </div>
              ) : question.passage ? (
                <blockquote className="en-explain">{question.passage}</blockquote>
              ) : null}
              <p className="en-question-prompt">{question.prompt}</p>
              {question.choices.length ? (
                <div className="en-options">
                  {question.choices.map((choice, choiceIndex) => (
                    <button
                      key={choice}
                      type="button"
                      className="en-option"
                      aria-pressed={answers[index] === choice}
                      onClick={() => setAnswers((current) => current.map((value, i) => (i === index ? choice : value)))}
                    >
                      <span className="en-option-key">{String.fromCharCode(65 + choiceIndex)}</span>
                      <span>{choice}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  rows={3}
                  aria-label={question.prompt}
                  value={answers[index] ?? ''}
                  onChange={(event) => setAnswers((current) => current.map((value, i) => (i === index ? event.target.value : value)))}
                  placeholder={t('onboarding.test.answerPlaceholder')}
                />
              )}
            </div>
          ))}
          {error ? <ErrorState error={error} onRetry={submitRound} /> : null}
          <div className="en-actions">
            <button type="button" className="is-large" disabled={busy} onClick={submitRound}>
              {busy ? t('onboarding.test.checking') : round + 1 >= ROUNDS ? t('onboarding.test.finish') : t('onboarding.test.next')}
            </button>
            <button type="button" className="is-link" disabled={busy} onClick={() => setStep('self')}>{t('onboarding.test.skip')}</button>
          </div>
        </Panel>
      ) : null}

      {step === 'self' ? (
        <Panel title={t('onboarding.self.title')}>
          {testUnavailable ? <p className="en-notice">{t('onboarding.test.unavailable')}</p> : null}
          <div className="en-choice-grid">
            {SELF_LEVELS.map((level) => (
              <button key={level} type="button" className="en-choice" aria-pressed={selfLevel === level} onClick={() => setSelfLevel(level)}>
                <strong>{level} · {t(`level.${level}.name`)}</strong>
                <span>{t(`level.${level}.can`)}</span>
              </button>
            ))}
          </div>
          {error ? <ErrorState error={error} /> : null}
          <div className="en-actions">
            <button type="button" className="is-large" disabled={!selfLevel || busy} onClick={() => selfLevel && void finish(selfLevel, {})}>
              {busy ? t('common.saving') : t('onboarding.startLearning')}
            </button>
            <button type="button" className="is-link" onClick={() => setStep('level-choice')}>← {t('common.back')}</button>
          </div>
        </Panel>
      ) : null}

      {step === 'result' && result ? (
        <Panel tone="lime" title={t('onboarding.result.title', { level: result.overall_level })}>
          <p>{t(`level.${isCefr(result.overall_level) ? result.overall_level : 'B1'}.can`)}</p>
          {result.narrative ? <p>{result.narrative}</p> : null}
          <div className="en-stats">
            {Object.entries(result.per_skill).map(([skill, entry]) => (
              <div className="en-stat" key={skill}>
                <small>{t(`skill.${skill}`)}</small>
                <strong>{entry.level}</strong>
              </div>
            ))}
          </div>
          {error ? <ErrorState error={error} /> : null}
          <div className="en-actions">
            <button
              type="button"
              className="is-large"
              disabled={busy}
              onClick={() => {
                const level = result.overall_level.toUpperCase();
                void finish(isCefr(level) ? (level as CefrLevel) : CEFR_LEVELS[2]!, result.per_skill);
              }}
            >
              {busy ? t('common.saving') : t('onboarding.startLearning')}
            </button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
};
