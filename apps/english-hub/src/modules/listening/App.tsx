import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import '../../../../english-shared/src/english-routes.css';
import './module.css';
import '../../../../english-shared/src/workspace-shell.css';
import {
  AccessBoundaryCard,
  EnglishSkillWorkspace,
  PageHero,
  RouteContextRibbon,
  SectionGrid,
  StatCard,
} from '../../../../english-shared/src/ui';
import {
  readEnglishRouteContext,
  withEnglishRouteContext,
  type EnglishRouteContext,
} from '../../../../english-shared/src/routeContext';
import { platformUrl, supabase } from './lib/supabase';
import { getMe } from './lib/platformClient';
import { captureNotebookWords } from './lib/vocabularyNotebookClient';
import {
  getListeningItem,
  listListeningItems,
  submitListeningPractice,
  type ListeningItem,
} from './lib/listeningPracticeClient';
import { getLearningAttempt } from './lib/learningAttemptClient';

type SessionStatus = 'checking' | 'signed_in' | 'signed_out';
type AccessStatus = 'checking' | 'granted' | 'denied' | 'idle';

const LISTENING_PRODUCT_ID =
  ((import.meta.env.VITE_LISTENING_PRODUCT_ID as string | undefined) ?? '').trim() ||
  'f9c4a14b-d5a2-4a66-9cd8-5b3a0d6e7bf1';
const LISTENING_PRODUCT_SLUG = 'english-listening';
const SERVICE_LABEL = 'English Listening';
const ENGLISH_HUB_URL = '/';
const MODULE_BASE_PATH = '/listening';

const toModulePath = (path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/' ? MODULE_BASE_PATH : `${MODULE_BASE_PATH}${normalized}`;
};

const isModulePath = (pathname: string, path: string): boolean => pathname === toModulePath(path);
const isModulePathPrefix = (pathname: string, path: string): boolean => pathname.startsWith(toModulePath(path));

const hasActiveProductEntitlement = (
  entry: { resource_type: string; resource_id: string | null; ends_at: string | null },
  productId: string,
  productSlug: string,
): boolean => {
  if (entry.resource_type !== 'product') return false;
  if (entry.resource_id !== productId && entry.resource_id !== productSlug) return false;
  if (!entry.ends_at) return true;
  const endsAt = new Date(entry.ends_at).getTime();
  return Number.isNaN(endsAt) || endsAt > Date.now();
};

const ENGLISH_SERVICE_LINKS = [
  { key: 'reading', label: 'Reading', href: '/reading' },
  { key: 'writing', label: 'Writing', href: '/writing' },
  { key: 'listening', label: 'Listening', href: '/listening' },
  { key: 'speaking', label: 'Speaking', href: '/speaking' },
  { key: 'grammar', label: 'Grammar', href: '/grammar' },
  { key: 'vocabulary', label: 'Vocabulary', href: '/vocabulary' },
  { key: 'immersion', label: 'Immersion', href: '/immersion' },
] as const;

const SERVICE_SWITCH_LINKS = ENGLISH_SERVICE_LINKS.filter((service) => service.key !== 'listening');

const SERVICE_BLUEPRINT = [
  {
    slug: 'accent-route',
    title: 'Accent tracks',
    detail: 'Choose a route by accent, speed, and listening pressure before you start dictation.',
    intent: 'sentence-loop',
    skill: 'comprehension',
  },
  {
    slug: 'dictation-lab',
    title: 'Dictation lab',
    detail: 'Keep replay controls and transcript recovery on a page that belongs only to decoding.',
    intent: 'dictation',
    skill: 'accuracy',
  },
  {
    slug: 'recovery-review',
    title: 'Recovery review',
    detail: 'Move missed words and detail gaps into a dedicated debrief screen after submission.',
    intent: 'review',
    skill: 'vocabulary',
  },
];

