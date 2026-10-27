import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PracticeShell } from '../components/PracticeShell';
import { EmptyCatalogueCard } from '../components/PracticeContextBanner';
import { sectionLabel, useAppT, useErrorText } from '../i18n';
import {
  practiceGeneratePlan,
  practiceGoalsGet,
  practiceGoalsPatch,
  practicePlanItemStart,
  practiceTodayPlan,
  type PracticePlanItem,
} from '../lib/api';
import { IELTS_PRACTICE_PRODUCT_ID } from '../lib/constants';
import {
  getPlanExperienceSteps,
  getPlanItemDescription,
  getPlanItemTitle,
  getPlanPersonalizationChips,
  getPlanSourceCopy,
  getPlanWhyCopy,
} from '../lib/practiceExperience';
import { useAccess } from '../lib/useAccess';

const PLAYBOOK_URL = 'https://playbook.ielts.schood.online';
const browserTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const todayLocalDate = (): string => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const hasLabPayload = (value: { delivery_build?: { metadata?: unknown } | null }): boolean => {
  const metadata = isRecord(value.delivery_build?.metadata) ? value.delivery_build?.metadata as Record<string, unknown> : {};
  const labPayload = isRecord(metadata.lab_payload) ? metadata.lab_payload as Record<string, unknown> : {};
  return labPayload.version === 'ielts.practice.lab.v1';
};

