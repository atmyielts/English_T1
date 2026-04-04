import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { platformUrl, supabase } from './lib/supabase';
import { getMe } from './lib/platformClient';
import { captureNotebookWords } from './lib/vocabularyNotebookClient';

type SessionStatus = 'checking' | 'signed_in' | 'signed_out';
type AccessStatus = 'checking' | 'granted' | 'denied' | 'idle';
const EXERCISE_PATHS = ['/exercise/1', '/exercise/2', '/exercise/3', '/exercise/4'] as const;
type ExercisePath = (typeof EXERCISE_PATHS)[number];
type AppPath = '/' | '/dashboard' | ExercisePath;

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

const SERVICE_BLUEPRINT = [
  {
    title: 'Sentence-based listening',
    detail: 'Train with short clips you can replay quickly for precision listening.',
    intent: 'sentence-loop',
    skill: 'comprehension',
  },
  {
    title: 'Dictation mode',
    detail: 'Type what you hear and compare your draft against the target transcript.',
    intent: 'dictation',
    skill: 'accuracy',
  },
  {
    title: 'Slow mode + looping',
    detail: 'Control playback speed and loop difficult fragments until stable.',
    intent: 'slow-loop',
    skill: 'timing',
  },
  {
    title: 'Missed words feedback',
    detail: 'Track uncaught words and push them to shared vocabulary review.',
    intent: 'missed-words',
    skill: 'vocabulary',
  },
] as const;

const SERVICE_HANDOFFS = [
  { key: 'vocabulary', label: 'Push missed words to Vocabulary', intent: 'word-sources', skill: 'retention', reason: 'listening-handoff' },
  { key: 'speaking', label: 'Apply rhythm in Speaking', intent: 'shadowing', skill: 'fluency', reason: 'listening-handoff' },
  { key: 'immersion', label: 'Use audio context in Immersion', intent: 'scenario-task', skill: 'communication', reason: 'listening-handoff' },
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
  if (EXERCISE_PATHS.includes(normalized as ExercisePath)) return normalized as ExercisePath;
  if (normalized.startsWith('/feature/')) return '/dashboard';
  return '/';
};

