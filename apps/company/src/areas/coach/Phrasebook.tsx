// Situation phrasebook (/w/:org/coach/phrasebook): searchable reference with audio and
// translations. The last copy stays in this browser, so a poor connection still shows it.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { canSpeak, speak, stopSpeaking } from '../training/speech.ts';
import { ListenButton, needsSeat, RateToggle, readLocal, useLoad, useLocalized, useRate, writeLocal } from '../training/lib.tsx';
import { Gate, SaveButton, useTranslated, type Dialogue, type Situation } from './lib.tsx';

interface Book { version: string; total: number; situations: Situation[]; saved: string[]; recommended: string[] }
const STORE = 'coach.phrasebook';
const LEVELS = ['a2', 'b1', 'b2'] as const;

export function Phrasebook() {
  const t = useAppT(), pick = useLocalized(), translated = useTranslated();
  const { org } = useWorkspace();
  const { query } = useLocation();
  const { data, error, cause } = useLoad<Book>(`orgs/${org.id}/coach/phrasebook`);
  const [copy] = useState<Book | null>(() => readLocal<Book | null>(STORE, null));
  const [search, setSearch] = useState(''), [level, setLevel] = useState(''), [showBoth, setShowBoth] = useState(false);
  const [situation, setSituation] = useState(query.get('situation') ?? '');
  const [rate, setRate] = useRate();

  // Only a refused seat clears the copy: losing the connection is what the copy is for.
  useEffect(() => { if (data) writeLocal(STORE, data); }, [data]);
  useEffect(() => { if (needsSeat(cause)) writeLocal(STORE, null); }, [cause]);
  const offline = !data && Boolean(error) && !needsSeat(cause) && Boolean(copy);
  const book = data ?? (offline ? copy : null);

  const chosen = situation || book?.recommended[0] || '';
  const needle = search.trim().toLowerCase();
  const results = useMemo(() => {
    if (!book) return [];
    return book.situations
      .filter((entry) => needle || entry.code === chosen)
      .map((entry) => ({
        ...entry,
        phrases: entry.phrases.filter((phrase) => (!level || phrase.level === level) && (!needle || `${phrase.en} ${phrase.ru} ${phrase.uz}`.toLowerCase().includes(needle))),
      }))
      .filter((entry) => entry.phrases.length);
  }, [book, chosen, needle, level]);

  if (!book) return <Gate error={error} cause={cause}/>;
  const saved = new Set(book.saved);
  const count = results.reduce((sum, entry) => sum + entry.phrases.length, 0);
  const recommended = new Set(book.recommended);
  const ordered = [...book.situations].sort((a, b) => Number(recommended.has(b.code)) - Number(recommended.has(a.code)));

  return <div className="coach-page">
    <header className="coach-head">
      <h1>{t('coach.book.title')}</h1>
      <p>{t('coach.book.lead', { count: book.total })}</p>
    </header>
    {offline && <p className="coach-offline" role="status">{t('coach.book.offline')}</p>}

    <section className="coach-card no-print" aria-label={t('coach.book.filters')}>
      <div className="company-toolbar coach-toolbar">
        <label>{t('coach.book.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('coach.book.searchHint')}/></label>
        <label>{t('coach.book.level')}
          <select value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="">{t('coach.book.allLevels')}</option>
            {LEVELS.map((code) => <option key={code} value={code}>{t(`level.${code}` as AppKey)}</option>)}
          </select>
        </label>
      </div>
      <div className="coach-chips" role="group" aria-label={t('coach.book.situations')}>
        {ordered.map((entry) => <button key={entry.code} type="button" aria-pressed={entry.code === chosen && !needle} className={entry.code === chosen && !needle ? '' : 'quiet'} onClick={() => { setSituation(entry.code); setSearch(''); }}>{pick(entry.title)}</button>)}
      </div>
      <p className="company-actions">
        <RateToggle rate={rate} onChange={setRate}/>
        <label className="check"><input type="checkbox" checked={showBoth} onChange={(event) => setShowBoth(event.target.checked)}/>{t('coach.book.both')}</label>
        <button type="button" className="quiet" onClick={() => print()}>{t('coach.book.print')}</button>
      </p>
    </section>

    <p role="status" className="coach-note no-print">{t('coach.book.found', { count })}</p>
    {results.map((entry) => <section key={entry.code} className="coach-card coach-book" aria-labelledby={`coach-book-${entry.code}`}>
      <h2 id={`coach-book-${entry.code}`}>{pick(entry.title)}</h2>
      <p>{pick(entry.lead)}</p>
      {entry.dialogue && !needle && <Conversation org={org.id} dialogue={entry.dialogue} rate={rate} both={showBoth}/>}
      <ul className="coach-rows">
        {entry.phrases.map((phrase) => <li key={phrase.id}>
          <div>
            <strong lang="en">{phrase.en}</strong>
            {showBoth ? <><span lang="ru">{phrase.ru}</span><span lang="uz">{phrase.uz}</span></> : <span>{translated(phrase)}</span>}
            <span className="coach-row-meta">{t(`level.${phrase.level}` as AppKey)} · {t(`coach.tone.${phrase.tone}` as AppKey)}</span>
          </div>
          <div className="coach-row-actions no-print">
            <ListenButton text={phrase.en} rate={rate}/>
            {!offline && <SaveButton phrase={phrase.id} saved={saved.has(phrase.id)}/>}
          </div>
        </li>)}
      </ul>
    </section>)}
    {count === 0 && <p>{t('coach.book.none')}</p>}
  </div>;
}

/** The situation's model conversation: played through with two voices when the browser has them, or line by line. */
function Conversation({ org, dialogue, rate, both }: { org: string; dialogue: Dialogue; rate: number; both: boolean }) {
  const t = useAppT(), pick = useLocalized(), translated = useTranslated();
  const [playing, setPlaying] = useState(false), [line, setLine] = useState<number | null>(null);
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; stopSpeaking(); }, []);
  async function playAll() {
    if (playing) { stop.current = true; stopSpeaking(); setPlaying(false); setLine(null); return; }
    stop.current = false;
    setPlaying(true);
    for (const [index, entry] of dialogue.lines.entries()) {
      if (stop.current) break;
      setLine(index);
      await speak(entry.en, { rate, voice: entry.who === 'a' ? 0 : 1 });
    }
    setPlaying(false); setLine(null);
  }
  return <details className="coach-talk">
    <summary>{t('coach.book.talk', { title: pick(dialogue.title) })}</summary>
    <p className="company-actions no-print">
      {canSpeak() && <button type="button" className="quiet" aria-pressed={playing} onClick={() => void playAll()}>{playing ? t('coach.book.talkStop') : t('coach.book.talkPlay')}</button>}
      <Link className="button-link quiet" to={`/w/${org}/coach/shadow?situation=talk:${dialogue.situation}`}>{t('coach.book.talkShadow')}</Link>
    </p>
    <ol className="coach-talk-lines">
      {dialogue.lines.map((entry, index) => <li key={index} className={`is-${entry.who}${line === index ? ' is-now' : ''}`}>
        <span className="coach-row-meta">{pick(entry.who === 'a' ? dialogue.a : dialogue.b)}</span>
        <strong lang="en">{entry.en}</strong>
        {both ? <><span lang="ru">{entry.ru}</span><span lang="uz">{entry.uz}</span></> : <span>{translated(entry)}</span>}
      </li>)}
    </ol>
  </details>;
}
