import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminPracticeAnalytics,
  adminPracticeBlueprintBuild,
  adminPracticeBlueprintCreate,
  adminPracticeBlueprintPatch,
  adminPracticeBlueprintsList,
  adminPracticeBuildsList,
  adminPracticeContentFactoryBuild,
  adminPracticeRulesList,
  adminPracticeRulesPatch,
  adminPracticeSourcesList,
  type PracticeBlueprint,
  type PracticeDeliveryBuild,
  type PracticeRule,
  type PracticeSourceCatalogItem,
} from '../lib/api';
import { useAccess } from '../lib/useAccess';

type TabKey = 'factory' | 'sources' | 'blueprints' | 'builds' | 'rules' | 'analytics';

const joinParts = (parts: Array<string | null | undefined>): string => parts.filter(Boolean).join(' | ');

const summarizeQuestionTypes = (source: PracticeSourceCatalogItem | PracticeDeliveryBuild | null | undefined): string => {
  if (!source) return 'No question types';
  if ('question_types' in source && Array.isArray(source.question_types) && source.question_types.length > 0) {
    return source.question_types.join(', ');
  }
  if ('build_summary' in source) {
    const buildSummary = source.build_summary;
    if (buildSummary && typeof buildSummary === 'object' && Array.isArray((buildSummary as Record<string, unknown>).question_types)) {
      const values = (buildSummary as Record<string, unknown>).question_types as string[];
      return values.length > 0 ? values.join(', ') : 'No question types';
    }
  }
  return 'No question types';
};

const summarizeBuildContext = (build: PracticeDeliveryBuild): string => {
  const summary = build.build_summary;
  if (!summary || typeof summary !== 'object') return 'No summary';
  const row = summary as Record<string, unknown>;
  return joinParts([
    row.has_passage === true ? 'passage' : null,
    row.has_audio === true ? 'audio' : null,
    row.has_image === true ? 'image' : null,
  ]) || 'question-only';
};

const summarizeAnalytics = (analytics: unknown): Array<{ label: string; value: string }> => {
  if (!analytics || typeof analytics !== 'object') return [];
  const record = analytics as Record<string, unknown>;
  return [
    { label: 'Attempts', value: String(record.total_attempts ?? '-') },
    { label: 'Users', value: String(record.distinct_users ?? '-') },
    { label: 'Completed', value: String(record.completed_attempts ?? '-') },
    { label: 'Signals', value: String(record.signals_emitted ?? '-') },
  ];
};

