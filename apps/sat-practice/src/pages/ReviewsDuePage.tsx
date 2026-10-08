import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Repeat } from 'lucide-react';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { srsDueGet, attemptStart, type NotebookItem, type SatQuestion } from '../lib/api';
import { useAccess } from '../lib/useAccess';

type DueItem = NotebookItem & { question: SatQuestion | null };

export const ReviewsDuePage = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [items, setItems] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [reload, setReload] = useState(0);
  const sending = useRef(false), actor = useRef(accessToken);
  actor.current = accessToken;

  useEffect(() => {
    let active = true;setLoading(true);setItems([]);setError(null);
    if (!accessToken) return () => { active = false; };
    srsDueGet(accessToken).then(res => { if (active) setItems(res.items); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Reviews could not be loaded. Please retry.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, reload]);

  const startReviews = async () => {
    if (!accessToken || loading || sending.current) return;
    const ids = items.map((item) => item.question?.id).filter((id): id is string => Boolean(id));
    if (!ids.length) return;
    sending.current = true;setBusy(true);setError(null);
    try {
      const res = await attemptStart(accessToken, { question_ids: ids, question_count: ids.length });
      if (actor.current === accessToken) navigate(`/lab/${res.attempt.id}`);
    } catch (err) {
      if (actor.current === accessToken) setError(err instanceof Error ? err.message : 'The review start could not be confirmed. Retry the same selection.');
    } finally { sending.current = false;setBusy(false); }
  };

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">Reviews</p>
            <h1>Spaced repetition queue</h1>
            {loading ? <p role="status">Loading due reviews…</p> : !error ? <p>{items.length} questions due now.</p> : null}
          </div>
          <button type="button" className="btn solid" onClick={() => void startReviews()} disabled={loading || busy || items.length === 0}>
            <Repeat size={17} />
            Start reviews
          </button>
        </header>
        {error ? <div role="alert" className="alert error">{error} <button type="button" className="btn" disabled={loading || busy} onClick={() => setReload(value => value + 1)}>Retry loading reviews</button></div> : null}
        <section className="panel">
          {!loading && !error && items.length === 0 ? <div className="empty-state">You are caught up. New misses will appear here on a Leitner schedule.</div> : null}
          <ul className="plan-list">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.mistake_pattern || 'Review item'}</strong>
                  <span>{item.domain.replace(/_/g, ' ')} · {item.difficulty}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
};
