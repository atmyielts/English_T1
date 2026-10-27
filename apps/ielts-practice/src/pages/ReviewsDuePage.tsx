import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  practiceReviewItemsList,
  srsListReviews,
  srsSubmitReview,
  type ReviewItem,
  type ReviewItemsResponse,
  type SrsReviewItem,
} from '../lib/api';
import { formatPracticeLabel } from '../lib/practiceExperience';
import { useAccess } from '../lib/useAccess';
import { IELTS_PRACTICE_PRODUCT_ID } from '../lib/constants';
import { PracticeShell } from '../components/PracticeShell';
import { ReviewItemCard } from '../components/ReviewItemCard';
import { sectionLabel, useAppT, useErrorText, useFormat, type AppTranslate } from '../i18n';

type SectionType = 'reading' | 'listening' | 'writing';

const sectionChipClass = (section: string): string => {
  const value = section.toLowerCase();
  if (value === 'reading' || value === 'listening' || value === 'writing') return `chip ${value}`;
  return 'chip';
};

const intervalDaysForBox = (box: number): number => [1, 2, 4, 8, 16][Math.min(5, Math.max(1, box)) - 1] ?? 16;

export const dueLabel = (t: AppTranslate, iso: string): string => {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutes <= 0) return t('common.dueNow');
  if (minutes < 60) return t('common.dueInMinutes', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('common.dueInHours', { count: hours });
  return t('common.dueInDays', { count: Math.round(hours / 24) });
};

