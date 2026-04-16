import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  adminPlaybookAnalytics,
  adminPlaybookMarketCreate,
  adminPlaybookMarketsList,
  adminPlaybookPageCreate,
  adminPlaybookPagesList,
  adminPlaybookPlanTemplateCreate,
  adminPlaybookPlanTemplatesList,
  adminPlaybookPreview,
  adminPlaybookQa,
  adminPlaybookRulesList,
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

const adminNav: Array<{ path: string; label: string }> = [
  { path: '/admin', label: 'Dashboard' },
  { path: '/admin/content', label: 'Content' },
  { path: '/admin/updates', label: 'Updates' },
  { path: '/admin/markets', label: 'Markets' },
  { path: '/admin/sources', label: 'Sources' },
  { path: '/admin/plan-templates', label: 'Plan Templates' },
  { path: '/admin/rules', label: 'Rules' },
  { path: '/admin/preview', label: 'Preview' },
  { path: '/admin/analytics', label: 'Analytics' },
];

export const AdminPage: React.FC<{ section: SectionKey }> = ({ section }) => {
  const { accessToken } = useAccess({ force: true });
  const { id } = useParams();
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formState, setFormState] = useState<Record<string, string>>({
    pageTitle: '',
    pageSlug: '',
    pageModule: 'essentials',
    pageSummary: '',
    marketCountry: 'GLOBAL',
    marketSummary:
      'Global fallback guidance used when market-specific rows are still being curated.',
    previewUserId: '',
    planTitle: '',
    planSlug: '',
  });

  const load = async () => {
    if (!accessToken) return;
    setError(null);
    try {
      if (section === 'dashboard') {
        const [qa, analytics] = await Promise.all([adminPlaybookQa(accessToken), adminPlaybookAnalytics(accessToken, 30)]);
        setPayload({ qa, analytics });
        return;
      }
      if (section === 'content' || section === 'content-detail' || section === 'updates') {
        setPayload(await adminPlaybookPagesList(accessToken));
        return;
      }
      if (section === 'markets') {
        setPayload(await adminPlaybookMarketsList(accessToken));
        return;
      }
      if (section === 'sources') {
        setPayload(await adminPlaybookSourcesList(accessToken));
        return;
      }
      if (section === 'plan-templates') {
        setPayload(await adminPlaybookPlanTemplatesList(accessToken));
        return;
      }
      if (section === 'rules') {
        setPayload(await adminPlaybookRulesList(accessToken));
        return;
      }
      if (section === 'analytics') {
        setPayload(await adminPlaybookAnalytics(accessToken, 30));
        return;
      }
      setPayload(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken, section]);

  const selectedPage = useMemo(() => {
    if (section !== 'content-detail' || !id || !Array.isArray(payload?.pages)) return null;
    return (payload.pages as Array<Record<string, unknown>>).find((page) => String(page.id) === id) ?? null;
  }, [id, payload, section]);

  const createPage = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await adminPlaybookPageCreate(accessToken, {
        page_type: 'module',
        visibility: 'public',
        status: 'draft',
        title: formState.pageTitle,
        slug: formState.pageSlug,
        module_key: formState.pageModule,
        summary: formState.pageSummary,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page');
    } finally {
      setBusy(false);
    }
  };

  const createMarket = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await adminPlaybookMarketCreate(accessToken, {
        country_code: formState.marketCountry,
        provider_key: 'british-council',
        summary: formState.marketSummary,
        status: 'review',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create market');
    } finally {
      setBusy(false);
    }
  };

  const createPlanTemplate = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await adminPlaybookPlanTemplateCreate(accessToken, {
        product_id: '9de6c9e7-31df-4d1d-9574-1f8f84a53b54',
        slug: formState.planSlug,
        title: formState.planTitle,
        plan_type: 'balanced',
        summary: 'Admin-created template draft',
        duration_days: 28,
        band_min: 4,
        band_max: 8,
        intensity: 'moderate',
        status: 'draft',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plan template');
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    if (!accessToken || !formState.previewUserId) return;
    setBusy(true);
    setError(null);
    try {
      setPayload(await adminPlaybookPreview(accessToken, { user_id: formState.previewUserId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SiteChrome compact>
      <section className="page-hero">
        <p className="eyebrow">Admin console</p>
        <h1>IELTS Playbook operations</h1>
        <p className="hero-summary">Content governance, market guidance, rule tuning, QA flags, and analytics live here.</p>
      </section>

      <nav className="admin-nav">
        {adminNav.map((item) => (
          <Link key={item.path} to={item.path} className="nav-link">
            {item.label}
          </Link>
        ))}
      </nav>

      {error ? <p className="error-banner">{error}</p> : null}

      {section === 'dashboard' ? (
        <section className="dashboard-grid">
          <article className="content-card">
            <p className="eyebrow">QA</p>
            <pre>{JSON.stringify(payload?.qa ?? {}, null, 2)}</pre>
          </article>
          <article className="content-card">
            <p className="eyebrow">Analytics</p>
            <pre>{JSON.stringify(payload?.analytics ?? {}, null, 2)}</pre>
          </article>
        </section>
      ) : null}

      {section === 'content' ? (
        <section className="section-shell">
          <div className="admin-tools">
            <input placeholder="Page title" value={formState.pageTitle} onChange={(e) => setFormState((current) => ({ ...current, pageTitle: e.target.value }))} />
            <input placeholder="Slug" value={formState.pageSlug} onChange={(e) => setFormState((current) => ({ ...current, pageSlug: e.target.value }))} />
            <input placeholder="Module key" value={formState.pageModule} onChange={(e) => setFormState((current) => ({ ...current, pageModule: e.target.value }))} />
            <input placeholder="Summary" value={formState.pageSummary} onChange={(e) => setFormState((current) => ({ ...current, pageSummary: e.target.value }))} />
            <button className="button button-dark" onClick={createPage} disabled={busy}>
              Create module draft
            </button>
          </div>
          <pre>{JSON.stringify(payload?.pages ?? [], null, 2)}</pre>
        </section>
      ) : null}

      {section === 'content-detail' ? (
        <section className="content-card">
          <p className="eyebrow">Content detail</p>
          <pre>{JSON.stringify(selectedPage ?? {}, null, 2)}</pre>
        </section>
      ) : null}

      {section === 'updates' ? (
        <section className="content-card">
          <p className="eyebrow">Published and draft pages</p>
          <pre>{JSON.stringify((payload?.pages as Array<Record<string, unknown>> | undefined)?.filter((page) => String(page.page_type ?? '') === 'update') ?? [], null, 2)}</pre>
        </section>
      ) : null}

      {section === 'markets' ? (
        <section className="section-shell">
          <div className="admin-tools">
            <input placeholder="Country code" value={formState.marketCountry} onChange={(e) => setFormState((current) => ({ ...current, marketCountry: e.target.value }))} />
            <input placeholder="Summary" value={formState.marketSummary} onChange={(e) => setFormState((current) => ({ ...current, marketSummary: e.target.value }))} />
            <button className="button button-dark" onClick={createMarket} disabled={busy}>
              Create market draft
            </button>
          </div>
          <pre>{JSON.stringify(payload?.markets ?? [], null, 2)}</pre>
        </section>
      ) : null}

      {section === 'sources' ? (
        <section className="content-card">
          <p className="eyebrow">Sources</p>
          <pre>{JSON.stringify(payload?.sources ?? [], null, 2)}</pre>
        </section>
      ) : null}

      {section === 'plan-templates' ? (
        <section className="section-shell">
          <div className="admin-tools">
            <input placeholder="Plan title" value={formState.planTitle} onChange={(e) => setFormState((current) => ({ ...current, planTitle: e.target.value }))} />
            <input placeholder="Plan slug" value={formState.planSlug} onChange={(e) => setFormState((current) => ({ ...current, planSlug: e.target.value }))} />
            <button className="button button-dark" onClick={createPlanTemplate} disabled={busy}>
              Create template draft
            </button>
          </div>
          <pre>{JSON.stringify(payload?.plan_templates ?? [], null, 2)}</pre>
        </section>
      ) : null}

      {section === 'rules' ? (
        <section className="content-card">
          <p className="eyebrow">Rules</p>
          <pre>{JSON.stringify(payload?.rules ?? [], null, 2)}</pre>
        </section>
      ) : null}

      {section === 'preview' ? (
        <section className="section-shell">
          <div className="admin-tools">
            <input placeholder="User ID" value={formState.previewUserId} onChange={(e) => setFormState((current) => ({ ...current, previewUserId: e.target.value }))} />
            <button className="button button-dark" onClick={preview} disabled={busy}>
              Preview recommendation
            </button>
          </div>
          <pre>{JSON.stringify(payload ?? {}, null, 2)}</pre>
        </section>
      ) : null}

      {section === 'analytics' ? (
        <section className="content-card">
          <p className="eyebrow">Analytics</p>
          <pre>{JSON.stringify(payload ?? {}, null, 2)}</pre>
        </section>
      ) : null}
    </SiteChrome>
  );
};
