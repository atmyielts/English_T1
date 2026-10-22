import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  extractCulturalNotes,
  generateDailyChallenge,
  generateDictation,
  type CefrLevel,
  type CulturalNotesResponse,
  type DailyChallengeResponse,
  type DictationGenerateResponse,
} from '../lib/ecosystemInsightsClient';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';
import { useT } from '../i18n';
import { FeedbackList, Segmented, Tag } from '../ui/kit';
import { LevelPicker, ToolError, optionalLabel, skillHref, useLearnerLevel, useToolRequest } from './aiToolShared';

const normalize = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);

/** Word-by-word check that ignores capitals and punctuation. */
const scoreDictation = (target: string, typed: string) => {
  const targetWords = normalize(target);
  const left = new Map<string, number>();
  for (const word of normalize(typed)) left.set(word, (left.get(word) ?? 0) + 1);
  const missed: string[] = [];
  let matched = 0;
  for (const word of targetWords) {
    const count = left.get(word) ?? 0;
    if (count > 0) {
      matched += 1;
      left.set(word, count - 1);
    } else if (!missed.includes(word)) {
      missed.push(word);
    }
  }
  return { matched, total: targetWords.length, missed };
};

/** A short answer is right when it contains every key word of the expected answer. */
const answerMatches = (expected: string, given: string): boolean => {
  const keys = normalize(expected).filter((w) => w.length > 2 && !['the', 'and', 'was', 'are'].includes(w));
  const words = new Set(normalize(given));
  if (!keys.length) return normalize(expected).every((w) => words.has(w));
  return keys.every((w) => words.has(w));
};

// === Dictation ===

