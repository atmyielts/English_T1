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
import { useAccess } from '../lib/useAccess';

const PLAYBOOK_URL = 'https://playbook.ielts.schood.online';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const formatLabel = (value: unknown): string =>
  String(value ?? '')
    .replace(/^question_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (token) => token.toUpperCase());

const planItemFocus = (item: PracticePlanItem): string => {
  const summary = isRecord(item.delivery_build?.build_summary) ? item.delivery_build?.build_summary as Record<string, unknown> : {};
  const rawTypes = Array.isArray(summary.target_question_types)
    ? summary.target_question_types
    : Array.isArray(summary.question_types)
      ? summary.question_types
      : Array.isArray(item.blueprint?.target_question_types)
        ? item.blueprint.target_question_types
        : [];
  const labels = rawTypes.map(formatLabel).filter(Boolean);
  return labels.length > 0 ? labels.slice(0, 2).join(', ') : formatLabel(item.section_type);
};

const planItemTitle = (item: PracticePlanItem): string =>
  item.blueprint_id || item.delivery_build_id
    ? `${experienceLabel(item)}: ${planItemFocus(item)}`
    : item.exercise?.title ?? 'Practice session';

const sourceLabel = (item: PracticePlanItem): string => {
  const summary = isRecord(item.delivery_build?.build_summary) ? item.delivery_build?.build_summary as Record<string, unknown> : {};
  const source = String(summary.source_section_name ?? '').trim();
  return source ? `Transformed from simulator source: ${source}` : 'New transformed practice session';
};

const isCurrentTransformedItem = (item: PracticePlanItem): boolean => {
  if (!item.blueprint_id && !item.delivery_build_id) return false;
  const summary = isRecord(item.delivery_build?.build_summary) ? item.delivery_build?.build_summary as Record<string, unknown> : {};
  return summary.transformed === true && typeof summary.source_section_id === 'string' && summary.source_section_id.length > 0;
};

const experienceLabel = (item: PracticePlanItem): string => {
  const summary = item.delivery_build?.build_summary;
  const raw =
    item.delivery_build?.experience_kind ??
    item.blueprint?.experience_kind ??
    (isRecord(summary) ? String(summary.experience_kind ?? '') : '');
  return raw ? formatLabel(raw) : 'Guided Set';
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
      if (loadedItems.some((item) => !isCurrentTransformedItem(item))) {
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
      const firstSectionId = started.first_section_id ?? started.sections?.[0]?.id ?? null;
      if (!sessionId) throw new Error('Practice session started without a session id');

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
      setError(err instanceof Error ? err.message : 'Failed to launch plan item');
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
                  <h4>{planItemTitle(item)}</h4>
                  <p>{item.rationale ?? 'Adaptive selection from your current diagnostics.'}</p>
                  {item.blueprint_id || item.delivery_build_id ? <p>{sourceLabel(item)}</p> : null}
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
