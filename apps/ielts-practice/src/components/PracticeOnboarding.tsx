import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Calendar, Check, Target } from 'lucide-react';
import { practiceGeneratePlan, practiceGoalsPatch, type PracticeGoal } from '../lib/api';
import { useAccess } from '../lib/useAccess';

interface Props {
  goals: PracticeGoal | null;
  onComplete: () => void;
}

type Step = 'target' | 'date' | 'current' | 'minutes' | 'mode' | 'summary';

const STEPS: Step[] = ['target', 'date', 'current', 'minutes', 'mode', 'summary'];

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
};

const DEFAULT_TARGET_BAND = 6.5;
const DEFAULT_DAILY_MINUTES = 60;

const isOnboarded = (goals: PracticeGoal | null): boolean => {
  // While the dashboard is still loading goals are null. Treat that as
  // "already onboarded" so the modal doesn't flash open then snap closed
  // on every page load — we only ever show the wizard once we KNOW the
  // user needs it.
  if (!goals) return true;
  if (goals.metadata && typeof goals.metadata === 'object' && (goals.metadata as Record<string, unknown>).onboarded_at) {
    return true;
  }
  // Backstop: if the user has already customised target/minutes away from
  // defaults, assume they onboarded previously (existing user before this
  // feature shipped) and skip the wizard.
  if (goals.target_overall_band !== DEFAULT_TARGET_BAND) return true;
  if (goals.daily_practice_minutes && goals.daily_practice_minutes !== DEFAULT_DAILY_MINUTES) return true;
  return false;
};

