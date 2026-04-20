import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import '../../english-shared/src/english-routes.css';
import {
  AccessBoundaryCard,
  EnglishSkillWorkspace,
  PageHero,
  RouteContextRibbon,
  SectionGrid,
  StatCard,
} from '../../english-shared/src/ui';
import {
  readEnglishRouteContext,
  withEnglishRouteContext,
  type EnglishRouteContext,
} from '../../english-shared/src/routeContext';
import { platformUrl, supabase } from './lib/supabase';
import { getMe } from './lib/platformClient';
import {
  captureNotebookWords,
  getNotebookSnapshot,
  reviewNotebookCard,
  type NotebookCard,
} from './lib/vocabularyNotebookClient';

type SessionStatus = 'checking' | 'signed_in' | 'signed_out';
type AccessStatus = 'checking' | 'granted' | 'denied' | 'idle';

const VOCABULARY_PRODUCT_ID =
  ((import.meta.env.VITE_VOCABULARY_PRODUCT_ID as string | undefined) ?? '').trim() ||
  'b1c98e87-84d3-4ddc-8f07-c72bcf7a716a';
const VOCABULARY_PRODUCT_SLUG = 'english-vocabulary';
const SERVICE_LABEL = 'English Vocabulary';
const ENGLISH_HUB_URL = 'https://english.schood.online';

const ENGLISH_SERVICE_LINKS = [
  { key: 'reading', label: 'Reading', href: 'https://reading.english.schood.online' },
  { key: 'writing', label: 'Writing', href: 'https://writing.english.schood.online' },
  { key: 'listening', label: 'Listening', href: 'https://listening.english.schood.online' },
  { key: 'speaking', label: 'Speaking', href: 'https://speaking.english.schood.online' },
  { key: 'grammar', label: 'Grammar', href: 'https://grammar.english.schood.online' },
  { key: 'vocabulary', label: 'Vocabulary', href: 'https://vocabulary.english.schood.online' },
  { key: 'immersion', label: 'Immersion', href: 'https://immersion.english.schood.online' },
] as const;

const SERVICE_SWITCH_LINKS = ENGLISH_SERVICE_LINKS.filter((service) => service.key !== 'vocabulary');

const REVIEW_HANDOFFS = [
  { label: 'Use saved words in Speaking', href: 'https://speaking.english.schood.online/studio' },
  { label: 'Use saved words in Writing', href: 'https://writing.english.schood.online/briefs' },
  { label: 'Recycle them in Reading', href: 'https://reading.english.schood.online/library' },
] as const;

const buildPlatformUrl = (pathname: string): string => `${platformUrl.replace(/\/$/, '')}${pathname}`;
const readMetaText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const resolveProfileName = (session: Session | null): string | null => {
  if (!session) return null;
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = readMetaText(meta.full_name);
  if (fullName) return fullName;
  return `${readMetaText(meta.first_name)} ${readMetaText(meta.last_name)}`.trim() || null;
};

const resolveReturnTo = (): string => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
};

