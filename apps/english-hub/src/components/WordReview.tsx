import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useI18n, useT } from '../i18n';
import { reviewCard, type NotebookCard, type ReviewGrade } from '../lib/notebook';
import { canSpeak, speak } from '../lib/speech';
import { ProgressBar, Segmented, useErrorMessage } from '../ui/kit';
import { previewIntervals, stateOfRow } from '../../../../supabase/functions/_shared/english-srs.ts';
import { blankWord, checkTypedRecall, type TypedRecall } from '../../../../supabase/functions/_shared/english-vocabulary.ts';
import { WordKnowledge, WordTranslation } from './WordKnowledge';
import './wordReview.css';

export type WordReviewMode = 'cards' | 'typed' | 'listen';

type T = ReturnType<typeof useT>;

/** "10 min", "3 d", "2 mo": how long until the card comes back. */
export const intervalLabel = (days: number, t: T): string => {
  if (days < 1) return t('depth.review.inMinutes', { count: Math.max(1, Math.round(days * 24 * 60)) });
  if (days < 30) return t('depth.review.inDays', { count: Math.round(days) });
  if (days < 365) return t('depth.review.inMonths', { count: Math.round(days / 30) });
  return t('depth.review.inYears', { count: Math.round(days / 365) });
};

const GRADE_KEYS: Record<ReviewGrade, string> = { 1: 'depth.review.again', 2: 'depth.review.hard', 3: 'depth.review.good', 4: 'depth.review.easy' };

/** A sentence to blank out for typed recall: the learner's own encounter first, then the example. */
const cueSentence = (card: NotebookCard): string | null => {
  const sentences = [card.context_text, ...(card.contexts ?? []).map((entry) => entry.text), card.example].filter((text): text is string => Boolean(text));
  for (const sentence of sentences) {
    const blanked = blankWord(sentence, card.word);
    if (blanked) return blanked;
  }
  return null;
};

const hasTypedCue = (card: NotebookCard, locale: string): boolean =>
  Boolean(card.definition || (locale === 'ru' && card.translation_ru) || (locale === 'uz' && card.translation_uz) || cueSentence(card));

const Verdict = ({ check, word }: { check: TypedRecall; word: string }) => {
  const t = useT();
  if (check.verdict === 'exact') return <p className="en-notice" role="status" style={{ margin: 0 }}>{t('depth.review.typedExact')}</p>;
  if (check.verdict === 'close') {
    return <p className="en-notice" role="status" style={{ margin: 0 }}>{t('depth.review.typedClose')} <strong lang="en">{word}</strong></p>;
  }
  return <p className="error" role="status" style={{ margin: 0 }}>{t('depth.review.typedWrong')} <strong lang="en">{word}</strong></p>;
};

/**
 * Review saved words one at a time, in three ways:
 * - cards: see the word, recall its meaning, then grade Again / Hard / Good / Easy;
 * - typed: see the meaning (and the learner's own sentence with a gap), type the word;
 * - listen: hear the word, type how it is spelled.
 * Every answer is one review in the shared FSRS schedule.
 */
