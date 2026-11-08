// Review (/w/:org/coach/review): the spaced-review session (listen, recall, type) and
// the learner's deck. Answers go to the server one at a time; it schedules the next review.
import React, { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link, navigate, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { canSpeak, speak } from '../training/speech.ts';
import { ListenButton, useDate, useLoad, useRate, RateToggle } from '../training/lib.tsx';
import { Gate, Meter, PrivacyNote, useTranslated, type Card, type CardSource, type ReviewMode } from './lib.tsx';

interface Queue { cards: Card[]; due: number; new_total: number; new_today: number; reviewed_today: number }
interface Answer { status: 'ok' | 'duplicate'; card: Card; match: 'exact' | 'close' | 'wrong' | null; expected: string; again?: boolean; reviewed_today?: number }

export function Review() {
  const t = useAppT();
  const { org } = useWorkspace();
  const { query } = useLocation();
  const tab = query.get('tab') === 'deck' ? 'deck' : 'review';
  return <div className="coach-page">
    <header className="coach-head">
      <h1>{t('coach.review.title')}</h1>
      <p>{t('coach.review.lead')}</p>
    </header>
    <div className="coach-tabs" role="tablist" aria-label={t('coach.review.title')}>
      <button type="button" role="tab" id="coach-tab-review" aria-selected={tab === 'review'} aria-controls="coach-panel" className={tab === 'review' ? '' : 'quiet'} onClick={() => navigate(`/w/${org.id}/coach/review`, { replace: true })}>{t('coach.review.tabReview')}</button>
      <button type="button" role="tab" id="coach-tab-deck" aria-selected={tab === 'deck'} aria-controls="coach-panel" className={tab === 'deck' ? '' : 'quiet'} onClick={() => navigate(`/w/${org.id}/coach/review?tab=deck`, { replace: true })}>{t('coach.review.tabDeck')}</button>
    </div>
    <div id="coach-panel" role="tabpanel" aria-labelledby={`coach-tab-${tab}`}>{tab === 'deck' ? <Deck/> : <Session/>}</div>
    <PrivacyNote/>
  </div>;
}

/** A mode only works if the card and the browser allow it. */
function modeFor(card: Card, hasTranslation: boolean): ReviewMode {
  if (card.mode === 'listen' && !canSpeak()) return hasTranslation ? 'recall' : 'intro';
  if ((card.mode === 'recall' || card.mode === 'type') && !hasTranslation && !card.note) return canSpeak() ? 'listen' : 'intro';
  return card.mode;
}

function Session() {
  const t = useAppT(), problem = useErrorText(), translated = useTranslated();
  const { org } = useWorkspace();
  const { data, error, cause } = useLoad<Queue>(`orgs/${org.id}/coach/queue`);
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [total, setTotal] = useState(0), [answered, setAnswered] = useState(0);
  const [revealed, setRevealed] = useState(false), [typed, setTyped] = useState(''), [result, setResult] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const [rate, setRate] = useRate();
  const input = useRef<HTMLInputElement>(null);
  // Keys for desktop users: 1 to 4 answer, Space shows the answer. Set again on every render, so it always sees the current card.
  const onKey = useRef<(event: KeyboardEvent) => void>(() => undefined);
  onKey.current = () => undefined;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey.current(event);
    addEventListener('keydown', listener);
    return () => removeEventListener('keydown', listener);
  }, []);

  useEffect(() => {
    if (data && queue === null) {
      setQueue(data.cards);
      setTotal(data.cards.length);
    }
  }, [data]);
  const card = queue?.[0] ?? null;
  const translation = card ? translated(card) : '';
  const mode = card ? modeFor(card, Boolean(translation)) : 'intro';

  // A listening card starts by speaking; the first hearing needs no extra click.
  useEffect(() => {
    if (card && mode === 'listen') void speak(card.front, { rate });
    if (card && mode === 'type') input.current?.focus();
  }, [card?.id, card?.reps]);

  if (!data || queue === null) return <Gate error={error} cause={cause}/>;

  function advance(answer: Answer | null) {
    setResult(null); setRevealed(false); setTyped(''); setFailure('');
    setQueue((current) => {
      if (!current) return current;
      const rest = current.slice(1);
      // "Again" comes back later in the session, without counting as a new card to do.
      return answer?.again ? [...rest, answer.card] : rest;
    });
    if (!answer?.again) setAnswered((value) => value + 1);
  }

  async function submit(body: Record<string, unknown>, autoNext: boolean) {
    if (!card || busy) return;
    setBusy(true); setFailure('');
    try {
      const answer = await api<Answer>(`orgs/${org.id}/coach/reviews`, { method: 'POST', body: { card: card.id, reps: card.reps, mode, ...body } });
      if (autoNext) advance(answer);
      else setResult(answer);
    } catch (failed) {
      setFailure(problem(failed));
    } finally {
      setBusy(false);
    }
  }

  if (!total) return <section className="coach-card coach-empty">
    <h2>{t('coach.review.nothing')}</h2>
    <p>{t('coach.review.nothingBody')}</p>
    <p className="company-actions">
      <Link className="button-link quiet" to={`/w/${org.id}/today`}>{t('coach.nav.today')}</Link>
      <Link className="button-link quiet" to={`/w/${org.id}/coach/phrasebook`}>{t('coach.nav.phrasebook')}</Link>
    </p>
  </section>;

  if (!card) return <section className="coach-finished" aria-labelledby="coach-done">
    <h2 id="coach-done">{t('coach.review.done')}</h2>
    <p>{t('coach.review.doneBody', { count: answered })}</p>
    <p className="company-actions"><Link className="button-link" to={`/w/${org.id}/today`}>{t('coach.review.backToday')}</Link></p>
  </section>;

  onKey.current = (event) => {
    const target = event.target as HTMLElement;
    if (busy || event.ctrlKey || event.metaKey || event.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (event.key === ' ' && target.tagName !== 'BUTTON' && !revealed && (mode === 'listen' || mode === 'recall')) {
      event.preventDefault();
      setRevealed(true);
    } else if (mode === 'intro' && (event.key === '1' || event.key === '3')) {
      void submit({ grade: Number(event.key) }, true);
    } else if (revealed && (mode === 'listen' || mode === 'recall') && ['1', '2', '3', '4'].includes(event.key)) {
      void submit({ grade: Number(event.key) }, true);
    }
  };

  const grades = <div className="coach-grades" role="group" aria-label={t('coach.review.howWell')}>
    {([1, 2, 3, 4] as const).map((grade) => <button key={grade} type="button" className={grade === 3 ? '' : 'quiet'} disabled={busy} onClick={() => void submit({ grade }, true)}>{t(`coach.grade.${grade}` as AppKey)}</button>)}
  </div>;
  const english = <p className="coach-phrase-en" lang="en">{card.front}</p>;
  const meaning = translation ? <p className="coach-meaning">{translation}</p> : null;
  const note = card.note ? <p className="coach-note">{card.note}</p> : null;

  return <section className="coach-card coach-session" aria-live="polite">
    <Meter value={answered} total={total} label={t('coach.review.progress')}/>
    <p className="coach-session-count">{t('coach.review.count', { count: answered, total })} · {t(`coach.mode.${mode}` as AppKey)} · {t(`coach.source.${card.source}` as AppKey)}</p>

    {mode === 'intro' && <>
      {english}{meaning}{note}
      <p className="company-actions"><ListenButton text={card.front} rate={rate}/><RateToggle rate={rate} onChange={setRate}/></p>
      <div className="coach-grades">
        <button type="button" disabled={busy} onClick={() => void submit({ grade: 3 }, true)}>{t('coach.review.gotIt')}</button>
        <button type="button" className="quiet" disabled={busy} onClick={() => void submit({ grade: 1 }, true)}>{t('coach.review.showAgain')}</button>
      </div>
    </>}

    {mode === 'listen' && <>
      <p>{t('coach.review.listenAsk')}</p>
      <p className="company-actions"><ListenButton text={card.front} rate={rate}/><RateToggle rate={rate} onChange={setRate}/></p>
      {revealed ? <>{english}{meaning}{note}{grades}</> : <button type="button" onClick={() => setRevealed(true)}>{t('coach.review.reveal')}</button>}
    </>}

    {mode === 'recall' && <>
      <p>{t('coach.review.recallAsk')}</p>
      {meaning ?? note}
      {revealed ? <>{english}{meaning && note}
        <p className="company-actions"><ListenButton text={card.front} rate={rate}/></p>{grades}</> : <button type="button" onClick={() => setRevealed(true)}>{t('coach.review.reveal')}</button>}
    </>}

    {mode === 'type' && <>
      <p>{t('coach.review.typeAsk')}</p>
      {meaning ?? note}
      {!result ? <form className="coach-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void submit({ typed }, false); }}>
        <label>{t('coach.review.typeLabel')}
          <input ref={input} value={typed} lang="en" autoComplete="off" autoCapitalize="sentences" spellCheck={false} maxLength={400} onChange={(event) => setTyped(event.target.value)}/>
        </label>
        <p className="company-actions">
          <button type="submit" disabled={busy}>{t('coach.review.check')}</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => void submit({ typed: '' }, false)}>{t('coach.review.dontKnow')}</button>
        </p>
      </form> : <>
        <p className={`coach-verdict is-${result.match}`} role="status">{t(`coach.match.${result.match ?? 'wrong'}` as AppKey)}</p>
        {english}{meaning && note}
        <p className="company-actions">
          <ListenButton text={card.front} rate={rate}/>
          <button type="button" onClick={() => advance(result)}>{t('coach.review.next')}</button>
        </p>
      </>}
    </>}
    {failure && <p className="error" role="alert">{failure}</p>}
    {mode !== 'type' && <p className="coach-note coach-keys">{t('coach.review.keys')}</p>}
  </section>;
}

