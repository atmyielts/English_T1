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
import {
  getSpeakingPrompt,
  listSpeakingPrompts,
  submitSpeakingPractice,
  type SpeakingPrompt,
} from './lib/speakingStudioClient';
import { getLearningAttempt } from './lib/learningAttemptClient';

type SessionStatus = 'checking' | 'signed_in' | 'signed_out';
type AccessStatus = 'checking' | 'granted' | 'denied' | 'idle';

const SPEAKING_PRODUCT_ID =
  ((import.meta.env.VITE_SPEAKING_PRODUCT_ID as string | undefined) ?? '').trim() ||
  '94ac6f14-15f3-4f35-a8a2-01f5aaecf66d';
const SPEAKING_PRODUCT_SLUG = 'english-speaking';
const SERVICE_LABEL = 'English Speaking';
const ENGLISH_HUB_URL = '/';
const MODULE_BASE_PATH = '/speaking';

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

const SERVICE_SWITCH_LINKS = ENGLISH_SERVICE_LINKS.filter((service) => service.key !== 'speaking');

const SERVICE_BLUEPRINT = [
  {
    slug: 'guided-response',
    title: 'Prompt routes',
    detail: 'Choose the right speaking prompt before you open the live response stage.',
    intent: 'guided-speaking',
    skill: 'fluency',
  },
  {
    slug: 'shadowing-route',
    title: 'Shadowing route',
    detail: 'Use a dedicated rhythm page instead of mixing shadowing into the general speaking board.',
    intent: 'shadowing',
    skill: 'timing',
  },
  {
    slug: 'coaching-replay',
    title: 'Coaching replay',
    detail: 'Keep transcript review and next-step handoffs on a separate speaking debrief page.',
    intent: 'review',
    skill: 'response-quality',
  },
] as const;

