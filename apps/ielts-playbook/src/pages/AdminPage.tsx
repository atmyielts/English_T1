import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  adminPlaybookAnalytics,
  adminPlaybookMarketCreate,
  adminPlaybookMarketPatch,
  adminPlaybookMarketsList,
  adminPlaybookPageCreate,
  adminPlaybookPagePatch,
  adminPlaybookPagesList,
  adminPlaybookPlanTemplateCreate,
  adminPlaybookPlanTemplatePatch,
  adminPlaybookPlanTemplatesList,
  adminPlaybookPreview,
  adminPlaybookQa,
  adminPlaybookRulesList,
  adminPlaybookRulesPatch,
  adminPlaybookSectionCreate,
  adminPlaybookSectionPatch,
  adminPlaybookSectionsList,
  adminPlaybookSourceCreate,
  adminPlaybookSourcePatch,
  adminPlaybookSourcesList,
} from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { useAccess } from '../lib/useAccess';

type SectionKey =
  | 'dashboard'
  | 'content'
  | 'content-detail'
  | 'updates'
  | 'markets'
  | 'sources'
  | 'plan-templates'
  | 'rules'
  | 'preview'
  | 'analytics';

type Row = Record<string, unknown>;

type LoadWarning = {
  area: string;
  message: string;
};

const adminNav: Array<{ path: string; key: SectionKey; label: string; description: string }> = [
  { path: '/admin', key: 'dashboard', label: 'Dashboard', description: 'QA and health' },
  { path: '/admin/content', key: 'content', label: 'Content', description: 'Pages and guides' },
  { path: '/admin/updates', key: 'updates', label: 'Updates', description: 'Policy changes' },
  { path: '/admin/markets', key: 'markets', label: 'Markets', description: 'Country guidance' },
  { path: '/admin/sources', key: 'sources', label: 'Sources', description: 'Evidence links' },
  { path: '/admin/plan-templates', key: 'plan-templates', label: 'Plans', description: 'Study templates' },
  { path: '/admin/rules', key: 'rules', label: 'Rules', description: 'Recommendation logic' },
  { path: '/admin/preview', key: 'preview', label: 'Preview', description: 'User outcome' },
  { path: '/admin/analytics', key: 'analytics', label: 'Analytics', description: 'Usage signals' },
];

const statusOptions = ['draft', 'review', 'published', 'archived'];
const pageTypes = ['module', 'guide', 'study_plan', 'resource', 'myth', 'update', 'test_day', 'result_strategy', 'faq'];
const moduleOptions = [
  'essentials',
  'test-types-booking',
  'listening-master-guide',
  'reading-master-guide',
  'writing-master-guide',
  'speaking-master-guide',
  'band-scores-improvement-map',
  'intricacies-traps-myths',
  'updates-policy',
  'study-plans',
  'test-day-guide',
  'retake-results-strategy',
];
const sectionTypes = ['rich_text', 'comparison_table', 'band_grid', 'faq', 'checklist', 'resource_cards', 'timeline', 'cta_strip', 'callout', 'stat_grid'];
const sourceTypes = ['official_url', 'provider_url', 'news', 'internal_note'];
const planTypes = ['crash', 'balanced', 'improvement', 'skill_recovery'];
const ruleStatuses = ['active', 'draft', 'disabled', 'archived'];
const marketCapabilityFields = [
  ['ukvi_available', 'UKVI'],
  ['computer_available', 'Computer'],
  ['writing_on_paper_available', 'Paper writing'],
  ['one_skill_retake_available', 'One Skill Retake'],
] as const;

const isRecord = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const asRows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(isRecord) : [];
const asRecord = (value: unknown): Row => (isRecord(value) ? value : {});
const toText = (value: unknown): string => String(value ?? '').trim();
const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const titleCase = (value: unknown): string =>
  toText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || '-';
const compactClass = (value: unknown): string => toText(value || 'unknown').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
const formatDate = (value: unknown): string => {
  const text = toText(value);
  if (!text) return '-';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
};
const getId = (row: Row): string => toText(row.id);
const countByStatus = (rows: Row[], status: string): number => rows.filter((row) => toText(row.status) === status).length;
const csvToArray = (value: string): string[] => value.split(',').map((entry) => entry.trim()).filter(Boolean);
const jsonString = (value: unknown, fallback: Row = {}): string => JSON.stringify(isRecord(value) ? value : fallback, null, 2);
const parseJson = (value: string, label: string): Row => {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed;
};
const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : 'Request failed');

const publishedPatch = (row: Row): Row => ({
  status: 'published',
  published_at: toText(row.published_at) || new Date().toISOString(),
});

const EmptyState: React.FC<{ message: string; colSpan?: number }> = ({ message, colSpan = 6 }) => (
  <tr>
    <td colSpan={colSpan}>
      <div className="admin-empty">{message}</div>
    </td>
  </tr>
);

const StatusPill: React.FC<{ value: unknown }> = ({ value }) => (
  <span className={`status-pill ${compactClass(value)}`}>{toText(value) || 'unknown'}</span>
);

const Stat: React.FC<{ label: string; value: string | number; note: string }> = ({ label, value, note }) => (
  <article className="admin-stat">
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{note}</small>
  </article>
);

const JsonDetails: React.FC<{ label?: string; value: unknown }> = ({ label = 'Raw response', value }) => (
  <details className="admin-json-details">
    <summary>{label}</summary>
    <pre className="json-box">{JSON.stringify(value ?? {}, null, 2)}</pre>
  </details>
);

