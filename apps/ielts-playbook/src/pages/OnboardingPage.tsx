import React, { useEffect, useMemo, useState } from 'react';
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
  playbookMarketsGet,
  playbookProbeGenerate,
  playbookProbeGrade,
  playbookProfileGet,
  playbookProfilePatch,
  playbookTrackEvent,
  type PlaybookMarket,
  type SkillsProbePrompt,
  type SkillsProbeGradeResponse,
} from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { PageSkeleton } from '../components/PlaybookPremium';
import { enumLabel, useT, type Key } from '../i18n';
import { useAccess } from '../lib/useAccess';

type SectionKey = 'reading' | 'listening' | 'writing' | 'speaking';
const SECTIONS: SectionKey[] = ['reading', 'listening', 'writing', 'speaking'];

const STAGES = ['goal', 'self', 'probe', 'constraints', 'style', 'confirm'] as const;
type Stage = (typeof STAGES)[number];
const STAGE_LABEL: Record<Stage, Key> = {
  goal: 'onboarding.stage.goal',
  self: 'onboarding.stage.self',
  probe: 'onboarding.stage.probe',
  constraints: 'onboarding.stage.constraints',
  style: 'onboarding.stage.style',
  confirm: 'onboarding.stage.confirm',
};

// Shown even if the market list cannot load, so the choice is never empty.
const FALLBACK_MARKETS = [
  { country_code: 'GLOBAL', provider_key: 'british-council' },
  { country_code: 'UZ', provider_key: 'british-council' },
  { country_code: 'UZ', provider_key: 'idp' },
];

