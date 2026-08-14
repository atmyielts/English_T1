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
  getImmersionMission,
  listImmersionMissions,
  submitImmersionMission,
  type ImmersionMission,
} from './lib/immersionMissionsClient';
import { getLearningAttempt } from './lib/learningAttemptClient';

type SessionStatus = 'checking' | 'signed_in' | 'signed_out';
type AccessStatus = 'checking' | 'granted' | 'denied' | 'idle';

const IMMERSION_PRODUCT_ID =
  ((import.meta.env.VITE_IMMERSION_PRODUCT_ID as string | undefined) ?? '').trim() ||
  '7ce43052-2f35-42ca-b305-0d9c358f73f0';
const IMMERSION_PRODUCT_SLUG = 'english-immersion';
const SERVICE_LABEL = 'English Immersion';
const ENGLISH_HUB_URL = '/';
const MODULE_BASE_PATH = '/immersion';

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

const SERVICE_SWITCH_LINKS = ENGLISH_SERVICE_LINKS.filter((service) => service.key !== 'immersion');

const REVIEW_HANDOFFS = [
  { label: 'Repair breakdowns in Grammar', href: '/grammar/repair-queue' },
  { label: 'Convert outcomes into Writing', href: '/writing/briefs' },
  { label: 'Prepare mission vocabulary in Vocabulary', href: '/vocabulary/activation' },
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
              <strong>Mission</strong>
              <span className="landing-arrow">{'->'}</span>
            </div>
            <p>Route before execution</p>
            <small>one mission stage per page</small>
          </article>
          <article className="landing-card landing-team tilt-right">
            <span className="landing-pill">Field guide</span>
            <h3>Scenario flow</h3>
            <p>Separate mission selection, live mission steps, and debrief into clear immersive routes.</p>
          </article>
          <article className="landing-card landing-offer tilt-right">
            <h3>Premium immersion routes</h3>
            <p className="landing-price">
              12$ <span>35$</span>
            </p>
            <div className="landing-ticket">
              <div className="landing-ticket-row">
                <small>Mission</small>
                <small>Debrief</small>
              </div>
              <strong>Select {'->'} act {'->'} debrief</strong>
              <small>step-based journey</small>
            </div>
          </article>
          <article className="landing-card landing-showcase tilt-left">
            <div className="landing-orb" aria-hidden />
            <h3>Transfer verification</h3>
            <p>Immersion now has a dedicated debrief route to show where isolated skill work fails under real use.</p>
          </article>
        </div>
        <article className="landing-copy card">
          <div className="landing-chip">{SERVICE_LABEL}</div>
          <h2>Immersion now behaves like a mission deck instead of one overloaded exercises pane.</h2>
          <p>Choose a mission, complete the steps on a focused route, and enter a separate mission report after submission.</p>
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

const ImmersionDashboardPage = ({
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
        <Link className="ghost-btn" to={toModulePath('/missions')}>
          Open mission deck
        </Link>
      }
    />
    <PageHero
      eyebrow="Immersion dashboard"
      title="Choose the mission before you step into the scenario."
      copy="The dashboard now handles orchestration only: next mission, transfer risk, and the follow-up route if real-world use breaks down."
      actions={
        <>
          <Link className="primary-cta" to={toModulePath('/missions')}>
            Open missions
          </Link>
          <Link className="ghost-btn" to={toModulePath('/debrief')}>
            Debrief route
          </Link>
        </>
      }
      aside={
        <>
          <div className="route-chip-row">
            <span className="route-chip">Missions</span>
            <span className="route-chip">Steps</span>
            <span className="route-chip">Debrief</span>
          </div>
          <p className="route-muted-copy">
            {hasAccess ? 'Live mission execution now opens on dedicated mission routes.' : 'Preview the mission architecture now. Live missions unlock with plan access.'}
          </p>
        </>
      }
    />
    <div className="route-stat-grid">
      <StatCard label="Current focus" value="Transfer" hint="Immersion routes validate whether isolated skill gains survive in real tasks." />
      <StatCard label="Best next route" value="Mission deck" hint="Choose a scenario before you enter the step-by-step mission stage." />
      <StatCard label="Recovery target" value="Grammar + Vocabulary" hint="Mission failure should reopen precise repair routes, not send users back to a giant mixed page." />
    </div>
    {!hasAccess ? (
      <AccessBoundaryCard
        hasAccess={false}
        title="Preview-only immersion routes"
        message="You can browse mission, step, and debrief pages now. Live mission submission unlocks when the service plan is active."
        ctaHref={pricingHref}
      />
    ) : null}
  </SectionGrid>
);

const MissionDeckPage = ({
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
  const params = useParams<{ missionId?: string }>();
  const [missions, setMissions] = useState<ImmersionMission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeMission, setActiveMission] = useState<ImmersionMission | null>(null);

  useEffect(() => {
    if (!hasAccess || !accessToken) {
      setMissions([]);
      setActiveMission(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listImmersionMissions(accessToken)
      .then((items) => {
        if (cancelled) return;
        setMissions(items);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load immersion missions.');
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
    if (!hasAccess || !accessToken || !params.missionId) return;
    const existing = missions.find((mission) => mission.id === params.missionId || mission.slug === params.missionId);
    if (existing) {
      setActiveMission(existing);
      return;
    }
    let cancelled = false;
    void getImmersionMission(accessToken, params.missionId)
      .then((result) => {
        if (cancelled) return;
        setActiveMission({ ...result.mission, steps: result.steps });
      })
      .catch(() => {
        if (cancelled) return;
        setActiveMission(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, missions, params.missionId]);

  const previewMissions = useMemo(() => {
    const base = missions.length > 0
      ? missions
      : [
          {
            id: 'airport-checkin',
            slug: 'airport-checkin',
            title: 'Airport check-in',
            context_text: 'Travel scenario',
            objective_text: 'Read, listen, respond, and write to solve a real airport problem.',
            mission_type: 'travel',
            level: 'B1',
            target_vocabulary: ['boarding pass', 'delay'],
            target_grammar: 'questions',
            skill_mix: ['reading', 'listening', 'speaking', 'writing'],
            success_conditions_json: [],
            cultural_note: null,
            steps: [
              {
                id: 'airport-step-1',
                mission_id: 'airport-checkin',
                step_index: 0,
                service_key: 'reading',
                step_type: 'instruction',
                title: 'Read the airport notice',
                instructions: 'Understand the travel problem.',
                prompt_text: 'Read the notice and identify what changed.',
                target_skill_key: 'reading',
                estimated_minutes: 4,
              },
            ],
            presentation_meta: {
              scene_label: 'Mission card',
              hero_note: 'Solve a real travel problem across multiple English skills.',
              target_badges: ['travel', 'mixed-skill'],
            },
          } satisfies ImmersionMission,
        ];

    const normalized = search.trim().toLowerCase();
    if (!normalized) return base;
    return base.filter(
      (mission) =>
        mission.title.toLowerCase().includes(normalized) ||
        mission.level.toLowerCase().includes(normalized) ||
        mission.mission_type.toLowerCase().includes(normalized),
    );
  }, [missions, search]);

  const selectedMission =
    activeMission ??
    previewMissions.find((mission) => mission.id === params.missionId || mission.slug === params.missionId) ??
    previewMissions[0] ??
    null;
  const presentation = asMetaRecord(selectedMission?.presentation_meta);
  const targetBadges = readMetaList(presentation?.target_badges);

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Mission deck"
        title="Choose the scenario before you step into the live mission."
        copy="The mission deck now owns discovery: stakes, skill mix, context, and where the live mission route should begin."
        actions={
          <>
            {selectedMission ? (
              <Link className="primary-cta" to={toModulePath(`/missions/${selectedMission.slug || selectedMission.id}/step/1`)}>
                Open mission
              </Link>
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
          title="Mission deck is preview-only"
          message="You can inspect the mission structure now. Live scenario submission unlocks when the immersion service is active."
          ctaHref={pricingHref}
        />
      ) : null}

      <div className="route-split-grid">
        <section className="route-list-card">
          <div className="route-list-head">
            <h2>Mission cards</h2>
            <span className="route-outline-chip">{previewMissions.length} missions</span>
          </div>
          {loading ? <div className="route-empty-state">Loading mission deck...</div> : null}
          {error ? <div className="route-empty-state">{error}</div> : null}
          <div className="route-list-stack">
            {previewMissions.map((mission) => (
              <Link
                key={mission.id}
                className={'route-list-item' + (selectedMission?.id === mission.id ? ' active' : '')}
                to={toModulePath(`/missions/${mission.slug || mission.id}`)}
              >
                <small>{mission.level} · {mission.mission_type}</small>
                <strong>{mission.title}</strong>
                <p>{mission.objective_text}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="route-stage-card">
          {selectedMission ? (
            <>
              <div className="route-stage-header">
                <div>
                  <small className="route-context-kicker">{readMetaText(presentation?.scene_label) || 'Mission card'}</small>
                  <h2>{selectedMission.title}</h2>
                </div>
                <span className="route-chip">{selectedMission.level}</span>
              </div>
              <p>{readMetaText(presentation?.hero_note) || selectedMission.objective_text}</p>
              <div className="route-chip-row">
                <span className="route-chip">{selectedMission.mission_type}</span>
                {selectedMission.skill_mix?.map((skill) => (
                  <span key={skill} className="route-outline-chip">
                    {skill}
                  </span>
                ))}
                {targetBadges.map((badge) => (
                  <span key={badge} className="route-outline-chip">
                    {badge}
                  </span>
                ))}
              </div>
              <div className="route-inline-card">
                <div className="route-label-row">
                  <strong>Mission objective</strong>
                  <span className="route-outline-chip">{selectedMission.steps?.length ?? 0} steps</span>
                </div>
                <p>{selectedMission.context_text}</p>
              </div>
              <div className="route-cta-row">
                <Link className="primary-cta" to={toModulePath(`/missions/${selectedMission.slug || selectedMission.id}/step/1`)}>
                  Open mission
                </Link>
                <Link className="ghost-btn" to={toModulePath('/debrief')}>
                  Mission report
                </Link>
              </div>
            </>
          ) : (
            <div className="route-empty-state">Choose a mission card from the deck to preview the scenario route.</div>
          )}
        </section>
      </div>
    </SectionGrid>
  );
};

const MissionStepPage = ({
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
  const params = useParams<{ missionId?: string; stepId?: string }>();
  const [mission, setMission] = useState<ImmersionMission | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.missionId || !hasAccess || !accessToken) {
      setMission(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getImmersionMission(accessToken, params.missionId)
      .then((result) => {
        if (cancelled) return;
        setMission({ ...result.mission, steps: result.steps });
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Could not open this mission.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, params.missionId]);

  const steps = mission?.steps ?? [];
  const activeStepIndex = Math.max(0, Number(params.stepId ?? '1') - 1);
  const activeStep = steps[activeStepIndex] ?? null;

  const handleSubmit = async (): Promise<void> => {
    if (!mission || !accessToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitImmersionMission(accessToken, {
        mission_id: mission.id,
        step_responses: steps.map((step) => ({
          step_id: step.id,
          response_text: responses[step.id] ?? '',
        })),
        time_spent_seconds: Math.max(300, steps.length * 120),
        retry_count: 0,
        hint_usage_count: 0,
      });
      const attemptId =
        result && typeof (result as Record<string, unknown>).attempt === 'object'
          ? String(((result as Record<string, unknown>).attempt as Record<string, unknown>).id ?? '')
          : '';
      navigate(toModulePath(attemptId ? `/debrief/${attemptId}` : '/debrief'));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not submit this mission.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Live mission"
        title="Keep the scenario itself on a page that belongs only to mission execution."
        copy="The live mission route owns the step-by-step work. The debrief route owns the report after the mission is submitted."
        actions={
          <>
            <Link className="ghost-btn" to={toModulePath('/missions')}>
              Back to mission deck
            </Link>
            {mission ? (
              <Link className="ghost-btn" to={toModulePath(`/debrief`)}>
                Mission report
              </Link>
            ) : null}
          </>
        }
      />
      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Mission execution is locked"
          message="The live mission route is visible now, but step submission unlocks only when the immersion plan is active."
          ctaHref={pricingHref}
        />
      ) : null}

      <section className={'route-stage-card' + (!hasAccess ? ' route-disabled' : '')}>
        {loading ? <div className="route-empty-state">Opening mission route...</div> : null}
        {!loading && error ? <div className="route-empty-state">{error}</div> : null}
        {!loading && !mission ? <div className="route-empty-state">Choose a mission from the deck to open its live route.</div> : null}
        {mission && activeStep ? (
          <>
            <div className="route-stage-header">
              <div>
                <small className="route-context-kicker">Mission step {activeStepIndex + 1} of {steps.length}</small>
                <h2>{mission.title}</h2>
              </div>
              <span className="route-chip">{activeStep.service_key}</span>
            </div>
            <p>{mission.objective_text}</p>
            <div className="route-inline-card">
              <div className="route-label-row">
                <strong>{activeStep.title}</strong>
                <span className="route-outline-chip">{activeStep.step_type}</span>
              </div>
              <p>{activeStep.instructions}</p>
              <p className="route-muted-copy">{activeStep.prompt_text}</p>
            </div>
            <textarea
              className="route-textarea"
              value={responses[activeStep.id] ?? ''}
              onChange={(event) => setResponses((current) => ({ ...current, [activeStep.id]: event.target.value }))}
              placeholder="Write the response for this mission step here..."
            />
            <div className="route-chip-row">
              {steps.map((step, index) => (
                <Link
                  key={step.id}
                  className={index === activeStepIndex ? 'route-chip' : 'route-outline-chip'}
                  to={toModulePath(`/missions/${mission.slug || mission.id}/step/${index + 1}`)}
                >
                  Step {index + 1}
                </Link>
              ))}
            </div>
            {error ? <div className="route-empty-state">{error}</div> : null}
            <div className="route-inline-actions">
              <button
                className="primary-cta"
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!hasAccess || !accessToken || submitting}
              >
                {submitting ? 'Submitting mission...' : 'Submit mission'}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </SectionGrid>
  );
};

const MissionDebriefPage = ({
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
  const [mission, setMission] = useState<ImmersionMission | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.attemptId || !hasAccess || !accessToken) {
      setAttempt(null);
      setFeedback(null);
      setMission(null);
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
        const missionId = typeof responseJson?.mission_id === 'string' ? responseJson.mission_id : '';
        if (missionId) {
          const missionResult = await getImmersionMission(accessToken, missionId);
          if (cancelled) return;
          setMission({ ...missionResult.mission, steps: missionResult.steps });
        }
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Could not load this mission report.');
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
  const missedTargetVocabulary = Array.isArray(responseJson.missed_target_vocabulary)
    ? responseJson.missed_target_vocabulary.map((entry) => String(entry))
    : [];
  const usedTargetVocabulary = Array.isArray(responseJson.used_target_vocabulary)
    ? responseJson.used_target_vocabulary.map((entry) => String(entry))
    : [];
  const issues = Array.isArray(feedback?.issues) ? (feedback.issues as Array<Record<string, unknown>>) : [];

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Mission report"
        title="Keep mission feedback on a page that belongs only to debrief."
        copy="The mission report now owns what went well, what broke down, and where the learner should go next to repair transfer."
        actions={
          <>
            <Link className="ghost-btn" to={toModulePath(mission ? `/missions/${mission.slug || mission.id}` : '/missions')}>
              Back to mission deck
            </Link>
            <Link className="ghost-btn" to={toModulePath('/dashboard')}>
              Dashboard
            </Link>
          </>
        }
      />
      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Mission report is preview-only"
          message="This route shows where scenario outcomes will live after a real mission attempt."
          ctaHref={pricingHref}
        />
      ) : null}

      <div className="route-split-grid">
        <section className="route-debrief-card">
          {loading ? <div className="route-empty-state">Loading mission report...</div> : null}
          {!loading && error ? <div className="route-empty-state">{error}</div> : null}
          {!loading && !attempt ? <div className="route-empty-state">Complete a mission first. The report route will then show blockers and follow-up routes.</div> : null}
          {attempt ? (
            <>
              <div className="route-stage-header">
                <div>
                  <small className="route-context-kicker">Latest mission report</small>
                  <h2>{mission?.title ?? 'Immersion attempt'}</h2>
                </div>
                {mission ? <span className="route-chip">{mission.mission_type}</span> : null}
              </div>
              <p>{typeof feedback?.summary === 'string' && feedback.summary ? feedback.summary : 'Your mission debrief is ready.'}</p>
              <div className="phase2-feedback-card">
                <strong>Transfer blockers</strong>
                {issues.length > 0 ? (
                  <ul className="phase2-feedback-list">
                    {issues.map((issue, index) => (
                      <li key={`${String(issue.subskill_key ?? issue.category ?? 'issue')}-${index}`}>
                        <strong>{String(issue.subskill_key ?? issue.category ?? 'issue')}</strong>: {String(issue.explanation ?? 'Repair this pattern in the next route.')}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No major transfer blockers were recorded in the latest mission.</p>
                )}
              </div>
              <div className="route-inline-card">
                <div className="route-label-row">
                  <strong>Mission vocabulary</strong>
                  <span className="route-outline-chip">activation report</span>
                </div>
                <p>
                  Used: {usedTargetVocabulary.length > 0 ? usedTargetVocabulary.join(', ') : 'none'}.
                  {' '}Missed: {missedTargetVocabulary.length > 0 ? missedTargetVocabulary.join(', ') : 'none'}.
                </p>
              </div>
            </>
          ) : null}
        </section>

        <section className="route-summary-card">
          <div className="route-subhead">
            <h2>Repair next</h2>
            <span className="route-outline-chip">handoff</span>
          </div>
          <div className="route-next-step-grid">
            {REVIEW_HANDOFFS.map((handoff) => (
              <a
                key={handoff.label}
                className="route-next-step-card"
                href={withEnglishRouteContext(handoff.href, {
                  sourceService: 'immersion',
                  intent: 'mission-repair',
                  skill: 'communication',
                  reason: 'immersion-debrief',
                })}
              >
                <strong>{handoff.label}</strong>
                <p>Leave the mission report only when the next route directly addresses the blocker you just saw.</p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </SectionGrid>
  );
};

const ImmersionWorkspaceRoutes = ({
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
      <Route path="dashboard" element={<ImmersionDashboardPage hasAccess={hasAccess} pricingHref={pricingHref} context={context} />} />
      <Route
        path="/missions"
        element={<MissionDeckPage hasAccess={hasAccess} pricingHref={pricingHref} search={search} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/missions/:missionId"
        element={<MissionDeckPage hasAccess={hasAccess} pricingHref={pricingHref} search={search} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/missions/:missionId/step/:stepId"
        element={<MissionStepPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/debrief"
        element={<MissionDebriefPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/debrief/:attemptId"
        element={<MissionDebriefPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route path="exercises" element={<Navigate to={toModulePath('/missions')} replace />} />
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
            (entry) => hasActiveProductEntitlement(entry, IMMERSION_PRODUCT_ID, IMMERSION_PRODUCT_SLUG),
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
        setAccessError('Could not verify your immersion access right now.');
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
    () => `${buildPlatformUrl(`/pricing?product=${IMMERSION_PRODUCT_SLUG}`)}&returnTo=${encodeURIComponent(returnTo)}`,
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
    { label: 'Missions', href: toModulePath('/missions'), active: isModulePathPrefix(location.pathname, '/missions') },
    { label: 'Mission report', href: toModulePath('/debrief'), active: isModulePathPrefix(location.pathname, '/debrief') },
  ];

  return (
    <EnglishSkillWorkspace
      serviceName={SERVICE_LABEL}
      serviceTagline="English Immersion service - route-based mission deck, live scenario, and debrief workflow."
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
      upgradeTitle="Premium Immersion Pack"
      upgradeCopy="Unlock route-based mission execution, scenario debriefs, and transfer repair handoffs."
      updatesHref={buildPlatformUrl('/updates')}
    >
      <ImmersionWorkspaceRoutes
        hasAccess={hasAccess}
        pricingHref={pricingHref}
        accessToken={session?.access_token ?? null}
        search={search}
      />
    </EnglishSkillWorkspace>
  );
};

export default App;
