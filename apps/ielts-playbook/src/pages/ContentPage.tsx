import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookMarked, BookOpenCheck, ExternalLink, LibraryBig, LockKeyhole } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  apiErrorStatus,
  pageTeaserFromError,
  playbookModuleVisit,
  playbookPageGet,
  playbookTrackEvent,
  type PlaybookPageTeaser,
} from '../lib/api';
import { PlaybookStrategyExplainer } from '../components/PlaybookStrategyExplainer';
import { PlaybookMiniDrills } from '../components/PlaybookMiniDrills';
import { PlaybookDiagnostic } from '../components/PlaybookDiagnostic';
import { PlaybookWorkedExample } from '../components/PlaybookWorkedExample';
import { PlaybookBandRender } from '../components/PlaybookBandRender';
import { PlaybookPracticeNow } from '../components/PlaybookPracticeNow';
import { PlaybookHighlighter } from '../components/PlaybookHighlighter';
import { MarketGuidePanel } from '../components/MarketGuidePanel';
import {
  PageSkeleton,
  PremiumFeaturesCard,
  PremiumLockedView,
  UseInPlanButton,
  type ViewerTier,
} from '../components/PlaybookPremium';
import { SiteChrome } from '../components/content/SiteChrome';
import { PageBlocks } from '../components/content/PageBlocks';
import { useT } from '../i18n';
import { hasPlaybookPremium } from '../lib/access';
import { readCachedPage, writeCachedPage } from '../lib/pageCache';
import { useAccess } from '../lib/useAccess';

type Payload = Record<string, unknown>;

