import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useT } from '../../i18n';
import { ApiError } from '../../lib/api';
import { daysFromToday, getGoal, monthsFromToday, saveGoal, type GoalPlan, type GoalUpdate } from '../../lib/goal';
import type { CefrLevel } from '../../lib/skills';
import { useResource } from '../../lib/useResource';
import { ErrorState, Loading, Panel } from '../../ui/kit';
import { GoalStatusTag, useGoalAdvice } from './GoalParts';

const TARGETS: CefrLevel[] = ['A2', 'B1', 'B2', 'C1', 'C2'];
const DAILY = [10, 20, 30, 45, 60] as const;
const QUICK = [
  { months: 3, key: 'goalPlan.settings.in3' },
  { months: 6, key: 'goalPlan.settings.in6' },
  { months: 12, key: 'goalPlan.settings.in12' },
] as const;

type Draft = { level: CefrLevel | null; date: string; daily: number };

const draftOf = (plan: GoalPlan): Draft => ({ level: plan.target_level, date: plan.target_date ?? '', daily: plan.daily_minutes });

/** Settings: target level, the date to reach it, and daily practice time. */
export const GoalSettingsPanel = () => {
  const t = useT();
  const dateId = useId();
  const { hash } = useLocation();
  const { refreshOnboarding } = useEnglish();
  const panelRef = useRef<HTMLDivElement>(null);
  const adviceFor = useGoalAdvice();
  const remote = useResource((signal) => getGoal(signal), []);
  const [plan, setPlan] = useState<GoalPlan | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = plan ?? remote.data;
  const value = draft ?? (current ? draftOf(current) : null);

  useEffect(() => {
    if (hash === '#goal' && current) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, current]);

  const edit = (patch: Partial<Draft>) => {
    if (!value) return;
    setSaved(false);
    setError(null);
    setDraft({ ...value, ...patch });
  };

  const tomorrow = daysFromToday(1);
  const latest = daysFromToday(1826);

  const save = async () => {
    if (!value || !current) return;
    const body: GoalUpdate = {};
    if (value.level && value.level !== current.target_level) body.target_cefr = value.level;
    if ((value.date || null) !== current.target_date) body.target_date = value.date || null;
    if (value.daily !== current.daily_minutes) body.daily_time_minutes = value.daily;
    if (!Object.keys(body).length) {
      setSaved(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await saveGoal(body);
      setPlan(next);
      setDraft(null);
      setSaved(true);
      if (body.target_cefr || body.daily_time_minutes) await refreshOnboarding();
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === 'invalid_target_date' ? t('goalPlan.settings.badDate') : t('goalPlan.settings.error'));
    } finally {
      setSaving(false);
    }
  };

  const suggested = current?.projection.suggested_daily_minutes ?? null;
  const dailyOptions = value && !(DAILY as readonly number[]).includes(value.daily)
    ? [...DAILY, value.daily].sort((a, b) => a - b)
    : [...DAILY];

  return (
    <div id="goal" ref={panelRef} className="en-goal-anchor">
      <Panel title={t('goalPlan.settings.title')} aside={current ? <GoalStatusTag status={current.status} /> : null}>
        {!value ? (remote.error ? <ErrorState error={remote.error} onRetry={remote.reload} /> : <Loading lines={3} />) : (
          <>
            <p className="hint">{t('goalPlan.settings.lead')}</p>
            <div className="en-stack" style={{ gap: '.5rem' }}>
              <h3 style={{ margin: 0 }}>{t('goalPlan.settings.level')}</h3>
              <div className="en-segmented" role="radiogroup" aria-label={t('goalPlan.settings.level')}>
                {TARGETS.map((level) => (
                  <button key={level} type="button" role="radio" aria-checked={value.level === level} className={value.level === level ? 'is-on' : 'quiet'} onClick={() => edit({ level })}>
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div className="en-stack" style={{ gap: '.5rem' }}>
              <label htmlFor={dateId}>{t('goalPlan.settings.date')}</label>
              <input
                id={dateId}
                type="date"
                className="en-goal-date"
                value={value.date}
                min={tomorrow}
                max={latest}
                onChange={(event) => edit({ date: event.target.value })}
              />
              <div className="en-segmented">
                {QUICK.map((option) => (
                  <button key={option.months} type="button" className="quiet" onClick={() => edit({ date: monthsFromToday(option.months) })}>
                    {t(option.key)}
                  </button>
                ))}
                {value.date ? <button type="button" className="quiet" onClick={() => edit({ date: '' })}>{t('goalPlan.settings.clear')}</button> : null}
              </div>
            </div>
            <div className="en-stack" style={{ gap: '.5rem' }}>
              <h3 style={{ margin: 0 }}>{t('goalPlan.settings.daily')}</h3>
              <div className="en-segmented" role="radiogroup" aria-label={t('goalPlan.settings.daily')}>
                {dailyOptions.map((minutes) => (
                  <button key={minutes} type="button" role="radio" aria-checked={value.daily === minutes} className={value.daily === minutes ? 'is-on' : 'quiet'} onClick={() => edit({ daily: minutes })}>
                    {t('common.minutesShort', { count: minutes })}
                  </button>
                ))}
              </div>
              {suggested && suggested > value.daily && !draft ? (
                <div className="en-row">
                  <span className="hint">{t('goalPlan.settings.suggest', { minutes: suggested })}</span>
                  <button type="button" className="is-link" onClick={() => edit({ daily: suggested })}>
                    {t('goalPlan.settings.useSuggest', { minutes: suggested })}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="en-actions">
              <button type="button" disabled={saving} onClick={() => void save()}>{saving ? t('common.saving') : t('goalPlan.settings.save')}</button>
            </div>
            {error ? <p className="en-error" role="alert">{error}</p> : null}
            {saved && current && !error ? (
              <div className="en-stack" style={{ gap: '.5rem' }} role="status">
                <p className="en-notice">{t('goalPlan.settings.saved')}</p>
                <p className="en-goal-advice">{adviceFor(current).text}</p>
              </div>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  );
};
