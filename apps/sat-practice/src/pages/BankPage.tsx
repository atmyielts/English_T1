import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SAT_DIFFICULTIES, SAT_DOMAINS, SAT_SECTION_TYPES, formatSatDomain, formatSatSection, type SatDomain } from '@schood/sat-core';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { QuestionCard } from '../components/QuestionCard';
import { attemptStart, bankGet, type SatQuestion } from '../lib/api';
import { useAccess } from '../lib/useAccess';

const mathDomains: readonly SatDomain[] = ['algebra', 'advanced_math', 'problem_solving_data_analysis', 'geometry_trig'];
const domainSection = (domain: string) => mathDomains.includes(domain as SatDomain) ? 'math' : 'reading_writing';

export const BankPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { accessToken } = useAccess();
  const section = params.get('section_type') ?? '';
  const domain = params.get('domain') ?? '';
  const difficulty = params.get('difficulty') ?? '';
  const history = params.get('mistake_history') ?? '';
  const [questions, setQuestions] = useState<SatQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const startPending = useRef(false);
  const actor = useRef(accessToken);
  actor.current = accessToken;

  const changeFilter = (name: string, value: string) => {
    setParams(current => {
      const next = new URLSearchParams(current);
      value ? next.set(name, value) : next.delete(name);
      if (name === 'section_type' && value && domain && domainSection(domain) !== value) next.delete('domain');
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setQuestions([]);
    setError(null);
    if (!accessToken) return () => { active = false; };
    bankGet(accessToken, {
      section_type: section as never, domain: domain as never,
      difficulty: difficulty as never, mistake_history: history, limit: 24,
    }).then(result => {
      if (active) setQuestions(result.questions);
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'Question bank failed to load. Please retry.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, section, domain, difficulty, history, reload]);

  const startFiltered = async () => {
    if (!accessToken || loading || !questions.length || startPending.current) return;
    startPending.current = true;
    setStarting(true);
    setError(null);
    try {
      const result = await attemptStart(accessToken, {
        section_type: section as never, domain: domain as never,
        difficulty: difficulty as never, mistake_history: history, question_count: 10,
      });
      if (actor.current === accessToken) navigate(`/lab/${result.attempt.id}`);
    } catch (err) {
      if (actor.current === accessToken) setError(err instanceof Error ? err.message : 'The drill could not be started. Please retry.');
    } finally {
      startPending.current = false;
      setStarting(false);
    }
  };

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Question Bank</p>
            <h1>Filterable SAT drills</h1>
            <p>Start a drill with up to 10 questions matching these filters.</p>
          </div>
          <button type="button" className="btn solid" disabled={loading || starting || !questions.length || !accessToken} onClick={() => void startFiltered()}>
            {starting ? 'Starting drill…' : 'Start filtered drill'}
          </button>
        </header>
        {error ? <div className="alert error" role="alert">{error} <button type="button" className="btn" disabled={loading || starting} onClick={() => setReload(value => value + 1)}>Retry</button></div> : null}
        <fieldset className="filter-bar bank-filters" disabled={starting}>
          <legend>Choose practice questions</legend>
          <label>Section
            <select value={section} onChange={event => changeFilter('section_type', event.target.value)}>
              <option value="">Any section</option>
              {SAT_SECTION_TYPES.map(entry => <option key={entry} value={entry}>{formatSatSection(entry)}</option>)}
            </select>
          </label>
          <label>Domain
            <select value={domain} onChange={event => changeFilter('domain', event.target.value)}>
              <option value="">Any domain</option>
              {SAT_DOMAINS.filter(entry => !section || domainSection(entry) === section).map(entry => <option key={entry} value={entry}>{formatSatDomain(entry)}</option>)}
            </select>
          </label>
          <label>Difficulty
            <select value={difficulty} onChange={event => changeFilter('difficulty', event.target.value)}>
              <option value="">Any difficulty</option>
              {SAT_DIFFICULTIES.map(entry => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
          <label>Your history
            <select value={history} onChange={event => changeFilter('mistake_history', event.target.value)}>
              <option value="">Any history</option>
              <option value="previously_missed">Previously missed</option>
              <option value="mastered">Repeatedly correct</option>
              <option value="unseen">Unseen</option>
            </select>
          </label>
        </fieldset>
        <p role="status">{loading ? 'Loading matching questions…' : !error ? questions.length ? `Showing ${questions.length} matching questions.` : 'No questions match these filters. Try another domain, difficulty, or history.' : ''}</p>
        <section className="question-grid" aria-label="Matching questions" aria-busy={loading}>
          {questions.map(question => <QuestionCard key={question.id} question={question} readOnly />)}
        </section>
      </main>
    </div>
  );
};