export const ContentPage: React.FC = () => {
  const t = useT();
  const { slug } = useParams();
  const { accessToken, status, me, effective } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Payload | null>(() => (slug ? readCachedPage<Payload>(slug) : null));
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [locked, setLocked] = useState<{ teaser: PlaybookPageTeaser | null } | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);

  const tier: ViewerTier =
    status === 'loading'
      ? 'loading'
      : status === 'unauthenticated'
        ? 'anonymous'
        : hasPlaybookPremium(me, effective)
          ? 'premium'
          : 'free';

  // A revisit renders from the per-tab cache straight away; the network
  // request below still runs and replaces it with fresh content.
  useEffect(() => {
    if (!slug) return;
    setPayload(readCachedPage<Payload>(slug));
    setLocked(null);
    setNotFound(false);
    setError(null);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    // Wait for the session check so a premium guide is requested once, with
    // the right token, instead of failing anonymously first.
    if (status === 'loading') return;
    let active = true;
    const token = status === 'authenticated' ? accessToken : null;

    playbookPageGet(slug, token)
      .then((data) => {
        if (!active) return;
        const record = data as unknown as Payload;
        setPayload(record);
        setLocked(null);
        setError(null);
        const page = (record.page ?? null) as Payload | null;
        if (String(page?.visibility ?? 'public') === 'public') writeCachedPage(slug, record);
        void playbookTrackEvent(
          {
            event_name: 'page_view',
            page_id: String(page?.id ?? ''),
            page_type: String(page?.page_type ?? ''),
            module_key: String(page?.module_key ?? ''),
          },
          token,
        ).catch(() => null);
        const slugForVisit = String(page?.slug ?? '').trim();
        if (slugForVisit && token && tier === 'premium') void playbookModuleVisit(token, slugForVisit).catch(() => null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const code = apiErrorStatus(err);
        if (code === 401 || code === 403) {
          setLocked({ teaser: pageTeaserFromError(err) });
          setPayload(null);
          void playbookTrackEvent({ event_name: 'premium_gate_seen', metadata: { slug } }, token).catch(() => null);
          return;
        }
        if (code === 404) {
          setNotFound(true);
          setPayload(null);
          return;
        }
        // Keep showing a cached copy if we have one; just flag the refresh failure.
        setError(t('content.loadError'));
      });

    return () => {
      active = false;
    };
    // tier only changes together with status/effective; avoid refetching on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, slug, status]);

  const page = (payload?.page ?? null) as Payload | null;
  const sections = Array.isArray(payload?.sections) ? (payload?.sections as Payload[]) : [];
  const childPages = Array.isArray(payload?.child_pages) ? (payload?.child_pages as Payload[]) : [];
  const sources = Array.isArray(payload?.sources) ? (payload?.sources as Payload[]) : [];
  const visibility = page ? String(page.visibility ?? 'public') : locked ? 'premium' : 'public';
  const moduleKey = page?.module_key ? String(page.module_key) : null;
  const isPremiumPage = visibility === 'premium';
  const premiumTools = tier === 'premium' && Boolean(page) && Boolean(slug) && Boolean(accessToken);
  const title = page?.title ? String(page.title) : locked?.teaser?.title || null;
  const summary = page?.summary ? String(page.summary) : locked?.teaser?.summary || null;

  return (
    <SiteChrome compact>
      <section className="article-hero">
        <div>
          <p className="eyebrow">{String(page?.module_key ?? locked?.teaser?.module_key ?? 'IELTS Playbook')}</p>
          {title ? <h1>{title}</h1> : <span className="p2-skeleton p2-skeleton-line long hero-skeleton" aria-hidden="true" />}
          {summary ? <p className="hero-summary">{summary}</p> : null}
          {!notFound ? (
            <div className="hero-actions">
              <PlaybookPracticeNow moduleKey={moduleKey} />
              {slug && !locked ? <UseInPlanButton slug={slug} tier={tier} accessToken={accessToken} /> : null}
              {tier === 'premium' ? (
                <Link to="/notes" className="button button-secondary">
                  <BookMarked size={17} />
                  {t('content.myNotes')}
                </Link>
              ) : null}
              <Link to="/study-plans" className="button button-secondary">
                <BookOpenCheck size={17} />
                {t('nav.studyPlans')}
              </Link>
            </div>
          ) : null}
        </div>
        <aside className="article-rail" aria-label={t('content.meta')}>
          <div className="rail-row">
            <LockKeyhole size={18} />
            <span>{isPremiumPage ? t('content.premiumGuide') : t('content.publicModule')}</span>
          </div>
          <div className="rail-row">
            <LibraryBig size={18} />
            <span>{t('content.sectionCount', { count: sections.length || locked?.teaser?.section_count || 0 })}</span>
          </div>
          <div className="rail-row">
            <ExternalLink size={18} />
            <span>{t('content.sourceCount', { count: sources.length })}</span>
          </div>
        </aside>
      </section>

      {error ? <p className="notice-banner notice-danger" role="alert">{error}</p> : null}

      {notFound ? (
        <section className="content-card prose-card" data-testid="page-not-found">
          <h2>{t('content.notFound.title')}</h2>
          <p>{t('content.notFound.body')}</p>
          <Link to="/" className="text-link">
            {t('content.notFound.cta')}
            <ArrowRight size={15} />
          </Link>
        </section>
      ) : null}

      {locked ? <PremiumLockedView teaser={locked.teaser} tier={tier} /> : null}

      {premiumTools && isPremiumPage ? <PlaybookDiagnostic accessToken={accessToken} pageSlug={slug!} /> : null}

      {slug === 'test-types-booking' && page ? <MarketGuidePanel /> : null}

      {!locked && !notFound ? (
        <article ref={articleRef as React.RefObject<HTMLElement>} className="article-body">
          {page ? (
            <PageBlocks sections={sections} accessToken={accessToken} pageSlug={slug} enableSectionCoach={premiumTools && isPremiumPage} />
          ) : (
            <PageSkeleton />
          )}
          {premiumTools ? <PlaybookHighlighter accessToken={accessToken} pageSlug={slug!} containerRef={articleRef} /> : null}
        </article>
      ) : null}

      {page && !isPremiumPage ? <PremiumFeaturesCard tier={tier} /> : null}

      {premiumTools ? <PlaybookStrategyExplainer accessToken={accessToken} pageSlug={slug!} /> : null}

      {premiumTools && isPremiumPage ? (
        <>
          <PlaybookWorkedExample accessToken={accessToken} pageSlug={slug!} />
          <PlaybookBandRender accessToken={accessToken} pageSlug={slug!} />
          <PlaybookMiniDrills accessToken={accessToken} pageSlug={slug!} />
        </>
      ) : null}

      {childPages.length > 0 ? (
        <section className="section-band">
          <div className="section-heading">
            <p className="eyebrow">{t('content.deepGuides')}</p>
            <h2>{t('content.deepGuides.title')}</h2>
            <p>{t('content.deepGuides.lead')}</p>
          </div>
          <div className="module-showcase compact-cards">
            {childPages.map((child) => (
              <Link key={String(child.id)} to={`/${String(child.slug)}`} className="module-card">
                <span className="card-kicker">
                  {String(child.visibility) === 'premium' ? t('premium.badge') : t('content.publicModule')}
                </span>
                <h3>{String(child.title ?? '')}</h3>
                <p>{String(child.summary ?? '')}</p>
                <span className="card-link">
                  {t('content.openGuide')}
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
            <p className="eyebrow">{t('content.sources')}</p>
            <h2>{t('content.sources.title')}</h2>
            <p>{t('content.sources.lead')}</p>
          </div>
          <div className="source-list">
            {sources.map((row, index) => {
              const source = ((row as Payload).source ?? null) as Payload | null;
              const url = String(source?.url ?? '');
              return (
                <a
                  key={index}
                  href={url || '#'}
                  className="source-item"
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => void playbookTrackEvent({ event_name: 'official_source_clicked', metadata: { url } }).catch(() => null)}
                >
                  <strong>{String(source?.title ?? t('content.officialSource'))}</strong>
                  <span>{String((row as Payload).citation_note ?? source?.summary ?? '')}</span>
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
