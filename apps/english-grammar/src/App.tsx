import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { platformUrl, supabase } from './lib/supabase';
import { getMe } from './lib/platformClient';
import { ArenaList, type Article } from './ArenaList';
import { ArenaReader } from './ArenaReader';

type SessionStatus = 'checking' | 'signed_in' | 'signed_out';
type AccessStatus = 'checking' | 'granted' | 'denied' | 'idle';
type ViewState = 'dashboard' | 'arena-list' | 'arena-reader';

type LessonRow = {
  id: string;
  title: string;
  level: string;
  schedule: string;
  progress: number;
  status: 'In progress' | 'Not started' | 'Completed';
  accent: string;
};

type TaskRow = {
  id: string;
  title: string;
  due: string;
  priority: 'Low' | 'Medium' | 'High';
};

const GRAMMAR_PRODUCT_ID = ((import.meta.env.VITE_GRAMMAR_PRODUCT_ID as string | undefined) ?? '').trim() || '6c4f0566-6f50-4fb4-b176-c4397ecb8ec5';
const GRAMMAR_PRODUCT_SLUG = 'english-grammar';
const SERVICE_LABEL = 'English Grammar';

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

const taskRows: TaskRow[] = [
  { id: 'task-1', title: 'Complete Section 2 dictation challenge', due: 'Today 17:30', priority: 'High' },
  { id: 'task-2', title: 'Upload shadowing audio for tutor review', due: 'Tomorrow 10:00', priority: 'Medium' },
  { id: 'task-3', title: 'Review 20 new collocations from practice set', due: 'Tomorrow 20:00', priority: 'Low' },
];

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

