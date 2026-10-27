import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Flame, Gauge, Layers3, ListChecks, Sparkles, Wand2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  playbookPlanGenerateAi,
  playbookPlanGet,
  playbookProfileGet,
  playbookProfilePatch,
  type PlanAiResponse,
} from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { PageSkeleton } from '../components/PlaybookPremium';
import { enumLabel, useLocale, useT } from '../i18n';
import { useAccess } from '../lib/useAccess';
import { slugTitle } from './DashboardPage';

const SECTION_COLORS: Record<string, string> = {
  reading: '#1f5a4d',
  listening: '#6c4ab8',
  writing: '#b6512c',
  speaking: '#7b6a3d',
};

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isPlanAi = (value: unknown): value is PlanAiResponse =>
  isRow(value) && Array.isArray(value.weeks) && typeof value.intro === 'string';

/** Generated plans are kept in profile metadata so they survive a reload. */
const savedPlansOf = (profile: Row | null | undefined): Record<string, PlanAiResponse> => {
  const meta = isRow(profile?.metadata) ? (profile!.metadata as Row) : {};
  const saved = isRow(meta.saved_ai_plans) ? (meta.saved_ai_plans as Row) : {};
  return Object.fromEntries(Object.entries(saved).filter(([, plan]) => isPlanAi(plan))) as Record<string, PlanAiResponse>;
};