export const AdminPage: React.FC<{ section: SectionKey }> = ({ section }) => {
  const { accessToken } = useAccess({ force: true });
  const { id } = useParams();

  const [pages, setPages] = useState<Row[]>([]);
  const [sections, setSections] = useState<Row[]>([]);
  const [sources, setSources] = useState<Row[]>([]);
  const [markets, setMarkets] = useState<Row[]>([]);
  const [planTemplates, setPlanTemplates] = useState<Row[]>([]);
  const [rules, setRules] = useState<Row[]>([]);
  const [qa, setQa] = useState<Row | null>(null);
  const [analytics, setAnalytics] = useState<Row | null>(null);
  const [previewResult, setPreviewResult] = useState<Row | null>(null);
  const [ruleConfigDrafts, setRuleConfigDrafts] = useState<Record<string, string>>({});

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadWarnings, setLoadWarnings] = useState<LoadWarning[]>([]);

  const [pageForm, setPageForm] = useState({
    page_type: 'module',
    title: '',
    slug: '',
    module_key: 'essentials',
    summary: '',
    status: 'draft',
    visibility: 'public',
    source_ids: '',
    seo_title: '',
    seo_description: '',
    seo_keywords: '',
    metadata: '{}',
  });
  const [sectionForm, setSectionForm] = useState({
    block_type: 'rich_text',
    heading: '',
    status: 'draft',
    sort_order: '10',
    content: '{\n  "body": ""\n}',
  });
  const [sourceForm, setSourceForm] = useState({
    title: '',
    url: '',
    provider_key: 'british-council',
    source_type: 'official_url',
    summary: '',
    status: 'draft',
    verified_at: '',
    published_at: '',
    metadata: '{}',
  });
  const [marketForm, setMarketForm] = useState({
    country_code: 'GLOBAL',
    provider_key: 'british-council',
    summary: '',
    status: 'review',
    ukvi_available: false,
    computer_available: true,
    writing_on_paper_available: false,
    one_skill_retake_available: false,
    result_timing_note: '',
    booking_url: '',
    verified_at: '',
    published_at: '',
    source_ids: '',
  });
  const [planForm, setPlanForm] = useState({
    slug: '',
    title: '',
    plan_type: 'balanced',
    summary: '',
    duration_days: '28',
    band_min: '4',
    band_max: '8',
    focus_skill: '',
    intensity: 'moderate',
    status: 'draft',
    schedule_json: '{\n  "weeks": []\n}',
  });
  const [previewForm, setPreviewForm] = useState({
    user_id: '',
    target_overall_band: '7',
    current_band_or_estimate: '5.5',
    weakest_skill: 'writing',
    purpose: 'study',
    destination_country_code: '',
    preferred_delivery_mode: '',
  });
  const [analyticsDays, setAnalyticsDays] = useState('30');

  const selectedPage = useMemo(() => {
    if (!id) return null;
    return pages.find((page) => getId(page) === id) ?? null;
  }, [id, pages]);

  const updateRows = (key: 'pages' | 'sections' | 'sources' | 'markets' | 'plan_templates' | 'rules', value: unknown): void => {
    const rows = asRows(value);
    if (key === 'pages') setPages(rows);
    if (key === 'sections') setSections(rows);
    if (key === 'sources') setSources(rows);
    if (key === 'markets') setMarkets(rows);
    if (key === 'plan_templates') setPlanTemplates(rows);
    if (key === 'rules') {
      setRules(rows);
      setRuleConfigDrafts(Object.fromEntries(rows.map((row) => [toText(row.rule_key), jsonString(row.config)])));
    }
  };

  const load = async (): Promise<void> => {
    if (!accessToken) return;
    setError(null);
    setLoadWarnings([]);

    const warnings: LoadWarning[] = [];
    const apply = async <T,>(area: string, request: Promise<T>, onSuccess: (value: T) => void): Promise<void> => {
      try {
        onSuccess(await request);
      } catch (err) {
        warnings.push({ area, message: errorMessage(err) });
      }
    };

    if (section === 'dashboard') {
      await Promise.all([
        apply('QA', adminPlaybookQa(accessToken), (value) => setQa(asRecord(value))),
        apply('Analytics', adminPlaybookAnalytics(accessToken, 30), (value) => setAnalytics(asRecord(value))),
        apply('Pages', adminPlaybookPagesList(accessToken), (value) => updateRows('pages', value.pages)),
        apply('Sources', adminPlaybookSourcesList(accessToken), (value) => updateRows('sources', value.sources)),
        apply('Markets', adminPlaybookMarketsList(accessToken), (value) => updateRows('markets', value.markets)),
        apply('Plans', adminPlaybookPlanTemplatesList(accessToken), (value) => updateRows('plan_templates', value.plan_templates)),
      ]);
    } else if (section === 'content' || section === 'updates') {
      await apply('Pages', adminPlaybookPagesList(accessToken), (value) => updateRows('pages', value.pages));
    } else if (section === 'content-detail') {
      await Promise.all([
        apply('Pages', adminPlaybookPagesList(accessToken), (value) => updateRows('pages', value.pages)),
        apply('Sections', adminPlaybookSectionsList(accessToken, id), (value) => updateRows('sections', value.sections)),
        apply('Sources', adminPlaybookSourcesList(accessToken), (value) => updateRows('sources', value.sources)),
      ]);
    } else if (section === 'markets') {
      await Promise.all([
        apply('Markets', adminPlaybookMarketsList(accessToken), (value) => updateRows('markets', value.markets)),
        apply('Sources', adminPlaybookSourcesList(accessToken), (value) => updateRows('sources', value.sources)),
      ]);
    } else if (section === 'sources') {
      await apply('Sources', adminPlaybookSourcesList(accessToken), (value) => updateRows('sources', value.sources));
    } else if (section === 'plan-templates') {
      await apply('Plans', adminPlaybookPlanTemplatesList(accessToken), (value) => updateRows('plan_templates', value.plan_templates));
    } else if (section === 'rules') {
      await apply('Rules', adminPlaybookRulesList(accessToken), (value) => updateRows('rules', value.rules));
    } else if (section === 'analytics') {
      await apply('Analytics', adminPlaybookAnalytics(accessToken, toNumber(analyticsDays, 30)), (value) => setAnalytics(asRecord(value)));
    }

    setLoadWarnings(warnings);
    if (warnings.length > 0 && section !== 'dashboard') {
      setError(warnings.map((warning) => `${warning.area}: ${warning.message}`).join('  '));
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken, section, id]);

  const runAction = async (label: string, action: () => Promise<void>, reload = true): Promise<void> => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      if (reload) await load();
      setSuccess(label);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const createPage = async (pageTypeOverride?: string): Promise<void> => {
    const metadata = parseJson(pageForm.metadata, 'Page metadata');
    const pageType = pageTypeOverride ?? pageForm.page_type;
    await adminPlaybookPageCreate(accessToken!, {
      page_type: pageType,
      title: pageForm.title,
      slug: pageForm.slug,
      module_key: pageForm.module_key,
      summary: pageForm.summary,
      status: pageForm.status,
      visibility: pageForm.visibility,
      source_ids: csvToArray(pageForm.source_ids),
      seo_title: pageForm.seo_title,
      seo_description: pageForm.seo_description,
      seo_keywords: csvToArray(pageForm.seo_keywords),
      published_at: pageForm.status === 'published' ? new Date().toISOString() : undefined,
      metadata,
    });
    setPageForm((current) => ({ ...current, title: '', slug: '', summary: '', seo_title: '', seo_description: '' }));
  };

  const patchPageStatus = async (page: Row, status: string): Promise<void> => {
    const patch = status === 'published' ? publishedPatch(page) : { status };
    await adminPlaybookPagePatch(accessToken!, { id: getId(page), patch });
  };

  const createSection = async (): Promise<void> => {
    if (!id) throw new Error('Open a content page before creating a section');
    const content = parseJson(sectionForm.content, 'Section content');
    await adminPlaybookSectionCreate(accessToken!, {
      page_id: id,
      block_type: sectionForm.block_type,
      heading: sectionForm.heading,
      status: sectionForm.status,
      sort_order: toNumber(sectionForm.sort_order, 0),
      content,
    });
    setSectionForm((current) => ({ ...current, heading: '', content: '{\n  "body": ""\n}' }));
  };

  const createSource = async (): Promise<void> => {
    const metadata = parseJson(sourceForm.metadata, 'Source metadata');
    await adminPlaybookSourceCreate(accessToken!, {
      ...sourceForm,
      metadata,
      published_at: sourceForm.published_at || undefined,
      verified_at: sourceForm.verified_at || undefined,
    });
    setSourceForm((current) => ({ ...current, title: '', url: '', summary: '' }));
  };

  const patchSimpleStatus = async (
    area: 'source' | 'market' | 'plan',
    row: Row,
    status: string,
  ): Promise<void> => {
    const patch = status === 'published' ? publishedPatch(row) : { status };
    if (area === 'source') await adminPlaybookSourcePatch(accessToken!, { id: getId(row), patch });
    if (area === 'market') await adminPlaybookMarketPatch(accessToken!, { id: getId(row), patch });
    if (area === 'plan') await adminPlaybookPlanTemplatePatch(accessToken!, { id: getId(row), patch });
  };

  const createMarket = async (): Promise<void> => {
    await adminPlaybookMarketCreate(accessToken!, {
      ...marketForm,
      source_ids: csvToArray(marketForm.source_ids),
      verified_at: marketForm.verified_at || undefined,
      published_at: marketForm.published_at || undefined,
    });
    setMarketForm((current) => ({ ...current, summary: '', booking_url: '' }));
  };

  const createPlanTemplate = async (): Promise<void> => {
    const schedule = parseJson(planForm.schedule_json, 'Schedule JSON');
    await adminPlaybookPlanTemplateCreate(accessToken!, {
      ...planForm,
      duration_days: toNumber(planForm.duration_days, 28),
      band_min: toNumber(planForm.band_min, 4),
      band_max: toNumber(planForm.band_max, 8),
      schedule_json: schedule,
    });
    setPlanForm((current) => ({ ...current, slug: '', title: '', summary: '' }));
  };

  const saveRules = async (): Promise<void> => {
    const payload = rules.map((rule) => {
      const ruleKey = toText(rule.rule_key);
      return {
        rule_key: ruleKey,
        rule_name: toText(rule.rule_name) || titleCase(ruleKey),
        description: toText(rule.description),
        status: toText(rule.status) || 'active',
        sort_order: toNumber(rule.sort_order, 0),
        config: parseJson(ruleConfigDrafts[ruleKey] ?? '{}', `Rule ${ruleKey} config`),
        metadata: asRecord(rule.metadata),
      };
    });
    await adminPlaybookRulesPatch(accessToken!, { rules: payload });
  };

  const previewRecommendation = async (): Promise<void> => {
    const response = await adminPlaybookPreview(accessToken!, {
      user_id: previewForm.user_id,
      profile: {
        target_overall_band: toNumber(previewForm.target_overall_band, 7),
        current_band_or_estimate: toNumber(previewForm.current_band_or_estimate, 5.5),
        weakest_skill: previewForm.weakest_skill || null,
        purpose: previewForm.purpose || 'study',
        destination_country_code: previewForm.destination_country_code || null,
        preferred_delivery_mode: previewForm.preferred_delivery_mode || null,
      },
    });
    setPreviewResult(asRecord(response));
  };

  const loadAnalytics = async (): Promise<void> => {
    const response = await adminPlaybookAnalytics(accessToken!, toNumber(analyticsDays, 30));
    setAnalytics(asRecord(response));
  };

  const updateRule = (ruleKey: string, patch: Row): void => {
    setRules((current) => current.map((rule) => (toText(rule.rule_key) === ruleKey ? { ...rule, ...patch } : rule)));
  };

  const updates = useMemo(() => pages.filter((page) => toText(page.page_type) === 'update'), [pages]);
  const analyticsTotals = Object.entries(asRecord(analytics?.totals));
  const qaRecord = asRecord(qa);
  const qaCards = [
    ['Stale markets', asRows(qaRecord.stale_markets).length],
    ['Pages missing citations', asRows(qaRecord.pages_missing_citations).length],
    ['Broken sources', asRows(qaRecord.broken_source_links).length],
    ['Missing SEO', asRows(qaRecord.missing_seo_metadata).length],
  ];

  return (
    <SiteChrome compact>
      <section className="playbook-admin">
        <header className="admin-header">
          <div>
            <p className="eyebrow">Admin console</p>
            <h1>IELTS Playbook operations</h1>
            <p>Govern pages, updates, markets, sources, study plans, recommendation rules, QA, and analytics.</p>
          </div>
          <div className="admin-header-actions">
            <span className="admin-env">Production console</span>
            <Link to="/dashboard" className="button button-light">Learner workspace</Link>
          </div>
        </header>

        <main className="admin-shell">
          <nav className="admin-nav" aria-label="IELTS Playbook admin sections">
            {adminNav.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`admin-tab${section === item.key || (section === 'content-detail' && item.key === 'content') ? ' active' : ''}`}
              >
                <span>{item.label}</span>
                <small>{item.description}</small>
              </Link>
            ))}
          </nav>

          <section className="admin-main">
            <div className="admin-title-row">
              <div>
                <p className="eyebrow">{section === 'content-detail' ? 'Content editor' : titleCase(section)}</p>
                <h2>{section === 'dashboard' ? 'Operational health' : 'Manage Playbook data'}</h2>
              </div>
              {busy ? <span className="admin-busy">Working...</span> : null}
            </div>

            <div className="admin-stat-row">
              <Stat label="Pages" value={pages.length} note={`${countByStatus(pages, 'published')} published`} />
              <Stat label="Sources" value={sources.length} note={`${countByStatus(sources, 'published')} verified/live`} />
              <Stat label="Markets" value={markets.length} note={`${countByStatus(markets, 'published')} published`} />
              <Stat label="Plans" value={planTemplates.length} note={`${countByStatus(planTemplates, 'published')} published`} />
            </div>

            {error ? <div className="admin-alert error">{error}</div> : null}
            {success ? <div className="admin-alert success">{success}</div> : null}
            {loadWarnings.length > 0 && section === 'dashboard' ? (
              <div className="admin-alert warning">
                <strong>Partial load</strong>
                <span>{loadWarnings.map((warning) => `${warning.area}: ${warning.message}`).join('  ')}</span>
              </div>
            ) : null}

            {section === 'dashboard' ? (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>QA overview</h2>
                    <p>Publishing issues that block a trustworthy IELTS Playbook.</p>
                  </div>
                  <button className="button button-dark" type="button" onClick={() => void runAction('QA refreshed', load, false)} disabled={busy}>
                    Refresh
                  </button>
                </div>
                <div className="admin-result-grid">
                  {qaCards.map(([label, value]) => (
                    <article key={String(label)} className="admin-result">
                      <span>{String(label)}</span>
                      <strong>{String(value)}</strong>
                    </article>
                  ))}
                </div>
                <div className="admin-table-wrap compact">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Signal</th>
                        <th>Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(qaRecord).map(([key, value]) => (
                        <tr key={key}>
                          <td>{titleCase(key)}</td>
                          <td>{Array.isArray(value) ? value.length : JSON.stringify(value)}</td>
                        </tr>
                      ))}
                      {Object.keys(qaRecord).length === 0 ? <EmptyState colSpan={2} message="QA has not loaded yet." /> : null}
                    </tbody>
                  </table>
                </div>
                <JsonDetails value={{ qa, analytics }} />
              </section>
            ) : null}

            {section === 'content' || section === 'updates' ? (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>{section === 'updates' ? 'Policy updates' : 'Pages and guides'}</h2>
                    <p>Create drafts, open editors, and move content through draft, review, published, and archived states.</p>
                  </div>
                </div>
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Type</span>
                    <select value={section === 'updates' ? 'update' : pageForm.page_type} disabled={section === 'updates'} onChange={(event) => setPageForm((current) => ({ ...current, page_type: event.target.value }))}>
                      {pageTypes.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Title</span>
                    <input value={pageForm.title} onChange={(event) => setPageForm((current) => ({ ...current, title: event.target.value }))} placeholder="IELTS Listening master guide" />
                  </label>
                  <label className="admin-field">
                    <span>Slug</span>
                    <input value={pageForm.slug} onChange={(event) => setPageForm((current) => ({ ...current, slug: event.target.value }))} placeholder="listening-master-guide" />
                  </label>
                  <label className="admin-field">
                    <span>Module</span>
                    <select value={pageForm.module_key} onChange={(event) => setPageForm((current) => ({ ...current, module_key: event.target.value }))}>
                      {moduleOptions.map((module) => <option key={module} value={module}>{titleCase(module)}</option>)}
                    </select>
                  </label>
                  <label className="admin-field wide">
                    <span>Summary</span>
                    <textarea value={pageForm.summary} onChange={(event) => setPageForm((current) => ({ ...current, summary: event.target.value }))} rows={3} />
                  </label>
                  <label className="admin-field">
                    <span>Status</span>
                    <select value={pageForm.status} onChange={(event) => setPageForm((current) => ({ ...current, status: event.target.value }))}>
                      {statusOptions.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Visibility</span>
                    <select value={pageForm.visibility} onChange={(event) => setPageForm((current) => ({ ...current, visibility: event.target.value }))}>
                      {['public', 'authenticated', 'premium'].map((visibility) => <option key={visibility} value={visibility}>{titleCase(visibility)}</option>)}
                    </select>
                  </label>
                  <label className="admin-field wide">
                    <span>Source IDs</span>
                    <input value={pageForm.source_ids} onChange={(event) => setPageForm((current) => ({ ...current, source_ids: event.target.value }))} placeholder="comma-separated source UUIDs" />
                  </label>
                  <div className="admin-form-actions">
                    <button className="button button-dark" type="button" onClick={() => void runAction('Draft created', () => createPage(section === 'updates' ? 'update' : undefined))} disabled={busy}>
                      Create {section === 'updates' ? 'update' : 'page'}
                    </button>
                  </div>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Page</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Visibility</th>
                        <th>Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(section === 'updates' ? updates : pages).map((page) => (
                        <tr key={getId(page)}>
                          <td>
                            <div className="admin-cell-title">{toText(page.title)}</div>
                            <div className="admin-meta-line">/{toText(page.slug)} | {toText(page.module_key) || 'no module'}</div>
                          </td>
                          <td>{titleCase(page.page_type)}</td>
                          <td><StatusPill value={page.status} /></td>
                          <td>{titleCase(page.visibility)}</td>
                          <td>{formatDate(page.updated_at)}</td>
                          <td>
                            <div className="admin-row-actions">
                              <Link className="button button-light compact" to={`/admin/content/${getId(page)}`}>Edit</Link>
                              <button className="button button-dark compact" type="button" onClick={() => void runAction('Page published', () => patchPageStatus(page, 'published'))} disabled={busy}>Publish</button>
                              <button className="button button-light compact" type="button" onClick={() => void runAction('Page moved to review', () => patchPageStatus(page, 'review'))} disabled={busy}>Review</button>
                              <button className="button button-light compact" type="button" onClick={() => void runAction('Page archived', () => patchPageStatus(page, 'archived'))} disabled={busy}>Archive</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(section === 'updates' ? updates : pages).length === 0 ? <EmptyState message="No content rows found." /> : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {section === 'content-detail' ? (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>{selectedPage ? toText(selectedPage.title) : 'Content page'}</h2>
                    <p>{selectedPage ? `${titleCase(selectedPage.page_type)} | /${toText(selectedPage.slug)}` : 'Load a page to manage blocks and publishing.'}</p>
                  </div>
                  {selectedPage ? (
                    <div className="admin-row-actions">
                      <button className="button button-dark compact" type="button" onClick={() => void runAction('Page published', () => patchPageStatus(selectedPage, 'published'))} disabled={busy}>Publish</button>
                      <button className="button button-light compact" type="button" onClick={() => void runAction('Page archived', () => patchPageStatus(selectedPage, 'archived'))} disabled={busy}>Archive</button>
                    </div>
                  ) : null}
                </div>
                {selectedPage ? (
                  <div className="admin-detail-grid">
                    <article>
                      <span>Status</span>
                      <strong>{toText(selectedPage.status)}</strong>
                    </article>
                    <article>
                      <span>Visibility</span>
                      <strong>{toText(selectedPage.visibility)}</strong>
                    </article>
                    <article>
                      <span>Published</span>
                      <strong>{formatDate(selectedPage.published_at)}</strong>
                    </article>
                  </div>
                ) : null}
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Block type</span>
                    <select value={sectionForm.block_type} onChange={(event) => setSectionForm((current) => ({ ...current, block_type: event.target.value }))}>
                      {sectionTypes.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Heading</span>
                    <input value={sectionForm.heading} onChange={(event) => setSectionForm((current) => ({ ...current, heading: event.target.value }))} />
                  </label>
                  <label className="admin-field">
                    <span>Sort order</span>
                    <input value={sectionForm.sort_order} onChange={(event) => setSectionForm((current) => ({ ...current, sort_order: event.target.value }))} />
                  </label>
                  <label className="admin-field">
                    <span>Status</span>
                    <select value={sectionForm.status} onChange={(event) => setSectionForm((current) => ({ ...current, status: event.target.value }))}>
                      {statusOptions.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
                    </select>
                  </label>
                  <label className="admin-field wide">
                    <span>Content JSON</span>
                    <textarea value={sectionForm.content} onChange={(event) => setSectionForm((current) => ({ ...current, content: event.target.value }))} rows={7} />
                  </label>
                  <div className="admin-form-actions">
                    <button className="button button-dark" type="button" onClick={() => void runAction('Section created', createSection)} disabled={busy || !selectedPage}>Add section</button>
                  </div>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Section</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Order</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sections.map((block) => (
                        <tr key={getId(block)}>
                          <td>
                            <div className="admin-cell-title">{toText(block.heading) || 'Untitled block'}</div>
                            <div className="admin-meta-line">{formatDate(block.updated_at)}</div>
                          </td>
                          <td>{titleCase(block.block_type)}</td>
                          <td><StatusPill value={block.status} /></td>
                          <td>{toText(block.sort_order)}</td>
                          <td>
                            <div className="admin-row-actions">
                              <button className="button button-dark compact" type="button" onClick={() => void runAction('Section published', () => adminPlaybookSectionPatch(accessToken!, { id: getId(block), patch: { status: 'published' } }).then(() => undefined))} disabled={busy}>Publish</button>
                              <button className="button button-light compact" type="button" onClick={() => void runAction('Section archived', () => adminPlaybookSectionPatch(accessToken!, { id: getId(block), patch: { status: 'archived' } }).then(() => undefined))} disabled={busy}>Archive</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {sections.length === 0 ? <EmptyState colSpan={5} message="No sections yet. Add the first content block above." /> : null}
                    </tbody>
                  </table>
                </div>
                <JsonDetails label="Selected page JSON" value={selectedPage ?? {}} />
              </section>
            ) : null}

            {section === 'sources' ? (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Evidence sources</h2>
                    <p>Create and maintain official links that support published content and market guidance.</p>
                  </div>
                </div>
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Title</span>
                    <input value={sourceForm.title} onChange={(event) => setSourceForm((current) => ({ ...current, title: event.target.value }))} />
                  </label>
                  <label className="admin-field">
                    <span>URL</span>
                    <input value={sourceForm.url} onChange={(event) => setSourceForm((current) => ({ ...current, url: event.target.value }))} />
                  </label>
                  <label className="admin-field">
                    <span>Provider</span>
                    <input value={sourceForm.provider_key} onChange={(event) => setSourceForm((current) => ({ ...current, provider_key: event.target.value }))} />
                  </label>
                  <label className="admin-field">
                    <span>Type</span>
                    <select value={sourceForm.source_type} onChange={(event) => setSourceForm((current) => ({ ...current, source_type: event.target.value }))}>
                      {sourceTypes.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
                    </select>
                  </label>
                  <label className="admin-field wide">
                    <span>Summary</span>
                    <textarea value={sourceForm.summary} onChange={(event) => setSourceForm((current) => ({ ...current, summary: event.target.value }))} rows={3} />
                  </label>
                  <div className="admin-form-actions">
                    <button className="button button-dark" type="button" onClick={() => void runAction('Source created', createSource)} disabled={busy}>Create source</button>
                  </div>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Provider</th>
                        <th>Status</th>
                        <th>Verified</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sources.map((source) => (
                        <tr key={getId(source)}>
                          <td>
                            <div className="admin-cell-title">{toText(source.title)}</div>
                            <div className="admin-meta-line">{toText(source.url) || toText(source.summary) || 'No URL'}</div>
                          </td>
                          <td>{toText(source.provider_key) || '-'}</td>
                          <td><StatusPill value={source.status} /></td>
                          <td>{formatDate(source.verified_at)}</td>
                          <td>
                            <div className="admin-row-actions">
                              <button className="button button-dark compact" type="button" onClick={() => void runAction('Source published', () => patchSimpleStatus('source', source, 'published'))} disabled={busy}>Publish</button>
                              <button className="button button-light compact" type="button" onClick={() => void runAction('Source verified', () => adminPlaybookSourcePatch(accessToken!, { id: getId(source), patch: { verified_at: new Date().toISOString(), last_checked_at: new Date().toISOString() } }).then(() => undefined))} disabled={busy}>Verify</button>
                              <button className="button button-light compact" type="button" onClick={() => void runAction('Source archived', () => patchSimpleStatus('source', source, 'archived'))} disabled={busy}>Archive</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {sources.length === 0 ? <EmptyState colSpan={5} message="No evidence sources yet." /> : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {section === 'markets' ? (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Market guidance</h2>
                    <p>Maintain country-specific IELTS booking, UKVI, computer-delivery, result timing, and retake guidance.</p>
                  </div>
                </div>
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Country</span>
                    <input value={marketForm.country_code} onChange={(event) => setMarketForm((current) => ({ ...current, country_code: event.target.value.toUpperCase() }))} />
                  </label>
                  <label className="admin-field">
                    <span>Provider</span>
                    <input value={marketForm.provider_key} onChange={(event) => setMarketForm((current) => ({ ...current, provider_key: event.target.value }))} />
                  </label>
                  <label className="admin-field wide">
                    <span>Summary</span>
                    <textarea value={marketForm.summary} onChange={(event) => setMarketForm((current) => ({ ...current, summary: event.target.value }))} rows={3} />
                  </label>
                  <label className="admin-field">
                    <span>Status</span>
                    <select value={marketForm.status} onChange={(event) => setMarketForm((current) => ({ ...current, status: event.target.value }))}>
                      {statusOptions.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Booking URL</span>
                    <input value={marketForm.booking_url} onChange={(event) => setMarketForm((current) => ({ ...current, booking_url: event.target.value }))} />
                  </label>
                  <label className="admin-field wide">
                    <span>Source IDs</span>
                    <input value={marketForm.source_ids} onChange={(event) => setMarketForm((current) => ({ ...current, source_ids: event.target.value }))} placeholder="comma-separated source UUIDs" />
                  </label>
                  <div className="admin-check-row wide">
                    {marketCapabilityFields.map(([key, label]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={Boolean(marketForm[key as keyof typeof marketForm])}
                          onChange={(event) => setMarketForm((current) => ({ ...current, [key]: event.target.checked }))}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="admin-form-actions">
                    <button className="button button-dark" type="button" onClick={() => void runAction('Market guidance created', createMarket)} disabled={busy}>Create market</button>
                  </div>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Market</th>
                        <th>Capabilities</th>
                        <th>Status</th>
                        <th>Verified</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {markets.map((market) => (
                        <tr key={getId(market)}>
                          <td>
                            <div className="admin-cell-title">{toText(market.country_code)} | {toText(market.provider_key)}</div>
                            <div className="admin-meta-line">{toText(market.summary)}</div>
                          </td>
                          <td>{[
                            market.ukvi_available ? 'UKVI' : null,
                            market.computer_available ? 'computer' : null,
                            market.writing_on_paper_available ? 'paper writing' : null,
                            market.one_skill_retake_available ? 'retake' : null,
                          ].filter(Boolean).join(', ') || '-'}</td>
                          <td><StatusPill value={market.status} /></td>
                          <td>{formatDate(market.verified_at)}</td>
                          <td>
                            <div className="admin-row-actions">
                              <button className="button button-dark compact" type="button" onClick={() => void runAction('Market published', () => patchSimpleStatus('market', market, 'published'))} disabled={busy}>Publish</button>
                              <button className="button button-light compact" type="button" onClick={() => void runAction('Market verified', () => adminPlaybookMarketPatch(accessToken!, { id: getId(market), patch: { verified_at: new Date().toISOString() } }).then(() => undefined))} disabled={busy}>Verify</button>
                              <button className="button button-light compact" type="button" onClick={() => void runAction('Market archived', () => patchSimpleStatus('market', market, 'archived'))} disabled={busy}>Archive</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {markets.length === 0 ? <EmptyState colSpan={5} message="No market guidance rows yet." /> : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {section === 'plan-templates' ? (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Study plan templates</h2>
                    <p>Templates power Playbook recommendations and keep goal-specific plan pages consistent.</p>
                  </div>
                </div>
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Title</span>
                    <input value={planForm.title} onChange={(event) => setPlanForm((current) => ({ ...current, title: event.target.value }))} />
                  </label>
                  <label className="admin-field">
                    <span>Slug</span>
                    <input value={planForm.slug} onChange={(event) => setPlanForm((current) => ({ ...current, slug: event.target.value }))} />
                  </label>
                  <label className="admin-field">
                    <span>Plan type</span>
                    <select value={planForm.plan_type} onChange={(event) => setPlanForm((current) => ({ ...current, plan_type: event.target.value }))}>
                      {planTypes.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Duration days</span>
                    <input value={planForm.duration_days} onChange={(event) => setPlanForm((current) => ({ ...current, duration_days: event.target.value }))} />
                  </label>
                  <label className="admin-field wide">
                    <span>Summary</span>
                    <textarea value={planForm.summary} onChange={(event) => setPlanForm((current) => ({ ...current, summary: event.target.value }))} rows={3} />
                  </label>
                  <label className="admin-field">
                    <span>Band min</span>
                    <input value={planForm.band_min} onChange={(event) => setPlanForm((current) => ({ ...current, band_min: event.target.value }))} />
                  </label>
                  <label className="admin-field">
                    <span>Band max</span>
                    <input value={planForm.band_max} onChange={(event) => setPlanForm((current) => ({ ...current, band_max: event.target.value }))} />
                  </label>
                  <label className="admin-field wide">
                    <span>Schedule JSON</span>
                    <textarea value={planForm.schedule_json} onChange={(event) => setPlanForm((current) => ({ ...current, schedule_json: event.target.value }))} rows={6} />
                  </label>
                  <div className="admin-form-actions">
                    <button className="button button-dark" type="button" onClick={() => void runAction('Plan template created', createPlanTemplate)} disabled={busy}>Create template</button>
                  </div>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Template</th>
                        <th>Type</th>
                        <th>Band</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planTemplates.map((plan) => (
                        <tr key={getId(plan)}>
                          <td>
                            <div className="admin-cell-title">{toText(plan.title)}</div>
                            <div className="admin-meta-line">/{toText(plan.slug)} | {toText(plan.duration_days)} days</div>
                          </td>
                          <td>{titleCase(plan.plan_type)}</td>
                          <td>{toText(plan.band_min)}-{toText(plan.band_max)}</td>
                          <td><StatusPill value={plan.status} /></td>
                          <td>
                            <div className="admin-row-actions">
                              <button className="button button-dark compact" type="button" onClick={() => void runAction('Plan published', () => patchSimpleStatus('plan', plan, 'published'))} disabled={busy}>Publish</button>
                              <button className="button button-light compact" type="button" onClick={() => void runAction('Plan archived', () => patchSimpleStatus('plan', plan, 'archived'))} disabled={busy}>Archive</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {planTemplates.length === 0 ? <EmptyState colSpan={5} message="No study plan templates yet." /> : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {section === 'rules' ? (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Recommendation rules</h2>
                    <p>Edit rule config safely, then save the complete ruleset used by preview and learner recommendations.</p>
                  </div>
                  <button className="button button-dark" type="button" onClick={() => void runAction('Rules saved', saveRules)} disabled={busy}>Save rules</button>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Rule</th>
                        <th>Status</th>
                        <th>Order</th>
                        <th>Config</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((rule) => {
                        const ruleKey = toText(rule.rule_key);
                        return (
                          <tr key={ruleKey}>
                            <td>
                              <div className="admin-cell-title">{toText(rule.rule_name) || titleCase(ruleKey)}</div>
                              <div className="admin-meta-line">{ruleKey}</div>
                            </td>
                            <td>
                              <select value={toText(rule.status) || 'active'} onChange={(event) => updateRule(ruleKey, { status: event.target.value })}>
                                {ruleStatuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
                              </select>
                            </td>
                            <td>
                              <input className="admin-number-input" value={toText(rule.sort_order) || '0'} onChange={(event) => updateRule(ruleKey, { sort_order: event.target.value })} />
                            </td>
                            <td>
                              <textarea
                                className="admin-json-textarea"
                                value={ruleConfigDrafts[ruleKey] ?? '{}'}
                                onChange={(event) => setRuleConfigDrafts((current) => ({ ...current, [ruleKey]: event.target.value }))}
                                rows={5}
                              />
                            </td>
                          </tr>
                        );
                      })}
                      {rules.length === 0 ? <EmptyState colSpan={4} message="No rules loaded yet." /> : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {section === 'preview' ? (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Recommendation preview</h2>
                    <p>Preview what the Playbook will recommend for a real user with optional profile overrides.</p>
                  </div>
                  <button className="button button-dark" type="button" onClick={() => void runAction('Preview generated', previewRecommendation, false)} disabled={busy}>Generate preview</button>
                </div>
                <div className="admin-form-grid">
                  <label className="admin-field wide">
                    <span>User ID</span>
                    <input value={previewForm.user_id} onChange={(event) => setPreviewForm((current) => ({ ...current, user_id: event.target.value }))} placeholder="Supabase user UUID" />
                  </label>
                  <label className="admin-field">
                    <span>Target band</span>
                    <input value={previewForm.target_overall_band} onChange={(event) => setPreviewForm((current) => ({ ...current, target_overall_band: event.target.value }))} />
                  </label>
                  <label className="admin-field">
                    <span>Current band</span>
                    <input value={previewForm.current_band_or_estimate} onChange={(event) => setPreviewForm((current) => ({ ...current, current_band_or_estimate: event.target.value }))} />
                  </label>
                  <label className="admin-field">
                    <span>Weakest skill</span>
                    <select value={previewForm.weakest_skill} onChange={(event) => setPreviewForm((current) => ({ ...current, weakest_skill: event.target.value }))}>
                      {['listening', 'reading', 'writing', 'speaking'].map((skill) => <option key={skill} value={skill}>{titleCase(skill)}</option>)}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Purpose</span>
                    <input value={previewForm.purpose} onChange={(event) => setPreviewForm((current) => ({ ...current, purpose: event.target.value }))} />
                  </label>
                </div>
                {previewResult ? (
                  <div className="admin-preview-card">
                    <h3>{toText(asRecord(previewResult.recommendation).headline) || 'Preview result'}</h3>
                    <p>{toText(asRecord(previewResult.recommendation).summary) || 'Recommendation generated. Review raw output below.'}</p>
                  </div>
                ) : null}
                <JsonDetails value={previewResult ?? {}} />
              </section>
            ) : null}

            {section === 'analytics' ? (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Analytics</h2>
                    <p>Track Playbook usage by event, module, page type, and market window.</p>
                  </div>
                  <div className="admin-toolbar">
                    <label className="admin-inline-field">
                      <span>Days</span>
                      <input value={analyticsDays} onChange={(event) => setAnalyticsDays(event.target.value)} />
                    </label>
                    <button className="button button-dark" type="button" onClick={() => void runAction('Analytics loaded', loadAnalytics, false)} disabled={busy}>Load</button>
                  </div>
                </div>
                <div className="admin-result-grid">
                  {(analyticsTotals.length > 0 ? analyticsTotals : [['Events', 0]]).map(([label, value]) => (
                    <article key={label} className="admin-result">
                      <span>{titleCase(label)}</span>
                      <strong>{String(value)}</strong>
                    </article>
                  ))}
                </div>
                <div className="admin-table-wrap compact">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Module</th>
                        <th>Events</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asRows(analytics?.by_module).map((row) => (
                        <tr key={toText(row.module_key)}>
                          <td>{titleCase(row.module_key)}</td>
                          <td>{toText(row.events)}</td>
                        </tr>
                      ))}
                      {asRows(analytics?.by_module).length === 0 ? <EmptyState colSpan={2} message="No module analytics in this window." /> : null}
                    </tbody>
                  </table>
                </div>
                <JsonDetails value={analytics ?? {}} />
              </section>
            ) : null}
          </section>
        </main>
      </section>
    </SiteChrome>
  );
};
