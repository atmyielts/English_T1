import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpenCheck, ExternalLink, LibraryBig, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { playbookModuleVisit, playbookPageGet, playbookTrackEvent } from '../lib/api';
import { PlaybookStrategyExplainer } from '../components/PlaybookStrategyExplainer';
import { SiteChrome } from '../components/content/SiteChrome';
import { PageBlocks } from '../components/content/PageBlocks';
import { buildPlatformUrl } from '../lib/platformUrls';
import { IELTS_PLAYBOOK_PRODUCT_SLUG } from '../lib/constants';
import { useAccess } from '../lib/useAccess';

export const ContentPage: React.FC = () => {
  const { slug } = useParams();
  const { accessToken, status } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    // Wait until useAccess has finished resolving. Otherwise the public
    // fetch fires with no token, gets 401 on premium pages, and we redirect
    // to /auth before the session has had a chance to populate — kicking
    // off an infinite auth → page → auth → page loop.
    if (status === 'loading') return;
    let active = true;
    const handleLoaded = (data: Record<string, unknown>, token?: string | null) => {
      if (!active) return;
      setPayload(data);
      setError(null);
      const page = (data.page ?? null) as Record<string, unknown> | null;
      void playbookTrackEvent(
        {
          event_name: 'page_view',
          page_id: String(page?.id ?? ''),
          page_type: String(page?.page_type ?? ''),
          module_key: String(page?.module_key ?? ''),
        },
        token,
      );
      // Mark this module as visited so the dashboard's curriculum progress
      // reflects what the user has actually opened. Authenticated only.
      const slugForVisit = String(page?.slug ?? '').trim();
      if (slugForVisit && token) {
        void playbookModuleVisit(token, slugForVisit).catch(() => null);
      }
    };

    const redirectForAccessError = (errStatus?: number) => {
      if (errStatus === 403) {
        window.location.assign(buildPlatformUrl('/pricing', window.location.href, { product: IELTS_PLAYBOOK_PRODUCT_SLUG }));
        return true;
      }
      if (errStatus === 401) {
        // Only redirect to /auth when we actually know the user is anonymous.
        // If status is 'authenticated' and we still got 401, the session is
        // present but rejected — pricing/login won't fix it, surface an error
        // instead of looping.
        if (status === 'authenticated') {
          return false;
        }
        window.location.assign(buildPlatformUrl('/auth', window.location.href, { product: IELTS_PLAYBOOK_PRODUCT_SLUG }));
        return true;
      }
      return false;
    };

    const load = async () => {
      try {
        const publicData = await playbookPageGet(slug);
        handleLoaded(publicData as unknown as Record<string, unknown>, null);
        return;
      } catch (publicErr) {
        const publicError = publicErr as Error & { status?: number };
        if ((publicError.status === 401 || publicError.status === 403) && accessToken) {
          try {
            const authedData = await playbookPageGet(slug, accessToken);
            handleLoaded(authedData as unknown as Record<string, unknown>, accessToken);
            return;
          } catch (authedErr) {
            const authedError = authedErr as Error & { status?: number };
            if (!active) return;
            if (redirectForAccessError(authedError.status)) return;
            setError(authedError.message);
            return;
          }
        }

        if (!active) return;
        if (redirectForAccessError(publicError.status)) return;
        setError(publicError.message);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [accessToken, slug, status]);

  const page = (payload?.page ?? null) as Record<string, unknown> | null;
  const sections = Array.isArray(payload?.sections) ? (payload?.sections as Array<Record<string, unknown>>) : [];
  const childPages = Array.isArray(payload?.child_pages) ? (payload?.child_pages as Array<Record<string, unknown>>) : [];
  const sources = Array.isArray(payload?.sources) ? (payload?.sources as Array<Record<string, unknown>>) : [];
  const visibility = String(page?.visibility ?? 'public');

  return (
    <SiteChrome compact>
      <section className="article-hero">
        <div>
          <p className="eyebrow">{String(page?.module_key ?? 'IELTS Playbook')}</p>
          <h1>{String(page?.title ?? 'Loading...')}</h1>
          <p className="hero-summary">
            {String(page?.summary ?? 'Working on the right IELTS questions matters as much as working hard.')}
          </p>
          <div className="hero-actions">
            <Link to="/dashboard" className="button button-primary">
              <ShieldCheck size={17} />
              Use in My Plan
            </Link>
            <Link to="/study-plans" className="button button-secondary">
              <BookOpenCheck size={17} />
              Study Plans
            </Link>
          </div>
        </div>
        <aside className="article-rail" aria-label="Module metadata">
          <div className="rail-row">
            <LockKeyhole size={18} />
            <span>{visibility === 'premium' ? 'Premium guide' : 'Public module'}</span>
          </div>
          <div className="rail-row">
            <LibraryBig size={18} />
            <span>{sections.length || '-'} sections</span>
          </div>
          <div className="rail-row">
            <ExternalLink size={18} />
            <span>{sources.length || 0} official sources</span>
          </div>
        </aside>
      </section>

      {error ? <p className="notice-banner notice-danger">{error}</p> : null}
      {page ? <PageBlocks sections={sections} /> : <div className="route-loading">Loading page...</div>}

      {page && slug && accessToken ? (
        <PlaybookStrategyExplainer accessToken={accessToken} pageSlug={slug} />
      ) : null}

      {childPages.length > 0 ? (
        <section className="section-band">
          <div className="section-heading">
            <p className="eyebrow">Deep guides</p>
            <h2>Go deeper from here.</h2>
            <p>Use these companion guides when the main module reveals a specific gap.</p>
          </div>
          <div className="module-showcase compact-cards">
            {childPages.map((child) => (
              <Link key={String(child.id)} to={`/${String(child.slug)}`} className="module-card">
                <span className="card-kicker">{String(child.visibility ?? 'public')}</span>
                <h3>{String(child.title ?? '')}</h3>
                <p>{String(child.summary ?? '')}</p>
                <span className="card-link">
                  Open guide
                  <ArrowRight size={15} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {sources.length > 0 ? (
        <section className="section-band source-section">
          <div className="section-heading">
            <p className="eyebrow">Sources</p>
            <h2>Official references.</h2>
            <p>Policy-sensitive guidance stays tied to provider and official IELTS sources.</p>
          </div>
          <div className="source-list">
            {sources.map((row, index) => {
              const source = ((row as Record<string, unknown>).source ?? null) as Record<string, unknown> | null;
              return (
                <a key={index} href={String(source?.url ?? '#')} className="source-item">
                  <strong>{String(source?.title ?? 'Official source')}</strong>
                  <span>{String((row as Record<string, unknown>).citation_note ?? source?.summary ?? '')}</span>
                  <ExternalLink size={16} />
                </a>
              );
            })}
          </div>
        </section>
      ) : null}
    </SiteChrome>
  );
};
