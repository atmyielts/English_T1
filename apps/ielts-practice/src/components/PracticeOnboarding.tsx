import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Calendar, Check, Target } from 'lucide-react';
import { practiceGeneratePlan, practiceGoalsPatch, type PracticeGoal } from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { sectionLabel, useAppT, useErrorText, useFormat } from '../i18n';

interface Props {
  goals: PracticeGoal | null;
  onComplete: () => void;
}

type Step = 'target' | 'date' | 'current' | 'minutes' | 'summary';
type Skill = 'reading' | 'listening' | 'writing' | 'speaking';

const STEPS: Step[] = ['target', 'date', 'current', 'minutes', 'summary'];

const DEFAULT_TARGET_BAND = 6.5;
const DEFAULT_DAILY_MINUTES = 60;

const isOnboarded = (goals: PracticeGoal | null): boolean => {
  // While the dashboard is still loading goals are null. Treat that as
  // "already onboarded" so the modal doesn't flash open then snap closed.
  if (!goals) return true;
  if (goals.metadata && typeof goals.metadata === 'object' && (goals.metadata as Record<string, unknown>).onboarded_at) return true;
  // Existing users who customised their goal before this wizard shipped.
  if (goals.target_overall_band !== DEFAULT_TARGET_BAND) return true;
  if (goals.daily_practice_minutes && goals.daily_practice_minutes !== DEFAULT_DAILY_MINUTES) return true;
  return false;
};