const REVIEW_HANDOFFS = [
  { label: 'Push missed words to Vocabulary', href: '/vocabulary/activation' },
  { label: 'Apply rhythm in Speaking', href: '/speaking/shadowing' },
  { label: 'Use audio context in Immersion', href: '/immersion/missions' },
] as const;

const buildPlatformUrl = (pathname: string): string => `${platformUrl.replace(/\/$/, '')}${pathname}`;
const readMetaText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const asMetaRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const readMetaList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((entry) => readMetaText(entry)).filter(Boolean) : [];

const resolveProfileName = (session: Session | null): string | null => {
  if (!session) return null;
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = readMetaText(meta.full_name);
  if (fullName) return fullName;
  const firstName = readMetaText(meta.first_name);
  const lastName = readMetaText(meta.last_name);
  return `${firstName} ${lastName}`.trim() || null;
};

const resolveReturnTo = (): string => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
};

const SignedOutLanding = ({
  signInHref,
  pricingHref,
  platformWorkspaceHref,
  isSignedIn,
}: {
  signInHref: string;
  pricingHref: string;
  platformWorkspaceHref: string;
  isSignedIn: boolean;
}) => (
  <div className="landing-page-root">
    <div className="ambient-layer" />
    <div className="landing-page-main">
      <header className="landing-page-topbar card">
        <Link className="landing-brand" to={toModulePath('/')}>
          <span className="dot" />
          <strong>{SERVICE_LABEL}</strong>
        </Link>
        <nav className="landing-links">
          <a href={buildPlatformUrl('/about')}>About us</a>
          <a href={buildPlatformUrl('/programs')}>Programs</a>
          <a href={buildPlatformUrl('/blog')}>Blog</a>
          <a href={buildPlatformUrl('/courses')}>Courses</a>
          <a href={buildPlatformUrl('/faq')}>FAQ</a>
          <a href={buildPlatformUrl('/contact')}>Contact</a>
        </nav>
        <div className="landing-actions">
          <a className="ghost-btn" href={ENGLISH_HUB_URL}>
            English hub
          </a>
          <a className="ghost-btn" href={platformWorkspaceHref}>
            Open platform
          </a>
          {isSignedIn ? (
            <Link className="icon-btn" to={toModulePath('/dashboard')}>
              Dashboard
            </Link>
          ) : (
            <a className="icon-btn" href={signInHref}>
              Log in
            </a>
          )}
          <a className="primary-cta" href={pricingHref}>
            Sign up
          </a>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-mosaic">
          <article className="landing-card landing-stat tilt-left">
            <div className="landing-stat-head">
              <strong>Tracks</strong>
              <span className="landing-arrow">{'->'}</span>
            </div>
            <p>Discovery before dictation</p>
            <small>choose the right audio route first</small>
          </article>
          <article className="landing-card landing-team tilt-right">
            <span className="landing-pill">Audio lab</span>
            <h3>Clearer workflow</h3>
            <p>Split track selection, dictation, and recovery review into dedicated listening pages.</p>
          </article>
          <article className="landing-card landing-offer tilt-right">
            <h3>Premium listening routes</h3>
            <p className="landing-price">
              12$ <span>35$</span>
            </p>
            <div className="landing-ticket">
              <div className="landing-ticket-row">
                <small>Track</small>
                <small>Review</small>
              </div>
              <strong>Hear {'->'} write {'->'} recover</strong>
              <small>clean route ownership</small>
            </div>
          </article>
          <article className="landing-card landing-showcase tilt-left">
            <div className="landing-orb" aria-hidden />
            <h3>Connected vocabulary</h3>
            <p>Missed words move directly from listening review into Vocabulary activation.</p>
          </article>
        </div>
        <article className="landing-copy card">
          <div className="landing-chip">{SERVICE_LABEL}</div>
          <h2>One page for discovery, one page for dictation, one page for recovery.</h2>
          <p>Listening now feels like a real route: select a track, do the work, then debrief in a separate room.</p>
          <div className="landing-cta-row">
            <a className="primary-cta" href={isSignedIn ? toModulePath('/dashboard') : signInHref}>
              {isSignedIn ? 'Continue' : 'Get started'}
            </a>
            <a className="ghost-btn" href={pricingHref}>
              See pricing
            </a>
            <a className="ghost-btn" href={platformWorkspaceHref}>
              Open platform
            </a>
          </div>
        </article>
      </section>
    </div>
    <a className="updates-fab" href={buildPlatformUrl('/updates')}>
      Updates
    </a>
  </div>
);

