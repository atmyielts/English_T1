import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { playbookPageGet, playbookTrackEvent } from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { PageBlocks } from '../components/content/PageBlocks';
import { buildPlatformUrl } from '../lib/platformUrls';
import { IELTS_PLAYBOOK_PRODUCT_SLUG } from '../lib/constants';
import { useAccess } from '../lib/useAccess';

export const ContentPage: React.FC = () => {
  const { slug } = useParams();
  const { accessToken } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    playbookPageGet(slug, accessToken)
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError(null);
        const page = (data as Record<string, unknown>).page as Record<string, unknown>;
        void playbookTrackEvent(
          {
            event_name: 'page_view',
            page_id: String(page?.id ?? ''),
            page_type: String(page?.page_type ?? ''),
            module_key: String(page?.module_key ?? ''),
          },
          accessToken,
        );
      })
      .catch((err: Error & { status?: number }) => {
        if (!active) return;
        if (err.status === 403) {
          window.location.assign(buildPlatformUrl('/pricing', window.location.href, { product: IELTS_PLAYBOOK_PRODUCT_SLUG }));
          return;
        }
        if (err.status === 401) {
          window.location.assign(buildPlatformUrl('/auth', window.location.href, { product: IELTS_PLAYBOOK_PRODUCT_SLUG }));
          return;
        }
        setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [accessToken, slug]);

  const page = (payload?.page ?? null) as Record<string, unknown> | null;
  const sections = Array.isArray(payload?.sections) ? (payload?.sections as Array<Record<string, unknown>>) : [];
  const childPages = Array.isArray(payload?.child_pages) ? (payload?.child_pages as Array<Record<string, unknown>>) : [];
  const sources = Array.isArray(payload?.sources) ? (payload?.sources as Array<Record<string, unknown>>) : [];

  return (
    <SiteChrome compact>
      <section className="page-hero">
        <p className="eyebrow">{String(page?.module_key ?? 'IELTS Playbook')}</p>
        <h1>{String(page?.title ?? 'Loading...')}</h1>
        <p className="hero-summary">{String(page?.summary ?? 'Working on the right IELTS questions matters as much as working hard.')}</p>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}
      {page ? <PageBlocks sections={sections} /> : <div className="route-loading">Loading page…</div>}

      {childPages.length > 0 ? (
        <section className="section-shell">
          <div className="section-heading">
            <p className="eyebrow">Deep Guides</p>
            <h2>Go deeper from here</h2>
          </div>
          <div className="module-grid">
            {childPages.map((child) => (
              <Link key={String(child.id)} to={`/${String(child.slug)}`} className="module-card">
                <span>{String(child.visibility ?? 'public')}</span>
                <h3>{String(child.title ?? '')}</h3>
                <p>{String(child.summary ?? '')}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {sources.length > 0 ? (
        <section className="section-shell">
          <div className="section-heading">
            <p className="eyebrow">Sources</p>
            <h2>Official references</h2>
          </div>
          <div className="source-list">
            {sources.map((row, index) => {
              const source = ((row as Record<string, unknown>).source ?? null) as Record<string, unknown> | null;
              return (
                <a key={index} href={String(source?.url ?? '#')} className="source-item">
                  <strong>{String(source?.title ?? 'Official source')}</strong>
                  <span>{String((row as Record<string, unknown>).citation_note ?? source?.summary ?? '')}</span>
                </a>
              );
            })}
          </div>
        </section>
      ) : null}
    </SiteChrome>
  );
};
