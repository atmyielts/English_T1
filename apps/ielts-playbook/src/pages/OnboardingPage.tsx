import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Gauge,
  Globe2,
  Sparkles,
  Target,
  Timer,
  Wand2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  playbookProbeGenerate,
  playbookProbeGrade,
  playbookProfileGet,
  playbookProfilePatch,
  playbookTrackEvent,
  type SkillsProbePrompt,
  type SkillsProbeGradeResponse,
} from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { useAccess } from '../lib/useAccess';

type SectionKey = 'reading' | 'listening' | 'writing' | 'speaking';
const SECTIONS: SectionKey[] = ['reading', 'listening', 'writing', 'speaking'];

const STAGE_LABELS = [
  'Goal',
  'Self-assessment',
  'Skills probe (optional)',
  'Constraints',
  'Style',
  'Confirm',
] as const;
type Stage = (typeof STAGE_LABELS)[number];

const titleCase = (s: string) =>
  s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess({ includeEffective: true });

  const [stageIndex, setStageIndex] = useState(0);
  const stage: Stage = STAGE_LABELS[stageIndex] ?? STAGE_LABELS[0];

  const [form, setForm] = useState<Record<string, unknown>>({
    target_overall_band: 6.5,
    current_band_or_estimate: null,
    deadline_date: null,
    weakest_skill: null,
    purpose: 'study',
    destination_country_code: '',
    test_market_country_code: 'GLOBAL',
    preferred_delivery_mode: 'computer',
    provider_key: 'british-council',
    program_requires_academic: false,
  });

  // Rich self-assessment + constraints + style live inside metadata so we
  // don't need a schema change for evolving fields.
  const [selfAssessment, setSelfAssessment] = useState<Record<SectionKey, number>>({
    reading: 6,
    listening: 6,
    writing: 5.5,
    speaking: 6,
  });
  const [hasTakenIeltsBefore, setHasTakenIeltsBefore] = useState<'yes' | 'no' | null>(null);
  const [priorScore, setPriorScore] = useState<number | ''>('');
  const [constraints, setConstraints] = useState({
    hoursPerWeek: 8,
    daysPerWeek: 5,
    preferredTime: 'evening',
    studyEnvironment: 'home',
  });
  const [style, setStyle] = useState({
    pace: 'balanced' as 'depth' | 'breadth' | 'balanced',
    accountability: 'self' as 'self' | 'reminders' | 'social',
    motivation: 'progress' as 'progress' | 'mastery' | 'pressure',
  });

  // Probe state
  const [probeId, setProbeId] = useState<string | null>(null);
  const [probePrompts, setProbePrompts] = useState<SkillsProbePrompt[] | null>(null);
  const [probeResponses, setProbeResponses] = useState<Record<string, string>>({});
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeNotice, setProbeNotice] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<SkillsProbeGradeResponse | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    playbookProfileGet(accessToken)
      .then((data) => {
        if (!active) return;
        const profile = (data.profile ?? {}) as Record<string, unknown>;
        setForm((current) => ({ ...current, ...profile }));
        const meta = (profile.metadata && typeof profile.metadata === 'object' && !Array.isArray(profile.metadata))
          ? (profile.metadata as Record<string, unknown>)
          : {};
        const savedAssessment = (meta.self_assessment ?? null) as Record<string, number> | null;
        if (savedAssessment) setSelfAssessment((prev) => ({ ...prev, ...savedAssessment }));
        const savedConstraints = (meta.constraints ?? null) as Record<string, unknown> | null;
        if (savedConstraints) setConstraints((prev) => ({ ...prev, ...savedConstraints } as typeof prev));
        const savedStyle = (meta.style ?? null) as Record<string, unknown> | null;
        if (savedStyle) setStyle((prev) => ({ ...prev, ...savedStyle } as typeof prev));
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  const startProbe = async () => {
    if (!accessToken) return;
    setProbeBusy(true);
    setProbeNotice(null);
    try {
      const res = await playbookProbeGenerate(accessToken, {
        target_band: Number(form.target_overall_band ?? 6.5),
        self_assessment: selfAssessment,
      });
      setProbeId(res.probe_id);
      setProbePrompts(res.prompts);
      setProbeResponses({});
      if (res.ai_status === 'unconfigured') setProbeNotice('AI is not configured — probe prompts are placeholders.');
      else if (res.ai_status === 'failed') setProbeNotice('AI call failed — probe prompts are placeholders.');
    } catch (err) {
      setProbeNotice(err instanceof Error ? err.message : 'Could not start probe');
    } finally {
      setProbeBusy(false);
    }
  };

  const submitProbe = async () => {
    if (!accessToken || !probeId) return;
    setProbeBusy(true);
    try {
      const res = await playbookProbeGrade(accessToken, probeId, probeResponses);
      setProbeResult(res);
    } catch (err) {
      setProbeNotice(err instanceof Error ? err.message : 'Could not grade probe');
    } finally {
      setProbeBusy(false);
    }
  };

  const finish = async () => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const metadata = {
        self_assessment: selfAssessment,
        constraints,
        style,
        ielts_history: { taken_before: hasTakenIeltsBefore === 'yes', prior_score: priorScore || null },
        latest_probe_result: probeResult,
        completed_wizard_at: new Date().toISOString(),
      };
      await playbookProfilePatch(accessToken, { ...form, metadata });
      await playbookTrackEvent({ event_name: 'onboarding_completed' }, accessToken);
      navigate('/diagnostic');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save onboarding');
    } finally {
      setSaving(false);
    }
  };

  const next = () => setStageIndex((i) => Math.min(STAGE_LABELS.length - 1, i + 1));
  const back = () => setStageIndex((i) => Math.max(0, i - 1));

  return (
    <SiteChrome compact>
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Diagnostic onboarding</p>
          <h1>Build your IELTS strategy in six steps.</h1>
          <p className="hero-summary">
            Each step sharpens the recommendation. The optional AI skills probe gives the planner an empirical
            band estimate to work with.
          </p>
        </div>
        <aside className="onboarding-steps" aria-label="Onboarding steps">
          {STAGE_LABELS.map((label, i) => (
            <span
              key={label}
              style={{
                fontWeight: i === stageIndex ? 700 : 400,
                opacity: i === stageIndex ? 1 : 0.55,
              }}
            >
              {i < stageIndex ? <CheckCircle2 size={16} /> : i === stageIndex ? <Target size={16} /> : <span style={{ width: 16, display: 'inline-block' }} />}
              {label}
            </span>
          ))}
        </aside>
      </section>

      <div className="onboarding-layout">
        <section className="form-panel">
          {stage === 'Goal' ? (
            <>
              <div className="section-heading compact-heading">
                <p className="eyebrow">Score target</p>
                <h2>Band goal and exam date</h2>
              </div>
              <div className="form-grid">
                <label>
                  Target overall band
                  <input type="number" step="0.5" min="0" max="9" value={String(form.target_overall_band ?? 6.5)} onChange={(e) => update('target_overall_band', Number(e.target.value))} />
                </label>
                <label>
                  Exam date
                  <input type="date" value={String(form.deadline_date ?? '')} onChange={(e) => update('deadline_date', e.target.value || null)} />
                </label>
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
                  Preferred delivery
                  <select value={String(form.preferred_delivery_mode ?? 'computer')} onChange={(e) => update('preferred_delivery_mode', e.target.value)}>
                    <option value="computer">Computer</option>
                    <option value="writing_on_paper">Writing on Paper</option>
                    <option value="paper">Paper</option>
                    <option value="unsure">Unsure</option>
                  </select>
                </label>
              </div>
              <label className="checkbox-row" style={{ marginTop: 14 }}>
                <input type="checkbox" checked={Boolean(form.program_requires_academic)} onChange={(e) => update('program_requires_academic', e.target.checked)} />
                <span>The destination program explicitly requires Academic IELTS</span>
              </label>
            </>
          ) : null}

          {stage === 'Self-assessment' ? (
            <>
              <div className="section-heading compact-heading">
                <p className="eyebrow">Self-assessment</p>
                <h2>How do you feel in each section today?</h2>
                <p>Rough estimate is fine. The AI probe will sanity-check this in the next step.</p>
              </div>
              <div style={{ display: 'grid', gap: 18, marginTop: 6 }}>
                {SECTIONS.map((section) => (
                  <div key={section} style={{ display: 'grid', gap: 4 }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 }}>
                      <span style={{ textTransform: 'capitalize' }}>{section}</span>
                      <span style={{ fontFamily: 'Fraunces, serif', fontSize: 18 }}>{selfAssessment[section]}</span>
                    </label>
                    <input
                      type="range"
                      min="3"
                      max="9"
                      step="0.5"
                      value={selfAssessment[section]}
                      onChange={(e) =>
                        setSelfAssessment((prev) => ({ ...prev, [section]: Number(e.target.value) }))
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="section-heading compact-heading" style={{ marginTop: 24 }}>
                <p className="eyebrow">Test history</p>
              </div>
              <div className="form-grid">
                <label>
                  Taken IELTS before?
                  <select value={hasTakenIeltsBefore ?? ''} onChange={(e) => setHasTakenIeltsBefore((e.target.value as 'yes' | 'no') || null)}>
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No, never</option>
                  </select>
                </label>
                {hasTakenIeltsBefore === 'yes' ? (
                  <label>
                    Most recent overall band
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="9"
                      value={priorScore}
                      onChange={(e) => setPriorScore(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </label>
                ) : null}
              </div>
            </>
          ) : null}

          {stage === 'Skills probe (optional)' ? (
            <>
              <div className="section-heading compact-heading">
                <p className="eyebrow">AI skills probe</p>
                <h2>Four 2-minute tasks across the four sections</h2>
                <p>
                  We'll generate four short prompts — one per section — and AI will grade your responses for an
                  empirical band estimate. Skip with the Next button if you'd rather not.
                </p>
              </div>

              {!probePrompts && !probeResult ? (
                <button type="button" className="button button-primary" onClick={() => void startProbe()} disabled={probeBusy}>
                  <Sparkles size={15} /> {probeBusy ? 'Generating…' : 'Generate probe'}
                </button>
              ) : null}

              {probeNotice ? <p style={{ color: '#9b2c2c', margin: '10px 0 0', fontSize: 13.5 }}>{probeNotice}</p> : null}

              {probePrompts && !probeResult ? (
                <div style={{ display: 'grid', gap: 18, marginTop: 14 }}>
                  {probePrompts.map((p) => (
                    <article
                      key={p.id}
                      style={{
                        padding: 14,
                        background: '#fff',
                        border: '1px solid #e8e2d0',
                        borderRadius: 10,
                      }}
                    >
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#0e4955', margin: '0 0 6px' }}>
                        {titleCase(p.section)} · {titleCase(p.kind)}
                      </p>
                      <p style={{ margin: '0 0 10px', fontSize: 14.5, lineHeight: 1.55, color: '#1a1814' }}>
                        {p.instruction}
                      </p>
                      {p.passage_or_audio_transcript ? (
                        <blockquote
                          style={{
                            margin: '0 0 10px',
                            padding: '10px 12px',
                            background: 'color-mix(in srgb, #0e4955 4%, white)',
                            borderLeft: '3px solid #0e4955',
                            fontSize: 13.5,
                            lineHeight: 1.55,
                            color: '#3b352a',
                            fontStyle: 'italic',
                          }}
                        >
                          {p.passage_or_audio_transcript}
                        </blockquote>
                      ) : null}
                      {p.options ? (
                        <div style={{ display: 'grid', gap: 4 }}>
                          {p.options.map((opt: string, idx: number) => (
                            <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                              <input
                                type="radio"
                                name={p.id}
                                checked={probeResponses[p.id] === String(idx)}
                                onChange={() => setProbeResponses((prev) => ({ ...prev, [p.id]: String(idx) }))}
                              />
                              <span>{opt}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          rows={p.kind === 'essay_seed' ? 6 : 3}
                          placeholder={p.expected_format ?? 'Your response'}
                          value={probeResponses[p.id] ?? ''}
                          onChange={(e) => setProbeResponses((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: 10,
                            fontSize: 14,
                            border: '1px solid #d4cdb9',
                            borderRadius: 6,
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            boxSizing: 'border-box',
                          }}
                        />
                      )}
                      {p.expected_format ? (
                        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#7a7263' }}>
                          {p.expected_format}
                        </p>
                      ) : null}
                    </article>
                  ))}
                  <button type="button" className="button button-primary" onClick={() => void submitProbe()} disabled={probeBusy}>
                    <Wand2 size={15} /> {probeBusy ? 'Grading…' : 'Grade probe'}
                  </button>
                </div>
              ) : null}

              {probeResult ? (
                <div style={{ marginTop: 14, padding: 16, background: '#fff', border: '1px solid #e8e2d0', borderRadius: 10 }}>
                  <p className="eyebrow" style={{ color: '#0e4955' }}>AI band estimate</p>
                  <h2 style={{ fontFamily: 'Fraunces, serif', margin: '4px 0' }}>
                    Overall {probeResult.overall_band_estimate ?? '-'} ({probeResult.confidence} confidence)
                  </h2>
                  <p style={{ fontSize: 14, color: '#3b352a', lineHeight: 1.5 }}>{probeResult.notes}</p>
                  <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                    {SECTIONS.map((section) => {
                      const skill = probeResult.per_skill?.[section];
                      if (!skill) return null;
                      return (
                        <div key={section} style={{ padding: 10, background: 'color-mix(in srgb, #0e4955 3%, white)', borderRadius: 6 }}>
                          <strong style={{ display: 'block', textTransform: 'capitalize', fontSize: 14 }}>
                            {section} — {skill.band_estimate ?? '-'}
                          </strong>
                          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#3b352a' }}>{skill.reasoning}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {stage === 'Constraints' ? (
            <>
              <div className="section-heading compact-heading">
                <p className="eyebrow">Constraints</p>
                <h2>How much can you realistically study?</h2>
              </div>
              <div className="form-grid">
                <label>
                  Hours per week
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={constraints.hoursPerWeek}
                    onChange={(e) => setConstraints((prev) => ({ ...prev, hoursPerWeek: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  Days per week
                  <input
                    type="number"
                    min="1"
                    max="7"
                    value={constraints.daysPerWeek}
                    onChange={(e) => setConstraints((prev) => ({ ...prev, daysPerWeek: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  Preferred study time
                  <select
                    value={constraints.preferredTime}
                    onChange={(e) => setConstraints((prev) => ({ ...prev, preferredTime: e.target.value }))}
                  >
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                    <option value="late_night">Late night</option>
                  </select>
                </label>
                <label>
                  Study environment
                  <select
                    value={constraints.studyEnvironment}
                    onChange={(e) => setConstraints((prev) => ({ ...prev, studyEnvironment: e.target.value }))}
                  >
                    <option value="home">Home (quiet)</option>
                    <option value="commute">Commute / on-the-go</option>
                    <option value="cafe">Cafe / shared space</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </label>
              </div>
            </>
          ) : null}

          {stage === 'Style' ? (
            <>
              <div className="section-heading compact-heading">
                <p className="eyebrow">Learner style</p>
                <h2>How do you study best?</h2>
              </div>
              <div className="form-grid">
                <label>
                  Pace preference
                  <select value={style.pace} onChange={(e) => setStyle((prev) => ({ ...prev, pace: e.target.value as typeof prev.pace }))}>
                    <option value="depth">Depth-first (master one section at a time)</option>
                    <option value="breadth">Breadth-first (rotate all sections)</option>
                    <option value="balanced">Balanced</option>
                  </select>
                </label>
                <label>
                  Accountability
                  <select value={style.accountability} onChange={(e) => setStyle((prev) => ({ ...prev, accountability: e.target.value as typeof prev.accountability }))}>
                    <option value="self">Self-driven</option>
                    <option value="reminders">Need reminders</option>
                    <option value="social">Better with a partner / class</option>
                  </select>
                </label>
                <label>
                  Motivation style
                  <select value={style.motivation} onChange={(e) => setStyle((prev) => ({ ...prev, motivation: e.target.value as typeof prev.motivation }))}>
                    <option value="progress">Progress / streaks</option>
                    <option value="mastery">Mastery / depth</option>
                    <option value="pressure">Pressure / deadlines</option>
                  </select>
                </label>
              </div>
            </>
          ) : null}

          {stage === 'Confirm' ? (
            <>
              <div className="section-heading compact-heading">
                <p className="eyebrow">Confirm</p>
                <h2>Ready to build your strategy</h2>
                <p>We'll save everything and run the synthesis on the diagnostic page.</p>
              </div>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                <div className="metric-card" style={{ padding: 14 }}>
                  <strong>Goal:</strong> Band {String(form.target_overall_band)} by {String(form.deadline_date ?? 'no date set')}
                </div>
                <div className="metric-card" style={{ padding: 14 }}>
                  <strong>Self-assessment:</strong> R{selfAssessment.reading} · L{selfAssessment.listening} · W{selfAssessment.writing} · S{selfAssessment.speaking}
                </div>
                {probeResult ? (
                  <div className="metric-card" style={{ padding: 14 }}>
                    <strong>AI probe estimate:</strong> {probeResult.overall_band_estimate ?? '-'} ({probeResult.confidence})
                  </div>
                ) : null}
                <div className="metric-card" style={{ padding: 14 }}>
                  <strong>Constraints:</strong> {constraints.hoursPerWeek}h/wk · {constraints.daysPerWeek}d · {constraints.preferredTime}
                </div>
                <div className="metric-card" style={{ padding: 14 }}>
                  <strong>Style:</strong> {style.pace} pace, {style.accountability} accountability, {style.motivation} motivation
                </div>
              </div>
              {error ? <p className="notice-banner notice-danger" style={{ marginTop: 14 }}>{error}</p> : null}
            </>
          ) : null}

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <button type="button" className="button button-secondary" onClick={back} disabled={stageIndex === 0}>
              <ArrowLeft size={15} /> Back
            </button>
            {stage === 'Confirm' ? (
              <button type="button" className="button button-primary" onClick={() => void finish()} disabled={saving}>
                <ClipboardCheck size={15} /> {saving ? 'Saving…' : 'Generate strategy'} <ArrowRight size={15} />
              </button>
            ) : (
              <button type="button" className="button button-primary" onClick={next}>
                Next <ArrowRight size={15} />
              </button>
            )}
          </div>
        </section>

        <aside className="form-summary-card">
          <span className="card-icon">
            <Compass size={18} />
          </span>
          <p className="eyebrow">Step {stageIndex + 1} of {STAGE_LABELS.length}</p>
          <h2 style={{ fontFamily: 'Fraunces, serif' }}>{stage}</h2>
          <p>
            Target band {String(form.target_overall_band ?? 6.5)} · {hasTakenIeltsBefore === 'yes' ? `prior ${priorScore || '?'}` : 'first attempt'}
          </p>
          <div style={{ display: 'grid', gap: 6, marginTop: 8, fontSize: 13, color: '#3b352a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Gauge size={14} /> {constraints.hoursPerWeek}h/wk
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CalendarDays size={14} /> {String(form.deadline_date ?? 'no date')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Globe2 size={14} /> {String(form.destination_country_code ?? 'GLOBAL')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Timer size={14} /> {constraints.preferredTime}
            </div>
          </div>
        </aside>
      </div>
    </SiteChrome>
  );
};