export const AdminPage = () => {
  const { accessToken } = useAccess();
  const [tab, setTab] = useState<TabKey>('sources');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sources, setSources] = useState<PracticeSourceCatalogItem[]>([]);
  const [blueprints, setBlueprints] = useState<Array<PracticeBlueprint & { latest_build: PracticeDeliveryBuild | null }>>([]);
  const [builds, setBuilds] = useState<PracticeDeliveryBuild[]>([]);
  const [rules, setRules] = useState<PracticeRule[]>([]);
  const [analytics, setAnalytics] = useState<unknown>(null);
  const [factoryResult, setFactoryResult] = useState<unknown>(null);

  const [sourceSectionType, setSourceSectionType] = useState('');
  const [factorySectionType, setFactorySectionType] = useState('');
  const [factoryPublish, setFactoryPublish] = useState(true);
  const [analyticsDays, setAnalyticsDays] = useState('30');

  const loadBase = async (): Promise<void> => {
    if (!accessToken) return;
    const [sourceRes, blueprintRes, buildRes, rulesRes] = await Promise.all([
      adminPracticeSourcesList(accessToken, { section_type: sourceSectionType || undefined, limit: 200 }),
      adminPracticeBlueprintsList(accessToken),
      adminPracticeBuildsList(accessToken),
      adminPracticeRulesList(accessToken),
    ]);
    setSources(sourceRes.sources ?? []);
    setBlueprints(blueprintRes.blueprints ?? []);
    setBuilds(buildRes.builds ?? []);
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
  }, [accessToken, sourceSectionType]);

  const createBlueprintFromSource = async (source: PracticeSourceCatalogItem): Promise<void> => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await adminPracticeBlueprintCreate(accessToken, {
        source_section_id: source.section_id,
        title: `${source.experience_name} | ${source.section_name}`,
        target_question_types: source.question_types,
        estimated_minutes: source.section_type === 'writing' ? 40 : 25,
        metadata: {
          source_part_count: source.part_count,
          source_question_count: source.question_count,
        },
      });
      await loadBase();
      setTab('blueprints');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create blueprint');
    } finally {
      setBusy(false);
    }
  };

  const updateBlueprintStatus = async (id: string, status: string): Promise<void> => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await adminPracticeBlueprintPatch(accessToken, id, { status });
      await loadBase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update blueprint');
    } finally {
      setBusy(false);
    }
  };

  const buildBlueprint = async (blueprintId: string, publish: boolean): Promise<void> => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await adminPracticeBlueprintBuild(accessToken, { blueprint_id: blueprintId, publish });
      await loadBase();
      setTab('builds');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build blueprint');
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

  const runContentFactory = async (): Promise<void> => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await adminPracticeContentFactoryBuild(accessToken, {
        section_type: factorySectionType || undefined,
        publish: factoryPublish,
      });
      setFactoryResult(response);
      await loadBase();
      setTab('factory');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run Content Factory');
    } finally {
      setBusy(false);
    }
  };

  const publishedBlueprints = useMemo(
    () => blueprints.filter((row) => row.status === 'published').length,
    [blueprints],
  );

  const publishedBuilds = useMemo(
    () => builds.filter((row) => row.status === 'published').length,
    [builds],
  );

  const analyticsSummary = useMemo(() => summarizeAnalytics(analytics), [analytics]);

  const tabButtons: Array<{ key: TabKey; label: string }> = useMemo(
    () => [
      { key: 'factory', label: 'Factory' },
      { key: 'sources', label: 'Sources' },
      { key: 'blueprints', label: 'Blueprints' },
      { key: 'builds', label: 'Builds' },
      { key: 'rules', label: 'Rules' },
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
            <span>Source curation, blueprint packaging, publishing, and recommendation control</span>
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
              <button
                key={entry.key}
                className={tab === entry.key ? 'btn solid' : 'btn ghost'}
                type="button"
                onClick={() => setTab(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="field-grid" style={{ marginTop: 16 }}>
            <div className="glass stat-card">
              <h3>Blueprints</h3>
              <p>{blueprints.length} total | {publishedBlueprints} published</p>
            </div>
            <div className="glass stat-card">
              <h3>Builds</h3>
              <p>{builds.length} total | {publishedBuilds} published</p>
            </div>
            <div className="glass stat-card">
              <h3>Sources</h3>
              <p>{sources.length} simulator sections available for packaging</p>
            </div>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
          {busy ? <p>Working...</p> : null}

          {tab === 'factory' ? (
            <section className="factory-panel">
              <div>
                <h3>Content Factory</h3>
                <p className="muted">
                  Build transformed R/L/W practice coverage from simulator sources: strategy, repair drill, guided set, timed mini-session, writing rewrite, and mastery check.
                </p>
              </div>
              <div className="field-grid">
                <label>
                  Section
                  <select value={factorySectionType} onChange={(event) => setFactorySectionType(event.target.value)}>
                    <option value="">all R/L/W</option>
                    <option value="reading">reading</option>
                    <option value="listening">listening</option>
                    <option value="writing">writing</option>
                  </select>
                </label>
                <label className="option-row">
                  <input type="checkbox" checked={factoryPublish} onChange={(event) => setFactoryPublish(event.target.checked)} />
                  Publish builds
                </label>
              </div>
              <button className="btn solid" type="button" onClick={() => void runContentFactory()} disabled={busy}>
                {busy ? 'Building...' : 'Build Full Coverage'}
              </button>

              {factoryResult && typeof factoryResult === 'object' ? (
                <div className="factory-summary">
                  {[
                    ['Created', (factoryResult as Record<string, unknown>).created],
                    ['Reused', (factoryResult as Record<string, unknown>).reused],
                    ['Built', (factoryResult as Record<string, unknown>).built],
                    ['Failed', (factoryResult as Record<string, unknown>).failed],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="summary-tile">
                      <span>{String(label)}</span>
                      <strong>{String(value ?? '-')}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === 'sources' ? (
            <>
              <div className="field-grid">
                <label>
                  Section filter
                  <select value={sourceSectionType} onChange={(event) => setSourceSectionType(event.target.value)}>
                    <option value="">all</option>
                    <option value="reading">reading</option>
                    <option value="listening">listening</option>
                    <option value="writing">writing</option>
                  </select>
                </label>
              </div>

              <ul className="task-list">
                {sources.map((source) => (
                  <li key={source.section_id} className="task-item">
                    <div>
                      <span className={`chip ${source.section_type}`}>{source.section_type}</span>
                      <h4>{source.experience_name} | {source.section_name}</h4>
                      <p>
                        {joinParts([
                          `${source.part_count} parts`,
                          `${source.unit_count} units`,
                          `${source.question_count} questions`,
                          summarizeQuestionTypes(source),
                        ])}
                      </p>
                      <p>
                        {joinParts([
                          source.has_passage ? 'passage' : null,
                          source.has_audio ? 'audio' : null,
                          source.has_image ? 'image' : null,
                        ]) || 'question-only'}
                      </p>
                    </div>
                    <button className="btn solid" type="button" onClick={() => void createBlueprintFromSource(source)}>
                      Create Blueprint
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {tab === 'blueprints' ? (
            <ul className="task-list">
              {blueprints.map((blueprint) => (
                <li className="task-item" key={blueprint.id}>
                  <div>
                    <span className={`chip ${blueprint.section_type}`}>{blueprint.section_type}</span>
                    <h4>{blueprint.title}</h4>
                    <p>
                      {joinParts([
                        `status: ${blueprint.status}`,
                        `target types: ${blueprint.target_question_types.length > 0 ? blueprint.target_question_types.join(', ') : 'mixed'}`,
                      ])}
                    </p>
                    <p>
                      {blueprint.latest_build
                        ? `latest build: v${blueprint.latest_build.build_version} | ${blueprint.latest_build.status}`
                        : 'latest build: none'}
                    </p>
                  </div>
                  <div className="inline-actions">
                    <button className="btn ghost" type="button" onClick={() => void buildBlueprint(blueprint.id, false)}>Build Draft</button>
                    <button className="btn solid" type="button" onClick={() => void buildBlueprint(blueprint.id, true)}>Build and Publish</button>
                    <button className="btn ghost" type="button" onClick={() => void updateBlueprintStatus(blueprint.id, 'draft')}>Draft</button>
                    <button className="btn ghost" type="button" onClick={() => void updateBlueprintStatus(blueprint.id, 'archived')}>Archive</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === 'builds' ? (
            <ul className="task-list">
              {builds.map((build) => (
                <li className="task-item" key={build.id}>
                  <div>
                    <h4>{build.blueprint?.title ?? `Build ${build.id.slice(0, 8)}`} | v{build.build_version}</h4>
                    <p>{joinParts([`status: ${build.status}`, summarizeBuildContext(build)])}</p>
                    <p>{summarizeQuestionTypes(build)}</p>
                  </div>
                  <div className="inline-actions">
                    <span className={`status-pill ${build.status}`}>{build.status}</span>
                  </div>
                </li>
              ))}
            </ul>
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
                          setRules((prev) => prev.map((row) => (
                            row.id === rule.id
                              ? { ...row, weight: Number.isFinite(value) ? value : row.weight }
                              : row
                          )));
                        }}
                      />
                      <select
                        value={rule.status}
                        onChange={(event) => setRules((prev) => prev.map((row) => (
                          row.id === rule.id ? { ...row, status: event.target.value } : row
                        )))}
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

          {tab === 'analytics' ? (
            <div className="field-grid">
              <label>
                Window days
                <input value={analyticsDays} onChange={(event) => setAnalyticsDays(event.target.value)} />
              </label>
              <button className="btn solid" type="button" onClick={() => void loadAnalytics()}>Load analytics</button>
              {analyticsSummary.length > 0 ? (
                <div className="field-grid">
                  {analyticsSummary.map((item) => (
                    <div key={item.label} className="glass stat-card">
                      <h3>{item.label}</h3>
                      <p>{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {analytics ? <pre className="json-box">{JSON.stringify(analytics, null, 2)}</pre> : null}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
};
