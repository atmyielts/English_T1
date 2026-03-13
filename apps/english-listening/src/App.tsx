import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { platformUrl, supabase } from './lib/supabase';
import { getMe } from './lib/platformClient';
import { ArenaList, type Article } from './ArenaList';
import { ArenaReader } from './ArenaReader';
import { captureNotebookWords } from './lib/vocabularyNotebookClient';

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

type ServiceWordSeed = {
  word: string;
  definition: string;
  example: string;
  context: string;
};

const LISTENING_PRODUCT_ID = ((import.meta.env.VITE_LISTENING_PRODUCT_ID as string | undefined) ?? '').trim() || 'f9c4a14b-d5a2-4a66-9cd8-5b3a0d6e7bf1';
const LISTENING_PRODUCT_SLUG = 'english-listening';
const SERVICE_LABEL = 'English Listening';

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

const LISTENING_VOCAB_SEEDS: ServiceWordSeed[] = [
  {
    word: 'intonation',
    definition: 'The rise and fall of voice pitch in spoken language.',
    example: 'Her intonation signaled uncertainty in the final phrase.',
    context: 'Listening to speaker attitude and meaning shifts.',
  },
  {
    word: 'transcript',
    definition: 'A written version of spoken audio.',
    example: 'He checked the transcript after completing the task.',
    context: 'Post-listening review workflow.',
  },
  {
    word: 'distinguish',
    definition: 'To recognize the difference between similar sounds or ideas.',
    example: 'You must distinguish fact from opinion in the lecture.',
    context: 'Detail and distractor detection.',
  },
  {
    word: 'retention',
    definition: 'The ability to keep information in memory.',
    example: 'Short note blocks improved retention across sections.',
    context: 'Note-taking and memory recovery.',
  },
  {
    word: 'cue',
    definition: 'A signal that helps predict or identify upcoming information.',
    example: 'Transition words gave a cue before the main argument.',
    context: 'Audio structure tracking.',
  },
  {
    word: 'clarify',
    definition: 'To make something easier to understand.',
    example: 'The speaker clarified the timeline with dates.',
    context: 'Understanding reformulation in speech.',
  },
  {
    word: 'accent',
    definition: 'A characteristic way of pronouncing a language.',
    example: 'Repeated practice helped her adapt to the new accent.',
    context: 'Multi-accent listening drills.',
  },
  {
    word: 'paraphrase',
    definition: 'To express the same meaning using different words.',
    example: 'The answer used a paraphrase, not the exact wording.',
    context: 'Matching spoken content to questions.',
  },
  {
    word: 'synthesis',
    definition: 'Combining separate points into one complete understanding.',
    example: 'The final question required synthesis of two viewpoints.',
    context: 'Long-form lecture comprehension.',
  },
  {
    word: 'precision',
    definition: 'Accuracy and exactness in interpretation or response.',
    example: 'Precision in note keywords reduced answer errors.',
    context: 'Time-limited listening response quality.',
  },
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
  isSignedIn,
  signInHref,
  syncingWords,
  syncMessage,
  syncError,
  onSyncWords,
}: {
  lessons: LessonRow[];
  hasAccess: boolean;
  pricingHref: string;
  isSignedIn: boolean;
  signInHref: string;
  syncingWords: boolean;
  syncMessage: string | null;
  syncError: string | null;
  onSyncWords: () => void;
}) => (
  <div className="dashboard-stack">
    <section className="hero-card card">
      <div className="hero-copy">
        <div className="eyebrow">English Listening Studio</div>
        <h1>Build real exam listening confidence, one focused session at a time.</h1>
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
          {hasAccess ? 'Start 15-min warmup' : 'Unlock listening access'}
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
        <span>Total listening sets</span>
        <strong>48</strong>
        <small>+6 this month</small>
      </article>
      <article className="card kpi">
        <span>Hours practiced</span>
        <strong>36.4 h</strong>
        <small>consistency score: 88</small>
      </article>
      <article className="card kpi">
        <span>Estimated band (Listening)</span>
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

    <section className="card vocab-sync-card">
      <div className="section-head">
        <h2>Vocabulary Sync</h2>
        <button
          className="ghost-btn"
          type="button"
          disabled={syncingWords}
          onClick={() => {
            if (!isSignedIn) {
              window.location.assign(signInHref);
              return;
            }
            onSyncWords();
          }}
        >
          {isSignedIn ? (syncingWords ? 'Syncing...' : 'Send 10 words') : 'Sign in to sync'}
        </button>
      </div>
      <p className="vocab-sync-copy">
        Save key listening words to the shared English Vocabulary notebook for daily Leitner review.
      </p>
      <small className="vocab-sync-copy">
        Words are deduplicated by language scope, so repeated syncs will not create duplicates.
      </small>
      {syncError ? (
        <div className="access-banner warning">
          <strong>Sync failed.</strong>
          <span>{syncError}</span>
        </div>
      ) : null}
      {syncMessage ? (
        <div className="access-banner">
          <strong>{syncMessage}</strong>
          <a className="ghost-btn" href="https://vocabulary.english.schood.online/dashboard">Open vocabulary notebook</a>
        </div>
      ) : null}
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
  const [syncingWords, setSyncingWords] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [view, setView] = useState<ViewState>('dashboard');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [path, setPath] = useState<'/' | '/dashboard'>(() => {
    if (typeof window === 'undefined') return '/';
    return window.location.pathname === '/dashboard' ? '/dashboard' : '/';
  });
  const showLanding = path !== '/dashboard';

  const navigate = (nextPath: '/' | '/dashboard', replace = false): void => {
    if (typeof window === 'undefined') return;
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
      setPath(window.location.pathname === '/dashboard' ? '/dashboard' : '/');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (status === 'signed_out' && path === '/dashboard') {
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
            (entry) => entry.resource_type === 'product' && entry.resource_id === LISTENING_PRODUCT_ID,
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
    () => `${buildPlatformUrl(`/pricing?product=${LISTENING_PRODUCT_SLUG}`)}&returnTo=${encodeURIComponent(returnTo)}`,
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

  const handleSyncWords = async (): Promise<void> => {
    if (!session?.access_token) {
      window.location.assign(signInHref);
      return;
    }

    setSyncingWords(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      const payload = LISTENING_VOCAB_SEEDS.map((seed, index) => ({
        word: seed.word,
        definition: seed.definition,
        example: seed.example,
        context_text: seed.context,
        source_type: 'english-listening.sync',
        source_product_id: LISTENING_PRODUCT_ID,
        source_label: 'Listening sync',
        metadata: {
          pipeline: 'listening_dashboard_sync',
          rank: index + 1,
        },
      }));

      const result = await captureNotebookWords(session.access_token, payload);
      const savedCount = Number(result.saved ?? payload.length);
      setSyncMessage(`${savedCount} listening words synced to your vocabulary notebook.`);
    } catch (error) {
      const statusCode = (error as { status?: number } | null)?.status ?? null;
      if (statusCode === 401 || statusCode === 403) {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // ignore sign-out failures
        }
        return;
      }
      setSyncError('Could not sync listening words right now. Please try again.');
    } finally {
      setSyncingWords(false);
    }
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
      <div className={`app-shell ${status === 'signed_out' ? 'signed-out' : ''} ${showLanding ? 'landing' : ''}`.trim()}>
        <aside className="left-nav">
          <button
            type="button"
            className="brand-mark"
            onClick={() => {
              setView('dashboard');
              navigate('/dashboard');
            }}
            style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
          >
            <span className="dot" />
            <div>
              <strong>ENGLISH LISTENING</strong>
              <small>Unified auth + payment</small>
            </div>
          </button>

          <nav className="menu-list">
            <button
              className={`menu-link ${view === 'dashboard' ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setView('dashboard');
                navigate('/dashboard');
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
                setView('arena-list');
                navigate('/dashboard');
              }}
            >
              Listening Arena
            </button>
          </nav>

          
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
              <h3>Premium Listening Pack</h3>
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
              <span>Verifying your active plan for English Listening.</span>
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
            <DashboardPage
              lessons={visibleLessons}
              hasAccess={hasAccess}
              pricingHref={pricingHref}
              isSignedIn={status === 'signed_in'}
              signInHref={signInHref}
              syncingWords={syncingWords}
              syncMessage={syncMessage}
              syncError={syncError}
              onSyncWords={() => {
                void handleSyncWords();
              }}
            />
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
      </div>
      <a className="updates-fab" href={buildPlatformUrl('/updates')}>
        Updates
      </a>
    </div>
  );
};

export default App;








