import { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { satPlaybookPageGet, satPlaybookTrackEvent } from '../lib/api';
import { PageBlocks } from '../components/content/PageBlocks';
import { PlaybookTopNav } from '../components/PlaybookTopNav';
import { buildPlatformUrl } from '../lib/platformUrls';
import { SAT_PLAYBOOK_PRODUCT_SLUG, SAT_PRACTICE_URL } from '../lib/constants';
import { useAccess } from '../lib/useAccess';

type Json = Record<string, unknown>;

export const ContentPage = () => {
  const { slug } = useParams();
  const { accessToken, status } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadedToken, setLoadedToken] = useState<string | null | undefined>(undefined);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!slug) return;
    if (status === 'loading') return;
    let active = true;
    const controller = new AbortController();
    setPayload(null); setError(null); setMissing(false); setLoadedSlug(null);
    const timeout = window.setTimeout(() => {
      if (!active) return;
      active = false; controller.abort();
      setError('This page is taking too long to load. Please try again.');
    }, 12000);
    const fail = (errStatus?: number) => {
      window.clearTimeout(timeout);
      setMissing(errStatus === 404);
      setError(errStatus === 404 ? 'This page is not published or is no longer available.' : 'We could not load this page. Please try again.');
    };

    const handleLoaded = (data: Json, token?: string | null) => {
      if (!active) return;
      if (!data.page || typeof data.page !== 'object' || Array.isArray(data.page) || typeof (data.page as Json).id !== 'string' || typeof (data.page as Json).title !== 'string' || !String((data.page as Json).title).trim()) { fail(); return; }
      window.clearTimeout(timeout);
      setPayload(data); setLoadedSlug(slug); setLoadedToken(accessToken);
      setError(null);
      const page = (data.page ?? null) as Json | null;
      void satPlaybookTrackEvent(
        {
          event_name: 'page_view',
          page_id: String(page?.id ?? ''),
          page_type: String(page?.page_type ?? ''),
          module_key: String(page?.module_key ?? ''),
        },
        token,
      ).catch(() => { /* Analytics must not interrupt reading. */ });
    };

    const redirectForAccessError = (errStatus?: number): boolean => {
      if (!active) return true;
      if (errStatus === 403) {
        window.location.assign(buildPlatformUrl('/pricing', window.location.href, { product: SAT_PLAYBOOK_PRODUCT_SLUG }));
        return true;
      }
      if (errStatus === 401) {
        if (status === 'authenticated') return false;
        window.location.assign(buildPlatformUrl('/auth', window.location.href, { product: SAT_PLAYBOOK_PRODUCT_SLUG }));
        return true;
      }
      return false;
    };

    const load = async () => {
      try {
        const publicData = await satPlaybookPageGet(slug, null, controller.signal);
        handleLoaded(publicData as unknown as Json, null);
      } catch (publicErr) {
        if (!active) return;
        const e = publicErr as Error & { status?: number };
        if ((e.status === 401 || e.status === 403) && accessToken) {
          try {
            const authed = await satPlaybookPageGet(slug, accessToken, controller.signal);
            handleLoaded(authed as unknown as Json, accessToken);
            return;
          } catch (authedErr) {
            const ae = authedErr as Error & { status?: number };
            if (!active) return;
            if (redirectForAccessError(ae.status)) return;
            fail(ae.status);
            return;
          }
        }
        if (!active) return;
        if (redirectForAccessError(e.status)) return;
        fail(e.status);
      }
    };

    void load();
    return () => {
      active = false; controller.abort(); window.clearTimeout(timeout);
    };
  }, [accessToken, slug, status, retry]);

  const visiblePayload = loadedSlug === slug && loadedToken === accessToken ? payload : null;
  const page = (visiblePayload?.page ?? null) as Json | null;
  const sections = Array.isArray(visiblePayload?.sections) ? (visiblePayload?.sections as Json[]) : [];
  const childPages = Array.isArray(visiblePayload?.child_pages) ? (visiblePayload?.child_pages as Json[]) : [];
  const sources = Array.isArray(visiblePayload?.sources) ? (visiblePayload?.sources as Json[]) : [];

  return (
    <div className="app-shell">
      <PlaybookTopNav />
      <main className="workspace">
        <section className="page-header">
          <div>
            <p className="eyebrow">{String(page?.module_key ?? 'SAT Playbook')}</p>
            <h1>{String(page?.title ?? (error ? (missing ? 'Page unavailable' : 'Unable to load page') : 'Loading…'))}</h1>
            <p>{String(page?.summary ?? 'Working on the right SAT domains matters as much as working hard.')}</p>
          </div>
          {page ? <div className="hero-actions">
            <Link to="/dashboard" className="btn solid">Use in my plan</Link>
            <a href={`${SAT_PRACTICE_URL}/dashboard?source=playbook`} className="btn ghost">
              Practice this <ArrowRight size={15} />
            </a>
          </div> : null}
        </section>

        {error ? <section className="panel" aria-label="Page recovery">
          <p className="alert error" role="alert">{error}</p>
          <div className="hero-actions">
            <button type="button" className="btn solid" onClick={() => setRetry(value => value + 1)}>Try again</button>
            <Link to="/modules" className="btn ghost">Browse modules</Link>
          </div>
        </section> : page ? <PageBlocks sections={sections} /> : <div className="route-loading" role="status">Loading page…</div>}

        {childPages.length > 0 ? (
          <section className="panel" style={{ marginTop: 24 }}>
            <p className="eyebrow">Deep guides</p>
            <div className="feature-grid">
              {childPages.map((child) => (
                <Link key={String(child.id)} to={`/${String(child.slug)}`} className="feature-card">
                  <span className="chip">{String(child.visibility ?? 'public')}</span>
                  <h2>{String(child.title ?? '')}</h2>
                  <p>{String(child.summary ?? '')}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {sources.length > 0 ? (
          <section className="panel" style={{ marginTop: 24 }}>
            <p className="eyebrow">Official references</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {sources.map((row, i) => {
                const source = ((row as Json).source ?? null) as Json | null;
                return (
                  <a key={i} href={String(source?.url ?? '#')} className="nav-link">
                    <ExternalLink size={15} />
                    <span>{String(source?.title ?? 'Official source')}</span>
                  </a>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
};