const REVIEW_HANDOFFS = [
  { label: 'Repair grammar in Grammar', href: '/grammar/repair-queue' },
  { label: 'Activate stronger words in Vocabulary', href: '/vocabulary/activation' },
  { label: 'Transfer response structure in Writing', href: '/writing/briefs' },
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
  return `${readMetaText(meta.first_name)} ${readMetaText(meta.last_name)}`.trim() || null;
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
              <strong>Stage</strong>
              <span className="landing-arrow">{'->'}</span>
            </div>
            <p>Prompt first, response second</p>
            <small>one speaking action per page</small>
          </article>
          <article className="landing-card landing-team tilt-right">
            <span className="landing-pill">Coaching booth</span>
            <h3>Cleaner speaking flow</h3>
            <p>Separate prompt discovery, live response, shadowing, and review into focused routes.</p>
          </article>
          <article className="landing-card landing-offer tilt-right">
            <h3>Premium speaking routes</h3>
            <p className="landing-price">
              12$ <span>35$</span>
            </p>
            <div className="landing-ticket">
              <div className="landing-ticket-row">
                <small>Prompt</small>
                <small>Review</small>
              </div>
              <strong>Choose {'->'} respond {'->'} replay</strong>
              <small>task ownership by route</small>
            </div>
          </article>
          <article className="landing-card landing-showcase tilt-left">
            <div className="landing-orb" aria-hidden />
            <h3>Cross-service coaching</h3>
            <p>Speaking reviews now hand off directly into Grammar, Vocabulary, and Writing routes.</p>
          </article>
        </div>
        <article className="landing-copy card">
          <div className="landing-chip">{SERVICE_LABEL}</div>
          <h2>Speaking now behaves like a studio instead of a single crowded pane.</h2>
          <p>Choose a prompt, perform on a dedicated response page, and step into a separate coaching replay route afterward.</p>
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

const SpeakingDashboardPage = ({
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
        <Link className="ghost-btn" to={toModulePath('/studio')}>
          Open speaking studio
        </Link>
      }
    />
    <PageHero
      eyebrow="Speaking dashboard"
      title="Choose a speaking mode before you step onto the stage."
      copy="The dashboard now handles orchestration only: next prompt, current fluency pressure, and which downstream route should receive the correction work."
      actions={
        <>
          <Link className="primary-cta" to={toModulePath('/studio')}>
            Open studio
          </Link>
          <Link className="ghost-btn" to={toModulePath('/shadowing')}>
            Shadowing route
          </Link>
          <Link className="ghost-btn" to={toModulePath('/review')}>
            Coaching replay
          </Link>
        </>
      }
      aside={
        <>
          <div className="route-chip-row">
            <span className="route-chip">Studio</span>
            <span className="route-chip">Shadowing</span>
            <span className="route-chip">Review</span>
          </div>
          <p className="route-muted-copy">
            {hasAccess ? 'Live response capture opens on the prompt route.' : 'Browse the route architecture now. Live speaking unlocks with an active plan.'}
          </p>
        </>
      }
    />
    <div className="route-stat-grid">
      <StatCard label="Speaking pressure" value="Fluency" hint="Response flow and filler control are the current priority." />
      <StatCard label="Best next route" value="Prompt stage" hint="Choose the right speaking task before you open the response page." />
      <StatCard label="Transfer target" value="Grammar" hint="Sentence issues should leave the replay page and enter the repair queue." />
    </div>
    {!hasAccess ? (
      <AccessBoundaryCard
        hasAccess={false}
        title="Preview-only speaking routes"
        message="You can browse studio, shadowing, and coaching replay pages now. Live response submission unlocks with plan access."
        ctaHref={pricingHref}
      />
    ) : null}
  </SectionGrid>
);

const SpeakingStudioPage = ({
  hasAccess,
  pricingHref,
  search,
  accessToken,
  context,
  shadowingMode,
}: {
  hasAccess: boolean;
  pricingHref: string;
  search: string;
  accessToken: string | null;
  context: EnglishRouteContext;
  shadowingMode: boolean;
}) => {
  const navigate = useNavigate();
  const params = useParams<{ promptId?: string }>();
  const [prompts, setPrompts] = useState<SpeakingPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<SpeakingPrompt | null>(null);
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hasAccess || !accessToken) {
      setPrompts([]);
      setActivePrompt(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listSpeakingPrompts(accessToken)
      .then((items) => {
        if (cancelled) return;
        setPrompts(items);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load speaking prompts.');
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
    if (!hasAccess || !accessToken || !params.promptId) return;
    const existing = prompts.find((prompt) => prompt.id === params.promptId || prompt.slug === params.promptId);
    if (existing) {
      setActivePrompt(existing);
      return;
    }
    let cancelled = false;
    void getSpeakingPrompt(accessToken, params.promptId)
      .then((result) => {
        if (cancelled) return;
        setActivePrompt(result.prompt);
      })
      .catch(() => {
        if (cancelled) return;
        setActivePrompt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, params.promptId, prompts]);

  const previewPrompts = useMemo(() => {
    const base = prompts.length > 0
      ? prompts
      : SERVICE_BLUEPRINT.map((item, index) => ({
          id: item.slug,
          slug: item.slug,
          title: item.title,
          prompt_text: item.detail,
          prompt_type: item.intent,
          level: ['A2', 'B1', 'B2'][index] ?? 'B1',
          target_duration_seconds: 45,
          target_grammar: item.skill,
          target_vocabulary: [],
          fluency_objective: item.detail,
          pronunciation_objective: shadowingMode ? 'Pacing and chunking' : 'Clear response delivery',
          cue_points: [],
          presentation_meta: {
            scene_label: shadowingMode ? 'Shadowing route' : 'Speaking prompt',
            hero_note: item.detail,
            target_badges: [item.skill, item.intent],
          },
        } satisfies SpeakingPrompt));
    const normalized = search.trim().toLowerCase();
    if (!normalized) return base;
    return base.filter(
      (prompt) =>
        prompt.title.toLowerCase().includes(normalized) ||
        prompt.level.toLowerCase().includes(normalized) ||
        prompt.prompt_type.toLowerCase().includes(normalized),
    );
  }, [prompts, search, shadowingMode]);

  const selectedPrompt =
    activePrompt ??
    previewPrompts.find((prompt) => prompt.id === params.promptId || prompt.slug === params.promptId) ??
    previewPrompts[0] ??
    null;
  const presentation = asMetaRecord(selectedPrompt?.presentation_meta);
  const badges = readMetaList(presentation?.target_badges);

  const handleSubmit = async (): Promise<void> => {
    if (!selectedPrompt || !accessToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitSpeakingPractice(accessToken, {
        prompt_id: selectedPrompt.id,
        response_text: responseText,
        time_spent_seconds: Math.max(30, responseText.trim().split(/\s+/).filter(Boolean).length * 3),
        retry_count: 0,
        hint_usage_count: shadowingMode ? 1 : 0,
        transcript_source: 'manual',
      });
      const attemptId =
        result && typeof (result as Record<string, unknown>).attempt === 'object'
          ? String(((result as Record<string, unknown>).attempt as Record<string, unknown>).id ?? '')
          : '';
      navigate(toModulePath(attemptId ? `/review/${attemptId}` : '/review'));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not score this speaking response.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow={shadowingMode ? 'Shadowing route' : 'Speaking studio'}
        title={shadowingMode ? 'Keep rhythm work on its own route.' : 'Choose a prompt before you open the live response stage.'}
        copy={shadowingMode
          ? 'Shadowing and pacing now live on a distinct route instead of crowding the main speaking dashboard.'
          : 'The studio route owns prompt discovery and response launch, so learners arrive on stage with one clear task.'}
        actions={
          <>
            <Link className="ghost-btn" to={toModulePath('/dashboard')}>
              Back to dashboard
            </Link>
            <Link className="ghost-btn" to={toModulePath('/review')}>
              Coaching replay
            </Link>
          </>
        }
      />

      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title={shadowingMode ? 'Shadowing route is locked' : 'Studio route is locked'}
          message="The route structure is visible now, but live speaking submission unlocks when the speaking service is active."
          ctaHref={pricingHref}
        />
      ) : null}

      <div className="route-split-grid">
        <section className="route-list-card">
          <div className="route-list-head">
            <h2>{shadowingMode ? 'Shadowing prompts' : 'Prompt queue'}</h2>
            <span className="route-outline-chip">{previewPrompts.length} prompts</span>
          </div>
          {loading ? <div className="route-empty-state">Loading speaking prompts...</div> : null}
          {error ? <div className="route-empty-state">{error}</div> : null}
          <div className="route-list-stack">
            {previewPrompts.map((prompt) => (
              <Link
                key={prompt.id}
                className={'route-list-item' + (selectedPrompt?.id === prompt.id ? ' active' : '')}
                to={toModulePath(`${shadowingMode ? '/shadowing' : '/prompts'}/${prompt.slug || prompt.id}`)}
              >
                <small>{prompt.level} · {prompt.prompt_type}</small>
                <strong>{prompt.title}</strong>
                <p>{prompt.fluency_objective ?? prompt.prompt_text}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className={'route-stage-card' + (!hasAccess ? ' route-disabled' : '')}>
          {selectedPrompt ? (
            <>
              <div className="route-stage-header">
                <div>
                  <small className="route-context-kicker">{readMetaText(presentation?.scene_label) || 'Speaking prompt'}</small>
                  <h2>{selectedPrompt.title}</h2>
                </div>
                <span className="route-chip">{selectedPrompt.level}</span>
              </div>
              <p>{readMetaText(presentation?.hero_note) || selectedPrompt.prompt_text}</p>
              <div className="route-chip-row">
                <span className="route-chip">{selectedPrompt.prompt_type}</span>
                <span className="route-outline-chip">{selectedPrompt.target_duration_seconds}s</span>
                {badges.map((badge) => (
                  <span key={badge} className="route-outline-chip">
                    {badge}
                  </span>
                ))}
              </div>
              {selectedPrompt.cue_points && selectedPrompt.cue_points.length > 0 ? (
                <div className="route-inline-card">
                  <div className="route-label-row">
                    <strong>Coach cues</strong>
                    <span className="route-outline-chip">before you speak</span>
                  </div>
                  <p>{selectedPrompt.cue_points.join(' · ')}</p>
                </div>
              ) : null}
              <textarea
                className="route-textarea"
                value={responseText}
                onChange={(event) => setResponseText(event.target.value)}
                placeholder={shadowingMode ? 'Type the chunk you repeated or corrected here...' : 'Type the spoken response transcript here...'}
              />
              <div className="route-inline-actions">
                <button
                  className="primary-cta"
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!hasAccess || !accessToken || !responseText.trim() || submitting}
                >
                  {submitting ? 'Submitting response...' : shadowingMode ? 'Submit shadowing pass' : 'Submit speaking response'}
                </button>
              </div>
            </>
          ) : (
            <div className="route-empty-state">Choose a prompt from the queue to open the live speaking stage.</div>
          )}
        </section>
      </div>
    </SectionGrid>
  );
};

const SpeakingReviewPage = ({
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
  const [attempt, setAttempt] = useState<Record<string, unknown> | null>(null);
  const [feedback, setFeedback] = useState<Record<string, unknown> | null>(null);
  const [prompt, setPrompt] = useState<SpeakingPrompt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.attemptId || !hasAccess || !accessToken) {
      setAttempt(null);
      setFeedback(null);
      setPrompt(null);
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
        const promptId = typeof responseJson?.prompt_id === 'string' ? responseJson.prompt_id : '';
        if (promptId) {
          const promptResult = await getSpeakingPrompt(accessToken, promptId);
          if (cancelled) return;
          setPrompt(promptResult.prompt);
        }
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Could not load this coaching replay.');
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
  const targetWordsUsed = Array.isArray(responseJson.target_words_used)
    ? responseJson.target_words_used.map((entry) => String(entry))
    : [];
  const missedTargetWords = Array.isArray(responseJson.missed_target_words)
    ? responseJson.missed_target_words.map((entry) => String(entry))
    : [];
  const issues = Array.isArray(feedback?.issues) ? (feedback.issues as Array<Record<string, unknown>>) : [];

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Coaching replay"
        title="Keep transcript feedback on a dedicated replay page."
        copy="The review route now owns issue grouping, lexical activation checks, and the next-step service handoffs after speaking practice."
        actions={
          <>
            <Link className="ghost-btn" to={toModulePath(prompt ? `/prompts/${prompt.slug || prompt.id}` : '/studio')}>
              Back to prompt
            </Link>
            <Link className="ghost-btn" to={toModulePath('/shadowing')}>
              Shadowing route
            </Link>
          </>
        }
      />
      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Coaching replay is preview-only"
          message="This route will show the last speaking debrief after a live response, but review data appears only with plan access."
          ctaHref={pricingHref}
        />
      ) : null}

      <div className="route-split-grid">
        <section className="route-debrief-card">
          {loading ? <div className="route-empty-state">Loading speaking review...</div> : null}
          {!loading && error ? <div className="route-empty-state">{error}</div> : null}
          {!loading && !attempt ? (
            <div className="route-empty-state">
              Submit a speaking response first. The coaching replay route will then show feedback and next routes.
            </div>
          ) : null}
          {attempt ? (
            <>
              <div className="route-stage-header">
                <div>
                  <small className="route-context-kicker">Latest speaking replay</small>
                  <h2>{prompt?.title ?? 'Speaking attempt'}</h2>
                </div>
                {prompt ? <span className="route-chip">{prompt.prompt_type}</span> : null}
              </div>
              <p>{typeof feedback?.summary === 'string' && feedback.summary ? feedback.summary : 'Your speaking replay is ready.'}</p>
              <div className="phase2-feedback-card">
                <strong>Coaching notes</strong>
                {issues.length > 0 ? (
                  <ul className="phase2-feedback-list">
                    {issues.map((issue, index) => (
                      <li key={`${String(issue.subskill_key ?? issue.category ?? 'issue')}-${index}`}>
                        <strong>{String(issue.subskill_key ?? issue.category ?? 'issue')}</strong>: {String(issue.explanation ?? 'Retry this pattern with one smaller improvement target.')}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No major issues were logged in the latest speaking pass.</p>
                )}
              </div>
              <div className="route-inline-card">
                <div className="route-label-row">
                  <strong>Lexical activation</strong>
                  <span className="route-outline-chip">transfer pressure</span>
                </div>
                <p>
                  Used target words: {targetWordsUsed.length > 0 ? targetWordsUsed.join(', ') : 'none'}.
                  {' '}Missed target words: {missedTargetWords.length > 0 ? missedTargetWords.join(', ') : 'none'}.
                </p>
              </div>
            </>
          ) : null}
        </section>

        <section className="route-summary-card">
          <div className="route-subhead">
            <h2>Next routes</h2>
            <span className="route-outline-chip">handoff next</span>
          </div>
          <div className="route-next-step-grid">
            {REVIEW_HANDOFFS.map((handoff) => (
              <a
                key={handoff.label}
                className="route-next-step-card"
                href={withEnglishRouteContext(handoff.href, {
                  sourceService: 'speaking',
                  intent: 'review-followup',
                  skill: 'speaking',
                  reason: 'speaking-review',
                })}
              >
                <strong>{handoff.label}</strong>
                <p>Leave the coaching replay only when the next route has a clear remediation target.</p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </SectionGrid>
  );
};

const SpeakingWorkspaceRoutes = ({
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
      <Route path="dashboard" element={<SpeakingDashboardPage hasAccess={hasAccess} pricingHref={pricingHref} context={context} />} />
      <Route
        path="/studio"
        element={<SpeakingStudioPage hasAccess={hasAccess} pricingHref={pricingHref} search={search} accessToken={accessToken} context={context} shadowingMode={false} />}
      />
      <Route
        path="/prompts/:promptId"
        element={<SpeakingStudioPage hasAccess={hasAccess} pricingHref={pricingHref} search={search} accessToken={accessToken} context={context} shadowingMode={false} />}
      />
      <Route
        path="/shadowing"
        element={<SpeakingStudioPage hasAccess={hasAccess} pricingHref={pricingHref} search={search} accessToken={accessToken} context={context} shadowingMode={true} />}
      />
      <Route
        path="/shadowing/:promptId"
        element={<SpeakingStudioPage hasAccess={hasAccess} pricingHref={pricingHref} search={search} accessToken={accessToken} context={context} shadowingMode={true} />}
      />
      <Route
        path="/review"
        element={<SpeakingReviewPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/review/:attemptId"
        element={<SpeakingReviewPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route path="exercises" element={<Navigate to={toModulePath('/studio')} replace />} />
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
            (entry) => hasActiveProductEntitlement(entry, SPEAKING_PRODUCT_ID, SPEAKING_PRODUCT_SLUG),
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
        setAccessError('Could not verify your speaking access right now.');
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
    () => `${buildPlatformUrl(`/pricing?product=${SPEAKING_PRODUCT_SLUG}`)}&returnTo=${encodeURIComponent(returnTo)}`,
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
    { label: 'Studio', href: toModulePath('/studio'), active: isModulePath(location.pathname, '/studio') || isModulePathPrefix(location.pathname, '/prompts') },
    { label: 'Shadowing', href: toModulePath('/shadowing'), active: isModulePathPrefix(location.pathname, '/shadowing') },
    { label: 'Review room', href: toModulePath('/review'), active: isModulePathPrefix(location.pathname, '/review') },
  ];

  return (
    <EnglishSkillWorkspace
      serviceName={SERVICE_LABEL}
      serviceTagline="English Speaking service - route-based prompt, shadowing, and coaching replay workflow."
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
      upgradeTitle="Premium Speaking Pack"
      upgradeCopy="Unlock live studio routes, shadowing flows, and dedicated coaching replay pages."
      updatesHref={buildPlatformUrl('/updates')}
    >
      <SpeakingWorkspaceRoutes
        hasAccess={hasAccess}
        pricingHref={pricingHref}
        accessToken={session?.access_token ?? null}
        search={search}
      />
    </EnglishSkillWorkspace>
  );
};

export default App;