export const WordReview = ({
  cards,
  onFinished,
  initialMode = 'cards',
}: {
  cards: NotebookCard[];
  onFinished: (remembered: number, total: number) => void;
  initialMode?: WordReviewMode;
}) => {
  const t = useT();
  const { locale } = useI18n();
  const errorText = useErrorMessage();
  const speech = canSpeak();
  const [mode, setMode] = useState<WordReviewMode>(initialMode === 'listen' && !speech ? 'cards' : initialMode);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [check, setCheck] = useState<TypedRecall | null>(null);
  const [remembered, setRemembered] = useState(0);
  const [done, setDone] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const now = useMemo(() => new Date(), []);

  // Typed recall needs something to recall from; cards with no meaning, translation or sentence are skipped there.
  const queue = useMemo(
    () => (mode === 'typed' ? cards.filter((card) => hasTypedCue(card, locale)) : cards),
    [cards, mode, locale],
  );
  const card = queue[index];
  // The card carries its FSRS state as `srs` (the notebook API lifts it out of metadata).
  const preview = useMemo(() => (card ? previewIntervals(stateOfRow({ ...card, metadata: { srs: card.srs } }, now), now) : null), [card, now]);

  const reset = () => {
    setRevealed(false);
    setTyped('');
    setCheck(null);
  };

  const switchMode = (next: WordReviewMode) => {
    setMode(next);
    setIndex(0);
    reset();
  };

  const grade = async (value: ReviewGrade) => {
    if (!card) return;
    setSaving(true);
    setError(null);
    try {
      await reviewCard(card.id, value);
      const nextRemembered = remembered + (value > 1 ? 1 : 0);
      setRemembered(nextRemembered);
      setDone(done + 1);
      if (index + 1 >= queue.length) onFinished(nextRemembered, done + 1);
      else {
        setIndex(index + 1);
        reset();
      }
    } catch (cause) {
      setError(cause);
    } finally {
      setSaving(false);
    }
  };

  const submitTyped = (event: FormEvent) => {
    event.preventDefault();
    if (!card || check) return;
    setCheck(checkTypedRecall(card.word, typed));
  };

  const giveUp = () => {
    if (!card || check) return;
    setCheck({ verdict: 'wrong', grade: 1, distance: card.word.length });
  };

  const play = (rate = 1) => {
    if (card) void speak(card.word, { rate });
  };

  const modes = [
    { value: 'cards' as const, label: t('depth.review.modeCards') },
    { value: 'typed' as const, label: t('depth.review.modeTyped') },
    ...(speech ? [{ value: 'listen' as const, label: t('depth.review.modeListen') }] : []),
  ];

  return (
    <div className="en-stack">
      <Segmented<WordReviewMode> label={t('depth.review.mode')} value={mode} onChange={switchMode} options={modes} />
      {!card ? (
        <p className="hint">{mode === 'typed' ? t('depth.review.noTypedCards') : t('review.none.body')}</p>
      ) : (
        <>
          <div className="en-row">
            <span className="hint">{t('review.cardOf', { current: index + 1, total: queue.length })}</span>
            <span className="en-spacer" />
            <div style={{ flex: '0 1 14rem' }}><ProgressBar value={(index / queue.length) * 100} label={t('review.progress')} skill="vocabulary" /></div>
          </div>

          {mode === 'cards' ? (
            <div className="en-flashcard">
              <p className="eyebrow">{card.source_label ?? t('review.yourWord')}</p>
              <h2 lang="en">{card.word}</h2>
              {speech ? <button type="button" className="quiet" onClick={() => play()}>▶ {t('review.listen')}</button> : null}
              {!revealed ? (
                <>
                  <p>{t('review.recallPrompt')}</p>
                  <div className="en-actions"><button type="button" className="is-large" onClick={() => setRevealed(true)}>{t('review.reveal')}</button></div>
                </>
              ) : (
                <>
                  {card.definition ? <p lang="en"><strong>{card.definition}</strong></p> : null}
                  <WordTranslation word={card} />
                  {card.example ? <p lang="en"><em>“{card.example}”</em></p> : null}
                  {!card.definition && !card.example && !card.context_text ? <p>{t('review.noDefinition')}</p> : null}
                  <WordKnowledge word={{ ...card, contexts: [...(card.context_text ? [{ text: card.context_text, source: card.source_label }] : []), ...(card.contexts ?? [])] }} />
                  <p className="hint" style={{ margin: 0 }}>{t('depth.review.gradeHint')}</p>
                  <div className="wr-grades" role="group" aria-label={t('depth.review.gradeLabel')}>
                    {([1, 2, 3, 4] as ReviewGrade[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`wr-grade is-${value}${value === 3 ? '' : ' quiet'}`}
                        disabled={saving}
                        onClick={() => void grade(value)}
                      >
                        <span>{t(GRADE_KEYS[value])}</span>
                        {preview ? <small>{intervalLabel(preview[value], t)}</small> : null}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="en-flashcard">
              {mode === 'typed' ? (
                <>
                  <p className="eyebrow">{t('depth.review.typedPrompt')}</p>
                  {card.definition ? <p lang="en"><strong>{card.definition}</strong></p> : null}
                  <WordTranslation word={card} />
                  {cueSentence(card) ? <p lang="en" className="wr-cue">{cueSentence(card)}</p> : null}
                  {card.part_of_speech ? <p className="hint" style={{ margin: 0 }}>{card.part_of_speech} · {t('depth.review.letters', { count: card.word.replace(/[^A-Za-z]/g, '').length })}</p> : null}
                </>
              ) : (
                <>
                  <p className="eyebrow">{t('depth.review.listenPrompt')}</p>
                  <div className="en-actions" style={{ justifyContent: 'center' }}>
                    <button type="button" className="is-large" onClick={() => { play(); inputRef.current?.focus(); }}>▶ {t('depth.review.play')}</button>
                    <button type="button" className="quiet" onClick={() => play(0.7)}>{t('depth.review.playSlow')}</button>
                  </div>
                </>
              )}
              <form className="wr-type" onSubmit={submitTyped}>
                <label className="visually-hidden" htmlFor="wr-typed">{t('depth.review.typeLabel')}</label>
                <input
                  id="wr-typed"
                  ref={inputRef}
                  type="text"
                  lang="en"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={typed}
                  disabled={Boolean(check)}
                  placeholder={t('depth.review.typePlaceholder')}
                  onChange={(event) => setTyped(event.target.value)}
                />
                {!check ? (
                  <div className="en-actions">
                    <button type="submit" disabled={!typed.trim()}>{t('depth.review.check')}</button>
                    <button type="button" className="is-link" onClick={giveUp}>{t('depth.review.dontKnow')}</button>
                  </div>
                ) : null}
              </form>
              {check ? (
                <>
                  <Verdict check={check} word={card.word} />
                  {mode === 'listen' && card.definition ? <p lang="en">{card.definition}</p> : null}
                  {mode === 'listen' ? <WordTranslation word={card} /> : null}
                  <WordKnowledge word={card} compact />
                  <div className="en-actions">
                    <button type="button" className="is-large" disabled={saving} onClick={() => void grade(check.grade)}>
                      {t('depth.review.next')}{preview ? ` · ${intervalLabel(preview[check.grade], t)}` : ''}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </>
      )}
      {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
    </div>
  );
};
