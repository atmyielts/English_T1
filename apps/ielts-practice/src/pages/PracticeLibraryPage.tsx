import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PracticeShell } from '../components/PracticeShell';
import { useAppT } from '../i18n';
import { getPracticeLibrary, getPracticeLibrarySet, reviewPracticeLibrarySet, type LibraryAnswer, type LibraryContent, type LibraryReview, type LibrarySet } from '../lib/api';
import { useAccess } from '../lib/useAccess';

const skills = ['reading', 'writing', 'speaking'] as const;
const pageSize = 8;

export function PracticeLibraryPage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const { accessToken } = useAccess();
  const t = useAppT();
  const [sets, setSets] = useState<LibrarySet[]>([]);
  const [current, setCurrent] = useState<(LibrarySet & { learner_content: LibraryContent }) | null>(null);
  const [shown, setShown] = useState<Partial<Record<LibrarySet['skill'], number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const selectedTrack = params.get('track');
  const track = selectedTrack === 'academic' || selectedTrack === 'general' ? selectedTrack : 'both';
  const selectedProgress = params.get('progress');
  const progress = selectedProgress === 'new' || selectedProgress === 'reviewed' ? selectedProgress : 'any';
  const query = params.size ? `?${params}` : '';

  const changeFilter = (name: string, value: string, defaultValue: string) => {
    setShown({});
    setParams(current => {
      const next = new URLSearchParams(current);
      if (value === defaultValue) next.delete(name);
      else next.set(name, value);
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    let active = true;
    if (!accessToken) return;
    setLoading(true);
    setError(false);
    setCurrent(null);
    const request = slug ? getPracticeLibrarySet(accessToken, slug) : getPracticeLibrary(accessToken);
    void request.then(result => {
      if (!active) return;
      if ('set' in result) setCurrent(result.set);
      else setSets(result.sets);
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, slug, retry]);

  return <PracticeShell><main className="practice-library">
    <header className="glass dashboard-card">
      {slug ? <Link to={`/library${query}`}>{t('library.title')}</Link> : null}
      <h1>{current?.slug === slug && current ? current.title : t('library.title')}</h1>
      {!slug ? <p>{t('library.intro')}</p> : null}
    </header>
    {loading ? <p role="status">{t('shell.loadingPage')}</p> : null}
    {error ? <div className="glass dashboard-card" role="alert"><p>{t('common.error.generic')}</p><button type="button" className="btn ghost" onClick={() => setRetry(n => n + 1)}>{t('common.retry')}</button></div> : null}
    {!slug && !loading && !error ? <>
      <div className="glass dashboard-card library-filters">
        <label>{t('library.track')}
          <select value={track} onChange={event => changeFilter('track', event.currentTarget.value, 'both')}>
            <option value="both">{t('library.both')}</option>
            <option value="academic">{t('library.academic')}</option>
            <option value="general">{t('library.general')}</option>
          </select>
        </label>
        <label>{t('library.progress')}
          <select value={progress} onChange={event => changeFilter('progress', event.currentTarget.value, 'any')}>
            <option value="any">{t('library.allProgress')}</option>
            <option value="new">{t('library.new')}</option>
            <option value="reviewed">{t('library.reviewed')}</option>
          </select>
        </label>
      </div>
      {skills.map(skill => {
        const available = sets.filter(set => set.skill === skill && (track === 'both' || set.track === track || set.track === 'both'));
        const matches = available.filter(set => progress === 'any' || (progress === 'reviewed') === Boolean(set.progress));
        const count = shown[skill] ?? pageSize;
        return <section className="glass dashboard-card" key={skill}>
          <h2>{t(`section.${skill}`)}</h2>
          <p>{t('library.remaining', { count: available.filter(set => !set.progress).length, total: available.length })}</p>
          {matches.length ? <ul className="library-sets">{matches.slice(0, count).map(set => <li key={set.slug}>
            <Link to={`/library/${set.slug}${query}`}>{set.title}</Link>
            <span>{t(`library.${set.track}`)} · {t('library.minutes', { count: set.minutes })}{set.progress ? ` · ${set.progress.best_correct == null
              ? t('library.reviewed') : t('library.best', { correct: set.progress.best_correct, total: set.progress.question_total ?? 0 })}` : ''}</span>
          </li>)}</ul> : <p>{t('library.empty')}</p>}
          {matches.length > count ? <button className="btn ghost" type="button" onClick={() => setShown(previous => ({ ...previous, [skill]: count + pageSize }))}>
            {t('library.showMore', { skill: t(`section.${skill}`), count: Math.min(pageSize, matches.length - count) })}
          </button> : null}
        </section>;
      })}
      <section className="glass dashboard-card"><h2>{t('section.listening')}</h2><p>{t('library.listeningSoon')}</p></section>
    </> : null}
    {current && current.slug === slug && accessToken && !loading ? <LibraryExercise key={slug} set={current} token={accessToken} /> : null}
  </main></PracticeShell>;
}

function LibraryExercise({ set, token }: { set: LibrarySet & { learner_content: LibraryContent }; token: string }) {
  const t = useAppT();
  const [answers, setAnswers] = useState<Record<number, LibraryAnswer>>({});
  const [response, setResponse] = useState('');
  const [review, setReview] = useState<LibraryReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const content = set.learner_content;
  const questions = content.questions ?? [];
  const answered = questions.every((_, index) => typeof answers[index] === 'number' || String(answers[index] ?? '').trim() !== '');
  const changeAnswer = (index: number, answer: LibraryAnswer) => setAnswers(current => ({ ...current, [index]: answer }));
  const reviewSet = async () => {
    setBusy(true);
    setError(false);
    try { setReview((await reviewPracticeLibrarySet(token, set.slug, questions.map((_, index) => answers[index] ?? ''))).review); }
    catch { setError(true); }
    finally { setBusy(false); }
  };

  return <section className="glass dashboard-card">
    <p>{t(`section.${set.skill}`)} · {t(`library.${set.track}`)} · {t('library.minutes', { count: set.minutes })}</p>
    {content.passage ? <div style={{ whiteSpace: 'pre-wrap' }}>{content.passage}</div> : null}
    {questions.map((question, index) => {
      const feedback = review?.items?.[index];
      const key = feedback?.key;
      const correctAnswer = typeof key === 'number' ? question.options?.[key] : key?.join(' / ');
      return <fieldset key={question.prompt} disabled={busy || !!review}>
        <legend>{index + 1}. {question.prompt}</legend>
        {question.options ? question.options.map((option, optionIndex) => <label className="library-option" key={option}>
          <input type="radio" name={`question-${index}`} checked={answers[index] === optionIndex} onChange={() => changeAnswer(index, optionIndex)} /> {option}
        </label>) : <label className="library-option">{t('library.textAnswer')}
          <input type="text" value={String(answers[index] ?? '')} maxLength={80} autoComplete="off" onChange={event => changeAnswer(index, event.currentTarget.value)} />
        </label>}
        {feedback ? <p>
          <strong>{t(feedback.correct ? 'library.correct' : 'library.incorrect')}</strong>{' '}
          {correctAnswer ? t('library.answer', { answer: correctAnswer }) : ''}{' '}
          {feedback.explanation} {feedback.evidence}
        </p> : null}
      </fieldset>;
    })}
    {content.prompt ? <p style={{ whiteSpace: 'pre-wrap' }}>{content.prompt}</p> : null}
    {content.table ? <div className="library-table"><table aria-label={set.title}>
      <thead><tr>{content.table.headers.map(cell => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
      <tbody>{content.table.rows.map((row, index) => <tr key={index}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
    </table></div> : null}
    {set.skill === 'writing' ? <label>{t('library.yourResponse')}
      <textarea rows={8} value={response} onChange={event => setResponse(event.currentTarget.value)} />
      <span>{t('library.words', { count: response.trim().split(/\s+/).filter(Boolean).length, minimum: content.minimum_words ?? 0 })}</span>
    </label> : null}
    {content.part1 ? <><h2>Part 1</h2><ol>{content.part1.map(item => <li key={item}>{item}</li>)}</ol></> : null}
    {content.part2 ? <><h2>Part 2</h2><p>{t('library.partTwoTiming')}</p><p>{content.part2.cue}</p><ul>{content.part2.points.map(point => <li key={point}>{point}</li>)}</ul></> : null}
    {content.part3 ? <><h2>Part 3</h2><ol>{content.part3.map(item => <li key={item}>{item}</li>)}</ol></> : null}
    {!review ? <button className="btn solid" type="button" disabled={busy || (set.skill === 'reading' && !answered)} onClick={() => void reviewSet()}>
      {busy ? t('common.opening') : t(set.skill === 'reading' ? 'library.check' : 'library.model')}
    </button> : <section aria-live="polite">
      {review.score != null ? <p>{t('library.score', { correct: review.score, total: review.total ?? 0 })}</p> : null}
      {review.score != null ? <button className="btn ghost" type="button" onClick={() => { setAnswers({}); setReview(null); }}>{t('library.tryAgain')}</button> : null}
      {review.model ? <><h2>{t('library.modelTitle')}</h2><div style={{ whiteSpace: 'pre-wrap' }}>{review.model}</div></> : null}
      {[review.planning, review.notes].map((note, index) => note?.length ? <ul key={index}>{note.map(item => <li key={item}>{item}</li>)}</ul> : null)}
    </section>}
    {error ? <p role="alert">{t('common.error.generic')}</p> : null}
  </section>;
}
