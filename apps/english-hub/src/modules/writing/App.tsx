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
  type EnglishRouteContext,
  withEnglishRouteContext,
} from '../../../../english-shared/src/routeContext';
import { platformUrl, supabase } from './lib/supabase';
import { getMe } from './lib/platformClient';
import {
  getWritingDraft,
  getWritingPrompt,
  listWritingPrompts,
  startWritingDraft,
  submitWritingDraft,
  type WritingDraft,
  type WritingPrompt,
  type WritingSubmitResult,
} from './lib/writingWorkbenchClient';
import { getLearningAttempt } from './lib/learningAttemptClient';

type SessionStatus = 'checking' | 'signed_in' | 'signed_out';
type AccessStatus = 'checking' | 'granted' | 'denied' | 'idle';

const WRITING_PRODUCT_ID =
  ((import.meta.env.VITE_WRITING_PRODUCT_ID as string | undefined) ?? '').trim() ||
  '2f7c2d09-08e4-4f9f-9e8d-4f5916ef8532';
const WRITING_PRODUCT_SLUG = 'english-writing';
const SERVICE_LABEL = 'English Writing';
const ENGLISH_HUB_URL = '/';
const MODULE_BASE_PATH = '/writing';

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

const SERVICE_SWITCH_LINKS = ENGLISH_SERVICE_LINKS.filter((service) => service.key !== 'writing');

const SERVICE_BLUEPRINT = [
  {
    slug: 'opinion-brief',
    title: 'Writing briefs',
    detail: 'Open focused task briefs with genre, target structure, and outcome framing.',
    intent: 'writing-task',
    skill: 'coherence',
  },
  {
    slug: 'active-correction',
    title: 'Active correction',
    detail: 'Revise the same draft in clear cycles instead of reading one flat score report.',
    intent: 'active-correction',
    skill: 'grammar',
  },
  {
    slug: 'rewrite-lab',
    title: 'Rewrite lab',
    detail: 'Push one weak idea through clarity, control, and vocabulary upgrades.',
    intent: 'rewrite',
    skill: 'clarity',
  },
  {
    slug: 'grammar-layer',
    title: 'Grammar explanation layer',
    detail: 'See why a pattern failed before you re-enter the draft lab.',
    intent: 'grammar-explain',
    skill: 'accuracy',
  },
] as const;

