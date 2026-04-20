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
  getGrammarDashboard,
  getGrammarUnit,
  submitGrammarDrill,
  type GrammarDashboard,
  type GrammarDrill,
  type GrammarUnit,
} from './lib/grammarRemediationClient';
import { getLearningAttempt } from './lib/learningAttemptClient';

type SessionStatus = 'checking' | 'signed_in' | 'signed_out';
type AccessStatus = 'checking' | 'granted' | 'denied' | 'idle';

const GRAMMAR_PRODUCT_ID =
  ((import.meta.env.VITE_GRAMMAR_PRODUCT_ID as string | undefined) ?? '').trim() ||
  '6c4f0566-6f50-4fb4-b176-c4397ecb8ec5';
const GRAMMAR_PRODUCT_SLUG = 'english-grammar';
const SERVICE_LABEL = 'English Grammar';
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

const SERVICE_SWITCH_LINKS = ENGLISH_SERVICE_LINKS.filter((service) => service.key !== 'grammar');

const REVIEW_HANDOFFS = [
  { label: 'Apply in Writing', href: 'https://writing.english.schood.online/briefs' },
  { label: 'Apply in Speaking', href: 'https://speaking.english.schood.online/studio' },
  { label: 'Use it in Immersion', href: 'https://immersion.english.schood.online/missions' },
] as const;

const buildPlatformUrl = (pathname: string): string => `${platformUrl.replace(/\/$/, '')}${pathname}`;
const readMetaText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const asMetaRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

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
              <strong>Repair</strong>
              <span className="landing-arrow">{'->'}</span>
            </div>
            <p>Queue before drill</p>
            <small>one grammar action per screen</small>
          </article>
          <article className="landing-card landing-team tilt-right">
            <span className="landing-pill">Repair lab</span>
            <h3>Targeted remediation</h3>
            <p>Separate the repair queue, unit explanation, drill execution, and transfer route.</p>
          </article>
          <article className="landing-card landing-offer tilt-right">
            <h3>Premium grammar routes</h3>
            <p className="landing-price">
              12$ <span>35$</span>
            </p>
            <div className="landing-ticket">
              <div className="landing-ticket-row">
                <small>Queue</small>
                <small>Transfer</small>
              </div>
              <strong>Notice {'->'} fix {'->'} apply</strong>
              <small>clear remediation ownership</small>
            </div>
          </article>
          <article className="landing-card landing-showcase tilt-left">
            <div className="landing-orb" aria-hidden />
            <h3>Cross-service transfer</h3>
            <p>After each drill, grammar now points directly into Writing, Speaking, and Immersion routes.</p>
          </article>
        </div>
        <article className="landing-copy card">
          <div className="landing-chip">{SERVICE_LABEL}</div>
          <h2>Grammar now behaves like a repair system instead of one giant drill screen.</h2>
          <p>Queue the problem, open the unit, complete the drill, and then transfer the fix into another route.</p>
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

const useGrammarDashboard = (hasAccess: boolean, accessToken: string | null) => {
  const [dashboard, setDashboard] = useState<GrammarDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAccess || !accessToken) {
      setDashboard(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getGrammarDashboard(accessToken, { rebuild: true })
      .then((result) => {
        if (cancelled) return;
        setDashboard(result);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load grammar dashboard.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess]);

  return { dashboard, loading, error };
};

const GrammarDashboardPage = ({
  hasAccess,
  pricingHref,
  context,
  dashboard,
}: {
  hasAccess: boolean;
  pricingHref: string;
  context: EnglishRouteContext;
  dashboard: GrammarDashboard | null;
}) => {
  const activeAssignments = dashboard?.assignments?.filter((assignment) => assignment.status === 'active') ?? [];

  return (
    <SectionGrid>
      <RouteContextRibbon
        context={context}
        cta={
          <Link className="ghost-btn" to="/repair-queue">
            Open repair queue
          </Link>
        }
      />
      <PageHero
        eyebrow="Grammar dashboard"
        title="See what needs repair before you open a drill."
        copy="The dashboard now orchestrates grammar work instead of containing the work itself: active repairs, fragile units, and transfer targets."
        actions={
          <>
            <Link className="primary-cta" to="/repair-queue">
              Open repair queue
            </Link>
            <Link className="ghost-btn" to="/transfer">
              Transfer route
            </Link>
          </>
        }
        aside={
          <>
            <div className="route-chip-row">
              <span className="route-chip">Queue</span>
              <span className="route-chip">Units</span>
              <span className="route-chip">Drills</span>
              <span className="route-chip">Transfer</span>
            </div>
            <p className="route-muted-copy">
              {hasAccess ? 'Drill execution now opens on dedicated routes.' : 'Browse the remediation structure now. Live drills unlock with plan access.'}
            </p>
          </>
        }
      />
      <div className="route-stat-grid">
        <StatCard label="Active repairs" value={String(activeAssignments.length)} hint="Assignments seeded from real learner errors or a warmup path." />
        <StatCard label="Current pressure" value="Articles / tense" hint="Grammar routes now split explanation, drill, and transfer into different pages." />
        <StatCard label="Next payoff" value="Writing transfer" hint="Stable drills should hand off into applied writing or speaking work next." />
      </div>
      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Preview-only grammar routes"
          message="You can browse the queue, units, drills, and transfer pages now. Live drill submission unlocks when the service is active."
          ctaHref={pricingHref}
        />
      ) : null}
    </SectionGrid>
  );
};