export const ReviewsDuePage = () => {
  const t = useAppT();
  const fmt = useFormat();
  const errorText = useErrorText();
  const { accessToken } = useAccess();
  const [items, setItems] = useState<SrsReviewItem[]>([]);
  const [summary, setSummary] = useState<{ due: number; mastered: number; total: number }>({ due: 0, mastered: 0, total: 0 });
  const [questionItems, setQuestionItems] = useState<ReviewItem[]>([]);
  const [questionSummary, setQuestionSummary] = useState<ReviewItemsResponse['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | SectionType>('all');

  const load = async (): Promise<void> => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [typeQueue, questionQueue] = await Promise.all([
        srsListReviews(accessToken, { mode: 'daily', limit: 50 }),
        practiceReviewItemsList(accessToken, 'due', 30).catch(() => null),
      ]);
      setItems(typeQueue.items);
      setSummary(typeQueue.summary);
      if (questionQueue) {
        setQuestionItems(questionQueue.items);
        setQuestionSummary(questionQueue.summary);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  const refreshQuestionSummary = async (): Promise<void> => {
    if (!accessToken) return;
    const next = await practiceReviewItemsList(accessToken, 'due', 1).catch(() => null);
    if (next) setQuestionSummary(next.summary);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.section_type === filter)),
    [filter, items],
  );
  const visibleQuestions = useMemo(
    () => (filter === 'all' ? questionItems : questionItems.filter((item) => item.section_type === filter)),
    [filter, questionItems],
  );

  const submit = async (item: SrsReviewItem, kind: 'got_it' | 'need_more'): Promise<void> => {
    if (!accessToken) return;
    setBusyId(item.id);
    setError(null);
    try {
      await srsSubmitReview(accessToken, {
        question_type: item.question_type,
        section_type: item.section_type,
        accuracy_ratio: kind === 'got_it' ? 1 : 0,
        product_id: IELTS_PRACTICE_PRODUCT_ID,
      });
      const res = await srsListReviews(accessToken, { mode: 'daily', limit: 50 });
      setItems(res.items);
      setSummary(res.summary);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyId(null);
    }
  };

  const questionsDue = questionSummary?.due ?? 0;

  return (
    <PracticeShell reviewsDueCount={summary.due + questionsDue}>
      <header className="practice-page-head">
        <div>
          <span className="eyebrow">{t('reviews.eyebrow')}</span>
          <h1>{t('reviews.title')}</h1>
          <p className="muted">{t('reviews.lead')}</p>
        </div>
        <div className="kpi-row">
          <article className="glass kpi-card">
            <span className="eyebrow">{t('reviews.kpi.questionsDue')}</span>
            <strong>{questionsDue}</strong>
          </article>
          <article className="glass kpi-card">
            <span className="eyebrow">{t('reviews.kpi.typesDue')}</span>
            <strong>{summary.due}</strong>
          </article>
          <article className="glass kpi-card">
            <span className="eyebrow">{t('reviews.kpi.mastered')}</span>
            <strong>{summary.mastered + (questionSummary?.mastered ?? 0)}</strong>
          </article>
        </div>
      </header>

      <nav className="srs-filter-row" aria-label={t('reviews.filter.all')}>
        {(['all', 'reading', 'listening', 'writing'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`btn ${filter === value ? 'solid' : 'ghost'} compact`}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {value === 'all' ? t('reviews.filter.all') : sectionLabel(t, value)}
          </button>
        ))}
        <Link to="/practice/stats/by-type" className="btn ghost compact filter-sort-group">
          {t('reviews.filter.byType')}
        </Link>
      </nav>

      {error ? <div className="glass dashboard-alert error" role="alert">{error}</div> : null}

      {loading ? (
        <article className="glass practice-card">{t('reviews.loading')}</article>
      ) : (
        <>
          <section className="review-section" aria-labelledby="review-questions-title">
            <h2 id="review-questions-title">{t('reviews.items.title')}</h2>
            <p className="muted">{t('reviews.items.lead')}</p>
            {visibleQuestions.length === 0 ? (
              <article className="glass practice-card">
                <h3>{t('reviews.items.empty')}</h3>
                <p className="muted">
                  {questionSummary && questionSummary.total > 0
                    ? questionSummary.next_due_at
                      ? t('reviews.items.nextDue', { when: fmt.date(questionSummary.next_due_at) })
                      : t('reviews.items.upcoming', { count: questionSummary.upcoming })
                    : t('reviews.items.emptyNever')}
                </p>
              </article>
            ) : (
              <ul className="srs-review-list">
                {visibleQuestions.map((item) => (
                  <ReviewItemCard key={item.id} accessToken={accessToken} item={item} onAnswered={() => void refreshQuestionSummary()} />
                ))}
              </ul>
            )}
            {questionSummary && questionSummary.upcoming > 0 && visibleQuestions.length > 0 ? (
              <p className="muted">{t('reviews.items.upcoming', { count: questionSummary.upcoming })}</p>
            ) : null}
          </section>

          <section className="review-section" aria-labelledby="review-types-title">
            <h2 id="review-types-title">{t('reviews.types.title')}</h2>
            <p className="muted">{t('reviews.types.lead')}</p>
            {visible.length === 0 ? (
              <article className="glass practice-card">
                <h3>{t('reviews.types.empty')}</h3>
                <p className="muted">{summary.total === 0 ? t('reviews.types.emptyNever') : t('reviews.types.emptyLater')}</p>
                <Link to="/dashboard" className="btn solid compact">{t('reviews.back')}</Link>
              </article>
            ) : (
              <ul className="srs-review-list">
                {visible.map((item) => {
                  const accuracyPct = item.last_accuracy_ratio != null ? fmt.percent(item.last_accuracy_ratio) : '–';
                  const rollingPct = item.rolling_accuracy_ratio != null ? fmt.percent(item.rolling_accuracy_ratio) : '–';
                  const nextBox = Math.min(5, item.leitner_box + 1);
                  const isBusy = busyId === item.id;
                  return (
                    <li key={item.id} className="glass practice-card srs-review-row">
                      <div className="srs-review-row-head">
                        <span className={sectionChipClass(item.section_type)}>{sectionLabel(t, item.section_type)}</span>
                        <h3>{formatPracticeLabel(item.question_type)}</h3>
                        <span className="muted srs-review-row-box">
                          {t('common.box', { box: item.leitner_box })} · {dueLabel(t, item.next_review_at)}
                        </span>
                      </div>
                      <div className="srs-review-row-meta">
                        <span>{t('reviews.row.last', { value: accuracyPct })}</span>
                        <span>{t('reviews.row.rolling', { value: rollingPct })}</span>
                        <span>{t('reviews.row.reviews', { count: item.review_count })}</span>
                        <span>{t('reviews.row.correct', { count: item.correct_count })}</span>
                        <span>{t('reviews.row.wrong', { count: item.incorrect_count })}</span>
                      </div>
                      <div className="srs-review-row-actions">
                        <Link
                          to={`/today?focus_section=${encodeURIComponent(item.section_type)}&focus_question_type=${encodeURIComponent(item.question_type)}&source=reviews`}
                          className="btn solid compact"
                        >
                          {t('reviews.row.drill')}
                        </Link>
                        <button type="button" className="btn ghost compact" disabled={isBusy} onClick={() => void submit(item, 'got_it')}>
                          {isBusy ? t('common.saving') : t('reviews.row.gotIt', { box: nextBox, days: intervalDaysForBox(nextBox) })}
                        </button>
                        <button type="button" className="btn ghost compact" disabled={isBusy} onClick={() => void submit(item, 'need_more')}>
                          {t('reviews.row.needMore')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </PracticeShell>
  );
};