export const DictationDrillCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
  const learnerLevel = useLearnerLevel();
  const [level, setLevel] = useState<CefrLevel>(learnerLevel);
  const [topic, setTopic] = useState('');
  const [slow, setSlow] = useState<'normal' | 'slow'>('normal');
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState(false);
  const [showText, setShowText] = useState(false);
  const [answer, setAnswer] = useState('');
  const [answerResult, setAnswerResult] = useState<'right' | 'wrong' | null>(null);
  const { data, busy, error, run } = useToolRequest<DictationGenerateResponse>();
  const speechOk = canSpeak();

  useEffect(() => () => stopSpeaking(), []);

  const getText = (event: FormEvent) => {
    event.preventDefault();
    stopSpeaking();
    setTyped('');
    setChecked(false);
    setShowText(false);
    setAnswer('');
    setAnswerResult(null);
    void run(() => generateDictation({ target_level: level, topic: topic.trim() || undefined, previous_text: data?.text }));
  };

  const score = data && checked ? scoreDictation(data.text, typed) : null;

  if (!accessToken) return null;

  return (
    <div className="en-stack">
      <p className="hint">{t('ai.dictation.intro')}</p>
      <form onSubmit={getText}>
        <LevelPicker label={t('ai.dictation.levelLabel')} value={level} onChange={setLevel} />
        <label className="en-stack" htmlFor="dictation-topic" style={{ gap: '0.35rem' }}>
          {t('ai.dictation.topicLabel')}
          <input id="dictation-topic" type="text" value={topic} maxLength={120} onChange={(e) => setTopic(e.target.value)} placeholder={t('ai.dictation.topicPlaceholder')} />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? t('ai.dictation.busy') : data ? t('ai.dictation.next') : t('ai.dictation.get')}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {data?.text ? (
          <>
            {data.fallback && topic.trim() ? <p className="hint">{t('ai.dictation.libraryNote')}</p> : null}
            {speechOk ? (
              <div className="en-row">
                <button type="button" onClick={() => void speak(data.text, { rate: slow === 'slow' ? 0.8 : 1 })}>{t('ai.dictation.play')}</button>
                <button type="button" className="quiet" onClick={stopSpeaking}>{t('ai.dictation.stop')}</button>
                <Segmented
                  label={t('ai.dictation.speedLabel')}
                  value={slow}
                  onChange={setSlow}
                  options={[{ value: 'normal', label: t('ai.dictation.speedNormal') }, { value: 'slow', label: t('ai.dictation.speedSlow') }]}
                />
              </div>
            ) : (
              <p className="en-explain">{t('ai.dictation.noSpeech')}</p>
            )}

            <label className="en-stack" htmlFor="dictation-answer" style={{ gap: '0.35rem' }}>
              {t('ai.dictation.answerLabel')}
              <textarea
                id="dictation-answer"
                value={typed}
                onChange={(e) => { setTyped(e.target.value); setChecked(false); }}
                placeholder={t('ai.dictation.answerPlaceholder')}
                rows={3}
              />
            </label>
            <div className="en-actions">
              <button type="button" disabled={!typed.trim()} onClick={() => setChecked(true)}>{t('ai.dictation.check')}</button>
              <button type="button" className="quiet" onClick={() => setShowText((v) => !v)} aria-expanded={showText}>
                {showText ? t('ai.dictation.hideText') : t('ai.dictation.showText')}
              </button>
            </div>

            {score ? (
              score.missed.length ? (
                <div className="en-feedback is-fix">
                  <h3>{t('ai.dictation.score', { matched: score.matched, total: score.total })}</h3>
                  <p className="hint">{t('ai.dictation.missed')}:</p>
                  <div className="en-row">{score.missed.map((w) => <Tag key={w}>{w}</Tag>)}</div>
                </div>
              ) : (
                <p className="en-notice">{t('ai.dictation.allCorrect')}</p>
              )
            ) : null}

            {score && data.tricky_tokens.length ? (
              <div className="en-row">
                <span className="hint">{t('ai.dictation.tricky')}:</span>
                {data.tricky_tokens.map((w, i) => <Tag key={`${w}-${i}`}>{w}</Tag>)}
              </div>
            ) : null}

            {showText ? <p className="en-explain">{data.text}</p> : null}

            {data.comprehension_question ? (
              <div className="en-question">
                <h3>{t('ai.dictation.questionHeading')}</h3>
                <p className="en-question-prompt">{data.comprehension_question}</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (answer.trim()) setAnswerResult(answerMatches(data.comprehension_answer, answer) ? 'right' : 'wrong');
                  }}
                >
                  <label className="en-stack" htmlFor="dictation-question" style={{ gap: '0.35rem' }}>
                    {t('ai.dictation.questionLabel')}
                    <input id="dictation-question" type="text" value={answer} onChange={(e) => { setAnswer(e.target.value); setAnswerResult(null); }} />
                  </label>
                  <div className="en-actions">
                    <button type="submit" className="quiet" disabled={!answer.trim()}>{t('ai.dictation.checkAnswer')}</button>
                  </div>
                </form>
                {answerResult === 'right' ? <p className="en-notice">{t('ai.dictation.right')}</p> : null}
                {answerResult === 'wrong' ? <p className="en-explain">{t('ai.dictation.wrong', { answer: data.comprehension_answer })}</p> : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
};

// === Today's challenge ===

const MINUTE_OPTIONS = ['15', '30', '45', '60'] as const;

export const DailyChallengeCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
  const [minutes, setMinutes] = useState<(typeof MINUTE_OPTIONS)[number]>('30');
  const [done, setDone] = useState<Record<number, boolean>>({});
  const { data, busy, error, run } = useToolRequest<DailyChallengeResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setDone({});
    void run(() => generateDailyChallenge({ minutes_budget: Number(minutes) }));
  };

  if (!accessToken) return null;

  const unavailable = data && (data.ai_status !== 'ok' || data.tasks.length === 0);
  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <div className="en-stack">
      <p className="hint">{t('ai.challenge.intro')}</p>
      <form onSubmit={submit}>
        <div className="en-row">
          <span className="hint" aria-hidden="true">{t('ai.challenge.minutesLabel')}</span>
          <Segmented
            label={t('ai.challenge.minutesLabel')}
            value={minutes}
            onChange={setMinutes}
            options={MINUTE_OPTIONS.map((m) => ({ value: m, label: t('ai.challenge.minutes', { count: Number(m) }) }))}
          />
        </div>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? t('ai.challenge.busy') : data ? t('ai.challenge.again') : t('ai.challenge.submit')}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {unavailable ? (
          <div className="en-empty">
            <p>{t('ai.shared.unavailable')} {t('ai.challenge.todayHint')}</p>
            <Link className="en-button-quiet" to="/today">{t('ai.challenge.todayLink')}</Link>
          </div>
        ) : null}
        {data && !unavailable ? (
          <>
            <div>
              {data.theme ? <h3>{data.theme}</h3> : null}
              {data.why_this_theme ? <p className="hint">{data.why_this_theme}</p> : null}
            </div>
            <p className="hint">{t('ai.challenge.progress', { done: doneCount, total: data.tasks.length })}</p>
            <ol className="en-list">
              {data.tasks.map((task, index) => {
                const href = skillHref(task.skill);
                const skillName = optionalLabel(t, `ai.skills.${task.skill}`);
                return (
                  <li key={index} className="en-explain">
                    <div className="en-stack" style={{ gap: '0.5rem' }}>
                      <span className="en-row">
                        {skillName ? <Tag>{skillName}</Tag> : null}
                        <strong>{task.label}</strong>
                        <span className="hint">{t('ai.challenge.about', { count: task.estimated_minutes })}</span>
                      </span>
                      <span>{task.instruction}</span>
                      <span className="en-row">
                        {href && skillName ? <Link className="en-button-quiet" to={href}>{t('ai.challenge.open', { skill: skillName })}</Link> : null}
                        <label className="en-row">
                          <input
                            type="checkbox"
                            style={{ width: 'auto' }}
                            checked={Boolean(done[index])}
                            onChange={(e) => setDone((prev) => ({ ...prev, [index]: e.target.checked }))}
                          />
                          {t('ai.challenge.done')}
                        </label>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        ) : null}
      </div>
    </div>
  );
};

// === Culture and tone ===

export const CulturalNotesCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
  const [sourceText, setSourceText] = useState('');
  const { data, busy, error, run, setError } = useToolRequest<CulturalNotesResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sourceText.trim().length < 30) {
      setError(t('ai.culture.tooShort'));
      return;
    }
    void run(() => extractCulturalNotes({ source_text: sourceText.trim() }));
  };

  if (!accessToken) return null;

  const empty = data
    && !data.cultural_references.length
    && !data.register_observations.length
    && !data.regional_variants.length
    && !data.tone_pitfalls.length;

  return (
    <div className="en-stack">
      <p className="hint">{t('ai.culture.intro')}</p>
      <form onSubmit={submit}>
        <label className="en-stack" htmlFor="culture-source" style={{ gap: '0.35rem' }}>
          {t('ai.culture.label')}
          <textarea
            id="culture-source"
            value={sourceText}
            maxLength={4000}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={t('ai.culture.placeholder')}
            rows={6}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? t('ai.culture.busy') : t('ai.culture.submit')}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {data && data.ai_status !== 'ok' ? <p className="en-explain">{t('ai.shared.unavailable')}</p> : null}
        {data && data.ai_status === 'ok' && empty ? <p className="hint">{t('ai.culture.none')}</p> : null}
        {data && data.ai_status === 'ok' ? (
          <>
            <FeedbackList title={t('ai.culture.references')} items={data.cultural_references} tone="good" />
            <FeedbackList title={t('ai.culture.register')} items={data.register_observations} tone="good" />
            <FeedbackList title={t('ai.culture.regional')} items={data.regional_variants} tone="good" />
            <FeedbackList title={t('ai.culture.tone')} items={data.tone_pitfalls} tone="fix" />
          </>
        ) : null}
      </div>
    </div>
  );
};
