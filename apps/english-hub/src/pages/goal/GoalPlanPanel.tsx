import { Link } from 'react-router-dom';
import { useI18n, useT } from '../../i18n';
import { getGoal, goalDateValue, type GoalPlan } from '../../lib/goal';
import { useResource } from '../../lib/useResource';
import { ErrorState, Loading, Panel, Stat } from '../../ui/kit';
import { GoalStatusTag, GoalTargetLine, SETTINGS_GOAL_HREF, useGoalAdvice } from './GoalParts';

/** Last eight weeks as plain CSS bars, with the weekly target as a dashed line. */
const WeekBars = ({ plan }: { plan: GoalPlan }) => {
  const t = useT();
  const { date } = useI18n();
  const target = plan.status === 'reached' || plan.status === 'no_level' ? 0 : plan.this_week.target_minutes;
  const scale = Math.max(target, ...plan.weeks.map((week) => week.minutes), 1);
  const empty = plan.weeks.every((week) => week.minutes === 0);
  return (
    <div className="en-stack" style={{ gap: '.5rem' }}>
      <div className="en-panel-head">
        <h3 style={{ margin: 0 }}>{t('goalPlan.panel.weeksTitle')}</h3>
        {target > 0 ? <small className="hint">{t('goalPlan.panel.targetLine', { minutes: target })}</small> : null}
      </div>
      <div className="en-goal-chart">
        {target > 0 ? (
          <span className="en-goal-line-zone" aria-hidden="true">
            <span className="en-goal-target-line" style={{ bottom: `${(target / scale) * 100}%` }} />
          </span>
        ) : null}
        <ol className="en-goal-bars" aria-label={t('goalPlan.panel.weeksLabel')}>
          {plan.weeks.map((week, index) => {
            const label = date(goalDateValue(week.start), { day: 'numeric', month: 'short' });
            return (
              <li key={week.start} className={index === plan.weeks.length - 1 ? 'is-current' : undefined}>
                <span className="en-goal-bar-track" aria-hidden="true">
                  <span
                    className={`en-goal-bar ${target > 0 && week.minutes >= target ? 'is-met' : ''}`.trim()}
                    style={{ height: `${(week.minutes / scale) * 100}%` }}
                  />
                </span>
                <span className="en-goal-bar-value" aria-hidden="true">{week.minutes}</span>
                <span className="en-goal-bar-label" aria-hidden="true">{label}</span>
                <span className="visually-hidden">{t('goalPlan.panel.weekBar', { date: label, minutes: week.minutes })}</span>
              </li>
            );
          })}
        </ol>
      </div>
      {empty ? <p className="hint">{t('goalPlan.panel.noPractice')}</p> : null}
    </div>
  );
};

/** Progress: the goal, the estimate, the learner's real pace and the projection. */
export const GoalPlanPanel = () => {
  const t = useT();
  const { date } = useI18n();
  const adviceFor = useGoalAdvice();
  const goal = useResource((signal) => getGoal(signal), []);
  const plan = goal.data;
  const advice = plan ? adviceFor(plan) : null;
  const cta = advice?.cta ?? { to: SETTINGS_GOAL_HREF, label: t('goalPlan.cta.change') };

  return (
    <Panel title={t('goalPlan.panel.title')} aside={plan ? <GoalStatusTag status={plan.status} /> : null}>
      {goal.loading && !plan ? <Loading lines={4} /> : null}
      {goal.error && !plan ? <ErrorState error={goal.error} onRetry={goal.reload} /> : null}
      {plan ? (
        <>
          <div className="en-stats">
            <Stat label={t('goalPlan.panel.target')} value={<span className="en-goal-stat-text"><GoalTargetLine plan={plan} /></span>} />
            <Stat
              label={t('goalPlan.panel.hours')}
              value={plan.estimate ? t('goalPlan.panel.hoursValue', { low: plan.estimate.hours_low, high: plan.estimate.hours_high }) : '—'}
              hint={plan.estimate && plan.estimate.hours_needed > 0 ? t('goalPlan.panel.hoursHint', { hours: Math.round(plan.estimate.hours_remaining) }) : undefined}
            />
            <Stat
              label={t('goalPlan.panel.pace')}
              value={plan.pace.enough_data ? t('goalPlan.panel.paceValue', { minutes: plan.pace.minutes_per_week }) : '—'}
              hint={plan.pace.enough_data
                ? plan.pace.days_of_data >= 28 ? t('goalPlan.panel.paceHint') : t('goalPlan.panel.paceNew')
                : t('goalPlan.status.not_enough_data')}
            />
            <Stat
              label={t('goalPlan.panel.projected')}
              value={plan.projection.projected_date && plan.status !== 'reached'
                ? <span className="en-goal-stat-text">{date(goalDateValue(plan.projection.projected_date), { dateStyle: 'medium' })}</span>
                : <span className="en-goal-stat-text">{t('goalPlan.panel.projectedNone')}</span>}
            />
          </div>

          <WeekBars plan={plan} />

          {advice ? <p className="en-goal-advice">{advice.text}</p> : null}
          {plan.target_level && plan.target_date && plan.projection.required_minutes_per_week && plan.status !== 'reached' ? (
            <p className="hint">
              {t('goalPlan.panel.needed', {
                level: plan.target_level,
                date: date(goalDateValue(plan.target_date), { dateStyle: 'medium' }),
                minutes: plan.projection.required_minutes_per_week,
                daily: plan.projection.suggested_daily_minutes ?? Math.ceil(plan.projection.required_minutes_per_week / 7),
              })}
            </p>
          ) : null}
          {plan.estimate && plan.estimate.hours_done_since_level > 0 ? (
            <p className="hint">{t('goalPlan.panel.doneSince', { hours: plan.estimate.hours_done_since_level })}</p>
          ) : null}
          <p className="hint">{t('goalPlan.estimateNote')}</p>
          <div className="en-actions">
            <Link className="en-button-quiet" to={cta.to}>{cta.label}</Link>
          </div>
        </>
      ) : null}
    </Panel>
  );
};