export const PlanPage: React.FC = () => {
  const t = useT();
  const { date } = useLocale();
  const { slug } = useParams();
  const { accessToken } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiPlan, setAiPlan] = useState<PlanAiResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [weeklyHours, setWeeklyHours] = useState<number>(10);

  useEffect(() => {
    if (!accessToken || !slug) return;
    let active = true;
    Promise.all([playbookPlanGet(accessToken, slug), playbookProfileGet(accessToken, { fresh: true }).catch(() => null)])
      .then(([data, profileRes]) => {
        if (!active) return;
        setPayload(data as unknown as Row);
        const profile = (profileRes?.profile ?? null) as Row | null;
        const meta = isRow(profile?.metadata) ? (profile!.metadata as Row) : {};
        const constraints = isRow(meta.constraints) ? (meta.constraints as Row) : {};
        if (typeof constraints.hoursPerWeek === 'number') setWeeklyHours(Math.max(1, Math.min(40, constraints.hoursPerWeek)));
        const saved = savedPlansOf(profile)[slug];
        if (saved) setAiPlan(saved);
      })
      .catch(() => {
        if (active) setError(t('plan.loadError'));
      });
    return () => {
      active = false;
    };
  }, [accessToken, slug, t]);

  const generateAi = async () => {
    if (!accessToken || !slug) return;
    setGenerating(true);
    setAiError(null);
    setSaveState('idle');
    try {
      const res = await playbookPlanGenerateAi(accessToken, slug, { weekly_hours: weeklyHours, section_priority: [] });
      setAiPlan(res);
      if (res.ai_status && res.ai_status !== 'ok') {
        setAiError(t('ai.fallbackNote'));
        return;
      }
      // Save it so the plan is still here tomorrow.
      try {
        const { profile } = await playbookProfileGet(accessToken, { fresh: true });
        const saved = { ...savedPlansOf(profile), [slug]: res };
        const trimmed = Object.fromEntries(Object.entries(saved).slice(-5));
        await playbookProfilePatch(accessToken, { metadata: { saved_ai_plans: trimmed } });
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    } catch {
      setAiError(t('plan.ai.error'));
    } finally {
      setGenerating(false);
    }
  };

  const plan = isRow(payload?.plan) ? (payload!.plan as Row) : null;
  const schedule = isRow(plan?.schedule_json) ? (plan!.schedule_json as Row) : null;
  const phases = Array.isArray(schedule?.phases) ? (schedule!.phases as Row[]) : [];
  const weeks = Array.isArray(schedule?.weeks) ? (schedule!.weeks as Row[]) : [];

  return (
    <SiteChrome compact>
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">{t('plan.eyebrow')}</p>
          {plan ? <h1>{String(plan.title ?? '')}</h1> : <span className="p2-skeleton p2-skeleton-line long hero-skeleton" aria-hidden="true" />}
          {plan ? <p className="hero-summary">{String(plan.summary ?? '')}</p> : null}
        </div>
        <aside className="plan-badge">
          <CalendarDays size={22} />
          <strong>{t('plan.days', { count: Number(plan?.duration_days ?? 0) })}</strong>
          <span>{t('plan.intensity', { value: enumLabel(t, 'intensity', plan?.intensity ?? 'moderate') })}</span>
        </aside>
      </section>

      {error ? <p className="notice-banner notice-danger" role="alert">{error}</p> : null}

      {plan ? (
        <>
          <section className="dashboard-grid">
            <article className="metric-card">
              <span className="card-icon"><CalendarDays size={18} /></span>
              <p className="eyebrow">{t('plan.duration')}</p>
              <h2>{t('plan.days', { count: Number(plan.duration_days ?? 0) })}</h2>
              <p>{t('plan.intensity', { value: enumLabel(t, 'intensity', plan.intensity ?? 'moderate') })}</p>
            </article>
            <article className="metric-card metric-card-accent">
              <span className="card-icon"><Gauge size={18} /></span>
              <p className="eyebrow">{t('plan.bandWindow')}</p>
              <h2>{String(plan.band_min ?? '-')}–{String(plan.band_max ?? '-')}</h2>
              <p>{t('plan.focusSkill', { skill: enumLabel(t, 'skill', plan.focus_skill, t('plan.general')) })}</p>
            </article>
            <article className="metric-card">
              <span className="card-icon"><Flame size={18} /></span>
              <p className="eyebrow">{t('plan.routine')}</p>
              <h2>{enumLabel(t, 'planType', plan.plan_type ?? 'balanced')}</h2>
              <p>{t('plan.routine.lead')}</p>
            </article>
          </section>

          <section className="section-band">
            <div className="section-heading">
              <p className="eyebrow">{t('plan.schedule.eyebrow')}</p>
              <h2>{t('plan.schedule.title')}</h2>
              <p>{t('plan.schedule.lead')}</p>
            </div>
            <div className="plan-timeline">
              {phases.map((phase, index) => (
                <article key={`phase-${index}`} className="plan-step">
                  <span><Layers3 size={17} />{t('plan.phase', { n: index + 1 })}</span>
                  <strong>{String(phase.label ?? t('plan.phase', { n: index + 1 }))}</strong>
                  <p>{String(phase.goal ?? '')}</p>
                </article>
              ))}
              {weeks.map((week, index) => (
                <article key={`week-${index}`} className="plan-step">
                  <span><CalendarDays size={17} />{t('plan.week', { n: index + 1 })}</span>
                  <strong>{String(week.label ?? t('plan.week', { n: index + 1 }))}</strong>
                  <p>{Array.isArray(week.focus) ? week.focus.map((item) => String(item)).join(', ') : String(week.focus ?? '')}</p>
                </article>
              ))}
              {phases.length === 0 && weeks.length === 0 ? <p className="muted">{t('plan.schedule.empty')}</p> : null}
            </div>
          </section>

          <section className="ai-panel ai-panel-violet">
            <div className="ai-panel-head">
              <div>
                <p className="eyebrow">{t('plan.ai.eyebrow')}</p>
                <h2>{t('plan.ai.title')}</h2>
                <p>{t('plan.ai.lead')}</p>
              </div>
              <div className="ai-panel-controls">
                <label>
                  {t('plan.ai.hours')}
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={weeklyHours}
                    onChange={(e) => setWeeklyHours(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
                  />
                </label>
                <button type="button" className="button button-primary" onClick={() => void generateAi()} disabled={generating}>
                  <Wand2 size={14} /> {generating ? t('common.generating') : aiPlan ? t('plan.ai.regenerate') : t('plan.ai.generate')} <Sparkles size={13} />
                </button>
              </div>
            </div>

            {aiError ? <p className="inline-error" role="alert">{aiError}</p> : null}
            {saveState === 'saved' ? <p className="ok-text" role="status">{t('plan.ai.saved')}</p> : null}
            {saveState === 'error' ? <p className="inline-error" role="alert">{t('plan.ai.saveError')}</p> : null}

            {aiPlan ? (
              <div className="ai-panel-body" data-testid="ai-plan">
                <div className="ai-panel-card"><p>{aiPlan.intro}</p></div>
                {aiPlan.weeks.length === 0 ? <p className="muted">{t('plan.ai.noWeeks')}</p> : null}
                {aiPlan.weeks.map((week) => (
                  <article key={week.week_number} className="ai-panel-card plan-week">
                    <div className="plan-week-head">
                      <span className="plan-week-badge">{t('plan.week', { n: week.week_number })}</span>
                      <strong>{week.theme}</strong>
                      <span className="muted"><Gauge size={13} /> {t('plan.hoursShort', { count: week.hours })}</span>
                    </div>
                    {week.focus_sections.length > 0 ? (
                      <div className="pill-row">
                        {week.focus_sections.map((s, i) => {
                          const color = SECTION_COLORS[s.toLowerCase()] ?? '#7a7263';
                          return (
                            <span key={i} className="pill" style={{ color, background: `color-mix(in srgb, ${color} 12%, white)` }}>
                              {enumLabel(t, 'skill', s)}
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                    {week.key_activities.length > 0 ? (
                      <div>
                        <p className="ai-panel-label"><ListChecks size={12} /> {t('plan.ai.activities')}</p>
                        <ul>{week.key_activities.map((a, i) => <li key={i}>{a}</li>)}</ul>
                      </div>
                    ) : null}
                    {week.success_criteria ? (
                      <div className="plan-week-success">
                        <CheckCircle2 size={13} /> <strong>{t('plan.ai.byEnd')}</strong> {week.success_criteria}
                      </div>
                    ) : null}
                    {week.playbook_modules.length > 0 ? (
                      <div className="pill-row">
                        {week.playbook_modules.map((mod, i) => (
                          <Link key={i} to={`/${mod}`} className="pill pill-link">{slugTitle(mod)}</Link>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
                <p className="muted small">
                  {t('common.generatedAt', { time: date(aiPlan.generated_at) })} · {t('plan.hoursShort', { count: aiPlan.weekly_hours })}
                </p>
              </div>
            ) : null}
          </section>
        </>
      ) : !error ? (
        <PageSkeleton />
      ) : null}
    </SiteChrome>
  );
};
