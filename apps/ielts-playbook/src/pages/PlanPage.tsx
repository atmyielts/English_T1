import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Flame, Gauge, Layers3, ListChecks, Sparkles, Wand2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { playbookPlanGenerateAi, playbookPlanGet, type PlanAiResponse } from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { useAccess } from '../lib/useAccess';

const SECTION_COLORS: Record<string, string> = {
  reading: '#1f5a4d',
  listening: '#6c4ab8',
  writing: '#b6512c',
  speaking: '#7b6a3d',
};

export const PlanPage: React.FC = () => {
  const { slug } = useParams();
  const { accessToken } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiPlan, setAiPlan] = useState<PlanAiResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [weeklyHours, setWeeklyHours] = useState<number>(10);

  useEffect(() => {
    if (!accessToken || !slug) return;
    let active = true;
    playbookPlanGet(accessToken, slug)
      .then((data) => {
        if (!active) return;
        setPayload(data);
        // Pull weekly hours from the latest recommendation profile if present
        const rec = (data?.latest_recommendation ?? null) as Record<string, unknown> | null;
        const profile = rec && typeof rec === 'object' ? (rec.profile ?? null) as Record<string, unknown> | null : null;
        const meta = profile && typeof profile.metadata === 'object' && profile.metadata
          ? profile.metadata as Record<string, unknown>
          : null;
        const constraints = meta && typeof meta.constraints === 'object' && meta.constraints
          ? meta.constraints as Record<string, unknown>
          : null;
        if (constraints && typeof constraints.hoursPerWeek === 'number') {
          setWeeklyHours(Math.max(1, Math.min(40, constraints.hoursPerWeek)));
        }
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [accessToken, slug]);

  const generateAi = async () => {
    if (!accessToken || !slug) return;
    setGenerating(true);
    setAiError(null);
    try {
      const res = await playbookPlanGenerateAi(accessToken, slug, {
        weekly_hours: weeklyHours,
        section_priority: [],
      });
      setAiPlan(res);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not generate AI plan');
    } finally {
      setGenerating(false);
    }
  };

  const plan = (payload?.plan ?? null) as Record<string, unknown> | null;
  const schedule = ((plan?.schedule_json ?? null) as Record<string, unknown> | null) ?? null;
  const phases = Array.isArray(schedule?.phases) ? (schedule?.phases as Array<Record<string, unknown>>) : [];
  const weeks = Array.isArray(schedule?.weeks) ? (schedule?.weeks as Array<Record<string, unknown>>) : [];

  return (
    <SiteChrome compact>
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Plan template</p>
          <h1>{String(plan?.title ?? 'Loading plan...')}</h1>
          <p className="hero-summary">{String(plan?.summary ?? 'Structured daily and weekly guidance lives here.')}</p>
        </div>
        <aside className="plan-badge">
          <CalendarDays size={22} />
          <strong>{String(plan?.duration_days ?? '-')} days</strong>
          <span>{String(plan?.intensity ?? 'moderate')} intensity</span>
        </aside>
      </section>

      {error ? <p className="notice-banner notice-danger">{error}</p> : null}

      {plan ? (
        <>
          <section className="dashboard-grid">
            <article className="metric-card">
              <span className="card-icon">
                <CalendarDays size={18} />
              </span>
              <p className="eyebrow">Duration</p>
              <h2>{String(plan.duration_days ?? '-')} days</h2>
              <p>Intensity: {String(plan.intensity ?? 'moderate')}</p>
            </article>
            <article className="metric-card metric-card-accent">
              <span className="card-icon">
                <Gauge size={18} />
              </span>
              <p className="eyebrow">Band window</p>
              <h2>
                {String(plan.band_min ?? '-')}-{String(plan.band_max ?? '-')}
              </h2>
              <p>Focus skill: {String(plan.focus_skill ?? 'general')}</p>
            </article>
            <article className="metric-card">
              <span className="card-icon">
                <Flame size={18} />
              </span>
              <p className="eyebrow">Routine</p>
              <h2>{String(plan.plan_type ?? 'balanced')}</h2>
              <p>Use this plan as a rhythm, then refresh the diagnostic after new evidence.</p>
            </article>
          </section>

          <section className="section-band">
            <div className="section-heading">
              <p className="eyebrow">Template schedule</p>
              <h2>How this plan unfolds.</h2>
              <p>Phases define the purpose of the work. Weeks translate that purpose into a focus sequence.</p>
            </div>
            <div className="plan-timeline">
              {phases.map((phase, index) => (
                <article key={`phase-${index}`} className="plan-step">
                  <span>
                    <Layers3 size={17} />
                    Phase {index + 1}
                  </span>
                  <strong>{String(phase.label ?? `Phase ${index + 1}`)}</strong>
                  <p>{String(phase.goal ?? '')}</p>
                </article>
              ))}
              {weeks.map((week, index) => (
                <article key={`week-${index}`} className="plan-step">
                  <span>
                    <CalendarDays size={17} />
                    Week {index + 1}
                  </span>
                  <strong>{String(week.label ?? `Week ${index + 1}`)}</strong>
                  <p>{Array.isArray(week.focus) ? week.focus.map((item) => String(item)).join(', ') : String(week.focus ?? '')}</p>
                </article>
              ))}
            </div>
          </section>

          <section
            style={{
              margin: '24px 0',
              padding: 22,
              borderRadius: 14,
              border: '1px solid color-mix(in srgb, #6c4ab8 22%, transparent)',
              background: 'color-mix(in srgb, #6c4ab8 4%, white)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p className="eyebrow" style={{ color: '#6c4ab8' }}>Personalised schedule</p>
                <h2 style={{ fontFamily: 'Fraunces, serif', margin: '4px 0 6px' }}>
                  AI week-by-week plan
                </h2>
                <p style={{ margin: 0, maxWidth: 560, fontSize: 14, color: '#3b352a' }}>
                  Generates a concrete plan from your goal, deadline, and weekly hours. Hours per week below feeds
                  the pacing.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 13, color: '#3b352a' }}>
                  Hours/week:
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={weeklyHours}
                    onChange={(e) => setWeeklyHours(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
                    style={{
                      marginLeft: 6,
                      width: 64,
                      padding: '4px 8px',
                      fontSize: 13,
                      border: '1px solid #d4cdb9',
                      borderRadius: 6,
                      background: '#fff',
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void generateAi()}
                  disabled={generating}
                >
                  <Wand2 size={14} /> {generating ? 'Generating…' : aiPlan ? 'Re-generate' : 'Generate AI plan'} <Sparkles size={13} style={{ marginLeft: 4 }} />
                </button>
              </div>
            </div>

            {aiError ? <p style={{ color: '#9b2c2c', margin: '10px 0 0', fontSize: 13.5 }}>{aiError}</p> : null}

            {aiPlan ? (
              <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                <div style={{ padding: 14, background: '#fff', border: '1px solid #e8e2d0', borderRadius: 10 }}>
                  <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: '#1a1814' }}>
                    {aiPlan.intro}
                  </p>
                </div>

                {aiPlan.weeks.map((week) => (
                  <article
                    key={week.week_number}
                    style={{
                      padding: 16,
                      background: '#fff',
                      border: '1px solid #e8e2d0',
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            background: '#6c4ab8',
                            color: '#fff',
                            padding: '4px 10px',
                            borderRadius: 14,
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                          }}
                        >
                          WEEK {week.week_number}
                        </span>
                        <strong style={{ fontFamily: 'Fraunces, serif', fontSize: 17 }}>{week.theme}</strong>
                      </div>
                      <span style={{ fontSize: 12.5, color: '#7a7263', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Gauge size={13} /> {week.hours}h
                      </span>
                    </div>

                    {week.focus_sections.length > 0 ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        {week.focus_sections.map((s, i) => {
                          const color = SECTION_COLORS[s.toLowerCase()] ?? '#7a7263';
                          return (
                            <span
                              key={i}
                              style={{
                                padding: '3px 9px',
                                fontSize: 11.5,
                                fontWeight: 600,
                                borderRadius: 10,
                                background: `color-mix(in srgb, ${color} 12%, white)`,
                                color,
                                textTransform: 'capitalize',
                              }}
                            >
                              {s}
                            </span>
                          );
                        })}
                      </div>
                    ) : null}

                    {week.key_activities.length > 0 ? (
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6c4ab8', margin: '0 0 4px' }}>
                          <ListChecks size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
                          Activities
                        </p>
                        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.55, color: '#1a1814' }}>
                          {week.key_activities.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {week.success_criteria ? (
                      <div
                        style={{
                          padding: 10,
                          background: 'color-mix(in srgb, #1f8a55 7%, white)',
                          borderLeft: '3px solid #1f8a55',
                          borderRadius: 6,
                          fontSize: 13,
                          color: '#1a1814',
                        }}
                      >
                        <CheckCircle2 size={13} style={{ verticalAlign: 'text-bottom', marginRight: 4, color: '#1f8a55' }} />
                        <strong>By end of week:</strong> {week.success_criteria}
                      </div>
                    ) : null}

                    {week.playbook_modules.length > 0 ? (
                      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {week.playbook_modules.map((mod, i) => (
                          <Link
                            key={i}
                            to={`/${mod}`}
                            style={{
                              padding: '4px 10px',
                              fontSize: 12,
                              border: '1px solid #d4cdb9',
                              borderRadius: 12,
                              color: '#1a1814',
                              textDecoration: 'none',
                              background: '#fafaf7',
                            }}
                          >
                            {mod}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}

                <p style={{ margin: 0, fontSize: 11, color: '#7a7263' }}>
                  Generated {new Date(aiPlan.generated_at).toLocaleString()} · {aiPlan.weekly_hours}h/wk target
                </p>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <div className="route-loading">Loading plan...</div>
      )}
    </SiteChrome>
  );
};
