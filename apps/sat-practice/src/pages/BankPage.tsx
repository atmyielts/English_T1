import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SAT_DIFFICULTIES, SAT_DOMAINS, SAT_SECTION_TYPES, formatSatDomain, formatSatSection } from '@schood/sat-core';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { QuestionCard } from '../components/QuestionCard';
import { attemptStart, bankGet, type SatQuestion } from '../lib/api';
import { useAccess } from '../lib/useAccess';

export const BankPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { accessToken } = useAccess();
  const [questions, setQuestions] = useState<SatQuestion[]>([]);
  const [section, setSection] = useState(params.get('section_type') ?? '');
  const [domain, setDomain] = useState(params.get('domain') ?? '');
  const [difficulty, setDifficulty] = useState(params.get('difficulty') ?? '');
  const [history, setHistory] = useState(params.get('mistake_history') ?? '');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!accessToken) return;
    try {
      setQuestions((await bankGet(accessToken, {
        section_type: section as never,
        domain: domain as never,
        difficulty: difficulty as never,
        mistake_history: history,
        limit: 24,
      })).questions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Question bank failed to load');
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken, section, domain, difficulty, history]);

  const startFiltered = async () => {
    if (!accessToken) return;
    const res = await attemptStart(accessToken, {
      section_type: section as never,
      domain: domain as never,
      difficulty: difficulty as never,
      question_count: 10,
    });
    navigate(`/lab/${res.attempt.id}`);
  };

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Question Bank</p>
            <h1>Filterable SAT drills</h1>
          </div>
          <button type="button" className="btn solid" onClick={() => void startFiltered()}>Start filtered drill</button>
        </header>
        {error ? <div className="alert error">{error}</div> : null}
        <section className="filter-bar">
          <select value={section} onChange={(event) => setSection(event.target.value)}>
            <option value="">Any section</option>
            {SAT_SECTION_TYPES.map((entry) => <option key={entry} value={entry}>{formatSatSection(entry)}</option>)}
          </select>
          <select value={domain} onChange={(event) => setDomain(event.target.value)}>
            <option value="">Any domain</option>
            {SAT_DOMAINS.map((entry) => <option key={entry} value={entry}>{formatSatDomain(entry)}</option>)}
          </select>
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
            <option value="">Any difficulty</option>
            {SAT_DIFFICULTIES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
          <select value={history} onChange={(event) => setHistory(event.target.value)}>
            <option value="">Any history</option>
            <option value="previously_missed">Previously missed</option>
            <option value="mastered">Mastered</option>
            <option value="unseen">Unseen</option>
          </select>
        </section>
        <section className="question-grid">
          {questions.map((question) => <QuestionCard key={question.id} question={question} readOnly />)}
        </section>
      </main>
    </div>
  );
};
