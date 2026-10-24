import { Fragment, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TapScope, TapWords } from '../../components/WordLookup';
import { useT } from '../../i18n';
import { saveWords } from '../../lib/notebook';
import { canSpeak } from '../../lib/speech';
import { useElapsedSeconds, useResource } from '../../lib/useResource';
import { Panel, ProgressBar, Segmented, Tag, useErrorMessage } from '../../ui/kit';
import { ActivityFrame, ResultPanel } from '../ActivityKit';
import { RepeatAfterMe } from '../RepeatAfterMe';
import { getItem, submitItem, type DiffToken, type ListeningSubmitResponse } from './api';
import { parseScript, speakersOf, speechChunks, type ScriptLine } from './script';
import { usePlayer } from './usePlayer';

type Speed = 'normal' | 'slow';
const RATE: Record<Speed, number> = { normal: 1, slow: 0.75 };
const letter = (index: number) => String.fromCharCode(65 + index);

/** The script, line by line, with speaker names for dialogues. Words can be tapped for their meaning. */
const Transcript = ({ lines, title, slug }: { lines: ScriptLine[]; title: string | null; slug: string }) => (
  <TapScope className="en-passage" source={{ type: 'english-listening', label: title, ref: slug }}>
    {lines.map((line, index) => (
      <p key={index}>
        {line.speaker ? <strong>{line.speaker}: </strong> : null}
        <TapWords text={line.text} />
      </p>
    ))}
  </TapScope>
);

/** What the learner wrote compared with the sentence: green = missing or correct spelling, crossed out = wrong or extra. */
const DiffLine = ({ tokens }: { tokens: DiffToken[] }) => (
  <p className="en-diff" lang="en" style={{ margin: 0, lineHeight: 1.9 }}>
    {tokens.map((token, index) => (
      <Fragment key={index}>
        {index > 0 ? ' ' : null}
        {token.kind === 'ok' ? <span>{token.text}</span> : null}
        {token.kind === 'missed' ? <ins>{token.text}</ins> : null}
        {token.kind === 'extra' ? <del>{token.text}</del> : null}
        {token.kind === 'misspelled' ? <><del>{token.typed || '…'}</del> <ins>{token.text}</ins></> : null}
      </Fragment>
    ))}
  </p>
);

