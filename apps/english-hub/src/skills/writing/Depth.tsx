import { useState } from 'react';
import { useT } from '../../i18n';
import { ApiError } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { LevelBadge, Panel } from '../../ui/kit';
import { TextDiff } from '../../components/TextDiff';
import {
  biggestMoves,
  CRITERION_KEYS,
  criterionDeltas,
  rubricSeries,
  sparklinePoints,
} from '../../../../../supabase/functions/_shared/english-writing-depth.ts';
import { getModelAnswer, getRubricHistory, type ModelAnswerResponse, type PreviousRevision, type WritingFeedback } from './api';
import '../../depth.css';

const signed = (value: number): string => (value > 0 ? `+${value}` : String(value));

/** Draft N-1 next to draft N, and how each criterion moved. */
export const RevisionCompare = ({
  previous,
  text,
  feedback,
  revision,
}: {
  previous: PreviousRevision;
  text: string;
  feedback: WritingFeedback;
  revision: number;
}) => {
  const t = useT();
  const deltas = criterionDeltas(
    { overall: previous.overall, criteria: previous.criteria },
    { overall: feedback.overall, criteria: feedback.criteria },
  );
  const moves = biggestMoves(deltas.criteria);
  return (
    <div className="wr-section dp-compare">
      <h3>{t('depth.writing.compareTitle', { before: previous.revision, after: revision })}</h3>
      {deltas.overall.delta !== null ? (
        <p className={deltas.overall.delta > 0 ? 'en-notice' : 'hint'} style={{ margin: 0 }}>
          {deltas.overall.delta > 0
            ? t('depth.writing.up', { before: deltas.overall.before ?? 0, after: deltas.overall.after ?? 0 })
            : deltas.overall.delta === 0
              ? t('depth.writing.sameScore', { score: deltas.overall.after ?? 0 })
              : t('depth.writing.down', { before: deltas.overall.before ?? 0, after: deltas.overall.after ?? 0 })}
          {moves.up ? <> {t('depth.writing.mostImproved', { criterion: t(`writing.criteria.${moves.up.key}`), delta: signed(moves.up.delta ?? 0) })}</> : null}
        </p>
      ) : null}
      <table className="dp-table">
        <caption className="visually-hidden">{t('depth.writing.tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('depth.writing.criterion')}</th>
            <th scope="col">{t('depth.writing.draftN', { number: previous.revision })}</th>
            <th scope="col">{t('depth.writing.draftN', { number: revision })}</th>
            <th scope="col">{t('depth.writing.change')}</th>
          </tr>
        </thead>
        <tbody>
          {deltas.criteria.map((row) => (
            <tr key={row.key}>
              <th scope="row">{t(`writing.criteria.${row.key}`)}</th>
              <td>{row.before ?? '–'}</td>
              <td>{row.after ?? '–'}</td>
              <td className={row.delta === null ? '' : row.delta > 0 ? 'is-up' : row.delta < 0 ? 'is-down' : ''}>
                {row.delta === null ? '–' : signed(row.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <TextDiff
        before={previous.text}
        after={text}
        beforeLabel={t('depth.writing.draftN', { number: previous.revision })}
        afterLabel={t('depth.writing.draftN', { number: revision })}
      />
    </div>
  );
};

const CHART_W = 160;
const CHART_H = 36;

const Sparkline = ({ values, label }: { values: Array<number | null>; label: string }) => {
  const points = sparklinePoints(values, CHART_W, CHART_H);
  if (!points.length) return <span className="hint">–</span>;
  return (
    <svg className="dp-spark" viewBox={`-4 -4 ${CHART_W + 8} ${CHART_H + 8}`} role="img" aria-label={label} preserveAspectRatio="none">
      <line x1={0} x2={CHART_W} y1={CHART_H * 0.4} y2={CHART_H * 0.4} className="dp-spark-guide" />
      {points.length > 1 ? <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} className="dp-spark-line" /> : null}
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 3.5 : 2.2} className="dp-spark-dot" />
      ))}
    </svg>
  );
};

/** The four criteria across the learner's recent submissions, as small lines (no chart library). */
export const RubricHistory = ({ compact = false }: { compact?: boolean }) => {
  const t = useT();
  const history = useResource((signal) => getRubricHistory(signal), []);
  if (history.loading && !history.data) return compact ? null : <Panel title={t('depth.history.title')}><p className="hint">{t('depth.loading')}</p></Panel>;
  if (history.error) return compact ? null : <Panel title={t('depth.history.title')}><p className="hint">{t('depth.history.error')}</p></Panel>;
  const { points, series, trend } = rubricSeries(history.data?.points ?? [], 12);
  if (points.length < 2) {
    return compact ? null : (
      <Panel title={t('depth.history.title')}>
        <p className="hint" style={{ margin: 0 }}>{points.length ? t('depth.history.one') : t('depth.history.empty')}</p>
      </Panel>
    );
  }
  const body = (
    <div className="dp-history">
      <p className="hint" style={{ margin: 0 }}>{t('depth.history.lead', { count: points.length })}</p>
      <ul className="dp-history-rows">
        {CRITERION_KEYS.map((key) => {
          const values = series[key];
          const last = [...values].reverse().find((value): value is number => typeof value === 'number');
          const change = trend[key];
          const name = t(`writing.criteria.${key}`);
          return (
            <li key={key}>
              <strong>{name}</strong>
              <Sparkline values={values} label={t('depth.history.chartLabel', { criterion: name, values: values.filter((value) => value !== null).join(', ') })} />
              <span className="dp-history-last">{last ?? '–'}</span>
              <span className={`dp-history-trend ${change === null ? '' : change > 0 ? 'is-up' : change < 0 ? 'is-down' : ''}`.trim()}>
                {change === null ? '' : change === 0 ? t('depth.history.steady') : signed(change)}
              </span>
            </li>
          );
        })}
      </ul>
      {points.some((point) => point.source === 'basic') ? <p className="hint" style={{ margin: 0 }}>{t('depth.history.basicNote')}</p> : null}
    </div>
  );
  return compact ? <div className="wr-section"><h3>{t('depth.history.title')}</h3>{body}</div> : <Panel title={t('depth.history.title')}>{body}</Panel>;
};

/** A short model answer one level above the learner's, after they have written their own. */
export const ModelAnswer = ({ slug }: { slug: string }) => {
  const t = useT();
  const [data, setData] = useState<ModelAnswerResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await getModelAnswer(slug);
      if (!response.ok || !response.text) setProblem(t('depth.model.unavailable'));
      setData(response);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) setProblem(t('depth.model.needsPlan'));
      else if (cause instanceof ApiError && cause.status === 429) setProblem(t('error.rateLimited'));
      else if (cause instanceof ApiError && cause.code === 'submit_first') setProblem(t('depth.model.submitFirst'));
      else setProblem(t('depth.model.unavailable'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wr-section dp-model">
      <h3>{t('depth.model.title')}</h3>
      {data?.ok && data.text ? (
        <>
          <p className="hint" style={{ margin: 0 }}>
            <LevelBadge level={data.level} /> {t('depth.model.lead', { level: data.level, count: data.word_count })}
          </p>
          <div className="en-passage dp-model-text" lang="en">
            {data.text.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
          {data.notes.length ? (
            <ul className="en-list dp-model-notes">
              {data.notes.map((note) => <li key={note} className="en-explain" lang="en">{note}</li>)}
            </ul>
          ) : null}
          <p className="hint" style={{ margin: 0 }}>{t('depth.model.how')}</p>
        </>
      ) : (
        <>
          <p className="hint" style={{ margin: 0 }}>{t('depth.model.intro')}</p>
          <div className="en-actions">
            <button type="button" className="quiet" disabled={busy} onClick={() => void load()}>
              {busy ? t('depth.model.loading') : t('depth.model.show')}
            </button>
          </div>
          {problem ? <p className="hint" role="status" style={{ margin: 0 }}>{problem}</p> : null}
        </>
      )}
    </div>
  );
};

/** "Draft 1 · 58 → draft 2 · 66" for the task page. */
export const RevisionStrip = ({ revisions }: { revisions: Array<{ revision: number; overall: number | null }> }) => {
  const t = useT();
  if (!revisions.length) return null;
  return (
    <p className="hint dp-strip" style={{ margin: 0 }}>
      {t('depth.writing.yourDrafts')}{' '}
      {revisions.map((entry, index) => (
        <span key={entry.revision}>
          {index ? <span aria-hidden="true"> → </span> : null}
          {t('depth.writing.draftScore', { number: entry.revision, score: entry.overall ?? '–' })}
        </span>
      ))}
    </p>
  );
};
