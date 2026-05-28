import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PracticeShell } from '../components/PracticeShell';
import { IELTS_PRACTICE_PRODUCT_ID } from '../lib/constants';
import {
  srsListReviews,
  srsSubmitReview,
  type SrsListMode,
  type SrsReviewItem,
} from '../lib/api';
import { formatPracticeLabel } from '../lib/practiceExperience';
import { useAccess } from '../lib/useAccess';

type SectionType = 'reading' | 'listening' | 'writing';

const QUEUE_MODES: Array<{ mode: SrsListMode; label: string; description: string }> = [
  { mode: 'daily', label: 'Due now', description: 'Ready to review' },
  { mode: 'upcoming', label: 'Active queue', description: 'Due and scheduled' },
  { mode: 'all', label: 'All tracked', description: 'Every tracked type' },
  { mode: 'mastered', label: 'Mastered', description: 'Archived from daily review' },
];

const EMPTY_COPY: Record<SrsListMode, { title: string; body: string }> = {
  daily: {
    title: 'Nothing due right now.',
    body: 'You are caught up. Items return to the queue on the Leitner schedule.',
  },
  upcoming: {
    title: 'No active queue items.',
    body: 'Add weak question types from Question Types, or complete practice labs to start tracking them automatically.',
  },
  all: {
    title: 'No tracked question types yet.',
    body: 'Add weak question types from Question Types, or complete practice labs to start building the queue.',
  },
  mastered: {
    title: 'No mastered question types yet.',
    body: 'Question types move here after repeated correct reviews.',
  },
};

const sectionChipClass = (section: string): string => {
  const value = section.toLowerCase();
  if (value === 'reading') return 'chip reading';
  if (value === 'listening') return 'chip listening';
  if (value === 'writing') return 'chip writing';
  return 'chip';
};

const intervalDaysForBox = (box: number): number => {
  if (box <= 1) return 1;
  if (box === 2) return 2;
  if (box === 3) return 4;
  if (box === 4) return 8;
  return 16;
};

const formatDueLabel = (iso: string): string => {
  const due = new Date(iso).getTime();
  const diff = due - Date.now();
  const minutes = Math.round(diff / 60000);
  if (minutes <= 0) return 'Due now';
  if (minutes < 60) return `Due in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Due in ${hours} h`;
  const days = Math.round(hours / 24);
  return `Due in ${days} d`;
};