export const PracticeOnboarding = ({ goals, onComplete }: Props) => {
  const { accessToken } = useAccess();
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex] ?? 'summary';
  const [target, setTarget] = useState(() => goals?.target_overall_band ?? 7.0);
  const [targetDate, setTargetDate] = useState(() => goals?.target_date ?? '');
  const [currentBand, setCurrentBand] = useState(5.5);
  const [weakSkill, setWeakSkill] = useState<'reading' | 'listening' | 'writing' | 'speaking'>('writing');
  const [dailyMinutes, setDailyMinutes] = useState(() => goals?.daily_practice_minutes ?? 45);
  const [mode, setMode] = useState<'computer' | 'paper'>('computer');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = !isOnboarded(goals);

  // Compute target_date as ISO from today if user hasn't picked
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
        target_section_bands: { [weakSkill === 'speaking' ? 'writing' : weakSkill]: target },
        practice_start_date: startISO,
        program_duration_days: programDays,
        daily_practice_minutes: dailyMinutes,
        focus_modes: [weakSkill],
        metadata: {
          onboarded_at: new Date().toISOString(),
          current_band_self_rated: currentBand,
          weak_skill: weakSkill,
          delivery_mode: mode,
        },
      });
      // Trigger initial plan generation
      await practiceGeneratePlan(accessToken, { refresh_diagnostics: true });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="onboarding-heading"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26, 24, 20, 0.5)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 40,
        padding: 16,
      }}
    >
      <div
        className="glass"
        style={{ width: 'min(620px, 100%)', padding: 32, display: 'grid', gap: 20 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <p className="eyebrow" style={{ margin: 0 }}>Welcome · setup</p>
          <span className="muted" style={{ fontSize: 12 }}>Step {stepIndex + 1} of {STEPS.length}</span>
        </div>

        {step === 'target' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 id="onboarding-heading" style={{ margin: 0 }}>What band do you need?</h1>
            <p className="muted" style={{ margin: 0 }}>
              Most universities ask for 6.5 or 7.0. Pick the one your application requires.
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <strong style={{ fontFamily: 'Fraunces, serif', fontSize: '3rem', fontWeight: 600, letterSpacing: '-0.025em' }}>
                {target.toFixed(1)}
              </strong>
              <span className="muted">overall</span>
            </div>
            <input
              type="range"
              min={5}
              max={9}
              step={0.5}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
            <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>5.0</span><span>9.0</span>
            </div>
          </div>
        ) : null}

        {step === 'date' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 style={{ margin: 0 }}>When is your test?</h1>
            <p className="muted" style={{ margin: 0 }}>
              We’ll pace the plan accordingly. Leave a buffer of 2 weeks if you can.
            </p>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              style={{ fontSize: 16 }}
            />
            {totalWeeks != null ? (
              <p style={{ margin: 0 }}>
                <Calendar size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                {totalWeeks} week{totalWeeks === 1 ? '' : 's'} to prepare
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 'current' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 style={{ margin: 0 }}>Where are you now?</h1>
            <p className="muted" style={{ margin: 0 }}>
              An honest guess from past mocks or self-assessment. We’ll calibrate this with real diagnostics later.
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <strong style={{ fontFamily: 'Fraunces, serif', fontSize: '3rem', fontWeight: 600, letterSpacing: '-0.025em' }}>
                {currentBand.toFixed(1)}
              </strong>
              <span className="muted">estimated overall</span>
            </div>
            <input
              type="range"
              min={4}
              max={9}
              step={0.5}
              value={currentBand}
              onChange={(e) => setCurrentBand(Number(e.target.value))}
            />
            <div style={{ marginTop: 8 }}>
              <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>Weakest skill right now:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(['reading', 'listening', 'writing', 'speaking'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`btn compact ${weakSkill === s ? 'solid' : 'ghost'}`}
                    onClick={() => setWeakSkill(s)}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {step === 'minutes' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 style={{ margin: 0 }}>How much time can you give it daily?</h1>
            <p className="muted" style={{ margin: 0 }}>
              A consistent 30-60 minutes beats marathon weekend sessions. Pick something you’ll actually do.
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <strong style={{ fontFamily: 'Fraunces, serif', fontSize: '3rem', fontWeight: 600, letterSpacing: '-0.025em' }}>
                {dailyMinutes}
              </strong>
              <span className="muted">minutes / day</span>
            </div>
            <input
              type="range"
              min={15}
              max={120}
              step={15}
              value={dailyMinutes}
              onChange={(e) => setDailyMinutes(Number(e.target.value))}
            />
            <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>15 min</span><span>2 h</span>
            </div>
          </div>
        ) : null}

        {step === 'mode' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 style={{ margin: 0 }}>Computer or paper test?</h1>
            <p className="muted" style={{ margin: 0 }}>
              We’ll match practice timing and interaction style to the format you’ll actually sit.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['computer', 'paper'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`btn ${mode === m ? 'solid' : 'ghost'}`}
                  onClick={() => setMode(m)}
                  style={{ flex: 1, padding: '18px 16px', textTransform: 'capitalize' }}
                >
                  {m}-based
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 'summary' ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <h1 style={{ margin: 0 }}>Here’s your plan</h1>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              <li><Target size={14} style={{ verticalAlign: -2, marginRight: 6 }} /> Target band <strong>{target.toFixed(1)}</strong> by {formatDate(targetDate)} ({totalWeeks ?? '—'} weeks)</li>
              <li><Check size={14} style={{ verticalAlign: -2, marginRight: 6 }} /> Current self-rated <strong>{currentBand.toFixed(1)}</strong>, weakest in <strong>{weakSkill}</strong></li>
              <li><Check size={14} style={{ verticalAlign: -2, marginRight: 6 }} /> <strong>{dailyMinutes} min/day</strong>, {mode}-based format</li>
            </ul>
            {error ? <p className="error-text">{error}</p> : null}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="btn ghost compact"
            onClick={back}
            disabled={stepIndex === 0 || saving}
          >
            Back
          </button>
          {step === 'summary' ? (
            <button
              type="button"
              className="btn solid"
              onClick={() => void submit()}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Start practicing'} <ArrowRight size={14} style={{ marginLeft: 6 }} />
            </button>
          ) : (
            <button type="button" className="btn solid" onClick={next}>
              Continue <ArrowRight size={14} style={{ marginLeft: 6 }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