const GrammarQueuePage = ({
  hasAccess,
  pricingHref,
  dashboard,
  loading,
  error,
  context,
}: {
  hasAccess: boolean;
  pricingHref: string;
  dashboard: GrammarDashboard | null;
  loading: boolean;
  error: string | null;
  context: EnglishRouteContext;
}) => {
  const params = useParams<{ unitId?: string }>();
  const assignments = dashboard?.assignments ?? [];
  const units = dashboard?.units ?? [];
  const activeAssignment =
    assignments.find((assignment) => assignment.grammar_unit_id === params.unitId) ??
    assignments[0] ??
    null;
  const activeUnit =
    units.find((unit) => unit.id === params.unitId || unit.slug === params.unitId || unit.id === activeAssignment?.grammar_unit_id) ??
    units[0] ??
    null;

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Repair queue"
        title="Choose the grammar problem before you open the drill."
        copy="The queue now owns prioritization: where the instability came from, how urgent it is, and which unit should open next."
        actions={
          <>
            {activeUnit ? (
              <Link className="primary-cta" to={`/units/${activeUnit.slug || activeUnit.id}`}>
                Open unit
              </Link>
            ) : null}
            <Link className="ghost-btn" to="/dashboard">
              Back to dashboard
            </Link>
          </>
        }
      />
      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Repair queue is preview-only"
          message="Preview the queue shape now. Live remediation starts when this service is unlocked."
          ctaHref={pricingHref}
        />
      ) : null}
      <div className="route-split-grid">
        <section className="route-list-card">
          <div className="route-list-head">
            <h2>Assignments</h2>
            <span className="route-outline-chip">{assignments.length} queued</span>
          </div>
          {loading ? <div className="route-empty-state">Loading repair queue...</div> : null}
          {error ? <div className="route-empty-state">{error}</div> : null}
          <div className="route-list-stack">
            {assignments.map((assignment) => {
              const unit = units.find((entry) => entry.id === assignment.grammar_unit_id);
              return (
                <Link
                  key={assignment.id}
                  className={'route-list-item' + (activeAssignment?.id === assignment.id ? ' active' : '')}
                  to={`/repair-queue/${unit?.slug || assignment.grammar_unit_id}`}
                >
                  <small>{assignment.source_service_key ?? 'grammar'} · priority {assignment.priority}</small>
                  <strong>{unit?.title ?? 'Grammar unit'}</strong>
                  <p>{assignment.reason}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="route-stage-card">
          {activeUnit ? (
            <>
              <div className="route-stage-header">
                <div>
                  <small className="route-context-kicker">Repair target</small>
                  <h2>{activeUnit.title}</h2>
                </div>
                <span className="route-chip">{activeUnit.level}</span>
              </div>
              <p>{activeAssignment?.reason ?? activeUnit.explanation_text}</p>
              <div className="route-chip-row">
                <span className="route-chip">{activeUnit.focus_area}</span>
                {activeAssignment?.source_service_key ? <span className="route-outline-chip">from {activeAssignment.source_service_key}</span> : null}
              </div>
              <div className="route-cta-row">
                <Link className="primary-cta" to={`/units/${activeUnit.slug || activeUnit.id}`}>
                  Open unit
                </Link>
                <Link className="ghost-btn" to={`/transfer/${activeUnit.slug || activeUnit.id}`}>
                  Transfer target
                </Link>
              </div>
            </>
          ) : (
            <div className="route-empty-state">Your active grammar queue will appear here after the dashboard loads assignments.</div>
          )}
        </section>
      </div>
    </SectionGrid>
  );
};

const GrammarUnitPage = ({
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
  const params = useParams<{ unitId?: string }>();
  const [unit, setUnit] = useState<GrammarUnit | null>(null);
  const [drills, setDrills] = useState<GrammarDrill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.unitId || !hasAccess || !accessToken) {
      setUnit(null);
      setDrills([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getGrammarUnit(accessToken, params.unitId)
      .then((result) => {
        if (cancelled) return;
        setUnit(result.unit);
        setDrills(result.drills);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Could not load this grammar unit.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, params.unitId]);

  const presentation = asMetaRecord(unit?.presentation_meta);

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Unit map"
        title="Read the rule on a page that belongs only to understanding."
        copy="The unit route now separates explanation and contrast from drill execution, so the learner arrives at the drill knowing exactly what is being repaired."
        actions={
          <>
            {drills[0] ? (
              <Link className="primary-cta" to={`/drills/${drills[0].id}`}>
                Open first drill
              </Link>
            ) : null}
            <Link className="ghost-btn" to="/repair-queue">
              Back to queue
            </Link>
          </>
        }
      />
      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Unit route is preview-only"
          message="Preview the micro-lesson structure now. Live drill work unlocks with plan access."
          ctaHref={pricingHref}
        />
      ) : null}

      <section className="route-stage-card">
        {loading ? <div className="route-empty-state">Loading grammar unit...</div> : null}
        {!loading && error ? <div className="route-empty-state">{error}</div> : null}
        {!loading && !unit ? <div className="route-empty-state">Choose a unit from the repair queue to load its explanation route.</div> : null}
        {unit ? (
          <>
            <div className="route-stage-header">
              <div>
                <small className="route-context-kicker">{readMetaText(presentation?.scene_label) || 'Grammar unit'}</small>
                <h2>{unit.title}</h2>
              </div>
              <span className="route-chip">{unit.level}</span>
            </div>
            <p>{readMetaText(presentation?.hero_note) || unit.explanation_text}</p>
            {unit.contrast_text ? (
              <div className="route-inline-card">
                <div className="route-label-row">
                  <strong>Contrast</strong>
                  <span className="route-outline-chip">{unit.focus_area}</span>
                </div>
                <p>{unit.contrast_text}</p>
              </div>
            ) : null}
            {Array.isArray(unit.examples_json) && unit.examples_json.length > 0 ? (
              <div className="route-card-stack">
                {unit.examples_json.map((example, index) => (
                  <article key={`${unit.id}-example-${index}`} className="route-inline-card">
                    <strong>Example {index + 1}</strong>
                    <p>Bad: {example.bad ?? '-'}</p>
                    <p>Good: {example.good ?? '-'}</p>
                  </article>
                ))}
              </div>
            ) : null}
            <div className="route-cta-row">
              {drills[0] ? (
                <Link className="primary-cta" to={`/drills/${drills[0].id}`}>
                  Open drill
                </Link>
              ) : null}
              <Link className="ghost-btn" to={`/transfer/${unit.slug || unit.id}`}>
                Transfer route
              </Link>
            </div>
          </>
        ) : null}
      </section>
    </SectionGrid>
  );
};

const GrammarDrillPage = ({
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
  const params = useParams<{ drillId?: string }>();
  const { dashboard } = useGrammarDashboard(hasAccess, accessToken);
  const drill = dashboard?.drills.find((entry) => entry.id === params.drillId) ?? null;
  const unit = dashboard?.units.find((entry) => entry.id === drill?.grammar_unit_id) ?? null;
  const assignment = dashboard?.assignments.find((entry) => entry.grammar_unit_id === unit?.id && entry.status === 'active') ?? null;
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    if (!drill || !accessToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitGrammarDrill(accessToken, {
        drill_id: drill.id,
        response_text: responseText,
        assignment_id: assignment?.id,
        time_spent_seconds: 120,
        retry_count: 0,
        hint_usage_count: 0,
      });
      const attemptId =
        result && typeof (result as Record<string, unknown>).attempt === 'object'
          ? String(((result as Record<string, unknown>).attempt as Record<string, unknown>).id ?? '')
          : '';
      navigate(unit ? `/transfer/${unit.slug || unit.id}${attemptId ? `?attempt_id=${encodeURIComponent(attemptId)}` : ''}` : '/transfer');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not submit this grammar drill.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Drill route"
        title="Keep the correction loop on a page that belongs only to the drill."
        copy="The drill route now owns response entry and correctness feedback. The transfer route owns what happens next."
        actions={
          <>
            {unit ? (
              <Link className="ghost-btn" to={`/units/${unit.slug || unit.id}`}>
                Back to unit
              </Link>
            ) : null}
            <Link className="ghost-btn" to="/repair-queue">
              Repair queue
            </Link>
          </>
        }
      />
      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Drill route is locked"
          message="The drill page structure is visible now, but live correction loops unlock with an active grammar plan."
          ctaHref={pricingHref}
        />
      ) : null}

      <section className={'route-stage-card' + (!hasAccess ? ' route-disabled' : '')}>
        {!drill ? <div className="route-empty-state">Open a grammar unit first so the drill route knows which pattern to train.</div> : null}
        {drill ? (
          <>
            <div className="route-stage-header">
              <div>
                <small className="route-context-kicker">Live drill</small>
                <h2>{drill.title}</h2>
              </div>
              {unit ? <span className="route-chip">{unit.focus_area}</span> : null}
            </div>
            <p>{drill.instructions}</p>
            <div className="route-inline-card">
              <div className="route-label-row">
                <strong>Prompt</strong>
                <span className="route-outline-chip">{drill.drill_type}</span>
              </div>
              <p>{drill.prompt_text}</p>
            </div>
            <input
              className="route-input"
              value={responseText}
              onChange={(event) => setResponseText(event.target.value)}
              placeholder="Write the corrected answer here..."
            />
            {error ? <div className="route-empty-state">{error}</div> : null}
            <div className="route-inline-actions">
              <button
                className="primary-cta"
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!hasAccess || !accessToken || !responseText.trim() || submitting}
              >
                {submitting ? 'Submitting drill...' : 'Submit drill'}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </SectionGrid>
  );
};

const GrammarTransferPage = ({
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
  const location = useLocation();
  const params = useParams<{ unitId?: string }>();
  const [unit, setUnit] = useState<GrammarUnit | null>(null);
  const [feedback, setFeedback] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.unitId || !hasAccess || !accessToken) {
      setUnit(null);
      setFeedback(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const attemptId = new URLSearchParams(location.search).get('attempt_id');
    void getGrammarUnit(accessToken, params.unitId)
      .then(async (result) => {
        if (cancelled) return;
        setUnit(result.unit);
        if (attemptId) {
          const attempt = await getLearningAttempt(accessToken, attemptId);
          if (cancelled) return;
          setFeedback(attempt.feedback ?? null);
        }
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Could not load this transfer route.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hasAccess, location.search, params.unitId]);

  const issues = Array.isArray(feedback?.issues) ? (feedback.issues as Array<Record<string, unknown>>) : [];

  return (
    <SectionGrid>
      <RouteContextRibbon context={context} />
      <PageHero
        eyebrow="Transfer route"
        title="Leave the drill only when you know where the grammar fix goes next."
        copy="The transfer page now owns post-drill debrief: what changed, what is still unstable, and where the learner should apply the pattern next."
        actions={
          <>
            {unit ? (
              <Link className="ghost-btn" to={`/units/${unit.slug || unit.id}`}>
                Back to unit
              </Link>
            ) : null}
            <Link className="ghost-btn" to="/repair-queue">
              Repair queue
            </Link>
          </>
        }
      />
      {!hasAccess ? (
        <AccessBoundaryCard
          hasAccess={false}
          title="Transfer route is preview-only"
          message="Preview the grammar debrief and next-step routing now. Live transfer details appear after a real drill attempt."
          ctaHref={pricingHref}
        />
      ) : null}

      <div className="route-split-grid">
        <section className="route-debrief-card">
          {loading ? <div className="route-empty-state">Loading transfer route...</div> : null}
          {!loading && error ? <div className="route-empty-state">{error}</div> : null}
          {!loading && !unit ? (
            <div className="route-empty-state">Finish a drill or open a unit first so the transfer route knows what pattern to apply next.</div>
          ) : null}
          {unit ? (
            <>
              <div className="route-stage-header">
                <div>
                  <small className="route-context-kicker">Next application target</small>
                  <h2>{unit.title}</h2>
                </div>
                <span className="route-chip">{unit.focus_area}</span>
              </div>
              <p>{typeof feedback?.summary === 'string' && feedback.summary ? feedback.summary : 'Use this route to carry the repaired pattern into real communication.'}</p>
              {issues.length > 0 ? (
                <div className="phase2-feedback-card">
                  <strong>Still unstable</strong>
                  <ul className="phase2-feedback-list">
                    {issues.map((issue, index) => (
                      <li key={`${String(issue.subskill_key ?? issue.category ?? 'issue')}-${index}`}>
                        <strong>{String(issue.subskill_key ?? issue.category ?? 'issue')}</strong>: {String(issue.explanation ?? 'Retry with one smaller correction target.')}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="route-summary-card">
          <div className="route-subhead">
            <h2>Apply next</h2>
            <span className="route-outline-chip">cross-service</span>
          </div>
          <div className="route-next-step-grid">
            {REVIEW_HANDOFFS.map((handoff) => (
              <a
                key={handoff.label}
                className="route-next-step-card"
                href={withEnglishRouteContext(handoff.href, {
                  sourceService: 'grammar',
                  intent: 'transfer-apply',
                  skill: 'grammar',
                  reason: 'grammar-transfer',
                })}
              >
                <strong>{handoff.label}</strong>
                <p>Transfer the repaired structure into a real task instead of repeating another abstract drill.</p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </SectionGrid>
  );
};

const GrammarWorkspaceRoutes = ({
  hasAccess,
  pricingHref,
  accessToken,
}: {
  hasAccess: boolean;
  pricingHref: string;
  accessToken: string | null;
}) => {
  const location = useLocation();
  const context = useMemo(() => readEnglishRouteContext(location.search), [location.search]);
  const { dashboard, loading, error } = useGrammarDashboard(hasAccess, accessToken);

  return (
    <Routes>
      <Route path="/dashboard" element={<GrammarDashboardPage hasAccess={hasAccess} pricingHref={pricingHref} context={context} dashboard={dashboard} />} />
      <Route
        path="/repair-queue"
        element={<GrammarQueuePage hasAccess={hasAccess} pricingHref={pricingHref} dashboard={dashboard} loading={loading} error={error} context={context} />}
      />
      <Route
        path="/repair-queue/:unitId"
        element={<GrammarQueuePage hasAccess={hasAccess} pricingHref={pricingHref} dashboard={dashboard} loading={loading} error={error} context={context} />}
      />
      <Route
        path="/units/:unitId"
        element={<GrammarUnitPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/drills/:drillId"
        element={<GrammarDrillPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/transfer"
        element={<GrammarTransferPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route
        path="/transfer/:unitId"
        element={<GrammarTransferPage hasAccess={hasAccess} pricingHref={pricingHref} accessToken={accessToken} context={context} />}
      />
      <Route path="/exercises" element={<Navigate to="/repair-queue" replace />} />
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
            (entry) => entry.resource_type === 'product' && entry.resource_id === GRAMMAR_PRODUCT_ID,
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
        setAccessError('Could not verify your grammar access right now.');
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
    () => `${buildPlatformUrl(`/pricing?product=${GRAMMAR_PRODUCT_SLUG}`)}&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );
  const platformWorkspaceHref = useMemo(() => buildPlatformUrl('/workspace/student'), []);
  const hasAccess = status === 'signed_in' && accessStatus === 'granted';
  const needsAccess = status === 'signed_in' && accessStatus === 'denied';
  const checkingAccess = status === 'signed_in' && accessStatus === 'checking';
  const profileName = useMemo(() => profileNameFromDb ?? resolveProfileName(session), [profileNameFromDb, session]);
  void profileName;

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
    { label: 'Repair queue', href: '/repair-queue', active: location.pathname.startsWith('/repair-queue') },
    { label: 'Transfer', href: '/transfer', active: location.pathname.startsWith('/transfer') || location.pathname.startsWith('/units') || location.pathname.startsWith('/drills') },
  ];

  return (
    <EnglishSkillWorkspace
      serviceName={SERVICE_LABEL}
      serviceTagline="English Grammar service - route-based repair queue, drill, and transfer workflow."
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
      upgradeTitle="Premium Grammar Pack"
      upgradeCopy="Unlock route-based remediation, live drill scoring, and transfer handoffs into other English services."
      updatesHref={buildPlatformUrl('/updates')}
    >
      <GrammarWorkspaceRoutes hasAccess={hasAccess} pricingHref={pricingHref} accessToken={session?.access_token ?? null} />
    </EnglishSkillWorkspace>
  );
};

export default App;