export const ReviewsDuePage = () => {
  const { accessToken } = useAccess();
  const [items, setItems] = useState<SrsReviewItem[]>([]);
  const [summary, setSummary] = useState<{ due: number; mastered: number; total: number }>({ due: 0, mastered: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | SectionType>('all');
  const [mode, setMode] = useState<SrsListMode>('daily');

  const load = async (): Promise<void> => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await srsListReviews(accessToken, { mode, limit: 100 });
      setItems(res.items);
      setSummary(res.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, mode]);

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.section_type === filter)),
    [filter, items],
  );

  const emptyCopy = filter === 'all'
    ? EMPTY_COPY[mode]
    : {
        title: `No ${filter} items in this view.`,
        body: 'Switch sections or open All tracked to see every queued question type.',
      };

  const submit = async (item: SrsReviewItem, kind: 'got_it' | 'need_more'): Promise<void> => {
    if (!accessToken) return;
    setBusyId(item.id);
    setError(null);
    try {
      const accuracy = kind === 'got_it' ? 1 : 0;
      await srsSubmitReview(accessToken, {
        question_type: item.question_type,
        section_type: item.section_type,
        accuracy_ratio: accuracy,
        product_id: IELTS_PRACTICE_PRODUCT_ID,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save review');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PracticeShell reviewsDueCount={summary.due}>
      <header className="practice-page-head">
        <div>
          <span className="eyebrow">Queue</span>
          <h1>Review Queue</h1>
          <p className="muted">
            Question types scheduled by Leitner intervals. Due now is today&apos;s work; Active queue shows what is coming next.
          </p>
        </div>
        <div className="kpi-row">
          <article className="glass kpi-card">
            <span className="eyebrow">Due</span>
            <strong>{summary.due}</strong>
          </article>
          <article className="glass kpi-card">
            <span className="eyebrow">Mastered</span>
            <strong>{summary.mastered}</strong>
          </article>
          <article className="glass kpi-card">
            <span className="eyebrow">Tracked</span>
            <strong>{summary.total}</strong>
          </article>
        </div>
      </header>

      <nav className="queue-mode-row" aria-label="Review queue views">
        {QUEUE_MODES.map((item) => (
          <button
            key={item.mode}
            type="button"
            className={`queue-mode-button ${mode === item.mode ? 'active' : ''}`}
            onClick={() => setMode(item.mode)}
          >
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </nav>

      <nav className="srs-filter-row">
        {(['all', 'reading', 'listening', 'writing'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`btn ${filter === value ? 'solid' : 'ghost'} compact`}
            onClick={() => setFilter(value)}
          >
            {value === 'all' ? 'All sections' : `${value.charAt(0).toUpperCase()}${value.slice(1)}`}
          </button>
        ))}
        <Link to="/practice/stats/by-type" className="btn ghost compact filter-sort-group">
          Question Types
        </Link>
      </nav>

      {error ? <div className="glass dashboard-alert error">{error}</div> : null}

      {loading ? (
        <article className="glass practice-card">Loading review queue...</article>
      ) : visible.length === 0 ? (
        <article className="glass practice-card">
          <h3>{emptyCopy.title}</h3>
          <p className="muted">{emptyCopy.body}</p>
          <div className="inline-actions">
            <Link to="/dashboard" className="btn solid compact">Back to Today</Link>
            <Link to="/practice/stats/by-type" className="btn ghost compact">Question Types</Link>
          </div>
        </article>
      ) : (
        <ul className="srs-review-list">
          {visible.map((item) => {
            const accuracyPct = item.last_accuracy_ratio != null
              ? `${Math.round(item.last_accuracy_ratio * 100)}%`
              : '-';
            const rollingPct = item.rolling_accuracy_ratio != null
              ? `${Math.round(item.rolling_accuracy_ratio * 100)}%`
              : '-';
            const nextDays = intervalDaysForBox(Math.min(5, item.leitner_box + 1));
            const isBusy = busyId === item.id;
            return (
              <li key={item.id} className="glass practice-card srs-review-row">
                <div className="srs-review-row-head">
                  <span className={sectionChipClass(item.section_type)}>{item.section_type}</span>
                  <h3>{formatPracticeLabel(item.question_type)}</h3>
                  <span className="muted" style={{ marginLeft: 'auto' }}>
                    Box {item.leitner_box} / 5 - {item.is_archived ? 'Mastered' : formatDueLabel(item.next_review_at)}
                  </span>
                </div>
                <div className="srs-review-row-meta">
                  <span>Last: {accuracyPct}</span>
                  <span>Rolling: {rollingPct}</span>
                  <span>Reviews: {item.review_count}</span>
                  <span>Correct: {item.correct_count}</span>
                  <span>Wrong: {item.incorrect_count}</span>
                </div>
                <div className="srs-review-row-actions">
                  {item.is_archived ? null : (
                    <button
                      type="button"
                      className="btn solid compact"
                      disabled={isBusy}
                      onClick={() => void submit(item, 'got_it')}
                    >
                      {isBusy ? 'Saving...' : `Got it - move to box ${Math.min(5, item.leitner_box + 1)} (next in ${nextDays}d)`}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn ghost compact"
                    disabled={isBusy}
                    onClick={() => void submit(item, 'need_more')}
                  >
                    {item.is_archived ? 'Move back to active queue' : 'Need more practice - back to box 1'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PracticeShell>
  );
};