const DashboardPage = ({
  lessons,
  hasAccess,
  pricingHref,
  onOpenExercise,
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
  onOpenExercise: (index: number) => void;
  isSignedIn: boolean;
  signInHref: string;
  syncingWords: boolean;
  syncMessage: string | null;
  syncError: string | null;
  onSyncWords: () => void;
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

    {hasInboundFocus ? (
      <section className="card connected-brief">
        <div>
          <h2>Focus routed from Schood English</h2>
          <p>
            Continue with intent <strong>{inboundIntent || 'sentence-loop'}</strong> on skill{' '}
            <strong>{inboundSkill || 'comprehension'}</strong>.
          </p>
          {inboundReason ? <small>Reason: {inboundReason.replace(/[-_]+/g, ' ')}</small> : null}
          {inboundSourceService ? <small>Triggered by: {inboundSourceService}</small> : null}
        </div>
        <a
          className="ghost-btn"
          href={buildServiceDashboardHref(CURRENT_SERVICE_KEY, inboundIntent || 'sentence-loop', inboundSkill || 'comprehension', 'continue-focus')}
        >
          Keep this focus
        </a>
      </section>
    ) : null}

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
};



const ExercisePage = ({
  exercisePath,
  hasAccess,
  pricingHref,
  onNavigate,
}: {
  exercisePath: ExercisePath;
  hasAccess: boolean;
  pricingHref: string;
  onNavigate: (nextPath: AppPath) => void;
}) => {
  const exerciseIndex = EXERCISE_PATHS.indexOf(exercisePath);
  const safeIndex = exerciseIndex >= 0 ? exerciseIndex : 0;
  const currentExercise = SERVICE_BLUEPRINT[safeIndex] ?? SERVICE_BLUEPRINT[0];
  const [response, setResponse] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const previousPath: ExercisePath = (EXERCISE_PATHS[Math.max(0, safeIndex - 1)] ?? EXERCISE_PATHS[0]) as ExercisePath;
  const nextPath: ExercisePath = (EXERCISE_PATHS[Math.min(EXERCISE_PATHS.length - 1, safeIndex + 1)] ?? EXERCISE_PATHS[EXERCISE_PATHS.length - 1]) as ExercisePath;

  return (
    <div className="dashboard-stack">
      <section className="hero-card card">
        <div className="hero-copy">
          <div className="eyebrow">{SERVICE_LABEL} Exercise {safeIndex + 1}</div>
          <h1>{currentExercise.title}</h1>
          <p>{currentExercise.detail}</p>
          <button
            className="primary-cta"
            type="button"
            onClick={() => {
              if (!hasAccess) {
                window.location.assign(pricingHref);
              }
            }}
          >
            {hasAccess ? 'Start timed exercise' : 'Unlock exercise access'}
          </button>
        </div>
        <div className="hero-art" aria-hidden>
          <div className="wave one" />
          <div className="wave two" />
          <div className="wave three" />
        </div>
      </section>

      <section className="card cross-service-playbook">
        <div className="section-head">
          <h2>Exercise windows</h2>
          <small>{'Exercise ' + (safeIndex + 1) + ' of ' + EXERCISE_PATHS.length}</small>
        </div>
        <div className="playbook-grid">
          <article className="playbook-card">
            <small>Window 1 - Prompt</small>
            <h3>Task brief</h3>
            <p>{currentExercise.detail}</p>
            <p>Complete this exercise with focus on <strong>{currentExercise.skill}</strong>.</p>
          </article>

          <article className="playbook-card">
            <small>Window 2 - Response</small>
            <h3>Work area</h3>
            <textarea
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              placeholder={'Write your response for ' + currentExercise.title.toLowerCase() + '...'}
              rows={7}
              style={{ width: '100%', borderRadius: 12, border: '1px solid var(--line)', padding: 12, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </article>

          <article className="playbook-card">
            <small>Window 3 - Review</small>
            <h3>Self-check</h3>
            <textarea
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              placeholder="Write what you need to improve before the next attempt..."
              rows={7}
              style={{ width: '100%', borderRadius: 12, border: '1px solid var(--line)', padding: 12, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </article>
        </div>

        <div className="handoff-row">
          <button className="menu-link" type="button" onClick={() => onNavigate('/dashboard')}>Back to dashboard</button>
          <button className="menu-link" type="button" onClick={() => onNavigate(previousPath)} disabled={safeIndex === 0}>Previous exercise</button>
          <button className="menu-link" type="button" onClick={() => onNavigate(nextPath)} disabled={safeIndex === EXERCISE_PATHS.length - 1}>Next exercise</button>
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
  const [syncingWords, setSyncingWords] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [path, setPath] = useState<AppPath>(() => {
    if (typeof window === 'undefined') return '/';
    return resolveAppPath(window.location.pathname);
  });
  const showLanding = path === '/';
  const activeExercisePath = EXERCISE_PATHS.includes(path as ExercisePath) ? (path as ExercisePath) : null;

  const navigate = (nextPath: AppPath, replace = false): void => {
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
              className={'menu-link ' + (path === '/dashboard' ? 'active' : '')}
              type="button"
              onClick={() => {
                navigate('/dashboard');
              }}
            >
              Dashboard
            </button>
            {EXERCISE_PATHS.map((exercisePath, index) => (
              <button
                key={exercisePath}
                className={'menu-link ' + (path === exercisePath ? 'active' : '')}
                type="button"
                onClick={() => {
                  navigate(exercisePath);
                }}
              >
                {'Exercise ' + (index + 1)}
              </button>
            ))}
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

          {!showLanding && status !== 'signed_out' && path === '/dashboard' && (
            <DashboardPage
              lessons={visibleLessons}
              hasAccess={hasAccess}
              pricingHref={pricingHref}
              onOpenExercise={(index) => {
                const targetPath = (EXERCISE_PATHS[index] ?? EXERCISE_PATHS[0]) as ExercisePath;
                navigate(targetPath);
              }}
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
          {!showLanding && status !== 'signed_out' && activeExercisePath && (
            <ExercisePage
              exercisePath={activeExercisePath}
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









