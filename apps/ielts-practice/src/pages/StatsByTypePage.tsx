import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  practiceDashboardGet,
  srsAddToQueue,
  srsListReviews,
  type SrsReviewItem,
} from '../lib/api';
import { formatPracticeLabel } from '../lib/practiceExperience';
import { useAccess } from '../lib/useAccess';
import { IELTS_PRACTICE_PRODUCT_ID } from '../lib/constants';
import { PracticeShell } from '../components/PracticeShell';

type SectionType = 'reading' | 'listening' | 'writing';

type DiagRow = {
  section_type: SectionType;
  question_type: string;
  samples: number;
  accuracy_ratio: number | null;
  weakness_score: number;
  mastery_level: number | null;
  mastery_status: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toSectionType = (value: unknown): SectionType | null => {
  const text = String(value ?? '').toLowerCase().trim();
  if (text === 'reading' || text === 'listening' || text === 'writing') return text;
  return null;
};

const sectionChipClass = (section: string): string => {
  const value = section.toLowerCase();
  if (value === 'reading') return 'chip reading';
  if (value === 'listening') return 'chip listening';
  if (value === 'writing') return 'chip writing';
  return 'chip';
};

const accuracyClass = (accuracy: number | null): string => {
  if (accuracy == null) return '';
  if (accuracy >= 0.8) return 'positive';
  if (accuracy >= 0.6) return 'warning';
  return 'critical';
};

export const StatsByTypePage = () => {
  const { accessToken } = useAccess();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DiagRow[]>([]);
  const [srsByKey, setSrsByKey] = useState<Map<string, SrsReviewItem>>(new Map());
  const [filter, setFilter] = useState<'all' | SectionType>('all');
  const [sort, setSort] = useState<'weakness' | 'accuracy' | 'samples'>('weakness');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reviewsDueCount, setReviewsDueCount] = useState(0);

  const load = async (): Promise<void> => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [dashboardRes, srsRes] = await Promise.all([
        practiceDashboardGet(accessToken),
        srsListReviews(accessToken, { mode: 'all', limit: 100 }),
      ]);

      const diagRaw = isRecord(dashboardRes.diagnostics_snapshot?.diagnostics)
        ? (dashboardRes.diagnostics_snapshot!.diagnostics as Record<string, unknown>)
        : {};
      const questionTypes = Array.isArray(diagRaw.question_types) ? diagRaw.question_types : [];
      const normalized: DiagRow[] = [];
      for (const entry of questionTypes) {
        if (!isRecord(entry)) continue;
        const section = toSectionType(entry.section_type);
        if (!section) continue;
        normalized.push({
          section_type: section,
          question_type: String(entry.question_type ?? 'question_unknown'),
          samples: Math.max(0, Math.floor(toNumber(entry.samples) ?? 0)),
          accuracy_ratio: toNumber(entry.accuracy_ratio),
          weakness_score: toNumber(entry.weakness_score) ?? 0,
          mastery_level: toNumber(entry.mastery_level),
          mastery_status: typeof entry.mastery_status === 'string' ? entry.mastery_status : null,
        });
      }
      setRows(normalized);

      const map = new Map<string, SrsReviewItem>();
      for (const item of srsRes.items) {
        map.set(`${item.section_type}::${item.question_type}`, item);
      }
      setSrsByKey(map);
      setReviewsDueCount(srsRes.summary?.due ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const filtered = useMemo(() => {
    let list = filter === 'all' ? rows : rows.filter((row) => row.section_type === filter);
    list = [...list];
    if (sort === 'weakness') list.sort((a, b) => b.weakness_score - a.weakness_score);
    else if (sort === 'accuracy') {
      list.sort((a, b) => (a.accuracy_ratio ?? 1) - (b.accuracy_ratio ?? 1));
    } else if (sort === 'samples') list.sort((a, b) => b.samples - a.samples);
    return list;
  }, [filter, rows, sort]);

  const addToQueue = async (row: DiagRow): Promise<void> => {
    if (!accessToken) return;
    const key = `${row.section_type}::${row.question_type}`;
    setBusyKey(key);
    try {
      await srsAddToQueue(accessToken, {
        question_type: row.question_type,
        section_type: row.section_type,
        accuracy_ratio: row.accuracy_ratio ?? 0,
        product_id: IELTS_PRACTICE_PRODUCT_ID,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to queue');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <PracticeShell reviewsDueCount={reviewsDueCount}>
      <header className="practice-page-head">
        <div>
          <span className="eyebrow">Question Types</span>
          <h1>Question Type Library</h1>
          <p className="muted">
            Every IELTS question type you&apos;ve attempted, its accuracy, and its queue status.
            Add a weak type when it needs deliberate review.
          </p>
        </div>
        <div className="kpi-row">
          <Link to="/practice/reviews" className="btn solid compact">Queue</Link>
          <Link to="/dashboard" className="btn ghost compact">Today</Link>
        </div>
      </header>

      <nav className="srs-filter-row">
        {(['all', 'reading', 'listening', 'writing'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`btn ${filter === value ? 'solid' : 'ghost'} compact`}
            onClick={() => setFilter(value)}
          >
            {value === 'all' ? 'All' : `${value.charAt(0).toUpperCase()}${value.slice(1)}`}
          </button>
        ))}
        <span className="filter-sort-group">
          <span className="muted" style={{ fontSize: 12 }}>Sort by</span>
          {(['weakness', 'accuracy', 'samples'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`btn ${sort === value ? 'solid' : 'ghost'} compact`}
              onClick={() => setSort(value)}
            >
              {`${value.charAt(0).toUpperCase()}${value.slice(1)}`}
            </button>
          ))}
        </span>
      </nav>

      {error ? <div className="glass dashboard-alert error">{error}</div> : null}

      {loading ? (
        <article className="glass practice-card">Loading stats...</article>
      ) : filtered.length === 0 ? (
        <article className="glass practice-card">
          <h3>No question-type data yet</h3>
          <p className="muted">
            Complete a few practice labs or simulator attempts. Your per-type stats will populate once your
            diagnostics snapshot has data.
          </p>
        </article>
      ) : (
        <ul className="srs-review-list">
          {filtered.map((row) => {
            const key = `${row.section_type}::${row.question_type}`;
            const srs = srsByKey.get(key) ?? null;
            const accuracyPct = row.accuracy_ratio != null ? `${Math.round(row.accuracy_ratio * 100)}%` : '-';
            const masteryPct = row.mastery_level != null ? `${Math.round(row.mastery_level * 100)}%` : (row.mastery_status ?? '-');
            const isBusy = busyKey === key;

            return (
              <li key={key} className="glass practice-card srs-review-row">
                <div className="srs-review-row-head">
                  <span className={sectionChipClass(row.section_type)}>{row.section_type}</span>
                  <h3>{formatPracticeLabel(row.question_type)}</h3>
                  <span className={`status-pill ${accuracyClass(row.accuracy_ratio)}`} style={{ marginLeft: 'auto' }}>
                    Accuracy {accuracyPct}
                  </span>
                </div>
                <div className="srs-review-row-meta">
                  <span>Samples: {row.samples}</span>
                  <span>Weakness: {row.weakness_score.toFixed(2)}</span>
                  <span>Mastery: {masteryPct}</span>
                  {srs ? (
                    <>
                      <span>SRS box: {srs.leitner_box}/5</span>
                      <span>Reviews: {srs.review_count}</span>
                      {srs.is_archived ? <span style={{ color: 'var(--success, #047857)' }}>Mastered</span> : null}
                    </>
                  ) : (
                    <span className="muted">Not queued</span>
                  )}
                </div>
                <div className="srs-review-row-actions">
                  {srs ? (
                    <Link to="/practice/reviews" className="btn ghost compact">Open in queue</Link>
                  ) : (
                    <button
                      type="button"
                      className="btn solid compact"
                      disabled={isBusy}
                      onClick={() => void addToQueue(row)}
                    >
                      {isBusy ? 'Adding...' : 'Add to queue'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PracticeShell>
  );
};
