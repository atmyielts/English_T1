// Company glossary for learners (/w/:org/glossary): flashcards, a quiz and the
// full list. Finished rounds are logged as `glossary` activity.
import React, { useMemo, useState } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, useErrorText } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { ListenButton, Loading, useLoad, useMinutes } from './lib.tsx';

export interface Term { id: string; term: string; meaning: string; ru: string | null; uz: string | null; example: string | null; department_id: string | null }

const shuffle = <T,>(items: T[]): T[] => {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
};
const ROUND = 10;

function useTranslationOf() {
  const { locale } = useI18n();
  return (term: Term) => locale === 'uz' ? term.uz ?? term.ru : locale === 'ru' ? term.ru ?? term.uz : term.ru ?? term.uz;
}

export function Glossary() {
  const t = useAppT();
  const { org, departments } = useWorkspace();
  const { data, error } = useLoad<{ terms: Term[]; can_manage: boolean }>(`orgs/${org.id}/glossary`);
  const [tab, setTab] = useState<'cards' | 'quiz' | 'list'>('cards');
  if (!data) return <Loading error={error}/>;
  const tabs = [['cards', t('training.glossary.cards')], ['quiz', t('training.glossary.quiz')], ['list', t('training.glossary.list')]] as const;
  return <div className="training-page">
    <header className="training-head">
      <h1>{t('training.glossary.title')}</h1>
      <p>{t('training.glossary.lead', { company: org.name })}</p>
    </header>
    {data.terms.length === 0 ? <section className="training-card">
      <p>{t('training.glossary.empty')}</p>
      {data.can_manage && <Link className="button-link" to={`/w/${org.id}/glossary-admin`}>{t('training.nav.glossaryAdmin')}</Link>}
    </section> : <>
      <div className="training-tabs" role="tablist" aria-label={t('training.glossary.title')}>
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" id={`training-tab-${id}`} aria-selected={tab === id} aria-controls={`training-panel-${id}`} className={tab === id ? '' : 'quiet'} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <section className="training-card" role="tabpanel" id={`training-panel-${tab}`} aria-labelledby={`training-tab-${tab}`}>
        {tab === 'cards' && <Flashcards org={org.id} terms={data.terms}/>}
        {tab === 'quiz' && <Quiz org={org.id} terms={data.terms}/>}
        {tab === 'list' && <TermList terms={data.terms} departments={departments}/>}
      </section>
      {data.can_manage && <p><Link to={`/w/${org.id}/glossary-admin`}>{t('training.nav.glossaryAdmin')}</Link></p>}
    </>}
  </div>;
}

