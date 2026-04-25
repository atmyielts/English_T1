import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
const SECTION_ORDER = ['reading', 'listening', 'writing'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isCurrentTransformedItem = (item: PracticePlanItem): boolean => {
  if (!item.blueprint_id && !item.delivery_build_id) return false;
  const summary = isRecord(item.delivery_build?.build_summary) ? item.delivery_build?.build_summary as Record<string, unknown> : {};
  const metadata = isRecord(item.delivery_build?.metadata) ? item.delivery_build?.metadata as Record<string, unknown> : {};
  const labPayload = isRecord(metadata.lab_payload) ? metadata.lab_payload as Record<string, unknown> : {};
  return (
    summary.transformed === true
    && typeof summary.source_section_id === 'string'
    && summary.source_section_id.length > 0
    && labPayload.version === 'ielts.practice.lab.v1'
  );
};

const hasCompleteDailyLabCoverage = (items: PracticePlanItem[]): boolean => {
  const transformedItems = items.filter(isCurrentTransformedItem);
  if (transformedItems.length < SECTION_ORDER.length) return false;
  return SECTION_ORDER.every((section) => transformedItems.some((item) => item.section_type === section));
};

const hasLabPayload = (value: { delivery_build?: { metadata?: unknown } | null }): boolean => {
  const metadata = isRecord(value.delivery_build?.metadata) ? value.delivery_build?.metadata as Record<string, unknown> : {};
  const labPayload = isRecord(metadata.lab_payload) ? metadata.lab_payload as Record<string, unknown> : {};
  return labPayload.version === 'ielts.practice.lab.v1';
};

export const PlanPage = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [targetBand, setTargetBand] = useState('6.5');
  const [readingBand, setReadingBand] = useState('6.5');
  const [listeningBand, setListeningBand] = useState('6.5');
  const [writingBand, setWritingBand] = useState('6.5');
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
      setReadingBand(String((goals.target_section_bands as Record<string, unknown> | undefined)?.reading ?? goals.target_overall_band ?? 6.5));
      setListeningBand(String((goals.target_section_bands as Record<string, unknown> | undefined)?.listening ?? goals.target_overall_band ?? 6.5));
      setWritingBand(String((goals.target_section_bands as Record<string, unknown> | undefined)?.writing ?? goals.target_overall_band ?? 6.5));
      const loadedItems = planRes.items ?? [];
      if (loadedItems.some((item) => !isCurrentTransformedItem(item)) || !hasCompleteDailyLabCoverage(loadedItems)) {
        const generated = await practiceGeneratePlan(accessToken, { refresh_diagnostics: true });
        setPlanItems(generated.items ?? []);
      } else {
        setPlanItems(loadedItems);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan page');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken]);

  const saveGoals = async (): Promise<void> => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      await practiceGoalsPatch(accessToken, {
        target_overall_band: Number(targetBand),
        target_section_bands: {
          reading: Number(readingBand),
          listening: Number(listeningBand),
          writing: Number(writingBand),
        },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save goals');
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async (): Promise<void> => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      await practiceGeneratePlan(accessToken, { refresh_diagnostics: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate plan');
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
        await practiceGeneratePlan(accessToken, { refresh_diagnostics: false }).catch(() => null);
        await load();
        setError('That lab was from an older generated plan, so I refreshed today\'s plan.');
      } else {
        setError(message);
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
    <div className="practice-root">
      <header className="top-nav glass compact">
        <Link className="brand" to="/dashboard">
          <img src="/schood-logo.png" alt="Schood" />
          <div>
            <strong>Daily Practice Plan</strong>
            <span>Configure goals and generate today's focused IELTS sessions</span>
          </div>
        </Link>
        <div className="top-nav-actions">
          <Link to="/dashboard" className="btn ghost">Back</Link>
          <a href={`${PLAYBOOK_URL}/study-plans?source=practice`} className="btn ghost">Playbook</a>
          <button className="btn solid" type="button" onClick={() => void regenerate()} disabled={saving}>
            {saving ? 'Working...' : 'Regenerate'}
          </button>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="glass stat-card">
          <h3>Goal bands</h3>
          <label>Overall target band<input value={targetBand} onChange={(event) => setTargetBand(event.target.value)} /></label>
          <label>Reading target<input value={readingBand} onChange={(event) => setReadingBand(event.target.value)} /></label>
          <label>Listening target<input value={listeningBand} onChange={(event) => setListeningBand(event.target.value)} /></label>
          <label>Writing target<input value={writingBand} onChange={(event) => setWritingBand(event.target.value)} /></label>
          <button className="btn ghost" type="button" onClick={() => void saveGoals()} disabled={saving}>
            Save goals
          </button>
        </section>

        <section className="glass stat-card wide">
          <div className="task-card-head">
            <div>
              <h3>Today's generated plan</h3>
              <p className="muted">Transformed sessions are picked from your target band, simulator result, mastery, and recency.</p>
            </div>
            <div className="task-summary">
              <span>Total {planSummary.total}</span>
              <span>Done {planSummary.completed}</span>
              <span>Active {planSummary.inProgress}</span>
              <span>Pending {planSummary.pending}</span>
            </div>
          </div>

          {loading ? <p>Loading...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          {!loading && planItems.length === 0 ? <p>No plan items generated for today yet.</p> : null}

          <ul className="task-list">
            {planItems.map((item) => (
              <li className="task-item" key={item.id}>
                <div>
                  <span className={`chip ${item.section_type}`}>{item.section_type}</span>
                  <h4>{getPlanItemTitle(item)}</h4>
                  <p>{getPlanItemDescription(item)}</p>
                  <p className="task-why">{getPlanWhyCopy(item)}</p>
                  <div className="task-feature-row">
                    {getPlanExperienceSteps(item).map((step) => (
                      <span className="feature-pill" key={step}>{step}</span>
                    ))}
                  </div>
                  <div className="task-meta-row">
                    {getPlanPersonalizationChips(item).map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                  {item.blueprint_id || item.delivery_build_id ? <p className="source-note">{getPlanSourceCopy(item)}</p> : null}
                </div>
                {item.blueprint_id || item.delivery_build_id ? (
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => void launchPlanItem(item)}
                    disabled={launchingId === item.id}
                  >
                    {launchingId === item.id ? 'Opening...' : item.status === 'completed' ? 'Review' : 'Open'}
                  </button>
                ) : (
                  <button className="btn ghost" type="button" onClick={() => void regenerate()} disabled={saving}>
                    Replace
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
};
