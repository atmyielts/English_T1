import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, ClipboardCheck, Gauge, Globe2, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { playbookProfileGet, playbookProfilePatch, playbookTrackEvent } from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { useAccess } from '../lib/useAccess';

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess({ includeEffective: true });
  const [form, setForm] = useState<Record<string, unknown>>({
    target_overall_band: 6.5,
    purpose: 'study',
    test_market_country_code: 'GLOBAL',
    provider_key: 'british-council',
    preferred_delivery_mode: 'computer',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    playbookProfileGet(accessToken)
      .then((data) => {
        if (!active) return;
        setForm((current) => ({ ...current, ...(data.profile ?? {}) }));
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      await playbookProfilePatch(accessToken, form);
      await playbookTrackEvent({ event_name: 'onboarding_completed' }, accessToken);
      navigate('/diagnostic');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save onboarding');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SiteChrome compact>
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Diagnostic onboarding</p>
          <h1>Tell the playbook what result you need.</h1>
          <p className="hero-summary">
            Your goal, deadline, purpose, and market context shape the recommendation. Simulator scores can refine it
            later.
          </p>
        </div>
        <aside className="onboarding-steps" aria-label="Onboarding steps">
          <span>
            <Target size={16} />
            Goal
          </span>
          <span>
            <CalendarDays size={16} />
            Deadline
          </span>
          <span>
            <Globe2 size={16} />
            Market
          </span>
        </aside>
      </section>

      <form className="onboarding-layout" onSubmit={onSubmit}>
        <section className="form-panel">
          <div className="section-heading compact-heading">
            <p className="eyebrow">Score target</p>
            <h2>Band goal and current evidence</h2>
          </div>
          <div className="form-grid">
            <label>
              Target overall band
              <input type="number" step="0.5" min="0" max="9" value={String(form.target_overall_band ?? 6.5)} onChange={(e) => update('target_overall_band', Number(e.target.value))} />
            </label>
            <label>
              Current band or estimate
              <input type="number" step="0.5" min="0" max="9" value={String(form.current_band_or_estimate ?? '')} onChange={(e) => update('current_band_or_estimate', e.target.value ? Number(e.target.value) : null)} />
            </label>
            <label>
              Deadline
              <input type="date" value={String(form.deadline_date ?? '')} onChange={(e) => update('deadline_date', e.target.value || null)} />
            </label>
            <label>
              Weakest skill
              <select value={String(form.weakest_skill ?? '')} onChange={(e) => update('weakest_skill', e.target.value || null)}>
                <option value="">Auto-detect from outcomes</option>
                <option value="listening">Listening</option>
                <option value="reading">Reading</option>
                <option value="writing">Writing</option>
                <option value="speaking">Speaking</option>
              </select>
            </label>
          </div>
        </section>

        <section className="form-panel">
          <div className="section-heading compact-heading">
            <p className="eyebrow">Test context</p>
            <h2>Purpose, location, and delivery</h2>
          </div>
          <div className="form-grid">
            <label>
              Purpose
              <select value={String(form.purpose ?? 'study')} onChange={(e) => update('purpose', e.target.value)}>
                <option value="study">Study</option>
                <option value="work">Work</option>
                <option value="migration">Migration</option>
                <option value="job">Job</option>
                <option value="visa">Visa</option>
              </select>
            </label>
            <label>
              Destination country
              <input type="text" value={String(form.destination_country_code ?? '')} onChange={(e) => update('destination_country_code', e.target.value || null)} placeholder="GB, CA, AU" />
            </label>
            <label>
              Test market
              <input type="text" value={String(form.test_market_country_code ?? 'GLOBAL')} onChange={(e) => update('test_market_country_code', e.target.value || 'GLOBAL')} />
            </label>
            <label>
              Preferred delivery
              <select value={String(form.preferred_delivery_mode ?? 'computer')} onChange={(e) => update('preferred_delivery_mode', e.target.value)}>
                <option value="computer">Computer</option>
                <option value="writing_on_paper">Writing on Paper</option>
                <option value="paper">Paper</option>
                <option value="unsure">Unsure</option>
              </select>
            </label>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={Boolean(form.program_requires_academic)} onChange={(e) => update('program_requires_academic', e.target.checked)} />
            <span>The destination program explicitly requires Academic IELTS</span>
          </label>
        </section>

        <aside className="form-summary-card">
          <span className="card-icon">
            <Gauge size={18} />
          </span>
          <p className="eyebrow">Recommendation input</p>
          <h2>Target {String(form.target_overall_band ?? 6.5)}</h2>
          <p>
            Purpose: {String(form.purpose ?? 'study')}. Weak skill:{' '}
            {String(form.weakest_skill ?? 'auto-detect')}.
          </p>
          {error ? <p className="notice-banner notice-danger">{error}</p> : null}
          <button className="button button-primary" type="submit" disabled={saving}>
            <ClipboardCheck size={17} />
            {saving ? 'Saving...' : 'Generate My Strategy'}
            <ArrowRight size={16} />
          </button>
        </aside>
      </form>
    </SiteChrome>
  );
};