const SOURCES: CardSource[] = ['own', 'finder', 'phrasebook', 'lesson', 'glossary'];
const PAGE = 60;

function Deck() {
  const t = useAppT(), problem = useErrorText(), translated = useTranslated(), when = useDate();
  const { org } = useWorkspace();
  const { data, error, cause, reload } = useLoad<{ cards: Card[]; stats: { total: number; learned: number; due: number; new: number; paused: number }; max: number }>(`orgs/${org.id}/coach/deck`);
  const [search, setSearch] = useState(''), [source, setSource] = useState<CardSource | ''>(''), [shown, setShown] = useState(PAGE), [difficult, setDifficult] = useState(false);
  const [form, setForm] = useState({ front: '', ru: '', uz: '', note: '' });
  const [failure, setFailure] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const cards = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.cards ?? []).filter((card) => (!source || card.source === source) && (!difficult || card.lapses >= 2) && (!needle || `${card.front} ${card.ru ?? ''} ${card.uz ?? ''} ${card.note ?? ''}`.toLowerCase().includes(needle)));
  }, [data, search, source, difficult]);
  if (!data) return <Gate error={error} cause={cause}/>;

  async function act(run: () => Promise<unknown>, done?: string) {
    setBusy(true); setFailure(''); setNotice('');
    try {
      await run();
      await reload();
      if (done) setNotice(done);
    } catch (failed) {
      setFailure(problem(failed));
    } finally {
      setBusy(false);
    }
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      const answer = await api<{ already: boolean }>(`orgs/${org.id}/coach/cards`, { method: 'POST', body: { front: form.front, ru: form.ru, uz: form.uz, note: form.note, source: 'own' } });
      setForm({ front: '', ru: '', uz: '', note: '' });
      if (answer.already) throw new Error(t('coach.deck.already'));
    }, t('coach.deck.added'));
  }
  async function exportCsv() {
    await act(async () => {
      const { csv, filename } = await api<{ csv: string; filename: string }>(`orgs/${org.id}/coach/deck/export`);
      const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: filename });
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  return <div className="coach-stack">
    <div className="company-grid coach-tiles">
      <div className="company-stat"><strong>{data.stats.total}</strong><span>{t('coach.deck.total')}</span></div>
      <div className="company-stat"><strong>{data.stats.due}</strong><span>{t('coach.deck.due')}</span></div>
      <div className="company-stat"><strong>{data.stats.new}</strong><span>{t('coach.deck.new')}</span></div>
      <div className="company-stat"><strong>{data.stats.learned}</strong><span>{t('coach.deck.learned')}</span></div>
    </div>

    <details className="coach-card">
      <summary>{t('coach.deck.addTitle')}</summary>
      <form className="coach-form" onSubmit={(event) => void add(event)}>
        <label>{t('coach.deck.front')}<input required minLength={2} maxLength={300} lang="en" value={form.front} onChange={(event) => setForm({ ...form, front: event.target.value })}/></label>
        <label>{t('coach.deck.ru')}<input maxLength={300} lang="ru" value={form.ru} onChange={(event) => setForm({ ...form, ru: event.target.value })}/></label>
        <label>{t('coach.deck.uz')}<input maxLength={300} lang="uz" value={form.uz} onChange={(event) => setForm({ ...form, uz: event.target.value })}/></label>
        <label>{t('coach.deck.note')}<input maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })}/></label>
        <p className="company-actions"><button type="submit" disabled={busy}>{t('coach.deck.add')}</button></p>
      </form>
    </details>

    <section className="coach-card" aria-label={t('coach.review.tabDeck')}>
      <div className="company-toolbar coach-toolbar">
        <label>{t('coach.deck.search')}<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setShown(PAGE); }}/></label>
        <label>{t('coach.deck.source')}
          <select value={source} onChange={(event) => { setSource(event.target.value as CardSource | ''); setShown(PAGE); }}>
            <option value="">{t('coach.deck.allSources')}</option>
            {SOURCES.map((code) => <option key={code} value={code}>{t(`coach.source.${code}` as AppKey)}</option>)}
          </select>
        </label>
        <label className="check coach-check"><input type="checkbox" checked={difficult} onChange={(event) => { setDifficult(event.target.checked); setShown(PAGE); }}/>{t('coach.deck.difficult')}</label>
        <button type="button" className="quiet" disabled={busy} onClick={() => void exportCsv()}>{t('coach.deck.export')}</button>
      </div>
      {failure && <p className="error" role="alert">{failure}</p>}
      {notice && <p role="status">{notice}</p>}
      {cards.length === 0 ? <p>{t('coach.deck.empty')}</p> : <ul className="coach-rows">
        {cards.slice(0, shown).map((card) => <li key={card.id} className={card.suspended ? 'is-paused' : ''}>
          <div>
            <strong lang="en">{card.front}</strong>
            {translated(card) && <span>{translated(card)}</span>}
            {card.note && <span className="coach-row-note">{card.note}</span>}
            <span className="coach-row-meta">
              {t(`coach.source.${card.source}` as AppKey)} · {card.suspended ? t('coach.deck.paused') : card.due_on ? t('coach.deck.next', { date: when(card.due_on) }) : t('coach.deck.notStarted')}
            </span>
          </div>
          <div className="coach-row-actions">
            <ListenButton text={card.front}/>
            <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api(`orgs/${org.id}/coach/cards/${card.id}`, { method: 'PATCH', body: { suspended: !card.suspended } }))}>{card.suspended ? t('coach.deck.resume') : t('coach.deck.pause')}</button>
            <button type="button" className="quiet" disabled={busy} onClick={() => { if (confirm(t('coach.deck.removeConfirm'))) void act(() => api(`orgs/${org.id}/coach/cards/${card.id}`, { method: 'DELETE' })); }}>{t('coach.deck.remove')}</button>
          </div>
        </li>)}
      </ul>}
      {cards.length > shown && <button type="button" className="quiet" onClick={() => setShown(shown + PAGE)}>{t('coach.deck.more', { count: cards.length - shown })}</button>}
    </section>
  </div>;
}
