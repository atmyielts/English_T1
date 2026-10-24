import { useId, useState } from 'react';
import { useT } from '../../i18n';
import { daysFromToday, monthsFromToday } from '../../lib/goal';
import type { CefrLevel } from '../../lib/skills';
import { ErrorState, Panel } from '../../ui/kit';

const QUICK = [
  { months: 3, key: 'goalPlan.settings.in3' },
  { months: 6, key: 'goalPlan.settings.in6' },
  { months: 12, key: 'goalPlan.settings.in12' },
] as const;

/** Optional last onboarding step: when the learner wants to reach their target. */
export const GoalDateStep = ({
  target,
  busy,
  error,
  onFinish,
}: {
  target: CefrLevel;
  busy: boolean;
  error: unknown;
  /** `null` when the learner skips the date. */
  onFinish: (date: string | null) => void;
}) => {
  const t = useT();
  const dateId = useId();
  const [date, setDate] = useState('');
  const valid = date >= daysFromToday(1) && date <= daysFromToday(1826);

  return (
    <Panel title={t('goalPlan.onboarding.title', { level: target })}>
      <p>{t('goalPlan.onboarding.body')}</p>
      <div className="en-stack" style={{ gap: '.5rem' }}>
        <label htmlFor={dateId}>{t('goalPlan.settings.date')}</label>
        <input
          id={dateId}
          type="date"
          className="en-goal-date"
          value={date}
          min={daysFromToday(1)}
          max={daysFromToday(1826)}
          onChange={(event) => setDate(event.target.value)}
        />
        <div className="en-segmented">
          {QUICK.map((option) => {
            const value = monthsFromToday(option.months);
            return (
              <button key={option.months} type="button" className={date === value ? 'is-on' : 'quiet'} aria-pressed={date === value} onClick={() => setDate(value)}>
                {t(option.key)}
              </button>
            );
          })}
        </div>
        {date && !valid ? <p className="en-error" role="alert">{t('goalPlan.settings.badDate')}</p> : null}
      </div>
      {error ? <ErrorState error={error} /> : null}
      <div className="en-actions">
        <button type="button" className="is-large" disabled={busy || (Boolean(date) && !valid)} onClick={() => onFinish(valid ? date : null)}>
          {busy ? t('common.saving') : t('goalPlan.onboarding.save')}
        </button>
        <button type="button" className="is-link" disabled={busy} onClick={() => onFinish(null)}>{t('goalPlan.onboarding.skip')}</button>
      </div>
    </Panel>
  );
};