const REVIEW_HANDOFFS = [
  { label: 'Repair sentence errors in Grammar', href: '/grammar/repair-queue' },
  { label: 'Strengthen structure in Reading', href: '/reading/intensive' },
  { label: 'Activate stronger words in Vocabulary', href: '/vocabulary/activation' },
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
  const combined = `${firstName} ${lastName}`.trim();
  return combined || null;
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
              <strong>Revision-first</strong>
              <span className="landing-arrow">{'->'}</span>
            </div>
            <p>Separate brief, draft, and debrief pages</p>
            <small>one workflow per screen</small>
          </article>

          <article className="landing-card landing-team tilt-right">
            <span className="landing-pill">Writing atelier</span>
            <h3>Structured output</h3>
            <p>Move from prompt discovery to draft execution to correction without losing your learning context.</p>
          </article>

          <article className="landing-card landing-offer tilt-right">
            <h3>Premium writing routes</h3>
            <p className="landing-price">
              12$ <span>35$</span>
            </p>
            <div className="landing-ticket">
              <div className="landing-ticket-row">
                <small>Brief</small>
                <small>Debrief</small>
              </div>
              <strong>One clean flow</strong>
              <small>task {'->'} draft {'->'} review</small>
            </div>
          </article>

          <article className="landing-card landing-showcase tilt-left">
            <div className="landing-orb" aria-hidden />
            <h3>Connected English</h3>
            <p>Writing outcomes hand off directly into Grammar, Reading, and Vocabulary routes.</p>
          </article>
        </div>

        <article className="landing-copy card">
          <div className="landing-chip">{SERVICE_LABEL}</div>
          <h2>Organized writing practice built around real drafting, not one overloaded page.</h2>
          <p>
            Browse briefs, open a focused draft studio, and return to a dedicated review page when the revision cycle is complete.
          </p>
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

const WritingDashboardPage = ({
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
        <Link className="ghost-btn" to={toModulePath('/briefs')}>
          Open routed writing brief
        </Link>
      }
    />

    <PageHero
      eyebrow="English Writing dashboard"
      title="Choose the right writing route before you draft."
      copy="This dashboard is now orchestration-only: current focus, recent instability, and direct launch cards instead of one giant exercises pane."
      actions={
        <>
          <Link className="primary-cta" to={toModulePath('/briefs')}>
            Open briefs
          </Link>
          <Link className="ghost-btn" to={toModulePath('/drafts')}>
            Draft studio
          </Link>
          <Link className="ghost-btn" to={toModulePath('/review')}>
            Review room
          </Link>
        </>
      }
      aside={
        <>
          <div className="route-chip-row">
            <span className="route-chip">Briefs</span>
            <span className="route-chip">Drafting</span>
            <span className="route-chip">Debrief</span>
          </div>
          <p className="route-muted-copy">
            {hasAccess
              ? 'Your live writing workbench is available on the drafting route.'
              : 'Preview the full route structure now. Live drafting unlocks with a trial or paid plan.'}
          </p>
        </>
      }
    />

    <div className="route-stat-grid">
      <StatCard label="Current focus" value="Coherence" hint="Connected idea flow across paragraph-level writing tasks." />
      <StatCard label="Revision rhythm" value="3 passes" hint="Targeted first-pass grammar, second-pass clarity, third-pass polish." />
      <StatCard label="Next payoff" value="Grammar handoff" hint="Push repeated sentence errors into the grammar repair queue." />
    </div>

    {!hasAccess ? (
      <AccessBoundaryCard
        hasAccess={false}
        title="Preview-only writing routes"
        message="You can browse briefs, drafting, and review pages, but submission and scoring stay locked until your plan is active."
        ctaHref={pricingHref}
      />
    ) : null}

    <div className="route-split-grid">
      <section className="route-summary-card">
        <div className="route-subhead">
          <h2>Route map</h2>
          <span className="route-outline-chip">dashboard {'->'} briefs {'->'} drafts {'->'} review</span>
        </div>
        <div className="route-card-stack">
          {SERVICE_BLUEPRINT.map((item) => (
            <article key={item.slug} className="route-next-step-card">
              <small>{item.skill}</small>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <Link className="ghost-btn" to={toModulePath(`/briefs/${item.slug}`)}>
                Open route
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="route-summary-card">
        <div className="route-subhead">
          <h2>Direct launches</h2>
          <span className="route-outline-chip">orchestration only</span>
        </div>
        <div className="route-next-step-grid">
          <Link className="route-next-step-card" to={toModulePath('/briefs')}>
            <strong>Browse task briefs</strong>
            <p>Choose a prompt, review constraints, and see target vocabulary before opening the draft lab.</p>
          </Link>
          <Link className="route-next-step-card" to={toModulePath('/drafts')}>
            <strong>Enter draft studio</strong>
            <p>Open the live writing workbench where the response itself is the center of gravity.</p>
          </Link>
          <Link className="route-next-step-card" to={toModulePath('/review')}>
            <strong>Review the last cycle</strong>
            <p>See issue grouping, correction targets, and where the writing route hands off next.</p>
          </Link>
        </div>
      </section>
    </div>
  </SectionGrid>
);

const WritingBriefsPage = ({
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
  const params = useParams<{ promptId?: string }>();
  const [prompts, setPrompts] = useState<WritingPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState<WritingPrompt | null>(null);

  useEffect(() => {
    if (!hasAccess || !accessToken) {
      setPrompts([]);
      setLoading(false);
      setError(null);
      setPreviewPrompt(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void listWritingPrompts(accessToken)
      .then((items) => {
        if (cancelled) return;
        setPrompts(items);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load writing briefs.');
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

    const existing = prompts.find((entry) => entry.id === params.promptId || entry.slug === params.promptId);
    if (existing) {
      setPreviewPrompt(existing);
      return;
    }

    let cancelled = false;
    void getWritingPrompt(accessToken, params.promptId)
      .then((result) => {
        if (cancelled) return;
        setPreviewPrompt(result.prompt);
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewPrompt(null);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, params.promptId, prompts]);

  const filteredPrompts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const base = prompts.length > 0
      ? prompts
      : SERVICE_BLUEPRINT.map((item, index) => ({
          id: item.slug,
          slug: item.slug,
          title: item.title,
          prompt_text: item.detail,
          guidance_text: 'Preview-only route. Unlock access to start a live draft.',
          level: ['A2', 'B1', 'B2', 'C1'][index] ?? 'B1',
          genre: item.skill,
          target_grammar: item.skill,
          target_vocabulary: [],
          target_structure: item.intent,
          expected_length_min: 80,
          expected_length_max: 150,
          presentation_meta: {
            scene_label: 'Writing brief',
            hero_note: item.detail,
            target_badges: [item.skill, item.intent],
          },
        } satisfies WritingPrompt));

    if (!normalized) return base;
    return base.filter(
      (prompt) =>
        prompt.title.toLowerCase().includes(normalized) ||
        prompt.genre.toLowerCase().includes(normalized) ||
        prompt.level.toLowerCase().includes(normalized),
    );
  }, [prompts, search]);

  const activePrompt =
    previewPrompt ??
    filteredPrompts.find((entry) => entry.id === params.promptId || entry.slug === params.promptId) ??
    filteredPrompts[0] ??
    null;
  const presentation = asMetaRecord(activePrompt?.presentation_meta);
  const targetBadges = readMetaList(presentation?.target_badges);
  const supportBadges = readMetaList(presentation?.support_mode_labels);

  const handleOpenDraft = async (): Promise<void> => {
    if (!activePrompt) return;
    if (!hasAccess || !accessToken) {
      window.location.assign(pricingHref);
      return;
    }

    const result = await startWritingDraft(accessToken, { prompt_id: activePrompt.id });
    navigate(toModulePath(`/drafts/${result.draft.id}`));
  };

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Writing briefs"
        title="Choose a task brief before you enter the draft studio."
        copy="This route is for selection and framing only: what you are writing, why it matters, and which pattern you are training."
        actions={
          <>
            {activePrompt ? (
              <button className="primary-cta" type="button" onClick={() => void handleOpenDraft()}>
                Open draft studio
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
          title="Preview the route structure"
          message="You can browse the brief architecture and target metadata here. Live drafting unlocks when this service is active on your account."
          ctaHref={pricingHref}
        />
      ) : null}

      <div className="route-split-grid">
        <section className="route-list-card">
          <div className="route-list-head">
            <h2>Brief queue</h2>
            <span className="route-outline-chip">{filteredPrompts.length} briefs</span>
          </div>
          <p className="route-list-subcopy">
            Dashboard cards now launch here first, so learners choose the right brief before they touch the workbench.
          </p>
          {loading ? <div className="route-empty-state">Loading live writing briefs...</div> : null}
          {error ? <div className="route-empty-state">{error}</div> : null}
          <div className="route-list-stack">
            {filteredPrompts.map((prompt) => {
              const active = activePrompt?.id === prompt.id;
              const href = `/briefs/${prompt.slug || prompt.id}`;
              return (
                <Link key={prompt.id} className={'route-list-item' + (active ? ' active' : '')} to={href}>
                  <small>{prompt.level} · {prompt.genre}</small>
                  <strong>{prompt.title}</strong>
                  <p>{prompt.guidance_text ?? prompt.prompt_text.slice(0, 120)}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="route-stage-card">
          {activePrompt ? (
            <>
              <div className="route-stage-header">
                <div>
                  <small className="route-context-kicker">{readMetaText(presentation?.scene_label) || 'Writing brief'}</small>
                  <h2>{activePrompt.title}</h2>
                </div>
                <span className="route-chip">{activePrompt.level}</span>
              </div>
              <p>{readMetaText(presentation?.hero_note) || activePrompt.prompt_text}</p>
              <div className="route-chip-row">
                {targetBadges.map((badge) => (
                  <span key={`${activePrompt.id}-${badge}`} className="route-chip">
                    {badge}
                  </span>
                ))}
                {supportBadges.map((badge) => (
                  <span key={`${activePrompt.id}-${badge}-support`} className="route-outline-chip">
                    {badge}
                  </span>
                ))}
                {activePrompt.target_grammar ? <span className="route-outline-chip">{activePrompt.target_grammar}</span> : null}
              </div>
              <section className="route-inline-card">
                <div className="route-label-row">
                  <strong>Prompt</strong>
                  <span className="route-outline-chip">
                    {activePrompt.expected_length_min}-{activePrompt.expected_length_max} words
                  </span>
                </div>
                <p>{activePrompt.prompt_text}</p>
                {activePrompt.guidance_text ? <p className="route-muted-copy">{activePrompt.guidance_text}</p> : null}
              </section>
              <div className="route-cta-row">
                <button className="primary-cta" type="button" onClick={() => void handleOpenDraft()}>
                  {hasAccess ? 'Open draft studio' : 'Unlock drafting'}
                </button>
                <Link className="ghost-btn" to={toModulePath('/review')}>
                  See review room
                </Link>
              </div>
            </>
          ) : (
            <div className="route-empty-state">Choose a brief from the queue to preview its task structure.</div>
          )}
        </section>
      </div>
    </SectionGrid>
  );
};

const WritingDraftPage = ({
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
  const params = useParams<{ draftId?: string }>();
  const [draft, setDraft] = useState<WritingDraft | null>(null);
  const [prompt, setPrompt] = useState<WritingPrompt | null>(null);
  const [draftText, setDraftText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<WritingSubmitResult | null>(null);

  useEffect(() => {
    if (!params.draftId || !hasAccess || !accessToken) {
      setDraft(null);
      setPrompt(null);
      setDraftText('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void getWritingDraft(accessToken, params.draftId)
      .then((result) => {
        if (cancelled) return;
        setDraft(result.draft);
        setPrompt(result.prompt);
        setDraftText(result.draft.current_text ?? '');
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Could not open this draft.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, params.draftId]);

  const presentation = asMetaRecord(prompt?.presentation_meta);
  const supportBadges = readMetaList(presentation?.support_mode_labels);

  const handleSubmit = async (): Promise<void> => {
    if (!draft || !accessToken) return;
    setSubmitLoading(true);
    setError(null);

    try {
      const result = await submitWritingDraft(accessToken, {
        draft_id: draft.id,
        submission_text: draftText,
        time_spent_seconds: Math.max(120, draftText.trim().split(/\s+/).filter(Boolean).length * 8),
        retry_count: draft.revision_count,
        hint_usage_count: 0,
      });
      setDraft(result.draft);
      setSubmitResult(result);
      navigate(toModulePath(`/review/${result.draft.id}`));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not submit this draft.');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Draft studio"
        title="Write on a page that belongs only to drafting."
        copy="The live workbench now lives here, separate from discovery and review, so the learner can stay focused on the response itself."
        actions={
          <>
            <Link className="ghost-btn" to={toModulePath('/briefs')}>
              Back to briefs
            </Link>
            <Link className="ghost-btn" to={toModulePath(draft ? `/review/${draft.id}` : '/review')}>
              Open review room
            </Link>
          </>
        }
      />

      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Draft studio is locked"
          message="You can see the dedicated route, but real drafting and scoring unlock with an active writing plan."
          ctaHref={pricingHref}
        />
      ) : null}

      <section className={'route-stage-card' + (!hasAccess ? ' route-disabled' : '')}>
        {loading ? <div className="route-empty-state">Opening draft studio...</div> : null}
        {!loading && error ? <div className="route-empty-state">{error}</div> : null}
        {!loading && !draft ? (
          <div className="route-empty-state">
            Choose a brief first so the system can open a dedicated draft studio for that task.
            <div className="route-cta-row" style={{ marginTop: 12 }}>
              <Link className="ghost-btn" to={toModulePath('/briefs')}>
                Browse briefs
              </Link>
            </div>
          </div>
        ) : null}

        {draft && prompt ? (
          <>
            <div className="route-stage-header">
              <div>
                <small className="route-context-kicker">{readMetaText(presentation?.scene_label) || 'Live draft'}</small>
                <h2>{prompt.title}</h2>
              </div>
              <span className="route-chip">Revision #{draft.revision_count + 1}</span>
            </div>
            <p>{readMetaText(presentation?.hero_note) || prompt.guidance_text || prompt.prompt_text}</p>
            <div className="route-chip-row">
              <span className="route-chip">{prompt.level}</span>
              <span className="route-outline-chip">{prompt.genre}</span>
              {supportBadges.map((badge) => (
                <span key={badge} className="route-outline-chip">
                  {badge}
                </span>
              ))}
            </div>
            <textarea
              className="route-textarea"
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              placeholder="Write your response here. The review route will own corrections after you submit."
            />
            <div className="route-inline-actions">
              <button
                className="primary-cta"
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!hasAccess || !accessToken || !draftText.trim() || submitLoading}
              >
                {submitLoading ? 'Submitting draft...' : draft.revision_count > 0 ? 'Submit next revision' : 'Submit first draft'}
              </button>
              <Link className="ghost-btn" to={toModulePath(`/review/${draft.id}`)}>
                Review route
              </Link>
            </div>
            {submitResult ? (
              <div className="route-inline-card">
                <strong>{submitResult.feedback?.summary ?? 'Draft submitted.'}</strong>
                <p>Routing you into the review room now so feedback stays off the drafting screen.</p>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </SectionGrid>
  );
};

const WritingReviewPage = ({
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
  const params = useParams<{ draftId?: string }>();
  const [draft, setDraft] = useState<WritingDraft | null>(null);
  const [prompt, setPrompt] = useState<WritingPrompt | null>(null);
  const [feedback, setFeedback] = useState<Record<string, unknown> | null>(null);
  const [latestCycle, setLatestCycle] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.draftId || !hasAccess || !accessToken) {
      setDraft(null);
      setPrompt(null);
      setFeedback(null);
      setLatestCycle(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void getWritingDraft(accessToken, params.draftId)
      .then(async (result) => {
        if (cancelled) return;
        setDraft(result.draft);
        setPrompt(result.prompt);
        const cycle = Array.isArray(result.revision_cycles) ? (result.revision_cycles[0] ?? null) : null;
        setLatestCycle(cycle);
        const attemptId = typeof cycle?.attempt_id === 'string' ? cycle.attempt_id : null;
        if (attemptId) {
          const attempt = await getLearningAttempt(accessToken, attemptId);
          if (cancelled) return;
          setFeedback(attempt.feedback ?? null);
        } else {
          setFeedback(null);
        }
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Could not load this review cycle.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, params.draftId]);

  const issues = Array.isArray(feedback?.issues)
    ? (feedback?.issues as Array<Record<string, unknown>>)
    : Array.isArray(latestCycle?.issues)
    ? (latestCycle?.issues as Array<Record<string, unknown>>)
    : [];

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Review room"
        title="Keep corrections on a page that belongs only to debrief."
        copy="This route owns feedback, issue grouping, and next-step handoffs so the learner can return to drafting with a cleaner mind."
        actions={
          <>
            <Link className="ghost-btn" to={toModulePath(draft ? `/drafts/${draft.id}` : '/drafts')}>
              Back to draft studio
            </Link>
            <Link className="ghost-btn" to={toModulePath('/briefs')}>
              Browse another brief
            </Link>
          </>
        }
      />

      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Review route is preview-only"
          message="The debrief structure is visible now, but real feedback appears after a live draft submission."
          ctaHref={pricingHref}
        />
      ) : null}

      <div className="route-split-grid">
        <section className="route-debrief-card">
          {loading ? <div className="route-empty-state">Loading review data...</div> : null}
          {!loading && error ? <div className="route-empty-state">{error}</div> : null}
          {!loading && !draft ? (
            <div className="route-empty-state">
              Submit a draft first. The review room will then collect feedback, correction targets, and handoffs in one place.
            </div>
          ) : null}

          {draft && prompt ? (
            <>
              <div className="route-stage-header">
                <div>
                  <small className="route-context-kicker">Latest review cycle</small>
                  <h2>{prompt.title}</h2>
                </div>
                <span className="route-chip">Revision #{draft.revision_count}</span>
              </div>
              <p>{typeof feedback?.summary === 'string' && feedback.summary ? feedback.summary : 'Your latest revision cycle is ready for review.'}</p>
              <div className="route-metric-grid">
                <div className="route-inline-card">
                  <small className="route-context-kicker">Word count</small>
                  <strong>{draft.word_count}</strong>
                </div>
                <div className="route-inline-card">
                  <small className="route-context-kicker">Improvement</small>
                  <strong>
                    {typeof latestCycle?.improvement_ratio === 'number'
                      ? `${Math.round(Number(latestCycle.improvement_ratio) * 100)}%`
                      : 'First pass'}
                  </strong>
                </div>
              </div>
              <div className="phase2-feedback-card">
                <strong>Issue breakdown</strong>
                {issues.length > 0 ? (
                  <ul className="phase2-feedback-list">
                    {issues.map((issue, index) => (
                      <li key={`${String(issue.subskill_key ?? issue.category ?? 'issue')}-${index}`}>
                        <strong>{String(issue.subskill_key ?? issue.category ?? 'issue')}</strong>: {String(issue.explanation ?? 'Fix and retry this pattern.')}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No major issues were logged in the latest cycle.</p>
                )}
              </div>
            </>
          ) : null}
        </section>

        <section className="route-summary-card">
          <div className="route-subhead">
            <h2>Next routes</h2>
            <span className="route-outline-chip">cross-service handoff</span>
          </div>
          <div className="route-next-step-grid">
            {REVIEW_HANDOFFS.map((handoff) => (
              <a
                key={handoff.label}
                className="route-next-step-card"
                href={withEnglishRouteContext(handoff.href, {
                  sourceService: 'writing',
                  intent: 'review-followup',
                  skill: 'writing',
                  reason: 'writing-debrief',
                })}
              >
                <strong>{handoff.label}</strong>
                <p>Leave the review room only when the next route is specific and deliberate.</p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </SectionGrid>
  );
};

const WritingWorkspaceRoutes = ({
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
      <Route path="dashboard" element={<WritingDashboardPage hasAccess={hasAccess} pricingHref={pricingHref} context={context} />} />
      <Route
        path="/briefs"
        element={<WritingBriefsPage hasAccess={hasAccess} pricingHref={pricingHref} search={search} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/briefs/:promptId"
        element={<WritingBriefsPage hasAccess={hasAccess} pricingHref={pricingHref} search={search} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/drafts"
        element={<WritingDraftPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/drafts/:draftId"
        element={<WritingDraftPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/review"
        element={<WritingReviewPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/review/:draftId"
        element={<WritingReviewPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route path="exercises" element={<Navigate to={toModulePath('/briefs')} replace />} />
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
  const [accessEndsAt, setAccessEndsAt] = useState<string | null>(null);
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
        setAccessEndsAt(null);
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
            (entry) => hasActiveProductEntitlement(entry, WRITING_PRODUCT_ID, WRITING_PRODUCT_SLUG),
          ) ?? null;

        setAccessEndsAt(entitlement?.ends_at ?? null);
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
        setAccessError('Could not verify your service access right now.');
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
        const firstName = readMetaText(row.first_name);
        const lastName = readMetaText(row.last_name);
        const combined = `${firstName} ${lastName}`.trim();
        setProfileNameFromDb(combined || null);
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
    () => `${buildPlatformUrl(`/pricing?product=${WRITING_PRODUCT_SLUG}`)}&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );
  const platformWorkspaceHref = useMemo(() => buildPlatformUrl('/workspace/student'), []);
  const hasAccess = status === 'signed_in' && accessStatus === 'granted';
  const needsAccess = status === 'signed_in' && accessStatus === 'denied';
  const checkingAccess = status === 'signed_in' && accessStatus === 'checking';
  const profileName = useMemo(() => profileNameFromDb ?? resolveProfileName(session), [profileNameFromDb, session]);

  void profileName;
  void accessEndsAt;

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
    { label: 'Briefs', href: toModulePath('/briefs'), active: isModulePathPrefix(location.pathname, '/briefs') },
    { label: 'Draft studio', href: toModulePath('/drafts'), active: isModulePathPrefix(location.pathname, '/drafts') },
    { label: 'Review room', href: toModulePath('/review'), active: isModulePathPrefix(location.pathname, '/review') },
  ];

  return (
    <EnglishSkillWorkspace
      serviceName={SERVICE_LABEL}
      serviceTagline="English Writing service - route-based drafting and revision workflow."
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
      upgradeTitle="Premium Writing Pack"
      upgradeCopy="Unlock full brief banks, route-owned revision labs, and connected English handoffs."
      updatesHref={buildPlatformUrl('/updates')}
    >
      <WritingWorkspaceRoutes
        hasAccess={hasAccess}
        pricingHref={pricingHref}
        accessToken={session?.access_token ?? null}
        search={search}
      />
    </EnglishSkillWorkspace>
  );
};

export default App;
