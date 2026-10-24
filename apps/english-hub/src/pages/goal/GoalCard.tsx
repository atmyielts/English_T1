import { useT } from '../../i18n';
import { getGoal } from '../../lib/goal';
import { useResource } from '../../lib/useResource';
import { ErrorState, Loading, Panel, ProgressBar } from '../../ui/kit';
import { GoalAdvice, GoalStatusTag, GoalTargetLine } from './GoalParts';

/** Today: the goal, this week's minutes against the weekly target, and one line of advice. */
export const GoalCard = () => {
  const t = useT();
  const goal = useResource((signal) => getGoal(signal), []);
  const plan = goal.data;

  return (
    <Panel title={t('goalPlan.card.title')} aside={plan ? <GoalStatusTag status={plan.status} /> : null}>
      {goal.loading && !plan ? <Loading lines={2} /> : null}
      {goal.error && !plan ? <ErrorState error={goal.error} onRetry={goal.reload} /> : null}
      {plan ? (
        <div className="en-goal-card">
          <strong className="en-goal-target"><GoalTargetLine plan={plan} /></strong>
          {plan.status !== 'no_level' && plan.status !== 'reached' ? (
            <div className="en-stack" style={{ gap: '.35rem' }}>
              <small className="hint">
                {t('goalPlan.card.week', { minutes: plan.this_week.minutes, target: plan.this_week.target_minutes })}
              </small>
              <ProgressBar
                value={plan.this_week.target_minutes > 0 ? (plan.this_week.minutes / plan.this_week.target_minutes) * 100 : 0}
                label={t('goalPlan.card.weekLabel')}
              />
            </div>
          ) : null}
          <GoalAdvice plan={plan} fallback={{ to: '/progress', label: t('goalPlan.cta.plan') }} />
        </div>
      ) : null}
    </Panel>
  );
};