const formatReviewTime = (value: string | null): string => {
  if (!value) return 'Not scheduled';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
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
        <Link className="landing-brand" to="/">
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
            <Link className="icon-btn" to="/dashboard">
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
              <strong>Notebook</strong>
              <span className="landing-arrow">{'->'}</span>
            </div>
            <p>Review before activation</p>
            <small>one vocabulary job per page</small>
          </article>
          <article className="landing-card landing-team tilt-right">
            <span className="landing-pill">Memory conservatory</span>
            <h3>Cleaner lexical flow</h3>
            <p>Separate notebook browsing, due review, activation pressure, and history into dedicated routes.</p>
          </article>
          <article className="landing-card landing-offer tilt-right">
            <h3>Premium vocabulary routes</h3>
            <p className="landing-price">
              12$ <span>35$</span>
            </p>
            <div className="landing-ticket">
              <div className="landing-ticket-row">
                <small>Review</small>
                <small>History</small>
              </div>
              <strong>Collect {'->'} review {'->'} activate</strong>
              <small>memory with direction</small>
            </div>
          </article>
          <article className="landing-card landing-showcase tilt-left">
            <div className="landing-orb" aria-hidden />
            <h3>Cross-service activation</h3>
            <p>Vocabulary routes now point directly back into Speaking, Writing, and Reading when words are ready to use.</p>
          </article>
        </div>
        <article className="landing-copy card">
          <div className="landing-chip">{SERVICE_LABEL}</div>
          <h2>Vocabulary now behaves like a memory system instead of one crowded notebook page.</h2>
          <p>Browse the notebook, review due cards, push words into activation, and inspect history on separate routes.</p>
          <div className="landing-cta-row">
            <a className="primary-cta" href={isSignedIn ? '/dashboard' : signInHref}>
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

const useNotebookState = (hasAccess: boolean, accessToken: string | null) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewingCardId, setReviewingCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [dailyCards, setDailyCards] = useState<NotebookCard[]>([]);
  const [recentCards, setRecentCards] = useState<NotebookCard[]>([]);
  const [draftWord, setDraftWord] = useState('');
  const [draftDefinition, setDraftDefinition] = useState('');
  const [draftExample, setDraftExample] = useState('');

  const refresh = async (): Promise<void> => {
    if (!hasAccess || !accessToken) {
      setDailyCards([]);
      setRecentCards([]);
      setDueCount(0);
      setTotalCount(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [dailySnapshot, recentSnapshot] = await Promise.all([
        getNotebookSnapshot(accessToken, 'daily', 10),
        getNotebookSnapshot(accessToken, 'recent', 12),
      ]);
      setDailyCards(dailySnapshot.cards ?? []);
      setRecentCards(recentSnapshot.cards ?? []);
      setDueCount(Number(dailySnapshot.summary?.due_count ?? 0));
      setTotalCount(Number(dailySnapshot.summary?.total_count ?? 0));
    } catch {
      setError('Could not load your vocabulary notebook right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [accessToken, hasAccess]);

  const capture = async (): Promise<void> => {
    if (!accessToken || !draftWord.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await captureNotebookWords(accessToken, [
        {
          word: draftWord.trim(),
          definition: draftDefinition.trim() || null,
          example: draftExample.trim() || null,
          context_text: draftExample.trim() || null,
          source_type: 'english.vocabulary.manual',
          source_label: 'English Vocabulary',
        },
      ]);
      setDraftWord('');
      setDraftDefinition('');
      setDraftExample('');
      await refresh();
    } catch {
      setError('Could not save this word. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const review = async (entryId: string, outcome: 'correct' | 'incorrect'): Promise<void> => {
    if (!accessToken) return;
    setReviewingCardId(entryId);
    setError(null);
    try {
      await reviewNotebookCard(accessToken, entryId, outcome);
      await refresh();
    } catch {
      setError('Could not update this review card right now.');
    } finally {
      setReviewingCardId(null);
    }
  };

  return {
    loading,
    saving,
    reviewingCardId,
    error,
    dueCount,
    totalCount,
    dailyCards,
    recentCards,
    draftWord,
    draftDefinition,
    draftExample,
    setDraftWord,
    setDraftDefinition,
    setDraftExample,
    refresh,
    capture,
    review,
  };
};

const VocabularyDashboardPage = ({
  hasAccess,
  pricingHref,
  context,
  dueCount,
  totalCount,
}: {
  hasAccess: boolean;
  pricingHref: string;
  context: EnglishRouteContext;
  dueCount: number;
  totalCount: number;
}) => (
  <SectionGrid>
    <RouteContextRibbon
      context={context}
      cta={
        <Link className="ghost-btn" to="/review">
          Open due review
        </Link>
      }
    />
    <PageHero
      eyebrow="Vocabulary dashboard"
      title="See what your memory system needs before you open the cards."
      copy="The dashboard now stays orchestration-only: review pressure, activation pressure, and where the next real-use handoff should go."
      actions={
        <>
          <Link className="primary-cta" to="/review">
            Due review
          </Link>
          <Link className="ghost-btn" to="/activation">
            Activation lane
          </Link>
          <Link className="ghost-btn" to="/history">
            Review history
          </Link>
        </>
      }
      aside={
        <>
          <div className="route-chip-row">
            <span className="route-chip">Notebook</span>
            <span className="route-chip">Review</span>
            <span className="route-chip">Activation</span>
            <span className="route-chip">History</span>
          </div>
          <p className="route-muted-copy">
            {hasAccess ? 'Your live Leitner review now opens on a dedicated review route.' : 'Browse the notebook structure now. Live review unlocks with plan access.'}
          </p>
        </>
      }
    />
    <div className="route-stat-grid">
      <StatCard label="Due now" value={String(dueCount)} hint="Cards waiting on the review route instead of being buried inside one mixed page." />
      <StatCard label="Notebook size" value={String(totalCount)} hint="Your shared English vocabulary memory lives behind the notebook route." />
      <StatCard label="Next payoff" value="Activation" hint="Words should leave review and enter a productive route next, not stay as flashcards forever." />
    </div>
    {!hasAccess ? (
      <AccessBoundaryCard
        hasAccess={false}
        title="Preview-only vocabulary routes"
        message="You can browse notebook, review, activation, and history routes now. Live save/review actions unlock with an active plan."
        ctaHref={pricingHref}
      />
    ) : null}
  </SectionGrid>
);

const NotebookPage = ({
  hasAccess,
  pricingHref,
  context,
  notebook,
}: {
  hasAccess: boolean;
  pricingHref: string;
  context: EnglishRouteContext;
  notebook: ReturnType<typeof useNotebookState>;
}) => (
  <SectionGrid>
    <RouteContextRibbon context={context} />
    <PageHero
      eyebrow="Notebook"
      title="Browse your English notebook on a page that belongs only to collection."
      copy="This route owns manual capture and notebook browsing. Due review and history now have their own pages."
      actions={
        <>
          <Link className="primary-cta" to="/review">
            Open due review
          </Link>
          <Link className="ghost-btn" to="/history">
            History
          </Link>
        </>
      }
    />
    {!hasAccess ? (
      <AccessBoundaryCard
        hasAccess={false}
        title="Notebook route is preview-only"
        message="Preview the notebook structure now. Live capture and review unlock with plan access."
        ctaHref={pricingHref}
      />
    ) : null}
    <section className={'route-stage-card' + (!hasAccess ? ' route-disabled' : '')}>
      <div className="route-inline-card">
        <div className="route-label-row">
          <strong>Manual capture</strong>
          <span className="route-outline-chip">{notebook.totalCount} saved</span>
        </div>
        <input
          className="route-input"
          value={notebook.draftWord}
          onChange={(event) => notebook.setDraftWord(event.target.value)}
          placeholder="Save a word from reading, listening, or immersion..."
        />
        <input
          className="route-input"
          value={notebook.draftDefinition}
          onChange={(event) => notebook.setDraftDefinition(event.target.value)}
          placeholder="Definition (optional)"
        />
        <input
          className="route-input"
          value={notebook.draftExample}
          onChange={(event) => notebook.setDraftExample(event.target.value)}
          placeholder="Example sentence (optional)"
        />
        <div className="route-inline-actions">
          <button className="primary-cta" type="button" onClick={() => void notebook.capture()} disabled={notebook.saving}>
            {notebook.saving ? 'Saving...' : 'Save to notebook'}
          </button>
        </div>
      </div>
      {notebook.error ? <div className="route-empty-state">{notebook.error}</div> : null}
      <div className="route-card-stack">
        {notebook.recentCards.map((card) => (
          <article key={card.id} className="route-inline-card">
            <div className="route-label-row">
              <strong>{card.word}</strong>
              <span className="route-outline-chip">{card.source_label || card.source_type || 'manual'}</span>
            </div>
            {card.definition ? <p>{card.definition}</p> : null}
            {card.example ? <p>{card.example}</p> : null}
          </article>
        ))}
      </div>
    </section>
  </SectionGrid>
);

const ReviewPage = ({
  hasAccess,
  pricingHref,
  context,
  notebook,
}: {
  hasAccess: boolean;
  pricingHref: string;
  context: EnglishRouteContext;
  notebook: ReturnType<typeof useNotebookState>;
}) => (
  <SectionGrid>
    <RouteContextRibbon context={context} />
    <PageHero
      eyebrow="Due review"
      title="Keep daily card review on a page that belongs only to recall."
      copy="The review route now owns the Leitner loop. Capture and history live somewhere else so recall stays focused."
      actions={
        <>
          <Link className="ghost-btn" to="/notebook">
            Back to notebook
          </Link>
          <Link className="ghost-btn" to="/activation">
            Activation lane
          </Link>
        </>
      }
    />
    {!hasAccess ? (
      <AccessBoundaryCard
        hasAccess={false}
        title="Review route is preview-only"
        message="Preview the daily review structure now. Live Leitner actions unlock with plan access."
        ctaHref={pricingHref}
      />
    ) : null}
    <section className={'route-stage-card' + (!hasAccess ? ' route-disabled' : '')}>
      {notebook.loading ? <div className="route-empty-state">Loading daily review cards...</div> : null}
      {!notebook.loading && notebook.dailyCards.length === 0 ? (
        <div className="route-empty-state">No due cards right now. Capture more words or come back later today.</div>
      ) : null}
      <div className="route-card-stack">
        {notebook.dailyCards.map((card) => (
          <article key={card.id} className="route-inline-card">
            <div className="route-label-row">
              <strong>{card.word}</strong>
              <span className="route-outline-chip">Box {card.leitner_box}</span>
            </div>
            {card.definition ? <p>{card.definition}</p> : null}
            {card.example ? <p>{card.example}</p> : null}
            <p className="route-muted-copy">Next review: {formatReviewTime(card.next_review_at)}</p>
            <div className="route-inline-actions">
              <button
                className="ghost-btn"
                type="button"
                onClick={() => void notebook.review(card.id, 'incorrect')}
                disabled={notebook.reviewingCardId === card.id}
              >
                Again
              </button>
              <button
                className="primary-cta"
                type="button"
                onClick={() => void notebook.review(card.id, 'correct')}
                disabled={notebook.reviewingCardId === card.id}
              >
                I remembered
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  </SectionGrid>
);

const ActivationPage = ({
  hasAccess,
  pricingHref,
  context,
  notebook,
}: {
  hasAccess: boolean;
  pricingHref: string;
  context: EnglishRouteContext;
  notebook: ReturnType<typeof useNotebookState>;
}) => (
  <SectionGrid>
    <RouteContextRibbon context={context} />
    <PageHero
      eyebrow="Activation lane"
      title="See which saved words are ready to leave the notebook."
      copy="This route turns retention into real use by surfacing activation targets and sending words back into productive services."
      actions={
        <>
          <Link className="ghost-btn" to="/review">
            Back to review
          </Link>
          <Link className="ghost-btn" to="/history">
            History
          </Link>
        </>
      }
    />
    {!hasAccess ? (
      <AccessBoundaryCard
        hasAccess={false}
        title="Activation route is preview-only"
        message="Preview which words will leave the notebook next. Live review and saving unlock with plan access."
        ctaHref={pricingHref}
      />
    ) : null}

    <div className="route-split-grid">
      <section className="route-debrief-card">
        <div className="route-subhead">
          <h2>Activation pressure</h2>
          <span className="route-outline-chip">{notebook.recentCards.length} recent cards</span>
        </div>
        <div className="route-card-stack">
          {notebook.recentCards.map((card) => (
            <article key={`${card.id}-activation`} className="route-inline-card">
              <div className="route-label-row">
                <strong>{card.word}</strong>
                <span className="route-outline-chip">{card.source_label || card.source_type || 'manual'}</span>
              </div>
              {Array.isArray(card.activation_targets) && card.activation_targets.length > 0 ? (
                <p>Next use: {card.activation_targets.join(', ')}</p>
              ) : (
                <p>Needs a productive route next.</p>
              )}
              {card.pronunciation_hint ? <p className="route-muted-copy">{card.pronunciation_hint}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="route-summary-card">
        <div className="route-subhead">
          <h2>Use next</h2>
          <span className="route-outline-chip">handoff</span>
        </div>
        <div className="route-next-step-grid">
          {REVIEW_HANDOFFS.map((handoff) => (
            <a
              key={handoff.label}
              className="route-next-step-card"
              href={withEnglishRouteContext(handoff.href, {
                sourceService: 'vocabulary',
                intent: 'activation-use',
                skill: 'vocabulary',
                reason: 'vocabulary-activation',
              })}
            >
              <strong>{handoff.label}</strong>
              <p>Use the current vocabulary pressure in a real output or input route next.</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  </SectionGrid>
);

const HistoryPage = ({
  hasAccess,
  pricingHref,
  context,
  notebook,
}: {
  hasAccess: boolean;
  pricingHref: string;
  context: EnglishRouteContext;
  notebook: ReturnType<typeof useNotebookState>;
}) => (
  <SectionGrid>
    <RouteContextRibbon context={context} />
    <PageHero
      eyebrow="History"
      title="See recent vocabulary movement on a page that belongs only to history."
      copy="The history route now keeps recent captures and review motion out of the due-card experience."
      actions={
        <>
          <Link className="ghost-btn" to="/notebook">
            Notebook
          </Link>
          <Link className="ghost-btn" to="/activation">
            Activation lane
          </Link>
        </>
      }
    />
    {!hasAccess ? (
      <AccessBoundaryCard
        hasAccess={false}
        title="History route is preview-only"
        message="Preview recent notebook movement now. Live review history grows when the service is active."
        ctaHref={pricingHref}
      />
    ) : null}
    <section className="route-stage-card">
      {notebook.loading ? <div className="route-empty-state">Loading notebook history...</div> : null}
      {!notebook.loading && notebook.recentCards.length === 0 ? (
        <div className="route-empty-state">No recent activity yet. Capture words or finish a review cycle first.</div>
      ) : null}
      <div className="route-card-stack">
        {notebook.recentCards.map((card) => (
          <article key={`${card.id}-history`} className="route-inline-card">
            <div className="route-label-row">
              <strong>{card.word}</strong>
              <span className="route-outline-chip">{card.review_count} reviews</span>
            </div>
            <p className="route-muted-copy">
              Correct: {card.correct_count} · Incorrect: {card.incorrect_count} · Updated: {formatReviewTime(card.updated_at)}
            </p>
            {card.definition ? <p>{card.definition}</p> : null}
          </article>
        ))}
      </div>
    </section>
  </SectionGrid>
);

const VocabularyWorkspaceRoutes = ({
  hasAccess,
  pricingHref,
  notebook,
}: {
  hasAccess: boolean;
  pricingHref: string;
  notebook: ReturnType<typeof useNotebookState>;
}) => {
  const location = useLocation();
  const context = useMemo(() => readEnglishRouteContext(location.search), [location.search]);

  return (
    <Routes>
      <Route
        path="/dashboard"
        element={<VocabularyDashboardPage hasAccess={hasAccess} pricingHref={pricingHref} context={context} dueCount={notebook.dueCount} totalCount={notebook.totalCount} />}
      />
      <Route path="/notebook" element={<NotebookPage hasAccess={hasAccess} pricingHref={pricingHref} context={context} notebook={notebook} />} />
      <Route path="/review" element={<ReviewPage hasAccess={hasAccess} pricingHref={pricingHref} context={context} notebook={notebook} />} />
      <Route path="/activation" element={<ActivationPage hasAccess={hasAccess} pricingHref={pricingHref} context={context} notebook={notebook} />} />
      <Route path="/history" element={<HistoryPage hasAccess={hasAccess} pricingHref={pricingHref} context={context} notebook={notebook} />} />
      <Route path="/exercises" element={<Navigate to="/review" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
            (entry) => entry.resource_type === 'product' && entry.resource_id === VOCABULARY_PRODUCT_ID,
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
        setAccessError('Could not verify your vocabulary access right now.');
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
    () => `${buildPlatformUrl(`/pricing?product=${VOCABULARY_PRODUCT_SLUG}`)}&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );
  const platformWorkspaceHref = useMemo(() => buildPlatformUrl('/workspace/student'), []);
  const hasAccess = status === 'signed_in' && accessStatus === 'granted';
  const needsAccess = status === 'signed_in' && accessStatus === 'denied';
  const checkingAccess = status === 'signed_in' && accessStatus === 'checking';
  const profileName = useMemo(() => profileNameFromDb ?? resolveProfileName(session), [profileNameFromDb, session]);
  void profileName;

  const notebook = useNotebookState(hasAccess, session?.access_token ?? null);

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
  };

  if (status === 'signed_out' || location.pathname === '/') {
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
        <Route path="*" element={<Navigate to={status === 'signed_in' ? '/dashboard' : '/'} replace />} />
      </Routes>
    );
  }

  const menuItems = [
    { label: 'Dashboard', href: '/dashboard', active: location.pathname === '/dashboard' },
    { label: 'Notebook', href: '/notebook', active: location.pathname.startsWith('/notebook') },
    { label: 'Review', href: '/review', active: location.pathname.startsWith('/review') },
    { label: 'Activation', href: '/activation', active: location.pathname.startsWith('/activation') },
    { label: 'History', href: '/history', active: location.pathname.startsWith('/history') },
  ];

  return (
    <EnglishSkillWorkspace
      serviceName={SERVICE_LABEL}
      serviceTagline="English Vocabulary service - route-based notebook, review, activation, and history workflow."
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
      upgradeTitle="Premium Vocabulary Pack"
      upgradeCopy="Unlock route-based review, activation pressure, and history views across your shared English notebook."
      updatesHref={buildPlatformUrl('/updates')}
    >
      <VocabularyWorkspaceRoutes hasAccess={hasAccess} pricingHref={pricingHref} notebook={notebook} />
    </EnglishSkillWorkspace>
  );
};

export default App;
