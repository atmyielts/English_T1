import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { platformUrl, supabase } from './lib/supabase';
import { getMe } from './lib/platformClient';

type SessionStatus = 'checking' | 'signed_in' | 'signed_out';
type AccessStatus = 'checking' | 'granted' | 'denied' | 'idle';
const EXERCISES_PATH = '/exercises' as const;
type AppPath = '/' | '/dashboard' | typeof EXERCISES_PATH;

type LessonRow = {
  id: string;
  title: string;
  level: string;
  schedule: string;
  progress: number;
  status: 'In progress' | 'Not started' | 'Completed';
  accent: string;
};

const WRITING_PRODUCT_ID = ((import.meta.env.VITE_WRITING_PRODUCT_ID as string | undefined) ?? '').trim() || '2f7c2d09-08e4-4f9f-9e8d-4f5916ef8532';
const WRITING_PRODUCT_SLUG = 'english-writing';
const SERVICE_LABEL = 'English Writing';

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
const CURRENT_SERVICE_KEY = SERVICE_LABEL.replace(/^English\s+/i, '').toLowerCase();
const SERVICE_SWITCH_LINKS = ENGLISH_SERVICE_LINKS.filter((service) => service.key !== CURRENT_SERVICE_KEY);

const SERVICE_BLUEPRINT = [
  {
    title: 'Writing tasks',
    detail: 'Practice structured responses: email, opinion paragraph, and short story tasks.',
    intent: 'writing-task',
    skill: 'coherence',
  },
  {
    title: 'Active correction system',
    detail: 'Highlight mistakes, fix them actively, then compare with a cleaner version.',
    intent: 'active-correction',
    skill: 'grammar',
  },
  {
    title: 'Rewrite lab',
    detail: 'Rewrite weak sentences into stronger, clearer, and more natural English.',
    intent: 'rewrite',
    skill: 'clarity',
  },
  {
    title: 'Grammar explanation layer',
    detail: 'Attach quick why-it-was-wrong explanations to each correction cycle.',
    intent: 'grammar-explain',
    skill: 'accuracy',
  },
] as const;

const SERVICE_HANDOFFS = [
  { key: 'grammar', label: 'Route sentence errors to Grammar', intent: 'targeted-drill', skill: 'grammar', reason: 'writing-handoff' },
  { key: 'reading', label: 'Strengthen structure in Reading', intent: 'sentence-breakdown', skill: 'structure', reason: 'writing-handoff' },
  { key: 'vocabulary', label: 'Expand lexical range in Vocabulary', intent: 'context-review', skill: 'vocabulary', reason: 'writing-handoff' },
] as const;

const lessonRows: LessonRow[] = [
  {
    id: 'lesson-1',
    title: 'Daily Conversation Signals',
    level: 'Beginner',
    schedule: '08.00 - 09.00',
    progress: 56,
    status: 'In progress',
    accent: '#d3efbd',
  },
  {
    id: 'lesson-2',
    title: 'University Lecture Mapping',
    level: 'Intermediate',
    schedule: '10.00 - 11.30',
    progress: 81,
    status: 'In progress',
    accent: '#edf8dc',
  },
  {
    id: 'lesson-3',
    title: 'Airport and Travel Announcements',
    level: 'Beginner',
    schedule: '14.00 - 15.00',
    progress: 24,
    status: 'Not started',
    accent: '#f6fde9',
  },
  {
    id: 'lesson-4',
    title: 'IELTS Section 4 Master Drill',
    level: 'Advanced',
    schedule: '17.00 - 18.00',
    progress: 100,
    status: 'Completed',
    accent: '#c0e8a4',
  },
];

const weeklyMinutes = [
  { day: 'Mon', minutes: 62 },
  { day: 'Tue', minutes: 94 },
  { day: 'Wed', minutes: 71 },
  { day: 'Thu', minutes: 88 },
  { day: 'Fri', minutes: 102 },
  { day: 'Sat', minutes: 74 },
  { day: 'Sun', minutes: 80 },
];



