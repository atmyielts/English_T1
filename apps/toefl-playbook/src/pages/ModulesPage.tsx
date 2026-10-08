import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toeflPlaybookCatalogGet, type ToeflPlaybookCatalog } from '../lib/api';
import { PlaybookTopNav } from '../components/PlaybookTopNav';

const reserved = new Set(['modules', 'auth', 'pricing', 'checkout', 'account', 'dashboard', 'onboarding', 'diagnostic', 'plans']);
const readablePage = (row: unknown): boolean => {
  if (!row || typeof row !== 'object') return false;
  const page = row as Record<string, unknown>;
  return typeof page.id === 'string' && !!page.id && (page.summary == null || typeof page.summary === 'string') && typeof page.title === 'string' && !!page.title.trim()
    && typeof page.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(page.slug)
    && !reserved.has(page.slug.toLowerCase());
};

export const ModulesPage = () => {
  const [catalog, setCatalog] = useState<ToeflPlaybookCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setCatalog(null); setError(null);
    const timeout = window.setTimeout(() => {
      if (!active) return;
      active = false; controller.abort();
      setError('The module catalog is taking too long to load. Please try again.');
    }, 12000);
    toeflPlaybookCatalogGet(controller.signal).then(data => {
      if (!active) return;
      if (!data || !Array.isArray(data.modules) || !Array.isArray(data.premium_guides)
        || !data.modules.every(readablePage) || !data.premium_guides.every(readablePage)) {
        throw new Error('Invalid catalog');
      }
      setCatalog(data);
    }).catch(() => {
      if (active) setError('We could not load the module catalog. Please try again.');
    }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [retry]);

  return <div className="app-shell">
    <PlaybookTopNav />
    <main className="workspace">
      <section className="page-header">
        <div><p className="eyebrow">TOEFL Playbook</p><h1>Published modules</h1>
          <p>Browse the strategy modules and guides currently available.</p></div>
      </section>
      {error ? <section className="panel" aria-label="Catalog recovery">
        <p className="alert error" role="alert">{error}</p>
        <button type="button" className="btn solid" onClick={() => setRetry(value => value + 1)}>Try again</button>
      </section> : !catalog ? <p className="route-loading" role="status">Loading modules...</p> : <>
        <section className="panel" aria-label="Strategy modules">
          <h2>Strategy modules</h2>
          {catalog.modules.length ? <div className="feature-grid catalog-grid">{catalog.modules.map(mod =>
            <Link key={mod.id} to={`/${encodeURIComponent(mod.slug)}`} className="feature-card">
              <h3>{mod.title}</h3><p>{mod.summary}</p>
            </Link>)}</div> : <p>No strategy modules have been published yet. Check back here for new modules.</p>}
        </section>
        <section className="panel" aria-label="Premium guides" style={{ marginTop: 24 }}>
          <h2>Premium guides</h2>
          {catalog.premium_guides.length ? <div className="feature-grid catalog-grid">{catalog.premium_guides.map(guide =>
            <Link key={guide.id} to={`/${encodeURIComponent(guide.slug)}`} className="feature-card">
              <span className="chip">Premium guide - access checked when opened</span>
              <h3>{guide.title}</h3><p>{guide.summary}</p>
            </Link>)}</div> : <p>No premium guides have been published yet.</p>}
        </section>
        <div className="hero-actions" style={{ marginTop: 24 }}><Link to="/" className="btn ghost">Back to Playbook</Link></div>
      </>}
    </main>
  </div>;
};
