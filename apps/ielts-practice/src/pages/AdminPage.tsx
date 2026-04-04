import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminPracticeAnalytics,
  adminPracticeExerciseCreate,
  adminPracticeExercisePatch,
  adminPracticeExercisesList,
  adminPracticeImportFromSimulator,
  adminPracticePreviewPlan,
  adminPracticeRulesList,
  adminPracticeRulesPatch,
  type PracticeExercise,
  type PracticeRule,
} from '../lib/api';
import { useAccess } from '../lib/useAccess';

type TabKey = 'exercises' | 'import' | 'rules' | 'preview' | 'analytics';

export const AdminPage = () => {
  const { accessToken } = useAccess();
  const [tab, setTab] = useState<TabKey>('exercises');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exercises, setExercises] = useState<PracticeExercise[]>([]);
  const [rules, setRules] = useState<PracticeRule[]>([]);
  const [preview, setPreview] = useState<unknown>(null);
  const [analytics, setAnalytics] = useState<unknown>(null);

  const [newExercise, setNewExercise] = useState({
    title: '',
    section_type: 'reading' as 'reading' | 'listening' | 'writing',
    question_type: 'question_text',
    status: 'draft' as 'draft' | 'published',
  });

  const [importPayload, setImportPayload] = useState({
    experience_id: '',
    section_type: '',
    limit: '200',
    publish: false,
  });

  const [previewUserId, setPreviewUserId] = useState('');
  const [analyticsDays, setAnalyticsDays] = useState('30');

  const loadBase = async (): Promise<void> => {
    if (!accessToken) return;
    const [exerciseRes, rulesRes] = await Promise.all([
      adminPracticeExercisesList(accessToken),
      adminPracticeRulesList(accessToken),
    ]);
    setExercises(exerciseRes.exercises ?? []);
    setRules(rulesRes.rules ?? []);
  };

  useEffect(() => {
    const run = async (): Promise<void> => {
      if (!accessToken) return;
      setBusy(true);
      setError(null);
      try {
        await loadBase();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load admin data');
      } finally {
        setBusy(false);
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const createExercise = async (): Promise<void> => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await adminPracticeExerciseCreate(accessToken, newExercise);
      setNewExercise({ title: '', section_type: 'reading', question_type: 'question_text', status: 'draft' });
      await loadBase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create exercise');
    } finally {
      setBusy(false);
    }
  };

  const publishExercise = async (id: string, status: string): Promise<void> => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await adminPracticeExercisePatch(accessToken, id, { status });
      await loadBase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update exercise');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (): Promise<void> => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await adminPracticeImportFromSimulator(accessToken, {
        experience_id: importPayload.experience_id || undefined,
        section_type: importPayload.section_type || undefined,
        limit: Number(importPayload.limit),
        publish: importPayload.publish,
      });
      await loadBase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const saveRules = async (): Promise<void> => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await adminPracticeRulesPatch(
        accessToken,
        rules.map((rule) => ({
          rule_key: rule.rule_key,
          rule_name: rule.rule_name,
          description: rule.description,
          weight: rule.weight,
          status: rule.status,
          config: rule.config,
        })),
      );
      await loadBase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rules');
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async (): Promise<void> => {
    if (!accessToken || !previewUserId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await adminPracticePreviewPlan(accessToken, previewUserId.trim(), 10);
      setPreview(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
    } finally {
      setBusy(false);
    }
  };

  const loadAnalytics = async (): Promise<void> => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await adminPracticeAnalytics(accessToken, Number(analyticsDays));
      setAnalytics(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setBusy(false);
    }
  };

  const tabButtons: Array<{ key: TabKey; label: string }> = useMemo(
    () => [
      { key: 'exercises', label: 'Exercises' },
      { key: 'import', label: 'Import' },
      { key: 'rules', label: 'Rules' },
      { key: 'preview', label: 'Preview' },
      { key: 'analytics', label: 'Analytics' },
    ],
    [],
  );

  return (
    <div className="practice-root">
      <header className="top-nav glass compact">
        <Link className="brand" to="/dashboard">
          <img src="/schood-logo.png" alt="Schood" />
          <div>
            <strong>IELTS Practice Admin</strong>
            <span>Exercise bank, import, rules, analytics</span>
          </div>
        </Link>
        <div className="top-nav-actions">
          <Link to="/dashboard" className="btn ghost">Dashboard</Link>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="glass stat-card wide">
          <div className="tab-row">
            {tabButtons.map((entry) => (
              <button key={entry.key} className={tab === entry.key ? 'btn solid' : 'btn ghost'} type="button" onClick={() => setTab(entry.key)}>
                {entry.label}
              </button>
            ))}
          </div>

          {error ? <p className="error-text">{error}</p> : null}
          {busy ? <p>Working...</p> : null}

          {tab === 'exercises' ? (
            <>
              <div className="field-grid">
                <label>Title<input value={newExercise.title} onChange={(event) => setNewExercise((prev) => ({ ...prev, title: event.target.value }))} /></label>
                <label>Section
                  <select
                    value={newExercise.section_type}
                    onChange={(event) =>
                      setNewExercise((prev) => ({
                        ...prev,
                        section_type: event.target.value as 'reading' | 'listening' | 'writing',
                      }))}
                  >
                    <option value="reading">reading</option>
                    <option value="listening">listening</option>
                    <option value="writing">writing</option>
                  </select>
                </label>
                <label>Question type<input value={newExercise.question_type} onChange={(event) => setNewExercise((prev) => ({ ...prev, question_type: event.target.value }))} /></label>
                <label>Status
                  <select
                    value={newExercise.status}
                    onChange={(event) =>
                      setNewExercise((prev) => ({ ...prev, status: event.target.value as 'draft' | 'published' }))}
                  >
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                  </select>
                </label>
              </div>
              <button className="btn ghost" type="button" onClick={() => void createExercise()}>Create exercise</button>

              <ul className="task-list">
                {exercises.map((exercise) => (
                  <li className="task-item" key={exercise.id}>
                    <div>
                      <span className={`chip ${exercise.section_type}`}>{exercise.section_type}</span>
                      <h4>{exercise.title}</h4>
                      <p>{exercise.question_type} · status: {exercise.status}</p>
                    </div>
                    <div className="inline-actions">
                      <button className="btn ghost" type="button" onClick={() => void publishExercise(exercise.id, 'draft')}>Draft</button>
                      <button className="btn ghost" type="button" onClick={() => void publishExercise(exercise.id, 'published')}>Publish</button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {tab === 'import' ? (
            <div className="field-grid">
              <label>Experience id (optional)<input value={importPayload.experience_id} onChange={(event) => setImportPayload((prev) => ({ ...prev, experience_id: event.target.value }))} /></label>
              <label>Section filter
                <select value={importPayload.section_type} onChange={(event) => setImportPayload((prev) => ({ ...prev, section_type: event.target.value }))}>
                  <option value="">all</option>
                  <option value="reading">reading</option>
                  <option value="listening">listening</option>
                  <option value="writing">writing</option>
                </select>
              </label>
              <label>Limit<input value={importPayload.limit} onChange={(event) => setImportPayload((prev) => ({ ...prev, limit: event.target.value }))} /></label>
              <label>Publish imported
                <select value={importPayload.publish ? 'yes' : 'no'} onChange={(event) => setImportPayload((prev) => ({ ...prev, publish: event.target.value === 'yes' }))}>
                  <option value="no">no</option>
                  <option value="yes">yes</option>
                </select>
              </label>
              <button className="btn solid" type="button" onClick={() => void runImport()}>Run import</button>
            </div>
          ) : null}

          {tab === 'rules' ? (
            <>
              <ul className="task-list">
                {rules.map((rule) => (
                  <li key={rule.id} className="task-item">
                    <div>
                      <h4>{rule.rule_key}</h4>
                      <p>{rule.description ?? '-'}</p>
                    </div>
                    <div className="inline-actions">
                      <input
                        value={String(rule.weight)}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          setRules((prev) => prev.map((row) => (row.id === rule.id ? { ...row, weight: Number.isFinite(value) ? value : row.weight } : row)));
                        }}
                      />
                      <select
                        value={rule.status}
                        onChange={(event) => setRules((prev) => prev.map((row) => (row.id === rule.id ? { ...row, status: event.target.value } : row)))}
                      >
                        <option value="active">active</option>
                        <option value="draft">draft</option>
                        <option value="disabled">disabled</option>
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
              <button className="btn solid" type="button" onClick={() => void saveRules()}>Save rules</button>
            </>
          ) : null}

          {tab === 'preview' ? (
            <div className="field-grid">
              <label>User id<input value={previewUserId} onChange={(event) => setPreviewUserId(event.target.value)} /></label>
              <button className="btn solid" type="button" onClick={() => void runPreview()}>Generate preview</button>
              {preview ? <pre className="json-box">{JSON.stringify(preview, null, 2)}</pre> : null}
            </div>
          ) : null}

          {tab === 'analytics' ? (
            <div className="field-grid">
              <label>Window days<input value={analyticsDays} onChange={(event) => setAnalyticsDays(event.target.value)} /></label>
              <button className="btn solid" type="button" onClick={() => void loadAnalytics()}>Load analytics</button>
              {analytics ? <pre className="json-box">{JSON.stringify(analytics, null, 2)}</pre> : null}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
};