void weeklyMinutes;

const progressStatusClass = (status: LessonRow['status']): string => {
  if (status === 'Completed') return 'pill done';
  if (status === 'Not started') return 'pill muted';
  return 'pill live';
};

const buildPlatformUrl = (pathname: string): string => `${platformUrl.replace(/\/$/, '')}${pathname}`;

const readMetaText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

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

const resolveInitials = (name: string | null, email: string | null): string => {
  if (name) {
    const parts = name
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const first = parts[0] ?? '';
    const second = parts[1] ?? '';
    if (first && second) return `${first.slice(0, 1)}${second.slice(0, 1)}`.toUpperCase();
    if (first) return first.slice(0, 2).toUpperCase();
  }

  if (email) {
    const prefix = email.split('@')[0] ?? '';
    return prefix.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'GL';
  }

  return 'GL';
};

const resolveReturnTo = (): string => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
};

const buildServiceDashboardHref = (
  serviceKey: string,
  intent: string,
  skill: string,
  reason: string,
): string => {
  const target = ENGLISH_SERVICE_LINKS.find((entry) => entry.key === serviceKey) ?? ENGLISH_SERVICE_LINKS[0];
  const url = new URL(`${target.href}/dashboard`);
  url.searchParams.set('from', 'english-hub');
  url.searchParams.set('source_service', CURRENT_SERVICE_KEY);
  url.searchParams.set('intent', intent);
  url.searchParams.set('skill', skill);
  url.searchParams.set('reason', reason);
  return url.toString();
};

const resolveAppPath = (pathname: string): AppPath => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/dashboard') return '/dashboard';
  if (normalized === EXERCISES_PATH || normalized.startsWith('/exercise/')) return EXERCISES_PATH;
  if (normalized.startsWith('/feature/')) return '/dashboard';
  return '/';
};

