import { Link } from 'react-router-dom';
import { useI18n, useT } from '../../i18n';
import { goalDateValue, goalTone, type GoalPlan } from '../../lib/goal';
import './goal.css';

export const SETTINGS_GOAL_HREF = '/settings#goal';

export const GoalStatusTag = ({ status }: { status: GoalPlan['status'] }) => {
  const t = useT();
  return <span className={`en-goal-status is-${goalTone(status)}`}>{t(`goalPlan.status.${status}`)}</span>;
};

/** "B2 by 1 Jun 2027", or the target without a date. */
export const GoalTargetLine = ({ plan }: { plan: GoalPlan }) => {
  const t = useT();
  const { date } = useI18n();
  if (!plan.target_level) return <>{t('goalPlan.noTarget')}</>;
  return (
    <>
      {plan.target_date
        ? t('goalPlan.targetBy', { level: plan.target_level, date: date(goalDateValue(plan.target_date), { dateStyle: 'medium' }) })
        : t('goalPlan.targetNoDate', { level: plan.target_level })}
    </>
  );
};

type Advice = { text: string; cta: { to: string; label: string } | null };

/** One honest line on what to do next, with at most one link. */
export const useGoalAdvice = () => {
  const t = useT();
  const { date } = useI18n();
  return (plan: GoalPlan): Advice => {
    const level = plan.target_level ?? '';
    const targetDate = plan.target_date ? date(goalDateValue(plan.target_date), { dateStyle: 'medium' }) : '';
    const required = plan.projection.required_minutes_per_week ?? 0;
    const suggested = plan.projection.suggested_daily_minutes;
    const estimate = plan.estimate;
    const settings = (label: string) => ({ to: SETTINGS_GOAL_HREF, label });

    if (estimate && estimate.hours_needed > 0 && estimate.hours_remaining === 0 && plan.status !== 'date_passed') {
      return { text: t('goalPlan.advice.check'), cta: { to: '/check', label: t('goalPlan.cta.check') } };
    }
    switch (plan.status) {
      case 'no_level':
        return { text: t('goalPlan.advice.no_level'), cta: null };
      case 'reached':
        return { text: t('goalPlan.advice.reached', { level }), cta: settings(t('goalPlan.cta.newTarget')) };
      case 'no_date':
        return plan.target_level
          ? { text: t('goalPlan.advice.no_date', { level }), cta: settings(t('goalPlan.cta.setDate')) }
          : { text: t('goalPlan.advice.noTarget'), cta: settings(t('goalPlan.cta.setDate')) };
      case 'date_passed':
        return { text: t('goalPlan.advice.date_passed'), cta: settings(t('goalPlan.cta.newDate')) };
      case 'not_enough_data':
        return { text: required > 0 ? t('goalPlan.advice.not_enough_data', { minutes: required }) : t('goalPlan.advice.not_enough_data_noDate'), cta: null };
      case 'on_track':
        return {
          text: plan.projection.projected_date
            ? t('goalPlan.advice.on_track', { level, date: date(goalDateValue(plan.projection.projected_date), { dateStyle: 'medium' }) })
            : t('goalPlan.advice.on_track_soon', { level }),
          cta: null,
        };
      case 'slightly_behind':
        return { text: t('goalPlan.advice.slightly_behind', { minutes: required, level, date: targetDate }), cta: null };
      case 'behind':
        return suggested && suggested > plan.daily_minutes
          ? { text: t('goalPlan.advice.behind', { minutes: required, daily: suggested }), cta: settings(t('goalPlan.cta.raiseDaily')) }
          : { text: t('goalPlan.advice.behind_noDaily', { minutes: required, level, date: targetDate }), cta: null };
    }
  };
};

export const GoalAdvice = ({ plan, fallback }: { plan: GoalPlan; fallback?: { to: string; label: string } }) => {
  const advice = useGoalAdvice()(plan);
  const cta = advice.cta ?? fallback ?? null;
  return (
    <>
      <p className="en-goal-advice">{advice.text}</p>
      {cta ? (
        <div className="en-actions">
          <Link className="en-button-quiet" to={cta.to}>{cta.label}</Link>
        </div>
      ) : null}
    </>
  );
};