export const PracticeOnboarding = ({ goals, onComplete }: Props) => {
  const t = useAppT();
  const fmt = useFormat();
  const errorText = useErrorText();
  const { accessToken } = useAccess();
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex] ?? 'summary';
  const [target, setTarget] = useState(() => goals?.target_overall_band ?? 7.0);
  const [targetDate, setTargetDate] = useState(() => goals?.target_date ?? '');
  const [currentBand, setCurrentBand] = useState(5.5);
  const [weakSkill, setWeakSkill] = useState<Skill>('writing');
  const [dailyMinutes, setDailyMinutes] = useState(() => goals?.daily_practice_minutes ?? 45);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = !isOnboarded(goals);

  useEffect(() => {
    if (!targetDate) {
      const eightWeeks = new Date(Date.now() + 56 * 24 * 60 * 60 * 1000);
      setTargetDate(eightWeeks.toISOString().slice(0, 10));
    }
  }, [targetDate]);

  const totalWeeks = useMemo(() => {
    if (!targetDate) return null;
    const diff = new Date(targetDate).getTime() - Date.now();
    return Math.max(1, Math.ceil(diff / (7 * 24 * 60 * 60 * 1000)));
  }, [targetDate]);

  if (!visible) return null;

  const next = () => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
  const back = () => setStepIndex((i) => Math.max(0, i - 1));

  const submit = async () => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const startISO = new Date().toISOString().slice(0, 10);
      const programDays = Math.max(7, Math.round((new Date(targetDate).getTime() - new Date(`${startISO}T00:00:00Z`).getTime()) / (24 * 60 * 60 * 1000)));
      await practiceGoalsPatch(accessToken, {
        target_overall_band: target,
        // Speaking is a real practice area now, so the learner's choice is kept as chosen.
        target_section_bands: { [weakSkill]: target },
        practice_start_date: startISO,
        program_duration_days: programDays,
        daily_practice_minutes: dailyMinutes,
        focus_modes: [weakSkill],
        metadata: {
          onboarded_at: new Date().toISOString(),
          current_band_self_rated: currentBand,
          weak_skill: weakSkill,
        },
      });
      // The first plan leads with the weak skill's lab when one is published.
      await practiceGeneratePlan(accessToken, {
        refresh_diagnostics: true,
        ...(weakSkill !== 'speaking' ? { focus_section: weakSkill } : {}),
      });
      onComplete();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const bigNumber = { fontFamily: 'Fraunces, serif', fontSize: '3rem', fontWeight: 600, letterSpacing: '-0.025em' } as const;
  const weeksText = totalWeeks != null ? t('onb.date.weeks', { count: totalWeeks }) : '—';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-heading"
      style={{ position: 'fixed', inset: 0, background: 'rgba(26, 24, 20, 0.5)', display: 'grid', placeItems: 'center', zIndex: 40, padding: 16, overflowY: 'auto' }}
    >
      <div className="glass onboarding-card" style={{ width: 'min(620px, 100%)', display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <p className="eyebrow" style={{ margin: 0 }}>{t('onb.eyebrow')}</p>
          <span className="muted" style={{ fontSize: 12 }}>{t('onb.step', { n: stepIndex + 1, total: STEPS.length })}</span>
        </div>

        {step === 'target' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 id="onboarding-heading" style={{ margin: 0 }}>{t('onb.target.title')}</h1>
            <p className="muted" style={{ margin: 0 }}>{t('onb.target.lead')}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <strong style={bigNumber}>{fmt.band(target)}</strong>
              <span className="muted">{t('onb.target.overall')}</span>
            </div>
            <input type="range" min={5} max={9} step={0.5} value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label={t('onb.target.title')} />
            <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>{fmt.band(5)}</span><span>{fmt.band(9)}</span>
            </div>
          </div>
        ) : null}

        {step === 'date' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 id="onboarding-heading" style={{ margin: 0 }}>{t('onb.date.title')}</h1>
            <p className="muted" style={{ margin: 0 }}>{t('onb.date.lead')}</p>
            <input
              type="date"
              className="practice-input"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              style={{ fontSize: 16 }}
              aria-label={t('onb.date.title')}
            />
            {totalWeeks != null ? (
              <p style={{ margin: 0 }}>
                <Calendar size={14} style={{ verticalAlign: -2, marginRight: 6 }} aria-hidden="true" />
                {weeksText}
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 'current' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 id="onboarding-heading" style={{ margin: 0 }}>{t('onb.current.title')}</h1>
            <p className="muted" style={{ margin: 0 }}>{t('onb.current.lead')}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <strong style={bigNumber}>{fmt.band(currentBand)}</strong>
              <span className="muted">{t('onb.current.estimated')}</span>
            </div>
            <input type="range" min={4} max={9} step={0.5} value={currentBand} onChange={(e) => setCurrentBand(Number(e.target.value))} aria-label={t('onb.current.title')} />
            <div style={{ marginTop: 8 }}>
              <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>{t('onb.current.weakest')}</p>
              <div className="segmented">
                {(['reading', 'listening', 'writing', 'speaking'] as const).map((s) => (
                  <button key={s} type="button" className={`btn compact ${weakSkill === s ? 'solid' : 'ghost'}`} onClick={() => setWeakSkill(s)} aria-pressed={weakSkill === s}>
                    {sectionLabel(t, s)}
                  </button>
                ))}
              </div>
              {weakSkill === 'speaking' ? <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>{t('onb.current.speakingNote')}</p> : null}
            </div>
          </div>
        ) : null}

        {step === 'minutes' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 id="onboarding-heading" style={{ margin: 0 }}>{t('onb.minutes.title')}</h1>
            <p className="muted" style={{ margin: 0 }}>{t('onb.minutes.lead')}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <strong style={bigNumber}>{dailyMinutes}</strong>
              <span className="muted">{t('onb.minutes.unit')}</span>
            </div>
            <input type="range" min={15} max={120} step={15} value={dailyMinutes} onChange={(e) => setDailyMinutes(Number(e.target.value))} aria-label={t('onb.minutes.title')} />
            <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>{t('onb.minutes.min')}</span><span>{t('onb.minutes.max')}</span>
            </div>
          </div>
        ) : null}

        {step === 'summary' ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <h1 id="onboarding-heading" style={{ margin: 0 }}>{t('onb.summary.title')}</h1>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              <li><Target size={14} style={{ verticalAlign: -2, marginRight: 6 }} aria-hidden="true" /> {t('onb.summary.target', { band: fmt.band(target), date: targetDate ? fmt.date(`${targetDate}T00:00:00`) : '—', weeks: weeksText })}</li>
              <li><Check size={14} style={{ verticalAlign: -2, marginRight: 6 }} aria-hidden="true" /> {t('onb.summary.current', { band: fmt.band(currentBand), skill: sectionLabel(t, weakSkill) })}</li>
              <li><Check size={14} style={{ verticalAlign: -2, marginRight: 6 }} aria-hidden="true" /> {t('onb.summary.minutes', { minutes: dailyMinutes })}</li>
            </ul>
            {error ? <p className="error-text" role="alert">{error}</p> : null}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost compact" onClick={back} disabled={stepIndex === 0 || saving}>{t('onb.back')}</button>
          {step === 'summary' ? (
            <button type="button" className="btn solid" onClick={() => void submit()} disabled={saving}>
              {saving ? t('onb.saving') : t('onb.start')} <ArrowRight size={14} style={{ marginLeft: 6 }} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="btn solid" onClick={next}>
              {t('onb.continue')} <ArrowRight size={14} style={{ marginLeft: 6 }} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