export const PlanPage = () => {
  const t = useAppT();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [targetBand, setTargetBand] = useState('6.5');
  const [sectionBands, setSectionBands] = useState<Record<'reading' | 'listening' | 'writing' | 'speaking', string>>({ reading: '6.5', listening: '6.5', writing: '6.5', speaking: '6.5' });
  const [emptyCatalogue, setEmptyCatalogue] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [practiceStartDate, setPracticeStartDate] = useState(todayLocalDate());
  const [programDurationDays, setProgramDurationDays] = useState('30');
  const [dailyPracticeMinutes, setDailyPracticeMinutes] = useState('60');
  const [timezone, setTimezone] = useState(browserTimezone());
  const [planItems, setPlanItems] = useState<PracticePlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [goalsRes, planRes] = await Promise.all([
        practiceGoalsGet(accessToken),
        practiceTodayPlan(accessToken),
      ]);
      const goals = goalsRes.goals;
      setTargetBand(String(goals.target_overall_band ?? 6.5));
      const bands = (goals.target_section_bands ?? {}) as Record<string, unknown>;
      const fallback = goals.target_overall_band ?? 6.5;
      setSectionBands({
        reading: String(bands.reading ?? fallback),
        listening: String(bands.listening ?? fallback),
        writing: String(bands.writing ?? fallback),
        speaking: String(bands.speaking ?? fallback),
      });
      setPracticeStartDate(goals.practice_start_date || todayLocalDate());
      setProgramDurationDays(String(goals.program_duration_days ?? 30));
      setDailyPracticeMinutes(String(goals.daily_practice_minutes ?? 60));
      setTimezone(goals.timezone || browserTimezone());
      setPlanItems(planRes.items ?? []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const saveGoals = async (): Promise<void> => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      await practiceGoalsPatch(accessToken, {
        target_overall_band: Number(targetBand),
        target_section_bands: {
          reading: Number(sectionBands.reading),
          listening: Number(sectionBands.listening),
          writing: Number(sectionBands.writing),
          speaking: Number(sectionBands.speaking),
        },
        practice_start_date: practiceStartDate || todayLocalDate(),
        program_duration_days: Number(programDurationDays),
        daily_practice_minutes: Number(dailyPracticeMinutes),
        timezone: timezone || browserTimezone(),
      });
      await load();
      setNotice(t('plan.saved'));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async (): Promise<void> => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const result = await practiceGeneratePlan(accessToken, {
        refresh_diagnostics: true,
        daily_minutes: Number(dailyPracticeMinutes),
        timezone: timezone || browserTimezone(),
      });
      setEmptyCatalogue(Boolean(result.empty_reason) && result.items.length === 0);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const launchPlanItem = async (item: PracticePlanItem): Promise<void> => {
    if (!accessToken) return;
    if (!item.blueprint_id && !item.delivery_build_id) return;

    setLaunchingId(item.id);
    setError(null);
    try {
      const started = await practicePlanItemStart(accessToken, item.id);
      const sessionId = started.session?.id ?? started.practice_session?.session_id ?? null;
      const practiceSessionId = started.practice_session?.id ?? null;
      const firstSectionId = started.first_section_id ?? started.sections?.[0]?.id ?? null;
      const labReady = hasLabPayload(started);
      if (!sessionId) throw new Error('Practice session started without a session id');

      if (labReady && practiceSessionId) {
        navigate(`/lab/${encodeURIComponent(practiceSessionId)}?back=/plan`);
        return;
      }

      const runtimeQuery = new URLSearchParams({
        results_back: '/plan',
        review_back: '/plan',
        review_product_id: IELTS_PRACTICE_PRODUCT_ID,
        playbook_source: 'practice',
      }).toString();

      if (started.practice_session?.status === 'completed' || started.session?.status === 'completed') {
        navigate(`/session/${encodeURIComponent(sessionId)}/results?${runtimeQuery}`);
        return;
      }

      if (!firstSectionId) throw new Error('Practice session started without a section id');
      navigate(`/session/${encodeURIComponent(sessionId)}/${encodeURIComponent(firstSectionId)}?${runtimeQuery}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to launch plan item';
      if (message.toLowerCase().includes('plan item not found')) {
        await practiceGeneratePlan(accessToken, {
          refresh_diagnostics: false,
          daily_minutes: Number(dailyPracticeMinutes),
          timezone: timezone || browserTimezone(),
        }).catch(() => null);
        await load();
        setError(t('plan.stale'));
      } else {
        setError(errorText(err));
      }
    } finally {
      setLaunchingId((current) => (current === item.id ? null : current));
    }
  };

  const planSummary = useMemo(() => {
    const total = planItems.length;
    const completed = planItems.filter((item) => item.status === 'completed').length;
    const inProgress = planItems.filter((item) => item.status === 'in_progress').length;
    return {
      total,
      completed,
      inProgress,
      pending: Math.max(0, total - completed - inProgress),
    };
  }, [planItems]);

  return (
    <PracticeShell>
      <header className="practice-page-head">
        <div>
          <span className="eyebrow">{t('plan.eyebrow')}</span>
          <h1>{t('plan.title')}</h1>
          <p className="muted">{t('plan.lead')}</p>
        </div>
        <div className="inline-actions">
          <a className="btn ghost compact" href={`${PLAYBOOK_URL}/study-plans?source=practice`}>{t('plan.playbook')}</a>
          <button className="btn solid compact" type="button" onClick={() => void regenerate()} disabled={saving}>
            {saving ? t('plan.working') : t('plan.regenerate')}
          </button>
        </div>
      </header>

      {emptyCatalogue ? <EmptyCatalogueCard /> : null}

      <div className="dash-two-col plan-layout">
        <section className="glass dash-card plan-goals">
          <h3>{t('plan.goals')}</h3>
          <label>{t('plan.overall')}<input className="practice-input" inputMode="decimal" value={targetBand} onChange={(event) => setTargetBand(event.target.value)} /></label>
          {(['reading', 'listening', 'writing', 'speaking'] as const).map((section) => (
            <label key={section}>
              {t('plan.sectionTarget', { section: sectionLabel(t, section) })}
              <input className="practice-input" inputMode="decimal" value={sectionBands[section]} onChange={(event) => setSectionBands((prev) => ({ ...prev, [section]: event.target.value }))} />
            </label>
          ))}
          <label>{t('plan.start')}<input className="practice-input" type="date" value={practiceStartDate} onChange={(event) => setPracticeStartDate(event.target.value)} /></label>
          <label>{t('plan.duration')}<input className="practice-input" type="number" min="1" max="365" value={programDurationDays} onChange={(event) => setProgramDurationDays(event.target.value)} /></label>
          <label>{t('plan.minutes')}<input className="practice-input" type="number" min="10" max="360" step="5" value={dailyPracticeMinutes} onChange={(event) => setDailyPracticeMinutes(event.target.value)} /></label>
          <label>{t('plan.timezone')}<input className="practice-input" value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
          <button className="btn ghost" type="button" onClick={() => void saveGoals()} disabled={saving}>{t('plan.save')}</button>
          {notice ? <p className="muted" role="status">{notice}</p> : null}
        </section>

        <section className="glass dash-card">
          <div className="task-card-head">
            <div>
              <h3>{t('plan.today')}</h3>
              <p className="muted">{t('plan.todayLead')}</p>
            </div>
            <div className="task-summary">
              <span>{t('plan.total', { count: planSummary.total })}</span>
              <span>{t('plan.done', { count: planSummary.completed })}</span>
              <span>{t('plan.active', { count: planSummary.inProgress })}</span>
              <span>{t('plan.pending', { count: planSummary.pending })}</span>
            </div>
          </div>

          {loading ? <p>{t('plan.loading')}</p> : null}
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          {!loading && planItems.length === 0 && !emptyCatalogue ? <p>{t('plan.empty')}</p> : null}

          <ul className="task-list">
            {planItems.map((item) => (
              <li className="task-item" key={item.id}>
                <div>
                  <span className={`chip ${item.section_type}`}>{sectionLabel(t, item.section_type)}</span>
                  <h4>{getPlanItemTitle(item, t)}</h4>
                  <p>{getPlanItemDescription(item, t)}</p>
                  <p className="task-why">{getPlanWhyCopy(item, t)}</p>
                  <div className="task-feature-row">
                    {getPlanExperienceSteps(item, t).map((step) => (
                      <span className="feature-pill" key={step}>{step}</span>
                    ))}
                  </div>
                  <div className="task-meta-row">
                    {getPlanPersonalizationChips(item, t).map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                  {item.blueprint_id || item.delivery_build_id ? <p className="source-note">{getPlanSourceCopy(item, t)}</p> : null}
                </div>
                {item.blueprint_id || item.delivery_build_id ? (
                  <button className="btn ghost" type="button" onClick={() => void launchPlanItem(item)} disabled={launchingId === item.id}>
                    {launchingId === item.id ? t('common.opening') : item.status === 'completed' ? t('plan.review') : t('plan.open')}
                  </button>
                ) : (
                  <button className="btn ghost" type="button" onClick={() => void regenerate()} disabled={saving}>{t('plan.replace')}</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PracticeShell>
  );
};