const DashboardPage = ({
  lessons,
  hasAccess,
  pricingHref,
}: {
  lessons: LessonRow[];
  hasAccess: boolean;
  pricingHref: string;
}) => (
  <div className="dashboard-stack">
    <section className="hero-card card">
      <div className="hero-copy">
        <div className="eyebrow">English Grammar Studio</div>
        <h1>Build real exam grammar confidence, one focused session at a time.</h1>
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
          {hasAccess ? 'Start 15-min warmup' : 'Unlock grammar access'}
        </button>
        {!hasAccess ? <small className="hero-note">Your account is signed in, but this service needs an active plan or trial.</small> : null}
      </div>
      <div className="hero-art" aria-hidden>
        <div className="wave one" />
        <div className="wave two" />
        <div className="wave three" />
      </div>
    </section>

    <section className="kpi-grid">
      <article className="card kpi">
        <span>Total grammar sets</span>
        <strong>48</strong>
        <small>+6 this month</small>
      </article>
      <article className="card kpi">
        <span>Hours practiced</span>
        <strong>36.4 h</strong>
        <small>consistency score: 88</small>
      </article>
      <article className="card kpi">
        <span>Estimated level (Grammar)</span>
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
  </div>
);



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

  const [view, setView] = useState<ViewState>('dashboard');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [showLanding, setShowLanding] = useState(true);

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
    if (status !== 'signed_in') {
      setShowLanding(true);
    }
  }, [status]);

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
            (entry) => entry.resource_type === 'product' && entry.resource_id === GRAMMAR_PRODUCT_ID,
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
    () => `${buildPlatformUrl(`/pricing?product=${GRAMMAR_PRODUCT_SLUG}`)}&returnTo=${encodeURIComponent(returnTo)}`,
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

  const maxMinutes = useMemo(
    () => weeklyMinutes.reduce((acc, item) => Math.max(acc, item.minutes), 1),
    [],
  );

  const handleSignOut = async () => {
    setShowLanding(true);
    await supabase.auth.signOut({ scope: 'local' });
  };

  return (
    <div className="reading-root">
      <div className="ambient-layer" />
      <div className={`app-shell ${status === 'signed_out' ? 'signed-out' : ''} ${showLanding ? 'landing' : ''}`.trim()}>
        <aside className="left-nav">
          <button
            type="button"
            className="brand-mark"
            onClick={() => {
              setView('dashboard');
              setShowLanding(true);
            }}
            style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
          >
            <span className="dot" />
            <div>
              <strong>ENGLISH GRAMMAR</strong>
              <small>Unified auth + payment</small>
            </div>
          </button>

          <nav className="menu-list">
            <button
              className={`menu-link ${view === 'dashboard' ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setView('dashboard');
                setShowLanding(status !== 'signed_in');
              }}
            >
              Dashboard
            </button>
            <button
              className={`menu-link ${view === 'arena-list' || view === 'arena-reader' ? 'active' : ''}`}
              type="button"
              onClick={() => {
                if (status !== 'signed_in') {
                  window.location.assign(signInHref);
                  return;
                }
                setShowLanding(false);
                setView('arena-list');
              }}
            >
              Grammar Arena
            </button>
          </nav>

          <div className="left-footer">
            <div className="support-zone">
              <a className="menu-link muted-link" href={buildPlatformUrl('/contact')}>Support</a>
              <a className="menu-link muted-link" href={pricingHref}>Pricing and trial</a>
            </div>

            <article className="upgrade-card">
              <h3>Premium Grammar Pack</h3>
              <p>Unlock full mock banks, detailed answer analytics, and teacher-reviewed dictation feedback.</p>
              <a className="black-btn" href={pricingHref}>View plans</a>
            </article>
          </div>
        </aside>

        <main className="main-column">
          <header className="topbar">
            <div className="topbar-title">
              <h1>{showLanding ? `${SERVICE_LABEL} hub` : 'Welcome back, learner'}</h1>
              <p>{showLanding ? 'Shared profile, adaptive practice, and one entry point for your English journey.' : `${SERVICE_LABEL} service - exam-focused daily workflow.`}</p>
            </div>

            <div className="topbar-actions">
              <label className="search-box">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search classes, sets, tasks..."
                />
              </label>
              <a className="icon-btn" href={platformWorkspaceHref}>Platform</a>
              {needsAccess ? <a className="icon-btn" href={pricingHref}>Get access</a> : null}
              {status === 'signed_in' ? (
                <button className="icon-btn" type="button" onClick={handleSignOut}>Sign out</button>
              ) : (
                <a className="icon-btn" href={signInHref}>Sign in</a>
              )}
            </div>
          </header>

          {showLanding ? (
            <SignedOutLanding
              serviceLabel={SERVICE_LABEL}
              signInHref={signInHref}
              pricingHref={pricingHref}
              platformWorkspaceHref={platformWorkspaceHref}
              isSignedIn={status === 'signed_in'}
              onContinue={() => setShowLanding(false)}
            />
          ) : null}
          {!showLanding && status !== 'signed_out' && checkingAccess ? (
            <div className="access-banner">
              <strong>Checking access...</strong>
              <span>Verifying your active plan for English Grammar.</span>
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

          {!showLanding && status !== 'signed_out' && view === 'dashboard' && (
            <DashboardPage lessons={visibleLessons} hasAccess={hasAccess} pricingHref={pricingHref} />
          )}

          {!showLanding && status !== 'signed_out' && view === 'arena-list' && (
            <ArenaList
              onSelect={(article: Article) => {
                setSelectedArticle(article);
                setView('arena-reader');
              }}
            />
          )}

          {!showLanding && status !== 'signed_out' && view === 'arena-reader' && selectedArticle && (
            <ArenaReader
              article={selectedArticle}
              onBack={() => setView('arena-list')}
            />
          )}
        </main>

        <aside className="right-panel">
          {view === 'arena-reader' ? (
            <div id="arena-sidebar-portal" />
          ) : (
            <>
              <article className="profile-card card">
                <h2>My profile</h2>
                <div className="avatar">{avatarLabel}</div>
                <strong>{profileName ?? profileEmail ?? 'Guest learner'}</strong>
                {profileName && profileEmail ? <p className="profile-email">{profileEmail}</p> : null}
                <small>
                  {status === 'signed_in'
                    ? hasAccess
                      ? accessEndsLabel
                        ? `Access active until ${accessEndsLabel}`
                        : 'Access active via unified platform'
                      : checkingAccess
                        ? 'Checking your plan access...'
                        : 'Signed in - plan required for full access'
                    : status === 'checking'
                      ? 'Checking session...'
                      : 'Preview mode'}
                </small>
                <a className="ghost-btn" href={pricingHref}>{hasAccess ? 'Manage plan' : 'Pricing and trial'}</a>
              </article>

              <article className="card activity-card">
                <div className="section-head">
                  <h2>Activity</h2>
                  <small>Weekly minutes</small>
                </div>
                <div className="bars">
                  {weeklyMinutes.map((item) => (
                    <div className="bar-col" key={item.day}>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ height: `${Math.max(12, Math.round((item.minutes / maxMinutes) * 100))}%` }} />
                      </div>
                      <span>{item.day}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="card task-list-card">
                <div className="section-head">
                  <h2>List task</h2>
                  <small>{taskRows.length} open</small>
                </div>
                <ul>
                  {taskRows.map((task) => (
                    <li key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <small>{task.due}</small>
                      </div>
                      <span className={`priority-dot ${task.priority.toLowerCase()}`} />
                    </li>
                  ))}
                </ul>
              </article>
            </>
          )}
        </aside>
      </div>
      <a className="updates-fab" href={buildPlatformUrl('/updates')}>
        Updates
      </a>
    </div>
  );
};

export default App;




