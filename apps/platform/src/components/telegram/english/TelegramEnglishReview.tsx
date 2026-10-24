import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Volume2, XCircle } from 'lucide-react';
import { useTgEnglishT } from './strings';
import type { ItemCard, ItemVerdict, ReviewBatch, ReviewCard, TelegramAppCall, WordCard } from './types';

// Due review cards answered inside the Mini App: missed questions (grammar,
// choice, dictation) and saved words. The server checks every answer and
// schedules the card exactly as the English app's Review page does.

const button = 'rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50';
const primary = `${button} bg-gray-950 text-white`;
const quiet = `${button} border border-gray-900 bg-white text-gray-900`;

const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

const speak = (text: string) => {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
};

type Verdict = { correct: boolean; expected: string; explanation: string | null; accuracy?: number };

const Feedback: React.FC<{ verdict: Verdict }> = ({ verdict }) => {
  const { t } = useTgEnglishT();
  return (
    <div
      role="status"
      className={`mt-4 rounded-xl border px-3 py-3 text-sm ${verdict.correct ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}
    >
      <div className="flex items-center gap-2 font-black">
        {verdict.correct ? <CheckCircle2 size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}
        {verdict.correct ? t('rv.correct') : t('rv.wrong')}
      </div>
      {!verdict.correct && verdict.expected ? <div className="mt-1 break-words" lang="en">{t('rv.expected', { answer: verdict.expected })}</div> : null}
      {typeof verdict.accuracy === 'number' ? <div className="mt-1">{t('rv.accuracy', { accuracy: verdict.accuracy })}</div> : null}
      {verdict.explanation ? <div className="mt-1 break-words">{verdict.explanation}</div> : null}
    </div>
  );
};

const ItemQuestion: React.FC<{
  card: ItemCard;
  saving: boolean;
  verdict: Verdict | null;
  onAnswer: (answer: string | number) => void;
}> = ({ card, saving, verdict, onAnswer }) => {
  const { t } = useTgEnglishT();
  const [text, setText] = useState('');
  const audio = canSpeak();

  if (card.type === 'choice') {
    return (
      <div>
        <p className="whitespace-pre-line break-words text-base font-semibold" lang="en">{card.prompt}</p>
        <div className="mt-4 grid gap-2">
          {(card.options ?? []).map((option, index) => (
            <button
              key={`${index}-${option}`}
              type="button"
              disabled={saving || verdict !== null}
              onClick={() => onAnswer(index)}
              className="w-full break-words rounded-xl border border-gray-300 bg-white px-3 py-3 text-left text-sm font-semibold disabled:opacity-70"
              lang="en"
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim() && !saving && !verdict) onAnswer(text.trim());
      }}
    >
      {card.type === 'dictation' ? (
        <>
          <p className="text-sm text-gray-600">{t('rv.dictation')}</p>
          {audio ? (
            <button type="button" onClick={() => speak(card.speak ?? '')} className={`${quiet} mt-3 flex w-full items-center justify-center gap-2`}>
              <Volume2 size={16} aria-hidden /> {t('rv.listen')}
            </button>
          ) : (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('rv.noAudio')}</p>
          )}
        </>
      ) : (
        <>
          {card.instructions ? <p className="text-sm text-gray-600">{card.instructions}</p> : null}
          <p className="mt-2 whitespace-pre-line break-words text-base font-semibold" lang="en">{card.prompt}</p>
        </>
      )}
      <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-gray-500" htmlFor={`answer-${card.id}`}>{t('rv.yourAnswer')}</label>
      <input
        id={`answer-${card.id}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={saving || verdict !== null || (card.type === 'dictation' && !audio)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        lang="en"
        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-gray-900"
      />
      {!verdict ? (
        <button type="submit" disabled={saving || !text.trim()} className={`${primary} mt-3 w-full`}>{t('rv.check')}</button>
      ) : null}
    </form>
  );
};

const WordQuestion: React.FC<{ card: WordCard; saving: boolean; onGrade: (correct: boolean) => void }> = ({ card, saving, onGrade }) => {
  const { t } = useTgEnglishT();
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{t('rv.word')}</p>
      <h3 className="mt-2 break-words text-3xl font-black" lang="en">{card.word}</h3>
      {canSpeak() ? (
        <button type="button" onClick={() => speak(card.word)} className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-gray-600" aria-label={t('rv.listen')}>
          <Volume2 size={16} aria-hidden />
        </button>
      ) : null}
      {!revealed ? (
        <>
          <p className="mt-3 text-sm text-gray-600">{t('rv.recall')}</p>
          <button type="button" onClick={() => setRevealed(true)} className={`${primary} mt-4 w-full`}>{t('rv.reveal')}</button>
        </>
      ) : (
        <>
          {card.definition ? <p className="mt-3 break-words font-semibold" lang="en">{card.definition}</p> : <p className="mt-3 text-sm text-gray-500">{t('rv.noDefinition')}</p>}
          {card.example ? <p className="mt-2 break-words text-sm italic text-gray-600" lang="en">“{card.example}”</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" disabled={saving} onClick={() => onGrade(false)} className={quiet}>{t('rv.again')}</button>
            <button type="button" disabled={saving} onClick={() => onGrade(true)} className={primary}>{t('rv.gotIt')}</button>
          </div>
        </>
      )}
    </div>
  );
};

export const TelegramEnglishReview: React.FC<{ call: TelegramAppCall; onExit: (changed: boolean) => void }> = ({ call, onExit }) => {
  const { t } = useTgEnglishT();
  const [cards, setCards] = useState<ReviewCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  // Cards answered or skipped in this session never come back in it.
  const passed = useRef(new Set<string>());

  const loadBatch = useCallback(async () => {
    setLoadError(false);
    try {
      const batch = (await call('english_review_next', { exclude: [...passed.current] })) as unknown as ReviewBatch;
      setCards(batch.cards ?? []);
      setIndex(0);
    } catch {
      setLoadError(true);
    }
  }, [call]);

  useEffect(() => {
    void loadBatch();
  }, [loadBatch]);

  const card = cards?.[index] ?? null;

  const advance = () => {
    setVerdict(null);
    setSaveError(false);
    if (cards && index + 1 < cards.length) setIndex(index + 1);
    else {
      setCards(null);
      void loadBatch();
    }
  };

  const skip = () => {
    if (card) passed.current.add(card.id);
    advance();
  };

  const answerItem = async (answer: string | number) => {
    if (!card || card.kind !== 'item') return;
    setSaving(true);
    setSaveError(false);
    try {
      const result = (await call('english_review_answer', { kind: 'item', id: card.id, answer })) as unknown as ItemVerdict;
      passed.current.add(card.id);
      setVerdict({ correct: result.correct, expected: result.expected, explanation: result.explanation, accuracy: result.accuracy });
      setAnswered((n) => n + 1);
      if (result.correct) setCorrect((n) => n + 1);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const gradeWord = async (remembered: boolean) => {
    if (!card || card.kind !== 'word') return;
    setSaving(true);
    setSaveError(false);
    try {
      await call('english_review_answer', { kind: 'word', id: card.id, outcome: remembered ? 'correct' : 'incorrect' });
      passed.current.add(card.id);
      setAnswered((n) => n + 1);
      if (remembered) setCorrect((n) => n + 1);
      advance();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={() => onExit(answered > 0)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-bold">
        <ArrowLeft size={15} aria-hidden /> {t('rv.back')}
      </button>
      {card ? <span className="text-xs font-semibold text-gray-500">{t('rv.progress', { current: answered + 1, correct })}</span> : null}
    </div>
  );

  if (loadError) {
    return (
      <section className="rounded-2xl border border-gray-900 bg-white p-4 shadow-[0_2px_0_#111827]">
        {header}
        <p className="mt-4 text-sm font-semibold text-red-700" role="alert">{t('error.title')}</p>
        <button type="button" onClick={() => void loadBatch()} className={`${primary} mt-3 w-full`}>{t('error.retry')}</button>
      </section>
    );
  }

  if (cards === null) {
    return (
      <section className="rounded-2xl border border-gray-900 bg-white p-4 shadow-[0_2px_0_#111827]" aria-busy="true">
        {header}
        <div className="mt-4 space-y-2">
          <div className="h-5 w-2/3 animate-pulse rounded bg-gray-100" />
          <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
        </div>
      </section>
    );
  }

  if (!card) {
    return (
      <section className="rounded-2xl border border-gray-900 bg-white p-4 shadow-[0_2px_0_#111827]">
        {header}
        <div className="mt-4 rounded-xl bg-gray-50 px-4 py-6 text-center">
          <div className="font-black">{answered > 0 ? t('rv.done.title') : t('rv.done.empty')}</div>
          {answered > 0 ? <div className="mt-1 text-sm text-gray-600">{t('rv.done.body', { correct, total: answered })}</div> : null}
        </div>
        <button type="button" onClick={() => onExit(answered > 0)} className={`${primary} mt-4 w-full`}>{t('rv.done.back')}</button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-900 bg-white p-4 shadow-[0_2px_0_#111827]">
      {header}
      <div className="mt-4">
        {card.kind === 'word' ? (
          <WordQuestion key={card.id} card={card} saving={saving} onGrade={(remembered) => void gradeWord(remembered)} />
        ) : (
          <>
            {card.source_title ? <p className="mb-2 text-xs font-semibold text-gray-500">{t('rv.from', { source: card.source_title })}</p> : null}
            <ItemQuestion key={card.id} card={card} saving={saving} verdict={verdict} onAnswer={(answer) => void answerItem(answer)} />
            {verdict ? <Feedback verdict={verdict} /> : null}
          </>
        )}
      </div>
      {saveError ? <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{t('rv.saveError')}</p> : null}
      <div className="mt-4 flex gap-2">
        {verdict ? (
          <button type="button" onClick={advance} className={`${primary} w-full`}>{t('rv.next')}</button>
        ) : (
          <button type="button" onClick={skip} disabled={saving} className="w-full rounded-xl px-4 py-2 text-sm font-bold text-gray-500">{t('rv.skip')}</button>
        )}
      </div>
    </section>
  );
};
