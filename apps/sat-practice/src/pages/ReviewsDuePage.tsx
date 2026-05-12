import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!accessToken) return;
    srsDueGet(accessToken).then((res) => setItems(res.items)).catch(() => null);
  }, [accessToken]);

  const startReviews = async () => {
    if (!accessToken) return;
    const ids = items.map((item) => item.question?.id).filter((id): id is string => Boolean(id));
    const res = await attemptStart(accessToken, { question_ids: ids, question_count: Math.max(1, ids.length) });
    navigate(`/lab/${res.attempt.id}`);
  };

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">Reviews</p>
            <h1>Spaced repetition queue</h1>
            <p>{items.length} questions due now.</p>
          </div>
          <button type="button" className="btn solid" onClick={() => void startReviews()} disabled={items.length === 0}>
            <Repeat size={17} />
            Start reviews
          </button>
        </header>
        <section className="panel">
          {items.length === 0 ? <div className="empty-state">You are caught up. New misses will appear here on a Leitner schedule.</div> : null}
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
