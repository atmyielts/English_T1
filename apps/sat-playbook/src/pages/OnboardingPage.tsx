import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { satPlaybookProfileGet, satPlaybookProfilePatch, satPlaybookTrackEvent } from '../lib/api';
import { PlaybookTopNav } from '../components/PlaybookTopNav';
import { useAccess } from '../lib/useAccess';

type Json = Record<string, unknown>;

export const OnboardingPage = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess({ includeEffective: true });
  const [form, setForm] = useState<Json>({
    target_total_score: 1200,
    current_score_or_estimate: null,
    deadline_date: null,
    weakest_section: null,
    purpose: 'university',
    preferred_delivery_mode: 'digital_bluebook',
    prep_intensity: 'balanced',
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    satPlaybookProfileGet(accessToken)
      .then((data) => {
        if (!active) return;
        const profile = (data.profile ?? {}) as Json;
        const sanitised = Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== null && v !== undefined));
        setForm((current) => ({ ...current, ...sanitised }));
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [accessToken]);

  const update = (key: string, value: unknown) => setForm((c) => ({ ...c, [key]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      await satPlaybookProfilePatch(accessToken, form);
      await satPlaybookTrackEvent({ event_name: 'onboarding_completed' }, accessToken);
      navigate('/diagnostic');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-shell">
      <PlaybookTopNav />
      <main className="workspace">
        <section className="page-header">
          <div>
            <p className="eyebrow">Diagnostic onboarding</p>
            <h1>Tell the playbook your goal</h1>
            <p>Score target, test date, and purpose shape your recommendation. Simulator scores refine it later.</p>
          </div>
        </section>

        {!loaded ? (
          <div className="route-loading">Loading your profile…</div>
        ) : (
          <form className="panel" onSubmit={onSubmit} style={{ display: 'grid', gap: 16, maxWidth: 640 }}>
            <label>
              Target total score (400–1600)
              <input type="number" min="400" max="1600" step="10" value={String(form.target_total_score ?? 1200)}
                onChange={(e) => update('target_total_score', Number(e.target.value))} />
            </label>
            <label>
              Current score or estimate
              <input type="number" min="400" max="1600" step="10" value={String(form.current_score_or_estimate ?? '')}
                onChange={(e) => update('current_score_or_estimate', e.target.value ? Number(e.target.value) : null)} />
            </label>
            <label>
              Test date
              <input type="date" value={String(form.deadline_date ?? '')}
                onChange={(e) => update('deadline_date', e.target.value || null)} />
            </label>
            <label>
              Weakest section
              <select value={String(form.weakest_section ?? '')} onChange={(e) => update('weakest_section', e.target.value || null)}>
                <option value="">Auto-detect from simulator</option>
                <option value="reading_writing">Reading &amp; Writing</option>
                <option value="math">Math</option>
              </select>
            </label>
            <label>
              Purpose
              <select value={String(form.purpose ?? 'university')} onChange={(e) => update('purpose', e.target.value)}>
                <option value="university">University admission</option>
                <option value="scholarship">Scholarship</option>
                <option value="merit">Merit aid</option>
                <option value="placement">Placement</option>
                <option value="retake">Retake / score boost</option>
              </select>
            </label>
            <label>
              Prep intensity
              <select value={String(form.prep_intensity ?? 'balanced')} onChange={(e) => update('prep_intensity', e.target.value)}>
                <option value="crash">Crash (short runway)</option>
                <option value="balanced">Balanced</option>
                <option value="thorough">Thorough</option>
              </select>
            </label>
            {error ? <p className="alert error">{error}</p> : null}
            <button className="btn solid" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Generate my strategy'} <ArrowRight size={16} />
            </button>
          </form>
        )}
      </main>
    </div>
  );
};
