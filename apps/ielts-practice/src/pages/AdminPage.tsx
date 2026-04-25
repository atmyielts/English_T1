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
type LoadWarning = { area: string; message: string };

const joinParts = (parts: Array<string | null | undefined>): string => parts.filter(Boolean).join(' | ');

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asRecordArray = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') as Array<Record<string, unknown>> : [];

const compactClass = (value: string | null | undefined): string =>
  String(value ?? 'unknown').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');

const titleCase = (value: string | null | undefined): string =>
  String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || '-';

const getErrorMessage = (err: unknown): string => (err instanceof Error ? err.message : 'Request failed');

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatRatio = (value: unknown): string => {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${Math.round(number * 100)}%`;
};

const formatCount = (value: unknown): string => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? String(number) : '-';
};

const summarizeQuestionTypes = (
  source: PracticeSourceCatalogItem | PracticeDeliveryBuild | PracticeBlueprint | null | undefined,
): string => {
  if (!source) return 'No question types';
  if ('question_types' in source && Array.isArray(source.question_types) && source.question_types.length > 0) {
    return source.question_types.join(', ');
  }
  if ('target_question_types' in source && Array.isArray(source.target_question_types) && source.target_question_types.length > 0) {
    return source.target_question_types.join(', ');
  }
  if ('build_summary' in source) {
    const buildSummary = asRecord(source.build_summary);
    const types = Array.isArray(buildSummary.question_types)
      ? buildSummary.question_types
      : Array.isArray(buildSummary.target_question_types)
        ? buildSummary.target_question_types
        : [];
    const values = types.map((entry) => String(entry)).filter(Boolean);
    return values.length > 0 ? values.join(', ') : 'No question types';
  }
  return 'No question types';
};

const summarizeBuildContext = (build: PracticeDeliveryBuild): string => {
  const row = asRecord(build.build_summary);
  return joinParts([
    row.has_passage === true ? 'passage' : null,
    row.has_audio === true ? 'audio' : null,
    row.has_image === true ? 'image' : null,
  ]) || 'question-only';
};

const summarizeValidation = (build: PracticeDeliveryBuild): string => {
  const validation = asRecord(build.validation_summary);
  const errors = Array.isArray(validation.errors) ? validation.errors.length : 0;
  const warnings = Array.isArray(validation.warnings) ? validation.warnings.length : 0;
  if (errors > 0) return `${errors} issue${errors === 1 ? '' : 's'}`;
  if (warnings > 0) return `${warnings} warning${warnings === 1 ? '' : 's'}`;
  return validation.ok === false ? 'needs review' : 'validated';
};

const summarizeAnalytics = (analytics: unknown): Array<{ label: string; value: string }> => {
  const record = asRecord(analytics);
  const totals = Object.keys(asRecord(record.totals)).length > 0 ? asRecord(record.totals) : record;
  return [
    { label: 'Attempts', value: formatCount(totals.attempts ?? totals.total_attempts) },
    { label: 'Users', value: formatCount(totals.unique_users ?? totals.distinct_users) },
    { label: 'Scored', value: formatCount(totals.scored_attempts ?? totals.completed_attempts) },
    { label: 'Accuracy', value: formatRatio(totals.accuracy_avg) },
  ];
};

const defaultKindForSection = (sectionType: PracticeSourceCatalogItem['section_type']): string => (
  sectionType === 'writing' ? 'writing_rewrite' : 'guided_set'
);

const FACTORY_SECTIONS = ['reading', 'listening', 'writing'] as const;

const factoryKindsForSection = (sectionType: string): string[] => (
  sectionType === 'writing'
    ? ['strategy', 'writing_rewrite', 'guided_set', 'timed_mini', 'mastery_check']
    : ['strategy', 'repair_drill', 'guided_set', 'timed_mini', 'mastery_check']
);

type FactoryBuildResponse = Awaited<ReturnType<typeof adminPracticeContentFactoryBuild>>;

type FactoryAggregate = {
  ok: boolean;
  publish: boolean;
  created: number;
  reused: number;
  built: number;
  failed: number;
  coverage: Record<string, unknown>;
  results: unknown[];
  batches: number;
  current: string;
  running: boolean;
};

export const AdminPage = () => {
  const { accessToken } = useAccess();
  const [tab, setTab] = useState<TabKey>('factory');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadWarnings, setLoadWarnings] = useState<LoadWarning[]>([]);

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
    const results = await Promise.allSettled([
      adminPracticeSourcesList(accessToken, { section_type: sourceSectionType || undefined, limit: 200 }),
      adminPracticeBlueprintsList(accessToken),
      adminPracticeBuildsList(accessToken),
      adminPracticeRulesList(accessToken),
    ] as const);

    const warnings: LoadWarning[] = [];
    const applyResult = <T,>(result: PromiseSettledResult<T>, area: string, apply: (value: T) => void): void => {
      if (result.status === 'fulfilled') {
        apply(result.value);
        return;
      }
      warnings.push({ area, message: getErrorMessage(result.reason) });
    };

    applyResult(results[0], 'Sources', (value) => setSources(value.sources ?? []));
    applyResult(results[1], 'Blueprints', (value) => setBlueprints(value.blueprints ?? []));
    applyResult(results[2], 'Builds', (value) => setBuilds(value.builds ?? []));
    applyResult(results[3], 'Rules', (value) => setRules(value.rules ?? []));
    setLoadWarnings(warnings);

    if (warnings.length === results.length) {
      throw new Error('Admin data could not be loaded.');
    }
  };

  useEffect(() => {
    const run = async (): Promise<void> => {
      if (!accessToken) return;
      setBusy(true);
      setError(null);
      try {
        await loadBase();
      } catch (err) {
        setError(getErrorMessage(err));
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
        experience_kind: defaultKindForSection(source.section_type),
        estimated_minutes: source.section_type === 'writing' ? 40 : 25,
        metadata: {
          source_part_count: source.part_count,
          source_question_count: source.question_count,
        },
      });
      await loadBase();
      setTab('blueprints');
    } catch (err) {
      setError(getErrorMessage(err));
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
      setError(getErrorMessage(err));
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
      setError(getErrorMessage(err));
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
      setError(getErrorMessage(err));
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
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const runContentFactory = async (): Promise<void> => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    const sectionsToBuild = factorySectionType ? [factorySectionType] : [...FACTORY_SECTIONS];
    const aggregate: FactoryAggregate = {
      ok: true,
      publish: factoryPublish,
      created: 0,
      reused: 0,
      built: 0,
      failed: 0,
      coverage: {},
      results: [],
      batches: 0,
      current: 'Preparing batches',
      running: true,
    };
    const applyBatch = (response: FactoryBuildResponse, current: string): void => {
      aggregate.ok = aggregate.ok && response.ok;
      aggregate.publish = response.publish;
      aggregate.created += response.created ?? 0;
      aggregate.reused += response.reused ?? 0;
      aggregate.built += response.built ?? 0;
      aggregate.failed += response.failed ?? 0;
      aggregate.coverage = asRecord(response.coverage);
      aggregate.results = [...aggregate.results, ...(response.results ?? [])].slice(-120);
      aggregate.batches += 1;
      aggregate.current = current;
      setFactoryResult({ ...aggregate, results: [...aggregate.results], coverage: { ...aggregate.coverage } });
    };

    try {
      setFactoryResult(aggregate);
      setTab('factory');

      for (const sectionType of sectionsToBuild) {
        for (const experienceKind of factoryKindsForSection(sectionType)) {
          let offset = 0;
          let guard = 0;
          let hasMore = true;

          while (hasMore) {
            const label = `${titleCase(sectionType)} ${titleCase(experienceKind)} batch ${offset + 1}`;
            setFactoryResult({ ...aggregate, current: label, results: [...aggregate.results], coverage: { ...aggregate.coverage } });
            const response = await adminPracticeContentFactoryBuild(accessToken, {
              section_type: sectionType,
              experience_kind: experienceKind,
              publish: factoryPublish,
              limit: 1,
              offset,
              catalog_limit: 300,
            });
            applyBatch(response, label);

            hasMore = response.has_more === true;
            const nextOffset = Number(response.next_offset);
            offset = Number.isFinite(nextOffset) && nextOffset > offset ? nextOffset : offset + 1;
            guard += 1;
            if (guard > 500) throw new Error('Content Factory stopped because batch pagination did not finish.');
          }
        }
      }

      setFactoryResult({
        ...aggregate,
        current: 'Coverage build complete',
        running: false,
        results: [...aggregate.results],
        coverage: { ...aggregate.coverage },
      });
      await loadBase();
    } catch (err) {
      setError(getErrorMessage(err));
      setFactoryResult({
        ...aggregate,
        current: 'Build stopped',
        running: false,
        results: [...aggregate.results],
        coverage: { ...aggregate.coverage },
      });
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

  const sourceSections = useMemo(() => new Set(sources.map((row) => row.section_type)).size, [sources]);
  const analyticsSummary = useMemo(() => summarizeAnalytics(analytics), [analytics]);
  const analyticsRecord = asRecord(analytics);
  const analyticsBySection = asRecordArray(analyticsRecord.by_section);
  const analyticsByQuestion = asRecordArray(analyticsRecord.by_question_type).slice(0, 10);
  const factoryRecord = asRecord(factoryResult);
  const hasFactoryResult = Object.keys(factoryRecord).length > 0;

  const tabButtons: Array<{ key: TabKey; label: string; description: string }> = useMemo(
    () => [
      { key: 'factory', label: 'Factory', description: 'Build coverage' },
      { key: 'sources', label: 'Sources', description: 'Simulator inputs' },
      { key: 'blueprints', label: 'Blueprints', description: 'Practice packages' },
      { key: 'builds', label: 'Builds', description: 'Published sessions' },
      { key: 'rules', label: 'Rules', description: 'Recommendation control' },
      { key: 'analytics', label: 'Analytics', description: 'Practice signals' },
    ],
    [],
  );

  return (
    <div className="practice-root admin-root">
      <header className="admin-header">
        <Link className="brand admin-brand" to="/dashboard">
          <img src="/schood-logo.png" alt="Schood" />
          <div>
            <strong>IELTS Practice Admin</strong>
            <span>Content factory, publishing, and recommendation controls</span>
          </div>
        </Link>
        <div className="admin-header-actions">
          <span className="admin-env">Production console</span>
          <Link to="/dashboard" className="btn ghost compact">Learner dashboard</Link>
        </div>
      </header>

      <main className="admin-shell">
        <aside className="admin-sidebar" aria-label="IELTS Practice admin sections">
          {tabButtons.map((entry) => (
            <button
              key={entry.key}
              className={`admin-tab${tab === entry.key ? ' active' : ''}`}
              type="button"
              onClick={() => setTab(entry.key)}
            >
              <span>{entry.label}</span>
              <small>{entry.description}</small>
            </button>
          ))}
        </aside>

        <section className="admin-main">
          <div className="admin-title-row">
            <div>
              <p className="eyebrow">IELTS Practice Relaunch</p>
              <h1>Personalized training operations</h1>
            </div>
            {busy ? <span className="admin-busy">Working...</span> : null}
          </div>

          <div className="admin-stat-row">
            <article className="admin-stat">
              <span>Sources</span>
              <strong>{sources.length}</strong>
              <small>{sourceSections} active sections</small>
            </article>
            <article className="admin-stat">
              <span>Blueprints</span>
              <strong>{blueprints.length}</strong>
              <small>{publishedBlueprints} published</small>
            </article>
            <article className="admin-stat">
              <span>Builds</span>
              <strong>{builds.length}</strong>
              <small>{publishedBuilds} live sessions</small>
            </article>
            <article className="admin-stat">
              <span>Rules</span>
              <strong>{rules.length}</strong>
              <small>ranking controls</small>
            </article>
          </div>

          {error ? <div className="admin-alert error">{error}</div> : null}
          {loadWarnings.length > 0 ? (
            <div className="admin-alert warning">
              <strong>Partial load</strong>
              <span>
                {loadWarnings.map((warning) => `${warning.area}: ${warning.message}`).join('  ')}
              </span>
            </div>
          ) : null}

          {tab === 'factory' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <h2>Content Factory</h2>
                  <p>Build transformed Reading, Listening, and Writing coverage from simulator source sections.</p>
                </div>
                <button className="btn solid" type="button" onClick={() => void runContentFactory()} disabled={busy}>
                  {busy ? 'Building...' : 'Build coverage'}
                </button>
              </div>
              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>Section</span>
                  <select value={factorySectionType} onChange={(event) => setFactorySectionType(event.target.value)}>
                    <option value="">All R/L/W</option>
                    <option value="reading">Reading</option>
                    <option value="listening">Listening</option>
                    <option value="writing">Writing</option>
                  </select>
                </label>
                <label className="admin-switch">
                  <input type="checkbox" checked={factoryPublish} onChange={(event) => setFactoryPublish(event.target.checked)} />
                  <span>Publish successful builds</span>
                </label>
              </div>
              {hasFactoryResult ? (
                <div className="admin-factory-progress">
                  <strong>{String(factoryRecord.current ?? 'Last Content Factory run')}</strong>
                  <span>
                    {formatCount(factoryRecord.batches)} safe batches completed.
                    {factoryRecord.running === true ? ' The build is still running.' : ' Ready to rerun when simulator content changes.'}
                  </span>
                </div>
              ) : null}
              {hasFactoryResult ? (
                <div className="admin-result-grid">
                  {[
                    ['Created', factoryRecord.created],
                    ['Reused', factoryRecord.reused],
                    ['Built', factoryRecord.built],
                    ['Failed', factoryRecord.failed],
                  ].map(([label, value]) => (
                    <article key={String(label)} className="admin-result">
                      <span>{String(label)}</span>
                      <strong>{formatCount(value)}</strong>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === 'sources' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <h2>Simulator sources</h2>
                  <p>Select source sections and package them into transformed practice blueprints.</p>
                </div>
                <label className="admin-inline-field">
                  <span>Section</span>
                  <select value={sourceSectionType} onChange={(event) => setSourceSectionType(event.target.value)}>
                    <option value="">All</option>
                    <option value="reading">Reading</option>
                    <option value="listening">Listening</option>
                    <option value="writing">Writing</option>
                  </select>
                </label>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Section</th>
                      <th>Coverage</th>
                      <th>Assets</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.length > 0 ? sources.map((source) => (
                      <tr key={source.section_id}>
                        <td>
                          <div className="admin-cell-title">{source.experience_name}</div>
                          <div className="admin-meta-line">{source.section_name}</div>
                        </td>
                        <td><span className={`chip ${source.section_type}`}>{source.section_type}</span></td>
                        <td>
                          <div>{joinParts([`${source.part_count} parts`, `${source.unit_count} units`, `${source.question_count} questions`])}</div>
                          <div className="admin-meta-line">{summarizeQuestionTypes(source)}</div>
                        </td>
                        <td>{joinParts([source.has_passage ? 'passage' : null, source.has_audio ? 'audio' : null, source.has_image ? 'image' : null]) || 'question-only'}</td>
                        <td>
                          <button className="btn solid compact" type="button" onClick={() => void createBlueprintFromSource(source)} disabled={busy}>
                            Create blueprint
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5}><div className="admin-empty">No simulator sources found for this filter.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {tab === 'blueprints' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <h2>Blueprints</h2>
                  <p>Blueprints define the transformed learner experience built from simulator material.</p>
                </div>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Blueprint</th>
                      <th>Kind</th>
                      <th>Target types</th>
                      <th>Latest build</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blueprints.length > 0 ? blueprints.map((blueprint) => (
                      <tr key={blueprint.id}>
                        <td>
                          <div className="admin-cell-title">{blueprint.title}</div>
                          <div className="admin-meta-line">{blueprint.section_type} | {blueprint.estimated_minutes} min</div>
                        </td>
                        <td>{titleCase(blueprint.experience_kind)}</td>
                        <td>{summarizeQuestionTypes(blueprint)}</td>
                        <td>
                          {blueprint.latest_build
                            ? `v${blueprint.latest_build.build_version} | ${blueprint.latest_build.status}`
                            : 'none'}
                        </td>
                        <td><span className={`status-pill ${compactClass(blueprint.status)}`}>{blueprint.status}</span></td>
                        <td>
                          <div className="admin-row-actions">
                            <button className="btn ghost compact" type="button" onClick={() => void buildBlueprint(blueprint.id, false)} disabled={busy}>Draft build</button>
                            <button className="btn solid compact" type="button" onClick={() => void buildBlueprint(blueprint.id, true)} disabled={busy}>Publish</button>
                            <button className="btn ghost compact" type="button" onClick={() => void updateBlueprintStatus(blueprint.id, 'draft')} disabled={busy}>Draft</button>
                            <button className="btn ghost compact" type="button" onClick={() => void updateBlueprintStatus(blueprint.id, 'archived')} disabled={busy}>Archive</button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6}><div className="admin-empty">No blueprints yet. Create one from Sources or run Content Factory.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {tab === 'builds' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <h2>Delivery builds</h2>
                  <p>Published builds are what learner plans use for transformed practice sessions.</p>
                </div>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Build</th>
                      <th>Kind</th>
                      <th>Context</th>
                      <th>Questions</th>
                      <th>Validation</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {builds.length > 0 ? builds.map((build) => (
                      <tr key={build.id}>
                        <td>
                          <div className="admin-cell-title">{build.blueprint?.title ?? `Build ${build.id.slice(0, 8)}`}</div>
                          <div className="admin-meta-line">version {build.build_version}</div>
                        </td>
                        <td>{titleCase(build.experience_kind)}</td>
                        <td>{summarizeBuildContext(build)}</td>
                        <td>{summarizeQuestionTypes(build)}</td>
                        <td>{summarizeValidation(build)}</td>
                        <td><span className={`status-pill ${compactClass(build.status)}`}>{build.status}</span></td>
                        <td>{formatDateTime(build.updated_at ?? build.created_at)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={7}><div className="admin-empty">No delivery builds yet. Run Content Factory to generate coverage.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {tab === 'rules' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <h2>Recommendation rules</h2>
                  <p>Adjust the weights that rank next-best tasks for learners.</p>
                </div>
                <button className="btn solid" type="button" onClick={() => void saveRules()} disabled={busy}>Save rules</button>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Rule</th>
                      <th>Description</th>
                      <th>Weight</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.length > 0 ? rules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <div className="admin-cell-title">{rule.rule_name || rule.rule_key}</div>
                          <div className="admin-meta-line">{rule.rule_key}</div>
                        </td>
                        <td>{rule.description ?? '-'}</td>
                        <td>
                          <input
                            className="admin-number-input"
                            type="number"
                            step="0.1"
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
                        </td>
                        <td>
                          <select
                            value={rule.status}
                            onChange={(event) => setRules((prev) => prev.map((row) => (
                              row.id === rule.id ? { ...row, status: event.target.value } : row
                            )))}
                          >
                            <option value="active">Active</option>
                            <option value="draft">Draft</option>
                            <option value="disabled">Disabled</option>
                          </select>
                        </td>
                        <td>{formatDateTime(rule.updated_at)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5}><div className="admin-empty">No recommendation rules are configured.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {tab === 'analytics' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <h2>Analytics</h2>
                  <p>Review practice attempts, completion, and accuracy signals for the selected window.</p>
                </div>
                <div className="admin-toolbar">
                  <label className="admin-inline-field">
                    <span>Days</span>
                    <input value={analyticsDays} onChange={(event) => setAnalyticsDays(event.target.value)} />
                  </label>
                  <button className="btn solid" type="button" onClick={() => void loadAnalytics()} disabled={busy}>Load</button>
                </div>
              </div>
              <div className="admin-result-grid">
                {analyticsSummary.map((item) => (
                  <article key={item.label} className="admin-result">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </article>
                ))}
              </div>
              {analyticsBySection.length > 0 ? (
                <div className="admin-table-wrap compact">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Section</th>
                        <th>Attempts</th>
                        <th>Scored</th>
                        <th>Completion</th>
                        <th>Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsBySection.map((row) => (
                        <tr key={String(row.section_type)}>
                          <td>{titleCase(String(row.section_type ?? ''))}</td>
                          <td>{formatCount(row.attempts)}</td>
                          <td>{formatCount(row.scored_attempts)}</td>
                          <td>{formatRatio(row.completion_ratio)}</td>
                          <td>{formatRatio(row.accuracy_avg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {analyticsByQuestion.length > 0 ? (
                <div className="admin-table-wrap compact">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Question type</th>
                        <th>Section</th>
                        <th>Attempts</th>
                        <th>Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsByQuestion.map((row) => (
                        <tr key={`${String(row.section_type)}-${String(row.question_type)}`}>
                          <td>{String(row.question_type ?? '-')}</td>
                          <td>{titleCase(String(row.section_type ?? ''))}</td>
                          <td>{formatCount(row.attempts)}</td>
                          <td>{formatRatio(row.accuracy_avg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {analytics ? (
                <details className="admin-json-details">
                  <summary>Raw response</summary>
                  <pre className="json-box">{JSON.stringify(analytics, null, 2)}</pre>
                </details>
              ) : null}
            </section>
          ) : null}
        </section>
      </main>
    </div>
  );
};