const ListeningDashboardPage = ({
  hasAccess,
  pricingHref,
  context,
}: {
  hasAccess: boolean;
  pricingHref: string;
  context: EnglishRouteContext;
}) => (
  <SectionGrid>
    <RouteContextRibbon
      context={context}
      cta={
        <Link className="ghost-btn" to={toModulePath('/tracks')}>
          Open listening tracks
        </Link>
      }
    />
    <PageHero
      eyebrow="Listening dashboard"
      title="Pick an audio route before you start decoding."
      copy="This dashboard now stays orchestration-only: current weakness, next track, and where the recovery route should hand off after dictation."
      actions={
        <>
          <Link className="primary-cta" to={toModulePath('/tracks')}>
            Browse tracks
          </Link>
          <Link className="ghost-btn" to={toModulePath('/dictation')}>
            Dictation lab
          </Link>
          <Link className="ghost-btn" to={toModulePath('/review')}>
            Review room
          </Link>
        </>
      }
      aside={
        <>
          <div className="route-chip-row">
            <span className="route-chip">Tracks</span>
            <span className="route-chip">Dictation</span>
            <span className="route-chip">Recovery</span>
          </div>
          <p className="route-muted-copy">
            {hasAccess
              ? 'Live listening work now opens on the dictation route.'
              : 'Browse the full listening route map now. Live dictation unlocks with an active plan.'}
          </p>
        </>
      }
    />

    <div className="route-stat-grid">
      <StatCard label="Weakest pattern" value="Function words" hint="Reduced speech and small grammar words are the current pressure point." />
      <StatCard label="Best next route" value="Dictation lab" hint="Use a controlled replay route instead of another mixed dashboard card." />
      <StatCard label="Transfer target" value="Vocabulary" hint="Missed words should move into retention review after each attempt." />
    </div>

    {!hasAccess ? (
      <AccessBoundaryCard
        hasAccess={false}
        title="Preview-only listening routes"
        message="You can browse tracks, dictation, and recovery pages, but playback and scoring stay locked until your service access is active."
        ctaHref={pricingHref}
      />
    ) : null}
  </SectionGrid>
);

