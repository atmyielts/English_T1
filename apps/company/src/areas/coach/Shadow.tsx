// Pronunciation and shadowing (/w/:org/coach/shadow): listen, repeat, compare, retry. The
// browser turns speech into text and only the words are compared, which the page says plainly:
// it is practice for saying the phrase clearly, not a measure of pronunciation.
import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link, navigate, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { canRecognize, listen, type Listener } from '../training/speech.ts';
import { ListenButton, RateToggle, useLoad, useLocalized, useRate, type Localized } from '../training/lib.tsx';
import { Gate, Meter, useTranslated } from './lib.tsx';

interface Item { ref: string; en: string; ru: string | null; uz: string | null; speaker?: string | Localized }
interface Round { situation: string; recommended: string[]; items: Item[]; lesson_title: Localized | null; target: number; done_today: number; situations: { code: string; title: Localized }[] }
interface Result { score: number; words: { word: string; ok: boolean }[]; extra: string[]; input: 'speech' | 'typed'; expected: string; passed: boolean; done_today: number; target: number }

export function Shadow() {
  const t = useAppT(), problem = useErrorText(), pick = useLocalized(), translated = useTranslated();
  const { org } = useWorkspace();
  const { query } = useLocation();
  const asked = query.get('situation');
  const { data, error, cause } = useLoad<Round>(`orgs/${org.id}/coach/shadow${asked ? `?situation=${encodeURIComponent(asked)}` : ''}`);
  const [index, setIndex] = useState(0);
  const [heard, setHeard] = useState(''), [listening, setListening] = useState(false), [typedMode, setTypedMode] = useState(!canRecognize());
  const [result, setResult] = useState<Result | null>(null), [doneToday, setDoneToday] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const [rate, setRate] = useRate();
  const listener = useRef<Listener | null>(null);
  const latest = useRef('');

  useEffect(() => () => listener.current?.stop(), []);
  useEffect(() => { setIndex(0); setResult(null); setHeard(''); setFailure(''); }, [asked]);
  if (!data) return <Gate error={error} cause={cause}/>;
  const item = data.items[index % Math.max(1, data.items.length)];
  const done = doneToday ?? data.done_today;

  async function compare(said: string, input: 'speech' | 'typed') {
    if (!said.trim()) { setFailure(t('coach.shadow.nothingHeard')); return; }
    setBusy(true); setFailure('');
    try {
      const answer = await api<Result>(`orgs/${org.id}/coach/shadow`, { method: 'POST', body: { ref: item.ref, said: said.slice(0, 800), input } });
      setResult(answer);
      setDoneToday(answer.done_today);
    } catch (failed) {
      setFailure(problem(failed));
    } finally {
      setBusy(false);
    }
  }

  function record() {
    setFailure(''); setResult(null); setHeard('');
    latest.current = '';
    const started = listen({
      onText: (value) => { latest.current = value; setHeard(value); },
      onEnd: (problemCode) => {
        setListening(false);
        listener.current = null;
        // No microphone or no permission: typing still works, and the page says why it changed.
        if (problemCode && problemCode !== 'no-speech' && problemCode !== 'aborted') {
          setTypedMode(true);
          setFailure(t('coach.shadow.micFailed'));
          return;
        }
        void compare(latest.current, 'speech');
      },
    });
    if (!started) { setTypedMode(true); setFailure(t('coach.shadow.micFailed')); return; }
    listener.current = started;
    setListening(true);
  }

  function next() {
    setIndex(index + 1);
    setResult(null); setHeard(''); setFailure('');
  }

  return <div className="coach-page">
    <header className="coach-head">
      <h1>{t('coach.shadow.title')}</h1>
      <p>{t('coach.shadow.lead')}</p>
    </header>
    <p className="coach-honest"><strong>{t('coach.shadow.honestTitle')}</strong> {t('coach.shadow.honest')}</p>

    <section className="coach-card" aria-label={t('coach.shadow.round')}>
      <div className="company-toolbar coach-toolbar">
        <label>{t('coach.shadow.choose')}
          <select value={data.situation.startsWith('talk:') ? data.situation.slice(5) : data.situation} onChange={(event) => navigate(`/w/${org.id}/coach/shadow?situation=${event.target.value}`, { replace: true })}>
            <option value="lesson">{t('coach.shadow.myLesson')}</option>
            <option value="deck">{t('coach.shadow.myDeck')}</option>
            {data.situations.map((entry) => <option key={entry.code} value={entry.code}>{pick(entry.title)}</option>)}
          </select>
        </label>
        <RateToggle rate={rate} onChange={setRate}/>
      </div>
      <Meter value={done} total={data.target} label={t('coach.shadow.todayMeter')}/>
      <p className="coach-note">{done >= data.target ? t('coach.shadow.enough', { count: done }) : t('coach.shadow.today', { count: done, target: data.target })}</p>
    </section>

    {!item ? <section className="coach-card coach-empty">
      <p>{t('coach.shadow.deckEmpty')}</p>
      <p><Link to={`/w/${org.id}/coach/review`}>{t('coach.nav.review')}</Link></p>
    </section> : <section className="coach-card" aria-labelledby="coach-shadow-phrase">
      <h2 id="coach-shadow-phrase" className="coach-eyebrow">{t('coach.shadow.phraseCount', { index: (index % data.items.length) + 1, total: data.items.length })}</h2>
      {data.lesson_title && <p className="coach-note">{pick(data.lesson_title)}{item.speaker ? ` · ${typeof item.speaker === 'string' ? item.speaker : pick(item.speaker)}` : ''}</p>}
      <p className="coach-phrase-en" lang="en">{item.en}</p>
      {translated(item) && <p className="coach-meaning">{translated(item)}</p>}
      <p className="company-actions"><ListenButton text={item.en} rate={rate}/></p>

      {!typedMode ? <div className="coach-mic">
        <button type="button" disabled={busy} aria-pressed={listening} onClick={() => listening ? listener.current?.stop() : record()}>{listening ? t('coach.shadow.stop') : t('coach.shadow.speak')}</button>
        <button type="button" className="quiet" onClick={() => { listener.current?.stop(); setTypedMode(true); }}>{t('coach.shadow.typeInstead')}</button>
        {(listening || heard) && !result && <p aria-live="polite" className="coach-heard">{heard || t('coach.shadow.listening')}</p>}
      </div> : <form className="coach-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void compare(heard, 'typed'); }}>
        <p className="coach-note">{t('coach.shadow.typedNote')}</p>
        <label>{t('coach.shadow.typeLabel')}<input lang="en" value={heard} maxLength={800} autoComplete="off" onChange={(event) => setHeard(event.target.value)}/></label>
        <p className="company-actions">
          <button type="submit" disabled={busy}>{t('coach.shadow.compare')}</button>
          {canRecognize() && <button type="button" className="quiet" onClick={() => { setTypedMode(false); setHeard(''); setFailure(''); }}>{t('coach.shadow.speakInstead')}</button>}
        </p>
      </form>}
      {failure && <p className="error" role="alert">{failure}</p>}

      {result && <div className="coach-result" role="status">
        <p className="coach-score"><strong>{result.score}%</strong> {t(result.input === 'speech' ? 'coach.shadow.matchedSpeech' : 'coach.shadow.matchedTyped')}</p>
        <p className="coach-words" lang="en">{result.words.map((word, position) => <span key={position} className={word.ok ? 'is-ok' : 'is-missed'}>{word.word}{word.ok ? '' : <span className="visually-hidden"> ({t('coach.shadow.missed')})</span>}</span>)}</p>
        {result.extra.length > 0 && <p className="coach-note">{t('coach.shadow.extra', { words: result.extra.join(', ') })}</p>}
        <p>{t((result.passed ? 'coach.shadow.good' : 'coach.shadow.again') as AppKey)}</p>
        <p className="company-actions">
          <button type="button" className={result.passed ? 'quiet' : ''} onClick={() => { setResult(null); setHeard(''); }}>{t('coach.shadow.retry')}</button>
          <button type="button" className={result.passed ? '' : 'quiet'} onClick={next}>{t('coach.shadow.next')}</button>
        </p>
      </div>}
    </section>}
  </div>;
}