const DashboardPage = ({
  lessons,
  hasAccess,
  pricingHref,
  onOpenExercise,
}: {
  lessons: LessonRow[];
  hasAccess: boolean;
  pricingHref: string;
  onOpenExercise: (index: number) => void;
}) => {
  const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const inboundIntent = params.get('intent') ?? '';
  const inboundSkill = params.get('skill') ?? '';
  const inboundReason = params.get('reason') ?? '';
  const inboundSourceService = params.get('source_service') ?? '';
  const hasInboundFocus = Boolean(inboundIntent || inboundSkill);

  return (
    <div className="dashboard-stack">
    <section className="hero-card card">
      <div className="hero-copy">
        <div className="eyebrow">English Writing Studio</div>
        <h1>Build real exam writing confidence, one focused session at a time.</h1>
        <p>
          Train with structured drills, track micro-skills, and keep your full learning history in one workspace.
        </p>
        <button
          className="primary-cta"
          type="button"
          onClick={() => {
            if (!hasAccess) window.location.assign(pricingHref);
          }}
        >
          {hasAccess ? 'Start 15-min warmup' : 'Unlock writing access'}
        </button>
        {!hasAccess ? <small className="hero-note">Your account is signed in, but this service needs an active plan or trial.</small> : null}
      </div>
      <div className="hero-art" aria-hidden>
        <div className="wave one" />
        <div className="wave two" />
        <div className="wave three" />
      </div>
    </section>

    {hasInboundFocus ? (
      <section className="card connected-brief">
        <div>
          <h2>Focus routed from Schood English</h2>
          <p>
            Continue with intent <strong>{inboundIntent || 'writing-task'}</strong> on skill{' '}
            <strong>{inboundSkill || 'coherence'}</strong>.
          </p>
          {inboundReason ? <small>Reason: {inboundReason.replace(/[-_]+/g, ' ')}</small> : null}
          {inboundSourceService ? <small>Triggered by: {inboundSourceService}</small> : null}
        </div>
        <a
          className="ghost-btn"
          href={buildServiceDashboardHref(CURRENT_SERVICE_KEY, inboundIntent || 'writing-task', inboundSkill || 'coherence', 'continue-focus')}
        >
          Keep this focus
        </a>
      </section>
    ) : null}
    <section className="kpi-grid">
      <article className="card kpi">
        <span>Total writing sets</span>
        <strong>48</strong>
        <small>+6 this month</small>
      </article>
      <article className="card kpi">
        <span>Hours practiced</span>
        <strong>36.4 h</strong>
        <small>consistency score: 88</small>
      </article>
      <article className="card kpi">
        <span>Estimated band (Writing)</span>
        <strong>7.0</strong>
        <small>target: 7.5</small>
      </article>
    </section>

    <section className="card class-table">
      <div className="section-head">
        <h2>My class list</h2>
        <button className="ghost-btn" type="button">See all</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Class</th>
            <th>Progress</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {lessons.map((lesson) => (
            <tr key={lesson.id}>
              <td>
                <strong>{lesson.title}</strong>
                <small>{lesson.level} - {lesson.schedule}</small>
              </td>
              <td>
                <div className="progress-row">
                  <span>{lesson.progress}%</span>
                  <div className="track">
                    <div className="fill" style={{ width: `${lesson.progress}%`, background: lesson.accent }} />
                  </div>
                </div>
              </td>
              <td>
                <span className={progressStatusClass(lesson.status)}>{lesson.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>

    <section className="card cross-service-playbook">
      <div className="section-head">
        <h2>Exercises</h2>
        <a className="ghost-btn" href={`${ENGLISH_HUB_URL}/dashboard`}>Open Schood English</a>
      </div>
      <div className="playbook-grid">
        {SERVICE_BLUEPRINT.map((item, index) => (
          <article key={item.title} className="playbook-card">
            <small>{'Exercise ' + (index + 1) + ' - ' + item.skill}</small>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            <button className="ghost-btn" type="button" onClick={() => onOpenExercise(index)}>
              Open exercise window
            </button>
          </article>
        ))}
      </div>
      <div className="handoff-row">
        {SERVICE_HANDOFFS.map((handoff) => (
          <a
            key={handoff.key}
            className="menu-link muted-link"
            href={buildServiceDashboardHref(handoff.key, handoff.intent, handoff.skill, handoff.reason)}
          >
            {handoff.label}
          </a>
        ))}
      </div>
    </section>
  </div>
  );
};



const ExercisesPage = ({
  hasAccess,
  pricingHref,
  onNavigate,
}: {
  hasAccess: boolean;
  pricingHref: string;
  onNavigate: (nextPath: AppPath) => void;
}) => {
  type LaneKey = 'todo' | 'in_progress' | 'completed';

  const [activeLane, setActiveLane] = useState<'all' | LaneKey>('all');
  const [selectedId, setSelectedId] = useState<string>('');

  const exerciseItems = useMemo(
    () =>
      SERVICE_BLUEPRINT.map((item, index) => {
        const lane: LaneKey = index === 0 ? 'todo' : index < SERVICE_BLUEPRINT.length - 1 ? 'in_progress' : 'completed';
        const priority = index === 0 ? 'High' : index === 1 ? 'Medium' : 'Low';

        return {
          id: `${CURRENT_SERVICE_KEY}-${index + 1}`,
          lane,
          priority,
          due: `${10 + index * 3} days left`,
          comments: 6 + index * 4,
          updates: 3 + index * 2,
          ...item,
        };
      }),
    [],
  );

  useEffect(() => {
    const firstItem = exerciseItems[0];
    if (!selectedId && firstItem) {
      setSelectedId(firstItem.id);
    }
  }, [exerciseItems, selectedId]);

  const visibleItems = activeLane === 'all' ? exerciseItems : exerciseItems.filter((item) => item.lane === activeLane);

  const groupedItems = useMemo(
    () => ({
      todo: visibleItems.filter((item) => item.lane === 'todo'),
      in_progress: visibleItems.filter((item) => item.lane === 'in_progress'),
      completed: visibleItems.filter((item) => item.lane === 'completed'),
    }),
    [visibleItems],
  );

  const selectedItem = exerciseItems.find((item) => item.id === selectedId) ?? exerciseItems[0];

  const laneDefs: Array<{ key: LaneKey; label: string }> = [
    { key: 'todo', label: 'Todo' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <div className="dashboard-stack">
      <section className="card exercises-workspace">
        <div className="exercises-grid">
          <div className="exercises-list-pane">
            <div className="exercises-list-head">
              <h2>{SERVICE_LABEL} Exercises</h2>
              <small>One unified page</small>
            </div>

            <div className="exercises-filters">
              <button className={activeLane === 'all' ? 'exercise-filter active' : 'exercise-filter'} type="button" onClick={() => setActiveLane('all')}>
                All
              </button>
              {laneDefs.map((lane) => (
                <button
                  key={lane.key}
                  className={activeLane === lane.key ? 'exercise-filter active' : 'exercise-filter'}
                  type="button"
                  onClick={() => setActiveLane(lane.key)}
                >
                  {lane.label}
                </button>
              ))}
            </div>

            {laneDefs.map((lane) => (
              <section key={lane.key} className="exercise-lane">
                <header>
                  <h3>{lane.label}</h3>
                  <span>{groupedItems[lane.key].length}</span>
                </header>

                {groupedItems[lane.key].length === 0 ? <p className="exercise-empty">No exercises in this lane.</p> : null}

                {groupedItems[lane.key].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={selectedItem?.id === item.id ? 'exercise-item active' : 'exercise-item'}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="exercise-item-top">
                      <h4>{item.title}</h4>
                      <span className={`exercise-priority ${item.priority.toLowerCase()}`}>{item.priority} priority</span>
                    </div>
                    <p>{item.detail}</p>
                    <div className="exercise-item-meta">
                      <span>{item.due}</span>
                      <span>{item.comments} notes</span>
                      <span>{item.updates} updates</span>
                    </div>
                  </button>
                ))}
              </section>
            ))}
          </div>

          <div className="exercises-detail-pane">
            {selectedItem ? (
              <>
                <div className="exercise-detail-actions">
                  <button type="button" className="ghost-btn">Share</button>
                  <button type="button" className="ghost-btn">Expand</button>
                  <button type="button" className="ghost-btn" onClick={() => onNavigate('/dashboard')}>Close</button>
                </div>

                <small className="exercise-detail-eyebrow">{SERVICE_LABEL.toUpperCase()} · {selectedItem.skill}</small>
                <h2>{selectedItem.title}</h2>

                <div className="exercise-detail-badges">
                  <span className={`exercise-priority ${selectedItem.priority.toLowerCase()}`}>{selectedItem.priority} priority</span>
                  <span className="exercise-chip">{selectedItem.due}</span>
                </div>

                <div className="exercise-timebox">
                  <span>Focused exercise block</span>
                  <strong>45:00</strong>
                </div>

                <p className="exercise-detail-copy">{selectedItem.detail}</p>

                <div className="exercise-subsection">
                  <h3>Execution checklist</h3>
                  <ul>
                    <li>Complete the task prompt without switching services.</li>
                    <li>Write one short reflection before submitting.</li>
                    <li>Push weak words or patterns into connected services.</li>
                  </ul>
                </div>

                <div className="exercise-subsection">
                  <h3>Comments</h3>
                  <div className="exercise-comment">
                    <strong>Coach</strong>
                    <p>Prioritize clarity first, then improve speed in the second attempt.</p>
                  </div>
                  <div className="exercise-comment">
                    <strong>You</strong>
                    <p>I will repeat this with a shorter time limit after one full run.</p>
                  </div>
                </div>

                <div className="exercise-detail-footer">
                  <button
                    className="primary-cta"
                    type="button"
                    onClick={() => {
                      if (!hasAccess) {
                        window.location.assign(pricingHref);
                      }
                    }}
                  >
                    {hasAccess ? 'Start exercise' : 'Unlock exercise access'}
                  </button>
                  <button className="ghost-btn" type="button" onClick={() => onNavigate('/dashboard')}>
                    Back to dashboard
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
};

const SignedOutLanding = ({
  serviceLabel,
  signInHref,
  pricingHref,
  platformWorkspaceHref,
  isSignedIn,
  onContinue,
}: {
  serviceLabel: string;
  signInHref: string;
  pricingHref: string;
  platformWorkspaceHref: string;
  isSignedIn: boolean;
  onContinue: () => void;
}) => {
  const focusTitle = serviceLabel.replace(/^English\s+/i, '');
  const focusLower = focusTitle.toLowerCase();

  return (
    <div className="service-landing">
      <section className="landing-hero">
        <div className="landing-mosaic">
          <article className="landing-card landing-stat tilt-left">
            <div className="landing-stat-head">
              <strong>174+</strong>
              <span className="landing-arrow">{'->'}</span>
            </div>
            <p>{focusTitle} programs</p>
            <small>new practice packs every week</small>
          </article>

          <article className="landing-card landing-team tilt-right">
            <span className="landing-pill">4.8 review</span>
            <h3>Mentor team</h3>
            <p>Human mentors and AI scoring work together so your {focusLower} progress stays accurate and actionable.</p>
          </article>

          <article className="landing-card landing-offer tilt-right">
            <h3>Secrets of {focusLower}</h3>
            <p className="landing-price">
              12$ <span>35$</span>
            </p>
            <div className="landing-ticket">
              <div className="landing-ticket-row">
                <small>24 Jul</small>
                <small>28 Jul</small>
              </div>
              <strong>18:00</strong>
              <small>35h 20m</small>
            </div>
          </article>

          <article className="landing-card landing-showcase tilt-left">
            <div className="landing-orb" aria-hidden />
            <h3>{focusTitle} studio</h3>
            <p>Structured drills, diagnostics, and feedback loops connected to your English learner profile.</p>
          </article>
        </div>

        <article className="landing-copy card">
          <div className="landing-chip">{serviceLabel}</div>
          <h2>Interactive online {focusLower} education that keeps progress connected.</h2>
          <p>
            Train in one focused service while your outcomes feed a shared English profile across reading, listening,
            writing, speaking, grammar, vocabulary, and immersion.
          </p>
          <div className="landing-cta-row">
            {isSignedIn ? (
              <button className="primary-cta" type="button" onClick={onContinue}>Continue</button>
            ) : (
              <a className="primary-cta" href={signInHref}>Get started</a>
            )}
            <a className="ghost-btn" href={pricingHref}>See pricing</a>
            <a className="ghost-btn" href={platformWorkspaceHref}>Open platform</a>
          </div>
        </article>
      </section>

      <section className="landing-proof-grid">
        <article className="landing-proof card tilt-left">
          <small>Learner footprint</small>
          <strong>12k+</strong>
          <p>Students completed at least one full-cycle {focusLower} pathway this year.</p>
        </article>
        <article className="landing-proof card tilt-right">
          <small>Practice volume</small>
          <strong>34k</strong>
          <p>Total {focusLower} training hours logged by active users on the platform.</p>
        </article>
      </section>
    </div>
  );
};
const App = () => {
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [session, setSession] = useState<Session | null>(null);
  const [search, setSearch] = useState('');
  const [profileNameFromDb, setProfileNameFromDb] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('idle');
  const [accessEndsAt, setAccessEndsAt] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [path, setPath] = useState<AppPath>(() => {
    if (typeof window === 'undefined') return '/';
    return resolveAppPath(window.location.pathname);
  });
  const showLanding = path === '/';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (showLanding || status === 'signed_out') {
      setMobileNavOpen(false);
    }
  }, [showLanding, status]);

  const navigate = (nextPath: AppPath, replace = false): void => {
    if (typeof window === 'undefined') return;
    setMobileNavOpen(false);
    if (window.location.pathname !== nextPath) {
      if (replace) {
        window.history.replaceState({}, '', nextPath);
      } else {
        window.history.pushState({}, '', nextPath);
      }
    }
    setPath(nextPath);
  };

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
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      setPath(resolveAppPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (status === 'signed_out' && path !== '/') {
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.history.replaceState({}, '', '/');
      }
      setPath('/');
    }
  }, [path, status]);

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
            (entry) => entry.resource_type === 'product' && entry.resource_id === WRITING_PRODUCT_ID,
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
  const profileEmail = session?.user.email ?? null;
  const avatarLabel = useMemo(() => resolveInitials(profileName, profileEmail), [profileName, profileEmail]);
  const accessEndsLabel = useMemo(() => {
    if (!accessEndsAt) return null;
    const date = new Date(accessEndsAt);
    if (Number.isNaN(date.getTime())) return accessEndsAt;
    return date.toLocaleString();
  }, [accessEndsAt]);

  const visibleLessons = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return lessonRows;
    return lessonRows.filter((lesson) => lesson.title.toLowerCase().includes(normalized));
  }, [search]);

  
  void profileName;
  void profileEmail;
  void avatarLabel;
  void accessEndsLabel;

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
  };

  
  if (showLanding) {
    return (
      <div className="landing-page-root">
        <div className="ambient-layer" />
        <div className="landing-page-main">
          <header className="landing-page-topbar card">
            <button
              type="button"
              className="landing-brand"
              onClick={() => navigate('/')}
            >
              <span className="dot" />
              <strong>{SERVICE_LABEL}</strong>
            </button>
            <nav className="landing-links">
              <a href={buildPlatformUrl('/about')}>About us</a>
              <a href={buildPlatformUrl('/programs')}>Programs</a>
              <a href={buildPlatformUrl('/blog')}>Blog</a>
              <a href={buildPlatformUrl('/courses')}>Courses</a>
              <a href={buildPlatformUrl('/faq')}>FAQ</a>
              <a href={buildPlatformUrl('/contact')}>Contact</a>
            </nav>
            <div className="landing-actions">
              <a className="ghost-btn" href={ENGLISH_HUB_URL}>English hub</a>
              <a className="ghost-btn" href={platformWorkspaceHref}>Open platform</a>
              {status === 'signed_in' ? (
                <button className="icon-btn" type="button" onClick={() => navigate('/dashboard')}>Dashboard</button>
              ) : (
                <a className="icon-btn" href={signInHref}>Log in</a>
              )}
              <a className="primary-cta" href={pricingHref}>Sign up</a>
            </div>
          </header>

          <SignedOutLanding
            serviceLabel={SERVICE_LABEL}
            signInHref={signInHref}
            pricingHref={pricingHref}
            platformWorkspaceHref={platformWorkspaceHref}
            isSignedIn={status === 'signed_in'}
            onContinue={() => navigate('/dashboard')}
          />
        </div>
        <a className="updates-fab" href={buildPlatformUrl('/updates')}>
          Updates
        </a>
      </div>
    );
  }
  return (
    <div className="reading-root">
      <div className="ambient-layer" />
      {mobileNavOpen ? (
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <div className={`app-shell ${status === 'signed_out' ? 'signed-out' : ''} ${showLanding ? 'landing' : ''}`.trim()}>
        <aside id="service-side-nav" className={`left-nav ${mobileNavOpen ? 'open' : ''}`.trim()}>
          <button
            type="button"
            className="brand-mark"
            onClick={() => {
              navigate('/dashboard');
            }}
            style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
          >
            <span className="dot" />
            <div>
              <strong>ENGLISH WRITING</strong>
              <small>Unified auth + payment</small>
            </div>
          </button>

          <nav className="menu-list">
            <button
              className={'menu-link ' + (path === '/dashboard' ? 'active' : '')}
              type="button"
              onClick={() => {
                navigate('/dashboard');
              }}
            >
              Dashboard
            </button>            <button
              className={'menu-link ' + (path === EXERCISES_PATH ? 'active' : '')}
              type="button"
              onClick={() => {
                navigate(EXERCISES_PATH);
              }}
            >
              Exercises
            </button>          </nav>

          
          <section className="service-switcher">
            <div className="service-switch-head">
              <span>Switch service</span>
              <a className="muted-link" href={ENGLISH_HUB_URL}>Hub</a>
            </div>
            <div className="service-switch-grid">
              {SERVICE_SWITCH_LINKS.map((service) => (
                <a key={service.key} className="service-switch-link" href={service.href}>
                  {service.label}
                </a>
              ))}
            </div>
          </section>

          <div className="left-footer">
            <div className="support-zone">
              <a className="menu-link muted-link" href={buildPlatformUrl('/contact')}>Support</a>
              <a className="menu-link muted-link" href={pricingHref}>Pricing and trial</a>
            </div>

            <article className="upgrade-card">
              <h3>Premium Writing Pack</h3>
              <p>Unlock full mock banks, detailed answer analytics, and teacher-reviewed dictation feedback.</p>
              <a className="black-btn" href={pricingHref}>View plans</a>
            </article>
          </div>
        </aside>

        <main className="main-column">
          {!showLanding ? (
          <header className="topbar">
            <div className="topbar-title">
              <h1>Welcome back, learner</h1>
              <p>{`${SERVICE_LABEL} service - exam-focused daily workflow.`}</p>
            </div>

            <div className="topbar-actions">
              <button
                type="button"
                className="mobile-nav-toggle"
                aria-expanded={mobileNavOpen}
                aria-controls="service-side-nav"
                onClick={() => setMobileNavOpen((prev) => !prev)}
              >
                {mobileNavOpen ? 'Close menu' : 'Menu'}
              </button>
              <label className="search-box">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search classes, sets, tasks..."
                />
              </label>
              <a className="icon-btn" href={platformWorkspaceHref}>Platform</a>
              <a className="icon-btn" href={ENGLISH_HUB_URL}>English hub</a>
              {needsAccess ? <a className="icon-btn" href={pricingHref}>Get access</a> : null}
              {status === 'signed_in' ? (
                <button className="icon-btn" type="button" onClick={handleSignOut}>Sign out</button>
              ) : (
                <a className="icon-btn" href={signInHref}>Sign in</a>
              )}
            </div>
          </header>
          ) : null}

          {showLanding ? (
            <SignedOutLanding
              serviceLabel={SERVICE_LABEL}
              signInHref={signInHref}
              pricingHref={pricingHref}
              platformWorkspaceHref={platformWorkspaceHref}
              isSignedIn={status === 'signed_in'}
              onContinue={() => navigate('/dashboard')}
            />
          ) : null}
          {!showLanding && status !== 'signed_out' && checkingAccess ? (
            <div className="access-banner">
              <strong>Checking access...</strong>
              <span>Verifying your active plan for English Writing.</span>
            </div>
          ) : null}
          {!showLanding && status !== 'signed_out' && needsAccess ? (
            <div className="access-banner warning">
              <strong>Plan required for full access.</strong>
              <span>Choose a trial or paid plan to unlock this service.</span>
              <a className="ghost-btn" href={pricingHref}>Pricing and trial</a>
            </div>
          ) : null}
          {!showLanding && status !== 'signed_out' && accessError ? <div className="access-banner warning">{accessError}</div> : null}

          {!showLanding && status !== 'signed_out' && path === '/dashboard' && (
            <DashboardPage
              lessons={visibleLessons}
              hasAccess={hasAccess}
              pricingHref={pricingHref}
              onOpenExercise={() => {
                navigate(EXERCISES_PATH);
              }}
            />
          )}
          {!showLanding && status !== 'signed_out' && path === EXERCISES_PATH && (
            <ExercisesPage
              hasAccess={hasAccess}
              pricingHref={pricingHref}
              onNavigate={navigate}
            />
          )}
        </main>
      </div>
      <a className="updates-fab" href={buildPlatformUrl('/updates')}>
        Updates
      </a>
    </div>
  );
};

export default App;

