const ListeningTracksPage = ({
  hasAccess,
  pricingHref,
  search,
  accessToken,
  context,
}: {
  hasAccess: boolean;
  pricingHref: string;
  search: string;
  accessToken: string | null;
  context: EnglishRouteContext;
}) => {
  const navigate = useNavigate();
  const params = useParams<{ itemId?: string }>();
  const [items, setItems] = useState<ListeningItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<ListeningItem | null>(null);

  useEffect(() => {
    if (!hasAccess || !accessToken) {
      setItems([]);
      setActiveItem(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    void listListeningItems(accessToken)
      .then((nextItems) => {
        if (cancelled) return;
        setItems(nextItems);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load listening tracks.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess]);

  useEffect(() => {
    if (!hasAccess || !accessToken || !params.itemId) return;
    const existing = items.find((item) => item.id === params.itemId || item.slug === params.itemId);
    if (existing) {
      setActiveItem(existing);
      return;
    }
    let cancelled = false;
    void getListeningItem(accessToken, params.itemId)
      .then((result) => {
        if (cancelled) return;
        setActiveItem(result.item);
      })
      .catch(() => {
        if (cancelled) return;
        setActiveItem(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, items, params.itemId]);

  const previewItems = useMemo(() => {
    const base = items.length > 0
      ? items
      : SERVICE_BLUEPRINT.map((item, index) => ({
          id: item.slug,
          slug: item.slug,
          title: item.title,
          summary: item.detail,
          transcript_text: '',
          level: ['A2', 'B1', 'B2'][index] ?? 'B1',
          category: item.skill,
          accent: ['us', 'uk', 'global'][index] ?? 'global',
          speed_label: ['steady', 'controlled', 'fast'][index] ?? 'steady',
          speed_wpm: 132,
          duration_seconds: 26,
          focus_skill: item.skill,
          tags: [item.intent],
          presentation_meta: {
            scene_label: 'Listening track',
            hero_note: item.detail,
            target_badges: [item.skill, item.intent],
          },
        } satisfies ListeningItem));

    const normalized = search.trim().toLowerCase();
    if (!normalized) return base;
    return base.filter(
      (item) =>
        item.title.toLowerCase().includes(normalized) ||
        item.level.toLowerCase().includes(normalized) ||
        item.category.toLowerCase().includes(normalized),
    );
  }, [items, search]);

  const selectedItem =
    activeItem ??
    previewItems.find((item) => item.id === params.itemId || item.slug === params.itemId) ??
    previewItems[0] ??
    null;
  const presentation = asMetaRecord(selectedItem?.presentation_meta);
  const targetBadges = readMetaList(presentation?.target_badges);

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Listening tracks"
        title="Choose the right clip before you open the dictation lab."
        copy="The track page now owns discovery: accent, speed, clip type, and what kind of listening pressure you are about to practice."
        actions={
          <>
            {selectedItem ? (
              <button
                className="primary-cta"
                type="button"
                onClick={() => navigate(toModulePath(`/dictation/${selectedItem.slug || selectedItem.id}`))}
              >
                Open dictation lab
              </button>
            ) : null}
            <Link className="ghost-btn" to={toModulePath('/dashboard')}>
              Back to dashboard
            </Link>
          </>
        }
      />

      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Preview the listening catalog"
          message="You can inspect the new route structure and track metadata now. Live playback and submission unlock when the service plan is active."
          ctaHref={pricingHref}
        />
      ) : null}

      <div className="route-split-grid">
        <section className="route-list-card">
          <div className="route-list-head">
            <h2>Track queue</h2>
            <span className="route-outline-chip">{previewItems.length} tracks</span>
          </div>
          {loading ? <div className="route-empty-state">Loading listening tracks...</div> : null}
          {error ? <div className="route-empty-state">{error}</div> : null}
          <div className="route-list-stack">
            {previewItems.map((item) => (
              <Link
                key={item.id}
                className={'route-list-item' + (selectedItem?.id === item.id ? ' active' : '')}
                to={toModulePath(`/tracks/${item.slug || item.id}`)}
              >
                <small>{item.level} · {item.accent} · {item.speed_label}</small>
                <strong>{item.title}</strong>
                <p>{item.summary}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="route-stage-card">
          {selectedItem ? (
            <>
              <div className="route-stage-header">
                <div>
                  <small className="route-context-kicker">{readMetaText(presentation?.scene_label) || 'Listening track'}</small>
                  <h2>{selectedItem.title}</h2>
                </div>
                <span className="route-chip">{selectedItem.level}</span>
              </div>
              <p>{readMetaText(presentation?.hero_note) || selectedItem.summary}</p>
              <div className="route-chip-row">
                <span className="route-chip">{selectedItem.category}</span>
                <span className="route-outline-chip">{selectedItem.accent} accent</span>
                <span className="route-outline-chip">{selectedItem.speed_label}</span>
                {targetBadges.map((badge) => (
                  <span key={badge} className="route-outline-chip">
                    {badge}
                  </span>
                ))}
              </div>
              <div className="route-inline-card">
                <div className="route-label-row">
                  <strong>Track profile</strong>
                  <span className="route-outline-chip">{selectedItem.duration_seconds}s</span>
                </div>
                <p>{selectedItem.summary}</p>
              </div>
              <div className="route-cta-row">
                <Link className="primary-cta" to={toModulePath(`/dictation/${selectedItem.slug || selectedItem.id}`)}>
                  {hasAccess ? 'Open dictation lab' : 'Unlock dictation'}
                </Link>
                <Link className="ghost-btn" to={toModulePath('/review')}>
                  Recovery room
                </Link>
              </div>
            </>
          ) : (
            <div className="route-empty-state">Choose a track from the queue to preview the listening route.</div>
          )}
        </section>
      </div>
    </SectionGrid>
  );
};

const ListeningDictationPage = ({
  hasAccess,
  pricingHref,
  accessToken,
  context,
}: {
  hasAccess: boolean;
  pricingHref: string;
  accessToken: string | null;
  context: EnglishRouteContext;
}) => {
  const navigate = useNavigate();
  const params = useParams<{ itemId?: string }>();
  const [item, setItem] = useState<ListeningItem | null>(null);
  const [dictationText, setDictationText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.itemId || !hasAccess || !accessToken) {
      setItem(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getListeningItem(accessToken, params.itemId)
      .then((result) => {
        if (cancelled) return;
        setItem(result.item);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Could not open this listening item.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, params.itemId]);

  const playClip = (slowMode = false): void => {
    if (!item || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(item.transcript_text);
    utterance.lang = 'en-US';
    utterance.rate = slowMode ? 0.8 : item.speed_label === 'fast' ? 1.05 : item.speed_label === 'slow' ? 0.84 : 0.94;
    window.speechSynthesis.speak(utterance);
  };

  const handleSubmit = async (): Promise<void> => {
    if (!item || !accessToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitListeningPractice(accessToken, {
        item_id: item.id,
        response_text: dictationText,
        time_spent_seconds: Math.max(30, Math.round((item.duration_seconds ?? 20) * 2.2)),
        retry_count: 0,
        hint_usage_count: 0,
      });
      const attemptId =
        result && typeof (result as Record<string, unknown>).attempt === 'object'
          ? String(((result as Record<string, unknown>).attempt as Record<string, unknown>).id ?? '')
          : '';
      navigate(toModulePath(attemptId ? `/review/${attemptId}` : '/review'));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not score this dictation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Dictation lab"
        title="Keep listening work on a single-purpose decoding page."
        copy="Playback, dictation, and immediate submission now live here, separate from discovery and recovery."
        actions={
          <>
            <Link className="ghost-btn" to={toModulePath('/tracks')}>
              Back to tracks
            </Link>
            <Link className="ghost-btn" to={toModulePath('/review')}>
              Recovery room
            </Link>
          </>
        }
      />

      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Dictation lab is locked"
          message="The dedicated dictation route is visible now, but playback and scoring unlock when this listening service is active."
          ctaHref={pricingHref}
        />
      ) : null}

      <section className={'route-stage-card' + (!hasAccess ? ' route-disabled' : '')}>
        {loading ? <div className="route-empty-state">Opening listening lab...</div> : null}
        {!loading && error ? <div className="route-empty-state">{error}</div> : null}
        {!loading && !item ? (
          <div className="route-empty-state">
            Choose a listening track first so the dictation lab can focus on one clip at a time.
          </div>
        ) : null}

        {item ? (
          <>
            <div className="route-stage-header">
              <div>
                <small className="route-context-kicker">Live dictation</small>
                <h2>{item.title}</h2>
              </div>
              <span className="route-chip">{item.speed_label}</span>
            </div>
            <p>{item.summary}</p>
            <div className="route-inline-actions">
              <button className="ghost-btn" type="button" onClick={() => playClip(false)}>
                Play clip
              </button>
              <button className="ghost-btn" type="button" onClick={() => playClip(true)}>
                Slow replay
              </button>
            </div>
            <textarea
              className="route-textarea"
              value={dictationText}
              onChange={(event) => setDictationText(event.target.value)}
              placeholder="Type exactly what you hear from the clip..."
            />
            <div className="route-inline-actions">
              <button
                className="primary-cta"
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!hasAccess || !accessToken || !dictationText.trim() || submitting}
              >
                {submitting ? 'Submitting dictation...' : 'Submit dictation'}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </SectionGrid>
  );
};

const ListeningReviewPage = ({
  hasAccess,
  pricingHref,
  accessToken,
  context,
}: {
  hasAccess: boolean;
  pricingHref: string;
  accessToken: string | null;
  context: EnglishRouteContext;
}) => {
  const params = useParams<{ attemptId?: string }>();
  const [feedback, setFeedback] = useState<Record<string, unknown> | null>(null);
  const [attempt, setAttempt] = useState<Record<string, unknown> | null>(null);
  const [item, setItem] = useState<ListeningItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!params.attemptId || !hasAccess || !accessToken) {
      setFeedback(null);
      setAttempt(null);
      setItem(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getLearningAttempt(accessToken, params.attemptId)
      .then(async (result) => {
        if (cancelled) return;
        setAttempt(result.attempt);
        setFeedback(result.feedback ?? null);
        const responseJson = result.attempt.response_json as Record<string, unknown> | undefined;
        const listeningItemId = typeof responseJson?.listening_item_id === 'string' ? responseJson.listening_item_id : '';
        if (listeningItemId) {
          const loadedItem = await getListeningItem(accessToken, listeningItemId);
          if (cancelled) return;
          setItem(loadedItem.item);
        }
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Could not load this listening review.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, params.attemptId]);

  const responseJson = (attempt?.response_json as Record<string, unknown> | undefined) ?? {};
  const missingWords = Array.isArray(responseJson.missing_words)
    ? responseJson.missing_words.map((entry) => String(entry))
    : [];
  const expectedTranscript = typeof responseJson.expected_transcript === 'string' ? responseJson.expected_transcript : '';
  const issues = Array.isArray(feedback?.issues) ? (feedback.issues as Array<Record<string, unknown>>) : [];

  const handleSendMissedWords = async (): Promise<void> => {
    if (!accessToken || missingWords.length === 0 || !expectedTranscript) return;
    const result = await captureNotebookWords(
      accessToken,
      missingWords.map((word) => ({
        word,
        definition: null,
        example: expectedTranscript,
        context_text: expectedTranscript,
        source_type: 'english.listening.review',
        source_label: 'English Listening',
        metadata: {
          seeded_by: 'listening-review',
        },
      })),
    );
    setSyncMessage(`Saved ${result.saved} words to Vocabulary.`);
  };

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Recovery review"
        title="Move missed details onto a page that belongs only to recovery."
        copy="The listening debrief now owns transcript reveal, issue clustering, and vocabulary handoff so the lab stays focused on dictation."
        actions={
          <>
            <Link className="ghost-btn" to={toModulePath(item ? `/dictation/${item.slug || item.id}` : '/dictation')}>
              Back to dictation
            </Link>
            <Link className="ghost-btn" to={toModulePath('/tracks')}>
              Browse tracks
            </Link>
          </>
        }
      />

      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Recovery route is preview-only"
          message="This page shows where transcript review and handoffs will live after a real dictation attempt."
          ctaHref={pricingHref}
        />
      ) : null}

      <div className="route-split-grid">
        <section className="route-debrief-card">
          {loading ? <div className="route-empty-state">Loading listening review...</div> : null}
          {!loading && error ? <div className="route-empty-state">{error}</div> : null}
          {!loading && !attempt ? (
            <div className="route-empty-state">
              Submit a dictation first. The review route will then show transcript recovery, missed words, and next routes.
            </div>
          ) : null}

          {attempt ? (
            <>
              <div className="route-stage-header">
                <div>
                  <small className="route-context-kicker">Latest listening review</small>
                  <h2>{item?.title ?? 'Listening attempt'}</h2>
                </div>
                {item ? <span className="route-chip">{item.speed_label}</span> : null}
              </div>
              <p>{typeof feedback?.summary === 'string' && feedback.summary ? feedback.summary : 'Your listening recovery summary is ready.'}</p>
              <div className="phase2-feedback-card">
                <strong>What you missed</strong>
                {missingWords.length > 0 ? <p>{missingWords.join(', ')}</p> : <p>No missed words were captured in the latest attempt.</p>}
                {issues.length > 0 ? (
                  <ul className="phase2-feedback-list">
                    {issues.map((issue, index) => (
                      <li key={`${String(issue.category ?? 'issue')}-${index}`}>
                        <strong>{String(issue.category ?? 'issue')}</strong>: {String(issue.explanation ?? 'Use one smaller retry route next.')}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {expectedTranscript ? (
                <div className="route-inline-card">
                  <div className="route-label-row">
                    <strong>Transcript reveal</strong>
                    <span className="route-outline-chip">recovery only</span>
                  </div>
                  <p>{expectedTranscript}</p>
                </div>
              ) : null}
              {missingWords.length > 0 ? (
                <div className="route-inline-actions">
                  <button className="primary-cta" type="button" onClick={() => void handleSendMissedWords()}>
                    Send missed words to Vocabulary
                  </button>
                  {syncMessage ? <span className="route-muted-copy">{syncMessage}</span> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="route-summary-card">
          <div className="route-subhead">
            <h2>Next routes</h2>
            <span className="route-outline-chip">transfer next</span>
          </div>
          <div className="route-next-step-grid">
            {REVIEW_HANDOFFS.map((handoff) => (
              <a
                key={handoff.label}
                className="route-next-step-card"
                href={withEnglishRouteContext(handoff.href, {
                  sourceService: 'listening',
                  intent: 'review-followup',
                  skill: 'listening',
                  reason: 'listening-review',
                })}
              >
                <strong>{handoff.label}</strong>
                <p>Leave the recovery room only when the next service route is specific and contextual.</p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </SectionGrid>
  );
};

const ListeningWorkspaceRoutes = ({
  hasAccess,
  pricingHref,
  accessToken,
  search,
}: {
  hasAccess: boolean;
  pricingHref: string;
  accessToken: string | null;
  search: string;
}) => {
  const location = useLocation();
  const context = useMemo(() => readEnglishRouteContext(location.search), [location.search]);

  return (
    <Routes>
      <Route path="dashboard" element={<ListeningDashboardPage hasAccess={hasAccess} pricingHref={pricingHref} context={context} />} />
      <Route
        path="/tracks"
        element={<ListeningTracksPage hasAccess={hasAccess} pricingHref={pricingHref} search={search} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/tracks/:itemId"
        element={<ListeningTracksPage hasAccess={hasAccess} pricingHref={pricingHref} search={search} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/dictation"
        element={<ListeningDictationPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/dictation/:itemId"
        element={<ListeningDictationPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/review"
        element={<ListeningReviewPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/review/:attemptId"
        element={<ListeningReviewPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route path="exercises" element={<Navigate to={toModulePath('/tracks')} replace />} />
      <Route path="*" element={<Navigate to={toModulePath('/dashboard')} replace />} />
    </Routes>
  );
};

const App = () => {
  const location = useLocation();
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [session, setSession] = useState<Session | null>(null);
  const [search, setSearch] = useState('');
  const [profileNameFromDb, setProfileNameFromDb] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('idle');
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setStatus(data.session ? 'signed_in' : 'signed_out');
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? 'signed_in' : 'signed_out');
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveAccess = async () => {
      if (status !== 'signed_in' || !session?.access_token) {
        setAccessStatus('idle');
        setAccessError(null);
        return;
      }

      setAccessStatus('checking');
      setAccessError(null);

      try {
        const me = await getMe(session.access_token);
        if (cancelled) return;
        const entitlement =
          me.entitlements.find(
            (entry) => hasActiveProductEntitlement(entry, LISTENING_PRODUCT_ID, LISTENING_PRODUCT_SLUG),
          ) ?? null;
        setAccessStatus(entitlement ? 'granted' : 'denied');
      } catch (error) {
        if (cancelled) return;
        const statusCode = (error as { status?: number } | null)?.status ?? null;
        if (statusCode === 401 || statusCode === 403) {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {
            // ignore sign-out failures
          }
          setAccessStatus('idle');
          return;
        }
        setAccessStatus('denied');
        setAccessError('Could not verify your listening access right now.');
      }
    };

    void resolveAccess();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, status]);

  useEffect(() => {
    let cancelled = false;
    const loadProfileName = async () => {
      if (status !== 'signed_in' || !session?.user.id) {
        setProfileNameFromDb(null);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('first_name,last_name')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (cancelled || error || !data) {
          if (!cancelled) setProfileNameFromDb(null);
          return;
        }
        const row = data as Record<string, unknown>;
        setProfileNameFromDb(`${readMetaText(row.first_name)} ${readMetaText(row.last_name)}`.trim() || null);
      } catch {
        if (!cancelled) setProfileNameFromDb(null);
      }
    };
    void loadProfileName();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id, status]);

  const returnTo = resolveReturnTo();
  const signInHref = useMemo(
    () => `${buildPlatformUrl('/auth?mode=signin')}&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );
  const pricingHref = useMemo(
    () => `${buildPlatformUrl(`/pricing?product=${LISTENING_PRODUCT_SLUG}`)}&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );
  const platformWorkspaceHref = useMemo(() => buildPlatformUrl('/student-center'), []);
  const hasAccess = status === 'signed_in' && accessStatus === 'granted';
  const needsAccess = status === 'signed_in' && accessStatus === 'denied';
  const checkingAccess = status === 'signed_in' && accessStatus === 'checking';
  const profileName = useMemo(() => profileNameFromDb ?? resolveProfileName(session), [profileNameFromDb, session]);
  void profileName;

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
  };

  if (status === 'signed_out' || isModulePath(location.pathname, '/')) {
    return (
      <Routes>
        <Route
          path="/"
          element={
            <SignedOutLanding
              signInHref={signInHref}
              pricingHref={pricingHref}
              platformWorkspaceHref={platformWorkspaceHref}
              isSignedIn={status === 'signed_in'}
            />
          }
        />
        <Route path="*" element={<Navigate to={toModulePath(status === 'signed_in' ? '/dashboard' : '/')} replace />} />
      </Routes>
    );
  }

  const menuItems = [
    { label: 'Dashboard', href: toModulePath('/dashboard'), active: isModulePath(location.pathname, '/dashboard') },
    { label: 'Tracks', href: toModulePath('/tracks'), active: isModulePathPrefix(location.pathname, '/tracks') },
    { label: 'Dictation lab', href: toModulePath('/dictation'), active: isModulePathPrefix(location.pathname, '/dictation') },
    { label: 'Review room', href: toModulePath('/review'), active: isModulePathPrefix(location.pathname, '/review') },
  ];

  return (
    <EnglishSkillWorkspace
      serviceName={SERVICE_LABEL}
      serviceTagline="English Listening service - route-based track, dictation, and recovery workflow."
      menuItems={menuItems}
      serviceSwitchLinks={SERVICE_SWITCH_LINKS}
      hubHref={ENGLISH_HUB_URL}
      platformHref={platformWorkspaceHref}
      pricingHref={pricingHref}
      signInHref={signInHref}
      status={status}
      needsAccess={needsAccess}
      checkingAccess={checkingAccess}
      accessError={accessError}
      search={search}
      onSearchChange={setSearch}
      onSignOut={() => {
        void handleSignOut();
      }}
      upgradeTitle="Premium Listening Pack"
      upgradeCopy="Unlock live track routes, dictation scoring, and recovery handoffs into Vocabulary and Speaking."
      updatesHref={buildPlatformUrl('/updates')}
    >
      <ListeningWorkspaceRoutes
        hasAccess={hasAccess}
        pricingHref={pricingHref}
        accessToken={session?.access_token ?? null}
        search={search}
      />
    </EnglishSkillWorkspace>
  );
};

export default App;
