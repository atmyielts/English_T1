import { ArrowRight, Check, RefreshCcw } from 'lucide-react';
import type { PlanItem } from '../lib/api';
import { useAppT, type AppKey } from '../i18n';
import { planTaskLabel, planTaskMeta, planTaskReason } from '../lib/labels';

export function PlanItemRow(props: { item: PlanItem; busy?: boolean; onStart: (item: PlanItem) => void }) {
  const t = useAppT();
  const { item } = props;
  const done = item.status === 'completed';
  const p = item.payload as Record<string, unknown>;
  const reason = planTaskReason(t, item);
  const statusKey = (['completed', 'in_progress', 'pending', 'skipped'].includes(item.status) ? `plan.status.${item.status}` : 'plan.status.pending') as AppKey;
  return <li className={`plan-item${done ? ' done' : ''}`}>
    <div>
      <strong>{planTaskLabel(t, item)}</strong>
      <span>{planTaskMeta(t, item)} · <span className={`plan-status ${item.status}`}>{t(statusKey)}</span>
        {done && typeof p.score_raw === 'number' && typeof p.question_count === 'number' ? <> · {t('plan.result', { score: p.score_raw, count: p.question_count })}</> : null}</span>
      {p.note === 'nothing_due' ? <span>{t('plan.nothingDue')}</span> : reason ? <span>{reason}</span> : null}
    </div>
    <button type="button" className={`btn ${done ? 'ghost' : 'solid'} compact`} onClick={() => props.onStart(item)} disabled={props.busy}>
      {done ? <><Check size={16} aria-hidden="true" />{t('plan.again')}</> : <>{item.status === 'in_progress' ? t('plan.continue') : t('plan.start')}<ArrowRight size={16} aria-hidden="true" /></>}
    </button>
  </li>;
}

export const DailyPlanCard = (props: {
  items: PlanItem[];
  busy?: boolean;
  onStart: (item: PlanItem) => void;
  onRegenerate: () => void;
}) => {
  const t = useAppT();
  return <section className="panel daily-plan">
    <div className="section-head">
      <div>
        <p className="eyebrow">{t('plan.todayEyebrow')}</p>
        <h2>{t('plan.todayTitle')}</h2>
      </div>
      <button type="button" className="icon-button" onClick={props.onRegenerate} disabled={props.busy} title={t('plan.rebuild')} aria-label={t('plan.rebuild')}>
        <RefreshCcw size={17} aria-hidden="true" />
      </button>
    </div>
    {props.items.length === 0 ? (
      <div className="empty-state">{t('plan.empty')}</div>
    ) : (
      <ul className="plan-list">
        {props.items.map((item) => <PlanItemRow key={item.id} item={item} busy={props.busy} onStart={props.onStart} />)}
      </ul>
    )}
  </section>;
};