export const ListeningActivity = () => {
  const t = useT();
  const errorText = useErrorMessage();
  const { slug = '' } = useParams();
  const activity = useResource((signal) => getItem(slug, signal), [slug]);
  const elapsed = useElapsedSeconds();
  const player = usePlayer();

  const [readingMode, setReadingMode] = useState(() => !canSpeak());
  const [speed, setSpeed] = useState<Speed>('normal');
  const [plays, setPlays] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [result, setResult] = useState<ListeningSubmitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  const item = activity.data?.item;
  const targets = activity.data?.dictation ?? [];
  const questions = item?.questions ?? [];
  const lines = useMemo(
    () => (item ? parseScript(item.transcript_text, item.metadata?.format === 'dialogue') : []),
    [item],
  );
  const speakers = speakersOf(lines);
  const chunks = useMemo(() => speechChunks(lines), [lines]);
  const hasAudioFile = Boolean(item?.audio_url);
  const useDictation = !readingMode && targets.length > 0;

  const answered = questions.filter((question) => answers[question.id] !== undefined).length;
  const written = targets.filter((target) => (typed[target.segment_index] ?? '').trim()).length;
  const heard = readingMode || plays > 0;
  const canCheck = heard && (answered > 0 || (useDictation && written > 0));
  const scriptPlaying = player.state.key === 'script';

  const playScript = () => {
    if (scriptPlaying) {
      player.stop();
      return;
    }
    setPlays((count) => count + 1);
    void player.play('script', chunks, RATE[speed]);
  };

  const playSentence = (index: number, text: string, rate: number) => {
    const key = `s${index}-${rate}`;
    if (player.state.key === key) {
      player.stop();
      return;
    }
    void player.play(key, [{ text, accent: 'us' }], rate);
  };

  const switchToReading = () => {
    player.stop();
    setReadingMode(true);
  };

  const check = async () => {
    player.stop();
    setBusy(true);
    setError(null);
    try {
      const response = await submitItem(slug, {
        mode: readingMode ? 'reading' : 'listening',
        answers: Object.entries(answers).map(([question_id, option_index]) => ({ question_id, option_index })),
        dictation: useDictation ? targets.map((target) => ({ segment_index: target.segment_index, text: typed[target.segment_index] ?? '' })) : [],
        plays,
        time_spent_seconds: elapsed(),
      });
      setResult(response);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    player.stop();
    setAnswers({});
    setTyped({});
    setPlays(0);
    setResult(null);
    setSaved(0);
    setSaveError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveMissed = async () => {
    if (!result?.review_words.length) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await saveWords(result.review_words.map((entry) => ({
        word: entry.word,
        example: entry.context,
        context_text: entry.context,
        source_type: 'english.listening.dictation',
        source_label: item?.title ?? null,
        source_ref: slug,
      })));
      setSaved(response.saved || result.review_words.length);
    } catch (cause) {
      setSaveError(cause);
    } finally {
      setSaving(false);
    }
  };

  const questionResult = (id: string) => result?.questions.results.find((entry) => entry.question_id === id) ?? null;

  // Result summary and feedback points, built only from what the server checked.
  const summary = result ? [
    result.questions.total ? t('listening.result.questions', { correct: result.questions.correct, total: result.questions.total }) : null,
    result.dictation.score !== null ? t('listening.result.dictation', { score: result.dictation.score }) : null,
  ].filter(Boolean).join(' ') : '';
  const good: string[] = [];
  const fix: string[] = [];
  if (result) {
    const q = result.questions;
    if (q.total && q.correct === q.total) good.push(t('listening.result.allQuestions'));
    else if (q.correct > 0) good.push(t('listening.result.someQuestions', { count: q.correct }));
    if (q.total && q.correct < q.total) fix.push(t('listening.result.fixQuestions'));
    if (result.dictation.score !== null) {
      if (result.dictation.score >= 85) good.push(t('listening.result.goodDictation'));
      else fix.push(t('listening.result.fixDictation'));
    }
    if (result.review_words.length) fix.push(t('listening.result.reviewWords', { words: result.review_words.slice(0, 6).map((entry) => entry.word).join(', ') }));
    if (result.mode === 'listening' && result.plays === 1 && result.score >= 80) good.push(t('listening.result.onePlay'));
  }

  return (
    <ActivityFrame
      skill="listening"
      title={item?.title}
      level={item?.level}
      minutes={item?.estimated_minutes}
      lead={item?.summary}
      loading={activity.loading && !activity.data}
      error={activity.error}
      onRetry={activity.reload}
    >
      {result ? (
        <ResultPanel
          skill="listening"
          slug={slug}
          score={result.score}
          summary={summary}
          good={good}
          fix={fix}
          onRetry={retry}
          savedWords={saved}
        >
          {result.mode === 'reading' ? <p className="en-notice" style={{ margin: 0 }}>{t('listening.result.readingMode')}</p> : null}

          {result.dictation.results.length ? (
            <div className="en-stack" style={{ gap: '.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('listening.result.dictationTitle')}</h3>
              <p className="hint" style={{ margin: 0 }}>{t('listening.result.diffHint')}</p>
              {result.dictation.results.map((entry, index) => (
                <div key={entry.segment_index} className="en-question">
                  <p className="eyebrow" style={{ margin: 0 }}>
                    {t('listening.dictation.sentence', { number: index + 1 })} · {t('listening.result.sentenceScore', { score: entry.accuracy })}
                  </p>
                  <DiffLine tokens={entry.tokens} />
                  <p className="hint" style={{ margin: 0 }}>
                    {entry.typed.trim() ? t('listening.result.youWrote', { text: entry.typed }) : t('listening.result.nothingWritten')}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {result.mode !== 'reading' && result.dictation.results.length ? (
            <RepeatAfterMe
              title={t('repeat.listening.title')}
              lead={t('repeat.listening.lead')}
              sentences={result.dictation.results.map((entry) => entry.text)}
            />
          ) : null}

          {result.review_words.length ? (
            <div className="en-stack" style={{ gap: '.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('listening.result.wordsTitle')}</h3>
              <div className="en-row" style={{ flexWrap: 'wrap', gap: '.4rem' }}>
                {result.review_words.map((entry) => <Tag key={entry.word}>{entry.word}</Tag>)}
              </div>
              {!saved ? (
                <div className="en-actions">
                  <button type="button" className="quiet" disabled={saving} onClick={() => void saveMissed()}>
                    {saving ? t('common.saving') : t('listening.result.saveWords', { count: result.review_words.length })}
                  </button>
                </div>
              ) : null}
              {saveError ? <div className="error" role="alert">{errorText(saveError)}</div> : null}
            </div>
          ) : null}
        </ResultPanel>
      ) : null}

      {result ? (
        <Panel title={t('listening.transcript.title')}>
          <Transcript lines={lines} title={item?.title ?? null} slug={slug} />
        </Panel>
      ) : null}

      {!result ? (
        <Panel title={t('listening.listen.title')}>
          {readingMode ? (
            <>
              <p className="en-notice" style={{ margin: 0 }}>
                {canSpeak() ? t('listening.reading.chosen') : t('listening.reading.noAudio')}
              </p>
              <Transcript lines={lines} title={item?.title ?? null} slug={slug} />
            </>
          ) : (
            <>
              <p className="hint" style={{ margin: 0 }}>{t('listening.listen.hint')}</p>
              {speakers.length ? <p style={{ margin: 0 }}>{t('listening.listen.speakers', { names: speakers.join(', ') })}</p> : null}
              {hasAudioFile ? (
                <audio controls preload="none" src={item?.audio_url ?? undefined} onPlay={() => setPlays((count) => count + 1)} style={{ width: '100%' }}>
                  {t('listening.listen.noAudioElement')}
                </audio>
              ) : (
                <>
                  <Segmented<Speed>
                    label={t('listening.listen.speed')}
                    value={speed}
                    onChange={(value) => { player.stop(); setSpeed(value); }}
                    options={[{ value: 'normal', label: t('listening.listen.normal') }, { value: 'slow', label: t('listening.listen.slow') }]}
                  />
                  <div className="en-actions">
                    <button type="button" className="is-large" onClick={playScript} aria-pressed={scriptPlaying}>
                      {scriptPlaying ? t('listening.listen.stop') : plays ? t('listening.listen.again') : t('listening.listen.play')}
                    </button>
                    <span className="hint" aria-live="polite">
                      {plays ? t('listening.listen.plays', { count: plays }) : t('listening.listen.notYet')}
                    </span>
                  </div>
                  {scriptPlaying && player.state.parts > 1 ? (
                    <ProgressBar skill="listening" value={(player.state.part / player.state.parts) * 100} label={t('listening.listen.progress')} />
                  ) : null}
                </>
              )}
              <p className="hint" style={{ margin: 0 }}>
                <button type="button" className="is-link" onClick={switchToReading}>{t('listening.reading.switch')}</button>
              </p>
            </>
          )}
        </Panel>
      ) : null}

      {questions.length ? (
        <Panel
          title={t('listening.questions.title')}
          aside={!result ? <span>{t('listening.questions.answered', { done: answered, total: questions.length })}</span> : null}
        >
          {questions.map((question, index) => {
            const checked = questionResult(question.id);
            return (
              <div key={question.id} className="en-question" role="group" aria-labelledby={`ls-q-${question.id}`}>
                <p className="eyebrow" style={{ margin: 0 }}>{t('listening.questions.item', { number: index + 1 })}</p>
                <p className="en-question-prompt" id={`ls-q-${question.id}`} lang="en">{question.prompt}</p>
                <div className="en-options">
                  {question.options.map((option, optionIndex) => {
                    const chosen = (checked ? checked.chosen_index : answers[question.id]) === optionIndex;
                    const state = checked
                      ? optionIndex === checked.answer_index ? 'is-correct' : chosen ? 'is-wrong' : ''
                      : '';
                    return (
                      <button
                        key={optionIndex}
                        type="button"
                        className={`en-option ${state}`.trim()}
                        aria-pressed={chosen}
                        disabled={Boolean(result) || busy}
                        onClick={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))}
                      >
                        <span className="en-option-key" aria-hidden="true">{letter(optionIndex)}</span>
                        <span lang="en">{option}</span>
                      </button>
                    );
                  })}
                </div>
                {checked ? (
                  <>
                    <p className={checked.correct ? 'en-notice' : 'error'} style={{ margin: 0 }}>
                      {checked.correct
                        ? t('listening.questions.correct')
                        : checked.chosen_index === null
                          ? t('listening.questions.skipped', { answer: checked.options[checked.answer_index] ?? '' })
                          : t('listening.questions.wrong', { answer: checked.options[checked.answer_index] ?? '' })}
                    </p>
                    {checked.explanation ? <p className="en-explain" lang="en">{checked.explanation}</p> : null}
                  </>
                ) : null}
              </div>
            );
          })}
        </Panel>
      ) : null}

      {!result && useDictation ? (
        <Panel title={t('listening.dictation.title')}>
          <p className="hint" style={{ margin: 0 }}>{t('listening.dictation.hint')}</p>
          {targets.map((target, index) => {
            const normalKey = `s${target.segment_index}-${RATE.normal}`;
            const slowKey = `s${target.segment_index}-${RATE.slow}`;
            const inputId = `ls-d-${target.segment_index}`;
            return (
              <div key={target.segment_index} className="en-question">
                <label className="eyebrow" htmlFor={inputId} style={{ margin: 0 }}>{t('listening.dictation.sentence', { number: index + 1 })}</label>
                <div className="en-row" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
                  <button type="button" className="quiet" aria-pressed={player.state.key === normalKey} onClick={() => playSentence(target.segment_index, target.segment_text, RATE.normal)}>
                    {player.state.key === normalKey ? t('listening.listen.stop') : t('listening.dictation.play')}
                  </button>
                  <button type="button" className="quiet" aria-pressed={player.state.key === slowKey} onClick={() => playSentence(target.segment_index, target.segment_text, RATE.slow)}>
                    {player.state.key === slowKey ? t('listening.listen.stop') : t('listening.dictation.playSlow')}
                  </button>
                </div>
                <textarea
                  id={inputId}
                  lang="en"
                  rows={2}
                  autoComplete="off"
                  autoCapitalize="sentences"
                  spellCheck={false}
                  value={typed[target.segment_index] ?? ''}
                  disabled={busy}
                  placeholder={t('listening.dictation.placeholder')}
                  onChange={(event) => setTyped((current) => ({ ...current, [target.segment_index]: event.target.value }))}
                />
              </div>
            );
          })}
        </Panel>
      ) : null}

      {!result ? (
        <section className="en-panel">
          {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
          <div className="en-actions">
            <button type="button" className="is-large" disabled={busy || !canCheck} onClick={() => void check()}>
              {busy ? t('listening.check.checking') : t('listening.check.button')}
            </button>
            {!heard ? <span className="hint">{t('listening.check.playFirst')}</span> : null}
            {heard && answered < questions.length ? <span className="hint">{t('listening.check.unanswered')}</span> : null}
          </div>
        </section>
      ) : null}
    </ActivityFrame>
  );
};
