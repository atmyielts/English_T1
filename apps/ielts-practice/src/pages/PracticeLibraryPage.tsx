import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PracticeShell } from '../components/PracticeShell';
import { useAppT } from '../i18n';
import { getPracticeLibrary, getPracticeLibrarySet, reviewPracticeLibrarySet, type LibraryContent, type LibraryReview, type LibrarySet } from '../lib/api';
import { useAccess } from '../lib/useAccess';

const skills = ['reading', 'writing', 'speaking'] as const;

export function PracticeLibraryPage() {
  const { slug } = useParams();
  const { accessToken } = useAccess();
  const t = useAppT();
  const [sets, setSets] = useState<LibrarySet[]>([]);
  const [current, setCurrent] = useState<(LibrarySet & { learner_content: LibraryContent }) | null>(null);
  const [track, setTrack] = useState<LibrarySet['track']>('both');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

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
      {slug ? <Link to="/library">{t('library.title')}</Link> : null}
      <h1>{current?.slug === slug && current ? current.title : t('library.title')}</h1>
      {!slug ? <p>{t('library.intro')}</p> : null}
    </header>
    {loading ? <p role="status">{t('shell.loadingPage')}</p> : null}
    {error ? <div className="glass dashboard-card" role="alert"><p>{t('common.error.generic')}</p><button type="button" className="btn ghost" onClick={() => setRetry(n => n + 1)}>{t('common.retry')}</button></div> : null}
    {!slug && !loading && !error ? <>
      <label className="glass dashboard-card">{t('library.track')}
        <select value={track} onChange={event => setTrack(event.currentTarget.value as LibrarySet['track'])}>
          <option value="both">{t('library.both')}</option>
          <option value="academic">{t('library.academic')}</option>
          <option value="general">{t('library.general')}</option>
        </select>
      </label>
      {skills.map(skill => {
        const matches = sets.filter(set => set.skill === skill && (track === 'both' || set.track === track || set.track === 'both'));
        return <section className="glass dashboard-card" key={skill}>
          <h2>{t(`section.${skill}`)}</h2>
          {matches.length ? <ul>{matches.map(set => <li key={set.slug}><Link to={`/library/${set.slug}`}>{set.title}</Link> · {t(`library.${set.track}`)} · {t('library.minutes', { count: set.minutes })}</li>)}</ul> : <p>{t('library.empty')}</p>}
        </section>;
      })}
      <section className="glass dashboard-card"><h2>{t('section.listening')}</h2><p>{t('library.listeningSoon')}</p></section>
    </> : null}
    {current && current.slug === slug && accessToken && !loading ? <LibraryExercise key={slug} set={current} token={accessToken} /> : null}
  </main></PracticeShell>;
}

function LibraryExercise({ set, token }: { set: LibrarySet & { learner_content: LibraryContent }; token: string }) {
  const t = useAppT();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [response, setResponse] = useState('');
  const [review, setReview] = useState<LibraryReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const content = set.learner_content;
  const questions = content.questions ?? [];
  const reviewSet = async () => {
    setBusy(true);
    setError(false);
    try { setReview((await reviewPracticeLibrarySet(token, set.slug, questions.map((_, index) => answers[index] ?? -1))).review); }
    catch { setError(true); }
    finally { setBusy(false); }
  };

  return <section className="glass dashboard-card">
    <p>{t(`section.${set.skill}`)} · {t(`library.${set.track}`)} · {t('library.minutes', { count: set.minutes })}</p>
    {content.passage ? <div style={{ whiteSpace: 'pre-wrap' }}>{content.passage}</div> : null}
    {questions.map((question, index) => <fieldset key={question.prompt} disabled={busy || !!review}>
      <legend>{index + 1}. {question.prompt}</legend>
      {question.options.map((option, optionIndex) => <label className="library-option" key={option}>
        <input type="radio" name={`question-${index}`} checked={answers[index] === optionIndex} onChange={() => setAnswers(current => ({ ...current, [index]: optionIndex }))} /> {option}
      </label>)}
      {review?.items?.[index] ? <p>{t('library.answer', { answer: question.options[review.items[index].key] ?? '' })} {review.items[index].explanation} {review.items[index].evidence}</p> : null}
    </fieldset>)}
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
    {content.part2 ? <><h2>Part 2</h2><p>{content.part2.cue}</p><ul>{content.part2.points.map(point => <li key={point}>{point}</li>)}</ul></> : null}
    {content.part3 ? <><h2>Part 3</h2><ol>{content.part3.map(item => <li key={item}>{item}</li>)}</ol></> : null}
    {!review ? <button className="btn solid" type="button" disabled={busy || (set.skill === 'reading' && Object.keys(answers).length !== questions.length)} onClick={() => void reviewSet()}>
      {busy ? t('common.opening') : t(set.skill === 'reading' ? 'library.check' : 'library.model')}
    </button> : <section aria-live="polite">
      {review.score != null ? <p>{t('library.score', { correct: review.score, total: review.total ?? 0 })}</p> : null}
      {review.model ? <><h2>{t('library.modelTitle')}</h2><div style={{ whiteSpace: 'pre-wrap' }}>{review.model}</div></> : null}
      {[review.planning, review.notes].map((note, index) => note?.length ? <ul key={index}>{note.map(item => <li key={item}>{item}</li>)}</ul> : null)}
    </section>}
    {error ? <p role="alert">{t('common.error.generic')}</p> : null}
  </section>;
}
