import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { goalsGet, goalsPatch } from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { useAppT, useErrorText } from '../i18n';

type Form = { target_score: string; test_date: string; hours_per_week: string };

export const OnboardingPage = () => {
  const t = useAppT();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [form, setForm] = useState<Form>({ target_score: '1400', test_date: '', hours_per_week: '3' });
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<'plan' | 'later' | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    goalsGet(accessToken).then(res => setForm({
      target_score: String(res.goals.target_score ?? 1400), test_date: res.goals.test_date ?? '', hours_per_week: String(res.goals.hours_per_week ?? 3),
    })).catch(() => setLoadError(true));
  }, [accessToken]);

  const save = async () => {
    if (!accessToken || saving) return;
    setSaving(true); setError(null); setSaved(null);
    try {
      const res = await goalsPatch(accessToken, {
        target_score: Number(form.target_score), test_date: form.test_date || null, hours_per_week: Number(form.hours_per_week),
        metadata: { onboarding_completed: true },
      }) as { ok: boolean; plan_updated?: boolean };
      setSaved(res.plan_updated === false ? 'later' : 'plan');
      setTimeout(() => navigate('/dashboard'), 900);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };
  const field = (name: keyof Form) => ({ value: form[name], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [name]: event.target.value })) });

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">{t('goal.eyebrow')}</p>
            <h1>{t('goal.title')}</h1>
            <p>{t('goal.lead')}</p>
          </div>
        </header>
        {loadError ? <div className="alert" role="status">{t('goal.loadError')}</div> : null}
        <form className="panel form-panel" onSubmit={event => { event.preventDefault(); void save(); }}>
          <label>
            {t('goal.target')}
            <input type="number" min={400} max={1600} step={10} required aria-describedby="goal-target-hint" {...field('target_score')} />
            <small id="goal-target-hint">{t('goal.targetHint')}</small>
          </label>
          <label>
            {t('goal.testDate')}
            <input type="date" aria-describedby="goal-date-hint" {...field('test_date')} />
            <small id="goal-date-hint">{t('goal.testDateHint')}</small>
          </label>
          <label>
            {t('goal.hours')}
            <input type="number" min={1} max={40} step={1} required aria-describedby="goal-hours-hint" {...field('hours_per_week')} />
            <small id="goal-hours-hint">{t('goal.hoursHint')}</small>
          </label>
          {error ? <div className="alert error" role="alert">{errorText(error, 'error.goal_unavailable')}</div> : null}
          {saved ? <div className="alert" role="status">{t(saved === 'plan' ? 'goal.saved' : 'goal.savedPlanLater')}</div> : null}
          <div className="row-actions">
            <button type="submit" className="btn solid" disabled={saving || !accessToken}>{saving ? t('goal.saving') : t('goal.save')}</button>
            <Link className="btn ghost" to="/dashboard">{t('goal.toDashboard')}</Link>
          </div>
        </form>
      </main>
    </div>
  );
};
