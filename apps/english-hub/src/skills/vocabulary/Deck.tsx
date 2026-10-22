import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n, useT } from '../../i18n';
import { saveWords } from '../../lib/notebook';
import { canSpeak, speak } from '../../lib/speech';
import { useElapsedSeconds, useResource } from '../../lib/useResource';
import { Panel, ProgressBar, Tag, useErrorMessage } from '../../ui/kit';
import { ActivityFrame, ResultPanel } from '../ActivityKit';
import { getDeck, submitDeck, type DeckSubmitResponse, type DeckWord, type VocabularyDeck } from './api';
import { buildQuiz } from './quiz';

type Step = 'learn' | 'quiz' | 'finish';

/** Translation in the learner's interface language; both when the interface is English. */
const Translation = ({ word }: { word: DeckWord }) => {
  const t = useT();
  const { locale } = useI18n();
  if (locale === 'ru' && word.translation_ru) return <p className="vocab-translation" lang="ru">{word.translation_ru}</p>;
  if (locale === 'uz' && word.translation_uz) return <p className="vocab-translation" lang="uz">{word.translation_uz}</p>;
  if (!word.translation_ru && !word.translation_uz) return null;
  return (
    <p className="vocab-translation is-small">
      <span className="visually-hidden">{t('vocabulary.learn.translation')}: </span>
      {word.translation_ru ? <span><abbr title={t('vocabulary.learn.ru')}>RU</abbr> <span lang="ru">{word.translation_ru}</span></span> : null}
      {word.translation_uz ? <span><abbr title={t('vocabulary.learn.uz')}>UZ</abbr> <span lang="uz">{word.translation_uz}</span></span> : null}
    </p>
  );
};

const LearnStep = ({ words, onDone }: { words: DeckWord[]; onDone: () => void }) => {
  const t = useT();
  const [index, setIndex] = useState(0);
  const word = words[index];
  if (!word) return null;
  const last = index + 1 >= words.length;

  return (
    <Panel title={t('vocabulary.learn.title')}>
      <p className="hint">{t('vocabulary.learn.lead')}</p>
      <div className="en-row">
        <span className="hint">{t('vocabulary.learn.cardOf', { current: index + 1, total: words.length })}</span>
        <span className="en-spacer" />
        <div style={{ flex: '0 1 14rem' }}>
          <ProgressBar value={((index + 1) / words.length) * 100} label={t('vocabulary.learn.progress')} skill="vocabulary" />
        </div>
      </div>
      <div className="en-flashcard" aria-live="polite">
        {word.part_of_speech ? <Tag>{word.part_of_speech}</Tag> : null}
        <h2 lang="en">{word.word}</h2>
        {canSpeak() ? (
          <button type="button" className="quiet" onClick={() => void speak(word.word)}>▶ {t('vocabulary.learn.listen')}</button>
        ) : null}
        <p lang="en"><strong>{word.definition}</strong></p>
        {word.example ? (
          <p lang="en">
            <em>“{word.example}”</em>
            {canSpeak() ? (
              <>
                {' '}
                <button type="button" className="is-link" aria-label={t('vocabulary.learn.listenExample')} onClick={() => void speak(word.example ?? '', { rate: 0.9 })}>▶</button>
              </>
            ) : null}
          </p>
        ) : null}
        <Translation word={word} />
      </div>
      <div className="en-actions">
        <button type="button" className="quiet" disabled={index === 0} onClick={() => setIndex(index - 1)}>{t('vocabulary.learn.prev')}</button>
        {last ? (
          <button type="button" className="is-large" onClick={onDone}>{t('vocabulary.learn.startQuiz')}</button>
        ) : (
          <button type="button" className="is-large" onClick={() => setIndex(index + 1)}>{t('vocabulary.learn.next')}</button>
        )}
      </div>
      {!last ? (
        <div className="en-actions">
          <button type="button" className="is-link" onClick={onDone}>{t('vocabulary.learn.skip')}</button>
        </div>
      ) : null}
    </Panel>
  );
};