export const OnboardingPage: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const { accessToken } = useAccess({ includeEffective: true });

  const [stageIndex, setStageIndex] = useState(0);
  const stage: Stage = STAGES[stageIndex] ?? 'goal';
  // Keep the form hidden until the saved profile arrives, so defaults cannot
  // be saved over real answers by mistake.
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [markets, setMarkets] = useState<Array<Pick<PlaybookMarket, 'country_code' | 'provider_key'>>>(FALLBACK_MARKETS);

  const [form, setForm] = useState<Record<string, unknown>>({
    target_overall_band: 6.5,
    current_band_or_estimate: null,
    deadline_date: null,
    weakest_skill: null,
    purpose: 'study',
    destination_country_code: '',
    test_market_country_code: 'UZ',
    preferred_delivery_mode: 'computer',
    provider_key: 'british-council',
    program_requires_academic: false,
  });

  const [selfAssessment, setSelfAssessment] = useState<Record<SectionKey, number>>({
    reading: 6,
    listening: 6,
    writing: 5.5,
    speaking: 6,
  });
  const [hasTakenIeltsBefore, setHasTakenIeltsBefore] = useState<'yes' | 'no' | null>(null);
  const [priorScore, setPriorScore] = useState<number | ''>('');
  const [constraints, setConstraints] = useState({ hoursPerWeek: 8, daysPerWeek: 5, preferredTime: 'evening', studyEnvironment: 'home' });
  const [style, setStyle] = useState({
    pace: 'balanced' as 'depth' | 'breadth' | 'balanced',
    accountability: 'self' as 'self' | 'reminders' | 'social',
    motivation: 'progress' as 'progress' | 'mastery' | 'pressure',
  });

  const [probeId, setProbeId] = useState<string | null>(null);
  const [probePrompts, setProbePrompts] = useState<SkillsProbePrompt[] | null>(null);
  const [probeResponses, setProbeResponses] = useState<Record<string, string>>({});
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeNotice, setProbeNotice] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<SkillsProbeGradeResponse | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    playbookMarketsGet()
      .then((res) => {
        if (Array.isArray(res.markets) && res.markets.length > 0) setMarkets(res.markets);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    playbookProfileGet(accessToken, { fresh: true })
      .then((data) => {
        if (!active) return;
        const profile = (data.profile ?? {}) as Record<string, unknown>;
        const sanitised = Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== null && v !== undefined));
        setForm((current) => ({ ...current, ...sanitised }));
        const meta = profile.metadata && typeof profile.metadata === 'object' && !Array.isArray(profile.metadata)
          ? (profile.metadata as Record<string, unknown>)
          : {};
        const savedAssessment = (meta.self_assessment ?? null) as Record<string, number> | null;
        if (savedAssessment) setSelfAssessment((prev) => ({ ...prev, ...savedAssessment }));
        const savedConstraints = (meta.constraints ?? null) as Record<string, unknown> | null;
        if (savedConstraints) setConstraints((prev) => ({ ...prev, ...savedConstraints } as typeof prev));
        const savedStyle = (meta.style ?? null) as Record<string, unknown> | null;
        if (savedStyle) setStyle((prev) => ({ ...prev, ...savedStyle } as typeof prev));
      })
      .catch(() => {
        if (active) setError(t('onboarding.loadError'));
      })
      .finally(() => {
        if (active) setProfileLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [accessToken, t]);

  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  const countries = useMemo(() => Array.from(new Set(markets.map((m) => m.country_code))).sort(), [markets]);
  const marketCountry = String(form.test_market_country_code ?? 'GLOBAL');
  const providersForCountry = markets.filter((m) => m.country_code === marketCountry).map((m) => m.provider_key);
  const providerOptions = providersForCountry.length > 0 ? providersForCountry : ['british-council', 'idp'];

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
      if (res.ai_status === 'unconfigured' || res.ai_status === 'failed') setProbeNotice(t('onboarding.probe.placeholder'));
    } catch {
      setProbeNotice(t('onboarding.probe.startError'));
    } finally {
      setProbeBusy(false);
    }
  };

  const submitProbe = async () => {
    if (!accessToken || !probeId) return;
    setProbeBusy(true);
    try {
      setProbeResult(await playbookProbeGrade(accessToken, probeId, probeResponses));
    } catch {
      setProbeNotice(t('onboarding.probe.gradeError'));
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
      await playbookTrackEvent({ event_name: 'onboarding_completed' }, accessToken).catch(() => null);
      navigate('/diagnostic');
    } catch {
      setError(t('onboarding.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const next = () => setStageIndex((i) => Math.min(STAGES.length - 1, i + 1));
  const back = () => setStageIndex((i) => Math.max(0, i - 1));

  const option = (group: string, value: string) => <option key={value} value={value}>{enumLabel(t, group, value)}</option>;

  return (
    <SiteChrome compact>
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">{t('onboarding.eyebrow')}</p>
          <h1>{t('onboarding.title')}</h1>
          <p className="hero-summary">{t('onboarding.lead')}</p>
        </div>
        <aside className="onboarding-steps" aria-label={t('onboarding.steps')}>
          {STAGES.map((key, i) => (
            <span key={key} style={{ fontWeight: i === stageIndex ? 700 : 400, opacity: i === stageIndex ? 1 : 0.55 }}>
              {i < stageIndex ? <CheckCircle2 size={16} /> : i === stageIndex ? <Target size={16} /> : <span style={{ width: 16, display: 'inline-block' }} />}
              {t(STAGE_LABEL[key])}
            </span>
          ))}
        </aside>
      </section>

      {!profileLoaded ? (
        <PageSkeleton />
      ) : (
        <div className="onboarding-layout">
          <section className="form-panel">
            {stage === 'goal' ? (
              <>
                <div className="section-heading compact-heading">
                  <p className="eyebrow">{t('onboarding.goal.eyebrow')}</p>
                  <h2>{t('onboarding.goal.title')}</h2>
                </div>
                <div className="form-grid">
                  <label>
                    {t('onboarding.goal.target')}
                    <input type="number" step="0.5" min="0" max="9" value={String(form.target_overall_band ?? 6.5)} onChange={(e) => update('target_overall_band', Number(e.target.value))} />
                  </label>
                  <label>
                    {t('onboarding.goal.date')}
                    <input type="date" value={String(form.deadline_date ?? '')} onChange={(e) => update('deadline_date', e.target.value || null)} />
                  </label>
                  <label>
                    {t('onboarding.goal.purpose')}
                    <select value={String(form.purpose ?? 'study')} onChange={(e) => update('purpose', e.target.value)}>
                      {['study', 'work', 'migration', 'job', 'visa'].map((v) => option('purpose', v))}
                    </select>
                  </label>
                  <label>
                    {t('onboarding.goal.destination')}
                    <input type="text" value={String(form.destination_country_code ?? '')} onChange={(e) => update('destination_country_code', e.target.value.toUpperCase() || null)} placeholder="GB, CA, AU" maxLength={12} />
                  </label>
                  <label>
                    {t('onboarding.goal.market')}
                    <select
                      value={marketCountry}
                      onChange={(e) => {
                        const country = e.target.value;
                        update('test_market_country_code', country);
                        const providers = markets.filter((m) => m.country_code === country).map((m) => m.provider_key);
                        if (providers.length > 0 && !providers.includes(String(form.provider_key))) update('provider_key', providers[0]);
                      }}
                      data-testid="market-select"
                    >
                      {countries.map((code) => (
                        <option key={code} value={code}>{enumLabel(t, 'country', code.toLowerCase(), code)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('onboarding.goal.provider')}
                    <select value={String(form.provider_key ?? 'british-council')} onChange={(e) => update('provider_key', e.target.value)}>
                      {providerOptions.map((v) => option('provider', v))}
                    </select>
                  </label>
                  <label>
                    {t('onboarding.goal.delivery')}
                    <select value={String(form.preferred_delivery_mode ?? 'computer')} onChange={(e) => update('preferred_delivery_mode', e.target.value)}>
                      {['computer', 'writing_on_paper', 'paper', 'unsure'].map((v) => option('delivery', v))}
                    </select>
                  </label>
                </div>
                <label className="checkbox-row" style={{ marginTop: 14 }}>
                  <input type="checkbox" checked={Boolean(form.program_requires_academic)} onChange={(e) => update('program_requires_academic', e.target.checked)} />
                  <span>{t('onboarding.goal.academic')}</span>
                </label>
              </>
            ) : null}

            {stage === 'self' ? (
              <>
                <div className="section-heading compact-heading">
                  <p className="eyebrow">{t('onboarding.stage.self')}</p>
                  <h2>{t('onboarding.self.title')}</h2>
                  <p>{t('onboarding.self.lead')}</p>
                </div>
                <div className="slider-list">
                  {SECTIONS.map((section) => (
                    <div key={section} className="slider-row">
                      <label htmlFor={`self-${section}`}>
                        <span>{enumLabel(t, 'skill', section)}</span>
                        <span className="slider-value">{selfAssessment[section]}</span>
                      </label>
                      <input
                        id={`self-${section}`}
                        type="range"
                        min="3"
                        max="9"
                        step="0.5"
                        value={selfAssessment[section]}
                        onChange={(e) => setSelfAssessment((prev) => ({ ...prev, [section]: Number(e.target.value) }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="section-heading compact-heading" style={{ marginTop: 24 }}>
                  <p className="eyebrow">{t('onboarding.self.history')}</p>
                </div>
                <div className="form-grid">
                  <label>
                    {t('onboarding.self.takenBefore')}
                    <select value={hasTakenIeltsBefore ?? ''} onChange={(e) => setHasTakenIeltsBefore((e.target.value as 'yes' | 'no') || null)}>
                      <option value="">{t('common.select')}</option>
                      <option value="yes">{t('common.yes')}</option>
                      <option value="no">{t('onboarding.self.never')}</option>
                    </select>
                  </label>
                  {hasTakenIeltsBefore === 'yes' ? (
                    <label>
                      {t('onboarding.self.prior')}
                      <input type="number" step="0.5" min="0" max="9" value={priorScore} onChange={(e) => setPriorScore(e.target.value === '' ? '' : Number(e.target.value))} />
                    </label>
                  ) : null}
                </div>
              </>
            ) : null}

            {stage === 'probe' ? (
              <>
                <div className="section-heading compact-heading">
                  <p className="eyebrow">{t('onboarding.probe.eyebrow')}</p>
                  <h2>{t('onboarding.probe.title')}</h2>
                  <p>{t('onboarding.probe.lead')}</p>
                </div>

                {!probePrompts && !probeResult ? (
                  <button type="button" className="button button-primary" onClick={() => void startProbe()} disabled={probeBusy}>
                    <Sparkles size={15} /> {probeBusy ? t('common.generating') : t('onboarding.probe.generate')}
                  </button>
                ) : null}

                {probeNotice ? <p className="inline-error" role="alert">{probeNotice}</p> : null}

                {probePrompts && !probeResult ? (
                  <div className="probe-list">
                    {probePrompts.map((p) => (
                      <article key={p.id} className="probe-item">
                        <p className="ai-panel-label">{enumLabel(t, 'skill', p.section)}</p>
                        <p>{p.instruction}</p>
                        {p.passage_or_audio_transcript ? <blockquote>{p.passage_or_audio_transcript}</blockquote> : null}
                        {p.options ? (
                          <div className="probe-options">
                            {p.options.map((opt, idx) => (
                              <label key={idx}>
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
                            placeholder={p.expected_format ?? t('onboarding.probe.response')}
                            aria-label={t('onboarding.probe.response')}
                            value={probeResponses[p.id] ?? ''}
                            onChange={(e) => setProbeResponses((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          />
                        )}
                        {p.expected_format ? <p className="muted small">{p.expected_format}</p> : null}
                      </article>
                    ))}
                    <button type="button" className="button button-primary" onClick={() => void submitProbe()} disabled={probeBusy}>
                      <Wand2 size={15} /> {probeBusy ? t('onboarding.probe.grading') : t('onboarding.probe.grade')}
                    </button>
                  </div>
                ) : null}

                {probeResult ? (
                  <div className="probe-result">
                    <p className="eyebrow">{t('onboarding.probe.estimate')}</p>
                    <h2>
                      {t('onboarding.probe.overall', {
                        band: probeResult.overall_band_estimate ?? '-',
                        confidence: enumLabel(t, 'confidence', probeResult.confidence),
                      })}
                    </h2>
                    <p>{probeResult.notes}</p>
                    <div className="probe-skills">
                      {SECTIONS.map((section) => {
                        const skill = probeResult.per_skill?.[section];
                        if (!skill) return null;
                        return (
                          <div key={section}>
                            <strong>{enumLabel(t, 'skill', section)} — {skill.band_estimate ?? '-'}</strong>
                            <p>{skill.reasoning}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {stage === 'constraints' ? (
              <>
                <div className="section-heading compact-heading">
                  <p className="eyebrow">{t('onboarding.stage.constraints')}</p>
                  <h2>{t('onboarding.constraints.title')}</h2>
                </div>
                <div className="form-grid">
                  <label>
                    {t('onboarding.constraints.hours')}
                    <input type="number" min="1" max="40" value={constraints.hoursPerWeek} onChange={(e) => setConstraints((prev) => ({ ...prev, hoursPerWeek: Number(e.target.value) }))} />
                  </label>
                  <label>
                    {t('onboarding.constraints.days')}
                    <input type="number" min="1" max="7" value={constraints.daysPerWeek} onChange={(e) => setConstraints((prev) => ({ ...prev, daysPerWeek: Number(e.target.value) }))} />
                  </label>
                  <label>
                    {t('onboarding.constraints.time')}
                    <select value={constraints.preferredTime} onChange={(e) => setConstraints((prev) => ({ ...prev, preferredTime: e.target.value }))}>
                      {['morning', 'afternoon', 'evening', 'late_night'].map((v) => option('time', v))}
                    </select>
                  </label>
                  <label>
                    {t('onboarding.constraints.environment')}
                    <select value={constraints.studyEnvironment} onChange={(e) => setConstraints((prev) => ({ ...prev, studyEnvironment: e.target.value }))}>
                      {['home', 'commute', 'cafe', 'mixed'].map((v) => option('environment', v))}
                    </select>
                  </label>
                </div>
              </>
            ) : null}

            {stage === 'style' ? (
              <>
                <div className="section-heading compact-heading">
                  <p className="eyebrow">{t('onboarding.stage.style')}</p>
                  <h2>{t('onboarding.style.title')}</h2>
                </div>
                <div className="form-grid">
                  <label>
                    {t('onboarding.style.pace')}
                    <select value={style.pace} onChange={(e) => setStyle((prev) => ({ ...prev, pace: e.target.value as typeof prev.pace }))}>
                      {['depth', 'breadth', 'balanced'].map((v) => option('pace', v))}
                    </select>
                  </label>
                  <label>
                    {t('onboarding.style.accountability')}
                    <select value={style.accountability} onChange={(e) => setStyle((prev) => ({ ...prev, accountability: e.target.value as typeof prev.accountability }))}>
                      {['self', 'reminders', 'social'].map((v) => option('accountability', v))}
                    </select>
                  </label>
                  <label>
                    {t('onboarding.style.motivation')}
                    <select value={style.motivation} onChange={(e) => setStyle((prev) => ({ ...prev, motivation: e.target.value as typeof prev.motivation }))}>
                      {['progress', 'mastery', 'pressure'].map((v) => option('motivation', v))}
                    </select>
                  </label>
                </div>
              </>
            ) : null}

            {stage === 'confirm' ? (
              <>
                <div className="section-heading compact-heading">
                  <p className="eyebrow">{t('onboarding.stage.confirm')}</p>
                  <h2>{t('onboarding.confirm.title')}</h2>
                  <p>{t('onboarding.confirm.lead')}</p>
                </div>
                <div className="confirm-list">
                  <div className="metric-card">
                    <strong>{t('onboarding.confirm.goal')}</strong>{' '}
                    {t('onboarding.confirm.goalValue', { band: String(form.target_overall_band), date: String(form.deadline_date ?? t('onboarding.noDate')) })}
                  </div>
                  <div className="metric-card">
                    <strong>{t('onboarding.goal.market')}:</strong>{' '}
                    {enumLabel(t, 'country', marketCountry.toLowerCase(), marketCountry)} · {enumLabel(t, 'provider', String(form.provider_key ?? ''))}
                  </div>
                  <div className="metric-card">
                    <strong>{t('onboarding.stage.self')}:</strong> R{selfAssessment.reading} · L{selfAssessment.listening} · W{selfAssessment.writing} · S{selfAssessment.speaking}
                  </div>
                  {probeResult ? (
                    <div className="metric-card">
                      <strong>{t('onboarding.probe.estimate')}:</strong> {probeResult.overall_band_estimate ?? '-'} ({enumLabel(t, 'confidence', probeResult.confidence)})
                    </div>
                  ) : null}
                  <div className="metric-card">
                    <strong>{t('onboarding.stage.constraints')}:</strong>{' '}
                    {t('onboarding.confirm.constraints', { hours: constraints.hoursPerWeek, days: constraints.daysPerWeek, time: enumLabel(t, 'time', constraints.preferredTime) })}
                  </div>
                  <div className="metric-card">
                    <strong>{t('onboarding.stage.style')}:</strong>{' '}
                    {enumLabel(t, 'pace', style.pace)} · {enumLabel(t, 'accountability', style.accountability)} · {enumLabel(t, 'motivation', style.motivation)}
                  </div>
                </div>
              </>
            ) : null}

            {error ? <p className="notice-banner notice-danger" role="alert" style={{ marginTop: 14 }}>{error}</p> : null}

            <div className="form-nav">
              <button type="button" className="button button-secondary" onClick={back} disabled={stageIndex === 0}>
                <ArrowLeft size={15} /> {t('common.back')}
              </button>
              {stage === 'confirm' ? (
                <button type="button" className="button button-primary" onClick={() => void finish()} disabled={saving}>
                  <ClipboardCheck size={15} /> {saving ? t('common.saving') : t('onboarding.finish')} <ArrowRight size={15} />
                </button>
              ) : (
                <button type="button" className="button button-primary" onClick={next}>
                  {t('common.next')} <ArrowRight size={15} />
                </button>
              )}
            </div>
          </section>

          <aside className="form-summary-card">
            <span className="card-icon"><Compass size={18} /></span>
            <p className="eyebrow">{t('onboarding.stepOf', { n: stageIndex + 1, total: STAGES.length })}</p>
            <h2>{t(STAGE_LABEL[stage])}</h2>
            <p>
              {t('onboarding.summary.target', { band: String(form.target_overall_band ?? 6.5) })} ·{' '}
              {hasTakenIeltsBefore === 'yes' ? t('onboarding.summary.prior', { band: priorScore || '?' }) : t('onboarding.summary.first')}
            </p>
            <div className="summary-facts">
              <div><Gauge size={14} /> {t('plan.hoursShort', { count: constraints.hoursPerWeek })}</div>
              <div><CalendarDays size={14} /> {String(form.deadline_date ?? t('onboarding.noDate'))}</div>
              <div><Globe2 size={14} /> {enumLabel(t, 'country', marketCountry.toLowerCase(), marketCountry)}</div>
              <div><Timer size={14} /> {enumLabel(t, 'time', constraints.preferredTime)}</div>
            </div>
          </aside>
        </div>
      )}
    </SiteChrome>
  );
};
