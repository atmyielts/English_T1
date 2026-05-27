import { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toeflPlaybookPageGet, toeflPlaybookTrackEvent } from '../lib/api';
import { PageBlocks } from '../components/content/PageBlocks';
import { PlaybookTopNav } from '../components/PlaybookTopNav';
import { buildPlatformUrl } from '../lib/platformUrls';
import { TOEFL_PLAYBOOK_PRODUCT_SLUG, TOEFL_PRACTICE_URL } from '../lib/constants';
import { useAccess } from '../lib/useAccess';

type Json = Record<string, unknown>;

export const ContentPage = () => {
  const { slug } = useParams();
  const { accessToken, status } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    if (status === 'loading') return;
    let active = true;

    const handleLoaded = (data: Json, token?: string | null) => {
      if (!active) return;
      setPayload(data);
      setError(null);
      const page = (data.page ?? null) as Json | null;
      void toeflPlaybookTrackEvent(
        {
          event_name: 'page_view',
          page_id: String(page?.id ?? ''),
          page_type: String(page?.page_type ?? ''),
          module_key: String(page?.module_key ?? ''),
        },
        token,
      );
    };

    const redirectForAccessError = (errStatus?: number): boolean => {
      if (errStatus === 403) {
        window.location.assign(buildPlatformUrl('/pricing', window.location.href, { product: TOEFL_PLAYBOOK_PRODUCT_SLUG }));
        return true;
      }
      if (errStatus === 401) {
        if (status === 'authenticated') return false;
        window.location.assign(buildPlatformUrl('/auth', window.location.href, { product: TOEFL_PLAYBOOK_PRODUCT_SLUG }));
        return true;
      }
      return false;
    };

    const load = async () => {
      try {
        const publicData = await toeflPlaybookPageGet(slug);
        handleLoaded(publicData as unknown as Json, null);
      } catch (publicErr) {
        const e = publicErr as Error & { status?: number };
        if ((e.status === 401 || e.status === 403) && accessToken) {
          try {
            const authed = await toeflPlaybookPageGet(slug, accessToken);
            handleLoaded(authed as unknown as Json, accessToken);
            return;
          } catch (authedErr) {
            const ae = authedErr as Error & { status?: number };
            if (!active) return;
            if (redirectForAccessError(ae.status)) return;
            setError(ae.message);
            return;
          }
        }
        if (!active) return;
        if (redirectForAccessError(e.status)) return;
        setError(e.message);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [accessToken, slug, status]);

  const page = (payload?.page ?? null) as Json | null;
  const sections = Array.isArray(payload?.sections) ? (payload?.sections as Json[]) : [];
  const childPages = Array.isArray(payload?.child_pages) ? (payload?.child_pages as Json[]) : [];
  const sources = Array.isArray(payload?.sources) ? (payload?.sources as Json[]) : [];

  return (
    <div className="app-shell">
      <PlaybookTopNav />
      <main className="workspace">
        <section className="page-header">
          <div>
            <p className="eyebrow">{String(page?.module_key ?? 'TOEFL Playbook')}</p>
            <h1>{String(page?.title ?? 'Loading…')}</h1>
            <p>{String(page?.summary ?? 'Working on the right TOEFL skills matters as much as working hard.')}</p>
          </div>
          <div className="hero-actions">
            <Link to="/dashboard" className="btn solid">Use in my plan</Link>
            <a href={`${TOEFL_PRACTICE_URL}/dashboard?source=playbook`} className="btn ghost">
              Practice this <ArrowRight size={15} />
            </a>
          </div>
        </section>

        {error ? <p className="alert error">{error}</p> : null}
        {page ? <PageBlocks sections={sections} /> : <div className="route-loading">Loading page…</div>}

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