function Flashcards({ org, terms }: { org: string; terms: Term[] }) {
  const t = useAppT(), problem = useErrorText(), translate = useTranslationOf();
  const { member } = useWorkspace();
  const [deck, setDeck] = useState(() => shuffle(terms).slice(0, ROUND));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [saved, setSaved] = useState(''), [error, setError] = useState('');
  const minutes = useMinutes();
  const done = index >= deck.length;

  async function next(knewIt: boolean) {
    const knownNow = known + (knewIt ? 1 : 0);
    setKnown(knownNow);
    setFlipped(false);
    setIndex(index + 1);
    if (index + 1 >= deck.length && member) {
      try {
        await api(`orgs/${org}/glossary/practice`, { method: 'POST', body: { mode: 'cards', seen: deck.length, known: knownNow, minutes: minutes.take() } });
        setSaved(t('training.glossary.saved'));
      } catch (cause) {
        setError(problem(cause));
      }
    }
  }
  function restart() { setDeck(shuffle(terms).slice(0, ROUND)); setIndex(0); setKnown(0); setFlipped(false); setSaved(''); setError(''); }

  if (done) return <div className="training-round-end" role="status">
    <h2>{t('training.glossary.roundDone')}</h2>
    <p>{t('training.glossary.cardsResult', { known, total: deck.length })}</p>
    {saved && <p className="hint">{saved}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <button type="button" onClick={restart}>{t('training.glossary.again')}</button>
  </div>;
  const card = deck[index];
  return <div className="training-flashcards">
    <p className="hint">{t('training.glossary.cardOf', { n: index + 1, total: deck.length })}</p>
    <div className={`training-flashcard${flipped ? ' is-flipped' : ''}`}>
      <p className="training-flashcard-term" lang="en">{card.term}</p>
      {flipped ? <div aria-live="polite">
        <p lang="en">{card.meaning}</p>
        {translate(card) && <p><strong>{translate(card)}</strong></p>}
        {card.example && <p className="hint" lang="en">“{card.example}”</p>}
      </div> : <p className="hint">{t('training.glossary.think')}</p>}
      <ListenButton text={card.term}/>
    </div>
    <div className="company-actions">
      {!flipped ? <button type="button" onClick={() => setFlipped(true)}>{t('training.glossary.show')}</button> : <>
        <button type="button" onClick={() => void next(true)}>{t('training.glossary.knew')}</button>
        <button type="button" className="quiet" onClick={() => void next(false)}>{t('training.glossary.notYet')}</button>
      </>}
    </div>
  </div>;
}

function Quiz({ org, terms }: { org: string; terms: Term[] }) {
  const t = useAppT(), problem = useErrorText();
  const { member } = useWorkspace();
  const build = () => shuffle(terms).slice(0, ROUND).map((term) => ({
    term,
    options: shuffle([term, ...shuffle(terms.filter((other) => other.id !== term.id)).slice(0, 3)]),
  }));
  const [questions, setQuestions] = useState(build);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ correct: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const minutes = useMinutes();
  if (terms.length < 2) return <p>{t('training.glossary.quizTooFew')}</p>;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const local = { correct: questions.filter((question) => chosen[question.term.id] === question.term.id).length, total: questions.length };
    if (!member) { setResult(local); return; }
    setBusy(true); setError('');
    try {
      setResult(await api<{ correct: number; total: number }>(`orgs/${org}/glossary/practice`, { method: 'POST', body: { mode: 'quiz', minutes: minutes.take(), answers: questions.map((question) => ({ term: question.term.id, choice: chosen[question.term.id] ?? null })) } }));
    } catch (cause) {
      setError(problem(cause));
      setResult(local);
    } finally {
      setBusy(false);
    }
  }
  function restart() { setQuestions(build()); setChosen({}); setResult(null); setError(''); }

  return <form onSubmit={submit} className="training-exercises">
    <p className="hint">{t('training.glossary.quizLead')}</p>
    <ol className="training-items">
      {questions.map((question) => <li key={question.term.id}>
        <fieldset className="training-choice">
          <legend lang="en"><strong>{question.term.term}</strong></legend>
          {question.options.map((option) => <label key={option.id} className="check">
            <input type="radio" name={`quiz-${question.term.id}`} disabled={Boolean(result)} checked={chosen[question.term.id] === option.id} onChange={() => setChosen({ ...chosen, [question.term.id]: option.id })}/>
            <span lang="en">{option.meaning}</span>
          </label>)}
        </fieldset>
        {result && (chosen[question.term.id] === question.term.id
          ? <span className="training-mark good">✓ <span className="visually-hidden">{t('training.exercise.correct')}</span></span>
          : <span className="training-mark bad">✗ {t('training.exercise.answer')} <strong lang="en">{question.term.meaning}</strong></span>)}
      </li>)}
    </ol>
    {error && <p className="error" role="alert">{error}</p>}
    {!result ? <button disabled={busy || Object.keys(chosen).length === 0}>{t('training.exercise.check')}</button> : <div className="notice" role="status">
      <p><strong>{t('training.glossary.quizResult', { correct: result.correct, total: result.total })}</strong></p>
      <button type="button" onClick={restart}>{t('training.glossary.again')}</button>
    </div>}
  </form>;
}

function TermList({ terms, departments }: { terms: Term[]; departments: { id: string; name: string }[] }) {
  const t = useAppT(), translate = useTranslationOf();
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? terms.filter((term) => [term.term, term.meaning, term.ru, term.uz].some((value) => value?.toLowerCase().includes(needle))) : terms;
  }, [terms, search]);
  const department = (id: string | null) => id ? departments.find((entry) => entry.id === id)?.name ?? '' : t('training.glossary.everyone');
  return <>
    <div className="company-toolbar"><label>{t('common.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)}/></label></div>
    <ul className="training-terms">
      {shown.map((term) => <li key={term.id}>
        <div><strong lang="en">{term.term}</strong> <span className="company-badge">{department(term.department_id)}</span></div>
        <p lang="en">{term.meaning}</p>
        {translate(term) && <p><strong>{translate(term)}</strong></p>}
        {term.example && <p className="hint" lang="en">“{term.example}”</p>}
        <ListenButton text={term.term}/>
      </li>)}
    </ul>
    {shown.length === 0 && <p>{t('training.glossary.noMatch')}</p>}
  </>;
}