const QuizStep = ({ words, onDone }: { words: DeckWord[]; onDone: (answers: Record<string, string>) => void }) => {
  const t = useT();
  // Remounted (via key) for every round, so each try gets a new order and new options.
  const questions = useMemo(() => buildQuiz(words), [words]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const question = questions[index];
  if (!question) return null;
  const chosen = answers[question.word.id];
  const answered = chosen !== undefined;
  const correct = answered && chosen === question.word.word;
  const last = index + 1 >= questions.length;

  return (
    <Panel title={t('vocabulary.quiz.title')}>
      <p className="hint">{t('vocabulary.quiz.lead')}</p>
      <div className="en-row">
        <span className="hint">{t('vocabulary.quiz.questionOf', { current: index + 1, total: questions.length })}</span>
        <span className="en-spacer" />
        <div style={{ flex: '0 1 14rem' }}>
          <ProgressBar value={((index + (answered ? 1 : 0)) / questions.length) * 100} label={t('vocabulary.quiz.progress')} skill="vocabulary" />
        </div>
      </div>
      <div className="en-question">
        <p className="eyebrow" id={`vocab-q-${index}`}>{t('vocabulary.quiz.prompt')}</p>
        <p className="en-question-prompt vocab-meaning" lang="en">{question.word.definition}</p>
        <div className="en-options" role="group" aria-labelledby={`vocab-q-${index}`}>
          {question.options.map((option, optionIndex) => {
            const isAnswer = option === question.word.word;
            const state = !answered ? '' : isAnswer ? 'is-correct' : option === chosen ? 'is-wrong' : '';
            return (
              <button
                key={option}
                type="button"
                className={`en-option ${state}`.trim()}
                aria-pressed={chosen === option}
                disabled={answered}
                onClick={() => setAnswers((current) => ({ ...current, [question.word.id]: option }))}
                lang="en"
              >
                <span className="en-option-key" aria-hidden="true">{String.fromCharCode(65 + optionIndex)}</span>
                <span>{option}</span>
              </button>
            );
          })}
        </div>
        {answered ? (
          <div aria-live="polite" className="en-stack" style={{ gap: '.5rem' }}>
            <p className={correct ? 'en-notice' : 'error'} style={{ margin: 0 }}>
              {correct ? t('vocabulary.quiz.correct') : t('vocabulary.quiz.wrong', { answer: question.word.word })}
            </p>
            {question.word.example ? <p className="en-explain" lang="en">“{question.word.example}”</p> : null}
          </div>
        ) : null}
      </div>
      {answered ? (
        <div className="en-actions">
          {last ? (
            <button type="button" className="is-large" onClick={() => onDone(answers)}>{t('vocabulary.quiz.finish')}</button>
          ) : (
            <button type="button" className="is-large" onClick={() => setIndex(index + 1)}>{t('vocabulary.quiz.next')}</button>
          )}
        </div>
      ) : null}
    </Panel>
  );
};

/** Saved-words line under the result: what happened, plus a way to save if it did not. */
const SaveOutcome = ({ deck, words, result }: { deck: VocabularyDeck; words: DeckWord[]; result: DeckSubmitResponse }) => {
  const t = useT();
  const errorText = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [savedNow, setSavedNow] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (result.saved && result.saved.added === 0) return <p className="hint">{t('vocabulary.result.alreadySaved')}</p>;
  if (result.saved) return null;
  if (savedNow !== null) return <p className="en-notice">{t('activity.result.savedWords', { count: savedNow })}</p>;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await saveWords(words.map((word) => ({
        word: word.word,
        definition: word.definition,
        example: word.example,
        source_type: 'english-vocabulary-deck',
        source_label: deck.title,
        source_ref: deck.slug,
      })));
      setSavedNow(response.saved);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="en-stack" style={{ gap: '.5rem' }}>
      <p className="hint" style={{ margin: 0 }}>{result.save_requested ? t('vocabulary.result.saveFailed') : t('vocabulary.result.notSaved')}</p>
      <div className="en-actions">
        <button type="button" className="quiet" disabled={busy} onClick={() => void save()}>{busy ? t('common.saving') : t('vocabulary.result.saveNow')}</button>
      </div>
      {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
    </div>
  );
};

export const VocabularyDeckActivity = () => {
  const t = useT();
  const errorText = useErrorMessage();
  const { slug = '' } = useParams();
  const deckRes = useResource((signal) => getDeck(slug, signal), [slug]);
  const elapsed = useElapsedSeconds();
  const [step, setStep] = useState<Step>('learn');
  const [round, setRound] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saveAll, setSaveAll] = useState(true);
  const [result, setResult] = useState<DeckSubmitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const deck = deckRes.data?.deck;
  const words = deckRes.data?.words ?? [];
  const definitionOf = (wordId: string) => words.find((word) => word.id === wordId)?.definition ?? '';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await submitDeck(
        slug,
        Object.entries(answers).map(([word_id, option]) => ({ word_id, option })),
        elapsed(),
        saveAll,
      );
      setResult(response);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setResult(null);
    setAnswers({});
    setRound((value) => value + 1);
    setStep('quiz');
  };

  const missed = result?.results.filter((entry) => !entry.correct) ?? [];

  return (
    <ActivityFrame
      skill="vocabulary"
      title={deck?.title}
      level={deck?.level}
      minutes={deck?.minutes ?? 6}
      lead={deck?.description}
      loading={deckRes.loading && !deckRes.data}
      error={deckRes.error}
      onRetry={deckRes.reload}
    >
      {result && deck ? (
        <ResultPanel
          skill="vocabulary"
          slug={slug}
          score={result.score}
          summary={t('vocabulary.result.summary', { correct: result.correct, total: result.total })}
          good={result.correct > 0 ? [t('vocabulary.result.good', { count: result.correct })] : []}
          fix={missed.map((entry) => (
            <span key={entry.word_id}><strong lang="en">{entry.word}</strong>: <span lang="en">{entry.definition ?? definitionOf(entry.word_id)}</span></span>
          ))}
          savedWords={result.saved?.added}
          onRetry={retry}
        >
          <SaveOutcome deck={deck} words={words} result={result} />
          {result.saved && missed.length ? (
            <div className="en-actions">
              <Link className="en-button-quiet" to="/review">{t('vocabulary.result.review')}</Link>
            </div>
          ) : null}
        </ResultPanel>
      ) : null}

      {!result && step === 'learn' && words.length ? <LearnStep words={words} onDone={() => setStep('quiz')} /> : null}

      {!result && step === 'quiz' && words.length ? (
        <QuizStep
          key={round}
          words={words}
          onDone={(next) => {
            setAnswers(next);
            setStep('finish');
          }}
        />
      ) : null}

      {!result && step === 'finish' ? (
        <Panel title={t('vocabulary.finish.title')}>
          <label className="vocab-check">
            <input type="checkbox" checked={saveAll} onChange={(event) => setSaveAll(event.target.checked)} />
            <span>
              {t('vocabulary.finish.save', { count: words.length })}
              <small className="hint">{t('vocabulary.finish.saveHint')}</small>
            </span>
          </label>
          {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
          <div className="en-actions">
            <button type="button" className="is-large" disabled={busy} onClick={() => void submit()}>
              {busy ? t('vocabulary.finish.submitting') : t('vocabulary.finish.submit')}
            </button>
          </div>
        </Panel>
      ) : null}
    </ActivityFrame>
  );
};
